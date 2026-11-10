import type { Tx } from "../db/pool";
import type { Deps } from "./context";

/** Transactional outbox: the email is queued in the same transaction as the event that caused it. Delivery is at-least-once by a pump. */
export async function queueMail(q: { query: Tx["query"] }, to: string, template: string, subject: string, body: string, orgId: string | null = null) {
  await q.query("INSERT INTO mail_outbox(org_id,to_email,template,subject,body_text) VALUES ($1,$2,$3,$4,$5)", [orgId, to, template, subject, body]);
}
/** 'log' adapter marks mail sent without sending (development/test; inspect the table). 'resend' adapter POSTs to Resend — IMPLEMENTED, NOT COMMISSIONED: never exercised without an API key and a verified sending domain. */
export async function pumpMail(d: Deps, limit = 20): Promise<number> {
  const rows = (await d.pool.query("SELECT * FROM mail_outbox WHERE status='pending' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED", [limit])).rows;
  let n = 0;
  for (const m of rows) {
    try {
      if (d.config.mailProvider === "resend") {
        if (!d.config.resendApiKey) throw new Error("RESEND_API_KEY not configured");
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${d.config.resendApiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from: d.config.mailFrom, to: [m.to_email], subject: m.subject, text: m.body_text }), signal: AbortSignal.timeout(10_000) });
        if (!r.ok) throw new Error(`Resend HTTP ${r.status}`);
      }
      await d.pool.query("UPDATE mail_outbox SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1", [m.id]); n++;
    } catch (e) { await d.pool.query("UPDATE mail_outbox SET attempts=attempts+1, last_error=$2, status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=$1", [m.id, (e as Error).message.slice(0, 200)]); }
  }
  return n;
}
