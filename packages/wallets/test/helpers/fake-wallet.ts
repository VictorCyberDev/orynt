/**
 * Scriptable NIP-47 WALLET SERVICE for CONTRACT TESTS ONLY. It follows the protocol as written in NIP-47
 * (info event 13194, requests 23194 -> responses 23195, NIP-44 v2 / NIP-04, expiration tag, error codes) but moves no
 * value: "payments" are rows in a Map. It can be told to misbehave in the ways the adapter must survive.
 *
 * This is NOT a real wallet service and proves nothing about any real wallet's behaviour.
 */
import { WebSocket } from "ws";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { decodeInvoice } from "@orynt/core";
import { decryptPayload, encryptPayload, type EncryptionScheme } from "../../src/nwc/encryption";
import {
  KIND_INFO,
  KIND_REQUEST,
  KIND_RESPONSE,
  getPublicKeyHex,
  isExpired,
  parseEventShape,
  signEvent,
  tagValues,
  verifyEventSignature,
  type NostrEvent,
} from "../../src/nwc/nostr";

export type Action =
  | { do: "ok" }
  | { do: "error"; code: string; message?: string; execute?: boolean }
  | { do: "silent"; execute?: boolean }
  | { do: "late"; afterMs: number }
  | { do: "bad_signature" }
  | { do: "wrong_author" }
  | { do: "wrong_e_tag" }
  | { do: "wrong_p_tag" }
  | { do: "wrong_result_type" }
  | { do: "garbage_payload" }
  | { do: "stale" }
  | { do: "expired_response" }
  | { do: "replay" }
  | { do: "drop_connection"; execute?: boolean }
  | { do: "result"; result: Record<string, unknown>; execute?: boolean };

export type PaymentState = "settled" | "failed" | "pending";
export interface PaymentRow {
  state: PaymentState;
  preimage: string | null;
  amountMsat: bigint;
  feesMsat: bigint;
  type: "outgoing" | "incoming";
  settledAt: number | null;
  executions: number;
}

export interface FakeWalletOptions {
  relays: string[];
  walletSecret: Uint8Array;
  /** the single client key this connection is paired with */
  clientPubkey: string;
  /** content of the info event */
  methods?: string[];
  /** value of the `encryption` info tag; null => no tag (legacy NIP-04-only service) */
  encryptionTag?: string | null;
  /** what get_info reports. `undefined` network => the field is omitted */
  network?: string;
  /** methods get_info reports for THIS connection (defaults to `methods`) */
  connectionMethods?: string[];
  alias?: string;
  budget?: { used: number; total: number; renewsAt?: number; period: string } | "none";
  feesPerPaymentMsat?: bigint;
  /** called for `drop_connection` */
  dropRelays?: () => void;
  /** wrongly-keyed signer for `wrong_author` */
  impostorSecret?: Uint8Array;
}

export class FakeWallet {
  readonly walletPubkey: string;
  readonly payments = new Map<string, PaymentRow>();
  /** preimages the wallet "knows" for invoices it can pay, by payment hash */
  readonly knownPreimages = new Map<string, string>();
  /** decrypted requests, in arrival order */
  readonly requests: Array<{
    method: string;
    params: Record<string, unknown>;
    scheme: EncryptionScheme;
    eventId: string;
    expiration: number | null;
  }> = [];
  readonly sentResponses: NostrEvent[] = [];
  /** requests ignored because their expiration tag had passed (NIP-47) */
  ignoredExpired = 0;
  private readonly scripts = new Map<string, Action[]>();
  private readonly conns = new Map<string, WebSocket>();
  private stopped = false;
  private readonly o: Required<Pick<FakeWalletOptions, "methods" | "feesPerPaymentMsat">> & FakeWalletOptions;

  constructor(opts: FakeWalletOptions) {
    this.o = {
      methods: ["pay_invoice", "get_balance", "get_info", "lookup_invoice", "make_invoice"],
      feesPerPaymentMsat: 1000n,
      ...opts,
    };
    this.walletPubkey = getPublicKeyHex(opts.walletSecret);
  }

  /** queue behaviours for the next requests of `method` (consumed one per request; afterwards the default `ok`) */
  script(method: string, ...actions: Action[]): void {
    this.scripts.set(method, [...(this.scripts.get(method) ?? []), ...actions]);
  }
  registerInvoicePreimage(preimageHex: string): string {
    const hash = bytesToHex(sha256(hexToBytes(preimageHex)));
    this.knownPreimages.set(hash, preimageHex);
    return hash;
  }
  executions(hash: string): number {
    return this.payments.get(hash)?.executions ?? 0;
  }

  async start(): Promise<void> {
    await Promise.all(this.o.relays.map((u) => this.connect(u)));
  }
  async stop(): Promise<void> {
    this.stopped = true;
    for (const ws of this.conns.values()) ws.terminate();
    this.conns.clear();
  }

  private connect(url: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const ws = new WebSocket(url);
      ws.on("error", () => undefined);
      ws.on("open", () => {
        this.conns.set(url, ws);
        ws.send(JSON.stringify(["REQ", "wallet", { kinds: [KIND_REQUEST], "#p": [this.walletPubkey] }]));
        ws.send(JSON.stringify(["EVENT", this.infoEvent()]));
        resolve();
      });
      ws.on("message", (d) => {
        let m: unknown;
        try {
          m = JSON.parse(d.toString());
        } catch {
          return;
        }
        if (Array.isArray(m) && m[0] === "EVENT" && m[1] === "wallet") void this.onRequest(m[2]);
      });
      ws.on("close", () => {
        if (this.stopped) return;
        this.conns.delete(url);
        setTimeout(() => {
          if (!this.stopped) void this.connect(url).then(resolve);
        }, 40);
      });
    });
  }

  private infoEvent(): NostrEvent {
    const tags: string[][] = [];
    if (this.o.encryptionTag !== null) tags.push(["encryption", this.o.encryptionTag ?? "nip44_v2 nip04"]);
    return signEvent(
      {
        pubkey: this.walletPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: KIND_INFO,
        tags,
        content: this.o.methods.join(" "),
      },
      this.o.walletSecret,
    );
  }

  private broadcast(ev: NostrEvent) {
    for (const ws of this.conns.values())
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(["EVENT", ev]));
  }

  private async onRequest(raw: unknown) {
    const ev = parseEventShape(raw);
    if (!ev || ev.kind !== KIND_REQUEST) return;
    if (!verifyEventSignature(ev)) return; // a wallet service MUST reject unauthenticated requests
    if (ev.pubkey !== this.o.clientPubkey) return; // not the paired client key
    if (isExpired(ev, Math.floor(Date.now() / 1000))) {
      this.ignoredExpired++;
      return;
    } // NIP-47: ignore expired requests
    if (this.requests.some((r) => r.eventId === ev.id)) return; // same event arriving via several relays
    const encTag = tagValues(ev, "encryption")[0];
    const scheme: EncryptionScheme = encTag === "nip44_v2" ? "nip44_v2" : "nip04";
    let req: { method: string; params: Record<string, unknown> };
    try {
      req = JSON.parse(decryptPayload(scheme, ev.content, this.o.walletSecret, ev.pubkey));
    } catch {
      return;
    }
    const exp = tagValues(ev, "expiration")[0];
    this.requests.push({
      method: req.method,
      params: req.params ?? {},
      scheme,
      eventId: ev.id,
      expiration: exp ? Number(exp) : null,
    });

    const action = this.scripts.get(req.method)?.shift() ?? { do: "ok" as const };
    await this.act(action, ev, scheme, req);
  }

  private respond(
    requestId: string,
    scheme: EncryptionScheme,
    body: unknown,
    opts: {
      secret?: Uint8Array;
      eTag?: string;
      pTag?: string;
      createdAt?: number;
      tamperSig?: boolean;
      expiration?: number;
    } = {},
  ): NostrEvent {
    const secret = opts.secret ?? this.o.walletSecret;
    const content = encryptPayload(
      scheme,
      typeof body === "string" ? body : JSON.stringify(body),
      this.o.walletSecret,
      this.o.clientPubkey,
    );
    const tags: string[][] = [
      ["p", opts.pTag ?? this.o.clientPubkey],
      ["e", opts.eTag ?? requestId],
    ];
    if (opts.expiration !== undefined) tags.push(["expiration", String(opts.expiration)]);
    let ev = signEvent(
      {
        pubkey: getPublicKeyHex(secret),
        created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
        kind: KIND_RESPONSE,
        tags,
        content,
      },
      secret,
    );
    if (opts.tamperSig) ev = { ...ev, sig: ev.sig.slice(0, -2) + (ev.sig.endsWith("00") ? "01" : "00") };
    return ev;
  }

  private async act(
    a: Action,
    ev: NostrEvent,
    scheme: EncryptionScheme,
    req: { method: string; params: Record<string, unknown> },
  ) {
    const execute = !("execute" in a) || a.execute !== false;
    const compute = () => this.handle(req.method, req.params, execute);
    const send = (e: NostrEvent) => {
      this.sentResponses.push(e);
      this.broadcast(e);
    };
    const okBody = (b: { error?: { code: string; message: string }; result?: unknown }) => ({
      result_type: req.method,
      error: b.error ?? null,
      result: b.error ? null : b.result,
    });
    switch (a.do) {
      case "ok":
        return send(this.respond(ev.id, scheme, okBody(compute())));
      case "error": {
        if (execute) compute();
        return send(
          this.respond(
            ev.id,
            scheme,
            okBody({ error: { code: a.code, message: a.message ?? `scripted ${a.code}` } }),
          ),
        );
      }
      case "silent": {
        if (execute) compute();
        return;
      }
      case "late": {
        const b = okBody(compute());
        setTimeout(() => {
          if (!this.stopped) send(this.respond(ev.id, scheme, b));
        }, a.afterMs);
        return;
      }
      case "bad_signature":
        return send(this.respond(ev.id, scheme, okBody(compute()), { tamperSig: true }));
      case "wrong_author":
        return send(
          this.respond(ev.id, scheme, okBody(compute()), {
            secret: this.o.impostorSecret ?? randomBytes(32),
          }),
        );
      case "wrong_e_tag":
        return send(this.respond(ev.id, scheme, okBody(compute()), { eTag: bytesToHex(randomBytes(32)) }));
      case "wrong_p_tag":
        return send(this.respond(ev.id, scheme, okBody(compute()), { pTag: bytesToHex(randomBytes(32)) }));
      case "wrong_result_type":
        return send(
          this.respond(ev.id, scheme, { result_type: "get_balance", error: null, result: compute().result }),
        );
      case "garbage_payload": {
        compute();
        return send(this.respond(ev.id, scheme, "this is not json"));
      }
      case "stale":
        return send(
          this.respond(ev.id, scheme, okBody(compute()), { createdAt: Math.floor(Date.now() / 1000) - 3600 }),
        );
      case "expired_response":
        return send(
          this.respond(ev.id, scheme, okBody(compute()), { expiration: Math.floor(Date.now() / 1000) - 10 }),
        );
      case "replay": {
        compute();
        const old = this.sentResponses[0];
        if (old) this.broadcast(old);
        return;
      }
      case "drop_connection": {
        if (execute) compute();
        this.o.dropRelays?.();
        return;
      }
      case "result": {
        if (execute) compute();
        return send(this.respond(ev.id, scheme, { result_type: req.method, error: null, result: a.result }));
      }
    }
  }

  /** Protocol semantics of the fake. Returns either a result or a NIP-47 error. */
  private handle(
    method: string,
    params: Record<string, unknown>,
    execute: boolean,
  ): { result?: unknown; error?: { code: string; message: string } } {
    const advertised = this.o.connectionMethods ?? this.o.methods;
    if (!advertised.includes(method))
      return {
        error: {
          code: method === "pay_invoice" ? "RESTRICTED" : "NOT_IMPLEMENTED",
          message: `${method} not permitted`,
        },
      };
    switch (method) {
      case "get_info": {
        const result: Record<string, unknown> = {
          alias: this.o.alias ?? "fake-wallet",
          color: "#000000",
          pubkey: bytesToHex(randomBytes(33)).slice(0, 66).replace(/^../, "02"),
          block_height: 1,
          block_hash: "00".repeat(32),
          methods: advertised,
        };
        if (this.o.network !== undefined) result["network"] = this.o.network;
        return { result };
      }
      case "get_budget": {
        if (this.o.budget === "none") return { result: {} };
        const b = this.o.budget ?? {
          used: 10_000,
          total: 100_000,
          renewsAt: 4_000_000_000,
          period: "monthly",
        };
        return {
          result: {
            used_budget: b.used,
            total_budget: b.total,
            renews_at: b.renewsAt,
            renewal_period: b.period,
          },
        };
      }
      case "pay_invoice": {
        const invoice = String(params["invoice"] ?? "");
        let d: ReturnType<typeof decodeInvoice>;
        try {
          d = decodeInvoice(invoice);
        } catch {
          return { error: { code: "OTHER", message: "invalid invoice" } };
        }
        const existing = this.payments.get(d.paymentHash);
        if (existing && existing.type === "outgoing" && existing.state !== "failed")
          return { error: { code: "OTHER", message: "payment already exists for this invoice" } };
        const preimage = this.knownPreimages.get(d.paymentHash);
        if (!execute) return { result: { preimage: preimage ?? "00".repeat(32) } };
        const amount = d.amountMsat ?? BigInt(String(params["amount"] ?? 0));
        if (!preimage) {
          this.payments.set(d.paymentHash, {
            state: "failed",
            preimage: null,
            amountMsat: amount,
            feesMsat: 0n,
            type: "outgoing",
            settledAt: null,
            executions: (existing?.executions ?? 0) + 1,
          });
          return { error: { code: "PAYMENT_FAILED", message: "no route" } };
        }
        this.payments.set(d.paymentHash, {
          state: "settled",
          preimage,
          amountMsat: amount,
          feesMsat: this.o.feesPerPaymentMsat,
          type: "outgoing",
          settledAt: Math.floor(Date.now() / 1000),
          executions: (existing?.executions ?? 0) + 1,
        });
        return { result: { preimage, fees_paid: Number(this.o.feesPerPaymentMsat) } };
      }
      case "lookup_invoice": {
        const hash = String(params["payment_hash"] ?? "");
        const row = this.payments.get(hash);
        if (!row) return { error: { code: "NOT_FOUND", message: "not found" } };
        const result: Record<string, unknown> = {
          type: row.type,
          state: row.state,
          payment_hash: hash,
          amount: Number(row.amountMsat),
          fees_paid: Number(row.feesMsat),
          created_at: row.settledAt ?? Math.floor(Date.now() / 1000),
        };
        if (row.state === "settled") {
          result["preimage"] = row.preimage;
          result["settled_at"] = row.settledAt;
        }
        return { result };
      }
      default:
        return { error: { code: "NOT_IMPLEMENTED", message: method } };
    }
  }
}
