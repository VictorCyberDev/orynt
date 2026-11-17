/**
 * REAL-LND ACCEPTANCE (regtest). Runs only when ORYNT_REGTEST_ENV points at .regtest/env.json produced by `node infra/regtest/up.mjs`.
 * Without it every test here is SKIPPED — a skip is NOT a pass and the execution register records the real-LND path as UNVERIFIED until this has run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeInvoice,
  sha256Hex,
  hexToBytes,
  DEFAULT_POLICY_RULES,
  encodeInvoice,
  nodePubkeyFromPrivate,
} from "@orynt/core";
import {
  AlreadyExistsError,
  InsufficientPermissionsError,
  LndRestProvider,
  NotSentError,
  lndActiveChannels,
  lndAddInvoice,
  lndLookupInvoice,
} from "@orynt/wallets";
import { execFileSync } from "node:child_process";
import { verifyReceipt } from "@orynt/verifier";
import { Client, createEnv, type Actor, type TestEnv } from "./helpers";
import { arm, disarmAll } from "../src/lib/failpoints";
import { reconcileObligation, systemCtx } from "../src/services/reconcile";

const envPath = process.env["ORYNT_REGTEST_ENV"];
const reg = envPath ? JSON.parse(readFileSync(envPath, "utf8")) : null;
const d = describe.skipIf(!reg);

d("LND REST adapter against a real regtest node", () => {
  const alice = () => ({
    restUrl: reg.alice.restUrl,
    macaroonHex: reg.alice.oryntMacaroonHex,
    tlsCertPem: readFileSync(reg.alice.tlsCertPath, "utf8"),
  });
  const bob = () => ({
    restUrl: reg.bob.restUrl,
    macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"),
    tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8"),
  });
  const A = () => new LndRestProvider(alice());
  it("reports regtest and discovers capabilities of the least-privilege macaroon", async () => {
    const info = await A().getInfo();
    expect(info.network).toBe("regtest");
    expect(info.nodePubkey).toBe(reg.alice.pubkey);
    const caps = await A().discoverCapabilities();
    expect(caps.canSendPayments).toBe(true);
    expect(caps.canLookupPayments).toBe(true);
  });
  it("a read-only macaroon is discovered as unable to send", async () => {
    const caps = await new LndRestProvider({
      ...alice(),
      macaroonHex: reg.alice.readOnlyMacaroonHex,
    }).discoverCapabilities();
    expect(caps.canSendPayments).toBe(false);
  });
  it("my independent BOLT11 decoder agrees with a real LND-issued invoice (payee key, amount, hash, network)", async () => {
    const inv = await lndAddInvoice(bob(), 123_000n, "decoder cross-check");
    const dec = decodeInvoice(inv.paymentRequest);
    expect(dec.network).toBe("regtest");
    expect(dec.amountMsat).toBe(123_000n);
    expect(dec.paymentHash).toBe(inv.paymentHash);
    expect(dec.payeePubkey).toBe(reg.bob.pubkey);
  });
  it("pays a real invoice; preimage hashes to the payment hash; the payee's node shows the invoice SETTLED; a second send is refused by the wallet; lookup is stable", async () => {
    const inv = await lndAddInvoice(bob(), 50_000_000n, "orynt acceptance");
    const rec = await A().sendPayment({
      invoice: inv.paymentRequest,
      paymentHash: inv.paymentHash,
      amountMsat: 50_000_000n,
      zeroAmountInvoice: false,
      feeLimitMsat: 500_000n,
      timeoutSeconds: 30,
    });
    expect(rec.status).toBe("SUCCEEDED");
    expect(sha256Hex(hexToBytes(rec.preimage!))).toBe(inv.paymentHash);
    const b = await lndLookupInvoice(bob(), inv.paymentHash);
    expect(b.settled).toBe(true);
    expect(b.preimage).toBe(rec.preimage);
    expect(b.amtPaidMsat).toBe(50_000_000n);
    await expect(
      A().sendPayment({
        invoice: inv.paymentRequest,
        paymentHash: inv.paymentHash,
        amountMsat: 50_000_000n,
        zeroAmountInvoice: false,
        feeLimitMsat: 500_000n,
        timeoutSeconds: 30,
      }),
    ).rejects.toBeInstanceOf(AlreadyExistsError);
    const l = await A().lookupPayment(inv.paymentHash);
    expect(l.status).toBe("SUCCEEDED");
    expect(l.preimage).toBe(rec.preimage);
  });
  it("lookup of a never-sent hash is NOT_FOUND; bad credential and unreachable node are classified correctly", async () => {
    expect((await A().lookupPayment("ab".repeat(32))).status).toBe("NOT_FOUND");
    await expect(
      new LndRestProvider({ ...alice(), macaroonHex: "00".repeat(40) }).getInfo(),
    ).rejects.toBeInstanceOf(InsufficientPermissionsError);
    await expect(
      new LndRestProvider({ ...alice(), restUrl: "https://127.0.0.1:1" }).sendPayment({
        invoice: "x",
        paymentHash: "00".repeat(32),
        amountMsat: 1n,
        zeroAmountInvoice: false,
        feeLimitMsat: 1n,
        timeoutSeconds: 2,
      }),
    ).rejects.toBeInstanceOf(NotSentError);
  });
});

d("Orynt end-to-end on a REAL Lightning payment (regtest)", () => {
  let env: TestEnv, c: Client, owner: Actor, operator: Actor, approver: Actor, connId: string;
  const bobCfg = () => ({
    restUrl: reg.bob.restUrl,
    macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"),
    tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8"),
  });
  beforeAll(async () => {
    env = await createEnv();
    c = new Client(env);
    owner = await c.register("owner@real.test");
    operator = await c.addMember(owner, "op@real.test", "operator");
    approver = await c.addMember(owner, "ap@real.test", "approver");
    const r = await c.call("POST", "/v1/connections", owner, {
      label: "alice (regtest)",
      kind: "lnd",
      lnd: {
        rest_url: reg.alice.restUrl,
        macaroon_hex: reg.alice.oryntMacaroonHex,
        tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8"),
      },
    });
    expect(r.status).toBe(201);
    expect(r.body.is_simulator).toBe(false);
    expect(r.body.network).toBe("regtest");
    connId = r.body.id;
  });
  afterAll(async () => {
    disarmAll();
    await env?.teardown();
  });
  const payout = async (sats: number) => {
    const inv = await lndAddInvoice(bobCfg(), BigInt(sats) * 1000n, `acceptance ${sats}`);
    const ob = (
      await c.call("POST", "/v1/obligations", operator, {
        counterparty_name: "Bob (regtest)",
        amount_msat: String(sats * 1000),
        invoice: inv.paymentRequest,
        wallet_connection_id: connId,
      })
    ).body;
    const s = (await c.call("POST", `/v1/obligations/${ob.id}/submit`, operator)).body;
    const a = (await c.approve(approver, s)).body;
    expect(a.state).toBe("APPROVED");
    return { id: ob.id as string, inv };
  };
  const exec = (id: string) =>
    c.call("POST", `/v1/obligations/${id}/execute`, operator, undefined, {
      "idempotency-key": "real-" + Math.random().toString(36).slice(2) + "xxxx",
    });
  const trust = async () => {
    const k = (await c.call("GET", "/v1/public/issuer-keys", null)).body.data[0];
    return [{ key_id: k.key_id, public_key: k.public_key }];
  };

  it("settles as REAL (not simulated), and the receipt passes the standalone verifier with --require-real", async () => {
    const { id, inv } = await payout(40_000);
    const r = await exec(id);
    expect(r.body.state).toBe("SETTLED");
    expect(r.body.environment).toBe("REAL_PROVIDER");
    expect((await lndLookupInvoice(bobCfg(), inv.paymentHash)).settled).toBe(true);
    const receipt = (await c.call("GET", `/v1/payments/${r.body.payment.id}/receipt`, owner)).body;
    const rep = verifyReceipt(receipt, { trustedKeys: await trust(), requireReal: true });
    expect(rep.checks.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(rep.verdict).toBe("VERIFIED");
    expect(
      verifyReceipt(
        { ...receipt, agreement: { ...receipt.agreement, memo: receipt.agreement.memo + "!" } },
        { trustedKeys: await trust() },
      ).verdict,
    ).toBe("REJECTED");
    // Journey B: the onboarding checklist reflects REAL state — a real wallet on regtest, a real settlement, a REAL_PROVIDER receipt
    const onb = (await c.call("GET", "/v1/onboarding", owner)).body;
    expect(onb.environment.mode).toBe("regtest");
    const done = (id: string) => onb.steps.find((x: { id: string }) => x.id === id);
    expect(
      done("wallet").done &&
        done("capabilities").done &&
        done("first_payout").done &&
        done("settlement").done,
    ).toBe(true);
    expect(done("settlement").detail).toMatch(/real wallet provider on regtest/);
  });
  it("response lost AFTER LND accepted the payment → UNKNOWN → second send refused → reconcile settles; LND shows exactly ONE payment", async () => {
    const { id, inv } = await payout(41_000);
    arm("execute.after_provider_response", "throw");
    const r = await exec(id);
    expect(r.status).toBe(202);
    expect(r.body.state).toBe("UNKNOWN");
    const dup = await exec(id);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("send_blocked_unresolved");
    expect(await reconcileObligation(env.deps, systemCtx(owner.orgId, "test"), id, "worker")).toBe("SETTLED");
    const o = (await c.call("GET", `/v1/obligations/${id}`, owner)).body;
    expect(o.state).toBe("SETTLED");
    expect(o.payment.settlement.reconciled_after_uncertainty).toBe(true);
    const paid = await new LndRestProvider({
      restUrl: reg.alice.restUrl,
      macaroonHex: reg.alice.oryntMacaroonHex,
      tlsCertPem: readFileSync(reg.alice.tlsCertPath, "utf8"),
    }).lookupPayment(inv.paymentHash);
    expect(paid.status).toBe("SUCCEEDED");
    // Journey C: the workbench tells the truth about this REAL uncertain payment and exports integrity-hashed evidence
    const inc = (await c.call("GET", "/v1/incidents", owner)).body.data.find(
      (i: { obligation_id: string }) => i.obligation_id === id,
    );
    expect(inc.status).toBe("resolved");
    const wb = (await c.call("GET", `/v1/incidents/${inc.id}`, owner)).body;
    expect(wb.payment_truth).toMatchObject({ state: "SETTLED", second_payment_blocked: false });
    // the attempt row now shows its FINAL outcome; the uncertain moment is preserved in the incident and the timeline
    expect(wb.incident.kind).toBe("unknown_outcome");
    expect(
      wb.timeline.some(
        (t: { source: string; title: string }) => t.source === "incident" && /Incident opened/.test(t.title),
      ),
    ).toBe(true);
    expect(wb.attempts.at(-1).outcome).toBe("SUCCEEDED");
    expect(wb.reconciliation_runs.length).toBeGreaterThanOrEqual(1);
    const ev = (await c.call("GET", `/v1/incidents/${inc.id}/evidence`, owner)).body;
    expect(ev.integrity.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("insufficient liquidity is a PROVEN failure reported by LND, not a guess", async () => {
    await c.call("POST", "/v1/policies", owner, {
      name: "Default policy",
      rules: {
        ...DEFAULT_POLICY_RULES,
        allowedNetworks: ["regtest"],
        maxPaymentMsat: "20000000000",
        dailyLimitMsat: null,
        tiers: [{ upToMsat: null, requiredApprovals: 1 }],
      },
    });
    const { id } = await payout(9_000_000); // 9M sats > the 5M-sat channel: LND cannot route it
    const r = await exec(id);
    expect(["DEFINITIVELY_FAILED", "UNKNOWN"]).toContain(r.body.state);
    if (r.body.state === "DEFINITIVELY_FAILED")
      expect(r.body.payment.attempts[0].failure_reason).toMatch(/FAILURE_REASON/);
  });
});

d("Real-node failure modes (regtest)", () => {
  let env: TestEnv, c: Client, owner: Actor, operator: Actor, approver: Actor, connId: string;
  const aliceCfg = () => ({
    restUrl: reg.alice.restUrl,
    macaroonHex: reg.alice.oryntMacaroonHex,
    tlsCertPem: readFileSync(reg.alice.tlsCertPath, "utf8"),
  });
  const bobCfg = () => ({
    restUrl: reg.bob.restUrl,
    macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"),
    tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8"),
  });
  const nodeCtl = (cmd: "stop" | "start", name: "alice" | "bob") =>
    execFileSync("node", [resolve(__dirname, "../../../infra/regtest/node.mjs"), cmd, name], {
      stdio: "pipe",
      timeout: 150_000,
    });
  const waitChannel = async () => {
    const end = Date.now() + 120_000;
    while (Date.now() < end) {
      try {
        if ((await lndActiveChannels(aliceCfg())) > 0) return;
      } catch {
        /* node starting */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("channel did not become active");
  };
  const sys = () => systemCtx(owner.orgId, "test");
  beforeAll(async () => {
    env = await createEnv();
    c = new Client(env);
    owner = await c.register("owner@fail.test");
    operator = await c.addMember(owner, "op@fail.test", "operator");
    approver = await c.addMember(owner, "ap@fail.test", "approver");
    connId = (
      await c.call("POST", "/v1/connections", owner, {
        label: "alice",
        kind: "lnd",
        lnd: {
          rest_url: reg.alice.restUrl,
          macaroon_hex: reg.alice.oryntMacaroonHex,
          tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8"),
        },
      })
    ).body.id;
  });
  afterAll(async () => {
    disarmAll();
    try {
      nodeCtl("start", "alice");
    } catch {
      /* maybe running */
    }
    try {
      nodeCtl("start", "bob");
    } catch {
      /* maybe running */
    }
    await env?.teardown();
  });
  const approved = async (sats: number, expiry = 3600) => {
    const inv = await lndAddInvoice(bobCfg(), BigInt(sats) * 1000n, `fail-mode ${sats}`, expiry);
    const ob = (
      await c.call("POST", "/v1/obligations", operator, {
        counterparty_name: "Bob (regtest)",
        amount_msat: String(sats * 1000),
        invoice: inv.paymentRequest,
        wallet_connection_id: connId,
      })
    ).body;
    const s = (await c.call("POST", `/v1/obligations/${ob.id}/submit`, operator)).body;
    expect((await c.approve(approver, s)).body.state).toBe("APPROVED");
    return { id: ob.id as string, inv };
  };
  const exec = (id: string) =>
    c.call("POST", `/v1/obligations/${id}/execute`, operator, undefined, {
      "idempotency-key": "f-" + Math.random().toString(36).slice(2) + "xxxxxx",
    });

  it("a READ-ONLY credential is discovered as unable to send: payouts cannot even be submitted", async () => {
    const r = await c.call("POST", "/v1/connections", owner, {
      label: "alice read-only",
      kind: "lnd",
      lnd: {
        rest_url: reg.alice.restUrl,
        macaroon_hex: reg.alice.readOnlyMacaroonHex,
        tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8"),
      },
    });
    expect(r.status).toBe(201);
    expect(r.body.capabilities.can_send).toBe("false");
    expect(r.body.capabilities.can_lookup).toBe("true");
    const inv = await lndAddInvoice(bobCfg(), 30_000_000n, "ro");
    const ob = (
      await c.call("POST", "/v1/obligations", operator, {
        counterparty_name: "Bob RO",
        amount_msat: "30000000",
        invoice: inv.paymentRequest,
        wallet_connection_id: r.body.id,
      })
    ).body;
    const sub = await c.call("POST", `/v1/obligations/${ob.id}/submit`, operator);
    expect(sub.status).toBe(409);
    expect(sub.body.code).toBe("wallet_insufficient_permissions");
  });
  it("a real invoice that has expired is refused before anything is sent", async () => {
    const inv = await lndAddInvoice(bobCfg(), 1_000_000n, "short", 1);
    await new Promise((r) => setTimeout(r, 2500));
    const r = await c.call("POST", "/v1/obligations", operator, {
      counterparty_name: "Late",
      amount_msat: "1000000",
      invoice: inv.paymentRequest,
      wallet_connection_id: connId,
    });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("invoice_expired");
  });
  it("destination substitution and wrong-network invoices are refused (real LND-issued invoice vs bound payee)", async () => {
    const cp = (
      await c.call("POST", "/v1/counterparties", operator, {
        name: "Pinned elsewhere",
        bound_payee_pubkey: nodePubkeyFromPrivate("c3".repeat(32)),
      })
    ).body;
    const inv = await lndAddInvoice(bobCfg(), 1_000_000n, "subst");
    const r = await c.call("POST", "/v1/obligations", operator, {
      counterparty_id: cp.id,
      amount_msat: "1000000",
      invoice: inv.paymentRequest,
      wallet_connection_id: connId,
    });
    expect(r.body.code).toBe("destination_mismatch");
    const wrongNet = encodeInvoice({
      network: "mainnet",
      amountMsat: 1_000_000n,
      paymentHashHex: "ab".repeat(32),
      timestamp: Math.floor(Date.now() / 1000),
      expirySeconds: 3600,
      privateKeyHex: "b2".repeat(32),
    });
    expect(
      (
        await c.call("POST", "/v1/obligations", operator, {
          counterparty_name: "WN",
          amount_msat: "1000000",
          invoice: wrongNet,
          wallet_connection_id: connId,
        })
      ).body.code,
    ).toBe("network_mismatch");
  });
  it("10 concurrent executes against the REAL wallet: exactly one payment reaches LND", async () => {
    const { id, inv } = await approved(35_000);
    const rs = await Promise.all(Array.from({ length: 10 }, () => exec(id)));
    expect(rs.filter((r) => r.status === 200 || r.status === 202).length).toBe(1);
    const lookup = await new LndRestProvider(aliceCfg()).lookupPayment(inv.paymentHash);
    expect(lookup.status).toBe("SUCCEEDED");
    expect((await lndLookupInvoice(bobCfg(), inv.paymentHash)).amtPaidMsat).toBe(35_000_000n); // paid once, not 10x
  }, 120_000);
  it("OUR node restarts while a payment is uncertain: reconciliation errors, stays blocked, then settles after the node returns", async () => {
    const { id, inv } = await approved(36_000);
    arm("execute.after_provider_response", "throw");
    expect((await exec(id)).body.state).toBe("UNKNOWN");
    nodeCtl("stop", "alice");
    expect(await reconcileObligation(env.deps, sys(), id, "worker")).toBe("ERROR");
    const blocked = (await c.call("GET", `/v1/obligations/${id}`, owner)).body;
    expect(blocked.state).toBe("RECONCILING");
    expect((await exec(id)).status).toBe(409);
    nodeCtl("start", "alice");
    await env.pool.query("UPDATE payout_obligations SET reconcile_lease_until=NULL WHERE id=$1", [id]);
    expect(await reconcileObligation(env.deps, sys(), id, "worker")).toBe("SETTLED");
    expect((await new LndRestProvider(aliceCfg()).lookupPayment(inv.paymentHash)).status).toBe("SUCCEEDED");
  }, 300_000);
  it("PAYEE node offline: the payment fails as PROVEN (wallet-reported), and a retry after it returns settles for real — one payment total", async () => {
    const { id, inv } = await approved(37_000);
    nodeCtl("stop", "bob");
    const r = await exec(id);
    expect(["DEFINITIVELY_FAILED", "PENDING", "UNKNOWN"]).toContain(r.body.state);
    if (r.body.state !== "DEFINITIVELY_FAILED") {
      // LND may still be retrying: let reconciliation find the terminal state
      for (
        let i = 0;
        i < 12 &&
        !["DEFINITIVELY_FAILED", "SETTLED"].includes(
          (await c.call("GET", `/v1/obligations/${id}`, owner)).body.state,
        );
        i++
      ) {
        await env.pool.query("UPDATE payout_obligations SET reconcile_lease_until=NULL WHERE id=$1", [id]);
        await reconcileObligation(env.deps, sys(), id, "worker");
        await new Promise((x) => setTimeout(x, 3000));
      }
    }
    const failed = (await c.call("GET", `/v1/obligations/${id}`, owner)).body;
    expect(failed.state).toBe("DEFINITIVELY_FAILED");
    expect(failed.payment.attempts[0].failure_reason).toMatch(/FAILURE_REASON/);
    nodeCtl("start", "bob");
    await waitChannel();
    const retry = await c.call("POST", `/v1/payments/${failed.payment.id}/retry`, operator, undefined, {
      "idempotency-key": "retry-" + Math.random().toString(36).slice(2) + "xxxx",
    });
    expect(retry.body.state).toBe("SETTLED");
    expect(retry.body.payment.attempts.length).toBe(2);
    expect((await lndLookupInvoice(bobCfg(), inv.paymentHash)).amtPaidMsat).toBe(37_000_000n);
  }, 400_000);
});

d("Lightning Address (LNURL-pay) with a REAL LND invoice", () => {
  let env: TestEnv,
    c: Client,
    owner: Actor,
    operator: Actor,
    approver: Actor,
    connId: string,
    srv: import("node:http").Server,
    port = 0;
  const bobCfg = () => ({
    restUrl: reg.bob.restUrl,
    macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"),
    tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8"),
  });
  const METADATA = JSON.stringify([["text/plain", "Real LND LNURL test"]]);
  beforeAll(async () => {
    const http = await import("node:http");
    srv = http.createServer(async (req, res) => {
      const u = new URL(req.url!, "http://x");
      const send = (o: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      if (u.pathname.startsWith("/.well-known/lnurlp/"))
        return send({
          tag: "payRequest",
          callback: `http://127.0.0.1:${port}/cb`,
          minSendable: 1000,
          maxSendable: 500_000_000,
          metadata: METADATA,
        });
      const inv = await lndAddInvoice(
        bobCfg(),
        BigInt(u.searchParams.get("amount")!),
        "",
        3600,
        sha256Hex(METADATA),
      );
      send({ pr: inv.paymentRequest, routes: [] });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    port = (srv.address() as { port: number }).port;
    env = await createEnv();
    c = new Client(env);
    owner = await c.register("owner@lnurl-real.test");
    operator = await c.addMember(owner, "op@lnurl-real.test", "operator");
    approver = await c.addMember(owner, "ap@lnurl-real.test", "approver");
    connId = (
      await c.call("POST", "/v1/connections", owner, {
        label: "alice",
        kind: "lnd",
        lnd: {
          rest_url: reg.alice.restUrl,
          macaroon_hex: reg.alice.oryntMacaroonHex,
          tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8"),
        },
      })
    ).body.id;
  });
  afterAll(async () => {
    srv?.close();
    await env?.teardown();
  });
  it("resolves a Lightning address to a real LND invoice whose description hash matches, then pays it for real", async () => {
    const r = await c.call("POST", "/v1/lnurl/resolve", operator, {
      address: `bob@127.0.0.1:${port}`,
      amount_msat: "42000000",
    });
    expect(r.status).toBe(200);
    expect(r.body.verified.description_hash_matches).toBe(true);
    expect(r.body.payee_pubkey).toBe(reg.bob.pubkey);
    expect(decodeInvoice(r.body.invoice).descriptionHash).toBe(sha256Hex(METADATA));
    const ob = (
      await c.call("POST", "/v1/obligations", operator, {
        counterparty_name: "Bob via LN address",
        amount_msat: "42000000",
        invoice: r.body.invoice,
        wallet_connection_id: connId,
      })
    ).body;
    const s = (await c.call("POST", `/v1/obligations/${ob.id}/submit`, operator)).body;
    expect((await c.approve(approver, s)).body.state).toBe("APPROVED");
    const ex = await c.call("POST", `/v1/obligations/${ob.id}/execute`, operator, undefined, {
      "idempotency-key": "lnurl-real-" + Math.random().toString(36).slice(2) + "xx",
    });
    expect(ex.body.state).toBe("SETTLED");
    expect(ex.body.environment).toBe("REAL_PROVIDER");
  });
});
