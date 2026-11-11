import { decodeInvoice, type Network } from "@orynt/core";
import {
  InsufficientPermissionsError, NotSentError, OutcomeUnknownError,
  type Capabilities, type PaymentRecord, type ProviderKind, type SendRequest, type WalletInfo, type WalletProvider,
} from "../types";
import { BtcpayConfigurationError, resolveConfig, type BtcpayConfig, type ResolvedConfig } from "./config";
import { BtcpayHttp, isRecord, type BtcpayResponse } from "./http";
import { assessApiKeyPermissions, STORE_LIGHTNING_USE, type PermissionAssessment } from "./permissions";

/**
 * BTCPay Server (Greenfield API, store-level Lightning node) wallet adapter.
 *
 * STATUS: written against BTCPay's published API description and its source code. It has been exercised ONLY against a
 * fake HTTP server built from that documentation (packages/wallets/test/btcpay.test.ts). It has NOT been run against a
 * real BTCPay Server. Do not describe it as verified or live.
 *
 * BTCPay is a gateway in front of a Lightning node whose type it does not disclose (LND, Core Lightning, Eclair,
 * Phoenixd, LNDhub...). Everything in here therefore assumes the least a backend-agnostic gateway can promise:
 *  - a pay call can answer 200 (complete), 202 (pending/unknown), 400 (could-not-find-route | generic-error), 422
 *    (validation, before any payment), 4xx/404 (auth/config, before any payment) or 503/5xx;
 *  - 503 `lightning-node-unavailable` is produced by an exception filter that wraps EVERY exception thrown in the
 *    controller, including ones thrown after the payment was handed to the node => it is an UNKNOWN outcome;
 *  - a `400` is trusted as a definitive failure only after a lookup by payment hash confirms status Failed;
 *  - an absent payment is reported as NOT_FOUND only when the operator attested that the backend is reliable about it.
 */

/**
 * `ProviderKind` in ../types.ts does not list "btcpay" yet and that file is outside this change's scope. The runtime
 * value is the truth; the cast is removed once ProviderKind includes "btcpay".
 */
const BTCPAY_KIND = "btcpay" as unknown as ProviderKind;

const PAY_PROBE_BOLT11 = "orynt-permission-probe-not-a-bolt11";
const ZERO_HASH = "00".repeat(32);
const HEX64 = /^[0-9a-f]{64}$/;

type Tri = boolean | "unknown";
type PaymentState = "Complete" | "Failed" | "Pending" | "Unknown";

interface ParsedPayment {
  status: PaymentState;
  id?: string;
  paymentHash?: string;
  preimage?: string;
  totalMsat?: bigint;
  feeMsat?: bigint;
}

function msat(v: unknown): bigint | undefined {
  if (typeof v === "string" && /^[0-9]+$/.test(v)) return BigInt(v);
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  return undefined;
}

function parsePayment(json: unknown): ParsedPayment | null {
  if (!isRecord(json)) return null;
  const raw = json["status"];
  if (typeof raw !== "string") return null;
  const states: Record<string, PaymentState | undefined> = { complete: "Complete", failed: "Failed", pending: "Pending", unknown: "Unknown" };
  const status = states[raw.toLowerCase()];
  if (!status) return null;
  const str = (k: string): string | undefined => (typeof json[k] === "string" && (json[k] as string).length > 0 ? (json[k] as string) : undefined);
  return {
    status,
    id: str("id"),
    paymentHash: str("paymentHash")?.toLowerCase(),
    preimage: str("preimage")?.toLowerCase(),
    totalMsat: msat(json["totalAmount"]),
    feeMsat: msat(json["feeAmount"]),
  };
}

export class BtcpayProvider implements WalletProvider {
  readonly kind: ProviderKind = BTCPAY_KIND;
  readonly isReal = true;
  private readonly cfg: ResolvedConfig;
  private readonly http: BtcpayHttp;

  constructor(config: BtcpayConfig) {
    const { resolved, apiKey } = resolveConfig(config);
    this.cfg = resolved;
    this.http = new BtcpayHttp(resolved.baseUrl, apiKey, resolved.fetchImpl);
  }

  /** Never serialises credentials (the key lives in a #private field of the transport). */
  toJSON(): Record<string, unknown> {
    return { kind: "btcpay", baseUrl: this.cfg.baseUrl, storeId: this.cfg.storeId, network: this.cfg.network };
  }

  // ---- paths ----------------------------------------------------------------------------------------------------
  private get lnBase(): string {
    return `/api/v1/stores/${encodeURIComponent(this.cfg.storeId)}/lightning/${this.cfg.cryptoCode}`;
  }
  private paymentPath(hash: string): string {
    return `${this.lnBase}/payments/${hash}`;
  }
  private safe(text: string | undefined): string {
    return this.http.redact(text ?? "");
  }
  private describeResponse(res: BtcpayResponse): string {
    const parts = [`HTTP ${res.status}`];
    if (res.code) parts.push(res.code);
    if (res.message) parts.push(this.safe(res.message));
    return parts.join(": ");
  }

  // ---- getInfo --------------------------------------------------------------------------------------------------
  async getInfo(): Promise<WalletInfo> {
    let res: BtcpayResponse;
    try {
      res = await this.http.request("GET", `${this.lnBase}/info`, { timeoutMs: this.cfg.requestTimeoutMs });
    } catch (e) {
      throw new OutcomeUnknownError(`getinfo failed: ${this.safe((e as Error).message)}`, e);
    }
    if (res.status === 401 || res.status === 403) {
      throw new InsufficientPermissionsError(`BTCPay rejected the API key (${this.describeResponse(res)}); ${STORE_LIGHTNING_USE} is required`);
    }
    if (res.status === 404 && (res.code === "lightning-not-configured" || res.code === "unknown-cryptocode")) {
      throw new BtcpayConfigurationError(`This store has no Lightning node for ${this.cfg.cryptoCode} (${this.describeResponse(res)}).`);
    }
    if (res.status !== 200 || !isRecord(res.json)) throw new OutcomeUnknownError(`getinfo failed: ${this.describeResponse(res)}`);
    const j = res.json;
    const uri = Array.isArray(j["nodeURIs"]) ? j["nodeURIs"].find((u): u is string => typeof u === "string" && u.includes("@")) : undefined;
    const pubkey = uri ? uri.slice(0, uri.indexOf("@")).toLowerCase() : "";
    const network = this.cfg.verifyNetworkWithInvoiceProbe ? await this.probeNetwork() : this.cfg.network;
    return {
      kind: BTCPAY_KIND,
      network,
      nodePubkey: /^0[23][0-9a-f]{64}$/.test(pubkey) ? pubkey : null,
      alias: typeof j["alias"] === "string" ? j["alias"] : null,
      version: typeof j["version"] === "string" ? j["version"] : null,
      // Greenfield exposes the node's block height but no "synced" flag: unknown, never assumed.
      syncedToChain: null,
    };
  }

  /** Creates a 1-sat, 60-second invoice on the store's node and reads the network from its BOLT11 prefix. Opt-in: it writes to the node. */
  private async probeNetwork(): Promise<Network> {
    let res: BtcpayResponse;
    try {
      res = await this.http.request("POST", `${this.lnBase}/invoices`, {
        body: { amount: "1000", description: "orynt network probe", expiry: 60, privateRouteHints: false },
        timeoutMs: this.cfg.requestTimeoutMs,
      });
    } catch (e) {
      throw new OutcomeUnknownError(`network probe failed: ${this.safe((e as Error).message)}`, e);
    }
    const bolt11 = res.status === 200 && isRecord(res.json) && typeof res.json["BOLT11"] === "string" ? res.json["BOLT11"] : null;
    if (!bolt11) throw new OutcomeUnknownError(`network probe failed: ${this.describeResponse(res)}`);
    let seen: Network;
    try {
      seen = decodeInvoice(bolt11).network;
    } catch (e) {
      throw new OutcomeUnknownError(`network probe returned an undecodable invoice: ${this.safe((e as Error).message)}`);
    }
    if (seen !== this.cfg.network) {
      throw new BtcpayConfigurationError(`Network mismatch: declared ${this.cfg.network}, but this BTCPay store's node issues ${seen} invoices.`);
    }
    return seen;
  }

  // ---- capabilities ---------------------------------------------------------------------------------------------
  async discoverCapabilities(): Promise<Capabilities> {
    return (await this.discoverCapabilitiesDetailed()).capabilities;
  }

  /**
   * Discovery never assumes. Three independent sources are combined, and a disagreement fails closed:
   *  1. the key's own permission list (GET /api/v1/api-keys/current) — an UPPER BOUND, and the source of over-privilege warnings;
   *  2. behavioural probes with no side effects: GET info; POST pay with a string that cannot parse as BOLT11 (BTCPay
   *     authorises, resolves the node and checks admin rights BEFORE validating, so 422 means "would have been allowed"
   *     and no payment can be created); GET payment for the all-zero hash (404 `payment-not-found` means "lookup works").
   */
  async discoverCapabilitiesDetailed(): Promise<{ capabilities: Capabilities; assessment: PermissionAssessment | null }> {
    const notes: string[] = [];
    const attempt = async (method: "GET" | "POST", path: string, body?: unknown): Promise<BtcpayResponse | Error> => {
      try {
        return await this.http.request(method, path, { timeoutMs: this.cfg.requestTimeoutMs, ...(body === undefined ? {} : { body }) });
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
    };
    const failed = (r: BtcpayResponse | Error): string => (r instanceof Error ? this.safe(r.message) : this.describeResponse(r));
    const done = (canSendPayments: Tri, canLookupPayments: Tri, canReadInfo: Tri, assessment: PermissionAssessment | null) => ({
      capabilities: { canSendPayments, canLookupPayments, canReadInfo, notes, discoveredAt: new Date().toISOString() } satisfies Capabilities,
      assessment,
    });

    // 1. the key
    const keyRes = await attempt("GET", "/api/v1/api-keys/current");
    let assessment: PermissionAssessment | null = null;
    if (!(keyRes instanceof Error) && (keyRes.status === 401 || keyRes.status === 403)) {
      notes.push(`BTCPay rejected the API key (${this.describeResponse(keyRes)}). Nothing can be done with it.`);
      return done(false, false, false, null);
    }
    if (!(keyRes instanceof Error) && keyRes.status === 200 && isRecord(keyRes.json) && Array.isArray(keyRes.json["permissions"])) {
      // Only `permissions` is read. The response also contains the key itself; it is deliberately never copied anywhere.
      const perms = keyRes.json["permissions"].filter((p): p is string => typeof p === "string");
      assessment = assessApiKeyPermissions(perms, this.cfg.storeId);
      notes.push(...assessment.warnings);
    } else {
      notes.push(`Could not read the API key's permission list (${failed(keyRes)}); relying on behavioural probes only.`);
    }

    // 2a. info
    const info = await attempt("GET", `${this.lnBase}/info`);
    let canReadInfo: Tri = "unknown";
    if (!(info instanceof Error) && info.status === 200) canReadInfo = true;
    else if (!(info instanceof Error) && (info.status === 401 || info.status === 403)) {
      canReadInfo = false;
      notes.push(`Cannot read the Lightning node's info (${this.describeResponse(info)}).`);
    } else if (!(info instanceof Error) && info.status === 404 && (info.code === "lightning-not-configured" || info.code === "unknown-cryptocode")) {
      notes.push(`This store has no Lightning node configured for ${this.cfg.cryptoCode} (${this.describeResponse(info)}). Nothing can be sent or looked up.`);
      return done(false, false, false, assessment);
    } else {
      notes.push(`The node's info could not be read right now (${failed(info)}).`);
    }

    // 2b. pay authorisation probe — cannot create a payment: the BOLT11 is not parseable
    const pay = await attempt("POST", `${this.lnBase}/invoices/pay`, { BOLT11: PAY_PROBE_BOLT11 });
    let probeSend: Tri = "unknown";
    if (!(pay instanceof Error) && pay.status === 422 && pay.validation?.some((v) => v.path.toUpperCase() === "BOLT11")) probeSend = true;
    else if (!(pay instanceof Error) && (pay.status === 401 || pay.status === 403)) {
      probeSend = false;
      notes.push(`This credential cannot pay (${this.describeResponse(pay)}).`);
    } else if (!(pay instanceof Error) && pay.status === 404 && (pay.code === "lightning-not-configured" || pay.code === "unknown-cryptocode")) {
      probeSend = false;
      notes.push(`The pay endpoint reports no usable Lightning node (${this.describeResponse(pay)}).`);
    } else {
      notes.push(`The pay permission check was inconclusive (${failed(pay)}); it will be re-checked on use and fail closed.`);
    }

    // 2c. lookup probe
    const look = await attempt("GET", this.paymentPath(ZERO_HASH));
    let probeLookup: Tri = "unknown";
    if (!(look instanceof Error) && (look.status === 200 || (look.status === 404 && look.code === "payment-not-found"))) probeLookup = true;
    else if (!(look instanceof Error) && (look.status === 401 || look.status === 403)) {
      probeLookup = false;
      notes.push(`This credential cannot look payments up (${this.describeResponse(look)}); an uncertain payment could not be reconciled.`);
    } else {
      notes.push(`The payment-lookup check was inconclusive (${failed(look)}).`);
    }

    // 3. combine. The list is an upper bound; a probe that says "allowed" against a list that says "no" is a contradiction => unknown.
    const listAllows = assessment ? assessment.grantsLightningUse : null;
    const combine = (probe: Tri, what: string): Tri => {
      if (probe === true && listAllows === false) {
        notes.push(`Contradiction: ${what} appears allowed but the key's permission list does not grant ${STORE_LIGHTNING_USE}. Treated as unknown.`);
        return "unknown";
      }
      if (probe === "unknown" && listAllows === false) return false;
      return probe;
    };
    let canSendPayments = combine(probeSend, "paying");
    let canLookupPayments = combine(probeLookup, "payment lookup");

    if (this.cfg.requireLeastPrivilege && assessment && assessment.excess.length > 0 && canSendPayments !== false) {
      canSendPayments = false;
      notes.push("Refusing to send: requireLeastPrivilege is set and the key holds more than the minimum permission.");
    }
    if (canLookupPayments === true && !this.cfg.trustAbsenceOfPayment) {
      canLookupPayments = "unknown";
      notes.push(
        "Payments that BTCPay HAS a record of can be looked up by hash, but BTCPay does not say which Lightning backend sits behind the store, and " +
          "some backends report an absent payment for any API error. Absence is therefore not treated as proof: lookup stays 'unknown' until the " +
          "operator attests (trustAbsenceOfPayment) that the backend is LND, Core Lightning or Eclair.",
      );
    }
    notes.push(`Network ${this.cfg.network} is operator-declared: the Greenfield API does not expose it${this.cfg.verifyNetworkWithInvoiceProbe ? " (verified by an invoice probe in getInfo)" : ""}.`);
    return done(canSendPayments, canLookupPayments, canReadInfo, assessment);
  }

  // ---- records --------------------------------------------------------------------------------------------------
  private record(p: ParsedPayment, hash: string): PaymentRecord {
    if (p.paymentHash !== undefined && p.paymentHash !== hash) {
      throw new OutcomeUnknownError("BTCPay returned a payment record for a different payment hash");
    }
    const observedAt = new Date().toISOString();
    const base = { paymentHash: hash, observedAt, providerRef: p.id };
    switch (p.status) {
      case "Complete": {
        const amountMsat = p.totalMsat !== undefined && p.feeMsat !== undefined && p.totalMsat >= p.feeMsat ? p.totalMsat - p.feeMsat : undefined;
        // totalAmount includes fees (Greenfield docs). The caller still verifies sha256(preimage) === paymentHash.
        return { ...base, status: "SUCCEEDED", preimage: p.preimage, amountMsat, feeMsat: p.feeMsat };
      }
      case "Failed":
        // The Greenfield payment object carries no failure reason.
        return { ...base, status: "FAILED", failureReason: "btcpay: payment status Failed (reason not exposed by the Greenfield API)" };
      case "Pending":
        return { ...base, status: "IN_FLIGHT" };
      case "Unknown":
        throw new OutcomeUnknownError("BTCPay reports the payment status as Unknown");
    }
  }

  /** Raw lookup: found, or definitively absent per BTCPay's `payment-not-found`. Throws for everything else. */
  private async fetchPayment(hash: string): Promise<{ found: ParsedPayment } | { absent: true }> {
    let res: BtcpayResponse;
    try {
      res = await this.http.request("GET", this.paymentPath(hash), { timeoutMs: this.cfg.requestTimeoutMs });
    } catch (e) {
      throw new OutcomeUnknownError(`lookup failed: ${this.safe((e as Error).message)}`, e);
    }
    if (res.status === 200) {
      const p = parsePayment(res.json);
      if (!p) throw new OutcomeUnknownError("lookup returned a body that is not a payment record");
      return { found: p };
    }
    if (res.status === 404 && res.code === "payment-not-found") return { absent: true };
    if (res.status === 401 || res.status === 403) {
      throw new InsufficientPermissionsError(`BTCPay rejected the API key for payment lookup (${this.describeResponse(res)}); ${STORE_LIGHTNING_USE} is required`);
    }
    throw new OutcomeUnknownError(`lookup failed: ${this.describeResponse(res)}`);
  }

  async lookupPayment(paymentHash: string): Promise<PaymentRecord> {
    if (!HEX64.test(paymentHash)) throw new Error("payment hash must be 32 bytes lowercase hex");
    const r = await this.fetchPayment(paymentHash);
    if ("found" in r) return this.record(r.found, paymentHash);
    if (this.cfg.trustAbsenceOfPayment) return { status: "NOT_FOUND", paymentHash, observedAt: new Date().toISOString() };
    throw new OutcomeUnknownError(
      "BTCPay has no record of this payment, but it cannot prove that its Lightning backend would have one (trustAbsenceOfPayment is not set); treating the outcome as unknown",
    );
  }

  // ---- sending --------------------------------------------------------------------------------------------------
  /** Everything that can be checked locally, before a single byte is sent. Throws NotSentError. */
  private plan(req: SendRequest): { body: Record<string, unknown>; httpTimeoutMs: number } {
    if (!HEX64.test(req.paymentHash)) throw new NotSentError("payment hash must be 32 bytes lowercase hex");
    let d: ReturnType<typeof decodeInvoice>;
    try {
      d = decodeInvoice(req.invoice);
    } catch (e) {
      throw new NotSentError(`invoice cannot be decoded: ${this.safe((e as Error).message)}`);
    }
    if (d.paymentHash !== req.paymentHash) throw new NotSentError("invoice payment hash differs from the approved payment hash");
    if (d.network !== this.cfg.network) throw new NotSentError(`invoice is for ${d.network} but this connection is declared ${this.cfg.network}`);
    if (d.amountMsat === null) {
      if (!req.zeroAmountInvoice) throw new NotSentError("zero-amount invoice but the request does not say so");
      if (req.amountMsat <= 0n) throw new NotSentError("zero-amount invoice needs a positive explicit amount");
    } else {
      if (req.zeroAmountInvoice) throw new NotSentError("request claims a zero-amount invoice but the invoice has an amount");
      if (d.amountMsat !== req.amountMsat) throw new NotSentError("approved amount differs from the invoice amount");
    }
    // BTCPay can express a fee limit only as `maxFeeFlat` in WHOLE satoshi (or a percentage). A value of 0 is ignored by
    // the LND backend and falls back to its default policy (up to 100% for <=1000 sat, 5% above), so a limit below
    // 1 sat cannot be enforced and is refused instead of silently loosened.
    if (req.feeLimitMsat < 1000n) throw new NotSentError("fee limit below 1 sat cannot be expressed to BTCPay; refusing rather than falling back to its default fee policy");
    if (!Number.isInteger(req.timeoutSeconds) || req.timeoutSeconds < 1 || req.timeoutSeconds > 3600) throw new NotSentError("send timeout must be an integer number of seconds between 1 and 3600");
    const body: Record<string, unknown> = {
      BOLT11: req.invoice,
      maxFeeFlat: (req.feeLimitMsat / 1000n).toString(),
      sendTimeout: req.timeoutSeconds,
    };
    // `amount` OVERRIDES the BOLT11 amount per the docs, so it is sent only when the invoice has none.
    if (req.zeroAmountInvoice) body["amount"] = req.amountMsat.toString();
    return { body, httpTimeoutMs: req.timeoutSeconds * 1000 + this.cfg.sendMarginMs };
  }

  /** BTCPay reports "already paid" as success and has no "already exists" error, so duplicates are prevented here. */
  private async existingPayment(hash: string): Promise<PaymentRecord | null> {
    let r: { found: ParsedPayment } | { absent: true };
    try {
      r = await this.fetchPayment(hash);
    } catch (e) {
      throw new NotSentError(`could not check for an existing payment, so nothing was sent: ${this.safe((e as Error).message)}`, e);
    }
    if ("absent" in r) return null;
    switch (r.found.status) {
      case "Failed": return null; // a terminal failure: the state machine decided a new attempt is allowed
      case "Unknown": throw new NotSentError("BTCPay already has a payment for this hash in an unclassifiable state; refusing to send a second one");
      default:
        try {
          return this.record(r.found, hash);
        } catch (e) {
          throw new NotSentError(`BTCPay's existing payment record is inconsistent, so nothing was sent: ${this.safe((e as Error).message)}`, e);
        }
    }
  }

  async sendPayment(req: SendRequest): Promise<PaymentRecord> {
    const plan = this.plan(req);
    if (this.cfg.preSendDuplicateCheck) {
      const existing = await this.existingPayment(req.paymentHash);
      if (existing) return existing;
    }
    // Transport errors propagate classified: NotSentError (provably not delivered) or OutcomeUnknownError (anything else, incl. timeouts).
    const res = await this.http.request("POST", `${this.lnBase}/invoices/pay`, { body: plan.body, timeoutMs: plan.httpTimeoutMs });
    return this.interpretPay(res, req.paymentHash);
  }

  private async interpretPay(res: BtcpayResponse, hash: string): Promise<PaymentRecord> {
    const s = res.status;
    if (s === 200 || s === 202) {
      const p = parsePayment(res.json);
      if (!p) throw new OutcomeUnknownError(`BTCPay answered HTTP ${s} with a body that is not a payment record; the payment may have been made`);
      if (p.paymentHash !== undefined && p.paymentHash !== hash) throw new OutcomeUnknownError("BTCPay answered with a payment for a different payment hash");
      if (p.status === "Pending") return this.record(p, hash);
      if (p.status === "Complete") return this.completed(p, hash);
      if (p.status === "Failed") return this.confirmFailure(hash, "payment-status-failed", "BTCPay reported status Failed");
      return this.resolveByLookup(hash, `BTCPay answered HTTP ${s} with status Unknown`);
    }
    if (s === 400 && (res.code === "could-not-find-route" || res.code === "generic-error")) {
      return this.confirmFailure(hash, res.code, this.safe(res.message));
    }
    // ---- rejected before the payment was handed to the node: provably not sent ----
    if (s === 401 || s === 403) {
      throw new NotSentError(`BTCPay rejected the API key before processing (${this.describeResponse(res)}${res.missingPermission ? `; missing ${this.safe(res.missingPermission)}` : ""}); nothing was sent`);
    }
    if (s === 404 && (res.code === "lightning-not-configured" || res.code === "unknown-cryptocode")) {
      throw new NotSentError(`BTCPay has no Lightning node for this store (${this.describeResponse(res)}); nothing was sent`);
    }
    if (s === 422 && res.validation) {
      throw new NotSentError(`BTCPay rejected the request as invalid (${res.validation.map((v) => `${this.safe(v.path)}: ${this.safe(v.message)}`).join("; ")}); nothing was sent`);
    }
    if (s === 400 && res.code === undefined) throw new NotSentError(`BTCPay rejected a malformed request (HTTP 400); nothing was sent`);
    if (s === 429) throw new NotSentError("BTCPay rate-limited the request; nothing was sent");
    if (s >= 300 && s < 400) throw new NotSentError(`BTCPay answered with a redirect (HTTP ${s}); redirects are not followed and nothing was sent`);
    // ---- everything else (503 lightning-node-unavailable, 500, 502, 504, unknown 4xx) may have followed a started payment ----
    throw new OutcomeUnknownError(`BTCPay answered ${this.describeResponse(res)}; the payment may or may not have been started`);
  }

  /** Success reported: make sure a preimage is in hand, fetching the payment record if the pay response lacked one. */
  private async completed(p: ParsedPayment, hash: string): Promise<PaymentRecord> {
    if (p.preimage) return this.record(p, hash);
    try {
      const r = await this.fetchPayment(hash);
      if ("found" in r && r.found.status === "Complete" && r.found.preimage) return this.record(r.found, hash);
    } catch {
      // fall through: report what we have; the caller refuses to settle without a verified preimage
    }
    return this.record(p, hash);
  }

  private async resolveByLookup(hash: string, why: string): Promise<PaymentRecord> {
    let r: { found: ParsedPayment } | { absent: true };
    try {
      r = await this.fetchPayment(hash);
    } catch (e) {
      throw new OutcomeUnknownError(`${why}; the follow-up lookup failed: ${this.safe((e as Error).message)}`, e);
    }
    if ("absent" in r) throw new OutcomeUnknownError(`${why}; the follow-up lookup found no record`);
    if (r.found.status === "Complete") return this.completed(r.found, hash);
    return this.record(r.found, hash);
  }

  /** A pay error is a definitive failure only when BTCPay's own record of the payment says Failed. */
  private async confirmFailure(hash: string, code: string, message: string): Promise<PaymentRecord> {
    const why = `BTCPay answered '${code}'${message ? ` (${message})` : ""}`;
    let r: { found: ParsedPayment } | { absent: true };
    try {
      r = await this.fetchPayment(hash);
    } catch (e) {
      throw new OutcomeUnknownError(`${why}, but the confirming lookup failed: ${this.safe((e as Error).message)}`, e);
    }
    if ("absent" in r) throw new OutcomeUnknownError(`${why}, but BTCPay has no record of the payment, so a definitive failure is not proven`);
    switch (r.found.status) {
      case "Failed": {
        const rec = this.record(r.found, hash);
        return { ...rec, failureReason: `btcpay ${code}${message ? `: ${message}` : ""}` };
      }
      case "Complete": return this.completed(r.found, hash);
      case "Pending": return this.record(r.found, hash);
      case "Unknown": throw new OutcomeUnknownError(`${why}, and the payment record is in an Unknown state`);
    }
  }
}
