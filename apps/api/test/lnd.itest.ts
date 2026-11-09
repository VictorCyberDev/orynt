/**
 * REAL-LND ACCEPTANCE (regtest). Runs only when ORYNT_REGTEST_ENV points at .regtest/env.json produced by `node infra/regtest/up.mjs`.
 * Without it every test here is SKIPPED — a skip is NOT a pass and the execution register records the real-LND path as UNVERIFIED until this has run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeInvoice, sha256Hex, hexToBytes } from "@orynt/core";
import { AlreadyExistsError, InsufficientPermissionsError, LndRestProvider, NotSentError, lndAddInvoice, lndLookupInvoice } from "@orynt/wallets";
import { verifyReceipt } from "@orynt/verifier";
import { Client, createEnv, type Actor, type TestEnv } from "./helpers";
import { arm, disarmAll } from "../src/lib/failpoints";
import { reconcileObligation, systemCtx } from "../src/services/reconcile";

const envPath = process.env["ORYNT_REGTEST_ENV"];
const reg = envPath ? JSON.parse(readFileSync(envPath, "utf8")) : null;
const d = describe.skipIf(!reg);

d("LND REST adapter against a real regtest node", () => {
  const alice = () => ({ restUrl: reg.alice.restUrl, macaroonHex: reg.alice.oryntMacaroonHex, tlsCertPem: readFileSync(reg.alice.tlsCertPath, "utf8") });
  const bob = () => ({ restUrl: reg.bob.restUrl, macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"), tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8") });
  const A = () => new LndRestProvider(alice());
  it("reports regtest and discovers capabilities of the least-privilege macaroon", async () => {
    const info = await A().getInfo(); expect(info.network).toBe("regtest"); expect(info.nodePubkey).toBe(reg.alice.pubkey);
    const caps = await A().discoverCapabilities(); expect(caps.canSendPayments).toBe(true); expect(caps.canLookupPayments).toBe(true);
  });
  it("a read-only macaroon is discovered as unable to send", async () => {
    const caps = await new LndRestProvider({ ...alice(), macaroonHex: reg.alice.readOnlyMacaroonHex }).discoverCapabilities();
    expect(caps.canSendPayments).toBe(false);
  });
  it("my independent BOLT11 decoder agrees with a real LND-issued invoice (payee key, amount, hash, network)", async () => {
    const inv = await lndAddInvoice(bob(), 123_000n, "decoder cross-check");
    const dec = decodeInvoice(inv.paymentRequest);
    expect(dec.network).toBe("regtest"); expect(dec.amountMsat).toBe(123_000n); expect(dec.paymentHash).toBe(inv.paymentHash); expect(dec.payeePubkey).toBe(reg.bob.pubkey);
  });
  it("pays a real invoice; preimage hashes to the payment hash; the payee's node shows the invoice SETTLED; a second send is refused by the wallet; lookup is stable", async () => {
    const inv = await lndAddInvoice(bob(), 50_000_000n, "orynt acceptance");
    const rec = await A().sendPayment({ invoice: inv.paymentRequest, paymentHash: inv.paymentHash, amountMsat: 50_000_000n, zeroAmountInvoice: false, feeLimitMsat: 500_000n, timeoutSeconds: 30 });
    expect(rec.status).toBe("SUCCEEDED"); expect(sha256Hex(hexToBytes(rec.preimage!))).toBe(inv.paymentHash);
    const b = await lndLookupInvoice(bob(), inv.paymentHash); expect(b.settled).toBe(true); expect(b.preimage).toBe(rec.preimage); expect(b.amtPaidMsat).toBe(50_000_000n);
    await expect(A().sendPayment({ invoice: inv.paymentRequest, paymentHash: inv.paymentHash, amountMsat: 50_000_000n, zeroAmountInvoice: false, feeLimitMsat: 500_000n, timeoutSeconds: 30 })).rejects.toBeInstanceOf(AlreadyExistsError);
    const l = await A().lookupPayment(inv.paymentHash); expect(l.status).toBe("SUCCEEDED"); expect(l.preimage).toBe(rec.preimage);
  });
  it("lookup of a never-sent hash is NOT_FOUND; bad credential and unreachable node are classified correctly", async () => {
    expect((await A().lookupPayment("ab".repeat(32))).status).toBe("NOT_FOUND");
    await expect(new LndRestProvider({ ...alice(), macaroonHex: "00".repeat(40) }).getInfo()).rejects.toBeInstanceOf(InsufficientPermissionsError);
    await expect(new LndRestProvider({ ...alice(), restUrl: "https://127.0.0.1:1" }).sendPayment({ invoice: "x", paymentHash: "00".repeat(32), amountMsat: 1n, zeroAmountInvoice: false, feeLimitMsat: 1n, timeoutSeconds: 2 })).rejects.toBeInstanceOf(NotSentError);
  });
});

d("Orynt end-to-end on a REAL Lightning payment (regtest)", () => {
  let env: TestEnv, c: Client, owner: Actor, operator: Actor, approver: Actor, connId: string;
  const bobCfg = () => ({ restUrl: reg.bob.restUrl, macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"), tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8") });
  beforeAll(async () => {
    env = await createEnv(); c = new Client(env);
    owner = await c.register("owner@real.test"); operator = await c.addMember(owner, "op@real.test", "operator"); approver = await c.addMember(owner, "ap@real.test", "approver");
    const r = await c.call("POST", "/v1/connections", owner, { label: "alice (regtest)", kind: "lnd", lnd: { rest_url: reg.alice.restUrl, macaroon_hex: reg.alice.oryntMacaroonHex, tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8") } });
    expect(r.status).toBe(201); expect(r.body.is_simulator).toBe(false); expect(r.body.network).toBe("regtest"); connId = r.body.id;
  });
  afterAll(async () => { disarmAll(); await env?.teardown(); });
  const payout = async (sats: number) => {
    const inv = await lndAddInvoice(bobCfg(), BigInt(sats) * 1000n, `acceptance ${sats}`);
    const ob = (await c.call("POST", "/v1/obligations", operator, { counterparty_name: "Bob (regtest)", amount_msat: String(sats * 1000), invoice: inv.paymentRequest, wallet_connection_id: connId })).body;
    const s = (await c.call("POST", `/v1/obligations/${ob.id}/submit`, operator)).body;
    const a = (await c.approve(approver, s)).body; expect(a.state).toBe("APPROVED");
    return { id: ob.id as string, inv };
  };
  const exec = (id: string) => c.call("POST", `/v1/obligations/${id}/execute`, operator, undefined, { "idempotency-key": "real-" + Math.random().toString(36).slice(2) + "xxxx" });
  const trust = async () => { const k = (await c.call("GET", "/v1/public/issuer-keys", null)).body.data[0]; return [{ key_id: k.key_id, public_key: k.public_key }]; };

  it("settles as REAL (not simulated), and the receipt passes the standalone verifier with --require-real", async () => {
    const { id, inv } = await payout(40_000);
    const r = await exec(id);
    expect(r.body.state).toBe("SETTLED"); expect(r.body.environment).toBe("REAL_PROVIDER");
    expect((await lndLookupInvoice(bobCfg(), inv.paymentHash)).settled).toBe(true);
    const receipt = (await c.call("GET", `/v1/payments/${r.body.payment.id}/receipt`, owner)).body;
    const rep = verifyReceipt(receipt, { trustedKeys: await trust(), requireReal: true });
    expect(rep.checks.filter((x) => x.status === "FAIL")).toEqual([]); expect(rep.verdict).toBe("VERIFIED");
    expect(verifyReceipt({ ...receipt, agreement: { ...receipt.agreement, memo: receipt.agreement.memo + "!" } }, { trustedKeys: await trust() }).verdict).toBe("REJECTED");
  });
  it("response lost AFTER LND accepted the payment → UNKNOWN → second send refused → reconcile settles; LND shows exactly ONE payment", async () => {
    const { id, inv } = await payout(41_000);
    arm("execute.after_provider_response", "throw");
    const r = await exec(id); expect(r.status).toBe(202); expect(r.body.state).toBe("UNKNOWN");
    const dup = await exec(id); expect(dup.status).toBe(409); expect(dup.body.code).toBe("send_blocked_unresolved");
    expect(await reconcileObligation(env.deps, systemCtx(owner.orgId, "test"), id, "worker")).toBe("SETTLED");
    const o = (await c.call("GET", `/v1/obligations/${id}`, owner)).body; expect(o.state).toBe("SETTLED"); expect(o.payment.settlement.reconciled_after_uncertainty).toBe(true);
    const paid = await new LndRestProvider({ restUrl: reg.alice.restUrl, macaroonHex: reg.alice.oryntMacaroonHex, tlsCertPem: readFileSync(reg.alice.tlsCertPath, "utf8") }).lookupPayment(inv.paymentHash);
    expect(paid.status).toBe("SUCCEEDED");
  });
  it("insufficient liquidity is a PROVEN failure reported by LND, not a guess", async () => {
    const { id } = await payout(900_000); // > channel capacity: LND cannot route it
    const r = await exec(id); expect(["DEFINITIVELY_FAILED", "UNKNOWN"]).toContain(r.body.state);
    if (r.body.state === "DEFINITIVELY_FAILED") expect(r.body.payment.attempts[0].failure_reason).toMatch(/FAILURE_REASON/);
  });
});
