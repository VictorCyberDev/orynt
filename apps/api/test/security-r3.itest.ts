import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totpAt } from "../src/lib/totp";
import { open } from "../src/lib/box";
import { generateKeyPair, signMessage } from "@orynt/core";
import { keyProofMessage } from "../src/services/auth";
import { Client, createEnv, type TestEnv, type World, world, toApproved, newDraft } from "./helpers";

/** Regression tests for the R3 independent security review (AI-assisted, not a penetration test). */
describe("MFA step-up coverage, replay and lockout (review H1, H2, M8)", () => {
  let w: World;
  const q = (s: string, p: unknown[] = []) => w.env.pool.query(s, p);
  const secretOf = async (userId: string) => open(w.env.config.secretKey, (await q("SELECT mfa_secret_ciphertext FROM users WHERE id=$1", [userId])).rows[0].mfa_secret_ciphertext, "mfa:" + userId);
  const resetSteps = () => q("UPDATE users SET mfa_last_step=NULL, mfa_failures=0, mfa_locked_until=NULL");
  let secret: string;
  const code = (offsetSteps = 0) => totpAt(secret, Date.now() + offsetSteps * 30000);
  const H = (c: string) => ({ "x-orynt-mfa-code": c });
  beforeAll(async () => {
    w = await world();
    // the OWNER turns MFA on (owners can execute, retry, mint keys and register keys); the approvers stay without MFA
    await w.c.call("POST", "/v1/me/mfa/begin", w.owner);
    secret = await secretOf(w.owner.userId);
    expect((await w.c.call("POST", "/v1/me/mfa/confirm", w.owner, { code: code() })).status).toBe(200);
    await resetSteps();
  });
  afterAll(async () => { await w.env.teardown(); });

  it("every sensitive action refuses a user who has MFA but sends no code — including batch execute, retry, confirm-not-sent, API-key minting and approval-key registration", async () => {
    const ob = (await toApproved(w)).ob;
    const none = [
      await w.c.call("POST", `/v1/obligations/${ob.id}/execute`, w.owner, undefined, { "idempotency-key": "r3-mfa-0001" }),
      await w.c.call("POST", `/v1/batches/00000000-0000-4000-8000-000000000000/execute`, w.owner, undefined, { "idempotency-key": "r3-mfa-0002" }),
      await w.c.call("POST", `/v1/payments/00000000-0000-4000-8000-000000000000/retry`, w.owner, undefined, { "idempotency-key": "r3-mfa-0003" }),
      await w.c.call("POST", `/v1/payments/00000000-0000-4000-8000-000000000000/confirm-not-sent`, w.owner, { note: "checked the wallet record manually" }),
      await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "ci", role: "operator" }),
    ];
    for (const r of none) { expect(r.status, JSON.stringify(r.body)).toBe(401); expect(r.body.mfa_required).toBe(true); }
    // with a valid code the MFA gate passes (the action itself is judged on its own merits: execute succeeds)
    await resetSteps();
    const ok = await w.c.call("POST", `/v1/obligations/${ob.id}/execute`, w.owner, undefined, { "idempotency-key": "r3-mfa-0004", ...H(code()) });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("an MFA user cannot mint an API key (the bypass route) without a fresh code; with one, the key is created", async () => {
    await resetSteps();
    expect((await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "ci", role: "operator" })).status).toBe(401);
    const k = await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "ci", role: "operator" }, H(code()));
    expect(k.status, JSON.stringify(k.body)).toBe(201);
  });

  it("a TOTP code works once: replaying it is refused", async () => {
    await resetSteps();
    const c1 = code();
    const first = await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "k1", role: "viewer" }, H(c1));
    expect(first.status).toBe(201);
    const replay = await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "k2", role: "viewer" }, H(c1));
    expect(replay.status).toBe(401); expect(replay.body.detail).toMatch(/already used/);
  });

  it("five wrong codes lock MFA checks; even a correct code is refused while locked (brute-force limit)", async () => {
    await resetSteps();
    for (let i = 0; i < 5; i++) expect((await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "x", role: "viewer" }, H("000000"))).status).toBe(401);
    const locked = await w.c.call("POST", `/v1/api-keys`, w.owner, { name: "x", role: "viewer" }, H(code()));
    expect(locked.status).toBe(429);
    await resetSteps();
  });

  it("approval-key registration is a step-up action: a stolen session cannot silently swap the approver's key", async () => {
    await resetSteps();
    const kp = generateKeyPair();
    const body = { public_key: kp.publicKey, proof_signature: signMessage(kp.privateKey, "orynt.key-registration.v1", keyProofMessage(w.owner.orgId, kp.publicKey)) };
    expect((await w.c.call("POST", "/v1/me/approval-key", w.owner, body)).status).toBe(401);
    expect((await w.c.call("POST", "/v1/me/approval-key", w.owner, body, H(code()))).status).toBe(200);
  });

  it("organisation MFA policy: privileged roles without MFA are refused sensitive actions; only an owner can set the policy", async () => {
    const { ob: draft } = await newDraft(w);
    const submitted = (await w.c.call("POST", `/v1/obligations/${draft.id}/submit`, w.operator)).body; // prepared BEFORE the policy is switched on
    await resetSteps();
    expect((await w.c.call("PATCH", "/v1/org", w.operator, { require_mfa: true })).status).toBe(403);
    expect((await w.c.call("PATCH", "/v1/org", w.owner, { require_mfa: true }, H(code()))).status).toBe(200);
    const r = await w.c.call("POST", `/v1/obligations/${submitted.id}/approve`, w.approver1, { intent_digest: submitted.intent_digest, signed_at: new Date().toISOString(), signature: "00".repeat(64) });
    expect(r.status).toBe(403); expect(r.body.mfa_enrollment_required).toBe(true); // the approver has no MFA → must enrol before approving
    await resetSteps();
    expect((await w.c.call("PATCH", "/v1/org", w.owner, { require_mfa: false })).status).toBe(401); // changing the 2FA policy is itself a step-up action
    expect((await w.c.call("PATCH", "/v1/org", w.owner, { require_mfa: false }, H(code()))).status).toBe(200);
  });
});

describe("tenant scoping of schedule runs; consent for membership; mail text (review M1, M2, M3)", () => {
  let env: TestEnv, c: Client;
  beforeAll(async () => { env = await createEnv(); c = new Client(env); });
  afterAll(async () => { await env.teardown(); });

  it("an operator's run-due only opens cycles for their own organisation", async () => {
    const a = await c.register("a@one.test", "A", "Org One"), b = await c.register("b@two.test", "B", "Org Two");
    const mk = async (who: typeof a) => {
      const cp = (await c.call("POST", "/v1/counterparties", who, { name: "Payee", notes: "" })).body;
      const conn = (await c.call("POST", "/v1/connections", who, { label: "p", kind: "simulator" })).body;
      const s = await c.call("POST", "/v1/schedules", who, { counterparty_id: cp.id, wallet_connection_id: conn.id, amount_sats: "1000", cadence: "monthly", first_due: "2020-01-01", memo: "x" });
      expect(s.status, JSON.stringify(s.body)).toBe(201);
    };
    await mk(a); await mk(b);
    const r = await c.call("POST", "/v1/schedules/run-due", a);
    expect(r.status).toBe(200);
    const cyclesA = (await c.call("GET", "/v1/schedule-cycles", a)).body.data.length, cyclesB = (await c.call("GET", "/v1/schedule-cycles", b)).body.data.length;
    expect(cyclesA).toBeGreaterThan(0);
    expect(cyclesB).toBe(0); // org Two's schedule was NOT touched by org One's caller
  });

  it("adding an existing account by e-mail is refused (membership needs the person's own acceptance) and leaks no user data", async () => {
    const owner = await c.register("boss@three.test", "Boss", "Org Three");
    await c.register("victim@elsewhere.test", "Victim Person", "Elsewhere Org");
    const r = await c.call("POST", "/v1/members", owner, { email: "victim@elsewhere.test", name: "x", role: "admin", temporary_password: "correct horse battery staple" });
    expect(r.status).toBe(409); expect(JSON.stringify(r.body)).not.toMatch(/Victim Person/);
    expect((await c.call("GET", "/v1/members", owner)).body.data.some((m: { email: string }) => m.email === "victim@elsewhere.test")).toBe(false);
  });

  it("invitation mail strips control characters and newlines from organisation and inviter names", async () => {
    const owner = await c.register("inj@four.test", "Mallory\r\nBcc: x@evil.test", "Evil\nCorp");
    expect((await c.call("POST", "/v1/invitations", owner, { email: "target@four.test", role: "viewer" })).status).toBe(202);
    const m = (await env.pool.query("SELECT subject, body_text FROM mail_outbox WHERE to_email='target@four.test' AND template='invite'")).rows[0];
    expect(m.subject).not.toMatch(/[\r\n]/); // names are flattened to one line: no way to start a new header or paragraph from a name
    expect(m.body_text.split("\n").length).toBe(2);
  });

  it("the public support acknowledgement does not echo attacker-chosen text", async () => {
    const r = await c.call("POST", "/v1/public/support", null, { email: "someone@five.test", category: "other", subject: "CLICK https://evil.example/pay NOW", body: "please help me with a long enough message" });
    expect(r.status).toBe(201);
    const m = (await env.pool.query("SELECT body_text FROM mail_outbox WHERE to_email='someone@five.test' AND template='support_ack'")).rows[0];
    expect(m.body_text).not.toMatch(/evil\.example/);
  });
});

describe("wallet connections re-vet the destination at connect time (review M9, DNS rebinding)", () => {
  it("the connect-time lookup refuses loopback/private/metadata addresses unless private targets are explicitly allowed", async () => {
    const { vettedLookup } = await import("../src/services/providers");
    const resolve = (allow: boolean, host: string) => new Promise<{ err: Error | null; out: unknown }>((r) => vettedLookup(allow)(host, { family: 4 } as never, ((err: Error | null, a: unknown) => r({ err, out: a })) as never));
    const denied = await resolve(false, "localhost");
    expect(denied.err?.message).toMatch(/not allowed/);
    expect((await resolve(false, "169.254.169.254")).err?.message).toMatch(/not allowed/); // cloud metadata address literal
    expect((await resolve(true, "localhost")).err).toBeNull(); // development/regtest opt-in
  });
});

describe("production fails closed on placeholder providers (review L7)", () => {
  const base = { ORYNT_ENV: "production", ORYNT_SECRET_KEY: "a".repeat(64), ORYNT_ISSUER_KEY: "b".repeat(64), DATABASE_URL: "postgres://x/y" };
  it("refuses to start with sandbox billing, log mail or a non-https public URL unless staging explicitly acknowledges it", async () => {
    const { loadConfig } = await import("../src/config");
    expect(() => loadConfig({ ...base })).toThrow(/uncommissioned settings.*ORYNT_BILLING_PROVIDER.*ORYNT_MAIL_PROVIDER.*ORYNT_APP_URL/s);
    expect(() => loadConfig({ ...base, ORYNT_BILLING_PROVIDER: "stripe", ORYNT_MAIL_PROVIDER: "resend", ORYNT_APP_URL: "http://example.com" })).toThrow(/ORYNT_APP_URL/);
    expect(loadConfig({ ...base, ORYNT_ALLOW_UNCOMMISSIONED: "1" }).env).toBe("production"); // explicit staging acknowledgement
    expect(loadConfig({ ...base, ORYNT_BILLING_PROVIDER: "stripe", ORYNT_MAIL_PROVIDER: "resend", ORYNT_APP_URL: "https://app.example.com" }).billingProvider).toBe("stripe");
    expect(() => loadConfig({ ...base, ORYNT_ALLOW_UNCOMMISSIONED: "1", ORYNT_FAILPOINTS: "1" })).toThrow(/FAILPOINTS/); // the acknowledgement does not weaken other guards
    expect(() => loadConfig({ ...base, ORYNT_ALLOW_UNCOMMISSIONED: "1", ORYNT_DEFAULT_PLAN: "enterprise" })).toThrow(/ORYNT_DEFAULT_PLAN/);
  });
});
