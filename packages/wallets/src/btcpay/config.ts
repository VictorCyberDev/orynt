import type { Network } from "@orynt/core";

/** Thrown for an unusable configuration or a store that is not set up for Lightning. Never a payment outcome. */
export class BtcpayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtcpayConfigurationError";
  }
}

export interface BtcpayConfig {
  /** Origin (and optional root path) of the BTCPay Server, e.g. https://btcpay.example.com or https://host/btcpay. */
  baseUrl: string;
  /** Greenfield API key, sent as `Authorization: token <key>`. A secret: never logged, never in errors. */
  apiKey: string;
  /** The store whose Lightning node pays. */
  storeId: string;
  /**
   * The Bitcoin network of the BTCPay instance, DECLARED by the operator. The Greenfield API exposes no network
   * field. Cross-checked locally on every send (BOLT11 prefix) and by BTCPay itself (it rejects a BOLT11 of another
   * network with HTTP 422). Verified for real only with `verifyNetworkWithInvoiceProbe`.
   */
  network: Network;
  /** Bitcoin only. Defaults to "BTC". */
  cryptoCode?: "BTC";
  /** Injectable for tests and for an API layer that pins DNS to a vetted address. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Allow plain http, and only for loopback hosts (local development and tests). Default false. */
  allowInsecureLoopback?: boolean;
  /**
   * The operator attests that the store's Lightning backend answers `payment-not-found` ONLY when it has no record of
   * the payment (true for LND, Core Lightning and Eclair; NOT true for Phoenixd, whose adapter maps every API error
   * to "not found"). BTCPay does not reveal the backend. Default false: an absent payment is then reported as an
   * UNKNOWN outcome, never as NOT_FOUND, because Orynt's `confirm-not-sent` path may turn NOT_FOUND into a retry.
   */
  trustAbsenceOfPayment?: boolean;
  /** Look the payment hash up before sending, and return an existing Pending/Complete payment instead of paying again. Default true. */
  preSendDuplicateCheck?: boolean;
  /** getInfo creates a tiny, short-lived invoice on the store's node to learn the real network. Side effect on the node; default false. */
  verifyNetworkWithInvoiceProbe?: boolean;
  /** Report `canSendPayments=false` when the key holds more than `canuselightningnode:<storeId>`. Default false (warn only). */
  requireLeastPrivilege?: boolean;
  /** Timeout for non-payment requests. Default 8000. */
  requestTimeoutMs?: number;
  /** Added to the send timeout to bound the HTTP request of a payment. Default 15000. */
  sendMarginMs?: number;
}

export interface ResolvedConfig {
  baseUrl: string;
  storeId: string;
  network: Network;
  cryptoCode: "BTC";
  fetchImpl: typeof fetch;
  trustAbsenceOfPayment: boolean;
  preSendDuplicateCheck: boolean;
  verifyNetworkWithInvoiceProbe: boolean;
  requireLeastPrivilege: boolean;
  requestTimeoutMs: number;
  sendMarginMs: number;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NETWORKS = new Set<string>(["mainnet", "testnet", "signet", "regtest"]);

/**
 * Syntactic URL validation only. DNS resolution and private-address (SSRF) vetting live in apps/api/src/lib/ssrf.ts,
 * which this package cannot import (apps depend on packages, not the reverse). The API layer MUST call
 * `vetWebhookTarget(baseUrl, allowPrivate)` before constructing a provider, exactly as it does for LND, and should
 * pass a DNS-pinned `fetch` so the vetted address is the one that is dialled.
 */
export function validateBaseUrl(raw: string, allowInsecureLoopback: boolean): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BtcpayConfigurationError("BTCPay base URL is not a valid URL.");
  }
  if (u.username || u.password) throw new BtcpayConfigurationError("BTCPay base URL must not contain credentials.");
  if (u.search || u.hash) throw new BtcpayConfigurationError("BTCPay base URL must not contain a query string or fragment.");
  if (!u.hostname) throw new BtcpayConfigurationError("BTCPay base URL has no host.");
  if (u.protocol === "https:") {
    // ok
  } else if (u.protocol === "http:") {
    if (!(allowInsecureLoopback && LOOPBACK.has(u.hostname))) {
      throw new BtcpayConfigurationError("BTCPay base URL must use https (plain http is accepted only for loopback with allowInsecureLoopback).");
    }
  } else {
    throw new BtcpayConfigurationError("BTCPay base URL must use https.");
  }
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
}

export function resolveConfig(cfg: BtcpayConfig): { resolved: ResolvedConfig; apiKey: string } {
  if (typeof cfg.apiKey !== "string" || cfg.apiKey.length < 8 || cfg.apiKey.length > 256 || !/^[\x21-\x7e]+$/.test(cfg.apiKey)) {
    throw new BtcpayConfigurationError("API key is missing or malformed.");
  }
  if (typeof cfg.storeId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(cfg.storeId)) {
    throw new BtcpayConfigurationError("Store id is missing or malformed.");
  }
  if (!NETWORKS.has(cfg.network)) throw new BtcpayConfigurationError("Network must be declared: mainnet, testnet, signet or regtest.");
  const cryptoCode = cfg.cryptoCode ?? "BTC";
  if (cryptoCode !== "BTC") throw new BtcpayConfigurationError("Only BTC is supported.");
  const fetchImpl = cfg.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new BtcpayConfigurationError("No fetch implementation available.");
  const positive = (v: number | undefined, d: number, name: string): number => {
    const n = v ?? d;
    if (!Number.isInteger(n) || n < 1 || n > 600_000) throw new BtcpayConfigurationError(`${name} must be an integer between 1 and 600000.`);
    return n;
  };
  return {
    apiKey: cfg.apiKey,
    resolved: {
      baseUrl: validateBaseUrl(cfg.baseUrl, cfg.allowInsecureLoopback ?? false),
      storeId: cfg.storeId,
      network: cfg.network,
      cryptoCode,
      fetchImpl,
      trustAbsenceOfPayment: cfg.trustAbsenceOfPayment ?? false,
      preSendDuplicateCheck: cfg.preSendDuplicateCheck ?? true,
      verifyNetworkWithInvoiceProbe: cfg.verifyNetworkWithInvoiceProbe ?? false,
      requireLeastPrivilege: cfg.requireLeastPrivilege ?? false,
      requestTimeoutMs: positive(cfg.requestTimeoutMs, 8000, "requestTimeoutMs"),
      sendMarginMs: positive(cfg.sendMarginMs, 15000, "sendMarginMs"),
    },
  };
}
