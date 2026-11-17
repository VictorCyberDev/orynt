import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createEnv, type TestEnv } from "./helpers";

/** Sandbox provider only: these prove OUR rules (guards, entitlements, history). They say nothing about a real billing provider. */
describe("plan change journeys (sandbox provider)", () => {
  let env: TestEnv, c: Client, owner: Awaited<ReturnType<Client["register"]>>;
  const plan = async () => (await c.call("GET", "/v1/billing", owner)).body.current.plan_id as string;
  beforeAll(async () => {
    env = await createEnv({ ORYNT_DEFAULT_PLAN: "developer" });
    c = new Client(env);
    owner = await c.register("journeys@pay.test");
  });
  afterAll(async () => {
    await env.teardown();
  });

  it("upgrade: free → paid through checkout, then paid → higher paid through change-plan; entitlements follow the verified event", async () => {
    expect(await plan()).toBe("developer");
    expect((await c.call("POST", "/v1/billing/sandbox/complete", owner, { plan_id: "startup" })).status).toBe(
      200,
    );
    expect(await plan()).toBe("startup");
    const up = await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "growth" });
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body).toMatchObject({ mode: "applied", direction: "upgrade" });
    expect(up.body.billing.current.plan_id).toBe("growth");
    expect(up.body.billing.entitlements.members).toBe(15);
  });

  it("refusals: same plan, unknown plan, the free plan (that is cancellation), by-arrangement plans, and roles without billing:manage", async () => {
    expect((await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "growth" })).status).toBe(409);
    expect((await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "nope" })).status).toBe(404);
    expect((await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "developer" })).status).toBe(
      409,
    );
    expect((await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "enterprise" })).status).toBe(
      409,
    );
    const viewer = await c.addMember(owner, "viewer@pay.test", "viewer");
    expect((await c.call("POST", "/v1/billing/change-plan", viewer, { plan_id: "startup" })).status).toBe(
      403,
    );
    expect(await plan()).toBe("growth");
  });

  it("downgrade is refused while usage exceeds the target plan (nothing is silently over-limit), and allowed once the excess is removed", async () => {
    for (let i = 0; i < 5; i++) await c.addMember(owner, `m${i}@pay.test`, "viewer"); // owner + viewer + 5 = 7 members; Startup allows 5
    const refused = await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "startup" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("entitlement_exceeded");
    expect(refused.body.over_limit[0]).toMatchObject({ dimension: "members", used: 7, allowed: 5 });
    expect(await plan()).toBe("growth"); // unchanged
    const members = (await c.call("GET", "/v1/members", owner)).body.data as Array<{
      id: string;
      user: { email: string };
    }>;
    for (const m of members.filter((x) => /^m[01]@/.test(x.user.email)))
      expect((await c.call("PATCH", `/v1/members/${m.id}`, owner, { status: "revoked" })).status).toBe(200);
    const down = await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "startup" });
    expect(down.status, JSON.stringify(down.body)).toBe(200);
    expect(down.body).toMatchObject({ mode: "applied", direction: "downgrade" });
    expect(await plan()).toBe("startup");
  });

  it("history lists the verified events applied to this organisation only; the portal is honest about the sandbox", async () => {
    const h = await c.call("GET", "/v1/billing/history", owner);
    expect(h.status).toBe(200);
    expect(
      h.body.data.filter((e: { event: string }) => e.event === "activated").length,
    ).toBeGreaterThanOrEqual(3);
    expect(h.body.data[0].provider_event_id).toMatch(/^evt_sbx_/);
    const other = await c.register("someone@else.test", "S", "Else Org");
    expect((await c.call("GET", "/v1/billing/history", other)).body.data.length).toBe(0);
    const portal = await c.call("POST", "/v1/billing/portal", owner);
    expect(portal.status).toBe(200);
    expect(portal.body).toMatchObject({ mode: "sandbox", url: null });
  });

  it("a paid plan never enables mainnet or wallet commissioning: those are server settings, not entitlements", async () => {
    expect(env.config.allowMainnet).toBe(false);
    const e = (await c.call("GET", "/v1/billing", owner)).body.entitlements as Record<string, unknown>;
    expect(Object.keys(e)).not.toEqual(expect.arrayContaining(["mainnet", "allow_mainnet", "real_funds"]));
  });
});

describe("moving off a by-arrangement plan", () => {
  it("enterprise → priced plan counts as a downgrade and is checked against current usage", async () => {
    const env = await createEnv({ ORYNT_DEFAULT_PLAN: "enterprise" });
    const c = new Client(env);
    const owner = await c.register("ent@pay.test");
    for (let i = 0; i < 6; i++) await c.addMember(owner, `e${i}@pay.test`, "viewer"); // 7 members > Startup's 5
    const refused = await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "startup" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("entitlement_exceeded");
    const ok = await c.call("POST", "/v1/billing/change-plan", owner, { plan_id: "growth" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.direction).toBe("downgrade");
    await env.teardown();
  });
});
