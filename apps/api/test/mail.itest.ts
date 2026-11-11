import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { pumpMail, redactOldTokenMail } from "../src/services/mail";
import { Client, createEnv, type TestEnv, world, toApproved, type World } from "./helpers";

/**
 * Mail pipeline verified against a LOCAL CONTROLLED SERVICE that mimics the documented Resend / Brevo request shapes.
 * This proves the pipeline's behaviour (leases, backoff, redaction, quotas, webhook verification). It is NOT proof that Resend or Brevo accept our messages:
 * no real provider account, key or sending domain was used.
 */
interface Received { path: string; headers: http.IncomingHttpHeaders; body: any }
function fakeProvider() {
  const received: Received[] = [];
  let failNext = 0; let counter = 0;
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      if (failNext > 0) { failNext--; res.writeHead(500, { "content-type": "application/json" }); res.end('{"error":"boom","echo":"SHOULD-NEVER-BE-LOGGED"}'); return; }
      received.push({ path: req.url ?? "", headers: req.headers, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url === "/emails" ? { id: `re_${++counter}` } : { messageId: `<br_${++counter}@fake>` }));
    });
  });
  return { server, received, failNext: (n: number) => { failNext = n; }, start: () => new Promise<string>((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))), stop: () => new Promise<void>((r) => server.close(() => r())) };
}
const WH = "whsec_" + randomBytes(24).toString("base64");
const svix = (raw: string, id = "msg_1", ts = Math.floor(Date.now() / 1000), secret = WH) => ({ "svix-id": id, "svix-timestamp": String(ts), "svix-signature": "v1," + createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${raw}`).digest("base64") });

describe("mail pipeline against a controlled Resend-shaped service", () => {
  const fp = fakeProvider(); let env: TestEnv, c: Client, base: string;
  beforeAll(async () => { base = await fp.start(); env = await createEnv({ ORYNT_MAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key", ORYNT_MAIL_API_URL: base, ORYNT_MAIL_WEBHOOK_SECRET: WH, ORYNT_REQUIRE_EMAIL_VERIFICATION: "1" }); c = new Client(env); });
  afterAll(async () => { await env.teardown(); await fp.stop(); });
  const row = async (to: string, template: string) => (await env.pool.query("SELECT * FROM mail_outbox WHERE lower(to_email)=lower($1) AND template=$2 ORDER BY created_at DESC LIMIT 1", [to, template])).rows[0];

  it("sends a verification mail with the documented request shape, records the provider id, and redacts the token afterwards", async () => {
    await c.register("new@mail.test");
    expect((await row("new@mail.test", "verify_email")).body_text).toMatch(/token=/);
    expect(await pumpMail(env.deps)).toBeGreaterThan(0);
    const got = fp.received.find((r) => r.body.to?.[0] === "new@mail.test" && /Confirm/.test(r.body.subject))!; // other mail (e.g. the key-registration security notice) may be sent first
    expect(got.path).toBe("/emails"); expect(got.headers["authorization"]).toBe("Bearer re_test_key");
    expect(got.body).toMatchObject({ from: env.config.mailFrom, to: ["new@mail.test"], subject: expect.stringMatching(/Confirm/) });
    expect(got.body.text).toMatch(/token=/); // the provider does receive the link…
    const after = await row("new@mail.test", "verify_email");
    expect(after.status).toBe("sent"); expect(after.provider).toBe("resend"); expect(after.provider_message_id).toMatch(/^re_/);
    expect(after.body_text).toBe("[content redacted after delivery]"); // …but the stored copy no longer holds a usable token
  });

  it("two workers pumping at once never send the same message twice (lease)", async () => {
    for (let i = 0; i < 12; i++) await env.pool.query("INSERT INTO mail_outbox(to_email,template,subject,body_text) VALUES ($1,'billing_notice','s','b')", [`bulk${i}@mail.test`]);
    const before = fp.received.length;
    await Promise.all([pumpMail(env.deps, 20), pumpMail(env.deps, 20), pumpMail(env.deps, 20), pumpMail(env.deps, 20)]);
    const sent = fp.received.slice(before).map((r) => r.body.to[0]).filter((t: string) => t.startsWith("bulk"));
    expect(sent.length).toBe(12); expect(new Set(sent).size).toBe(12);
  });

  it("a provider error backs off exponentially, never stores the provider's response, and succeeds on retry; eight failures give up", async () => {
    await env.pool.query("INSERT INTO mail_outbox(to_email,template,subject,body_text) VALUES ('retry@mail.test','billing_notice','s','b')");
    fp.failNext(1);
    await pumpMail(env.deps);
    let r = await row("retry@mail.test", "billing_notice");
    expect(r.status).toBe("pending"); expect(r.attempts).toBe(1); expect(new Date(r.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(r.last_error).toMatch(/HTTP 500/); expect(r.last_error).not.toMatch(/SHOULD-NEVER-BE-LOGGED/);
    const before = fp.received.length; await pumpMail(env.deps); expect(fp.received.length).toBe(before); // not due yet
    await env.pool.query("UPDATE mail_outbox SET next_attempt_at=now() WHERE id=$1", [r.id]);
    await pumpMail(env.deps);
    r = await row("retry@mail.test", "billing_notice"); expect(r.status).toBe("sent");
    await env.pool.query("INSERT INTO mail_outbox(to_email,template,subject,body_text) VALUES ('dead@mail.test','billing_notice','s','b')");
    fp.failNext(100);
    for (let i = 0; i < 8; i++) { await env.pool.query("UPDATE mail_outbox SET next_attempt_at=now() WHERE to_email='dead@mail.test'"); await pumpMail(env.deps); }
    expect((await row("dead@mail.test", "billing_notice")).status).toBe("failed");
    fp.failNext(0);
  });

  it("recipients cannot be flooded: public-triggered templates are capped per address per hour", async () => {
    for (let i = 0; i < 6; i++) await c.call("POST", "/v1/public/support", null, { email: "flood@mail.test", category: "other", subject: "hello there", body: "a sufficiently long support message" });
    expect((await env.pool.query("SELECT count(*)::int AS n FROM mail_outbox WHERE to_email='flood@mail.test' AND template='support_ack'")).rows[0].n).toBe(3);
  });

  it("token mail that was never delivered is blanked after the longest token lifetime", async () => {
    await env.pool.query("INSERT INTO mail_outbox(to_email,template,subject,body_text,created_at,status) VALUES ('old@mail.test','password_reset','s','https://x/?token=SECRET','now'::timestamptz - interval '8 days','failed')");
    expect(await redactOldTokenMail(env.deps)).toBeGreaterThan(0);
    expect((await row("old@mail.test", "password_reset")).body_text).not.toMatch(/SECRET/);
  });

  it("delivery-status webhook: signature (Svix scheme) verified, stale/forged refused, status stored against the provider message id", async () => {
    const r0 = await row("new@mail.test", "verify_email");
    const raw = JSON.stringify({ type: "email.delivered", data: { email_id: r0.provider_message_id } });
    const post = (body: string, h: Record<string, string>) => env.app.inject({ method: "POST", url: "/v1/mail/webhook/resend", headers: { "content-type": "application/json", ...h }, payload: body });
    expect((await post(raw, svix(raw))).statusCode).toBe(200);
    expect((await row("new@mail.test", "verify_email")).delivery_status).toBe("delivered");
    expect((await post(raw, { ...svix(raw), "svix-signature": "v1," + Buffer.alloc(32).toString("base64") })).statusCode).toBe(401); // forged
    expect((await post(raw + " ", svix(raw))).statusCode).toBe(401); // altered body
    expect((await post(raw, svix(raw, "msg_old", Math.floor(Date.now() / 1000) - 3600))).statusCode).toBe(401); // stale
    expect((await post(raw, svix(raw, "msg_x", undefined, "whsec_" + randomBytes(24).toString("base64")))).statusCode).toBe(401); // wrong secret
    const bounce = JSON.stringify({ type: "email.bounced", data: { email_id: r0.provider_message_id } });
    expect((await post(bounce, svix(bounce, "msg_2"))).statusCode).toBe(200);
    expect((await row("new@mail.test", "verify_email")).delivery_status).toBe("bounced");
    const unknown = JSON.stringify({ type: "email.delivered", data: { email_id: "re_nope" } });
    expect(JSON.parse((await post(unknown, svix(unknown, "msg_3"))).body).result).toBe("ignored");
  });

  it("security notices go to the account holder when an API key is created", async () => {
    const owner = await c.register("sec@mail.test");
    await env.pool.query("UPDATE users SET email_verified_at=now() WHERE lower(email)='sec@mail.test'");
    expect((await c.call("POST", "/v1/api-keys", owner, { name: "deploy\nbot", role: "viewer" })).status).toBe(201);
    const n = await row("sec@mail.test", "security_notice");
    expect(n.body_text).toMatch(/API key named "deploy bot"/); // newline in the name cannot start a new line in the mail
  });
});

describe("Brevo-shaped provider", () => {
  const fp = fakeProvider(); let env: TestEnv;
  beforeAll(async () => { const base = await fp.start(); env = await createEnv({ ORYNT_MAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-test", ORYNT_MAIL_API_URL: base }); });
  afterAll(async () => { await env.teardown(); await fp.stop(); });
  it("uses the api-key header, sender/to/textContent body and stores the messageId", async () => {
    await env.pool.query("INSERT INTO mail_outbox(to_email,template,subject,body_text) VALUES ('b@mail.test','billing_notice','Hi','Body')");
    await pumpMail(env.deps);
    const got = fp.received[0]!;
    expect(got.path).toBe("/v3/smtp/email"); expect(got.headers["api-key"]).toBe("xkeysib-test");
    expect(got.body).toMatchObject({ sender: { name: "Orynt", email: "no-reply@orynt.example" }, to: [{ email: "b@mail.test" }], subject: "Hi", textContent: "Body" });
    expect((await env.pool.query("SELECT provider, provider_message_id FROM mail_outbox WHERE to_email='b@mail.test'")).rows[0]).toMatchObject({ provider: "brevo", provider_message_id: expect.stringMatching(/br_/) });
  });
});

describe("approval-request and exception notifications", () => {
  let w: World;
  beforeAll(async () => { w = await world(); });
  afterAll(async () => { await w.env.teardown(); });
  it("submitting a payout mails the approvers with keys — never the person who prepared it — and contains no amount or invoice", async () => {
    await toApproved(w);
    const rows = (await w.env.pool.query("SELECT to_email, body_text FROM mail_outbox WHERE template='approval_request'")).rows;
    const to = rows.map((r) => r.to_email);
    expect(to).toEqual(expect.arrayContaining(["approver1@acme.test", "approver2@acme.test"]));
    expect(to).not.toContain("operator@acme.test");
    for (const r of rows) expect(r.body_text).not.toMatch(/lnbc|lnbcrt|msat|sats/i);
  });
});
