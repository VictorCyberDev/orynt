import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, execute, toApproved, world, type World } from "./helpers";

describe("exception workbench", () => {
  let w: World; let incidentId: string; let paymentId: string; let obId: string;
  beforeAll(async () => { w = await world(); });
  afterAll(async () => { await w.env.teardown(); });

  it("an uncertain payment is shown as UNKNOWN and potentially successful — never as failed — with a second send blocked", async () => {
    const { ob } = await toApproved(w, "3000000", "accept_then_lose_response");
    obId = ob.id;
    const r = await execute(w, ob.id); expect(r.status).toBe(202); paymentId = r.body.payment.id;
    incidentId = (await w.c.call("GET", "/v1/incidents?status=open", w.viewer)).body.data[0].id;
    const d = await w.c.call("GET", `/v1/incidents/${incidentId}`, w.viewer);
    expect(d.status).toBe(200);
    expect(d.body.payment_truth).toMatchObject({ state: "UNKNOWN", second_payment_blocked: true, may_have_succeeded: true });
    expect(d.body.incident).toMatchObject({ status: "open", kind: "unknown_outcome" });
    expect(JSON.stringify(d.body.payment_truth)).not.toMatch(/DEFINITIVELY_FAILED/);
    expect(d.body.attempts.some((a: { outcome: string }) => a.outcome === "UNKNOWN")).toBe(true);
    expect(d.body.approvals.length).toBeGreaterThanOrEqual(1);
    expect(d.body.approvals[0]).toMatchObject({ decision: "approved" });
    expect(d.body.safe_actions.find((a: { action: string }) => a.action === "execute")).toMatchObject({ allowed: false });
    expect(d.body.safe_actions.find((a: { action: string }) => a.action === "retry")).toMatchObject({ allowed: false });
    expect(d.body.timeline.length).toBeGreaterThan(3);
    expect(d.body.timeline.map((t: { at: string }) => t.at)).toEqual([...d.body.timeline.map((t: { at: string }) => t.at)].sort()); // chronological
    expect(d.body._audit).toBeUndefined(); // internal assembly detail is not exposed
    expect((await execute(w, ob.id)).status).toBe(409); // unsafe duplicate stays blocked
  });

  it("notes and assignment appear in the workbench; manual reconcile resolves from the wallet's record and the timeline shows it", async () => {
    expect((await w.c.call("POST", `/v1/incidents/${incidentId}/notes`, w.operator, { note: "Checked with the payee: nothing received yet." })).status).toBeLessThan(300);
    expect((await w.c.call("POST", `/v1/incidents/${incidentId}/assign`, w.operator, { user_id: w.operator.userId })).status).toBeLessThan(300);
    let d = (await w.c.call("GET", `/v1/incidents/${incidentId}`, w.viewer)).body;
    expect(d.notes.map((n: { note: string }) => n.note)).toContain("Checked with the payee: nothing received yet.");
    expect(d.incident.assigned_to.id).toBe(w.operator.userId);
    expect((await w.c.call("POST", `/v1/payments/${paymentId}/reconcile`, w.operator)).body.state).toBe("SIMULATED_SETTLED");
    d = (await w.c.call("GET", `/v1/incidents/${incidentId}`, w.viewer)).body;
    expect(d.incident.status).toBe("resolved");
    expect(d.payment_truth).toMatchObject({ state: "SIMULATED_SETTLED", second_payment_blocked: false });
    expect(d.payment_truth.last_reconciliation).not.toBeNull();
    expect(d.timeline.some((t: { source: string }) => t.source === "reconcile")).toBe(true);
    expect(d.timeline.some((t: { title: string }) => /Resolved by/.test(t.title))).toBe(true);
  });

  it("evidence export is integrity-hashed, tamper-evident, readable by audit readers only, and contains no secrets", async () => {
    const e = await w.c.call("GET", `/v1/incidents/${incidentId}/evidence`, w.viewer);
    expect(e.status).toBe(200);
    expect(e.body.evidence_version).toBe(1); expect(e.body.integrity.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(e.body.audit_chain.length).toBeGreaterThan(0); expect(e.body.audit_chain[0].hash).toMatch(/^[0-9a-f]{64}$/);
    const { integrity, ...rest } = e.body;
    const { hashCanonical } = await import("@orynt/core");
    expect(hashCanonical(rest as never)).toBe(integrity.sha256);
    expect(hashCanonical({ ...rest, summary: "edited" } as never)).not.toBe(integrity.sha256);
    expect(JSON.stringify(e.body)).not.toMatch(/macaroon|password|scrypt|config_ciphertext/i);
    expect(obId).toBeTruthy();
  });

  it("another organisation gets 404 for the incident, its evidence and its notes (no existence leak)", async () => {
    const c = new Client(w.env); const other = await c.register("other@elsewhere.test", "O", "Elsewhere");
    for (const u of [`/v1/incidents/${incidentId}`, `/v1/incidents/${incidentId}/evidence`, `/v1/incidents/${incidentId}/notes`]) expect((await c.call("GET", u, other)).status).toBe(404);
  });
});
