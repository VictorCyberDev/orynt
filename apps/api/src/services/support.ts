import { randomBytes } from "node:crypto";
import { OryntError } from "@orynt/core";
import { withTx } from "../db/pool";
import type { Principal } from "./auth";
import type { Deps } from "./context";
import { effectivePlan } from "./entitlements";
import { queueMail } from "./mail";

/** Support tickets carry SAFE diagnostics only (ids, plan, role, wallet kinds). Credentials, keys and invoices are never collected. */
export async function createTicket(d: Deps, p: Principal | null, i: { email?: string; category: string; subject: string; body: string }, reqId: string) {
  const ref = "SUP-" + randomBytes(4).toString("hex").toUpperCase();
  let email = i.email ?? ""; let diagnostics: Record<string, unknown> = { request_id: reqId };
  if (p) {
    email = (await d.pool.query("SELECT email FROM users WHERE id=$1", [p.actor.userId])).rows[0]?.email ?? email;
    const eff = await effectivePlan(d, p.orgId);
    const wallets = (await d.pool.query("SELECT provider_kind, network, last_health_ok FROM wallet_connections WHERE org_id=$1 AND status<>'disabled'", [p.orgId])).rows;
    const unresolved = Number((await d.pool.query("SELECT count(*)::int AS n FROM payout_obligations WHERE org_id=$1 AND state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING')", [p.orgId])).rows[0].n);
    diagnostics = { request_id: reqId, role: p.role, plan: eff.plan_id, billing_status: eff.status, wallets, unresolved_payments: unresolved };
  }
  if (!email) throw new OryntError("validation_failed", 422, "An email address is required so we can reply.");
  await withTx(d.pool, async (tx) => {
    await tx.query("INSERT INTO support_tickets(reference,org_id,user_id,email,category,subject,body,diagnostics) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [ref, p?.orgId ?? null, p?.actor.userId ?? null, email, i.category, i.subject, i.body, JSON.stringify(diagnostics)]);
    await queueMail(tx, email, "support_ack", `We received your request ${ref}`, `Thanks — we've logged your request as ${ref}. Quote this reference in any follow-up. We never ask for wallet credentials, seed phrases or private keys; do not send them.`, p?.orgId ?? null);
  });
  return { reference: ref };
}
export const listTickets = async (d: Deps, orgId: string) => (await d.pool.query("SELECT reference, category, subject, status, created_at FROM support_tickets WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50", [orgId])).rows;
