import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { world, toApproved, execute, type World } from "./helpers";
import { simulatorFor } from "../src/services/providers";

let w: World;
beforeAll(async () => {
  w = await world({ ORYNT_RATE_LIMIT_PER_MIN: "1000000" });
});
afterAll(async () => {
  await w.env.teardown();
});

describe("load & concurrency invariants (simulator wallet, real PostgreSQL)", () => {
  it("100 payouts × 3 concurrent execute attempts each: exactly 100 wallet sends, 200 refusals, zero double payments", async () => {
    const N = 100;
    const ids: string[] = [];
    for (let i = 0; i < N; i++) ids.push((await toApproved(w, String(1_000_000 + i))).ob.id);
    const before = simulatorFor(w.connId).sendCalls;
    const lat: number[] = [];
    const t0 = Date.now();
    const tasks = ids.flatMap((id) =>
      [0, 1, 2].map((k) => async () => {
        const s = performance.now();
        const r = await execute(w, id, w.operator, `load-${id}-${k}-xx`);
        lat.push(performance.now() - s);
        return r.status;
      }),
    );
    const statuses: number[] = [];
    const queue = [...tasks];
    await Promise.all(
      Array.from({ length: 30 }, async () => {
        for (let t = queue.shift(); t; t = queue.shift()) statuses.push(await t());
      }),
    );
    const wall = Date.now() - t0;
    const ok = statuses.filter((s) => s === 200 || s === 202).length,
      refused = statuses.filter((s) => s === 409).length;
    expect(ok).toBe(N);
    expect(refused).toBe(2 * N);
    expect(simulatorFor(w.connId).sendCalls - before).toBe(N);
    const states = (
      await w.env.pool.query(
        "SELECT state, count(*)::int AS n FROM payout_obligations WHERE state LIKE '%SETTLED' GROUP BY state",
      )
    ).rows;
    expect(states.reduce((a, r) => a + r.n, 0)).toBeGreaterThanOrEqual(N);
    const dup = (
      await w.env.pool.query(
        "SELECT count(*)::int AS n FROM (SELECT intent_id FROM execution_attempts GROUP BY intent_id HAVING count(*) > 1) x",
      )
    ).rows[0].n;
    expect(dup).toBe(0);
    lat.sort((a, b) => a - b);
    const p = (q: number) => Math.round(lat[Math.floor(lat.length * q)]!);
    const out = {
      ran_at: new Date().toISOString(),
      env: "single Node process + local PostgreSQL 16, SIMULATOR wallet (no network latency to a real node)",
      payouts: N,
      execute_requests: statuses.length,
      concurrency: 30,
      wallet_sends: N,
      refused_duplicates: refused,
      double_payments: dup,
      wall_ms: wall,
      latency_ms: { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: Math.round(lat[lat.length - 1]!) },
      caveat: "Not a capacity claim: one machine, simulated wallet, no network.",
    };
    mkdirSync(resolve(__dirname, "../../../docs/evidence"), { recursive: true });
    writeFileSync(
      join(resolve(__dirname, "../../../docs/evidence"), "load-check.json"),
      JSON.stringify(out, null, 2),
    );
    console.log(JSON.stringify(out));
  }, 240_000);
});
