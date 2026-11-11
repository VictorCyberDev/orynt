import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { totpAt } from "../src/lib/totp";
import { createStaff } from "../src/services/staff";
import { Client, createEnv, type TestEnv } from "./helpers";

describe("internal support console", () => {
  let env: TestEnv, c: Client;
  let sec: { email: string; pw: string; secret: string };
  const call = async (
    method: string,
    url: string,
    o: { cookie?: string; csrf?: string; body?: unknown } = {},
  ) => {
    const r = await env.app.inject({
      method: method as "GET",
      url,
      headers: { ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.csrf ? { "x-staff-csrf": o.csrf } : {}) },
      payload: o.body === undefined ? undefined : (o.body as object),
    });
    let json: any = null;
    try {
      json = r.body ? JSON.parse(r.body) : null;
    } catch {
      /* html */
    }
    return { status: r.statusCode, body: json, raw: r };
  };
  let cookie = "",
    csrf = "";
  const login = async (code: string, password = sec.pw) =>
    call("POST", "/staff/api/login", { body: { email: sec.email, password, mfa_code: code } });
  const step = (offset = 0) => totpAt(sec.secret, Date.now() + offset * 30000);
  const resetStaffMfa = () =>
    env.pool.query(
      "UPDATE staff_users SET mfa_last_step=NULL, mfa_failures=0, mfa_locked_until=NULL, failed_logins=0, locked_until=NULL",
    );

  beforeAll(async () => {
    env = await createEnv();
    c = new Client(env);
    const s = await createStaff(env.deps, { email: "agent@orynt.test", name: "Ada Agent", role: "support" });
    sec = { email: s.email, pw: s.one_time_password, secret: s.mfa_secret };
  });
  afterAll(async () => {
    await env.teardown();
  });

  it("sign-in needs the password AND a current authenticator code; every failure looks the same; a code works once; repeated failures lock", async () => {
    const bad = [
      await login("000000"),
      await login(step(), "wrong-password-xx"),
      await call("POST", "/staff/api/login", {
        body: { email: "nobody@orynt.test", password: "x".repeat(12), mfa_code: "123456" },
      }),
    ];
    for (const r of bad) {
      expect(r.status).toBe(401);
      expect(r.body.detail).toBe("Sign-in failed.");
    }
    await resetStaffMfa();
    const ok = await login(step());
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    cookie = (ok.raw.headers["set-cookie"] as string).split(";")[0]!;
    csrf = ok.body.csrf_token;
    expect(String(ok.raw.headers["set-cookie"])).toMatch(/HttpOnly/i);
    expect(String(ok.raw.headers["set-cookie"])).toMatch(/SameSite=Strict/i);
    expect(String(ok.raw.headers["set-cookie"])).toMatch(/Path=\/staff/);
    expect((await login(step())).status).toBe(401); // the same code cannot be replayed
    for (let i = 0; i < 6; i++) await login("111111");
    expect((await login(step(1))).status).toBe(429); // locked
    await resetStaffMfa();
  });

  it("customer sessions do not work on the staff API, and the staff cookie does not work on the customer API", async () => {
    const owner = await c.register("customer@staff.test", "Cust", "Cust Org");
    expect((await call("GET", "/staff/api/tickets", { cookie: owner.cookie })).status).toBe(401);
    expect((await call("GET", "/staff/api/tickets")).status).toBe(401);
    expect(
      (
        await c.call("GET", "/v1/obligations", {
          cookie: cookie.replace("orynt_staff", "orynt_session"),
          csrf: "x",
          keys: undefined,
          userId: "",
          email: "",
          orgId: "",
          role: "viewer",
        } as never)
      ).status,
    ).toBe(401);
  });

  it("support reads and answers a customer's request; the customer is notified and reads the reply in the product; every staff read is audited", async () => {
    const owner = await c.register("asker@staff.test", "Asker", "Asker Org");
    const t = await c.call("POST", "/v1/support", owner, {
      category: "billing",
      subject: "Plan question",
      body: "I upgraded but still see the free limits.",
    });
    expect(t.status).toBe(201);
    const ref = t.body.reference as string;
    await resetStaffMfa();
    const l = await login(step());
    cookie = (l.raw.headers["set-cookie"] as string).split(";")[0]!;
    csrf = l.body.csrf_token;
    const list = await call("GET", "/staff/api/tickets?status=open", { cookie });
    expect(list.body.data.some((x: { reference: string }) => x.reference === ref)).toBe(true);
    const detail = await call("GET", `/staff/api/tickets/${ref}`, { cookie });
    expect(detail.status).toBe(200);
    expect(detail.body.diagnostics).toBeTruthy();
    expect(
      (await call("POST", `/staff/api/tickets/${ref}/reply`, { cookie, body: { body: "Hello" } })).status,
    ).toBe(403); // CSRF header required
    expect(
      (
        await call("POST", `/staff/api/tickets/${ref}/reply`, {
          cookie,
          csrf,
          body: { body: "Thanks — checking your billing status now.", status: "pending_customer" },
        })
      ).status,
    ).toBe(200);
    const mine = await c.call("GET", `/v1/support/${ref}`, owner);
    expect(mine.body.status).toBe("pending_customer");
    expect(mine.body.messages.map((m: { author: string }) => m.author)).toEqual(["Orynt support"]);
    const mail = (
      await env.pool.query(
        "SELECT subject, body_text FROM mail_outbox WHERE to_email='asker@staff.test' AND template='support_reply'",
      )
    ).rows[0];
    expect(mail.body_text).not.toMatch(/checking your billing/); // the reply text itself is not e-mailed
    expect(
      (await c.call("GET", `/v1/support/${ref}`, await c.register("other@staff.test", "O", "Other Org")))
        .status,
    ).toBe(404); // another customer cannot read it
    const audit = (await env.pool.query("SELECT action FROM staff_audit ORDER BY id")).rows.map(
      (r) => r.action,
    );
    expect(audit).toEqual(
      expect.arrayContaining(["staff.login", "tickets.list", "ticket.read", "ticket.reply"]),
    );
  });

  it("organisation summary needs a stated reason, is audited with it, and contains no credentials, hashes, invoices or member e-mails", async () => {
    const owner = await c.register("rich@staff.test", "Rich", "Rich Org");
    await c.call("POST", "/v1/connections", owner, { label: "Practice", kind: "simulator" });
    expect((await call("GET", `/staff/api/orgs/${owner.orgId}/summary`, { cookie })).status).toBe(422);
    const s = await call(
      "GET",
      `/staff/api/orgs/${owner.orgId}/summary?reason=${encodeURIComponent("Customer asked about wallet health")}`,
      { cookie },
    );
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const text = JSON.stringify(s.body);
    expect(text).not.toMatch(
      /macaroon|password|scrypt|config_ciphertext|approval_public_key|rich@staff\.test|lnbc/i,
    );
    expect(s.body.wallets[0]).toMatchObject({ kind: "simulator" });
    expect(s.body.members_by_role.owner).toBe(1);
    const a = (
      await env.pool.query(
        "SELECT reason, org_id FROM staff_audit WHERE action='org.summary.read' ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
    expect(a.reason).toBe("Customer asked about wallet health");
    expect(a.org_id).toBe(owner.orgId);
  });

  it("there is no route to act as a customer, move money or reach secrets; the audit log cannot be edited; the staff page is noindex", async () => {
    const owner = await c.register("probe@staff.test", "P", "Probe Org");
    for (const [m, u] of [
      ["POST", `/staff/api/orgs/${owner.orgId}/impersonate`],
      ["GET", `/staff/api/orgs/${owner.orgId}/wallets`],
      ["POST", `/staff/api/payments/x/execute`],
      ["POST", `/staff/api/obligations/x/approve`],
      ["GET", `/staff/api/orgs/${owner.orgId}/members`],
    ] as const)
      expect((await call(m, u, { cookie, csrf })).status, `${m} ${u}`).toBe(404);
    await expect(env.pool.query("UPDATE staff_audit SET reason='edited'")).rejects.toThrow(/append-only/);
    await expect(env.pool.query("DELETE FROM staff_audit")).rejects.toThrow(/append-only/);
    const page = await call("GET", "/staff");
    expect(page.status).toBe(200);
    expect(page.raw.body).toMatch(/noindex/);
    expect((await call("GET", "/staff/app.js")).raw.body).not.toMatch(/innerHTML/);
  });
});
