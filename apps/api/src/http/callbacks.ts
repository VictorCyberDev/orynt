import { hmacSha256Hex, timingSafeEqualStr } from "@orynt/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { inc } from "../lib/metrics";
import type { Deps } from "../services/context";
import { reconcileObligation, systemCtx } from "../services/reconcile";

export const callbackSecretFor = (d: Deps, connectionId: string) => hmacSha256Hex(d.config.secretKey, `provider-callback:${connectionId}`);

/**
 * Inbound provider callbacks are HINTS. They are HMAC-authenticated, deduplicated by (connection, event id), and can only cause a lookup of the wallet's
 * authoritative record — a callback that says "settled" never settles anything by itself.
 */
export function registerProviderCallbacks(app: FastifyInstance, d: Deps, problem: (...a: any[]) => any) {
  app.post("/v1/provider-events/:connectionId", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { connectionId } = z.object({ connectionId: z.string().uuid() }).parse(req.params);
    const sig = String(req.headers["orynt-signature"] ?? "");
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig);
    const raw = JSON.stringify(req.body ?? {});
    const conn = (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [connectionId])).rows[0];
    if (!conn || !m) return problem(reply, req, 401, "unauthenticated", "Invalid signature.");
    if (Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return problem(reply, req, 401, "unauthenticated", "Stale signature timestamp.");
    if (!timingSafeEqualStr(hmacSha256Hex(callbackSecretFor(d, connectionId), `${m[1]}.${raw}`), m[2]!)) return problem(reply, req, 401, "unauthenticated", "Invalid signature.");
    const body = z.object({ event_id: z.string().min(1).max(120), payment_hash: z.string().regex(/^[0-9a-f]{64}$/).optional(), type: z.string().max(60).default("payment") }).passthrough().parse(req.body);
    const ins = await d.pool.query("INSERT INTO provider_events(org_id,wallet_connection_id,event_id,payload) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id", [conn.org_id, connectionId, body.event_id, JSON.stringify(body)]);
    if (!ins.rowCount) { inc("orynt_provider_events_total", { result: "duplicate" }); return reply.send({ ok: true, duplicate: true }); }
    let result = "ignored";
    if (body.payment_hash) {
      const o = (await d.pool.query("SELECT o.id FROM payment_intents pi JOIN payout_obligations o ON o.id=pi.obligation_id WHERE pi.org_id=$1 AND pi.payment_hash=$2 AND pi.wallet_connection_id=$3", [conn.org_id, body.payment_hash, connectionId])).rows[0];
      if (o) result = "reconcile:" + (await reconcileObligation(d, systemCtx(conn.org_id, "provider-callback"), o.id, "callback"));
    }
    await d.pool.query("UPDATE provider_events SET processed_at=now(), result=$2 WHERE id=$1", [ins.rows[0].id, result]);
    inc("orynt_provider_events_total", { result: "processed" });
    return reply.send({ ok: true, duplicate: false, result });
  });
}
