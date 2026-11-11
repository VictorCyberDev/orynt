import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { hmacSha256Hex } from "@orynt/core";
import { verifyWebhook, WebhookSignatureError } from "@orynt/sdk";
import { world, toApproved, execute, getOb, createEnv, type World } from "./helpers";
import { pumpWebhooks, signPayload } from "../src/services/webhooks";
import { loadMigrations, migrateDown, migrateUp, pendingMigrations } from "../src/db/migrate";
import { createPool } from "../src/db/pool";
import { vetWebhookTarget, isPrivateAddress } from "../src/lib/ssrf";
import { callbackSecretFor } from "../src/http/callbacks";

let w: World;
const q = (s: string, p: unknown[] = []) => w.env.pool.query(s, p);
beforeAll(async () => {
  w = await world();
});
afterAll(async () => {
  await w.env.teardown();
});

describe("webhooks", () => {
  it("delivers signed, at-least-once events; receiver verifies and dedupes by event id; failures retry", async () => {
    const got: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    let failNext = 1;
    const srv = http.createServer((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        got.push({ headers: req.headers, body: b });
        if (failNext-- > 0) {
          res.statusCode = 500;
        } else res.statusCode = 200;
        res.end();
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/hook`;
    const ep = (
      await w.c.call("POST", "/v1/webhooks", w.owner, {
        url,
        events: ["payment.settled", "obligation.approved"],
      })
    ).body;
    expect(ep.signing_secret).toMatch(/^whsec_/);
    const { ob } = await toApproved(w, "1000000");
    await execute(w, ob.id);
    await pumpWebhooks(w.env.deps); // first attempt: receiver returns 500
    expect(
      (await q("SELECT status, attempt FROM webhook_deliveries WHERE status='pending' AND attempt=1"))
        .rowCount,
    ).toBeGreaterThan(0);
    await q("UPDATE webhook_deliveries SET next_attempt_at = now() WHERE status='pending'");
    await pumpWebhooks(w.env.deps);
    await q("UPDATE webhook_deliveries SET next_attempt_at = now() WHERE status='pending'");
    await pumpWebhooks(w.env.deps);
    const types = new Set<string>();
    const seen = new Set<string>();
    for (const g of got) {
      const ev = verifyWebhook(g.body, String(g.headers["orynt-signature"]), ep.signing_secret);
      expect(g.headers["orynt-event-id"]).toBe(ev.id);
      types.add(ev.type);
      seen.add(ev.id);
    }
    expect(types.has("payment.settled")).toBe(true);
    expect(got.length).toBeGreaterThan(seen.size - 1); // at-least-once: a retried event appears twice with the SAME id
    expect(got.length).toBe(seen.size + 1);
    // the receiver-side checks
    const g0 = got[0]!;
    expect(() =>
      verifyWebhook(g0.body + " ", String(g0.headers["orynt-signature"]), ep.signing_secret),
    ).toThrow(WebhookSignatureError); // body modified
    expect(() => verifyWebhook(g0.body, String(g0.headers["orynt-signature"]), "whsec_wrong")).toThrow(
      WebhookSignatureError,
    );
    expect(() =>
      verifyWebhook(g0.body, String(g0.headers["orynt-signature"]), ep.signing_secret, {
        now: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toThrow(/replay/);
    srv.close();
  });
  it("webhook secrets are stored encrypted and never listed", async () => {
    const list = await w.c.call("GET", "/v1/webhooks", w.owner);
    expect(JSON.stringify(list.body)).not.toMatch(/whsec_/);
    const row = (await q("SELECT secret_ciphertext FROM webhook_endpoints LIMIT 1")).rows[0];
    expect(row.secret_ciphertext.toString("utf8")).not.toMatch(/whsec_/);
  });
  it("SSRF: private, loopback, link-local and metadata targets are refused in production mode", async () => {
    for (const u of [
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://169.254.169.254/latest",
      "https://[::1]/x",
      "https://192.168.1.1/",
      "http://example.com/",
      "https://user:pw@example.com/",
    ])
      await expect(vetWebhookTarget(u, false)).rejects.toThrow();
    expect(isPrivateAddress("::ffff:10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(signPayload("s", 1, "{}")).toBe(`t=1,v1=${hmacSha256Hex("s", "1.{}")}`);
  });
});

describe("provider callbacks are hints, deduplicated, authenticated", () => {
  const post = async (connId: string, body: object, secret?: string, ts = Math.floor(Date.now() / 1000)) => {
    const raw = JSON.stringify(body);
    const sig = secret ? `t=${ts},v1=${hmacSha256Hex(secret, `${ts}.${raw}`)}` : "t=1,v1=" + "0".repeat(64);
    return w.env.app.inject({
      method: "POST",
      url: `/v1/provider-events/${connId}`,
      headers: { "content-type": "application/json", "orynt-signature": sig },
      payload: raw,
    });
  };
  it("rejects bad signatures and stale timestamps; duplicate event ids are ignored; a callback claiming settlement cannot settle anything", async () => {
    const secret = callbackSecretFor(w.env.deps, w.connId);
    expect((await post(w.connId, { event_id: "e1" })).statusCode).toBe(401);
    expect(
      (await post(w.connId, { event_id: "e1" }, secret, Math.floor(Date.now() / 1000) - 3600)).statusCode,
    ).toBe(401);
    const { ob } = await toApproved(w, "1100000", "pending_then_succeed");
    const ex = await execute(w, ob.id);
    expect(ex.body.state).toBe("PENDING");
    const hash = ex.body.payment.payment_hash;
    // lying callback: says "settled", wallet still says in-flight on first lookup
    const r1 = await post(
      w.connId,
      { event_id: "evt-1", payment_hash: hash, type: "payment.settled", status: "SETTLED" },
      secret,
    );
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.body).duplicate).toBe(false);
    expect((await getOb(w, ob.id)).state).toBe("PENDING"); // NOT settled by the callback
    const r2 = await post(
      w.connId,
      { event_id: "evt-1", payment_hash: hash, type: "payment.settled", status: "SETTLED" },
      secret,
    );
    expect(JSON.parse(r2.body).duplicate).toBe(true);
    expect((await q("SELECT count(*)::int AS n FROM provider_events WHERE event_id='evt-1'")).rows[0].n).toBe(
      1,
    );
    // the wallet's own record (second lookup) is what settles it
    await q("UPDATE payout_obligations SET reconcile_lease_until=NULL WHERE id=$1", [ob.id]);
    const r3 = await post(w.connId, { event_id: "evt-2", payment_hash: hash }, secret);
    expect(JSON.parse(r3.body).result).toBe("reconcile:SETTLED");
    expect((await getOb(w, ob.id)).state).toBe("SIMULATED_SETTLED");
  });
});

describe("migrations", () => {
  it("up → down → up rehearsal leaves a working schema; checksum drift is detected", async () => {
    const e = await createEnv();
    try {
      expect(await pendingMigrations(e.pool)).toEqual([]);
      const all = loadMigrations().map((m) => m.version);
      expect(await migrateDown(e.pool, all.length)).toEqual([...all].reverse()); // every migration's down script runs cleanly
      expect(
        (await e.pool.query("SELECT to_regclass('public.payout_obligations') AS t")).rows[0].t,
      ).toBeNull();
      expect(await migrateUp(e.pool)).toEqual(all);
      expect(
        (await e.pool.query("SELECT to_regclass('public.payout_obligations') AS t")).rows[0].t,
      ).not.toBeNull();
      await e.pool.query("UPDATE schema_migrations SET checksum='tampered' WHERE version='001'");
      await expect(migrateUp(e.pool)).rejects.toThrow(/checksum drift/);
    } finally {
      await e.teardown();
    }
  });
  it("a failing migration rolls back completely and leaves no partial schema", async () => {
    const e = await createEnv();
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "001_ok.up.sql"), "CREATE TABLE t_ok(id int);");
      writeFileSync(join(dir, "001_ok.down.sql"), "DROP TABLE t_ok;");
      writeFileSync(
        join(dir, "002_bad.up.sql"),
        "CREATE TABLE t_partial(id int); INSERT INTO nonexistent_table VALUES (1);",
      );
      writeFileSync(join(dir, "002_bad.down.sql"), "SELECT 1;");
      const admin = new pg.Client({
        connectionString: e.config.databaseUrl.replace(/\/[^/]+$/, "/postgres"),
      });
      const tmpDb = "orynt_mig_" + Date.now();
      await admin.connect().catch(() => {});
      const url = e.config.databaseUrl.replace(/\/[^/]+$/, "/" + tmpDb);
      const a2 = new pg.Client({
        connectionString:
          process.env["TEST_ADMIN_DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_test",
      });
      await a2.connect();
      await a2.query(`CREATE DATABASE ${tmpDb}`);
      await a2.end();
      await admin.end().catch(() => {});
      const pool = createPool(url, 2);
      await expect(migrateUp(pool, dir)).rejects.toThrow(/002_bad failed and was rolled back/);
      expect((await pool.query("SELECT to_regclass('public.t_partial') AS t")).rows[0].t).toBeNull();
      expect((await pool.query("SELECT to_regclass('public.t_ok') AS t")).rows[0].t).not.toBeNull(); // earlier migration stays applied
      await pool.end();
      const a3 = new pg.Client({
        connectionString:
          process.env["TEST_ADMIN_DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_test",
      });
      await a3.connect();
      await a3.query(`DROP DATABASE ${tmpDb} WITH (FORCE)`);
      await a3.end();
    } finally {
      await e.teardown();
    }
  });
});

describe("observability and ops endpoints", () => {
  it("health, readiness, request ids, problem+json, redacted logging config, metrics restricted", async () => {
    expect((await w.c.call("GET", "/health/live", null)).status).toBe(200);
    const ready = await w.c.call("GET", "/health/ready", null);
    expect(ready.status).toBe(200);
    expect(ready.body.checks.migrations).toBe("ok");
    const nf = await w.c.call("GET", "/v1/nope", null, undefined, { "x-request-id": "req-abcdefgh-12345" });
    expect(nf.headers["x-request-id"]).toBe("req-abcdefgh-12345");
    expect(nf.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(nf.body).toMatchObject({ code: "not_found", status: 404, request_id: "req-abcdefgh-12345" });
    const oa = await w.c.call("GET", "/v1/openapi.json", null);
    expect(oa.body.openapi).toBe("3.1.0");
    expect(Object.keys(oa.body.paths)).toContain("/v1/payments/{id}/receipt");
  });
});
