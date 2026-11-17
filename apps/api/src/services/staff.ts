import { createHash, randomBytes } from "node:crypto";
import { OryntError } from "@orynt/core";
import { seal, open } from "../lib/box";
import { hashPassword, verifyPassword } from "../lib/password";
import { matchTotpStep, newTotpSecret, otpauthUri } from "../lib/totp";
import { queueMail } from "./mail";
import type { Deps } from "./context";

/**
 * Internal support staff. A SEPARATE identity from customers: no memberships, no organisation role, mandatory MFA, own sessions and an append-only audit.
 * What staff CAN do: read non-sensitive metadata, read and answer support tickets. What they CANNOT do — by construction, there is no code path: read wallet credentials,
 * password hashes or private approval keys; act as a customer; approve or send a payment; change policy or billing.
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export interface StaffCtx {
  id: string;
  email: string;
  name: string;
  role: "support" | "support_lead";
  csrf: string;
  sessionId: string;
}

export async function createStaff(
  d: Deps,
  input: { email: string; name: string; role: "support" | "support_lead" },
) {
  const password = randomBytes(18).toString("base64url");
  const secret = newTotpSecret();
  const id = (
    await d.pool.query(
      "INSERT INTO staff_users(email,name,role,password_hash,mfa_secret_ciphertext) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [input.email.trim(), input.name.trim(), input.role, await hashPassword(password), Buffer.alloc(1)],
    )
  ).rows[0].id as string;
  await d.pool.query("UPDATE staff_users SET mfa_secret_ciphertext=$2 WHERE id=$1", [
    id,
    seal(d.config.secretKey, secret, "staff-mfa:" + id),
  ]);
  return {
    id,
    email: input.email,
    one_time_password: password,
    mfa_secret: secret,
    otpauth_uri: otpauthUri(secret, input.email),
  };
}

async function checkMfa(d: Deps, staffId: string, code: string): Promise<void> {
  const u = (
    await d.pool.query("SELECT mfa_secret_ciphertext, mfa_locked_until FROM staff_users WHERE id=$1", [
      staffId,
    ])
  ).rows[0];
  if (u.mfa_locked_until && new Date(u.mfa_locked_until) > new Date())
    throw new OryntError("rate_limited", 429, "Too many incorrect codes. Try again later.");
  const step = matchTotpStep(open(d.config.secretKey, u.mfa_secret_ciphertext, "staff-mfa:" + staffId), code);
  if (
    step !== null &&
    (
      await d.pool.query(
        "UPDATE staff_users SET mfa_last_step=$2, mfa_failures=0, mfa_locked_until=NULL WHERE id=$1 AND (mfa_last_step IS NULL OR mfa_last_step < $2) RETURNING 1",
        [staffId, step],
      )
    ).rowCount
  )
    return;
  await d.pool.query(
    "UPDATE staff_users SET mfa_failures=mfa_failures+1, mfa_locked_until=CASE WHEN mfa_failures+1 >= 5 THEN now() + interval '10 minutes' ELSE mfa_locked_until END WHERE id=$1",
    [staffId],
  );
  throw new OryntError("unauthenticated", 401, "Sign-in failed.");
}

/** Password AND a current authenticator code are both required. One generic failure message for every reason. */
export async function staffLogin(d: Deps, email: string, password: string, code: string) {
  const u = (
    await d.pool.query("SELECT * FROM staff_users WHERE lower(email)=lower($1) AND disabled_at IS NULL", [
      email,
    ])
  ).rows[0];
  const fail = () => new OryntError("unauthenticated", 401, "Sign-in failed.");
  if (!u) {
    await verifyPassword(password, "scrypt$0$0$00$00").catch(() => false);
    throw fail();
  }
  if (u.locked_until && new Date(u.locked_until) > new Date())
    throw new OryntError("rate_limited", 429, "Too many attempts. Try again later.");
  if (!(await verifyPassword(password, u.password_hash))) {
    await d.pool.query(
      "UPDATE staff_users SET failed_logins=failed_logins+1, locked_until=CASE WHEN failed_logins+1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id=$1",
      [u.id],
    );
    throw fail();
  }
  await checkMfa(d, u.id, code);
  await d.pool.query("UPDATE staff_users SET failed_logins=0, locked_until=NULL WHERE id=$1", [u.id]);
  const token = randomBytes(32).toString("base64url"),
    csrf = randomBytes(24).toString("base64url");
  await d.pool.query(
    "INSERT INTO staff_sessions(staff_id,token_hash,csrf_token,expires_at) VALUES ($1,$2,$3, now() + interval '8 hours')",
    [u.id, sha(token), csrf],
  );
  await audit(d, { id: u.id, email: u.email }, "staff.login", {});
  return { token, csrf, staff: { id: u.id, email: u.email, name: u.name, role: u.role } };
}
export async function staffFromToken(d: Deps, token: string): Promise<StaffCtx | null> {
  const r = (
    await d.pool.query(
      "SELECT s.id AS sid, s.csrf_token, u.id, u.email, u.name, u.role FROM staff_sessions s JOIN staff_users u ON u.id=s.staff_id AND u.disabled_at IS NULL WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()",
      [sha(token)],
    )
  ).rows[0];
  return r
    ? { id: r.id, email: r.email, name: r.name, role: r.role, csrf: r.csrf_token, sessionId: r.sid }
    : null;
}
export const staffLogout = (d: Deps, s: StaffCtx) =>
  d.pool.query("UPDATE staff_sessions SET revoked_at=now() WHERE id=$1", [s.sessionId]);

export async function audit(
  d: Deps,
  s: { id: string; email: string },
  action: string,
  o: { orgId?: string | null; target?: string; reason?: string; detail?: Record<string, unknown> },
) {
  await d.pool.query(
    "INSERT INTO staff_audit(staff_id,staff_email,action,org_id,target,reason,detail) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [
      s.id,
      s.email,
      action,
      o.orgId ?? null,
      o.target ?? null,
      o.reason ?? null,
      JSON.stringify(o.detail ?? {}),
    ],
  );
}

export async function listTickets(d: Deps, s: StaffCtx, status?: string) {
  await audit(d, s, "tickets.list", { detail: { status: status ?? "all" } });
  const rows = (
    await d.pool.query(
      "SELECT t.reference, t.category, t.subject, t.status, t.created_at, t.email, o.name AS org_name FROM support_tickets t LEFT JOIN organizations o ON o.id=t.org_id WHERE ($1::text IS NULL OR t.status=$1) ORDER BY t.created_at DESC LIMIT 100",
      [status ?? null],
    )
  ).rows;
  return { data: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) };
}
export async function getTicket(d: Deps, s: StaffCtx, ref: string) {
  const t = (
    await d.pool.query(
      "SELECT t.*, o.name AS org_name FROM support_tickets t LEFT JOIN organizations o ON o.id=t.org_id WHERE t.reference=$1",
      [ref],
    )
  ).rows[0];
  if (!t) throw new OryntError("not_found", 404, "Ticket not found.");
  await audit(d, s, "ticket.read", { orgId: t.org_id, target: ref });
  const messages = (
    await d.pool.query(
      "SELECT m.author, m.body, m.created_at, su.name AS staff_name FROM support_messages m LEFT JOIN staff_users su ON su.id=m.staff_id WHERE m.ticket_id=$1 ORDER BY m.created_at",
      [t.id],
    )
  ).rows;
  return {
    reference: t.reference,
    status: t.status,
    category: t.category,
    subject: t.subject,
    body: t.body,
    email: t.email,
    org: t.org_id ? { id: t.org_id, name: t.org_name } : null,
    diagnostics: t.diagnostics,
    created_at: new Date(t.created_at).toISOString(),
    messages: messages.map((m) => ({
      author: m.author,
      body: m.body,
      at: new Date(m.created_at).toISOString(),
      staff: m.staff_name ?? null,
    })),
  };
}
export async function replyTicket(
  d: Deps,
  s: StaffCtx,
  ref: string,
  body: string,
  status: "pending_customer" | "resolved" | "acknowledged",
) {
  const t = (
    await d.pool.query("SELECT id, org_id, email, subject FROM support_tickets WHERE reference=$1", [ref])
  ).rows[0];
  if (!t) throw new OryntError("not_found", 404, "Ticket not found.");
  await d.pool.query(
    "INSERT INTO support_messages(ticket_id,author,staff_id,body) VALUES ($1,'staff',$2,$3)",
    [t.id, s.id, body],
  );
  await d.pool.query("UPDATE support_tickets SET status=$2 WHERE id=$1", [t.id, status]);
  await audit(d, s, "ticket.reply", { orgId: t.org_id, target: ref, detail: { status } });
  const plain = (v: string) =>
    Array.from(v, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch))
      .join("")
      .slice(0, 120);
  // the customer is told there is an answer and where to read it; the reply itself is read in the product (e-mail is not a safe place for account detail)
  await queueMail(
    d.pool,
    t.email,
    "support_reply",
    `${status === "resolved" ? "Resolved" : "Reply"}: your request ${ref}`,
    `Our support team ${status === "resolved" ? "marked your request resolved" : "replied to your request"} (${ref}: ${plain(t.subject)}).\nRead it in Orynt under Support: ${d.config.appBaseUrl}/app/support\n\nWe never ask for wallet credentials, seed words or private keys.`,
    t.org_id,
  );
}

/** Non-sensitive organisation facts for support. A stated reason is mandatory and recorded. Contains NO credentials, keys, hashes, invoices, payee names or member e-mail addresses. */
export async function orgSummary(d: Deps, s: StaffCtx, orgId: string, reason: string) {
  const o = (
    await d.pool.query(
      "SELECT id, name, plan, created_at, closed_at, onboarding_completed_at FROM organizations WHERE id=$1",
      [orgId],
    )
  ).rows[0];
  if (!o) throw new OryntError("not_found", 404, "Organisation not found.");
  await audit(d, s, "org.summary.read", { orgId, reason });
  const q = async (sql: string) => (await d.pool.query(sql, [orgId])).rows;
  const sub =
    (
      await q(
        "SELECT plan_id, status, provider, current_period_end, cancel_at_period_end FROM subscriptions WHERE org_id=$1",
      )
    )[0] ?? null;
  return {
    org: {
      id: o.id,
      name: o.name,
      created_at: new Date(o.created_at).toISOString(),
      closed: !!o.closed_at,
      onboarding_completed: !!o.onboarding_completed_at,
    },
    billing: sub
      ? {
          plan: sub.plan_id,
          status: sub.status,
          provider: sub.provider,
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
        }
      : null,
    members_by_role: Object.fromEntries(
      (
        await q(
          "SELECT role, count(*)::int AS n FROM memberships WHERE org_id=$1 AND status='active' GROUP BY role",
        )
      ).map((r) => [r.role, r.n]),
    ),
    wallets: await q(
      "SELECT provider_kind AS kind, network, status, last_health_ok AS healthy FROM wallet_connections WHERE org_id=$1",
    ),
    payouts_by_state: Object.fromEntries(
      (
        await q("SELECT state, count(*)::int AS n FROM payout_obligations WHERE org_id=$1 GROUP BY state")
      ).map((r) => [r.state, r.n]),
    ),
    open_incidents: (
      await q(
        "SELECT kind, severity, opened_at FROM incidents WHERE org_id=$1 AND status='open' ORDER BY opened_at",
      )
    ).map((r) => ({ kind: r.kind, severity: r.severity, opened_at: new Date(r.opened_at).toISOString() })),
    mail_health: await q(
      "SELECT delivery_status AS status, count(*)::int AS n FROM mail_outbox WHERE org_id=$1 AND created_at > now() - interval '7 days' GROUP BY delivery_status",
    ),
  };
}
