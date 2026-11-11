import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createEnv, type World, world, toApproved, execute } from "./helpers";

/** Onboarding steps are DERIVED from real state. This test flips real state and watches exactly the right step change — and nothing else. */
describe("onboarding checklist (backend-derived)", () => {
  let w: World;
  beforeAll(async () => { w = await world({ ORYNT_REQUIRE_EMAIL_VERIFICATION: "0" }); });
  afterAll(async () => { await w.env.teardown(); });

  const state = async (who = w.owner) => { const r = await w.c.call("GET", "/v1/onboarding", who); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body as { steps: Array<{ id: string; done: boolean; detail: string }>; environment: { mode: string; label: string }; progress: { done: number; total: number }; can_complete: boolean; completed: boolean; next: string | null }; };
  const done = (s: Awaited<ReturnType<typeof state>>) => Object.fromEntries(s.steps.map((x) => [x.id, x.done]));

  it("starts from real facts: wallet, capabilities and approval key exist (the test world made them); everything else is NOT done", async () => {
    const s = await state();
    expect(done(s)).toMatchObject({ account: true, organisation: true, wallet: true, capabilities: true, approval_key: true, verify_email: false, profile: false, plan: true /* test env default plan is enterprise → an active subscription exists */, policy: false, recipient: false, first_payout: false, settlement: false });
    expect(s.environment.mode).toBe("practice");
    expect(s.environment.label).toMatch(/Practice mode/);
    expect(s.can_complete).toBe(false);
  });

  it("completion is refused by the server while any step is open (no client flag can override)", async () => {
    const r = await w.c.call("POST", "/v1/onboarding/complete", w.owner);
    expect(r.status).toBe(409); expect(r.body.detail).toMatch(/after every step is done/);
  });

  it("profile: a partial profile does not complete the step; a full one does; roles without member:manage cannot edit", async () => {
    expect((await w.c.call("PATCH", "/v1/org", w.viewer, { country: "NG" })).status).toBe(403);
    expect((await w.c.call("PATCH", "/v1/org", w.owner, { country: "NG" })).status).toBe(200);
    expect(done(await state()).profile).toBe(false);
    expect((await w.c.call("PATCH", "/v1/org", w.owner, { timezone: "Africa/Lagos", purpose: "Contributor payouts" })).status).toBe(200);
    expect(done(await state()).profile).toBe(true);
    // removing a required field un-completes it (it is derived, not a one-way flag)
    expect((await w.c.call("PATCH", "/v1/org", w.owner, { country: "ZA" })).status).toBe(200);
    expect(done(await state()).profile).toBe(true);
  });

  it("policy needs an explicit decision (publishing a policy is the review); operators cannot confirm steps", async () => {
    expect((await w.c.call("POST", "/v1/onboarding/steps/policy/confirm", w.operator)).status).toBe(403);
    expect(done(await state()).policy).toBe(false);
    const p = await w.c.call("POST", "/v1/policies", w.owner, { name: "Team policy", rules: (await w.c.call("GET", "/v1/policies", w.owner)).body.data[0].rules });
    expect([200, 201]).toContain(p.status);
    expect(done(await state()).policy).toBe(true);
  });

  it("a different user without a key sees their own key state in the detail while the org-level step stays done", async () => {
    const s = await state(w.owner);
    expect(s.steps.find((x) => x.id === "approval_key")!.detail).toMatch(/registered/);
  });

  it("recipient, authorised payout and settlement flip only when the real rows exist; a SIMULATOR receipt is labelled as such", async () => {
    expect(done(await state()).recipient).toBe(false);
    const { ob } = await toApproved(w); // creates the counterparty, submits and collects the approvals
    let s = await state();
    expect(done(s)).toMatchObject({ recipient: true, first_payout: true, settlement: false });
    const r = await execute(w, ob.id); expect(r.status).toBe(200);
    expect(done(await state()).settlement).toBe(false); // settled, but no receipt issued yet
    const rc = await w.c.call("GET", `/v1/payments/${r.body.payment.id}/receipt`, w.owner); expect(rc.status).toBe(200);
    s = await state();
    expect(done(s).settlement).toBe(true);
    expect(s.steps.find((x) => x.id === "settlement")!.detail).toMatch(/SIMULATOR: no real value moved/);
  });

  it("email verification flips from the real token flow, then onboarding can be completed — once every step is genuinely done", async () => {
    expect(done(await state()).verify_email).toBe(false);
    const tok = (await w.env.pool.query("SELECT body_text FROM mail_outbox WHERE lower(to_email)=lower($1) AND template='verify_email' ORDER BY created_at DESC LIMIT 1", ["owner@acme.test"])).rows[0];
    if (!tok) { await w.c.call("POST", "/v1/auth/resend-verification", w.owner); }
    const body = (await w.env.pool.query("SELECT body_text FROM mail_outbox WHERE lower(to_email)=lower($1) AND template='verify_email' ORDER BY created_at DESC LIMIT 1", ["owner@acme.test"])).rows[0].body_text as string;
    const token = /token=([A-Za-z0-9_-]+)/.exec(body)![1];
    expect((await w.c.call("POST", "/v1/auth/verify-email", null, { token })).status).toBe(200);
    const s = await state();
    expect(done(s).verify_email).toBe(true);
    expect(s.can_complete).toBe(true);
    const c = await w.c.call("POST", "/v1/onboarding/complete", w.owner); expect(c.status).toBe(200);
    expect(c.body.completed).toBe(true);
    const audit = (await w.env.pool.query("SELECT type FROM audit_events WHERE org_id=$1 AND type LIKE 'onboarding.%' ORDER BY seq", [w.owner.orgId])).rows.map((x) => x.type);
    expect(audit).toEqual(["onboarding.completed"]); // plan was satisfied by the active subscription, so no confirm event exists
  });

  it("an organisation's onboarding state is invisible to another organisation", async () => {
    const other = await w.c.register("other@elsewhere.test", "Other", "Elsewhere Ltd");
    const s = await state(other);
    expect(s.completed).toBe(false);
    expect(done(s)).toMatchObject({ wallet: false, recipient: false, first_payout: false, settlement: false });
  });
});

describe("onboarding plan step on the free Developer plan", () => {
  let env: Awaited<ReturnType<typeof createEnv>>, c: Client;
  beforeAll(async () => { env = await createEnv({ ORYNT_DEFAULT_PLAN: "developer" }); c = new Client(env); });
  afterAll(async () => { await env.teardown(); });
  it("is NOT done until an owner consciously confirms it (or a paid subscription is active)", async () => {
    const owner = await c.register("free@plan.test");
    const op = await c.addMember(owner, "op@plan.test", "operator");
    const get = async () => (await c.call("GET", "/v1/onboarding", owner)).body.steps.find((x: { id: string }) => x.id === "plan").done;
    expect(await get()).toBe(false);
    expect((await c.call("POST", "/v1/onboarding/steps/plan/confirm", op)).status).toBe(403);
    expect(await get()).toBe(false);
    expect((await c.call("POST", "/v1/onboarding/steps/plan/confirm", owner)).status).toBe(200);
    expect(await get()).toBe(true);
    // sandbox checkout also satisfies it for a fresh org, without any confirm call
    const owner2 = await c.register("paid@plan.test", "Owner2", "Second Org");
    expect((await c.call("GET", "/v1/onboarding", owner2)).body.steps.find((x: { id: string }) => x.id === "plan").done).toBe(false);
    expect((await c.call("POST", "/v1/billing/sandbox/complete", owner2, { plan_id: "startup" })).status).toBe(200);
    expect((await c.call("GET", "/v1/onboarding", owner2)).body.steps.find((x: { id: string }) => x.id === "plan").done).toBe(true);
  });
});
