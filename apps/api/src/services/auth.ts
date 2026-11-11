import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_POLICY_RULES, OryntError, hashCanonical, permissionsFor, policyDigestInput, verifyMessage, type Role } from "@orynt/core";
import { withTx, type Tx } from "../db/pool";
import { hashPassword, verifyPassword } from "../lib/password";
import { appendAudit } from "./audit";
import { checkEntitlement } from "./entitlements";
import { track } from "./analytics";
import { sendVerification } from "./accounts";
import { notifySecurity } from "./notify";
const plainName = (v: string) => Array.from(v, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("").slice(0, 60);
import type { Actor, Deps } from "./context";
import { iso } from "./context";

export interface Principal {
  orgId: string;
  actor: Actor;
  role: Role;
  auth: "session" | "api_key";
  sessionId?: string;
  csrf?: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";

export async function createSession(d: Deps, userId: string, orgId: string, userAgent?: string) {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(24).toString("base64url");
  await d.pool.query("INSERT INTO sessions(user_id,org_id,token_hash,csrf_token,expires_at,user_agent) VALUES ($1,$2,$3,$4,now() + interval '12 hours',$5)", [userId, orgId, sha(token), csrf, userAgent?.slice(0, 200) ?? null]);
  return { token, csrf };
}

export async function seedWorkspaceDefaults(tx: Tx, orgId: string, userId: string, plan = "developer") {
  await tx.query("INSERT INTO subscriptions(org_id, plan_id, status, provider) VALUES ($1,$2,'active','none') ON CONFLICT (org_id) DO NOTHING", [orgId, plan]);
  const digest = hashCanonical(policyDigestInput(DEFAULT_POLICY_RULES));
  await tx.query("INSERT INTO approval_policies(org_id,name,revision,rules,digest,active,created_by) VALUES ($1,'Default policy',1,$2,$3,true,$4)", [orgId, JSON.stringify(DEFAULT_POLICY_RULES), digest, userId]);
}

export async function register(d: Deps, input: { email: string; password: string; name: string; workspace_name: string }, ua?: string) {
  const pwHash = await hashPassword(input.password);
  const r = await withTx(d.pool, async (tx) => {
    const exists = (await tx.query("SELECT 1 FROM users WHERE lower(email)=lower($1)", [input.email])).rowCount;
    if (exists) throw new OryntError("conflict", 409, "An account with this email already exists.");
    const user = (await tx.query("INSERT INTO users(email,name,password_hash) VALUES ($1,$2,$3) RETURNING id", [input.email.trim(), input.name.trim(), pwHash])).rows[0];
    let slug = slugify(input.workspace_name);
    if ((await tx.query("SELECT 1 FROM organizations WHERE slug=$1", [slug])).rowCount) slug += "-" + randomBytes(3).toString("hex");
    const org = (await tx.query("INSERT INTO organizations(name,slug) VALUES ($1,$2) RETURNING id", [input.workspace_name.trim(), slug])).rows[0];
    await tx.query("INSERT INTO memberships(org_id,user_id,role) VALUES ($1,$2,'owner')", [org.id, user.id]);
    await seedWorkspaceDefaults(tx, org.id, user.id, d.config.defaultPlan);
    await appendAudit(tx, org.id, "org", `user:${user.id}`, "workspace.created", `org:${org.id}`, { name: input.workspace_name });
    return { userId: user.id as string, orgId: org.id as string };
  });
  const s = await createSession(d, r.userId, r.orgId, ua);
  await track(d, "signup_completed", r.orgId); await track(d, "organization_created", r.orgId);
  await sendVerification(d, r.userId).catch(() => {});
  return { ...r, ...s };
}

export async function login(d: Deps, email: string, password: string, ua?: string, mfaCode?: string) {
  const u = (await d.pool.query("SELECT * FROM users WHERE lower(email)=lower($1)", [email])).rows[0];
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  const fail = () => new OryntError("unauthenticated", 401, "Email or password is incorrect.");
  if (!u) throw fail();
  if (u.disabled_at) throw fail();
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new OryntError("rate_limited", 429, "Too many failed sign-in attempts. Try again in a few minutes.");
  if (!ok) {
    // an expired lock starts a fresh count (otherwise one typo after expiry would re-lock an approver indefinitely)
    await d.pool.query("UPDATE users SET failed_logins = CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_logins + 1 END, locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1 ELSE failed_logins + 1 END) >= 5 THEN now() + interval '15 minutes' ELSE CASE WHEN locked_until <= now() THEN NULL ELSE locked_until END END WHERE id=$1", [u.id]);
    throw fail();
  }
  const { mfaRequiredAndValid } = await import("./accounts");
  await mfaRequiredAndValid(d, u.id, mfaCode); // after the password is proven; a wrong/missing code is a 401 mfa_required
  await d.pool.query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1", [u.id]);
  const m = (await d.pool.query("SELECT org_id FROM memberships WHERE user_id=$1 AND status='active' ORDER BY created_at LIMIT 1", [u.id])).rows[0];
  if (!m) throw new OryntError("forbidden", 403, "Your access to every workspace has been revoked.");
  const s = await createSession(d, u.id, m.org_id, ua);
  return { userId: u.id as string, orgId: m.org_id as string, ...s };
}

export async function principalFromSession(d: Deps, token: string): Promise<Principal | null> {
  const r = (await d.pool.query(
    `SELECT s.id, s.csrf_token, s.org_id, u.id AS uid, u.name, m.role FROM sessions s JOIN users u ON u.id=s.user_id AND u.disabled_at IS NULL
     JOIN memberships m ON m.user_id=s.user_id AND m.org_id=s.org_id AND m.status='active'
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [sha(token)])).rows[0];
  if (!r) return null;
  return { orgId: r.org_id, role: r.role, auth: "session", sessionId: r.id, csrf: r.csrf_token, actor: { kind: "user", id: r.uid, userId: r.uid, name: r.name, role: r.role } };
}

export async function principalFromApiKey(d: Deps, key: string): Promise<Principal | null> {
  if (!key.startsWith("orynt_")) return null;
  // a key is only as alive as the person who created it: they must still be an active member of the workspace and not disabled
  const r = (await d.pool.query(
    `UPDATE api_keys k SET last_used_at=now() FROM memberships m, users u
     WHERE k.key_hash=$1 AND k.revoked_at IS NULL AND m.user_id=k.created_by AND m.org_id=k.org_id AND m.status='active' AND u.id=k.created_by AND u.disabled_at IS NULL
     RETURNING k.id, k.org_id, k.role, k.name, k.created_by`, [sha(key)])).rows[0];
  if (!r) return null;
  return { orgId: r.org_id, role: r.role, auth: "api_key", actor: { kind: "apikey", id: r.id, name: `API key “${r.name}”`, role: r.role } };
}

export async function revokeSession(d: Deps, sessionId: string) { await d.pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [sessionId]); }

export async function meOf(d: Deps, p: Principal) {
  const org = (await d.pool.query("SELECT id,name,slug FROM organizations WHERE id=$1", [p.orgId])).rows[0];
  const userId = p.actor.userId;
  const user = userId ? (await d.pool.query("SELECT id,email,name FROM users WHERE id=$1", [userId])).rows[0] : { id: p.actor.id, email: "", name: p.actor.name };
  const mem = userId ? (await d.pool.query("SELECT approval_public_key FROM memberships WHERE user_id=$1 AND org_id=$2", [userId, p.orgId])).rows[0] : null;
  const flags = userId ? (await d.pool.query("SELECT email_verified_at IS NOT NULL AS ev, mfa_enabled_at IS NOT NULL AS mfa FROM users WHERE id=$1", [userId])).rows[0] : { ev: true, mfa: false };
  const wss = userId ? (await d.pool.query("SELECT o.id,o.name,o.slug,m.role FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=$1 AND m.status='active' ORDER BY o.name", [userId])).rows : [{ ...org, role: p.role }];
  return { email_verified: !!flags.ev, mfa_enabled: !!flags.mfa, user, workspace: org, role: p.role, permissions: [...permissionsFor(p.role)], csrf_token: p.csrf, approval_key: { registered: !!mem?.approval_public_key, public_key: mem?.approval_public_key ?? null }, workspaces: wss, auth: p.auth };
}

export async function switchWorkspace(d: Deps, p: Principal, workspaceId: string) {
  if (p.auth !== "session" || !p.sessionId) throw new OryntError("forbidden", 403, "Only interactive sessions can switch workspace.");
  const m = (await d.pool.query("SELECT 1 FROM memberships WHERE user_id=$1 AND org_id=$2 AND status='active'", [p.actor.userId, workspaceId])).rowCount;
  if (!m) throw new OryntError("forbidden", 403, "You are not a member of that workspace.");
  await d.pool.query("UPDATE sessions SET org_id=$2 WHERE id=$1", [p.sessionId, workspaceId]);
}

export const keyProofMessage = (orgId: string, pub: string) => `orynt.register-key:${orgId}:${pub}`;
export async function registerApprovalKey(d: Deps, p: Principal, publicKey: string, proof: string) {
  if (p.actor.kind !== "user") throw new OryntError("forbidden", 403, "Approval keys belong to people, not API keys.");
  if (!verifyMessage(publicKey, "orynt.key-registration.v1", keyProofMessage(p.orgId, publicKey), proof)) throw new OryntError("validation_failed", 422, "Proof of possession of the private key is invalid.");
  try {
    await withTx(d.pool, async (tx) => {
      await tx.query("UPDATE memberships SET approval_public_key=$3, approval_key_registered_at=now() WHERE user_id=$1 AND org_id=$2", [p.actor.userId, p.orgId, publicKey]);
      await appendAudit(tx, p.orgId, "org", `user:${p.actor.id}`, "member.approval_key_registered", `user:${p.actor.id}`, { public_key: publicKey });
      await notifySecurity(tx, (await tx.query("SELECT email FROM users WHERE id=$1", [p.actor.userId])).rows[0].email, "The approval key used to sign payouts was registered or replaced on your account.", p.orgId);
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new OryntError("conflict", 409, "That approval key is already registered to another member of this workspace. Each approver needs their own key.");
    throw e;
  }
}

// ---- team ---------------------------------------------------------------------------------------------------------------
const memberDto = (r: Record<string, unknown>) => ({ id: r["mid"], user: { id: r["uid"], email: r["email"], name: r["name"] }, role: r["role"], status: r["status"], approval_key_registered: !!r["approval_public_key"], created_at: iso(r["created_at"] as Date) });
export async function listMembers(d: Deps, orgId: string) {
  const rows = (await d.pool.query("SELECT m.id AS mid, u.id AS uid, u.email, u.name, m.role, m.status, m.approval_public_key, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY m.created_at", [orgId])).rows;
  return { data: rows.map(memberDto) };
}
export async function addMember(d: Deps, p: Principal, input: { email: string; name: string; role: Role; temporary_password: string }) {
  if (input.role === "owner" && p.role !== "owner") throw new OryntError("forbidden", 403, "Only an owner can add another owner.");
  await checkEntitlement(d, p.orgId, "members");
  const pw = await hashPassword(input.temporary_password);
  return withTx(d.pool, async (tx) => {
    let u = (await tx.query("SELECT id FROM users WHERE lower(email)=lower($1)", [input.email])).rows[0];
    if (u) throw new OryntError("conflict", 409, "That email already has an Orynt account. Send an invitation instead (Team → Invite): people join a workspace only by accepting it themselves.");
    if (!u) u = (await tx.query("INSERT INTO users(email,name,password_hash) VALUES ($1,$2,$3) RETURNING id", [input.email.trim(), input.name.trim(), pw])).rows[0];
    if ((await tx.query("SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2", [p.orgId, u.id])).rowCount) throw new OryntError("conflict", 409, "That person is already a member.");
    const m = (await tx.query("INSERT INTO memberships(org_id,user_id,role) VALUES ($1,$2,$3) RETURNING id", [p.orgId, u.id, input.role])).rows[0];
    await appendAudit(tx, p.orgId, "org", `${p.actor.kind}:${p.actor.id}`, "member.added", `user:${u.id}`, { role: input.role });
    return memberDto((await tx.query("SELECT m.id AS mid, u.id AS uid, u.email, u.name, m.role, m.status, m.approval_public_key, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1", [m.id])).rows[0]);
  });
}
export async function updateMember(d: Deps, p: Principal, membershipId: string, patch: { role?: Role; status?: "active" | "revoked" }) {
  return withTx(d.pool, async (tx) => {
    const m = (await tx.query("SELECT * FROM memberships WHERE id=$1 AND org_id=$2 FOR UPDATE", [membershipId, p.orgId])).rows[0];
    if (!m) throw new OryntError("not_found", 404, "Member not found.");
    if ((m.role === "owner" || patch.role === "owner") && p.role !== "owner") throw new OryntError("forbidden", 403, "Only an owner can change owner access.");
    const newRole = patch.role ?? m.role, newStatus = patch.status ?? m.status;
    if (m.role === "owner" && (newRole !== "owner" || newStatus !== "active")) {
      const owners = (await tx.query("SELECT count(*)::int AS n FROM memberships WHERE org_id=$1 AND role='owner' AND status='active'", [p.orgId])).rows[0].n;
      if (owners <= 1) throw new OryntError("conflict", 409, "A workspace must keep at least one active owner.");
    }
    await tx.query("UPDATE memberships SET role=$2, status=$3, revoked_at = CASE WHEN $3='revoked' THEN now() ELSE NULL END WHERE id=$1", [membershipId, newRole, newStatus]);
    if (newStatus === "revoked") await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND org_id=$2 AND revoked_at IS NULL", [m.user_id, p.orgId]);
    await appendAudit(tx, p.orgId, "org", `${p.actor.kind}:${p.actor.id}`, "member.updated", `user:${m.user_id}`, { role: newRole, status: newStatus, previous_role: m.role, previous_status: m.status });
    return memberDto((await tx.query("SELECT m.id AS mid, u.id AS uid, u.email, u.name, m.role, m.status, m.approval_public_key, m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1", [membershipId])).rows[0]);
  });
}

// ---- API keys -----------------------------------------------------------------------------------------------------------
export async function createApiKey(d: Deps, p: Principal, input: { name: string; role: "operator" | "developer" | "viewer" }) {
  if (p.actor.kind !== "user") throw new OryntError("forbidden", 403, "API keys cannot mint API keys.");
  await checkEntitlement(d, p.orgId, "api_keys");
  // no privilege escalation: a key may hold only permissions its creator holds right now
  const mine = new Set<string>(permissionsFor(p.role));
  if (!permissionsFor(input.role).every((perm) => mine.has(perm))) throw new OryntError("forbidden", 403, `Your role (${p.role}) cannot create a key with role ${input.role}: it would grant permissions you don't hold.`);
  const secret = "orynt_" + randomBytes(24).toString("base64url");
  const r = (await d.pool.query("INSERT INTO api_keys(org_id,name,prefix,key_hash,role,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [p.orgId, input.name, secret.slice(0, 12), sha(secret), input.role, p.actor.userId])).rows[0];
  await notifySecurity(d.pool, (await d.pool.query("SELECT email FROM users WHERE id=$1", [p.actor.userId])).rows[0].email, `An API key named "${plainName(input.name)}" with role ${input.role} was created on your account.`, p.orgId);
  return { ...apiKeyDto(r), secret };
}
export const apiKeyDto = (r: Record<string, unknown>) => ({ id: r["id"], name: r["name"], prefix: r["prefix"], role: r["role"], created_at: iso(r["created_at"] as Date), last_used_at: r["last_used_at"] ? iso(r["last_used_at"] as Date) : null, revoked_at: r["revoked_at"] ? iso(r["revoked_at"] as Date) : null });
