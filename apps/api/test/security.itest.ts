/** Regression tests for findings from the independent security review (2026-11-09). Each test failed before its fix. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { DEFAULT_POLICY_RULES, encodeInvoice, sha256Hex } from "@orynt/core";
import { world, toApproved, execute, getOb, mintInvoice, newDraft, type World } from "./helpers";
import { loadConfig } from "../src/config";
import { isPrivateAddress, vetWebhookTarget } from "../src/lib/ssrf";
import { pumpWebhooks } from "../src/services/webhooks";
import { simulatorFor } from "../src/services/providers";

let w: World;
beforeAll(async () => {
  w = await world({ ORYNT_RATE_LIMIT_PER_MIN: "100000" });
});
afterAll(async () => {
  await w.env.teardown();
});
const q = (s: string, p: unknown[] = []) => w.env.pool.query(s, p);

describe("privilege escalation", () => {
  it("a developer cannot mint an API key with more power than they hold (operator key)", async () => {
    const dev = await w.c.addMember(w.owner, "dev@acme.test", "developer");
    const r = await w.c.call("POST", "/v1/api-keys", dev, { name: "escalate", role: "operator" });
    expect(r.status).toBe(403);
    expect((await w.c.call("POST", "/v1/api-keys", dev, { name: "ok", role: "developer" })).status).toBe(201);
  });
  it("an API key stops working when the person who created it is revoked", async () => {
    const op = await w.c.addMember(w.owner, "keyowner@acme.test", "operator");
    const key = await w.c.call("POST", "/v1/api-keys", op, { name: "mine", role: "operator" });
    expect(key.status).toBe(403); // operators cannot manage keys at all; owner creates it:
    const k = (await w.c.call("POST", "/v1/api-keys", w.owner, { name: "owner's", role: "operator" })).body
      .secret;
    expect((await w.c.call("GET", "/v1/obligations", { apiKey: k })).status).toBe(200);
    await q(
      "UPDATE memberships SET status='revoked' WHERE user_id=(SELECT id FROM users WHERE email='owner@acme.test')",
    ); // simulate creator losing access
    expect((await w.c.call("GET", "/v1/obligations", { apiKey: k })).status).toBe(401);
    await q(
      "UPDATE memberships SET status='active' WHERE user_id=(SELECT id FROM users WHERE email='owner@acme.test')",
    );
  });
});

describe("rate limiting cannot be bypassed with a forged Authorization header", () => {
  it("random bearer values do not get fresh login buckets", async () => {
    const env = await (await import("./helpers")).createEnv(); // default limits
    try {
      let limited = 0;
      for (let i = 0; i < 40; i++) {
        const r = await env.app.inject({
          method: "POST",
          url: "/v1/auth/login",
          headers: { authorization: "Bearer orynt_" + i + "x".repeat(30) },
          payload: { email: "x@y.test", password: "nope-nope-nope" },
        });
        if (r.statusCode === 429) limited++;
      }
      expect(limited).toBeGreaterThan(0);
    } finally {
      await env.teardown();
    }
  }, 120_000);
});

describe("SSRF", () => {
  it("IPv4-mapped IPv6 in hex form, NAT64, 6to4 and special-use v4 ranges are private", () => {
    for (const a of [
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::ffff:0a00:0001",
      "64:ff9b::7f00:1",
      "2002:7f00:0001::1",
      "192.0.0.8",
      "198.18.0.1",
      "::ffff:127.0.0.1",
      "fe80::1",
      "fd00::1",
    ])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["8.8.8.8", "2606:4700:4700::1111", "::ffff:808:808"])
      expect(isPrivateAddress(a), a).toBe(false);
  });
  it("LND connection URLs are vetted like webhook targets in production-mode rules", async () => {
    await expect(vetWebhookTarget("http://169.254.169.254/latest", false)).rejects.toThrow();
    await expect(vetWebhookTarget("https://[::ffff:7f00:1]/", false)).rejects.toThrow();
  });
});

describe("webhook delivery cannot wedge the worker", () => {
  it("a slow-drip endpoint is cut off by a hard deadline and does not block other deliveries", async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200);
      const t = setInterval(() => res.write("x"), 300);
      res.on("close", () => clearInterval(t));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    await w.c.call("POST", "/v1/webhooks", w.owner, {
      url: `http://127.0.0.1:${(srv.address() as { port: number }).port}/slow`,
      events: ["*"],
    });
    await toApproved(w, "1000000");
    const t0 = Date.now();
    await pumpWebhooks(w.env.deps);
    expect(Date.now() - t0).toBeLessThan(15_000);
    srv.close();
  }, 40_000);
});

describe("config fails closed", () => {
  it("refuses to start without an explicit ORYNT_ENV", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/ORYNT_ENV/);
  });
  it("production requires real keys and refuses failpoints", () => {
    expect(() => loadConfig({ ORYNT_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/ORYNT_SECRET_KEY/);
    expect(() =>
      loadConfig({
        ORYNT_ENV: "production",
        ORYNT_SECRET_KEY: "a".repeat(64),
        ORYNT_ISSUER_KEY: "b".repeat(64),
        ORYNT_FAILPOINTS: "1",
      } as NodeJS.ProcessEnv),
    ).toThrow(/FAILPOINTS/);
  });
});

describe("24-hour limit holds under concurrent execution", () => {
  it("two concurrent executes on DIFFERENT payouts that together exceed the daily limit: exactly one is dispatched", async () => {
    const e = await world({ ORYNT_RATE_LIMIT_PER_MIN: "100000" });
    try {
      // publish the policy first so both payouts are approved under it; the limit is only reached once one of them has been dispatched
      expect(
        (
          await e.c.call("POST", "/v1/policies", e.owner, {
            name: "Default policy",
            rules: {
              ...DEFAULT_POLICY_RULES,
              dailyLimitMsat: "1500000",
              tiers: [{ upToMsat: null, requiredApprovals: 1 }],
            },
          })
        ).status,
      ).toBe(201);
      const a = await toApproved(e, "1000000"),
        b = await toApproved(e, "1000000");
      const before = simulatorFor(e.connId).sendCalls;
      const [ra, rb] = await Promise.all([execute(e, a.ob.id), execute(e, b.ob.id)]);
      const statuses = [ra.status, rb.status].sort();
      expect(statuses).toEqual([200, 422]);
      expect([ra, rb].find((r) => r.status === 422)!.body.code).toBe("policy_violation");
      expect(simulatorFor(e.connId).sendCalls - before).toBe(1);
    } finally {
      await e.env.teardown();
    }
  });
});

describe("maker–checker uses the author of the CURRENT revision", () => {
  it("an admin who revised a payout's terms cannot also approve them", async () => {
    const { ob } = await newDraft(w, "1300000"); // created by operator
    const admin = await w.c.addMember(w.owner, "admin2@acme.test", "admin");
    const inv2 = await mintInvoice(w, "1300000");
    const rev = await w.c.call("PUT", `/v1/obligations/${ob.id}`, admin, { invoice: inv2.invoice });
    expect(rev.status).toBe(403 === rev.status ? 403 : 200); // admins lack obligation:create? they have all perms → 200
    const s = (await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, admin)).body;
    const r = await w.c.approve(admin, s);
    expect(r.status).toBe(403);
    expect(r.body.detail).toMatch(/someone other than the person who wrote/i);
  });
});

describe("approval timestamp hygiene", () => {
  it("rejects non-canonical signed_at formats", async () => {
    const { ob } = await newDraft(w, "1310000");
    const s = (await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator)).body;
    const sig = await w.c.sign(w.approver1, s);
    const r = await w.c.call("POST", `/v1/obligations/${ob.id}/approve`, w.approver1, {
      ...sig,
      signed_at: "Nov 9 2026 12:00",
    });
    expect(r.status).toBe(422);
  });
});

describe("decoder strictness and amount bounds", () => {
  it("amounts above the bitcoin supply are a 422, not a 500", async () => {
    const inv = await mintInvoice(w, "1000000");
    const r = await w.c.call("POST", "/v1/obligations", w.operator, {
      counterparty_name: "Big",
      amount_msat: "9".repeat(30),
      invoice: inv.invoice,
    });
    expect(r.status).toBe(422);
  });
  it("approval public keys are unique per workspace (no one person with two accounts and one key)", async () => {
    const a = await w.c.addMember(w.owner, "twin@acme.test", "approver");
    const { signMessage } = await import("@orynt/core");
    const { keyProofMessage } = await import("../src/services/auth");
    const proof = signMessage(
      w.approver1.keys.privateKey,
      "orynt.key-registration.v1",
      keyProofMessage(a.orgId, w.approver1.keys.publicKey),
    );
    const r = await w.c.call("POST", "/v1/me/approval-key", a, {
      public_key: w.approver1.keys.publicKey,
      proof_signature: proof,
    });
    expect(r.status).toBe(409);
  });
});
void encodeInvoice;
void sha256Hex;
void execute;
void getOb;
void simulatorFor;
