/**
 * pnpm demo:full [--simulator]
 *
 * Deterministic end-to-end demonstration, driven ONLY through the public HTTP API and the standalone verifier CLI:
 *   A. normal payout → settled              B. response lost after the wallet accepted → UNKNOWN → duplicate refused → reconciled
 *   C. (real mode) API process KILLED after LND accepted the payment → restart → recovery → reconciled → exactly one payment
 *   D. receipts → standalone verifier (exit codes) → one-byte tamper rejected → replay rejected
 *
 * Modes:  default = REAL Lightning on local regtest (needs `node infra/regtest/up.mjs` first; coins are worthless test coins)
 *         --simulator = labelled SIMULATOR wallet (no real payment; scenario C is skipped because simulator state is in-memory)
 * Output: docs/evidence/demo-<mode>-<timestamp>.{md,json}. Simulator output is stamped SIMULATED and must never be presented as real evidence.
 */
import { spawn, execFileSync, execSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { generateKeyPair, signApproval, signMessage, sha256Hex, hexToBytes, type KeyPair } from "@orynt/core";
import { lndAddInvoice, lndLookupInvoice, LndRestProvider } from "@orynt/wallets";

const ROOT = resolve(import.meta.dirname, "..");
const SIM = process.argv.includes("--simulator");
const MODE = SIM ? "simulator" : "real-regtest";
const PORT = 8788,
  BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = process.env["TEST_ADMIN_DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_test";
const DB = `orynt_demo_${Date.now()}`;
const PW = "demo-password-123";
const log: string[] = [];
const evidence: Record<string, unknown> = { mode: MODE, simulated: SIM, startedAt: new Date().toISOString() };
const say = (s = "") => {
  console.log(s);
  log.push(s);
};
const h = (s: string) => say(`\n━━ ${s}`);
const ok = (c: boolean, m: string) => {
  say(`${c ? "  ✔" : "  ✘"} ${m}`);
  if (!c) throw new Error("ASSERTION FAILED: " + m);
};

const reg = !SIM
  ? (() => {
      const p = process.env["ORYNT_REGTEST_ENV"] ?? join(ROOT, ".regtest/env.json");
      if (!existsSync(p)) {
        console.error(
          `Real mode needs a regtest network: run  bash infra/regtest/fetch.sh && node infra/regtest/up.mjs  (or pass --simulator for the labelled simulator run).`,
        );
        process.exit(3);
      }
      return JSON.parse(readFileSync(p, "utf8"));
    })()
  : null;
const bobCfg = () => ({
  restUrl: reg.bob.restUrl,
  macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"),
  tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8"),
});

let server: ChildProcess | null = null;
const startServer = async () => {
  server = spawn("npx", ["tsx", "src/server.ts"], {
    cwd: join(ROOT, "apps/api"),
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      ORYNT_ENV: "development",
      ORYNT_DEFAULT_PLAN: "enterprise",
      ORYNT_BILLING_WEBHOOK_SECRET: "whsec_dev_sandbox_only",
      ORYNT_FAILPOINTS: "1",
      ORYNT_RECONCILE_INITIAL_DELAY_SECONDS: "3600",
      ORYNT_WORKER_INTERVAL_MS: "1000",
      PORT: String(PORT),
      DATABASE_URL: ADMIN.replace(/\/[^/]+$/, "/" + DB),
      LOG_LEVEL: "error",
    },
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE + "/health/ready")).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("API did not become ready");
};
const stopServer = () => {
  try {
    if (server?.pid) process.kill(-server.pid, "SIGTERM");
  } catch {
    /* gone */
  }
};

interface S {
  cookie: string;
  csrf: string;
  userId: string;
  orgId: string;
  keys: KeyPair;
}
const call = async (
  method: string,
  path: string,
  s: S | null,
  body?: unknown,
  headers: Record<string, string> = {},
) => {
  const hd: Record<string, string> = {
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...headers,
  };
  if (s) {
    hd["cookie"] = s.cookie;
    if (method !== "GET") hd["x-csrf-token"] = s.csrf;
  }
  const res = await fetch(BASE + path, {
    method,
    headers: hd,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* */
  }
  return { status: res.status, json, res };
};
const mkSession = async (path: string, body: object): Promise<S> => {
  const r = await call("POST", path, null, body);
  if (r.status >= 300) throw new Error(`${path}: ${JSON.stringify(r.json)}`);
  const cookie = (r.res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const keys = generateKeyPair();
  const s: S = { cookie, csrf: r.json.csrf_token, userId: r.json.user.id, orgId: r.json.workspace.id, keys };
  const proof = signMessage(
    keys.privateKey,
    "orynt.key-registration.v1",
    `orynt.register-key:${s.orgId}:${keys.publicKey}`,
  );
  const k = await call("POST", "/v1/me/approval-key", s, {
    public_key: keys.publicKey,
    proof_signature: proof,
  });
  if (k.status !== 200) throw new Error("key: " + JSON.stringify(k.json));
  return s;
};
const approve = async (a: S, ob: any) => {
  const p = {
    v: 1 as const,
    type: "approval" as const,
    intent_digest: ob.intent_digest,
    approver_user_id: a.userId,
    workspace_id: a.orgId,
    signed_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  return call("POST", `/v1/obligations/${ob.id}/approve`, a, {
    intent_digest: p.intent_digest,
    signed_at: p.signed_at,
    signature: signApproval(a.keys.privateKey, p),
  });
};

(async () => {
  say(
    `Orynt demo:full — mode: ${MODE.toUpperCase()}${SIM ? "  (SIMULATED: no real payment occurs; do NOT present as real evidence)" : "  (real Lightning payments between real nodes on local regtest; test coins only)"}`,
  );
  const gitSha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  evidence["commit"] = gitSha;
  h("Setup: fresh PostgreSQL database, API server, verifier bundle");
  // use an existing PostgreSQL (CI service container, docker, remote) if reachable; otherwise start the local distro cluster
  const reachable = await (async () => {
    const c = new pg.Client({ connectionString: ADMIN });
    try {
      await c.connect();
      await c.end();
      return true;
    } catch {
      return false;
    }
  })();
  if (!reachable) execSync("bash infra/postgres/start-local.sh", { cwd: ROOT, stdio: "ignore" });
  const adm = new pg.Client({ connectionString: ADMIN });
  await adm.connect();
  await adm.query(`CREATE DATABASE ${DB}`);
  await adm.end();
  execFileSync("pnpm", ["--filter", "@orynt/verifier", "build"], { cwd: ROOT, stdio: "ignore" });
  await startServer();
  ok(true, `API ready on ${BASE} with database ${DB}`);
  const verifier = join(ROOT, "packages/verifier/dist/orynt-verify.mjs");
  const verify = (file: string, extra: string[]) => {
    try {
      const out = execFileSync("node", [verifier, file, ...extra], { encoding: "utf8" });
      return { code: 0, out };
    } catch (e: any) {
      return { code: e.status as number, out: String(e.stdout) };
    }
  };

  h("Workspace, team and wallet");
  const owner = await mkSession("/v1/auth/register", {
    email: "owner@demo.test",
    password: PW,
    name: "Ada (owner)",
    workspace_name: `Demo (${MODE})`,
  });
  const add = async (email: string, role: string) => {
    const r = await call("POST", "/v1/members", owner, {
      email,
      name: email.split("@")[0],
      role,
      temporary_password: PW,
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.json));
    return mkSession("/v1/auth/login", { email, password: PW });
  };
  const operator = await add("operator@demo.test", "operator"),
    approver = await add("approver@demo.test", "approver");
  const conn = (
    await call(
      "POST",
      "/v1/connections",
      owner,
      SIM
        ? { label: "Practice wallet (SIMULATOR)", kind: "simulator" }
        : {
            label: "alice (regtest LND)",
            kind: "lnd",
            lnd: {
              rest_url: reg.alice.restUrl,
              macaroon_hex: reg.alice.oryntMacaroonHex,
              tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8"),
            },
          },
    )
  ).json;
  ok(
    conn.network === "regtest",
    `wallet connected on ${conn.network}; discovered permissions: send=${conn.capabilities.can_send} lookup=${conn.capabilities.can_lookup}`,
  );
  ok(
    conn.is_simulator === SIM,
    SIM ? "connection is labelled SIMULATOR" : "connection is a REAL LND node (least-privilege macaroon)",
  );
  evidence["wallet"] = {
    kind: conn.kind,
    network: conn.network,
    node_pubkey: conn.node_pubkey,
    capabilities: conn.capabilities,
  };

  const invoice = async (sats: number, behavior = "succeed") => {
    if (SIM) {
      const r = await call("POST", `/v1/dev/simulator/${conn.id}/invoice`, owner, {
        amount_msat: String(sats * 1000),
        behavior,
      });
      return { pr: r.json.invoice as string, hash: r.json.payment_hash as string };
    }
    const i = await lndAddInvoice(bobCfg(), BigInt(sats) * 1000n, `orynt demo ${sats}`);
    return { pr: i.paymentRequest, hash: i.paymentHash };
  };
  const newApproved = async (cp: string, sats: number, behavior = "succeed") => {
    const inv = await invoice(sats, behavior);
    const ob = (
      await call("POST", "/v1/obligations", operator, {
        counterparty_name: cp,
        amount_msat: String(sats * 1000),
        memo: `demo ${sats} sats`,
        invoice: inv.pr,
      })
    ).json;
    if (!ob.id) throw new Error("create failed: " + JSON.stringify(ob));
    const sub = (await call("POST", `/v1/obligations/${ob.id}/submit`, operator)).json;
    if (!sub.intent_digest) throw new Error("submit failed: " + JSON.stringify(sub));
    const apr = await approve(approver, sub);
    if (apr.status !== 200) throw new Error(JSON.stringify(apr.json));
    return { id: ob.id as string, hash: inv.hash, state: apr.json.state as string, ref: ob.ref as string };
  };
  const exec = (id: string, key = "demo-" + Math.random().toString(36).slice(2, 12)) =>
    call("POST", `/v1/obligations/${id}/execute`, operator, undefined, { "idempotency-key": key });
  const get = async (id: string) => (await call("GET", `/v1/obligations/${id}`, owner)).json;
  const settledState = SIM ? "SIMULATED_SETTLED" : "SETTLED";
  const receipts: Record<string, string> = {};
  const outDir = join(ROOT, "docs/evidence");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rcpt = async (key: string, o: any) => {
    const r = (await call("GET", `/v1/payments/${o.payment.id}/receipt`, owner)).json;
    const f = join(outDir, `receipt-${MODE}-${stamp}-${key}.json`);
    writeFileSync(f, JSON.stringify(r, null, 2));
    receipts[key] = f;
    return f;
  };

  h("A. A normal payout: approved by someone else, sent once, settled");
  const A = await newApproved("Bob Studio", 30_000);
  ok(A.state === "APPROVED", `${A.ref} approved by a different person than its creator`);
  const aRes = await exec(A.id);
  const aOb = aRes.json;
  ok(aRes.status === 200 && aOb.state === settledState, `state ${aOb.state} (${aOb.environment})`);
  if (!SIM) {
    const b = await lndLookupInvoice(bobCfg(), A.hash);
    ok(
      b.settled && b.preimage === aOb.payment.settlement.preimage,
      "payee node (bob) independently shows the invoice SETTLED with the same preimage",
    );
  }
  ok(sha256Hex(hexToBytes(aOb.payment.settlement.preimage)) === A.hash, "sha256(preimage) == payment hash");
  evidence["A"] = {
    ref: A.ref,
    payment_hash: A.hash,
    state: aOb.state,
    preimage: aOb.payment.settlement.preimage,
  };

  h("B. The wallet's answer is lost AFTER it accepted the payment");
  const B = await newApproved("Chidi Contributions", 31_000);
  await call("POST", "/v1/dev/failpoints", owner, {
    name: "execute.after_provider_response",
    action: "throw",
  });
  const bRes = await exec(B.id);
  ok(
    bRes.status === 202 && bRes.json.state === "UNKNOWN",
    `HTTP ${bRes.status}: state ${bRes.json.state} — NOT failed`,
  );
  const dup = await exec(B.id);
  ok(
    dup.status === 409 && dup.json.code === "send_blocked_unresolved",
    `second send REFUSED: “${dup.json.detail}”`,
  );
  const rec = await call("POST", `/v1/payments/${bRes.json.payment.id}/reconcile`, operator);
  ok(rec.json.state === settledState, `wallet's own record found by payment hash → ${rec.json.state}`);
  ok(
    rec.json.payment.settlement.reconciled_after_uncertainty,
    "receipt will say it was settled after an uncertain moment",
  );
  evidence["B"] = {
    payment_hash: B.hash,
    first_response: bRes.json.state,
    duplicate_refused: dup.json.code,
    final: rec.json.state,
  };
  if (!SIM) {
    const p = await new LndRestProvider({
      restUrl: reg.alice.restUrl,
      macaroonHex: reg.alice.oryntMacaroonHex,
      tlsCertPem: readFileSync(reg.alice.tlsCertPath, "utf8"),
    }).lookupPayment(B.hash);
    ok(p.status === "SUCCEEDED", "LND shows exactly one successful payment for this hash");
  }

  if (!SIM) {
    h("C. The API process is KILLED (SIGKILL) right after LND accepted the payment");
    const C = await newApproved("Nia Co-op", 32_000);
    await call("POST", "/v1/dev/failpoints", owner, {
      name: "execute.after_provider_response",
      action: "exit",
    });
    await exec(C.id).catch(() => null);
    await new Promise((r) => setTimeout(r, 800));
    ok(true, "process died mid-request (no response was ever sent)");
    await startServer();
    say("  … restarted; startup recovery ran");
    const c1 = await (async () => {
      const s2 = await mkSession("/v1/auth/login", { email: "operator@demo.test", password: PW });
      return (await call("GET", `/v1/obligations/${C.id}`, s2)).json;
    })();
    ok(
      c1.state === "UNKNOWN" || c1.state === "RECONCILING",
      `after restart the payout is ${c1.state} — never FAILED, never retryable`,
    );
    const s3 = await mkSession("/v1/auth/login", { email: "operator@demo.test", password: PW });
    const cr = await call("POST", `/v1/payments/${c1.payment.id}/reconcile`, s3);
    ok(cr.json.state === "SETTLED", `reconciled from LND's record → ${cr.json.state}`);
    evidence["C"] = { payment_hash: C.hash, after_restart: c1.state, final: cr.json.state };
    owner.cookie = (await mkSession("/v1/auth/login", { email: "owner@demo.test", password: PW })).cookie; // new server, new sessions are fine; old cookies persist in DB so this is just tidy
  } else
    say(
      "\n━━ C. skipped in simulator mode (simulator state lives in the API process, so a kill would erase its 'wallet'). Real mode performs it.",
    );

  h("D. Receipts, independent verification, tampering, replay");
  const ownerS = await mkSession("/v1/auth/login", { email: "owner@demo.test", password: PW }).catch(
    () => owner,
  );
  Object.assign(owner, ownerS);
  const fa = await rcpt("A", await get(A.id)),
    fb = await rcpt("B", await get(B.id));
  const issuer = (await call("GET", "/v1/public/issuer-keys", null)).json.data[0].public_key;
  say(
    "  (issuer key fetched from the same server for demo convenience — a real verifier must obtain it out-of-band)",
  );
  const extra = SIM ? [] : ["--require-real"];
  const vA = verify(fa, ["--trust-key", issuer, ...extra]);
  ok(
    vA.code === (SIM ? 4 : 0),
    SIM
      ? "verifier → exit 4 VERIFIED_SIMULATED (not a real payment)"
      : "verifier → exit 0 VERIFIED (real, trusted issuer)",
  );
  say(
    vA.out
      .split("\n")
      .filter((l) => /settlement.preimage|approval|VERDICT/.test(l))
      .map((l) => "    " + l)
      .join("\n"),
  );
  const vB = verify(fb, ["--trust-key", issuer, ...extra]);
  ok(
    vB.code === (SIM ? 4 : 0),
    `receipt for the uncertain payment verifies too (settled after reconciliation)`,
  );
  const raw = readFileSync(fa, "utf8");
  const tampered = join(outDir, `receipt-${MODE}-${stamp}-A-TAMPERED.json`);
  writeFileSync(tampered, raw.replace("demo 30000 sats", "demo 30001 sats"));
  const vT = verify(tampered, ["--trust-key", issuer]);
  ok(vT.code === 1, "one changed character → verifier REJECTS (exit 1)");
  const vU = verify(fa, []);
  ok(
    vU.code === (SIM ? 4 : 3),
    SIM
      ? "without a trust root it is still never VERIFIED (simulator → exit 4; a real receipt would give exit 3)"
      : "without a trust root the verifier refuses to call it VERIFIED (exit 3)",
  );
  const seen = join(outDir, `.seen-${stamp}.txt`);
  verify(fa, ["--trust-key", issuer, "--seen-file", seen]);
  const vR = verify(fa, ["--trust-key", issuer, "--seen-file", seen]);
  ok(vR.code === 1, "presenting the same receipt twice → REPLAY rejected");
  const wrong = verify(fa, ["--trust-key", issuer, "--expect-payment-hash", B.hash]);
  ok(wrong.code === 1, "receipt for payment A cannot be passed off as payment B");
  const audit = (await call("GET", "/v1/audit/verify", owner)).json;
  ok(audit.ok === true, `audit hash chains intact (${audit.entries} entries, ${audit.streams} streams)`);
  const ov = (await call("GET", "/v1/overview", owner)).json;
  say(`  second sends blocked this run: ${ov.duplicates_blocked}`);
  evidence["receipts"] = receipts;
  evidence["verifier"] = {
    A: vA.code,
    B: vB.code,
    tampered: vT.code,
    no_trust_root: vU.code,
    replay: vR.code,
  };
  evidence["audit"] = audit;
  evidence["finishedAt"] = new Date().toISOString();

  const md = `# demo:full evidence — ${MODE.toUpperCase()}\n\n${SIM ? "> **SIMULATED RUN.** The wallet is the labelled simulator. No real payment occurred. This is NOT evidence of a real Lightning payment.\n\n" : "> Real Lightning payments between two LND nodes on **local regtest** (worthless test coins).\n\n"}- Commit: \`${gitSha}\`\n- Started: ${evidence["startedAt"]}\n- Network: regtest\n\n\`\`\`\n${log.join("\n")}\n\`\`\`\n\n\`\`\`json\n${JSON.stringify(evidence, null, 2)}\n\`\`\`\n`;
  writeFileSync(join(outDir, `demo-${MODE}-${stamp}.md`), md);
  writeFileSync(join(outDir, `demo-${MODE}-${stamp}.json`), JSON.stringify(evidence, null, 2));
  say(`\nALL ASSERTIONS PASSED (${MODE}). Evidence: docs/evidence/demo-${MODE}-${stamp}.md`);
})().then(
  async () => {
    stopServer();
    await dropDb();
    process.exit(0);
  },
  async (e) => {
    console.error("\nDEMO FAILED:", e.message);
    stopServer();
    await dropDb();
    process.exit(1);
  },
);
async function dropDb() {
  await new Promise((r) => setTimeout(r, 600));
  try {
    const a = new pg.Client({ connectionString: ADMIN });
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await a.end();
  } catch {
    /* ignore */
  }
}
