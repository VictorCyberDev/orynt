/**
 * A FAKE BTCPay Server (Greenfield API, store-level Lightning endpoints) on loopback.
 *
 * It is built from BTCPay's published API description and from reading the controller source
 * (BTCPayServer/Controllers/GreenField/GreenfieldLightningNodeApiController*.cs, BTCPayServer.Lightning LndClient.cs).
 * Every behaviour below is traceable to one of those two places; none was recorded from a real server, so tests that
 * use it are CONTRACT TESTS of this repository's adapter against the documentation, not proof about any real BTCPay.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Socket } from "node:net";
import {
  decodeInvoice,
  encodeInvoice,
  nodePubkeyFromPrivate,
  sha256Hex,
  hexToBytes,
  type Network,
} from "@orynt/core";
import swagger from "./btcpay-swagger-excerpt.json";

export const PAYEE_KEY = "e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734";
export const NODE_KEY = "2222222222222222222222222222222222222222222222222222222222222222";
export const NODE_PUBKEY = nodePubkeyFromPrivate(NODE_KEY);
export const STORE_ID = "HoJUKTcAUTjXWfwSyYDqtULBXZSsRQoFEwUhmDEjwzpy";
export const GOOD_KEY = "k_good_0123456789abcdef0123456789abcdef";

export function makeInvoice(o: {
  network: Network;
  amountMsat: bigint | null;
  preimage: string;
  expirySeconds?: number;
}) {
  const paymentHash = sha256Hex(hexToBytes(o.preimage));
  const invoice = encodeInvoice({
    network: o.network,
    amountMsat: o.amountMsat,
    paymentHashHex: paymentHash,
    paymentSecretHex: "11".repeat(32),
    description: "contract-test",
    timestamp: Math.floor(Date.now() / 1000),
    expirySeconds: o.expirySeconds ?? 3600,
    privateKeyHex: PAYEE_KEY,
  });
  return { invoice, paymentHash, preimage: o.preimage };
}

export type PayBehavior =
  | "ok" // 200 Complete with preimage/fee/total
  | "ok_already_paid" // LndClient: "invoice is already paid" => PayResult.Ok without details; controller finds the payment => 200
  | "ok_response_without_preimage" // 200 Complete, preimage absent in the pay response but present in GET payment
  | "pending" // 202 Pending
  | "unknown_202" // 202 {status:"Unknown"} with no hash, payment recorded Pending
  | "no_route" // 400 could-not-find-route, record Failed
  | "generic_error_failed" // 400 generic-error, record Failed
  | "generic_error_no_record" // 400 generic-error, nothing recorded
  | "generic_error_but_paid" // 400 generic-error although the node did pay
  | "node_unavailable_after_start" // payment recorded Complete, response 503 lightning-node-unavailable
  | "lost_response_hang" // payment recorded Complete, response never sent
  | "lost_response_reset" // payment recorded Complete, socket destroyed
  | "garbage_200" // payment recorded Complete, body not JSON
  | "redirect" // 302 to another path
  | "http_500" // 500 empty body
  | "http_502"; // 502 from a proxy

export interface FakePayment {
  status: "Complete" | "Failed" | "Pending";
  preimage?: string;
  totalMsat?: number;
  feeMsat?: number;
}

export interface Seen {
  method: string;
  path: string;
  auth: string | undefined;
  body: unknown;
}

const schemas = swagger.schemas as Record<string, { properties?: Record<string, unknown>; enum?: string[] }>;

export class FakeBtcpay {
  private server = http.createServer((req, res) => void this.handle(req, res));
  private sockets = new Set<Socket>();
  baseUrl = "";
  network: Network = "regtest";
  /** api key -> permission strings */
  keys = new Map<string, string[]>([[GOOD_KEY, [`btcpay.store.canuselightningnode:${STORE_ID}`]]]);
  lightningConfigured = true;
  nodeUnavailable = false;
  /** "absent" lookups answer 404 payment-not-found unless this is set (models an unreliable backend that errors instead) */
  lookupErrors = false;
  /** every lookup of an existing payment answers this HTTP status instead (e.g. 503) */
  lookupStatusOverride: number | null = null;
  numericAmounts = true;
  /** authorise every key regardless of its listed permissions (models a list that understates what the server allows) */
  permitEverything = false;
  payments = new Map<string, FakePayment>();
  behaviors = new Map<string, PayBehavior>();
  preimages = new Map<string, string>();
  seen: Seen[] = [];
  /** request bodies/responses that do not conform to the official swagger schemas */
  schemaViolations: string[] = [];
  /** number of POST .../invoices/pay requests whose BOLT11 parsed (i.e. that could really pay) */
  realPayCalls = 0;
  /** extra text echoed in 503 bodies to test redaction */
  echoInErrors = "";

  async start(): Promise<void> {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.server.on("connection", (s) => {
      this.sockets.add(s);
      s.on("close", () => this.sockets.delete(s));
    });
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  register(inv: { paymentHash: string; preimage: string }, behavior: PayBehavior) {
    this.preimages.set(inv.paymentHash, inv.preimage);
    this.behaviors.set(inv.paymentHash, behavior);
  }
  payCalls(): Seen[] {
    return this.seen.filter((s) => s.method === "POST" && s.path.endsWith("/invoices/pay"));
  }
  realPays(): Seen[] {
    return this.payCalls().filter((s) => this.parses(s.body));
  }

  private parses(body: unknown): boolean {
    const b = (body as { BOLT11?: string } | null)?.BOLT11;
    if (typeof b !== "string") return false;
    try {
      return decodeInvoice(b).network === this.network;
    } catch {
      return false;
    }
  }

  private permitted(perms: string[]): boolean {
    if (this.permitEverything) return true;
    return perms.some((p) => {
      const [policy, scope] = p.split(":");
      if (policy === "unrestricted") return scope === undefined;
      if (policy === "btcpay.store.canuselightningnode" || policy === "btcpay.store.canmodifystoresettings")
        return scope === undefined || scope === STORE_ID;
      return false;
    });
  }

  private checkSchema(name: string, value: Record<string, unknown>, where: string) {
    const props = schemas[name]?.properties ?? {};
    for (const k of Object.keys(value)) {
      if (!(k in props)) this.schemaViolations.push(`${where}: "${k}" is not a property of ${name}`);
    }
    const status = value["status"];
    if (
      name === "LightningPaymentData" &&
      typeof status === "string" &&
      !(schemas["LightningPaymentStatus"]?.enum ?? []).includes(status)
    ) {
      this.schemaViolations.push(`${where}: status "${status}" is not in LightningPaymentStatus`);
    }
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = undefined;
    }
    const path = req.url ?? "";
    this.seen.push({ method: req.method ?? "", path, auth: req.headers.authorization, body });

    const send = (status: number, json?: unknown, text?: string) => {
      res.writeHead(status, { "content-type": text !== undefined ? "text/plain" : "application/json" });
      res.end(text !== undefined ? text : json === undefined ? "" : JSON.stringify(json));
    };

    // ---- authentication (key present and known) -------------------------------------------------------------------
    const m = /^token (.+)$/.exec(req.headers.authorization ?? "");
    const perms = m ? this.keys.get(m[1]!) : undefined;
    if (!perms) return send(401);

    if (req.method === "GET" && path === "/api/v1/api-keys/current") {
      // the real endpoint echoes the key itself (GreenfieldApiKeysController: data.Key = apiKey) — the adapter must never copy it
      const out = { id: "keyid123", apiKey: m![1], label: "contract-test key", permissions: perms };
      this.checkSchema("ApiKeyData", out, "GET api-keys/current");
      return send(200, out);
    }

    const base = `/api/v1/stores/${STORE_ID}/lightning/BTC`;
    if (!path.startsWith(base)) return send(404, { code: "store-not-found", message: "no such store" });
    // policy `canuselightningnode` guards info, payments/{hash} and invoices/pay alike (Store controller attributes)
    if (!this.permitted(perms)) {
      return send(403, {
        code: "missing-permission",
        message:
          'Insufficient API Permissions. Please use an API key with permission "btcpay.store.canuselightningnode".',
        missingPermission: "btcpay.store.canuselightningnode",
      });
    }
    // GetLightningClient runs first in every action
    if (!this.lightningConfigured)
      return send(404, { code: "lightning-not-configured", message: "The lightning node is not set up" });
    if (this.nodeUnavailable)
      return send(503, {
        code: "lightning-node-unavailable",
        message: `The lightning node is unavailable (HttpRequestException: connection refused ${this.echoInErrors})`,
      });

    if (req.method === "GET" && path === `${base}/info`) {
      const out = {
        nodeURIs: [`${NODE_PUBKEY}@127.0.0.1:9735`],
        blockHeight: 123,
        alias: "fake-btcpay-lightning",
        color: "#3399ff",
        version: "0.20.1-beta",
        peersCount: 1,
        activeChannelsCount: 1,
        inactiveChannelsCount: 0,
        pendingChannelsCount: 0,
      };
      this.checkSchema("LightningNodeInformationData", out, "GET info");
      return send(200, out);
    }

    if (req.method === "GET" && path.startsWith(`${base}/payments/`)) {
      const hash = path.slice(`${base}/payments/`.length);
      const p = this.payments.get(hash);
      if (this.lookupErrors)
        return send(503, {
          code: "lightning-node-unavailable",
          message: "The lightning node is unavailable (PhoenixdApiException)",
        });
      if (!p)
        return send(404, {
          code: "payment-not-found",
          message: "Impossible to find a lightning payment with this payment hash",
        });
      if (this.lookupStatusOverride)
        return send(this.lookupStatusOverride, {
          code: "lightning-node-unavailable",
          message: "The lightning node is unavailable (override)",
        });
      return send(200, this.paymentJson(hash, p));
    }

    if (req.method === "POST" && path === `${base}/invoices/pay`) return this.pay(body, send, res, req);
    if (req.method === "POST" && path === `${base}/invoices`) {
      // CreateInvoice: used only by the opt-in network probe
      const inv = makeInvoice({
        network: this.network,
        amountMsat: 1000n,
        preimage: "ab".repeat(32),
        expirySeconds: 60,
      });
      return send(200, {
        id: inv.paymentHash,
        status: "Unpaid",
        BOLT11: inv.invoice,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        amount: 1000,
        paymentHash: inv.paymentHash,
      });
    }
    return send(404);
  }

  private paymentJson(hash: string, p: FakePayment, withDetails = true): Record<string, unknown> {
    const num = (n: number) => (this.numericAmounts ? n : String(n));
    const out: Record<string, unknown> = {
      id: `pay-${hash.slice(0, 8)}`,
      status: p.status,
      paymentHash: hash,
      createdAt: 1_700_000_000,
    };
    if (withDetails && p.preimage) out["preimage"] = p.preimage;
    if (withDetails && p.totalMsat !== undefined) out["totalAmount"] = num(p.totalMsat);
    if (withDetails && p.feeMsat !== undefined) out["feeAmount"] = num(p.feeMsat);
    this.checkSchema("LightningPaymentData", out, "payment");
    return out;
  }

  private pay(
    body: unknown,
    send: (s: number, j?: unknown, t?: string) => void,
    res: http.ServerResponse,
    req: http.IncomingMessage,
  ) {
    const b = (body ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(b)) {
      if (!(k in (schemas["PayLightningInvoiceRequest"]?.properties ?? {})))
        this.schemaViolations.push(`pay request: "${k}" is not a property of PayLightningInvoiceRequest`);
    }
    // validation happens BEFORE any payment (controller: ModelState / CreateValidationError => 422)
    let decoded: ReturnType<typeof decodeInvoice> | null = null;
    try {
      decoded = decodeInvoice(String(b["BOLT11"]));
    } catch {
      decoded = null;
    }
    if (!decoded || decoded.network !== this.network) {
      return send(422, [{ path: "BOLT11", message: "The BOLT11 invoice was invalid." }]);
    }
    this.realPayCalls++;
    const hash = decoded.paymentHash;
    const behavior = this.behaviors.get(hash) ?? "ok";
    const preimage = this.preimages.get(hash) ?? "cd".repeat(32);
    const amountMsat = Number(decoded.amountMsat ?? BigInt(String(b["amount"] ?? "0")));
    const fee = 1000;
    const complete: FakePayment = { status: "Complete", preimage, totalMsat: amountMsat + fee, feeMsat: fee };
    const respondOk = (p: FakePayment, withDetails = true) =>
      send(200, { ...this.paymentJson(hash, p, withDetails), BOLT11: String(b["BOLT11"]) });
    switch (behavior) {
      case "ok":
        this.payments.set(hash, complete);
        return respondOk(complete);
      case "ok_already_paid":
        this.payments.set(hash, complete);
        return respondOk(complete);
      case "ok_response_without_preimage":
        this.payments.set(hash, complete);
        return send(200, { status: "Complete", paymentHash: hash, BOLT11: String(b["BOLT11"]) });
      case "pending":
        this.payments.set(hash, { status: "Pending" });
        return send(202, this.paymentJson(hash, { status: "Pending" }));
      case "unknown_202":
        this.payments.set(hash, { status: "Pending" });
        return send(202, { status: "Unknown" });
      case "no_route":
        this.payments.set(hash, { status: "Failed" });
        return send(400, { code: "could-not-find-route", message: "FAILURE_REASON_NO_ROUTE" });
      case "generic_error_failed":
        this.payments.set(hash, { status: "Failed" });
        return send(400, { code: "generic-error", message: "FAILURE_REASON_INCORRECT_PAYMENT_DETAILS" });
      case "generic_error_no_record":
        return send(400, { code: "generic-error", message: "The payment failed" });
      case "generic_error_but_paid":
        this.payments.set(hash, complete);
        return send(400, { code: "generic-error", message: "ambiguous error after the node paid" });
      case "node_unavailable_after_start":
        this.payments.set(hash, complete);
        return send(503, {
          code: "lightning-node-unavailable",
          message: `The lightning node is unavailable (OperationCanceledException: ${this.echoInErrors})`,
        });
      case "lost_response_hang":
        this.payments.set(hash, complete);
        return; // never answer
      case "lost_response_reset":
        this.payments.set(hash, complete);
        return void req.socket.destroy();
      case "garbage_200":
        this.payments.set(hash, complete);
        return send(200, undefined, "<html>proxy says ok</html>");
      case "redirect":
        res.writeHead(302, { location: "/elsewhere" });
        return void res.end();
      case "http_500":
        this.payments.set(hash, complete);
        return send(500);
      case "http_502":
        this.payments.set(hash, complete);
        return send(502, undefined, "bad gateway");
    }
  }
}
