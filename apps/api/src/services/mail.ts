import { createHmac, timingSafeEqual } from "node:crypto";
import { OryntError } from "@orynt/core";
import type { Tx } from "../db/pool";
import type { Deps } from "./context";

/**
 * Transactional mail. Queued in the same transaction as the event that caused it (outbox); delivered at-least-once by a pump that claims rows with a LEASE
 * (one atomic UPDATE … FOR UPDATE SKIP LOCKED), so two workers can never send the same message. Failed sends back off exponentially.
 * Providers: 'log' (marks sent without sending — development/tests), 'resend', 'brevo'. Real providers are IMPLEMENTED, NOT COMMISSIONED: they have only been
 * exercised against a local controlled HTTP service that mimics the documented request shape, never against the real provider.
 */
export const TOKEN_TEMPLATES = ["verify_email", "password_reset", "invite"] as const;
// templates a stranger can trigger for any address (public forms, invitations) — capped per recipient
const QUOTA: Record<string, number> = { support_ack: 3, invite: 5, verify_email: 5, password_reset: 5 };

export async function queueMail(
  q: { query: Tx["query"] },
  to: string,
  template: string,
  subject: string,
  body: string,
  orgId: string | null = null,
): Promise<boolean> {
  const cap = QUOTA[template];
  if (cap !== undefined) {
    const n = (
      await q.query(
        "SELECT count(*)::int AS n FROM mail_outbox WHERE lower(to_email)=lower($1) AND template=$2 AND created_at > now() - interval '1 hour'",
        [to, template],
      )
    ).rows[0].n as number;
    if (n >= cap) return false; // silently dropped: a flood of mail to one address is never sent
  }
  await q.query(
    "INSERT INTO mail_outbox(org_id,to_email,template,subject,body_text) VALUES ($1,$2,$3,$4,$5)",
    [orgId, to, template, subject, body],
  );
  return true;
}

export interface MailProvider {
  name: string;
  send(m: { to: string; from: string; subject: string; text: string }): Promise<{ id?: string }>;
}
const post = async (url: string, headers: Record<string, string>, body: unknown): Promise<unknown> => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`); // never include the response body: it can echo the request
  return r.json().catch(() => ({}));
};
export function providerFor(d: Deps): MailProvider {
  const c = d.config;
  if (c.mailProvider === "resend") {
    return {
      name: "resend",
      send: async (m) => {
        if (!c.resendApiKey) throw new Error("RESEND_API_KEY not configured");
        const j = (await post(
          `${c.mailApiUrl ?? "https://api.resend.com"}/emails`,
          { authorization: `Bearer ${c.resendApiKey}` },
          { from: m.from, to: [m.to], subject: m.subject, text: m.text },
        )) as { id?: string };
        return { id: j.id };
      },
    };
  }
  if (c.mailProvider === "brevo") {
    return {
      name: "brevo",
      send: async (m) => {
        if (!c.brevoApiKey) throw new Error("BREVO_API_KEY not configured");
        const f = /^(.*)<(.+)>$/.exec(m.from.trim()); // "Name <addr>" or a bare address
        const j = (await post(
          `${c.mailApiUrl ?? "https://api.brevo.com"}/v3/smtp/email`,
          { "api-key": c.brevoApiKey },
          {
            sender: f ? { name: f[1]!.trim(), email: f[2]!.trim() } : { email: m.from },
            to: [{ email: m.to }],
            subject: m.subject,
            textContent: m.text,
          },
        )) as { messageId?: string };
        return { id: j.messageId };
      },
    };
  }
  return { name: "log", send: async () => ({}) };
}

const backoffSeconds = (attempts: number) => Math.min(30 * 2 ** attempts, 6 * 3600);

/** Claims up to `limit` due messages with a 2-minute lease and sends them. Returns how many were sent. */
export async function pumpMail(d: Deps, limit = 20): Promise<number> {
  const claimed = (
    await d.pool.query(
      `UPDATE mail_outbox SET claimed_until = now() + interval '2 minutes'
     WHERE id IN (SELECT id FROM mail_outbox WHERE status='pending' AND next_attempt_at <= now() AND (claimed_until IS NULL OR claimed_until < now())
                  ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`,
      [limit],
    )
  ).rows;
  const provider = providerFor(d);
  let n = 0;
  for (const m of claimed) {
    try {
      const r = await provider.send({
        to: m.to_email,
        from: d.config.mailFrom,
        subject: m.subject,
        text: m.body_text,
      });
      // tokens must not outlive delivery in plaintext: with a real provider the stored body is replaced once the provider has accepted the message
      const redact = provider.name !== "log" && (TOKEN_TEMPLATES as readonly string[]).includes(m.template);
      await d.pool.query(
        "UPDATE mail_outbox SET status='sent', sent_at=now(), attempts=attempts+1, claimed_until=NULL, provider=$2, provider_message_id=$3, body_text = CASE WHEN $4 THEN '[content redacted after delivery]' ELSE body_text END, redacted_at = CASE WHEN $4 THEN now() ELSE redacted_at END WHERE id=$1",
        [m.id, provider.name, r.id ?? null, redact],
      );
      n++;
    } catch (e) {
      const tries = (m.attempts as number) + 1;
      await d.pool.query(
        "UPDATE mail_outbox SET attempts=$2, last_error=$3, claimed_until=NULL, status=CASE WHEN $2 >= 8 THEN 'failed' ELSE 'pending' END, next_attempt_at = now() + ($4 || ' seconds')::interval WHERE id=$1",
        [m.id, tries, (e as Error).message.slice(0, 200), String(backoffSeconds(tries))],
      );
    }
  }
  return n;
}
/** Token links in unsent/never-redacted mail (log provider, failed sends) are blanked after the longest token lifetime (7 days). */
export async function redactOldTokenMail(d: Deps): Promise<number> {
  const r = await d.pool.query(
    "UPDATE mail_outbox SET body_text='[content redacted: retention elapsed]', redacted_at=now() WHERE template = ANY($1) AND redacted_at IS NULL AND created_at < now() - interval '7 days'",
    [TOKEN_TEMPLATES as unknown as string[]],
  );
  return r.rowCount ?? 0;
}

// ---- provider delivery-status webhook (Resend signs with Svix) ------------------------------------------------------------------------------
const eq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
/** Svix: signed content = `${svix-id}.${svix-timestamp}.${rawBody}`, key = base64 part of "whsec_…", signature header = space-separated "v1,<base64 hmac-sha256>". 5-minute tolerance. */
export function verifySvix(
  raw: string,
  h: Record<string, string | string[] | undefined>,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): void {
  const id = h["svix-id"],
    ts = h["svix-timestamp"],
    sig = h["svix-signature"];
  if (typeof id !== "string" || typeof ts !== "string" || typeof sig !== "string")
    throw new OryntError("unauthenticated", 401, "Missing webhook signature.");
  if (!/^\d+$/.test(ts) || Math.abs(nowSec - Number(ts)) > 300)
    throw new OryntError("unauthenticated", 401, "Stale webhook timestamp.");
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest();
  const ok = sig.split(" ").some((p) => {
    const [v, s] = p.split(",");
    return v === "v1" && !!s && eq(Buffer.from(s, "base64"), expected);
  });
  if (!ok) throw new OryntError("unauthenticated", 401, "Invalid webhook signature.");
}
const STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
};
export async function applyMailEvent(
  d: Deps,
  provider: string,
  raw: string,
  headers: Record<string, string | string[] | undefined>,
): Promise<"applied" | "ignored"> {
  if (provider !== "resend") throw new OryntError("not_found", 404, "Unknown mail provider.");
  const secret = d.config.mailWebhookSecret;
  if (!secret) throw new OryntError("unauthenticated", 401, "Mail webhooks are not configured.");
  verifySvix(raw, headers, secret);
  const e = JSON.parse(raw) as { type?: string; data?: { email_id?: string } };
  const status = STATUS[e.type ?? ""];
  if (!status || !e.data?.email_id) return "ignored";
  const r = await d.pool.query(
    "UPDATE mail_outbox SET delivery_status=$3, delivery_status_at=now() WHERE provider=$1 AND provider_message_id=$2 RETURNING id",
    [provider, e.data.email_id, status],
  );
  return r.rowCount ? "applied" : "ignored";
}
