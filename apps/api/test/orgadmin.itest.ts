import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execute, toApproved, world, type World } from "./helpers";

describe("organisation administration: sessions, ownership transfer, closure", () => {
  let w: World;
  const PW = "correct horse battery staple";
  beforeAll(async () => {
    w = await world();
  });
  afterAll(async () => {
    await w.env.teardown();
  });

  it("a person can see their sessions, sign one out, and sign out everywhere else; others' sessions are untouchable", async () => {
    const second = await w.c.login("owner@acme.test");
    const list = (await w.c.call("GET", "/v1/me/sessions", w.owner)).body.data;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.filter((s: { current: boolean }) => s.current).length).toBe(1);
    const other = list.find((s: { current: boolean }) => !s.current);
    // someone else cannot revoke it (404, not 403)
    expect((await w.c.call("DELETE", `/v1/me/sessions/${other.id}`, w.viewer)).status).toBe(404);
    expect(
      (await w.c.call("POST", "/v1/me/sessions/revoke-others", w.owner)).body.revoked,
    ).toBeGreaterThanOrEqual(1);
    expect((await w.c.call("GET", "/v1/me", second)).status).toBe(401); // the other session is dead
    expect((await w.c.call("GET", "/v1/me", w.owner)).status).toBe(200); // this one survives
  });

  it("ownership transfer: needs the password, an owner, and a verified active member; roles swap atomically and both parties are notified and audited", async () => {
    const target = w.approver1;
    expect(
      (
        await w.c.call("POST", "/v1/org/transfer-ownership", w.approver2, {
          user_id: target.userId,
          password: PW,
        })
      ).status,
    ).toBe(403); // not an owner
    expect(
      (
        await w.c.call("POST", "/v1/org/transfer-ownership", w.owner, {
          user_id: target.userId,
          password: "wrong password!!",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await w.c.call("POST", "/v1/org/transfer-ownership", w.owner, {
          user_id: w.owner.userId,
          password: PW,
        })
      ).status,
    ).toBe(422); // yourself
    expect(
      (
        await w.c.call("POST", "/v1/org/transfer-ownership", w.owner, {
          user_id: target.userId,
          password: PW,
        })
      ).status,
    ).toBe(409); // not verified yet
    await w.env.pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [target.userId]);
    const r = await w.c.call("POST", "/v1/org/transfer-ownership", w.owner, {
      user_id: target.userId,
      password: PW,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const roles = Object.fromEntries(
      (
        await w.env.pool.query(
          "SELECT u.email, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1",
          [w.owner.orgId],
        )
      ).rows.map((x) => [x.email, x.role]),
    );
    expect(roles["approver1@acme.test"]).toBe("owner");
    expect(roles["owner@acme.test"]).toBe("admin");
    expect(
      (
        await w.env.pool.query(
          "SELECT 1 FROM audit_events WHERE org_id=$1 AND type='org.ownership_transferred'",
          [w.owner.orgId],
        )
      ).rowCount,
    ).toBe(1);
    for (const to of ["approver1@acme.test", "owner@acme.test"])
      expect(
        (
          await w.env.pool.query(
            "SELECT 1 FROM mail_outbox WHERE template='security_notice' AND to_email=$1 AND created_at > now() - interval '1 minute'",
            [to],
          )
        ).rowCount,
      ).toBeGreaterThanOrEqual(1);
    // the former owner (now admin) can no longer transfer or close
    expect(
      (
        await w.c.call("POST", "/v1/org/transfer-ownership", w.owner, {
          user_id: w.approver2.userId,
          password: PW,
        })
      ).status,
    ).toBeGreaterThanOrEqual(401);
  });

  it("closure is refused while a payment's outcome is unknown, needs the exact name and the owner's password, and then stops everything but keeps the records", async () => {
    const owner = await w.c.login("approver1@acme.test"); // the new owner (the transfer signed their older sessions out, by design)
    w.approver1 = owner;
    const key = (await w.c.call("POST", "/v1/api-keys", owner, { name: "ci", role: "viewer" })).body
      .secret as string;
    const { ob } = await toApproved(w, "3000000", "accept_then_lose_response");
    const r = await execute(w, ob.id);
    expect(r.status).toBe(202);
    const refused = await w.c.call("POST", "/v1/org/close", owner, {
      confirm_name: "Acme Studio",
      password: PW,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("send_blocked_unresolved");
    expect(
      (await w.c.call("POST", `/v1/payments/${r.body.payment.id}/reconcile`, w.operator)).body.state,
    ).toBe("SIMULATED_SETTLED");
    expect(
      (await w.c.call("POST", "/v1/org/close", w.owner, { confirm_name: "Acme Studio", password: PW }))
        .status,
    ).toBe(403); // admin, not owner
    expect(
      (await w.c.call("POST", "/v1/org/close", owner, { confirm_name: "Wrong Name", password: PW })).status,
    ).toBe(422);
    expect(
      (
        await w.c.call("POST", "/v1/org/close", owner, {
          confirm_name: "Acme Studio",
          password: "nope nope nope!!",
        })
      ).status,
    ).toBe(401);
    const closed = await w.c.call("POST", "/v1/org/close", owner, {
      confirm_name: "Acme Studio",
      password: PW,
    });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    // nothing of this organisation can act any more
    for (const who of [owner, w.operator, w.approver2, w.viewer])
      expect((await w.c.call("GET", "/v1/obligations", who)).status).toBe(401);
    expect((await w.c.call("GET", "/v1/obligations", { apiKey: key })).status).toBe(401);
    const org = (
      await w.env.pool.query("SELECT closed_at, retention_until FROM organizations WHERE id=$1", [
        owner.orgId,
      ])
    ).rows[0];
    expect(org.closed_at).not.toBeNull();
    expect(new Date(org.retention_until).getTime() - Date.now()).toBeGreaterThan(80 * 86400_000);
    expect(
      (
        await w.env.pool.query(
          "SELECT count(*)::int AS n FROM wallet_connections WHERE org_id=$1 AND status<>'disabled'",
          [owner.orgId],
        )
      ).rows[0].n,
    ).toBe(0);
    // records are retained
    expect(
      (
        await w.env.pool.query("SELECT count(*)::int AS n FROM payout_obligations WHERE org_id=$1", [
          owner.orgId,
        ])
      ).rows[0].n,
    ).toBeGreaterThan(0);
    expect(
      (
        await w.env.pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE org_id=$1 AND type='org.closed'",
          [owner.orgId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
