import type { Tx } from "../db/pool";
import { queueMail } from "./mail";

type Q = { query: Tx["query"] };
const emails = async (
  q: Q,
  orgId: string,
  roles: string[],
  opts: { needKey?: boolean; excludeUserId?: string | null } = {},
) =>
  (
    await q.query(
      `SELECT DISTINCT u.email FROM memberships m JOIN users u ON u.id=m.user_id
     WHERE m.org_id=$1 AND m.status='active' AND u.disabled_at IS NULL AND m.role = ANY($2)
       AND ($3::boolean IS NOT TRUE OR m.approval_public_key IS NOT NULL) AND ($4::uuid IS NULL OR u.id <> $4)`,
      [orgId, roles, opts.needKey ?? false, opts.excludeUserId ?? null],
    )
  ).rows.map((r) => r.email as string);

/** A payout is waiting for approval: tell the people who can approve it (never the person who prepared it). Contains no amounts or invoice data. */
export async function notifyApprovalRequested(
  q: Q,
  orgId: string,
  ref: string,
  appUrl: string,
  creatorUserId: string | null,
) {
  for (const to of await emails(q, orgId, ["owner", "admin", "approver"], {
    needKey: true,
    excludeUserId: creatorUserId,
  }))
    await queueMail(
      q,
      to,
      "approval_request",
      `Payout ${ref} needs your approval`,
      `A payout (${ref}) is waiting for approval.\nReview the exact amount and recipient, then sign: ${appUrl}/app/approvals\n\nOrynt never asks you to approve by replying to an e-mail.`,
      orgId,
    );
}
/** The wallet's answer was uncertain or an exception needs a person. */
export async function notifyIncidentOpened(q: Q, orgId: string, summary: string, severity: string) {
  for (const to of await emails(q, orgId, ["owner", "admin", "operator"]))
    await queueMail(
      q,
      to,
      "payment_exception",
      `Orynt: payment exception (${severity})`,
      `${summary}\nOpen Incidents in Orynt to see what is known and the safe next steps. A second payment is blocked until this is resolved.`,
      orgId,
    );
}
export async function notifyIncidentResolved(q: Q, orgId: string, summary: string, resolution: string) {
  for (const to of await emails(q, orgId, ["owner", "admin", "operator"]))
    await queueMail(
      q,
      to,
      "incident_resolved",
      "Orynt: payment exception resolved",
      `Resolved: ${summary}\nOutcome: ${resolution.slice(0, 300)}`,
      orgId,
    );
}
/** Security-relevant account change: sent to the account's own address so a takeover cannot go unnoticed. */
export async function notifySecurity(q: Q, email: string, what: string, orgId: string | null = null) {
  await queueMail(
    q,
    email,
    "security_notice",
    "Orynt security notice",
    `${what}\nIf this was not you, reset your password now and contact support.`,
    orgId,
  );
}
export async function notifyOwners(q: Q, orgId: string, template: string, subject: string, body: string) {
  for (const to of await emails(q, orgId, ["owner"])) await queueMail(q, to, template, subject, body, orgId);
}
