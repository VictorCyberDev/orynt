/**
 * NWC (NIP-47) wallet adapter implementing the same WalletProvider contract as the LND adapter.
 *
 * Status: implemented and CONTRACT-TESTED against a local fake relay + fake wallet service. It has NOT been run against a
 * real NWC wallet service; see README.md in this directory. Do not describe it as live or production-verified.
 */
import { inspect } from "node:util";
import { decodeInvoice, sha256Hex, hexToBytes } from "@orynt/core";
import type { Network } from "@orynt/core";
import {
  AlreadyExistsError,
  InsufficientPermissionsError,
  OutcomeUnknownError,
  type Capabilities,
  type PaymentRecord,
  type SendRequest,
  type WalletInfo,
  type WalletProvider,
} from "../types";
import { NwcClient, type NwcDiagnostic, type NwcInfo, type NwcResponse } from "./client";
import type { EncryptionScheme } from "./encryption";
import { NwcNetworkError, NwcNotSentError, NwcRelayUnavailableError, sanitizeRemoteText } from "./errors";
import { relayLabel } from "./relay";
import { parseNwcUri, type NwcConnection } from "./uri";

export interface NwcConfig {
  /** nostr+walletconnect:// URI. Contains the client secret: never log it; it is not retained by the provider after parsing. */
  uri: string;
  /**
   * The owner's assertion of which Bitcoin network the wallet is on. NWC wallets MAY omit `network` from get_info; when they do
   * and nothing is asserted, the adapter refuses (NwcNetworkError). If the wallet reports a network that differs from the
   * assertion, the adapter refuses.
   */
  network?: Network;
  /** Required for sending when the resolved network is mainnet. Default false. */
  allowMainnet?: boolean;
  /** Accept ws:// relays on loopback only (tests / local relay). Default false. */
  allowInsecureLoopbackRelays?: boolean;
  /** Use legacy NIP-04 when the wallet service does not support NIP-44 v2. Default true (spec-conformant fallback). */
  allowNip04?: boolean;
  /**
   * NIP-47 pay_invoice has no fee-limit parameter, so a per-payment fee limit CANNOT be enforced by the wallet.
   * "refuse" (default): sendPayment throws NotSentError. "accept_and_report": send anyway; the fee actually paid is returned and
   * a `fee_limit_exceeded` diagnostic is emitted if it exceeded the limit. Choose this only if the connection's own budget
   * at the wallet is the control you rely on.
   */
  unenforcedFeeLimit?: "refuse" | "accept_and_report";
  connectTimeoutMs?: number;
  infoTimeoutMs?: number;
  /** timeout for non-payment requests (get_info, lookup_invoice, get_budget) */
  readTimeoutMs?: number;
  /** extra time on top of SendRequest.timeoutSeconds before a pay_invoice with no response is declared UNKNOWN */
  payTimeoutMarginMs?: number;
  /** how long the info event / get_info result may be reused before a send refreshes them */
  infoCacheMs?: number;
  maxResponseSkewSeconds?: number;
  relayGraceMs?: number;
  /** Receives secret-free diagnostics (rejected responses, relay failures, relay OK acks). */
  onDiagnostic?: (d: NwcDiagnostic) => void;
  /** test seam */
  nowMs?: () => number;
}

export interface NwcBudget {
  usedMsat: bigint;
  totalMsat: bigint;
  remainingMsat: bigint;
  renewsAt: string | null;
  renewalPeriod: string;
}

interface WalletGetInfo {
  alias: string | null;
  pubkey: string | null;
  network: string | null;
  methods: string[] | null;
}

const NETWORKS: readonly Network[] = ["mainnet", "testnet", "signet", "regtest"];
const isNetwork = (v: unknown): v is Network =>
  typeof v === "string" && (NETWORKS as readonly string[]).includes(v);
const HEX64 = /^[0-9a-f]{64}$/;
/** Wallet messages that mean "a payment for this hash already exists" (free text; heuristic by necessity). */
const ALREADY_EXISTS =
  /already (paid|exists|in[- ]flight|pending|in progress)|duplicate payment|payment .*in transition/i;
const WALLET_REFUSALS = new Set([
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "INSUFFICIENT_BALANCE",
  "RESTRICTED",
  "UNAUTHORIZED",
  "NOT_IMPLEMENTED",
  "UNSUPPORTED_ENCRYPTION",
]);

function toMsat(v: unknown): bigint | undefined {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^[0-9]{1,18}$/.test(v)) return BigInt(v);
  return undefined;
}
const iso = (unixSeconds: number): string => new Date(unixSeconds * 1000).toISOString();

export class NwcProvider implements WalletProvider {
  readonly kind = "nwc" as const;
  readonly isReal = true;

  private readonly conn: NwcConnection;
  private readonly client: NwcClient;
  private readonly asserted: Network | undefined;
  private readonly allowMainnet: boolean;
  private readonly allowNip04: boolean;
  private readonly feePolicy: "refuse" | "accept_and_report";
  private readonly readTimeoutMs: number;
  private readonly payMarginMs: number;
  private readonly infoCacheMs: number;
  private readonly diag: (d: NwcDiagnostic) => void;
  private readonly nowMs: () => number;
  private infoCache: { at: number; info: NwcInfo | null } | null = null;
  private walletInfoCache: { at: number; value: WalletGetInfo | null } | null = null;
  private _closed = false;

  constructor(cfg: NwcConfig) {
    this.conn = parseNwcUri(cfg.uri, {
      allowInsecureLoopbackRelays: cfg.allowInsecureLoopbackRelays === true,
    });
    if (cfg.network !== undefined && !isNetwork(cfg.network)) {
      this.conn.secret.destroy();
      throw new NwcNetworkError(
        "configured network must be one of mainnet, testnet, signet, regtest",
        "unverified",
      );
    }
    this.asserted = cfg.network;
    this.allowMainnet = cfg.allowMainnet === true;
    this.allowNip04 = cfg.allowNip04 !== false;
    this.feePolicy = cfg.unenforcedFeeLimit ?? "refuse";
    this.readTimeoutMs = cfg.readTimeoutMs ?? 15_000;
    this.payMarginMs = cfg.payTimeoutMarginMs ?? 15_000;
    this.infoCacheMs = cfg.infoCacheMs ?? 30_000;
    this.diag = cfg.onDiagnostic ?? (() => undefined);
    this.nowMs = cfg.nowMs ?? (() => Date.now());
    this.client = new NwcClient({
      walletPubkey: this.conn.walletPubkey,
      clientPubkey: this.conn.clientPubkey,
      relays: this.conn.relays,
      secret: this.conn.secret,
      connectTimeoutMs: cfg.connectTimeoutMs ?? 10_000,
      infoTimeoutMs: cfg.infoTimeoutMs ?? 10_000,
      maxPayloadBytes: 256 * 1024,
      maxResponseSkewSeconds: cfg.maxResponseSkewSeconds ?? 300,
      relayGraceMs: cfg.relayGraceMs ?? 1_000,
      nowSeconds: () => Math.floor(this.nowMs() / 1000),
      onDiagnostic: this.diag,
    });
  }

  /** Identity the wallet service sees (derived from the secret; the secret itself is never exposed). */
  get clientPubkey(): string {
    return this.conn.clientPubkey;
  }
  get walletServicePubkey(): string {
    return this.conn.walletPubkey;
  }
  get relays(): readonly string[] {
    return this.conn.relays;
  }
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Local revocation: aborts in-flight requests (an unpublished one becomes NotSent, a published one UNKNOWN), closes sockets,
   * zero-fills the client secret and refuses all further use. This does NOT revoke the connection at the wallet service — the
   * secret stays valid there until the user revokes the connection in their wallet.
   */
  close(): void {
    this._closed = true;
    this.client.close();
    this.conn.secret.destroy();
    this.infoCache = null;
    this.walletInfoCache = null;
  }

  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      walletServicePubkey: this.conn.walletPubkey,
      clientPubkey: this.conn.clientPubkey,
      relays: this.conn.relays.map(relayLabel),
      closed: this._closed,
    };
  }
  [inspect.custom](): string {
    return `NwcProvider(${JSON.stringify(this.toJSON())})`;
  }

  // ---- shared plumbing -------------------------------------------------------------------------------------------
  private async loadInfo(force = false): Promise<NwcInfo | null> {
    if (!force && this.infoCache && this.nowMs() - this.infoCache.at < this.infoCacheMs)
      return this.infoCache.info;
    const info = await this.client.fetchInfo();
    this.infoCache = { at: this.nowMs(), info };
    return info;
  }

  /** Info event for read paths. Transport trouble => OutcomeUnknownError; no info event published => OutcomeUnknownError. */
  private async infoForRead(force = false): Promise<NwcInfo> {
    let info: NwcInfo | null;
    try {
      info = await this.loadInfo(force);
    } catch (e) {
      if (e instanceof NwcRelayUnavailableError)
        throw new OutcomeUnknownError(`wallet service unreachable: ${e.message}`, e);
      throw e;
    }
    if (!info)
      throw new OutcomeUnknownError(
        "the wallet service has not published an info event (kind 13194) on the configured relays",
      );
    return info;
  }

  private chooseScheme(info: NwcInfo): EncryptionScheme {
    if (info.encryption === null) {
      if (!this.allowNip04)
        throw new NwcNotSentError(
          "wallet service only supports legacy NIP-04 encryption, which is disabled by configuration",
          "encryption_unsupported",
        );
      return "nip04";
    }
    if (info.encryption.includes("nip44_v2")) return "nip44_v2";
    if (info.encryption.includes("nip04") && this.allowNip04) return "nip04";
    throw new NwcNotSentError(
      "no encryption scheme in common with the wallet service",
      "encryption_unsupported",
    );
  }

  private async read(method: string, params: Record<string, unknown>, info: NwcInfo): Promise<NwcResponse> {
    return this.client.call(method, params, {
      scheme: this.chooseScheme(info),
      timeoutMs: this.readTimeoutMs,
    });
  }

  /** get_info result, or null when the wallet does not advertise it / refuses it. Transport failures throw. */
  private async loadWalletInfo(info: NwcInfo, force = false): Promise<WalletGetInfo | null> {
    if (!force && this.walletInfoCache && this.nowMs() - this.walletInfoCache.at < this.infoCacheMs)
      return this.walletInfoCache.value;
    let value: WalletGetInfo | null = null;
    if (info.methods.has("get_info")) {
      const r = await this.read("get_info", {}, info);
      if (r.error) {
        if (!["RESTRICTED", "UNAUTHORIZED", "NOT_IMPLEMENTED"].includes(r.error.code)) {
          throw new OutcomeUnknownError(`get_info failed: ${r.error.code}`);
        }
      } else if (r.result) {
        const res = r.result;
        const methods = Array.isArray(res["methods"])
          ? (res["methods"] as unknown[]).filter((m): m is string => typeof m === "string").slice(0, 128)
          : null;
        const pk =
          typeof res["pubkey"] === "string" && /^[0-9a-fA-F]{64,66}$/.test(res["pubkey"])
            ? res["pubkey"].toLowerCase()
            : null;
        value = {
          alias: typeof res["alias"] === "string" ? sanitizeRemoteText(res["alias"], 100) : null,
          pubkey: pk,
          network: typeof res["network"] === "string" ? res["network"] : null,
          methods,
        };
      }
    }
    this.walletInfoCache = { at: this.nowMs(), value };
    return value;
  }

  /**
   * NWC has no mandatory network field. Rules: a wallet-reported valid network that contradicts the owner's assertion is a
   * mismatch (refuse); a valid reported network is used; otherwise the owner's assertion is used; otherwise unknown => refuse.
   */
  private resolveNetwork(reported: string | null): { network: Network; source: "wallet" | "asserted" } {
    const valid = isNetwork(reported) ? reported : undefined;
    if (valid && this.asserted && valid !== this.asserted) {
      throw new NwcNetworkError(
        `wallet reports network "${valid}" but the owner asserted "${this.asserted}"; refusing`,
        "mismatch",
      );
    }
    if (valid) return { network: valid, source: "wallet" };
    if (this.asserted) return { network: this.asserted, source: "asserted" };
    throw new NwcNetworkError(
      "the wallet did not report a network and none was asserted by the owner; refusing (set `network` explicitly after checking the wallet)",
      "unverified",
    );
  }

  // ---- WalletProvider --------------------------------------------------------------------------------------------
  async getInfo(): Promise<WalletInfo> {
    const info = await this.infoForRead(true);
    const wi = await this.loadWalletInfo(info, true);
    const { network } = this.resolveNetwork(wi?.network ?? null);
    return {
      kind: "nwc",
      network,
      nodePubkey: wi?.pubkey ?? null,
      alias: wi?.alias ?? null,
      version: null,
      syncedToChain: null,
    };
  }

  async discoverCapabilities(): Promise<Capabilities> {
    const notes: string[] = [];
    const discoveredAt = () => new Date(this.nowMs()).toISOString();
    let info: NwcInfo | null;
    try {
      info = await this.loadInfo(true);
    } catch (e) {
      notes.push(`Wallet service unreachable via its relays: ${(e as Error).message}`);
      return {
        canSendPayments: "unknown",
        canLookupPayments: "unknown",
        canReadInfo: "unknown",
        notes,
        discoveredAt: discoveredAt(),
      };
    }
    if (!info) {
      notes.push(
        "The wallet service has not published an info event (kind 13194) on the configured relays; no method is advertised.",
      );
      return {
        canSendPayments: false,
        canLookupPayments: false,
        canReadInfo: false,
        notes,
        discoveredAt: discoveredAt(),
      };
    }
    notes.push(`Info event advertises: ${[...info.methods].sort().join(" ") || "(nothing)"}.`);
    try {
      const scheme = this.chooseScheme(info);
      notes.push(`Encryption: ${scheme}${scheme === "nip04" ? " (legacy, deprecated by NIP-47)" : ""}.`);
    } catch (e) {
      notes.push(`Cannot use this wallet service: ${(e as Error).message}.`);
      return {
        canSendPayments: false,
        canLookupPayments: false,
        canReadInfo: false,
        notes,
        discoveredAt: discoveredAt(),
      };
    }

    // get_info is the only source of PER-CONNECTION permissions (the info event is per wallet service).
    let wi: WalletGetInfo | null = null;
    let canReadInfo: boolean | "unknown" = info.methods.has("get_info") ? "unknown" : false;
    let infoFailed = false;
    if (info.methods.has("get_info")) {
      try {
        wi = await this.loadWalletInfo(info, true);
        canReadInfo = wi !== null;
        if (wi === null)
          notes.push("get_info was refused for this connection (RESTRICTED/UNAUTHORIZED/NOT_IMPLEMENTED).");
      } catch (e) {
        infoFailed = true;
        canReadInfo = "unknown";
        notes.push(`get_info did not complete: ${(e as Error).message}`);
      }
    } else {
      notes.push(
        "get_info is not advertised; per-connection permissions and the wallet's network cannot be read.",
      );
    }

    const perConnection = (m: string): boolean | "unknown" => {
      if (!info.methods.has(m)) return false;
      if (wi?.methods) return wi.methods.includes(m);
      return "unknown"; // advertised by the service, but this connection's permission is not confirmed
    };
    const canSendPayments = perConnection("pay_invoice");
    const canLookupPayments = perConnection("lookup_invoice");
    if (canSendPayments === false)
      notes.push(
        info.methods.has("pay_invoice")
          ? "This connection is not authorised for pay_invoice (per get_info)."
          : "pay_invoice is not advertised: this connection cannot send payments.",
      );
    if (canSendPayments === "unknown")
      notes.push(
        infoFailed || !wi
          ? "pay_invoice is advertised by the wallet service but this connection's permission could not be confirmed; treating as unknown."
          : "get_info did not list this connection's methods; pay_invoice permission is unconfirmed.",
      );
    if (canLookupPayments === false)
      notes.push(
        "lookup_invoice is unavailable: Orynt could not reconcile an uncertain payment through this connection.",
      );
    if (canLookupPayments === "unknown")
      notes.push("lookup_invoice is advertised but this connection's permission is unconfirmed.");
    notes.push(
      "NIP-47 pay_invoice has no fee-limit parameter: the wallet cannot enforce a per-payment fee limit" +
        (this.feePolicy === "refuse"
          ? '; sends are refused until `unenforcedFeeLimit: "accept_and_report"` is configured.'
          : "; fee overruns are reported, not prevented."),
    );

    try {
      const net = this.resolveNetwork(wi?.network ?? null);
      notes.push(
        net.source === "wallet"
          ? `Network "${net.network}" reported by the wallet${this.asserted ? " and matches the owner's assertion" : " (not independently asserted)"}.`
          : `Network "${net.network}" is the OWNER'S ASSERTION; the wallet did not report one, so it is unverified.`,
      );
    } catch (e) {
      notes.push((e as Error).message);
    }

    const budgetListed =
      info.methods.has("get_budget") && (wi?.methods ? wi.methods.includes("get_budget") : true);
    if (budgetListed) {
      try {
        const b = await this.getBudget();
        if (b === null)
          notes.push(
            "get_budget: no spending budget is configured for this connection (the wallet's own limits still apply).",
          );
        else {
          notes.push(
            `Connection budget: ${b.remainingMsat} msat remaining of ${b.totalMsat} msat (${b.renewalPeriod}${b.renewsAt ? `, renews ${b.renewsAt}` : ""}).`,
          );
          if (b.remainingMsat === 0n)
            notes.push(
              "The connection budget is exhausted: payments will be refused (QUOTA_EXCEEDED) until it renews.",
            );
        }
      } catch (e) {
        notes.push(`get_budget did not complete: ${(e as Error).message}`);
      }
    }
    return { canSendPayments, canLookupPayments, canReadInfo, notes, discoveredAt: discoveredAt() };
  }

  /** Optional NWC-13 `get_budget`. Returns null when the wallet reports that no budget is configured. */
  async getBudget(): Promise<NwcBudget | null> {
    const info = await this.infoForRead();
    if (!info.methods.has("get_budget"))
      throw new InsufficientPermissionsError("get_budget is not advertised by the wallet service");
    const r = await this.read("get_budget", {}, info);
    if (r.error) {
      if (
        r.error.code === "RESTRICTED" ||
        r.error.code === "UNAUTHORIZED" ||
        r.error.code === "NOT_IMPLEMENTED"
      )
        throw new InsufficientPermissionsError(`get_budget refused: ${r.error.code}`);
      throw new OutcomeUnknownError(`get_budget failed: ${r.error.code}`);
    }
    const res = r.result ?? {};
    if (Object.keys(res).length === 0) return null;
    const used = toMsat(res["used_budget"]);
    const total = toMsat(res["total_budget"]);
    if (used === undefined || total === undefined || typeof res["renewal_period"] !== "string")
      throw new OutcomeUnknownError("get_budget returned a malformed result");
    const renews =
      typeof res["renews_at"] === "number" && Number.isSafeInteger(res["renews_at"]) && res["renews_at"] > 0
        ? iso(res["renews_at"])
        : null;
    return {
      usedMsat: used,
      totalMsat: total,
      remainingMsat: total > used ? total - used : 0n,
      renewsAt: renews,
      renewalPeriod: sanitizeRemoteText(res["renewal_period"], 16),
    };
  }

  async sendPayment(req: SendRequest): Promise<PaymentRecord> {
    const refuse = (message: string, reason: ConstructorParameters<typeof NwcNotSentError>[1]) =>
      new NwcNotSentError(message, reason);
    if (this._closed) throw refuse("adapter is closed (connection revoked locally)", "adapter_closed");

    // 1. validate the request against the invoice — before anything touches the wire
    let inv: ReturnType<typeof decodeInvoice>;
    try {
      inv = decodeInvoice(req.invoice);
    } catch (e) {
      throw refuse(`invoice rejected before sending: ${(e as Error).message}`, "invalid_request");
    }
    if (inv.paymentHash !== req.paymentHash)
      throw refuse("invoice payment hash does not match the authorised payment hash", "invalid_request");
    if (inv.amountMsat === null) {
      if (!req.zeroAmountInvoice)
        throw refuse("zero-amount invoice but the request does not flag it", "invalid_request");
      if (req.amountMsat <= 0n || req.amountMsat > BigInt(Number.MAX_SAFE_INTEGER))
        throw refuse("amount out of range for a zero-amount invoice", "invalid_request");
    } else {
      if (req.zeroAmountInvoice)
        throw refuse(
          "request flags a zero-amount invoice but the invoice carries an amount",
          "invalid_request",
        );
      if (inv.amountMsat !== req.amountMsat)
        throw refuse("authorised amount differs from the invoice amount", "invalid_request");
    }
    if (this.feePolicy === "refuse") {
      throw refuse(
        'NIP-47 pay_invoice cannot carry a fee limit, so the authorised fee limit cannot be enforced by this wallet; configure `unenforcedFeeLimit: "accept_and_report"` to accept that',
        "fee_limit_not_enforceable",
      );
    }

    // 2. discover what the wallet service advertises and which network it is on (all reads; nothing paid yet)
    let info: NwcInfo | null;
    let wi: WalletGetInfo | null;
    let resolved: { network: Network; source: "wallet" | "asserted" };
    try {
      info = await this.loadInfo();
      if (!info)
        throw refuse(
          "the wallet service has not published an info event; refusing to send",
          "wallet_info_unavailable",
        );
      wi = await this.loadWalletInfo(info);
      resolved = this.resolveNetwork(wi?.network ?? null);
    } catch (e) {
      if (e instanceof NwcNotSentError) throw e;
      if (e instanceof NwcNetworkError) throw refuse(e.message, "network_refused");
      throw refuse(
        `could not establish the wallet's capabilities and network: ${(e as Error).message}`,
        "wallet_info_unavailable",
      );
    }
    if (!info.methods.has("pay_invoice") || (wi?.methods && !wi.methods.includes("pay_invoice"))) {
      throw refuse("pay_invoice is not available on this connection", "method_not_advertised");
    }
    if (resolved.network === "mainnet" && !this.allowMainnet)
      throw refuse("wallet is on mainnet and `allowMainnet` is not set", "network_refused");
    if (inv.network !== resolved.network)
      throw refuse(
        `invoice is for ${inv.network} but the wallet is on ${resolved.network}`,
        "network_refused",
      );
    const scheme = this.chooseScheme(info);

    // 3. the only call that moves money
    const params: Record<string, unknown> = { invoice: req.invoice };
    if (req.zeroAmountInvoice) params["amount"] = Number(req.amountMsat);
    const resp = await this.client.call("pay_invoice", params, {
      scheme,
      timeoutMs: req.timeoutSeconds * 1000 + this.payMarginMs,
      expireAfterSeconds: Math.max(req.timeoutSeconds, 30),
    });
    if (resp.error) return this.classifyPayError(resp.error, req);

    const preimage = resp.result?.["preimage"];
    if (typeof preimage !== "string" || !HEX64.test(preimage.toLowerCase())) {
      throw new OutcomeUnknownError("wallet reported success without a valid preimage; reconcile by lookup");
    }
    const lowered = preimage.toLowerCase();
    // A wrong preimage is NOT converted into a failure or accepted here: it is passed on so the state machine's own
    // preimage check flags the wallet as inconsistent and holds the payment for review.
    if (sha256Hex(hexToBytes(lowered)) !== req.paymentHash)
      this.diag({ type: "preimage_mismatch", where: "pay_invoice" });
    const fee = toMsat(resp.result?.["fees_paid"]);
    if (fee !== undefined && fee > req.feeLimitMsat)
      this.diag({
        type: "fee_limit_exceeded",
        feeMsat: fee.toString(),
        limitMsat: req.feeLimitMsat.toString(),
      });
    const now = new Date(this.nowMs()).toISOString();
    return {
      status: "SUCCEEDED",
      paymentHash: req.paymentHash,
      preimage: lowered,
      feeMsat: fee,
      settledAt: now,
      observedAt: now,
    };
  }

  /**
   * Mapping of NIP-47 error codes for pay_invoice:
   *  - explicit pre-processing refusals (RATE_LIMITED, QUOTA_EXCEEDED, INSUFFICIENT_BALANCE, RESTRICTED, UNAUTHORIZED,
   *    NOT_IMPLEMENTED, UNSUPPORTED_ENCRYPTION)  => NotSentError (the wallet says it did not attempt the payment)
   *  - PAYMENT_FAILED => confirmed through lookup_invoice before being believed (the spec says it "may be due to a timeout")
   *  - INTERNAL, OTHER, anything unknown => OutcomeUnknownError, unless the message says a payment already exists
   */
  private async classifyPayError(
    err: { code: string; message: string },
    req: SendRequest,
  ): Promise<PaymentRecord> {
    const msg = sanitizeRemoteText(err.message);
    if (WALLET_REFUSALS.has(err.code))
      throw new NwcNotSentError(`wallet refused the payment: ${err.code}`, "wallet_rejected", err.code);
    if (ALREADY_EXISTS.test(msg)) throw new AlreadyExistsError(`${err.code}: ${msg}`);
    if (err.code === "PAYMENT_FAILED") {
      let rec: PaymentRecord;
      try {
        rec = await this.lookupPayment(req.paymentHash);
      } catch (e) {
        throw new OutcomeUnknownError(
          `wallet reported PAYMENT_FAILED but the failure could not be confirmed by lookup: ${(e as Error).message}`,
          e,
        );
      }
      if (rec.status === "FAILED")
        return {
          ...rec,
          failureReason:
            `PAYMENT_FAILED${rec.failureReason ? `: ${rec.failureReason}` : msg ? `: ${msg}` : ""}`.slice(
              0,
              300,
            ),
        };
      if (rec.status === "SUCCEEDED" || rec.status === "IN_FLIGHT") return rec;
      throw new OutcomeUnknownError(
        "wallet reported PAYMENT_FAILED but has no record of the payment to confirm it; treating the outcome as unknown",
      );
    }
    throw new OutcomeUnknownError(
      `wallet reported ${err.code}${msg ? `: ${msg}` : ""}; the payment may or may not have been attempted`,
    );
  }

  async lookupPayment(paymentHash: string): Promise<PaymentRecord> {
    if (!HEX64.test(paymentHash)) throw new Error("payment hash must be 32 bytes hex");
    if (this._closed)
      throw new NwcNotSentError("adapter is closed (connection revoked locally)", "adapter_closed");
    const info = await this.infoForRead();
    if (!info.methods.has("lookup_invoice"))
      throw new InsufficientPermissionsError("the wallet service does not advertise lookup_invoice");
    const r = await this.read("lookup_invoice", { payment_hash: paymentHash }, info);
    const observedAt = new Date(this.nowMs()).toISOString();
    if (r.error) {
      if (r.error.code === "NOT_FOUND") return { status: "NOT_FOUND", paymentHash, observedAt };
      if (
        r.error.code === "RESTRICTED" ||
        r.error.code === "UNAUTHORIZED" ||
        r.error.code === "NOT_IMPLEMENTED"
      ) {
        throw new InsufficientPermissionsError(`wallet refused lookup_invoice: ${r.error.code}`);
      }
      throw new OutcomeUnknownError(`lookup_invoice failed: ${r.error.code}`);
    }
    const res = r.result ?? {};
    const hash = typeof res["payment_hash"] === "string" ? res["payment_hash"].toLowerCase() : undefined;
    if (hash !== paymentHash)
      throw new OutcomeUnknownError("lookup_invoice returned a record for a different payment hash");
    if (res["type"] !== "outgoing") {
      // An incoming invoice with this hash says nothing about OUR outgoing payment (e.g. the wallet issued the invoice itself).
      throw new OutcomeUnknownError(
        `lookup_invoice returned a record of type "${sanitizeRemoteText(res["type"], 20)}", not an outgoing payment`,
      );
    }
    const amountMsat = toMsat(res["amount"]);
    const feeMsat = toMsat(res["fees_paid"]);
    const pre =
      typeof res["preimage"] === "string" && HEX64.test(res["preimage"].toLowerCase())
        ? res["preimage"].toLowerCase()
        : undefined;
    const preOk = pre !== undefined && sha256Hex(hexToBytes(pre)) === paymentHash;
    const settledSecs =
      typeof res["settled_at"] === "number" &&
      Number.isSafeInteger(res["settled_at"]) &&
      res["settled_at"] > 0
        ? res["settled_at"]
        : undefined;
    const state = res["state"];
    const succeeded = (): PaymentRecord => ({
      status: "SUCCEEDED",
      paymentHash,
      preimage: pre,
      amountMsat,
      feeMsat,
      settledAt: settledSecs !== undefined ? iso(settledSecs) : observedAt,
      observedAt,
    });
    if (state === "settled") {
      if (pre !== undefined && !preOk) this.diag({ type: "preimage_mismatch", where: "lookup_invoice" });
      return succeeded();
    }
    if (state === "failed")
      return {
        status: "FAILED",
        paymentHash,
        failureReason: sanitizeRemoteText(res["failure_reason"], 200) || "NWC_STATE_FAILED",
        observedAt,
      };
    if (state === "pending" || state === "accepted") return { status: "IN_FLIGHT", paymentHash, observedAt };
    if (state === undefined && preOk) return succeeded(); // `state` is optional in NIP-47; a preimage that hashes to the payment hash proves delivery
    throw new OutcomeUnknownError(
      `lookup_invoice returned an unrecognised state "${sanitizeRemoteText(state, 20)}"`,
    );
  }
}
