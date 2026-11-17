import { randomBytes } from "node:crypto";
import pg from "pg";
import { generateKeyPair, signApproval, signMessage, type KeyPair, type Role } from "@orynt/core";
import { loadConfig, type Config } from "../src/config";
import { buildApp, type BuiltApp } from "../src/http/app";
import { systemCtx } from "../src/services/reconcile";
import { keyProofMessage } from "../src/services/auth";

const ADMIN_URL =
  process.env["TEST_ADMIN_DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_test";

export interface TestEnv extends BuiltApp {
  config: Config;
  dbName: string;
  teardown: () => Promise<void>;
}
export async function createEnv(over: Record<string, string> = {}): Promise<TestEnv> {
  const dbName = "orynt_t_" + randomBytes(5).toString("hex");
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]+$/, "/" + dbName);
  const config = loadConfig({
    ORYNT_ENV: "test",
    ORYNT_DEFAULT_PLAN: "enterprise",
    ORYNT_BILLING_WEBHOOK_SECRET: "whsec_test_secret_for_billing",
    DATABASE_URL: url,
    ORYNT_FAILPOINTS: "1",
    ORYNT_WORKER: "0",
    ORYNT_RECONCILE_INITIAL_DELAY_SECONDS: "0",
    ORYNT_SEND_TIMEOUT_SECONDS: "5",
    ...over,
  } as NodeJS.ProcessEnv);
  const built = await buildApp(config);
  return {
    ...built,
    config,
    dbName,
    teardown: async () => {
      await built.app.close();
      await built.pool.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      // a stray session from another role can make the forced drop fail transiently ("permission denied to terminate process"): retry, never fail a test over cleanup
      for (let i = 0; i < 5; i++) {
        try {
          await a.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
          break;
        } catch (e) {
          if (i === 4) console.warn(`test database ${dbName} was not dropped: ${(e as Error).message}`);
          else await new Promise((r) => setTimeout(r, 400));
        }
      }
      await a.end();
    },
  };
}

export interface Actor {
  email: string;
  userId: string;
  cookie: string;
  csrf: string;
  keys: KeyPair;
  orgId: string;
  role: Role;
}
export class Client {
  constructor(public env: TestEnv) {}
  async call(
    method: string,
    url: string,
    who: Actor | { apiKey: string } | null,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const h: Record<string, string> = { ...headers };
    if (who && "apiKey" in who) h["authorization"] = `Bearer ${who.apiKey}`;
    else if (who) {
      h["cookie"] = who.cookie;
      if (method !== "GET") h["x-csrf-token"] = who.csrf;
    }
    const res = await this.env.app.inject({
      method: method as "GET",
      url,
      headers: h,
      payload: body === undefined ? undefined : (body as object),
    });
    let json: any = null;
    try {
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      /* non-json */
    }
    return { status: res.statusCode, body: json, headers: res.headers, raw: res };
  }
  private cookieOf(res: { headers: Record<string, any> }) {
    const sc = ([] as string[]).concat(res.headers["set-cookie"] as any);
    return sc.map((c) => c.split(";")[0]).join("; ");
  }
  async register(email: string, name = "Owner", ws = "Acme Studio"): Promise<Actor> {
    const r = await this.call("POST", "/v1/auth/register", null, {
      email,
      password: "correct horse battery staple",
      name,
      workspace_name: ws,
    });
    if (r.status !== 201) throw new Error("register failed " + JSON.stringify(r.body));
    return this.actorFrom(r, email);
  }
  private async actorFrom(r: { body: any; headers: any }, email: string): Promise<Actor> {
    const keys = generateKeyPair();
    const a: Actor = {
      email,
      userId: r.body.user.id,
      cookie: this.cookieOf(r),
      csrf: r.body.csrf_token,
      keys,
      orgId: r.body.workspace.id,
      role: r.body.role,
    };
    const proof = signMessage(
      keys.privateKey,
      "orynt.key-registration.v1",
      keyProofMessage(a.orgId, keys.publicKey),
    );
    const k = await this.call("POST", "/v1/me/approval-key", a, {
      public_key: keys.publicKey,
      proof_signature: proof,
    });
    if (k.status !== 200) throw new Error("key register failed " + JSON.stringify(k.body));
    return a;
  }
  async login(email: string): Promise<Actor> {
    const r = await this.call("POST", "/v1/auth/login", null, {
      email,
      password: "correct horse battery staple",
    });
    if (r.status !== 200) throw new Error("login failed " + JSON.stringify(r.body));
    return this.actorFrom(r, email);
  }
  async addMember(owner: Actor, email: string, role: Role): Promise<Actor> {
    const r = await this.call("POST", "/v1/members", owner, {
      email,
      name: email.split("@")[0],
      role,
      temporary_password: "correct horse battery staple",
    });
    if (r.status !== 201) throw new Error("addMember failed " + JSON.stringify(r.body));
    return this.login(email);
  }
  async sign(a: Actor, obligation: any, over: Partial<{ intent_digest: string; signed_at: string }> = {}) {
    const payload = {
      v: 1 as const,
      type: "approval" as const,
      intent_digest: over.intent_digest ?? obligation.intent_digest,
      approver_user_id: a.userId,
      workspace_id: a.orgId,
      signed_at: over.signed_at ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    return {
      intent_digest: payload.intent_digest,
      signed_at: payload.signed_at,
      signature: signApproval(a.keys.privateKey, payload),
    };
  }
  approve(a: Actor, obligation: any, over = {}) {
    return this.sign(a, obligation, over).then((b) =>
      this.call("POST", `/v1/obligations/${obligation.id}/approve`, a, b),
    );
  }
}

export interface World {
  c: Client;
  owner: Actor;
  operator: Actor;
  approver1: Actor;
  approver2: Actor;
  viewer: Actor;
  connId: string;
  env: TestEnv;
}
export async function world(over: Record<string, string> = {}): Promise<World> {
  const env = await createEnv(over);
  const c = new Client(env);
  const owner = await c.register("owner@acme.test");
  const operator = await c.addMember(owner, "operator@acme.test", "operator");
  const approver1 = await c.addMember(owner, "approver1@acme.test", "approver");
  const approver2 = await c.addMember(owner, "approver2@acme.test", "approver");
  const viewer = await c.addMember(owner, "viewer@acme.test", "viewer");
  const conn = await c.call("POST", "/v1/connections", owner, { label: "Simulator", kind: "simulator" });
  if (conn.status !== 201) throw new Error("connection failed " + JSON.stringify(conn.body));
  return { c, owner, operator, approver1, approver2, viewer, connId: conn.body.id, env };
}
export async function mintInvoice(w: World, amountMsat: string, behavior = "succeed", expiry = 3600) {
  const r = await w.c.call("POST", `/v1/dev/simulator/${w.connId}/invoice`, w.owner, {
    amount_msat: amountMsat,
    behavior,
    expiry_seconds: expiry,
  });
  if (r.status !== 200) throw new Error("mint failed " + JSON.stringify(r.body));
  return r.body as { invoice: string; payment_hash: string; payee_pubkey: string };
}
export async function newDraft(
  w: World,
  amountMsat = "1000000",
  behavior = "succeed",
  cpName = "Bob Studio",
) {
  const inv = await mintInvoice(w, amountMsat, behavior);
  const r = await w.c.call("POST", "/v1/obligations", w.operator, {
    counterparty_name: cpName,
    amount_msat: amountMsat,
    memo: "October design work",
    external_ref: "INV-1",
    invoice: inv.invoice,
  });
  if (r.status !== 201) throw new Error("create failed " + JSON.stringify(r.body));
  return { ob: r.body, inv };
}
export async function toApproved(w: World, amountMsat = "1000000", behavior = "succeed") {
  const { ob, inv } = await newDraft(w, amountMsat, behavior);
  const s = await w.c.call("POST", `/v1/obligations/${ob.id}/submit`, w.operator);
  if (s.status !== 200) throw new Error("submit failed " + JSON.stringify(s.body));
  let cur = s.body;
  const need = cur.policy.required_approvals as number;
  for (const a of [w.approver1, w.approver2].slice(0, need)) {
    const r = await w.c.approve(a, cur);
    if (r.status !== 200) throw new Error("approve failed " + JSON.stringify(r.body));
    cur = r.body;
  }
  if (cur.state !== "APPROVED") throw new Error("not approved: " + cur.state);
  return { ob: cur, inv };
}
export const execute = (
  w: World,
  id: string,
  who: Actor = w.operator,
  key = "exec-" + randomBytes(6).toString("hex"),
) => w.c.call("POST", `/v1/obligations/${id}/execute`, who, undefined, { "idempotency-key": key });
export const getOb = async (w: World, id: string) =>
  (await w.c.call("GET", `/v1/obligations/${id}`, w.owner)).body;
export { systemCtx };
