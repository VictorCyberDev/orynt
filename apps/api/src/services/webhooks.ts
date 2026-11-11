import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { hmacSha256Hex } from "@orynt/core";
import type { Tx } from "../db/pool";
import { open, seal } from "../lib/box";
import { vetWebhookTarget } from "../lib/ssrf";
import { inc } from "../lib/metrics";
import type { Deps } from "./context";

export const EVENT_TYPES = [
  "obligation.submitted",
  "obligation.approved",
  "obligation.rejected",
  "obligation.cancelled",
  "payment.dispatching",
  "payment.pending",
  "payment.unknown",
  "payment.settled",
  "payment.failed",
  "incident.opened",
  "incident.resolved",
] as const;

/** Transactional outbox: the delivery row commits with the state change that caused it. */
export async function emitEvent(
  tx: Tx,
  orgId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const eps = (
    await tx.query(
      "SELECT id FROM webhook_endpoints WHERE org_id=$1 AND status='active' AND ($2 = ANY(events) OR '*' = ANY(events))",
      [orgId, type],
    )
  ).rows;
  const eventId = randomUUID();
  const payload = {
    id: eventId,
    type,
    created_at: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
  };
  for (const e of eps)
    await tx.query(
      "INSERT INTO webhook_deliveries(endpoint_id,event_id,event_type,payload) VALUES ($1,$2,$3,$4)",
      [e.id, eventId, type, JSON.stringify(payload)],
    );
}

export function newSigningSecret(): string {
  return "whsec_" + randomBytes(24).toString("hex");
}
export function sealSecret(d: Deps, endpointId: string, secret: string) {
  return seal(d.config.secretKey, secret, "webhook:" + endpointId);
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

const BACKOFF_S = [5, 30, 120, 600, 3600, 6 * 3600];

/** POST with a HARD overall deadline (a socket idle timeout is not a deadline: a slow-drip receiver could otherwise hold us forever). */
async function post(
  url: URL,
  address: string,
  family: 4 | 6,
  headers: Record<string, string>,
  body: string,
): Promise<number> {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => req.destroy(new Error("delivery deadline exceeded (10s)")), 10_000);
    const req = lib.request(
      {
        method: "POST",
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port,
        path: url.pathname + url.search,
        headers: { ...headers, "content-length": Buffer.byteLength(body) },
        // pin the connection to the address we vetted (defeats DNS rebinding between check and use)
        lookup: (_h, _o, cb) => (cb as (e: null, a: string, f: number) => void)(null, address, family),
      },
      (res) => {
        clearTimeout(deadline);
        const code = res.statusCode ?? 0;
        res.destroy();
        resolve(code); // the status is all we need; never read the body
      },
    );
    req.on("error", (e) => {
      clearTimeout(deadline);
      reject(e);
    });
    req.end(body);
  });
}

/** Delivers due webhooks. Safe to run concurrently (SKIP LOCKED). Receivers dedupe on the event id header. */
export async function pumpWebhooks(d: Deps, limit = 20): Promise<number> {
  const c = await d.pool.connect();
  let n = 0;
  try {
    await c.query("BEGIN");
    const due = (
      await c.query(
        `SELECT wd.*, we.url, we.secret_ciphertext, we.id AS eid FROM webhook_deliveries wd JOIN webhook_endpoints we ON we.id = wd.endpoint_id
       WHERE wd.status='pending' AND wd.next_attempt_at <= now() ORDER BY wd.next_attempt_at LIMIT $1 FOR UPDATE OF wd SKIP LOCKED`,
        [limit],
      )
    ).rows;
    await Promise.all(
      due.map(async (w) => {
        const body = JSON.stringify(w.payload);
        const ts = Math.floor(Date.now() / 1000);
        let code = 0,
          err: string | null = null;
        try {
          const secret = open(d.config.secretKey, w.secret_ciphertext, "webhook:" + w.eid);
          const vet = await vetWebhookTarget(w.url, d.config.allowPrivateWebhookTargets);
          code = await post(
            vet.url,
            vet.address,
            vet.family,
            {
              "content-type": "application/json",
              "orynt-event-id": w.event_id,
              "orynt-event-type": w.event_type,
              "orynt-delivery-attempt": String(w.attempt + 1),
              "orynt-signature": signPayload(secret, ts, body),
            },
            body,
          );
        } catch (e) {
          err = (e as Error).message;
        }
        const ok = code >= 200 && code < 300;
        const attempt = w.attempt + 1;
        const dead = !ok && attempt >= BACKOFF_S.length + 1;
        await c.query(
          `UPDATE webhook_deliveries SET attempt=$2, last_status_code=$3, last_error=$4, status=$5, delivered_at=$6, next_attempt_at = now() + ($7 || ' seconds')::interval WHERE id=$1`,
          [
            w.id,
            attempt,
            code || null,
            ok ? null : (err ?? `HTTP ${code}`),
            ok ? "delivered" : dead ? "dead" : "pending",
            ok ? new Date() : null,
            String(BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)]),
          ],
        );
        inc("orynt_webhook_deliveries_total", { result: ok ? "ok" : "error" });
        n++;
      }),
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return n;
}
