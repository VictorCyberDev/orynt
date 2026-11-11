import { OryntError } from "@orynt/core";
import { withTx } from "../db/pool";
import { verifyPassword } from "../lib/password";
import { appendAudit } from "./audit";
import type { Principal } from "./auth";
import type { Ctx, Deps } from "./context";
import { notifySecurity } from "./notify";

const RETENTION_DAYS = 90;
const need = (p: Principal) => { if (p.actor.kind !== "user" || !p.actor.userId) throw new OryntError("forbidden", 403, "This action is for signed-in people, not API keys."); return p.actor.userId; };
const checkPassword = async (d: Deps, userId: string, password: string) => {
  const u = (await d.pool.query("SELECT password_hash FROM users WHERE id=$1", [userId])).rows[0];
  if (!u || !(await verifyPassword(password, u.password_hash))) throw new OryntError("unauthenticated", 401, "Password is incorrect.");
};

// ---- sessions -----------------------------------------------------------------------------------------------------------------------------
export async function listSessions(d: Deps, p: Principal) {
  const rows = (await d.pool.query("SELECT id, created_at, expires_at, user_agent FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC", [need(p)])).rows;
  return { data: rows.map((r) => ({ id: r.id, created_at: new Date(r.created_at).toISOString(), expires_at: new Date(r.expires_at).toISOString(), user_agent: (r.user_agent ?? "").slice(0, 160), current: r.id === p.sessionId })) };
}
export async function revokeSession(d: Deps, p: Principal, id: string) {
  const r = await d.pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id", [id, need(p)]);
  if (!r.rowCount) throw new OryntError("not_found", 404, "Session not found.");
}
export async function revokeOtherSessions(d: Deps, p: Principal) {
  const r = await d.pool.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND id IS DISTINCT FROM $2::uuid", [need(p), p.sessionId ?? null]);
  return r.rowCount ?? 0;
}

// ---- ownership transfer ---------------------------------------------------------------------------------------------------------------------
/** Atomic: the target becomes owner and the caller becomes admin. Requires the caller's password (and MFA step-up, enforced by the handler). The target must already be an active, e-mail-verified member. */
export async function transferOwnership(d: Deps, ctx: Ctx, p: Principal, targetUserId: string, password: string) {
  const me = need(p);
  if (p.role !== "owner") throw new OryntError("forbidden", 403, "Only an owner can transfer ownership.");
  if (targetUserId === me) throw new OryntError("validation_failed", 422, "Choose another member.");
  await checkPassword(d, me, password);
  const emails = await withTx(d.pool, async (tx) => {
    const t = (await tx.query("SELECT m.id, u.email, u.email_verified_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2 AND m.status='active' AND u.disabled_at IS NULL FOR UPDATE OF m", [ctx.orgId, targetUserId])).rows[0];
    if (!t) throw new OryntError("not_found", 404, "That person is not an active member.");
    if (!t.email_verified_at) throw new OryntError("invalid_state", 409, "The new owner must verify their e-mail address first.");
    await tx.query("UPDATE memberships SET role='owner' WHERE org_id=$1 AND user_id=$2", [ctx.orgId, targetUserId]);
    await tx.query("UPDATE memberships SET role='admin' WHERE org_id=$1 AND user_id=$2", [ctx.orgId, me]);
    await tx.query("UPDATE sessions SET revoked_at=now() WHERE org_id=$1 AND user_id IN ($2,$3) AND revoked_at IS NULL AND id IS DISTINCT FROM $4::uuid", [ctx.orgId, targetUserId, me, p.sessionId ?? null]); // roles changed: other sessions must sign in again
    await appendAudit(tx, ctx.orgId, "org", `user:${me}`, "org.ownership_transferred", `user:${targetUserId}`, { from: me, to: targetUserId });
    const mine = (await tx.query("SELECT email FROM users WHERE id=$1", [me])).rows[0].email as string;
    await notifySecurity(tx, t.email, "You are now an owner of an Orynt workspace.", ctx.orgId);
    await notifySecurity(tx, mine, "Ownership of your Orynt workspace was transferred; your role is now admin.", ctx.orgId);
    return { to: t.email, from: mine };
  });
  return { ok: true, new_owner: emails.to };
}

// ---- organisation closure ----------------------------------------------------------------------------------------------------------------------
/**
 * Closes the whole organisation. Refused while any payment's outcome is unknown or in flight (closing would hide an incident). Retains records for 90 days.
 * It stops Orynt from acting; it does NOT cancel a subscription at the billing provider (no live provider is commissioned) and does NOT move or touch any funds.
 */
export async function closeOrganisation(d: Deps, ctx: Ctx, p: Principal, input: { confirm_name: string; password: string }) {
  const me = need(p);
  if (p.role !== "owner") throw new OryntError("forbidden", 403, "Only an owner can close the organisation.");
  await checkPassword(d, me, input.password);
  await withTx(d.pool, async (tx) => {
    const org = (await tx.query("SELECT name, closed_at FROM organizations WHERE id=$1 FOR UPDATE", [ctx.orgId])).rows[0];
    if (org.closed_at) throw new OryntError("conflict", 409, "This organisation is already closed.");
    if (input.confirm_name.trim() !== org.name) throw new OryntError("validation_failed", 422, "Type the organisation's exact name to confirm.");
    const open = (await tx.query("SELECT count(*)::int AS n FROM payout_obligations WHERE org_id=$1 AND state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING','EXECUTION_RESERVED')", [ctx.orgId])).rows[0].n as number;
    if (open > 0) throw new OryntError("send_blocked_unresolved", 409, `${open} payment(s) have an unresolved outcome. Resolve them first: closing now would hide a payment that may have succeeded.`);
    await appendAudit(tx, ctx.orgId, "org", `user:${me}`, "org.closed", `org:${ctx.orgId}`, { retention_days: RETENTION_DAYS });
    await tx.query("UPDATE organizations SET closed_at=now(), closed_by=$2, retention_until=now() + ($3 || ' days')::interval WHERE id=$1", [ctx.orgId, me, String(RETENTION_DAYS)]);
    await tx.query("UPDATE sessions SET revoked_at=now() WHERE org_id=$1 AND revoked_at IS NULL", [ctx.orgId]);
    await tx.query("UPDATE api_keys SET revoked_at=now() WHERE org_id=$1 AND revoked_at IS NULL", [ctx.orgId]);
    await tx.query("UPDATE wallet_connections SET status='disabled' WHERE org_id=$1 AND status<>'disabled'", [ctx.orgId]);
    await tx.query("UPDATE recurring_schedules SET status='cancelled' WHERE org_id=$1 AND status<>'cancelled'", [ctx.orgId]);
    await tx.query("UPDATE webhook_endpoints SET status='disabled' WHERE org_id=$1", [ctx.orgId]);
    for (const e of (await tx.query("SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.status='active' AND m.role IN ('owner','admin')", [ctx.orgId])).rows)
      await notifySecurity(tx, e.email, `The workspace "${org.name.slice(0, 80)}" was closed. Records are kept for ${RETENTION_DAYS} days; contact support to request an export.`, ctx.orgId);
  });
  return { ok: true, retention_days: RETENTION_DAYS };
}
