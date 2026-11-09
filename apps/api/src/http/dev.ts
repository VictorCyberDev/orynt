/** Dev/test-only routes. Registered ONLY when ORYNT_FAILPOINTS=1 (refused in production by config). */
import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { encodeInvoice, nodePubkeyFromPrivate, sha256Hex, hexToBytes, hasPermission } from "@orynt/core";
import { arm, disarmAll, listArmed } from "../lib/failpoints";
import type { Deps } from "../services/context";
import type { Principal } from "../services/auth";
import { simulatorFor } from "../services/providers";
import { callbackSecretFor } from "./callbacks";

const SIM_NODE_KEY = "a1".repeat(32);

export function registerDevRoutes(app: FastifyInstance, d: Deps, authenticate: (r: FastifyRequest) => Promise<Principal | null>, problem: (...a: any[]) => any) {
  const guard = async (req: FastifyRequest, reply: any): Promise<Principal | null> => {
    const p = await authenticate(req);
    if (!p || !hasPermission(p.role, "connection:manage")) { problem(reply, req, 403, "forbidden", "Dev routes require connection:manage."); return null; }
    return p;
  };
  app.get("/v1/dev/failpoints", async (req, reply) => { if (!(await guard(req, reply))) return; return { armed: listArmed() }; });
  app.post("/v1/dev/failpoints", async (req, reply) => {
    if (!(await guard(req, reply))) return;
    const b = z.object({ name: z.string(), action: z.enum(["throw", "exit", "delay"]).default("throw"), ms: z.number().optional() }).parse(req.body);
    arm(b.name, b.action, b.ms);
    return { armed: listArmed() };
  });
  app.delete("/v1/dev/failpoints", async (req, reply) => { if (!(await guard(req, reply))) return; disarmAll(); return { armed: [] }; });

  // Mint a validly-signed invoice whose preimage the SIMULATOR knows. Clearly simulated: signed by a fixed fake node key.
  app.post("/v1/dev/simulator/:connectionId/invoice", async (req, reply) => {
    const p = await guard(req, reply); if (!p) return;
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
    const b = z.object({ amount_msat: z.string().regex(/^[1-9][0-9]*$/), behavior: z.enum(["succeed", "fail_no_route", "pending_then_succeed", "accept_then_lose_response", "not_sent_unreachable", "error_then_no_record"]).default("succeed"), expiry_seconds: z.number().int().min(1).max(86400).default(3600), description: z.string().default("simulated invoice") }).parse(req.body);
    const conn = (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1 AND org_id=$2 AND provider_kind='simulator'", [connectionId, p.orgId])).rows[0];
    if (!conn) return problem(reply, req, 404, "not_found", "No such simulator connection.");
    const preimage = randomBytes(32).toString("hex");
    const sim = simulatorFor(connectionId, conn.network);
    const hash = sim.register(preimage, b.behavior);
    const invoice = encodeInvoice({ network: conn.network, amountMsat: BigInt(b.amount_msat), paymentHashHex: hash, paymentSecretHex: randomBytes(32).toString("hex"), description: b.description, timestamp: Math.floor(Date.now() / 1000), expirySeconds: b.expiry_seconds, privateKeyHex: SIM_NODE_KEY });
    return { invoice, payment_hash: hash, payee_pubkey: nodePubkeyFromPrivate(SIM_NODE_KEY), simulated: true };
  });
  app.post("/v1/dev/simulator/:connectionId/behavior", async (req, reply) => {
    const p = await guard(req, reply); if (!p) return;
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
    const b = z.object({ payment_hash: z.string().regex(/^[0-9a-f]{64}$/), behavior: z.enum(["succeed", "fail_no_route", "pending_then_succeed", "accept_then_lose_response", "not_sent_unreachable", "error_then_no_record"]) }).parse(req.body);
    simulatorFor(connectionId).setBehavior(b.payment_hash, b.behavior);
    return { ok: true };
  });
  app.get("/v1/dev/callback-secret/:connectionId", async (req, reply) => {
    const p = await guard(req, reply); if (!p) return;
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
    return { secret: callbackSecretFor(d, connectionId) };
  });
  void sha256Hex; void hexToBytes;
}
