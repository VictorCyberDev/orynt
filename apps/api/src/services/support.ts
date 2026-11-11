import { randomBytes } from "node:crypto";
import { OryntError } from "@orynt/core";
import { withTx } from "../db/pool";
import type { Principal } from "./auth";
import type { Deps } from "./context";
import { effectivePlan } from "./entitlements";
import { queueMail } from "./mail";

/** Support tickets carry SAFE diagnostics only (ids, plan, role, wallet kinds). Credentials, keys and invoices are never collected. */
export async function createTicket(
  d: Deps,
  p: Principal | null,
  i: { email?: string; category: string; subject: string; body: string },
  reqId: string,
) {
  const ref = "SUP-" + randomBytes(4).toString("hex").toUpperCase();
  let email = i.email ?? "";
  let diagnostics: Record<string, unknown> = { request_id: reqId };
  if (p) {
    email =
      (await d.pool.query("SELECT email FROM users WHERE id=$1", [p.actor.userId])).rows[0]?.email ?? email;
    const eff = await effectivePlan(d, p.orgId);
    const wallets = (
      await d.pool.query(
        "SELECT provider_kind, network, last_health_ok FROM wallet_connections WHERE org_id=$1 AND status<>'disabled'",
        [p.orgId],
      )
    ).rows;
    const unresolved = Number(
      (
        await d.pool.query(
          "SELECT count(*)::int AS n FROM payout_obligations WHERE org_id=$1 AND state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING')",
          [p.orgId],
        )
      ).rows[0].n,
    );
    diagnostics = {
      request_id: reqId,
      role: p.role,
      plan: eff.plan_id,
      billing_status: eff.status,
      wallets,
      unresolved_payments: unresolved,
    };
  }
  if (!email) throw new OryntError("validation_failed", 422, "An email address is required so we can reply.");
  await withTx(d.pool, async (tx) => {
    await tx.query(
      "INSERT INTO support_tickets(reference,org_id,user_id,email,category,subject,body,diagnostics) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        ref,
        p?.orgId ?? null,
        p?.actor.userId ?? null,
        email,
        i.category,
        i.subject,
        i.body,
        JSON.stringify(diagnostics),
      ],
    );
    await queueMail(
      tx,
      email,
      "support_ack",
      `We received your request ${ref}`,
      `Thanks — we've logged your request as ${ref}. Quote this reference in any follow-up. We never ask for wallet credentials, seed phrases or private keys; do not send them.`,
      p?.orgId ?? null,
    );
  });
  return { reference: ref };
}
export const listTickets = async (d: Deps, orgId: string) =>
  (
    await d.pool.query(
      "SELECT reference, category, subject, status, created_at FROM support_tickets WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50",
      [orgId],
    )
  ).rows;

export async function getTicket(d: Deps, orgId: string, ref: string) {
  const t = (
    await d.pool.query(
      "SELECT id, reference, category, subject, body, status, created_at FROM support_tickets WHERE reference=$1 AND org_id=$2",
      [ref, orgId],
    )
  ).rows[0];
  if (!t) throw new OryntError("not_found", 404, "Request not found.");
  const messages = (
    await d.pool.query(
      "SELECT m.author, m.body, m.created_at FROM support_messages m WHERE m.ticket_id=$1 ORDER BY m.created_at",
      [t.id],
    )
  ).rows;
  return {
    reference: t.reference,
    category: t.category,
    subject: t.subject,
    body: t.body,
    status: t.status,
    created_at: new Date(t.created_at).toISOString(),
    messages: messages.map((m) => ({
      author: m.author === "staff" ? "Orynt support" : "You",
      body: m.body,
      at: new Date(m.created_at).toISOString(),
    })),
  };
}
