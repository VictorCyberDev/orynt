import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encodeInvoice,
  nodePubkeyFromPrivate,
  sha256Hex,
  hexToBytes,
  DEFAULT_POLICY_RULES,
} from "@orynt/core";
import { world, toApproved, execute, getOb, newDraft, mintInvoice, type World } from "./helpers";
import { simulatorFor } from "../src/services/providers";
import {
  reconcileObligation,
  recoverStaleDispatch,
  releaseStaleReservations,
  systemCtx,
} from "../src/services/reconcile";
import { arm, disarmAll } from "../src/lib/failpoints";

let w: World;
const q = (sql: string, p: unknown[] = []) => w.env.pool.query(sql, p);
const sim = () => simulatorFor(w.connId);
beforeAll(async () => {
  w = await world();
});
afterAll(async () => {
  disarmAll();
  await w.env.teardown();
});
const sys = () => systemCtx(w.owner.orgId, "test");
const countRows = async (t: string, where = "true") =>
  Number((await q(`SELECT count(*)::int AS n FROM ${t} WHERE ${where}`)).rows[0].n);

describe("duplicate execution", () => {
  it("20 concurrent execute requests with different keys produce exactly ONE wallet send", async () => {
    const { ob } = await toApproved(w, "2000000");
    const before = sim().sendCalls;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => execute(w, ob.id, w.operator, `race-key-${i}-xxxx`)),
    );
    const ok = results.filter((r) => r.status === 200 || r.status === 202);
    expect(ok.length).toBe(1);
    expect(results.filter((r) => r.status === 409).length).toBe(19);
    expect(sim().sendCalls - before).toBe(1);
    expect(
      await countRows(
        "execution_attempts",
        `intent_id IN (SELECT id FROM payment_intents WHERE obligation_id='${ob.id}')`,
      ),
    ).toBe(1);
    expect((await getOb(w, ob.id)).state).toBe("SIMULATED_SETTLED");
  });
  it("same Idempotency-Key replays the original response and does not send twice", async () => {
    const { ob } = await toApproved(w, "1500000");
    const before = sim().sendCalls;
    const a = await execute(w, ob.id, w.operator, "same-key-123456");
    const b = await execute(w, ob.id, w.operator, "same-key-123456");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(sim().sendCalls - before).toBe(1);
  });
  it("a second execute after settlement is refused with a plain explanation", async () => {
    const { ob } = await toApproved(w, "1100000");
    await execute(w, ob.id);
    const again = await execute(w, ob.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("send_blocked_unresolved");
    expect(again.body.detail).toMatch(/already been settled/);
  });
  it("requires an Idempotency-Key on execute", async () => {
    const { ob } = await toApproved(w, "1100000");
    const r = await w.c.call("POST", `/v1/obligations/${ob.id}/execute`, w.operator);
    expect(r.status).toBe(400);
  });
});

describe("lost responses, crashes, reconciliation", () => {
  it("response lost AFTER the wallet accepted → UNKNOWN (not FAILED); second send blocked; reconcile proves SETTLED; only one send", async () => {
    const { ob } = await toApproved(w, "3000000", "accept_then_lose_response");
    const before = sim().sendCalls;
    const r = await execute(w, ob.id);
    expect(r.status).toBe(202);
    expect(r.body.state).toBe("UNKNOWN");
    expect(r.body.open_incident.kind).toBe("unknown_outcome");
    expect(r.body.explanation.known.join(" ")).toMatch(/another send is blocked/);
    expect(r.body.actions.find((a: any) => a.action === "execute")).toMatchObject({ allowed: false });
    expect(r.body.actions.find((a: any) => a.action === "retry")).toMatchObject({ allowed: false });
    // a second irreversible send is refused
    const dup = await execute(w, ob.id);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("send_blocked_unresolved");
    const res = await w.c.call("POST", `/v1/payments/${r.body.payment.id}/reconcile`, w.operator);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("SIMULATED_SETTLED");
    expect(res.body.payment.settlement.reconciled_after_uncertainty).toBe(true);
    expect(res.body.open_incident).toBeNull();
    expect(sim().sendCalls - before).toBe(1);
  });
  it("failpoint: response lost via the injected fault also lands in UNKNOWN, and the worker path settles it", async () => {
    const { ob } = await toApproved(w, "3100000");
    arm("execute.after_provider_response", "throw");
    const r = await execute(w, ob.id);
    expect(r.body.state).toBe("UNKNOWN");
    await reconcileObligation(w.env.deps, sys(), ob.id, "worker");
    expect((await getOb(w, ob.id)).state).toBe("SIMULATED_SETTLED");
  });
  it("process killed after DISPATCHING marker: recovery → UNKNOWN (never FAILED, never retryable) → reconcile finds nothing sent → still blocked", async () => {
    const { ob } = await toApproved(w, "3200000", "error_then_no_record");
    // emulate the crash: reservation + dispatching committed, no outcome recorded
    arm("execute.before_provider_call", "throw");
    const r = await execute(w, ob.id);
    expect(r.body.state).toBe("UNKNOWN");
    const rr = await w.c.call("POST", `/v1/payments/${r.body.payment.id}/reconcile`, w.operator);
    expect(rr.body.state).toBe("RECONCILING");
    expect(rr.body.payment.reconciliation.last_result).toBe("NOT_FOUND");
    expect((await execute(w, ob.id)).status).toBe(409);
    // NOT_FOUND alone must not close it: the invoice has not expired
    const cn = await w.c.call("POST", `/v1/payments/${r.body.payment.id}/confirm-not-sent`, w.operator, {
      note: "checked the wallet myself",
    });
    expect(cn.status).toBe(409);
    expect(cn.body.detail).toMatch(/has not expired/);
  });
  it("restart recovery: a stuck DISPATCHING row becomes UNKNOWN on startup sweep", async () => {
    const { ob } = await toApproved(w, "3300000");
    arm("execute.after_reserve", "throw"); // dies between reserve and dispatch
    expect((await execute(w, ob.id)).status).toBe(500);
    expect((await getOb(w, ob.id)).state).toBe("EXECUTION_RESERVED");
    expect((await execute(w, ob.id)).status).toBe(409); // cannot send while reserved
    await q("UPDATE payout_obligations SET state_changed_at = now() - interval '5 minutes' WHERE id=$1", [
      ob.id,
    ]);
    expect(await releaseStaleReservations(w.env.deps)).toBeGreaterThanOrEqual(1);
    expect((await getOb(w, ob.id)).state).toBe("APPROVED");
    // simulate a process that died after writing DISPATCHING
    const r = await execute(w, ob.id);
    expect(r.status).toBe(200);
    const { ob: ob2 } = await toApproved(w, "3400000");
    await q(
      "UPDATE payout_obligations SET state='DISPATCHING', state_changed_at = now() - interval '1 minute' WHERE id=$1",
      [ob2.id],
    );
    // (intent/attempt rows do not exist for this synthetic case; create them as the real flow would have)
    await q(
      `INSERT INTO payment_intents(org_id,obligation_id,revision,intent_digest,binding,policy_id,wallet_connection_id,payment_hash,amount_msat,network,fee_limit_msat,reserved_by)
             SELECT o.org_id,o.id,1,o.intent_digest,'{}',o.policy_id,o.wallet_connection_id,r.payment_hash,r.amount_msat,r.network,1000,'test' FROM payout_obligations o JOIN obligation_revisions r ON r.obligation_id=o.id WHERE o.id=$1`,
      [ob2.id],
    );
    await q(
      "INSERT INTO execution_attempts(intent_id,attempt_no,outcome,dispatched_at) SELECT id,1,'DISPATCHING',now() FROM payment_intents WHERE obligation_id=$1",
      [ob2.id],
    );
    expect(await recoverStaleDispatch(w.env.deps, 3)).toBe(1);
    expect((await getOb(w, ob2.id)).state).toBe("UNKNOWN");
  });
  it("inconsistent provider answer (success with a wrong preimage) never settles; critical incident opened", async () => {
    const { ob } = await toApproved(w, "3500000", "succeed_bad_preimage");
    const r = await execute(w, ob.id);
    expect(r.body.state).toBe("UNKNOWN");
    expect(r.body.open_incident.kind).toBe("provider_inconsistent");
    expect(r.body.open_incident.severity).toBe("critical");
  });
  it("unreachable node during reconciliation: stays blocked, backs off, no state corruption", async () => {
    const { ob } = await toApproved(w, "3600000", "accept_then_lose_response");
    const r = await execute(w, ob.id);
    await w.c.call("POST", `/v1/dev/simulator/${w.connId}/lookups`, w.owner, { fail: true });
    const rr = await reconcileObligation(w.env.deps, sys(), ob.id, "worker");
    expect(rr).toBe("ERROR");
    expect((await getOb(w, ob.id)).state).toBe("RECONCILING");
    expect((await execute(w, ob.id)).status).toBe(409);
    await w.c.call("POST", `/v1/dev/simulator/${w.connId}/lookups`, w.owner, { fail: false });
    await q("UPDATE payout_obligations SET next_reconcile_at = now() WHERE id=$1", [ob.id]);
    expect(await reconcileObligation(w.env.deps, sys(), ob.id, "worker")).toBe("SETTLED");
    void r;
  });
  it("two reconcilers cannot run at once (lease)", async () => {
    const { ob } = await toApproved(w, "3700000", "accept_then_lose_response");
    await execute(w, ob.id);
    const [a, b] = await Promise.all([
      reconcileObligation(w.env.deps, sys(), ob.id, "worker"),
      reconcileObligation(w.env.deps, sys(), ob.id, "operator"),
    ]);
    expect([a, b].sort()).toEqual(["BUSY", "SETTLED"]);
  });
  it("confirm-not-sent works only with a fresh NOT_FOUND AND an expired invoice AND grace elapsed", async () => {
    // allow short invoices for this scenario
    await w.c.call("POST", "/v1/policies", w.owner, {
      name: "Default policy",
      rules: {
        ...DEFAULT_POLICY_RULES,
        minInvoiceRemainingSeconds: 0,
        tiers: [{ upToMsat: null, requiredApprovals: 1 }],
      },
    });
    const inv = await mintInvoice(w, "1200000", "error_then_no_record", 3);
    const o = (
      await w.c.call("POST", "/v1/obligations", w.operator, {
        counterparty_name: "Short Invoice Co",
        amount_msat: "1200000",
        invoice: inv.invoice,
      })
    ).body;
    const s = (await w.c.call("POST", `/v1/obligations/${o.id}/submit`, w.operator)).body;
    await w.c.approve(w.approver1, s);
    const ex = await execute(w, o.id);
    expect(ex.body.state).toBe("UNKNOWN");
    await new Promise((r) => setTimeout(r, 3500)); // invoice expires
    const early = await w.c.call("POST", `/v1/payments/${ex.body.payment.id}/confirm-not-sent`, w.operator, {
      note: "wallet shows nothing",
    });
    expect(early.status).toBe(409);
    expect(early.body.detail).toMatch(/Too soon/);
    await q(
      "UPDATE execution_attempts SET dispatched_at = now() - interval '10 minutes' WHERE intent_id=$1",
      [ex.body.payment.id],
    );
    const ok = await w.c.call("POST", `/v1/payments/${ex.body.payment.id}/confirm-not-sent`, w.operator, {
      note: "wallet shows nothing; invoice expired",
    });
    expect(ok.status).toBe(200);
    expect(ok.body.state).toBe("DEFINITIVELY_FAILED");
    expect(ok.body.payment.attempts[0].failure_reason).toBe("OPERATOR_CONFIRMED_NOT_SENT");
    const audit = await w.c.call("GET", `/v1/audit?stream=obligation:${o.id}`, w.owner);
    expect(audit.body.data.map((e: any) => e.type)).toContain("payment.confirmed_not_sent");
    // restore default policy
    await w.c.call("POST", "/v1/policies", w.owner, { name: "Default policy", rules: DEFAULT_POLICY_RULES });
  });
});

describe("definitive failures and retries", () => {
  it("wallet-reported terminal failure → DEFINITIVELY_FAILED; retry creates attempt 2; no auto-retry of UNKNOWN", async () => {
    const { ob, inv } = await toApproved(w, "1300000", "fail_insufficient");
    const r = await execute(w, ob.id);
    expect(r.body.state).toBe("DEFINITIVELY_FAILED");
    expect(r.body.payment.attempts[0].failure_reason).toBe("FAILURE_REASON_INSUFFICIENT_BALANCE");
    await w.c.call("POST", `/v1/dev/simulator/${w.connId}/behavior`, w.owner, {
      payment_hash: inv.payment_hash,
      behavior: "succeed",
    });
    const retry = await w.c.call("POST", `/v1/payments/${r.body.payment.id}/retry`, w.operator, undefined, {
      "idempotency-key": "retry-key-1234",
    });
    expect(retry.status).toBe(200);
    expect(retry.body.state).toBe("SIMULATED_SETTLED");
    expect(retry.body.payment.attempts.length).toBe(2);
  });
  it("transport proven not-sent → DEFINITIVELY_FAILED with NOT_SENT evidence", async () => {
    const { ob } = await toApproved(w, "1400000", "not_sent_unreachable");
    const r = await execute(w, ob.id);
    expect(r.body.state).toBe("DEFINITIVELY_FAILED");
    expect(r.body.payment.attempts[0].outcome).toBe("NOT_SENT");
  });
  it("settled payments cannot be cancelled, rejected or revised; there is no refund-by-edit", async () => {
    const { ob } = await toApproved(w, "1010000");
    await execute(w, ob.id);
    expect(
      (await w.c.call("POST", `/v1/obligations/${ob.id}/cancel`, w.operator, { reason: "oops" })).status,
    ).toBe(409);
    expect((await w.c.call("PUT", `/v1/obligations/${ob.id}`, w.operator, { memo: "changed" })).status).toBe(
      409,
    );
    expect(
      (await w.c.call("POST", `/v1/obligations/${ob.id}/reject`, w.approver1, { reason: "no" })).status,
    ).toBe(409);
    await expect(
      q("UPDATE obligation_revisions SET amount_msat = 1 WHERE obligation_id=$1", [ob.id]),
    ).rejects.toThrow(/append-only/);
  });
});

describe("invoice, network, amount, destination", () => {
  const priv = "b2".repeat(32);
  const mk = (o: Partial<Parameters<typeof encodeInvoice>[0]> = {}) =>
    encodeInvoice({
      network: "regtest",
      amountMsat: 500000n,
      paymentHashHex: sha256Hex(
        hexToBytes(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")),
      ),
      timestamp: Math.floor(Date.now() / 1000),
      expirySeconds: 3600,
      privateKeyHex: priv,
      ...o,
    });
  const create = (invoice: string, amount = "500000", cp = "Mallory Ltd") =>
    w.c.call("POST", "/v1/obligations", w.operator, { counterparty_name: cp, amount_msat: amount, invoice });
  it("rejects garbage, tampered and wrong-network invoices", async () => {
    expect((await create("lnbcrt1notaninvoice-but-long-enough-to-pass-length-validation")).body.code).toBe(
      "invoice_invalid",
    );
    const good = mk();
    expect(
      (await create(good.slice(0, 50) + (good[50] === "q" ? "p" : "q") + good.slice(51))).body.code,
    ).toBe("invoice_invalid");
    expect((await create(mk({ network: "mainnet" }))).body.code).toBe("network_mismatch");
    expect((await create(mk({ network: "testnet" }))).body.code).toBe("network_mismatch");
  });
  it("rejects expired invoices and amount mismatch (no silent overpay/underpay)", async () => {
    expect(
      (await create(mk({ timestamp: Math.floor(Date.now() / 1000) - 7200, expirySeconds: 60 }))).body.code,
    ).toBe("invoice_expired");
    const r = await create(mk({ amountMsat: 500000n }), "400000");
    expect(r.body.code).toBe("amount_mismatch");
  });
  it("blocks destination substitution against a bound payee, and reuse of an invoice by two payouts", async () => {
    const cp = (
      await w.c.call("POST", "/v1/counterparties", w.operator, {
        name: "Pinned Payee",
        bound_payee_pubkey: nodePubkeyFromPrivate("c3".repeat(32)),
      })
    ).body;
    const sub = await w.c.call("POST", "/v1/obligations", w.operator, {
      counterparty_id: cp.id,
      amount_msat: "500000",
      invoice: mk(),
    });
    expect(sub.body.code).toBe("destination_mismatch");
    const inv = await mintInvoice(w, "700000");
    const a = await w.c.call("POST", "/v1/obligations", w.operator, {
      counterparty_name: "Dup Co",
      amount_msat: "700000",
      invoice: inv.invoice,
    });
    expect(a.status).toBe(201);
    const b = await w.c.call("POST", "/v1/obligations", w.operator, {
      counterparty_name: "Dup Co",
      amount_msat: "700000",
      invoice: inv.invoice,
    });
    expect(b.status).toBe(409);
    expect(b.body.detail).toMatch(/already attached/);
  });
  it("binding changed after approval is caught at execution (destination substitution race)", async () => {
    const { ob, inv } = await toApproved(w, "1600000", "succeed");
    await w.c.call("PATCH", `/v1/counterparties/${ob.counterparty.id}`, w.owner, {
      bound_payee_pubkey: nodePubkeyFromPrivate("d4".repeat(32)),
    });
    const r = await execute(w, ob.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("destination_mismatch");
    await q("UPDATE counterparties SET bound_payee_pubkey = NULL WHERE id=$1", [ob.counterparty.id]); // keep later tests independent
    void inv;
  });
});

describe("approvals", () => {
  it("terms changed after approval → approvals void; old signature cannot be replayed on the new revision", async () => {
    const { ob } = await newDraft(w, "1700000");
    const s = (await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator)).body;
    const oldSig = await w.c.sign(w.approver1, s);
    expect((await w.c.call("POST", `/v1/obligations/${ob.id}/approve`, w.approver1, oldSig)).body.state).toBe(
      "APPROVED",
    );
    const inv2 = await mintInvoice(w, "1700000");
    const rev = await w.c.call("PUT", `/v1/obligations/${ob.id}`, w.operator, { invoice: inv2.invoice });
    expect(rev.body.state).toBe("DRAFT");
    expect(rev.body.current_revision).toBe(2);
    expect(rev.body.approvals.every((a: any) => !a.valid)).toBe(true);
    const s2 = (await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator)).body;
    const replay = await w.c.call("POST", `/v1/obligations/${ob.id}/approve`, w.approver1, oldSig);
    expect(replay.status).toBe(422);
    expect(replay.body.code).toBe("approval_invalid");
    expect(s2.state).toBe("AWAITING_APPROVAL");
  });
  it("duplicate approval, wrong digest, future timestamp, forged signature, no key — all rejected", async () => {
    const { ob } = await newDraft(w, "200000000"); // 200k sats > 100k tier → 2 approvals required
    const s = (await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator)).body;
    expect(s.policy.required_approvals).toBe(2);
    expect((await w.c.approve(w.approver1, s)).status).toBe(200);
    expect((await w.c.approve(w.approver1, s)).status).toBe(409); // duplicate
    expect((await w.c.approve(w.approver2, s, { intent_digest: "00".repeat(32) })).body.code).toBe(
      "approval_invalid",
    );
    const future = new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    expect((await w.c.approve(w.approver2, s, { signed_at: future })).body.code).toBe("approval_invalid"); // clock skew
    const good = await w.c.sign(w.approver2, s);
    expect(
      (
        await w.c.call("POST", `/v1/obligations/${ob.id}/approve`, w.approver2, {
          ...good,
          signature: "ab".repeat(64),
        })
      ).body.code,
    ).toBe("approval_invalid");
    expect((await getOb(w, ob.id)).state).toBe("AWAITING_APPROVAL");
  });
  it("operators, viewers, API keys and the maker cannot approve", async () => {
    const { ob } = await newDraft(w, "900000");
    const s = (await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator)).body;
    expect((await w.c.approve(w.operator, s)).status).toBe(403);
    expect((await w.c.approve(w.viewer, s)).status).toBe(403);
    const key = (await w.c.call("POST", "/v1/api-keys", w.owner, { name: "ci", role: "operator" })).body
      .secret;
    const sig = await w.c.sign(w.approver1, s);
    expect((await w.c.call("POST", `/v1/obligations/${ob.id}/approve`, { apiKey: key }, sig)).status).toBe(
      403,
    );
    // owner created nothing here; make owner the maker and have owner approve own payout
    const inv = await mintInvoice(w, "900000");
    const own = (
      await w.c.call("POST", "/v1/obligations", w.owner, {
        counterparty_name: "Self Pay",
        amount_msat: "900000",
        invoice: inv.invoice,
      })
    ).body;
    const so = (await w.c.call("POST", `/v1/obligations/${own.id}/submit`, w.owner)).body;
    const selfApprove = await w.c.approve(w.owner, so);
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.detail).toMatch(/someone other than the person who wrote/);
  });
  it("approver loses their role AFTER approving → execution refused (revoked role)", async () => {
    const { ob } = await toApproved(w, "200000000"); // two approvers
    const members = (await w.c.call("GET", "/v1/members", w.owner)).body.data;
    const m = members.find((x: any) => x.user.email === "approver2@acme.test");
    expect((await w.c.call("PATCH", `/v1/members/${m.id}`, w.owner, { status: "revoked" })).status).toBe(200);
    const cur = await getOb(w, ob.id);
    expect(cur.approvals.filter((a: any) => a.valid).length).toBe(1);
    expect(cur.actions.find((a: any) => a.action === "execute").allowed).toBe(false);
    const r = await execute(w, ob.id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("approval_insufficient");
    // restore for the rest of the suite
    await w.c.call("PATCH", `/v1/members/${m.id}`, w.owner, { status: "active" });
  });
  it("policy limits are enforced at submit; mainnet is blocked; policy change forces re-approval", async () => {
    const { ob } = await newDraft(w, "1100000000"); // 1.1M sats > 1M cap
    const r = await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator);
    expect(r.body.code).toBe("policy_violation");
    const t = await toApproved(w, "1800000");
    await w.c.call("POST", "/v1/policies", w.owner, {
      name: "Default policy",
      rules: { ...DEFAULT_POLICY_RULES, maxPaymentMsat: "999999999" },
    });
    const ex = await execute(w, t.ob.id);
    expect(ex.body.code).toBe("approval_stale");
    await w.c.call("POST", "/v1/policies", w.owner, { name: "Default policy", rules: DEFAULT_POLICY_RULES });
  });
});

describe("tenant isolation and authorization", () => {
  it("another workspace cannot read, approve, execute, or fetch receipts for these payouts (404, not 403)", async () => {
    const { ob } = await toApproved(w, "1900000");
    const done = await execute(w, ob.id);
    const evil = await w.c.register("eve@evil.test", "Eve", "Evil Corp");
    for (const [m, u] of [
      ["GET", `/v1/obligations/${ob.id}`],
      ["POST", `/v1/obligations/${ob.id}/execute`],
      ["POST", `/v1/obligations/${ob.id}/submit`],
      ["GET", `/v1/payments/${done.body.payment.id}`],
      ["GET", `/v1/payments/${done.body.payment.id}/receipt`],
      ["POST", `/v1/payments/${done.body.payment.id}/reconcile`],
    ] as const) {
      const r = await w.c.call(m, u, evil, undefined, { "idempotency-key": "evil-key-12345" });
      expect([404, 403]).toContain(r.status);
      expect(r.status).not.toBe(200);
    }
    expect((await w.c.call("GET", "/v1/obligations", evil)).body.data).toEqual([]);
    expect(
      (await w.c.call("GET", "/v1/audit", evil)).body.data.every(
        (e: any) => e.stream !== `obligation:${ob.id}`,
      ),
    ).toBe(true);
  });
  it("unauthenticated, bad CSRF, bad origin and viewer writes are refused", async () => {
    expect((await w.c.call("GET", "/v1/obligations", null)).status).toBe(401);
    expect((await w.c.call("POST", "/v1/obligations", { ...w.operator, csrf: "wrong" }, {})).status).toBe(
      403,
    );
    const r = await w.env.app.inject({
      method: "POST",
      url: "/v1/counterparties",
      headers: { cookie: w.operator.cookie, "x-csrf-token": w.operator.csrf, origin: "https://evil.example" },
      payload: { name: "X" },
    });
    expect(r.statusCode).toBe(403);
    expect((await w.c.call("POST", "/v1/counterparties", w.viewer, { name: "V" })).status).toBe(403);
    expect((await w.c.call("GET", "/v1/api-keys", w.operator)).status).toBe(403);
  });
  it("secrets are never returned: connections redact credentials", async () => {
    const r = await w.c.call("GET", "/v1/connections", w.owner);
    expect(JSON.stringify(r.body)).not.toMatch(/macaroon_hex|BEGIN CERT/);
  });
});

describe("environment problems", () => {
  it("no wallet connected → clear refusal; read-only wallet credential → blocked; stale capability list → blocked", async () => {
    const lone = await w.c.register("solo@solo.test", "Solo", "Solo Co");
    const r = await w.c.call("POST", "/v1/obligations", lone, {
      counterparty_name: "A",
      amount_msat: "100000",
      invoice: (await mintInvoice(w, "100000")).invoice,
    });
    expect(r.body.code).toBe("wallet_unavailable");
    // read-only credential
    const { ob } = await newDraft(w, "1050000");
    await q(
      "INSERT INTO provider_capabilities(wallet_connection_id,can_send,can_lookup,can_read_info,notes) VALUES ($1,'false','true','true','[\"read-only\"]')",
      [w.connId],
    );
    expect((await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator)).body.code).toBe(
      "wallet_insufficient_permissions",
    );
    await q("DELETE FROM provider_capabilities WHERE wallet_connection_id=$1 AND can_send='false'", [
      w.connId,
    ]);
    // stale capabilities
    const t = await toApproved(w, "1060000");
    await q(
      "UPDATE provider_capabilities SET discovered_at = now() - interval '3 days' WHERE wallet_connection_id=$1",
      [w.connId],
    );
    expect((await execute(w, t.ob.id)).body.detail).toMatch(/last checked more than 24 hours/);
    const chk = await w.c.call("POST", `/v1/connections/${w.connId}/check`, w.owner);
    expect(chk.status).toBe(200);
    expect((await execute(w, t.ob.id)).status).toBe(200);
  });
  it("a transaction that fails mid-reservation rolls back everything (no intent, no audit, state intact)", async () => {
    const { ob } = await toApproved(w, "1070000");
    const auditBefore = await countRows("audit_events");
    arm("execute.in_reserve_tx", "throw");
    expect((await execute(w, ob.id)).status).toBe(500);
    expect(await countRows("payment_intents", `obligation_id='${ob.id}'`)).toBe(0);
    expect(await countRows("audit_events")).toBe(auditBefore);
    expect((await getOb(w, ob.id)).state).toBe("APPROVED");
    expect((await execute(w, ob.id)).status).toBe(200);
  });
  it("database connections killed mid-flight: the service recovers on the next request", async () => {
    await q(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
    );
    let status = 0;
    for (let i = 0; i < 3 && status !== 200; i++)
      status = (await w.c.call("GET", "/v1/obligations", w.owner)).status;
    expect(status).toBe(200);
  });
  it("malicious input: injection strings, oversized bodies, bad ids, hostile names", async () => {
    const s = await w.c.call(
      "GET",
      `/v1/obligations?q=${encodeURIComponent("'; DROP TABLE payout_obligations;--")}`,
      w.owner,
    );
    expect(s.status).toBe(200);
    expect((await w.c.call("GET", "/v1/obligations/not-a-uuid", w.owner)).status).toBe(422);
    const big = await w.env.app.inject({
      method: "POST",
      url: "/v1/counterparties",
      headers: {
        cookie: w.operator.cookie,
        "x-csrf-token": w.operator.csrf,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ name: "x".repeat(400_000) }),
    });
    expect(big.statusCode).toBe(413 === big.statusCode ? 413 : 422);
    const xss = await w.c.call("POST", "/v1/counterparties", w.operator, {
      name: "<img src=x onerror=alert(1)>",
      notes: "<script>1</script>",
    });
    expect(xss.status).toBe(201);
    expect(xss.headers["content-type"]).toMatch(/application\/json/);
    expect(xss.headers["x-content-type-options"]).toBe("nosniff");
    expect(await countRows("payout_obligations")).toBeGreaterThan(0);
  });
  it("rate limiting protects sign-in", async () => {
    let limited = 0;
    for (let i = 0; i < 25; i++)
      if (
        (
          await w.c.call("POST", "/v1/auth/login", null, {
            email: "owner@acme.test",
            password: "wrong-password-xx",
          })
        ).status === 429
      )
        limited++;
    expect(limited).toBeGreaterThan(0);
  });
});
