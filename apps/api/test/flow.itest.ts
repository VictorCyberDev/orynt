import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyReceipt } from "@orynt/verifier";
import { world, toApproved, execute, getOb, newDraft, mintInvoice, type World } from "./helpers";
import { simulatorFor } from "../src/services/providers";

let w: World;
beforeAll(async () => {
  w = await world();
});
afterAll(async () => {
  await w.env.teardown();
});

describe("happy path on the simulator (labelled, never REAL)", () => {
  it("create → submit → approve → execute → SIMULATED_SETTLED → receipt verifies as VERIFIED_SIMULATED", async () => {
    const { ob } = await toApproved(w, "1000000");
    expect(ob.state).toBe("APPROVED");
    const r = await execute(w, ob.id);
    expect(r.status).toBe(200);
    expect(r.body.state).toBe("SIMULATED_SETTLED");
    expect(r.body.environment).toBe("SIMULATOR");
    const rc = await w.c.call("GET", `/v1/payments/${r.body.payment.id}/receipt`, w.owner);
    expect(rc.status).toBe(200);
    const issuer = (await w.c.call("GET", "/v1/public/issuer-keys", null)).body.data[0];
    const report = verifyReceipt(rc.body, {
      trustedKeys: [{ key_id: issuer.key_id, public_key: issuer.public_key }],
    });
    expect(report.checks.filter((c) => c.status === "FAIL")).toEqual([]);
    expect(report.verdict).toBe("VERIFIED_SIMULATED");
    expect(
      verifyReceipt(rc.body, {
        trustedKeys: [{ key_id: issuer.key_id, public_key: issuer.public_key }],
        requireReal: true,
      }).verdict,
    ).toBe("REJECTED");
  });

  it("audit hash chains verify, and an out-of-band edit is detected", async () => {
    const ok = await w.c.call("GET", "/v1/audit/verify", w.owner);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.entries).toBeGreaterThan(5);
    await w.env.pool.query("ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only"); // what a DB admin could do
    await w.env.pool.query(
      "UPDATE audit_events SET data = '{\"forged\":true}' WHERE id = (SELECT min(id) FROM audit_events WHERE type='obligation.created')",
    );
    await w.env.pool.query("ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only");
    const bad = await w.c.call("GET", "/v1/audit/verify", w.owner);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.broken[0].error).toMatch(/hash mismatch/);
  });
});
void newDraft;
void mintInvoice;
void getOb;
void simulatorFor;
