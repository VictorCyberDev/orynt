/**
 * Demo seed — DETERMINISTIC and LABELLED. Everything is created through the real API, in a workspace named "… (SEED DATA)",
 * on the SIMULATOR wallet: nothing here is a real payment. Run inside the server process (ORYNT_SEED_DEMO=1) because simulator
 * state is in-memory; as a standalone script it only seeds records that do not depend on simulator state.
 */
import { createHash } from "node:crypto";
import { bytesToHex, publicKeyFromPrivate, signApproval, signMessage } from "@orynt/core";
import type { BuiltApp } from "./http/app";
import { keyProofMessage } from "./services/auth";

export const DEMO = {
  password: "demo-password-123",
  workspace: "Demo workspace (SEED DATA)",
  users: {
    owner: "demo-owner@orynt.local",
    operator: "demo-operator@orynt.local",
    approver1: "demo-approver1@orynt.local",
    approver2: "demo-approver2@orynt.local",
    viewer: "demo-viewer@orynt.local",
  },
} as const;
const privFor = (email: string) =>
  bytesToHex(
    createHash("sha256")
      .update("orynt-demo-seed:" + email)
      .digest(),
  );

interface Sess {
  cookie: string;
  csrf: string;
  userId: string;
  orgId: string;
  priv: string;
}
export async function seedDemo({ app, pool }: BuiltApp, log: (m: string) => void = () => {}) {
  if ((await pool.query("SELECT 1 FROM users WHERE email=$1", [DEMO.users.owner])).rowCount) {
    log("demo workspace already present — skipping seed");
    return false;
  }
  const call = async (
    method: string,
    url: string,
    s: Sess | null,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const h: Record<string, string> = { ...headers };
    if (s) {
      h["cookie"] = s.cookie;
      if (method !== "GET") h["x-csrf-token"] = s.csrf;
    }
    const r = await app.inject({
      method: method as "GET",
      url,
      headers: h,
      payload: body === undefined ? undefined : (body as object),
    });
    const json = r.body ? JSON.parse(r.body) : null;
    if (r.statusCode >= 400) throw new Error(`seed ${method} ${url} -> ${r.statusCode} ${r.body}`);
    return { json, res: r };
  };
  const cookieOf = (r: { headers: Record<string, unknown> }) =>
    ([] as string[])
      .concat(r.headers["set-cookie"] as string[])
      .map((c) => c.split(";")[0])
      .join("; ");
  const login = async (email: string): Promise<Sess> => {
    const { json, res } = await call("POST", "/v1/auth/login", null, { email, password: DEMO.password });
    return {
      cookie: cookieOf(res),
      csrf: json.csrf_token,
      userId: json.user.id,
      orgId: json.workspace.id,
      priv: privFor(email),
    };
  };
  const regKey = async (s: Sess) => {
    const pub = publicKeyFromPrivate(s.priv);
    await call("POST", "/v1/me/approval-key", s, {
      public_key: pub,
      proof_signature: signMessage(s.priv, "orynt.key-registration.v1", keyProofMessage(s.orgId, pub)),
    });
  };
  const reg = await call("POST", "/v1/auth/register", null, {
    email: DEMO.users.owner,
    password: DEMO.password,
    name: "Demo Owner",
    workspace_name: DEMO.workspace,
  });
  const owner: Sess = {
    cookie: cookieOf(reg.res),
    csrf: reg.json.csrf_token,
    userId: reg.json.user.id,
    orgId: reg.json.workspace.id,
    priv: privFor(DEMO.users.owner),
  };
  await pool.query(
    "UPDATE subscriptions SET plan_id='growth', status='active', provider='sandbox' WHERE org_id=$1",
    [owner.orgId],
  ); // demo only: plan granted directly, not by a billing event
  for (const [k, role] of [
    ["operator", "operator"],
    ["approver1", "approver"],
    ["approver2", "approver"],
    ["viewer", "viewer"],
  ] as const)
    await call("POST", "/v1/members", owner, {
      email: DEMO.users[k],
      name: "Demo " + k.replace(/(\d)/, " $1"),
      role,
      temporary_password: DEMO.password,
    });
  const operator = await login(DEMO.users.operator),
    a1 = await login(DEMO.users.approver1);
  await regKey(owner);
  await regKey(a1); // approver2 deliberately has no key: demo the first-approval key setup in the UI
  const conn = (
    await call("POST", "/v1/connections", owner, { label: "Practice wallet (seed)", kind: "simulator" })
  ).json;
  const invoice = async (amountMsat: string, behavior: string, expiry = 86400) =>
    (
      await call("POST", `/v1/dev/simulator/${conn.id}/invoice`, owner, {
        amount_msat: amountMsat,
        behavior,
        expiry_seconds: expiry,
      })
    ).json as { invoice: string };
  const approve = async (s: Sess, ob: { id: string; intent_digest: string }) => {
    const p = {
      v: 1 as const,
      type: "approval" as const,
      intent_digest: ob.intent_digest,
      approver_user_id: s.userId,
      workspace_id: s.orgId,
      signed_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    return (
      await call("POST", `/v1/obligations/${ob.id}/approve`, s, {
        intent_digest: p.intent_digest,
        signed_at: p.signed_at,
        signature: signApproval(s.priv, p),
      })
    ).json;
  };
  const mk = async (
    cp: string,
    sats: number,
    memo: string,
    behavior = "succeed",
    upTo: "draft" | "submitted" | "approved" | "executed" = "executed",
  ) => {
    const msat = String(sats * 1000);
    let ob = (
      await call("POST", "/v1/obligations", operator, {
        counterparty_name: cp,
        amount_msat: msat,
        memo: `[seed] ${memo}`,
        external_ref: `SEED-${sats}`,
        invoice: (await invoice(msat, behavior)).invoice,
      })
    ).json;
    if (upTo === "draft") return ob;
    ob = (await call("POST", `/v1/obligations/${ob.id}/submit`, operator)).json;
    if (upTo === "submitted") return ob;
    ob = await approve(a1, ob);
    if (ob.state === "AWAITING_APPROVAL") {
      ob = await approve(owner, ob);
    }
    if (upTo === "approved") return ob;
    const r = await app.inject({
      method: "POST",
      url: `/v1/obligations/${ob.id}/execute`,
      headers: { cookie: operator.cookie, "x-csrf-token": operator.csrf, "idempotency-key": "seed-" + ob.id },
      payload: undefined,
    });
    return JSON.parse(r.body);
  };
  await mk("Amina Dev Collective", 25_000, "Design work, October");
  await mk("Kofi Open-Source Grant", 60_000, "Grant tranche 2");
  const unk = await mk(
    "Nia Translation Co-op",
    40_000,
    "Translation batch (response lost)",
    "accept_then_lose_response",
  );
  await pool.query("UPDATE payout_obligations SET next_reconcile_at = now() + interval '1 day' WHERE id=$1", [
    unk.id,
  ]); // leave it for the human to resolve in the demo
  await mk("Sade Supplies Ltd", 150_000, "Equipment (needs two approvals)", "succeed", "submitted");
  await mk("Chidi Contributions", 30_000, "Bug bounty", "succeed", "submitted");
  await mk("Lola Logistics", 12_000, "Delivery", "succeed", "approved");
  await mk("Baba Bandwidth", 18_000, "Hosting (will fail: no liquidity)", "fail_insufficient");
  await mk("Femi Freelance", 5_000, "Draft — not submitted", "succeed", "draft");
  log(
    `seeded demo workspace "${DEMO.workspace}" — sign in as ${DEMO.users.owner} / ${DEMO.password} (also operator, approver1, approver2, viewer)`,
  );
  return true;
}
