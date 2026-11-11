import type net from "node:net";
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import type { Network } from "@orynt/core";
import {
  AlreadyExistsError, InsufficientPermissionsError, NotSentError, OutcomeUnknownError,
  type Capabilities, type PaymentRecord, type SendRequest, type WalletInfo, type WalletProvider,
} from "./types";

export interface LndConfig {
  restUrl: string; // e.g. https://127.0.0.1:8080
  macaroonHex: string;
  tlsCertPem?: string; // pin a self-signed cert
  /** DNS resolution hook. The API layer passes one that re-vets every resolved address, so a hostname that changes its answer after the initial check (DNS rebinding) cannot reach internal hosts. */
  lookup?: net.LookupFunction;
  /** Upper bound on buffered response bytes (default 1 MiB): a hostile endpoint cannot make the server buffer without limit. */
  maxResponseBytes?: number;
}

interface Raw {
  status: number;
  lines: unknown[]; // parsed JSON messages (single JSON body => one element)
}

const NOT_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SSL_WRONG_VERSION_NUMBER"]);

/** LND's REST gateway decodes path bytes with a PADDED base64 alphabet (observed on a real node: unpadded input => HTTP 400 "illegal base64 data"). */
function b64urlPadded(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "%3D");
}
function msatOf(v: unknown): bigint | undefined {
  if (typeof v === "string" && /^[0-9]+$/.test(v)) return BigInt(v);
  if (typeof v === "number" && Number.isSafeInteger(v)) return BigInt(v);
  return undefined;
}

export class LndRestProvider implements WalletProvider {
  readonly kind = "lnd" as const;
  readonly isReal = true;
  constructor(private readonly cfg: LndConfig) {}

  /** Low-level request. `mode: "first"` resolves after the first streamed message and aborts the stream. */
  private request(method: "GET" | "POST", path: string, body: unknown, opts: { timeoutMs: number; mode?: "all" | "first" }): Promise<Raw> {
    const u = new URL(path, this.cfg.restUrl);
    const lib = u.protocol === "http:" ? http : https;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise<Raw>((resolve, reject) => {
      let wroteBytes = false;
      const req = lib.request(
        {
          method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
          headers: { "Grpc-Metadata-macaroon": this.cfg.macaroonHex, ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}) },
          ...(this.cfg.lookup ? { lookup: this.cfg.lookup } : {}),
          ...(u.protocol === "https:" ? { ca: this.cfg.tlsCertPem, rejectUnauthorized: true } : {}),
        },
        (res) => {
          const lines: unknown[] = [];
          let buf = "";
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({ status: res.statusCode ?? 0, lines });
          };
          res.setEncoding("utf8");
          let total = 0; const cap = this.cfg.maxResponseBytes ?? 1_048_576;
          res.on("data", (chunk: string) => {
            total += chunk.length;
            if (total > cap) { req.destroy(new Error("response too large")); return; }
            buf += chunk;
            let idx: number;
            while ((idx = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
              if (line) {
                try { lines.push(JSON.parse(line)); } catch { /* ignore partial garbage */ }
              }
              if (opts.mode === "first" && lines.length > 0) {
                req.destroy();
                finish();
                return;
              }
            }
          });
          res.on("end", () => {
            const rest = buf.trim();
            if (rest) {
              try { lines.push(JSON.parse(rest)); } catch { /* ignore */ }
            }
            finish();
          });
          res.on("error", (e) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(new OutcomeUnknownError(`response stream error: ${(e as Error).message}`, e));
          });
          res.on("aborted", () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(new OutcomeUnknownError("response aborted by peer"));
          });
        },
      );
      const timer = setTimeout(() => {
        req.destroy();
        reject(new OutcomeUnknownError(`timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
      req.on("socket", () => { /* connected or connecting */ });
      req.on("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (e.code && NOT_SENT_CODES.has(e.code) && !wroteBytes) reject(new NotSentError(`could not reach wallet: ${e.code}`, e));
        else reject(new OutcomeUnknownError(`transport error: ${e.code ?? e.message}`, e));
      });
      if (payload) {
        req.write(payload, () => { wroteBytes = true; });
      }
      req.end();
    });
  }

  private errOf(raw: Raw): { code?: number; message: string } {
    const first = raw.lines[0] as { code?: number; message?: string; error?: { code?: number; message?: string } } | undefined;
    const e = first?.error ?? first;
    return { code: e?.code, message: e?.message ?? `HTTP ${raw.status}` };
  }

  async getInfo(): Promise<WalletInfo> {
    const raw = await this.request("GET", "/v1/getinfo", undefined, { timeoutMs: 8000 });
    if (raw.status !== 200) {
      const e = this.errOf(raw);
      if (raw.status === 401 || raw.status === 403 || e.code === 2 || e.code === 7) throw new InsufficientPermissionsError(`wallet rejected credentials: ${e.message}`);
      throw new OutcomeUnknownError(`getinfo failed: ${e.message}`);
    }
    const r = raw.lines[0] as { identity_pubkey: string; alias?: string; version?: string; synced_to_chain?: boolean; chains?: Array<{ chain: string; network: string }> };
    const net = r.chains?.find((c) => c.chain === "bitcoin")?.network;
    const network: Network = net === "mainnet" ? "mainnet" : net === "testnet" ? "testnet" : net === "signet" ? "signet" : net === "regtest" ? "regtest" : "mainnet";
    // Unknown network strings are treated as mainnet (the most restrictive for policy) rather than silently trusted.
    return { kind: "lnd", network, nodePubkey: r.identity_pubkey, alias: r.alias ?? null, version: r.version ?? null, syncedToChain: r.synced_to_chain ?? null };
  }

  async discoverCapabilities(): Promise<Capabilities> {
    const notes: string[] = [];
    let canReadInfo: boolean | "unknown" = "unknown";
    try {
      await this.getInfo();
      canReadInfo = true;
    } catch (e) {
      canReadInfo = false;
      notes.push(`Cannot read wallet info: ${(e as Error).message}`);
    }
    // Discover what THIS credential may do by probing authorization, never by assuming. (LND's CheckMacaroonPermissions RPC needs macaroon:read,
    // which a least-privilege credential correctly lacks — observed on a real node — so it cannot be used.) LND checks authorization BEFORE
    // validating a request, so a call with a deliberately invalid payload distinguishes "not allowed" from "allowed but invalid" with no side effect.
    const denied = (raw: Raw) => /permission denied|invalid macaroon|verification failed|expected macaroon/i.test(this.errOf(raw).message) || raw.status === 401 || raw.status === 403;
    const probe = async (method: "GET" | "POST", path: string, body?: unknown): Promise<boolean | "unknown"> => {
      try {
        const raw = await this.request(method, path, body, { timeoutMs: 8000 });
        if (denied(raw)) return false;
        return raw.status === 200 || raw.status === 400 || raw.status === 500 || raw.status === 404 ? true : "unknown";
      } catch { return "unknown"; }
    };
    // offchain:write — SendPaymentSync with an invalid payment request can never pay anything
    const write = await probe("POST", "/v1/channels/transactions", { payment_request: "lnbcrt1invalid-orynt-permission-probe" });
    // offchain:read — list at most one payment
    const read = await probe("GET", "/v1/payments?max_payments=1");
    if (write === false) notes.push("This credential cannot send payments (missing offchain:write).");
    if (read === false) notes.push("This credential cannot look up payments (missing offchain:read) — Orynt could not reconcile an uncertain payment.");
    if (write === "unknown" || read === "unknown") notes.push("Permission check was inconclusive; Orynt will find out on first use and fail closed.");
    return { canSendPayments: write, canLookupPayments: read, canReadInfo, notes, discoveredAt: new Date().toISOString() };
  }

  private toRecord(p: Record<string, unknown>, hash: string): PaymentRecord {
    const st = String(p["status"] ?? "");
    const observedAt = new Date().toISOString();
    const base = { paymentHash: hash, observedAt, providerRef: p["payment_index"] !== undefined ? String(p["payment_index"]) : undefined };
    if (st === "SUCCEEDED") {
      const settledNs = typeof p["creation_time_ns"] === "string" ? BigInt(p["creation_time_ns"] as string) : undefined;
      const resolved = (p["htlcs"] as Array<{ resolve_time_ns?: string; status?: string }> | undefined)?.filter((h) => h.status === "SUCCEEDED").map((h) => BigInt(h.resolve_time_ns ?? "0"));
      const ns = resolved && resolved.length ? resolved[resolved.length - 1] : settledNs;
      return {
        ...base, status: "SUCCEEDED", preimage: String(p["payment_preimage"] ?? ""),
        amountMsat: msatOf(p["value_msat"]), feeMsat: msatOf(p["fee_msat"]),
        settledAt: ns ? new Date(Number(ns / 1_000_000n)).toISOString() : observedAt,
      };
    }
    if (st === "FAILED") return { ...base, status: "FAILED", failureReason: String(p["failure_reason"] ?? "FAILURE_REASON_UNKNOWN") };
    if (st === "IN_FLIGHT" || st === "INITIATED") return { ...base, status: "IN_FLIGHT" };
    throw new OutcomeUnknownError(`unrecognised payment status "${st}"`);
  }

  async sendPayment(req: SendRequest): Promise<PaymentRecord> {
    const body: Record<string, unknown> = {
      payment_request: req.invoice,
      timeout_seconds: req.timeoutSeconds,
      fee_limit_msat: req.feeLimitMsat.toString(),
      no_inflight_updates: true,
      // Keep a single path per payment: never let LND split across attempts we cannot account for.
      max_parts: 1,
    };
    // For zero-amount invoices the amount must be given explicitly; otherwise LND forbids it.
    if (req.zeroAmountInvoice) body["amt_msat"] = req.amountMsat.toString();
    const raw = await this.request("POST", "/v2/router/send", body, { timeoutMs: (req.timeoutSeconds + 15) * 1000 });
    const first = raw.lines[0] as { result?: Record<string, unknown>; error?: { code?: number; message?: string } } | undefined;
    if (raw.status !== 200 || first?.error) {
      const e = this.errOf(raw);
      const msg = e.message.toLowerCase();
      if (msg.includes("already paid") || msg.includes("in transition") || msg.includes("already exists") || e.code === 6) throw new AlreadyExistsError(e.message);
      if (raw.status === 401 || raw.status === 403 || msg.includes("permission denied") || msg.includes("invalid macaroon")) throw new InsufficientPermissionsError(e.message);
      // Synchronous validation errors (bad invoice, wrong network, amount rules) are rejected before a payment is created.
      if (raw.status === 400 || raw.status === 404 || e.code === 3) throw new NotSentError(`wallet rejected the request: ${e.message}`);
      throw new OutcomeUnknownError(`send returned error: ${e.message}`);
    }
    if (!first?.result) throw new OutcomeUnknownError("send returned no result");
    return this.toRecord(first.result, req.paymentHash);
  }

  async lookupPayment(paymentHash: string): Promise<PaymentRecord> {
    if (!/^[0-9a-f]{64}$/.test(paymentHash)) throw new Error("payment hash must be 32 bytes hex");
    // TrackPaymentV2 returns the current state first; we read one message and hang up.
    const raw = await this.request("GET", `/v2/router/track/${b64urlPadded(paymentHash)}`, undefined, { timeoutMs: 10000, mode: "first" });
    const first = raw.lines[0] as { result?: Record<string, unknown>; error?: { code?: number; message?: string } } | undefined;
    if (raw.status === 200 && first?.result) return this.toRecord(first.result, paymentHash);
    const e = this.errOf(raw);
    const msg = e.message.toLowerCase();
    // Absence is authoritative ONLY for LND's own payment messages. A bare "Not Found" (grpc code 5 / HTTP 404) is also what a proxy or an unregistered route answers,
    // and "not found" must never be read as "never sent": that would let confirm-not-sent open the door to a second payment. Anything else is an unknown outcome.
    if (msg.includes("payment isn't initiated") || msg.includes("payment not found") || msg.includes("unknown payment")) {
      return { status: "NOT_FOUND", paymentHash, observedAt: new Date().toISOString() };
    }
    if (raw.status === 401 || raw.status === 403 || msg.includes("permission denied")) throw new InsufficientPermissionsError(e.message);
    throw new OutcomeUnknownError(`lookup failed: ${e.message}`);
  }
}
