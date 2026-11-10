import { createHash, randomBytes } from "node:crypto";
import { OryntError, type Role } from "@orynt/core";
import { withTx } from "../db/pool";
import { open, seal } from "../lib/box";
import { hashPassword, verifyPassword } from "../lib/password";
import { newTotpSecret, otpauthUri, verifyTotp } from "../lib/totp";
import { appendAudit } from "./audit";
import type { Principal } from "./auth";
import { createSession } from "./auth";
import type { Deps } from "./context";
import { queueMail } from "./mail";
import { checkEntitlement } from "./entitlements";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const HOURS = (n: number) => `${n} hours`;

/** Single-use, hashed, expiring tokens. The raw token only ever exists in the email. */
export async function issueToken(d: Deps, kind: "email_verify" | "password_reset" | "invite", p: { userId?: string; orgId?: string; email: string; role?: Role; createdBy?: string; hours: number }) {
  const raw = randomBytes(32).toString("base64url");
  await d.pool.query("UPDATE auth_tokens SET used_at=now() WHERE kind=$1 AND lower(email)=lower($2) AND used_at IS NULL AND COALESCE(org_id,'00000000-0000-0000-0000-000000000000')=COALESCE($3::uuid,'00000000-0000-0000-0000-000000000000')", [kind, p.email, p.orgId ?? null]); // supersede older
  await d.pool.query("INSERT INTO auth_tokens(kind,token_hash,user_id,org_id,email,role,created_by,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8)::interval)", [kind, sha(raw), p.userId ?? null, p.orgId ?? null, p.email, p.role ?? null, p.createdBy ?? null, HOURS(p.hours)]);
  return raw;
}
async function consumeToken(d: Deps, kind: string, raw: string) {
  const t = (await d.pool.query("UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now() RETURNING *", [sha(raw), kind])).rows[0];
  if (!t) throw new OryntError("validation_failed", 422, "This link is invalid, has expired, or was already used. Request a new one.");
  return t;
}

export async function sendVerification(d: Deps, userId: string) {
  const u = (await d.pool.query("SELECT id,email,name,email_verified_at FROM users WHERE id=$1", [userId])).rows[0];
  if (!u || u.email_verified_at) return;
  const raw = await issueToken(d, "email_verify", { userId, email: u.email, hours: 48 });
  await queueMail(d.pool, u.email, "verify_email", "Confirm your email for Orynt", `Hi ${u.name},\n\nConfirm your email address to unlock wallet connections and sending:\n${d.config.appBaseUrl}/app/verify-email?token=${raw}\n\nThis link expires in 48 hours. If you didn't create an Orynt account, ignore this message.`);
}
export async function verifyEmail(d: Deps, raw: string) {
  const t = await consumeToken(d, "email_verify", raw);
  await d.pool.query("UPDATE users SET email_verified_at=COALESCE(email_verified_at, now()) WHERE id=$1", [t.user_id]);
}
export async function forgotPassword(d: Deps, email: string) {
  const u = (await d.pool.query("SELECT id,name FROM users WHERE lower(email)=lower($1) AND disabled_at IS NULL", [email])).rows[0];
  if (!u) return; // identical response either way: no account enumeration
  const raw = await issueToken(d, "password_reset", { userId: u.id, email, hours: 1 });
  await queueMail(d.pool, email, "password_reset", "Reset your Orynt password", `Hi ${u.name},\n\nReset your password (valid for 1 hour):\n${d.config.appBaseUrl}/app/reset-password?token=${raw}\n\nIf you didn't ask for this, ignore it — your password has not changed.`);
}
export async function resetPassword(d: Deps, raw: string, password: string) {
  const t = await consumeToken(d, "password_reset", raw);
  const hash = await hashPassword(password);
  await withTx(d.pool, async (tx) => {
    await tx.query("UPDATE users SET password_hash=$2, failed_logins=0, locked_until=NULL WHERE id=$1", [t.user_id, hash]);
    await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [t.user_id]); // sign out everywhere
    await queueMail(tx, t.email, "password_changed", "Your Orynt password was changed", "Your password was just changed and all sessions were signed out. If this wasn't you, contact support immediately.");
  });
}

// ---- invitations ---------------------------------------------------------------------------------------------------------------
export async function invite(d: Deps, p: Principal, email: string, role: Role) {
  if (role === "owner" && p.role !== "owner") throw new OryntError("forbidden", 403, "Only an owner can invite another owner.");
  await checkEntitlement(d, p.orgId, "members");
  if ((await d.pool.query("SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND lower(u.email)=lower($2) AND m.status='active'", [p.orgId, email])).rowCount) throw new OryntError("conflict", 409, "That person is already a member.");
  const org = (await d.pool.query("SELECT name FROM organizations WHERE id=$1", [p.orgId])).rows[0];
  const raw = await issueToken(d, "invite", { orgId: p.orgId, email, role, createdBy: p.actor.userId, hours: 24 * 7 });
  await withTx(d.pool, async (tx) => {
    await queueMail(tx, email, "invite", `You're invited to ${org.name} on Orynt`, `${p.actor.name} invited you to join ${org.name} as ${role}.\nAccept (valid 7 days): ${d.config.appBaseUrl}/app/accept-invite?token=${raw}`, p.orgId);
    await appendAudit(tx, p.orgId, "org", `user:${p.actor.id}`, "member.invited", `email:${sha(email.toLowerCase()).slice(0, 12)}`, { role });
  });
}
export async function acceptInvite(d: Deps, raw: string, input: { name?: string; password: string }, ua?: string) {
  const t = await consumeToken(d, "invite", raw);
  const existing = (await d.pool.query("SELECT * FROM users WHERE lower(email)=lower($1)", [t.email])).rows[0];
  let userId: string;
  if (existing) {
    if (!(await verifyPassword(input.password, existing.password_hash))) { await d.pool.query("UPDATE auth_tokens SET used_at=NULL WHERE id=$1", [t.id]); throw new OryntError("unauthenticated", 401, "Enter the password of your existing Orynt account to accept."); }
    userId = existing.id;
  } else {
    if (!input.name) throw new OryntError("validation_failed", 422, "Your name is required to create an account.");
    userId = (await d.pool.query("INSERT INTO users(email,name,password_hash,email_verified_at) VALUES ($1,$2,$3,now()) RETURNING id", [t.email, input.name.trim(), await hashPassword(input.password)])).rows[0].id; // holding the invite proves control of the mailbox
  }
  await withTx(d.pool, async (tx) => {
    await tx.query("INSERT INTO memberships(org_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT (org_id,user_id) DO UPDATE SET role=EXCLUDED.role, status='active', revoked_at=NULL", [t.org_id, userId, t.role]);
    await appendAudit(tx, t.org_id, "org", `user:${userId}`, "member.joined", `user:${userId}`, { role: t.role, via: "invitation" });
  });
  const s = await createSession(d, userId, t.org_id, ua);
  return { userId, orgId: t.org_id as string, ...s };
}

// ---- MFA (TOTP) ------------------------------------------------------------------------------------------------------------------
export async function beginMfa(d: Deps, userId: string) {
  const u = (await d.pool.query("SELECT email, mfa_enabled_at FROM users WHERE id=$1", [userId])).rows[0];
  if (u.mfa_enabled_at) throw new OryntError("conflict", 409, "MFA is already enabled.");
  const secret = newTotpSecret();
  await d.pool.query("UPDATE users SET mfa_secret_ciphertext=$2 WHERE id=$1", [userId, seal(d.config.secretKey, secret, "mfa:" + userId)]);
  return { secret, otpauth_uri: otpauthUri(secret, u.email) };
}
export async function confirmMfa(d: Deps, userId: string, code: string) {
  const u = (await d.pool.query("SELECT mfa_secret_ciphertext FROM users WHERE id=$1", [userId])).rows[0];
  if (!u?.mfa_secret_ciphertext) throw new OryntError("invalid_state", 409, "Start MFA setup first.");
  if (!verifyTotp(open(d.config.secretKey, u.mfa_secret_ciphertext, "mfa:" + userId), code)) throw new OryntError("approval_invalid", 422, "That code is not correct. Check your authenticator's clock and try again.");
  await d.pool.query("UPDATE users SET mfa_enabled_at=now() WHERE id=$1", [userId]);
}
export async function mfaRequiredAndValid(d: Deps, userId: string | undefined, code: string | undefined): Promise<void> {
  if (!userId) return;
  const u = (await d.pool.query("SELECT mfa_secret_ciphertext, mfa_enabled_at FROM users WHERE id=$1", [userId])).rows[0];
  if (!u?.mfa_enabled_at) return;
  if (!code || !verifyTotp(open(d.config.secretKey, u.mfa_secret_ciphertext, "mfa:" + userId), code)) throw new OryntError("approval_invalid", 401, "A current authenticator code is required for this action.", { mfa_required: true });
}
export const hasMfa = async (d: Deps, userId: string) => !!(await d.pool.query("SELECT 1 FROM users WHERE id=$1 AND mfa_enabled_at IS NOT NULL", [userId])).rowCount;

// ---- account closure ---------------------------------------------------------------------------------------------------------------------
export async function closeAccount(d: Deps, p: Principal, password: string) {
  const u = (await d.pool.query("SELECT password_hash FROM users WHERE id=$1", [p.actor.userId])).rows[0];
  if (!(await verifyPassword(password, u.password_hash))) throw new OryntError("unauthenticated", 401, "Password is incorrect.");
  await withTx(d.pool, async (tx) => {
    for (const m of (await tx.query("SELECT org_id, role FROM memberships WHERE user_id=$1 AND status='active' FOR UPDATE", [p.actor.userId])).rows) {
      if (m.role === "owner" && (await tx.query("SELECT count(*)::int AS n FROM memberships WHERE org_id=$1 AND role='owner' AND status='active'", [m.org_id])).rows[0].n <= 1)
        throw new OryntError("conflict", 409, "You are the only owner of a workspace. Transfer ownership or close the workspace first.");
      await appendAudit(tx, m.org_id, "org", `user:${p.actor.id}`, "member.account_closed", `user:${p.actor.id}`, {});
    }
    await tx.query("UPDATE memberships SET status='revoked', revoked_at=now() WHERE user_id=$1", [p.actor.userId]);
    await tx.query("UPDATE api_keys SET revoked_at=now() WHERE created_by=$1 AND revoked_at IS NULL", [p.actor.userId]);
    await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [p.actor.userId]);
    await tx.query("UPDATE users SET disabled_at=now(), mfa_secret_ciphertext=NULL, mfa_enabled_at=NULL WHERE id=$1", [p.actor.userId]);
  });
}
export async function exportOrgData(d: Deps, orgId: string) {
  const q = async (sql: string) => (await d.pool.query(sql, [orgId])).rows;
  return JSON.parse(JSON.stringify({
    exported_at: new Date().toISOString(), note: "Organisation data export. Wallet credentials, password hashes and secrets are never included.",
    organization: (await q("SELECT id,name,slug,plan,created_at FROM organizations WHERE id=$1"))[0],
    members: await q("SELECT m.role,m.status,u.email,u.name,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1"),
    counterparties: await q("SELECT id,name,bound_payee_pubkey,verified_at,notes,created_at FROM counterparties WHERE org_id=$1"),
    obligations: await q("SELECT o.id,o.seq,o.state,o.created_at,r.revision,r.amount_msat,r.memo,r.external_ref,r.invoice,r.payment_hash,r.payee_pubkey,r.network FROM payout_obligations o JOIN obligation_revisions r ON r.obligation_id=o.id WHERE o.org_id=$1 ORDER BY o.seq, r.revision"),
    payments: await q("SELECT id,obligation_id,payment_hash,amount_msat,network,created_at FROM payment_intents WHERE org_id=$1"),
    attempts: await q("SELECT a.* FROM execution_attempts a JOIN payment_intents i ON i.id=a.intent_id WHERE i.org_id=$1"),
    receipts: await q("SELECT receipt FROM receipt_exports WHERE org_id=$1"),
    audit: await q("SELECT stream,seq,at,actor,type,subject,data,prev_hash,hash FROM audit_events WHERE org_id=$1 ORDER BY stream,seq"),
  }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
