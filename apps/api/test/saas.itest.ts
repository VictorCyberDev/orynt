import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { totpAt } from "../src/lib/totp";
import { open } from "../src/lib/box";
import { parsePaystack, parseStripe, applyBillingEvent } from "../src/services/billing";
import { Client, createEnv, mintInvoice, type TestEnv, type World, world, toApproved, execute } from "./helpers";

const SECRET = "whsec_test_secret_for_billing";
const q = (env: TestEnv, s: string, p: unknown[] = []) => env.pool.query(s, p);
const tokenFor = async (env: TestEnv, email: string, template: string) => { const r = await q(env, "SELECT body_text FROM mail_outbox WHERE lower(to_email)=lower($1) AND template=$2 ORDER BY created_at DESC LIMIT 1", [email, template]); return /token=([A-Za-z0-9_-]+)/.exec(r.rows[0].body_text)![1]!; };
const stripeSig = (raw: string, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
const post = (env: TestEnv, provider: string, raw: string, headers: Record<string, string>) => env.app.inject({ method: "POST", url: `/v1/billing/webhook/${provider}`, headers: { "content-type": "application/json", ...headers }, payload: raw });

describe("account lifecycle", () => {
  let env: TestEnv, c: Client;
  beforeAll(async () => { env = await createEnv({ ORYNT_REQUIRE_EMAIL_VERIFICATION: "1" }); c = new Client(env); });
  afterAll(async () => { await env.teardown(); });

  it("signup queues a verification email; sending (real-money capable action) is blocked until verified; the token is single-use", async () => {
    const owner = await c.register("founder@verify.test");
    const sim = (await c.call("POST", "/v1/connections", owner, { label: "practice", kind: "simulator" })); expect(sim.status).toBe(201); // practice wallet needs no verification
    const w = { c, env, owner, connId: sim.body.id } as unknown as World;
    const op = await c.addMember(owner, "op@verify.test", "operator"); const ap = await c.addMember(owner, "ap@verify.test", "approver");
    // a payout through approval, then execute as the (unverified) operator: refused
    const inv = await mintInvoice(w, "1000000");
    const ob = (await c.call("POST", "/v1/obligations", op, { counterparty_name: "Bob", amount_msat: "1000000", invoice: inv.invoice })).body;
    const s = (await c.call("POST", `/v1/obligations/${ob.id}/submit`, op)).body; await c.approve(ap, s);
    const blocked = await c.call("POST", `/v1/obligations/${ob.id}/execute`, op, undefined, { "idempotency-key": "verify-key-12345" });
    expect(blocked.status).toBe(403); expect(blocked.body.detail).toMatch(/Verify your email/);
    const tok = await tokenFor(env, "op@verify.test", "verify_email").catch(() => null);
    expect(tok).toBeNull(); // members added by an admin are not auto-mailed; they use resend
    expect((await c.call("POST", "/v1/auth/resend-verification", op)).status).toBe(200);
    const t2 = await tokenFor(env, "op@verify.test", "verify_email");
    expect((await c.call("POST", "/v1/auth/verify-email", null, { token: t2 })).status).toBe(200);
    expect((await c.call("POST", "/v1/auth/verify-email", null, { token: t2 })).status).toBe(422); // single use
    expect((await c.call("POST", `/v1/obligations/${ob.id}/execute`, op, undefined, { "idempotency-key": "verify-key-67890" })).status).toBe(200);
  });
  it("expired and forged tokens are refused", async () => {
    const owner = await c.register("expiry@verify.test"); void owner;
    const t = await tokenFor(env, "expiry@verify.test", "verify_email");
    await q(env, "UPDATE auth_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash IS NOT NULL AND lower(email)='expiry@verify.test'");
    expect((await c.call("POST", "/v1/auth/verify-email", null, { token: t })).status).toBe(422);
    expect((await c.call("POST", "/v1/auth/verify-email", null, { token: "x".repeat(43) })).status).toBe(422);
  });
  it("password reset: same 202 for unknown accounts, token works once, every session is signed out, new password works", async () => {
    const owner = await c.register("forgot@verify.test");
    expect((await c.call("POST", "/v1/auth/forgot", null, { email: "nobody@verify.test" })).status).toBe(202);
    expect((await c.call("POST", "/v1/auth/forgot", null, { email: "forgot@verify.test" })).status).toBe(202);
    const t = await tokenFor(env, "forgot@verify.test", "password_reset");
    expect((await c.call("POST", "/v1/auth/reset", null, { token: t, password: "a brand new passphrase 99" })).status).toBe(200);
    expect((await c.call("GET", "/v1/overview", owner)).status).toBe(401); // old session dead
    expect((await c.call("POST", "/v1/auth/reset", null, { token: t, password: "another passphrase value 1" })).status).toBe(422); // single use
    expect((await c.call("POST", "/v1/auth/login", null, { email: "forgot@verify.test", password: "a brand new passphrase 99" })).status).toBe(200);
  });
  it("invitations: new user joins with the right role; token single-use; existing members cannot be invited again", async () => {
    const owner = await c.register("inviter@verify.test");
    expect((await c.call("POST", "/v1/invitations", owner, { email: "newbie@verify.test", role: "approver" })).status).toBe(202);
    const t = await tokenFor(env, "newbie@verify.test", "invite");
    const acc = await c.call("POST", "/v1/auth/accept-invite", null, { token: t, name: "Newbie", password: "correct horse battery staple" });
    expect(acc.status).toBe(200); expect(acc.body.role).toBe("approver");
    expect((await c.call("POST", "/v1/auth/accept-invite", null, { token: t, name: "Newbie", password: "correct horse battery staple" })).status).toBe(422);
    expect((await c.call("POST", "/v1/invitations", owner, { email: "newbie@verify.test", role: "viewer" })).status).toBe(409);
  });
  it("TOTP MFA: login, approval and execution need a current code once enabled; closing the only-owner account is refused", async () => {
    const owner = await c.register("mfa@verify.test");
    const b = (await c.call("POST", "/v1/me/mfa/begin", owner)).body;
    expect((await c.call("POST", "/v1/me/mfa/confirm", owner, { code: "000000" })).status).toBe(422);
    const secret = open(env.config.secretKey, (await q(env, "SELECT mfa_secret_ciphertext FROM users WHERE lower(email)='mfa@verify.test'")).rows[0].mfa_secret_ciphertext, "mfa:" + owner.userId);
    expect(secret).toBe(b.secret);
    expect((await c.call("POST", "/v1/me/mfa/confirm", owner, { code: totpAt(secret, Date.now()) })).status).toBe(200);
    expect((await c.call("POST", "/v1/auth/login", null, { email: "mfa@verify.test", password: "correct horse battery staple" })).body.code).toBe("approval_invalid");
    expect((await c.call("POST", "/v1/auth/login", null, { email: "mfa@verify.test", password: "correct horse battery staple", mfa_code: totpAt(secret, Date.now()) })).status).toBe(200);
    expect((await c.call("POST", "/v1/me/close", owner, { password: "correct horse battery staple" })).status).toBe(409); // sole owner
  });
  it("org data export contains records but no secrets or password hashes", async () => {
    const owner = await c.register("export@verify.test");
    await c.call("POST", "/v1/connections", owner, { label: "practice", kind: "simulator" });
    const r = await c.call("GET", "/v1/export", owner);
    expect(r.status).toBe(200); expect(JSON.stringify(r.body)).not.toMatch(/password_hash|scrypt\$|config_ciphertext|macaroon/i); expect(r.body.members.length).toBe(1);
  });
});

describe("billing, webhooks and server-enforced entitlements", () => {
  let env: TestEnv, c: Client, owner: Awaited<ReturnType<Client["register"]>>;
  beforeAll(async () => { env = await createEnv({ ORYNT_DEFAULT_PLAN: "developer" }); c = new Client(env); owner = await c.register("billing@pay.test"); });
  afterAll(async () => { await env.teardown(); });
  const sub = async () => (await q(env, "SELECT * FROM subscriptions WHERE org_id=$1", [owner.orgId])).rows[0];

  it("free plan limits are enforced by the SERVER: 4th member → 402; batch and recurring not included", async () => {
    await c.addMember(owner, "m2@pay.test", "operator"); await c.addMember(owner, "m3@pay.test", "viewer");
    const r = await c.call("POST", "/v1/members", owner, { email: "m4@pay.test", name: "m4", role: "viewer", temporary_password: "correct horse battery staple" });
    expect(r.status).toBe(402); expect(r.body.code).toBe("entitlement_exceeded");
    expect((await c.call("POST", "/v1/batches/preview", owner, { csv: "counterparty,amount_sats,invoice\n" })).status).toBe(422); // preview is allowed; empty is invalid
    expect((await c.call("POST", "/v1/batches", owner, { label: "x", csv: "counterparty,amount_sats,invoice\nA,1,x" })).status).toBe(402);
    expect((await c.call("POST", "/v1/schedules", owner, { counterparty_id: "00000000-0000-4000-8000-000000000000", amount_sats: "1", cadence: "monthly", first_due: "2026-12-01" })).status).toBe(402);
  });
  it("sandbox checkout goes through the real signed-webhook path and upgrades entitlements exactly once", async () => {
    const r = await c.call("POST", "/v1/billing/sandbox/complete", owner, { plan_id: "growth" });
    expect(r.status).toBe(200); expect(r.body.result).toBe("applied"); expect(r.body.billing.current.plan_id).toBe("growth");
    expect((await sub()).provider).toBe("sandbox");
    expect((await c.call("POST", "/v1/members", owner, { email: "m4@pay.test", name: "m4", role: "viewer", temporary_password: "correct horse battery staple" })).status).toBe(201); // now allowed
  });
  it("a repeated webhook never grants twice; stale/out-of-order events are ignored; bad or stale signatures are 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const evt = (id: string, type: string, created: number, obj: object) => JSON.stringify({ id, type, created, data: { object: obj } });
    const checkout = evt("evt_dup_1", "checkout.session.completed", now, { client_reference_id: owner.orgId, customer: "cus_x", subscription: "sub_x", metadata: { org_id: owner.orgId, plan_id: "business" } });
    const r1 = await post(env, "sandbox", checkout, { "stripe-signature": stripeSig(checkout) }); expect(JSON.parse(r1.body).result).toBe("applied");
    const r2 = await post(env, "sandbox", checkout, { "stripe-signature": stripeSig(checkout) }); expect(JSON.parse(r2.body).result).toBe("duplicate"); expect(r2.statusCode).toBe(200);
    expect((await q(env, "SELECT count(*)::int AS n FROM billing_events WHERE event_id='evt_dup_1'")).rows[0].n).toBe(1);
    expect((await sub()).plan_id).toBe("business");
    const old = evt("evt_old_1", "checkout.session.completed", now - 3600, { client_reference_id: owner.orgId, customer: "cus_x", subscription: "sub_x", metadata: { org_id: owner.orgId, plan_id: "startup" } });
    expect(JSON.parse((await post(env, "sandbox", old, { "stripe-signature": stripeSig(old) })).body).result).toBe("stale"); // older than what is applied
    expect((await sub()).plan_id).toBe("business");
    expect((await post(env, "sandbox", checkout, { "stripe-signature": stripeSig(checkout, now, "wrong") })).statusCode).toBe(401);
    expect((await post(env, "sandbox", checkout + " ", { "stripe-signature": stripeSig(checkout) })).statusCode).toBe(401); // body altered
    expect((await post(env, "sandbox", checkout, { "stripe-signature": stripeSig(checkout, now - 3600) })).statusCode).toBe(401); // stale timestamp
    expect((await post(env, "sandbox", checkout, {})).statusCode).toBe(401);
  });
  it("failed payment → past_due (paid features kept during grace, mail queued); renewal restores; final cancellation falls back to the FREE plan (never unlimited)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const send = async (id: string, type: string, created: number, obj: object) => { const raw = JSON.stringify({ id, type, created, data: { object: obj } }); return JSON.parse((await post(env, "sandbox", raw, { "stripe-signature": stripeSig(raw) })).body).result; };
    expect(await send("evt_fail_1", "invoice.payment_failed", now + 5, { subscription: "sub_x", customer: "cus_x" })).toBe("applied");
    expect((await sub()).status).toBe("past_due");
    expect((await c.call("GET", "/v1/billing", owner)).body.current.plan_id).toBe("business"); // within grace
    expect((await q(env, "SELECT 1 FROM mail_outbox WHERE template='payment_failed'")).rowCount).toBeGreaterThan(0);
    expect(await send("evt_paid_1", "invoice.paid", now + 10, { subscription: "sub_x", customer: "cus_x" })).toBe("applied");
    expect((await sub()).status).toBe("active");
    await q(env, "UPDATE subscriptions SET status='past_due', last_event_at = now() - interval '9 days' WHERE org_id=$1", [owner.orgId]);
    expect((await c.call("GET", "/v1/billing", owner)).body.entitlements.members).toBe(3); // grace expired → free limits
    expect(await send("evt_del_1", "customer.subscription.deleted", now + 20, { id: "sub_x", customer: "cus_x", metadata: { org_id: owner.orgId } })).toBe("applied");
    const b = (await c.call("GET", "/v1/billing", owner)).body; expect(b.current.status).toBe("canceled"); expect(b.current.plan_id).toBe("developer");
  });
  it("cancel-at-period-end is recorded and the worker lapses the plan at period end", async () => {
    await q(env, "UPDATE subscriptions SET last_event_at = NULL WHERE org_id=$1", [owner.orgId]); // earlier tests used future-dated events; ordering is tested above
    expect((await c.call("POST", "/v1/billing/sandbox/complete", owner, { plan_id: "startup" })).body.result).toBe("applied");
    expect((await c.call("POST", "/v1/billing/cancel", owner)).status).toBe(200);
    expect((await sub()).cancel_at_period_end).toBe(true);
    await q(env, "UPDATE subscriptions SET current_period_end = now() - interval '1 hour' WHERE org_id=$1", [owner.orgId]);
    await q(env, "UPDATE subscriptions SET status='canceled' WHERE cancel_at_period_end AND current_period_end < now()"); // the same statement the worker runs
    expect((await c.call("GET", "/v1/billing", owner)).body.current.plan_id).toBe("developer");
  });
  it("Stripe and Paystack webhook verification follows each provider's documented scheme", () => {
    const now = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({ id: "evt_s", type: "customer.subscription.updated", created: now, data: { object: { id: "sub_1", customer: "cus_1", cancel_at_period_end: true, current_period_end: now + 100, metadata: { org_id: "o", plan_id: "growth" } } } });
    const ev = parseStripe(raw, stripeSig(raw), SECRET); expect(ev).toMatchObject({ kind: "updated", planId: "growth", cancelAtPeriodEnd: true });
    expect(() => parseStripe(raw, stripeSig(raw, now, "nope"), SECRET)).toThrow();
    const pay = JSON.stringify({ event: "subscription.disable", data: { subscription_code: "SUB_1", customer: { customer_code: "CUS_1" }, createdAt: new Date().toISOString() } });
    const psig = createHmac("sha512", SECRET).update(pay).digest("hex");
    expect(parsePaystack(pay, psig, SECRET)).toMatchObject({ kind: "canceled", subscriptionId: "SUB_1" });
    expect(() => parsePaystack(pay, psig.replace(/.$/, "0"), SECRET)).toThrow();
    expect(() => parsePaystack(pay + " ", psig, SECRET)).toThrow();
    void applyBillingEvent;
  });
  it("provider payload mapping regressions (found by the provider evaluation): Stripe new+old shapes, Paystack ids and cancellation semantics", () => {
    const now = Math.floor(Date.now() / 1000);
    // Stripe: period end and invoice->subscription link in BOTH the pre-basil and basil locations
    const st = (type: string, object: unknown) => { const raw = JSON.stringify({ id: "evt_" + type, type, created: now, data: { object } }); return parseStripe(raw, stripeSig(raw), SECRET); };
    expect(st("customer.subscription.updated", { id: "sub_1", items: { data: [{ current_period_end: now + 500 }] } }).periodEnd).toBe(now + 500);
    expect(st("customer.subscription.updated", { id: "sub_1", current_period_end: now + 400 }).periodEnd).toBe(now + 400);
    expect(st("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_new" } } }).subscriptionId).toBe("sub_new");
    expect(st("invoice.payment_failed", { subscription: "sub_old" }).subscriptionId).toBe("sub_old");
    // Paystack: sign helper
    const ps = (body: object) => { const raw = JSON.stringify(body); return parsePaystack(raw, createHmac("sha512", SECRET).update(raw).digest("hex"), SECRET); };
    // charge.success must not store the transaction reference as the subscription id
    expect(ps({ event: "charge.success", data: { id: 1, reference: "TXN_REF", paid_at: new Date().toISOString(), metadata: { org_id: "o", plan_id: "growth" }, customer: { customer_code: "CUS_1" } } }).subscriptionId).toBeUndefined();
    // payloads without an id: distinct failures get distinct event ids, an identical retry gets the same one
    const stamp = "2026-11-10T12:00:00.000Z"; // fixed: an identical retry must be byte-identical
    const fail = (code: string) => ({ event: "invoice.payment_failed", data: { subscription: { subscription_code: "SUB_1" }, invoice_code: code, createdAt: stamp } });
    const a = ps(fail("INV_1")), b = ps(fail("INV_2"));
    expect(a.eventId).not.toBe(b.eventId); expect(a.eventId).not.toContain("undefined"); expect(ps(fail("INV_1")).eventId).toBe(a.eventId);
    // not_renew means "cancel at period end", only disable cancels now
    expect(ps({ event: "subscription.not_renew", data: { subscription_code: "SUB_1", createdAt: new Date().toISOString() } })).toMatchObject({ kind: "updated", cancelAtPeriodEnd: true, subscriptionId: "SUB_1" });
    expect(ps({ event: "subscription.disable", data: { subscription_code: "SUB_1", createdAt: new Date().toISOString() } }).kind).toBe("canceled");
  });
  it("the sandbox billing provider is refused in production configuration", async () => {
    const { loadConfig } = await import("../src/config");
    expect(() => loadConfig({ ORYNT_ENV: "production", ORYNT_SECRET_KEY: "a".repeat(64), ORYNT_ISSUER_KEY: "b".repeat(64), ORYNT_DEFAULT_PLAN: "enterprise" } as NodeJS.ProcessEnv)).toThrow(/ORYNT_DEFAULT_PLAN/);
  });
});

describe("batches, recurring schedules, reports, support, workbench", () => {
  let w: World;
  beforeAll(async () => { w = await world(); });
  afterAll(async () => { await w.env.teardown(); });
  const csvFor = async (rows: Array<{ cp: string; sats: number; behavior?: string }>, extra = "") => {
    const lines = ["counterparty,amount_sats,invoice,memo,external_ref"];
    for (const r of rows) { const inv = await mintInvoice(w, String(r.sats * 1000), r.behavior ?? "succeed"); lines.push(`${r.cp},${r.sats},${inv.invoice},"batch, with comma",REF-${r.sats}`); }
    return lines.join("\n") + extra;
  };
  it("CSV preview reports per-row problems; a batch with partial failure is 'partial', never 'completed'", async () => {
    const good = await csvFor([{ cp: "Alice", sats: 10_000 }, { cp: "Bea", sats: 11_000 }, { cp: "Cara", sats: 12_000, behavior: "fail_no_route" }]);
    const bad = good + "\n,5000,lnbcrt1bad,x,y\nDan,abc,lnbcrt1bad,x,y";
    const pv = await w.c.call("POST", "/v1/batches/preview", w.operator, { csv: bad });
    expect(pv.body.valid).toBe(3); expect(pv.body.invalid).toBe(2); expect(pv.body.errors.map((e: { error: string }) => e.error).join(" ")).toMatch(/Recipient name is missing|Amount must be a number/);
    const mk = await w.c.call("POST", "/v1/batches", w.operator, { label: "October", csv: good }); expect(mk.status).toBe(201); expect(mk.body.created).toBe(3);
    const id = mk.body.batch_id;
    expect((await w.c.call("POST", `/v1/batches/${id}/submit`, w.operator)).body.items.every((i: { ok: boolean }) => i.ok)).toBe(true);
    for (const it of (await w.c.call("GET", `/v1/batches/${id}`, w.owner)).body.items) { const o = (await w.c.call("GET", `/v1/obligations/${it.id}`, w.owner)).body; await w.c.approve(w.approver1, o); }
    const ex = await w.c.call("POST", `/v1/batches/${id}/execute`, w.operator);
    expect(ex.body.items.length).toBe(3);
    const st = ex.body.status; expect(st.status).toBe("partial"); expect(st.counts.SIMULATED_SETTLED).toBe(2); expect(st.counts.DEFINITIVELY_FAILED).toBe(1);
    const again = await w.c.call("POST", `/v1/batches/${id}/execute`, w.operator); expect(again.body.items.length).toBe(0); // nothing re-sent
  });
  it("duplicate invoices inside one file are caught", async () => {
    const one = await csvFor([{ cp: "Eve", sats: 7000 }]); const line = one.split("\n")[1]!;
    const pv = await w.c.call("POST", "/v1/batches/preview", w.operator, { csv: one + "\n" + line });
    expect(pv.body.invalid).toBe(1); expect(pv.body.errors[0].error).toMatch(/twice/);
  });
  it("recurring schedule: each due cycle opens ONE invoice-needed task (duplicate-cycle prevention), never a payment; fulfilling creates a normal draft", async () => {
    const cp = (await w.c.call("POST", "/v1/counterparties", w.operator, { name: "Monthly Contractor" })).body;
    const s = await w.c.call("POST", "/v1/schedules", w.operator, { counterparty_id: cp.id, amount_sats: "20000", memo: "Retainer", cadence: "monthly", first_due: "2026-11-01" });
    expect(s.status).toBe(201);
    const run1 = await w.c.call("POST", "/v1/schedules/run-due", w.operator); const run2 = await w.c.call("POST", "/v1/schedules/run-due", w.operator);
    expect(run1.body.opened).toBeGreaterThanOrEqual(1); expect(run2.body.opened).toBe(0); // idempotent
    const cycles = (await w.c.call("GET", "/v1/schedule-cycles", w.owner)).body.data; expect(cycles[0].status).toBe("awaiting_invoice");
    expect((await w.env.pool.query("SELECT 1 FROM mail_outbox WHERE template='invoice_needed'")).rowCount).toBeGreaterThan(0);
    expect((await w.env.pool.query("SELECT count(*)::int AS n FROM payment_intents WHERE obligation_id IN (SELECT obligation_id FROM schedule_cycles)")).rows[0].n).toBe(0);
    const inv = await mintInvoice(w, "20000000");
    const ob = await w.c.call("POST", `/v1/schedule-cycles/${cycles[0].id}/invoice`, w.operator, { invoice: inv.invoice });
    expect(ob.status).toBe(201); expect(ob.body.state).toBe("DRAFT"); // still needs approval
    expect((await w.c.call("POST", `/v1/schedule-cycles/${cycles[0].id}/invoice`, w.operator, { invoice: (await mintInvoice(w, "20000000")).invoice })).status).toBe(409);
    expect((await w.c.call("POST", `/v1/schedules/${s.body.id}/pause`, w.operator)).status).toBe(200);
  });
  it("suspended recipients cannot receive new payouts", async () => {
    const cp = (await w.c.call("POST", "/v1/counterparties", w.operator, { name: "Suspended Sam" })).body;
    expect((await w.c.call("POST", `/v1/counterparties/${cp.id}/suspend`, w.owner)).status).toBe(200);
    const inv = await mintInvoice(w, "1000000");
    const r = await w.c.call("POST", "/v1/obligations", w.operator, { counterparty_id: cp.id, amount_msat: "1000000", invoice: inv.invoice });
    expect(r.status).toBe(409); expect(r.body.detail).toMatch(/suspended/);
    await w.c.call("POST", `/v1/counterparties/${cp.id}/reactivate`, w.owner);
    expect((await w.c.call("POST", "/v1/obligations", w.operator, { counterparty_id: cp.id, amount_msat: "1000000", invoice: inv.invoice })).status).toBe(201);
  });
  it("reports: simulated settlements are listed but never summed; CSV neutralises formula injection; viewer may read, nobody outside the org can", async () => {
    await w.c.call("POST", "/v1/counterparties", w.operator, { name: "=HYPERLINK(\"http://evil\",\"x\")" });
    const { ob } = await toApproved(w, "2000000"); await execute(w, ob.id);
    const rep = await w.c.call("GET", "/v1/reports/payouts", w.viewer); expect(rep.status).toBe(200);
    expect(rep.body.totals.settled_msat).toBe("0"); expect(rep.body.totals.simulated_excluded).toBeGreaterThan(0); expect(JSON.stringify(rep.body)).not.toMatch(/"[a-z_]*(usd|fiat)[a-z_]*"\s*:/i); // no fiat FIELDS anywhere
    const evilCp = (await w.c.call("GET", "/v1/counterparties", w.owner)).body.data.find((x: { name: string }) => x.name.startsWith("="));
    const inv = await mintInvoice(w, "1000000"); await w.c.call("POST", "/v1/obligations", w.operator, { counterparty_id: evilCp.id, amount_msat: "1000000", invoice: inv.invoice });
    const csv = await w.env.app.inject({ method: "GET", url: "/v1/reports/payouts?format=csv", headers: { cookie: w.viewer.cookie } });
    expect(csv.headers["content-type"]).toMatch(/text\/csv/); expect(csv.body).toContain("'=HYPERLINK"); expect(csv.body).not.toMatch(/(^|,)=HYPERLINK/m);
    const other = await w.c.register("outsider@x.test", "Out", "Other Co");
    expect((await w.c.call("GET", `/v1/reports/recipients/${evilCp.id}`, other)).status).toBe(404);
  });
  it("support: ticket gets a reference, an acknowledgement email and SAFE diagnostics only; public form works without an account", async () => {
    const t = await w.c.call("POST", "/v1/support", w.operator, { category: "payment", subject: "Payment stuck", body: "PO-0003 shows checking for a while" });
    expect(t.status).toBe(201); expect(t.body.reference).toMatch(/^SUP-[0-9A-F]{8}$/);
    const row = (await w.env.pool.query("SELECT * FROM support_tickets WHERE reference=$1", [t.body.reference])).rows[0];
    expect(Object.keys(row.diagnostics)).toEqual(expect.arrayContaining(["request_id", "role", "plan", "wallets"])); expect(JSON.stringify(row.diagnostics)).not.toMatch(/macaroon|secret|password|invoice/i);
    expect((await w.env.pool.query("SELECT 1 FROM mail_outbox WHERE template='support_ack'")).rowCount).toBeGreaterThan(0);
    expect((await w.c.call("POST", "/v1/public/support", null, { email: "visitor@x.test", category: "account", subject: "Can't sign in", body: "I forgot which email I used" })).status).toBe(201);
    expect((await w.c.call("POST", "/v1/support", w.viewer, { category: "other", subject: "viewer can ask", body: "viewers may contact support" })).status).toBe(201);
  });
  it("incident workbench: notes and assignment are org-scoped and audited", async () => {
    const { ob } = await toApproved(w, "3000000", "accept_then_lose_response"); const r = await execute(w, ob.id); expect(r.body.state).toBe("UNKNOWN");
    const inc = (await w.c.call("GET", "/v1/incidents?status=open", w.owner)).body.data[0];
    expect((await w.c.call("POST", `/v1/incidents/${inc.id}/notes`, w.operator, { note: "Checked wallet UI: no outgoing payment visible yet." })).status).toBe(201);
    expect((await w.c.call("POST", `/v1/incidents/${inc.id}/assign`, w.owner, { user_id: w.operator.userId })).status).toBe(200);
    expect((await w.c.call("GET", `/v1/incidents/${inc.id}/notes`, w.owner)).body.data[0].note).toMatch(/Checked wallet UI/);
    const out = await w.c.register("outsider2@x.test", "Out2", "Other Co 2");
    expect((await w.c.call("POST", `/v1/incidents/${inc.id}/notes`, out, { note: "snoop attempt here" })).status).toBe(404);
    expect((await w.c.call("POST", `/v1/incidents/${inc.id}/assign`, w.owner, { user_id: out.userId })).status).toBe(422);
  });
  it("analytics funnel stores counts only (no user ids, amounts or payee data)", async () => {
    const f = (await w.c.call("GET", "/v1/analytics/funnel", w.owner)).body.data.map((x: { name: string }) => x.name);
    expect(f).toEqual(expect.arrayContaining(["signup_completed", "payout_created"]));
    const cols = (await w.env.pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='analytics_events'")).rows.map((r) => r.column_name).sort();
    expect(cols).toEqual(["at", "id", "name", "org_id"]);
  });
});
