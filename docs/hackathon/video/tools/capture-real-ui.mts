/**
 * Captures REAL screenshots of the Orynt operations app driving a REAL LND payment on local regtest (test coins).
 *
 * Usage (repo root; needs PostgreSQL, a running regtest network from `node infra/regtest/up.mjs`, `pnpm build:all`):
 *     pnpm exec tsx docs/hackathon/video/tools/capture-real-ui.mts
 *
 * What it does: fresh database -> the API from source (npx tsx apps/api/src/server.ts, exactly as scripts/demo-full.ts and the E2E suite start it; the web app is served from apps/web/dist) -> workspace/team/wallet set up through the HTTP API ->
 * then the UI flow in Chromium: operator pastes bob's REAL regtest invoice, approver signs in the browser, operator presses Send (real LND
 * payment), a fault is injected so the response is "lost" (the payment itself is real), the UI shows UNKNOWN, a second send is impossible,
 * the operator presses "Check the wallet's record", the payout settles. Receipts are downloaded into the output directory.
 * Nothing here is mocked. The injected fault is the same failpoint `pnpm demo:full` uses (ORYNT_FAILPOINTS=1, development mode only).
 * Wallet credentials are never rendered on a captured page (only the wallet label is shown).
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { lndAddInvoice } from "@orynt/wallets";

const ROOT = resolve(import.meta.dirname, "../../../..");
const OUT = process.env["VIDEO_OUT"] ?? join(ROOT, "docs/hackathon/video/frames/ui");
const { chromium } = createRequire(join(ROOT, "apps/web/package.json"))("playwright");
const PORT = 8791, BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = process.env["TEST_ADMIN_DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_test";
const DB = `orynt_video_${Date.now()}`;
const PW = "demo-password-123";
const reg = JSON.parse(readFileSync(process.env["ORYNT_REGTEST_ENV"] ?? join(ROOT, ".regtest/env.json"), "utf8"));
const bobCfg = () => ({ restUrl: reg.bob.restUrl, macaroonHex: readFileSync(reg.bob.adminMacaroonPath).toString("hex"), tlsCertPem: readFileSync(reg.bob.tlsCertPath, "utf8") });
mkdirSync(OUT, { recursive: true });

let server: ChildProcess | null = null;
const start = async () => {
  server = spawn("npx", ["tsx", "src/server.ts"], { cwd: join(ROOT, "apps/api"), detached: true, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, ORYNT_ENV: "development", ORYNT_DEFAULT_PLAN: "enterprise", ORYNT_BILLING_WEBHOOK_SECRET: "whsec_dev_sandbox_only", ORYNT_FAILPOINTS: "1", ORYNT_RECONCILE_INITIAL_DELAY_SECONDS: "3600", ORYNT_WORKER_INTERVAL_MS: "1000", ORYNT_ALLOWED_ORIGINS: BASE, ORYNT_RATE_LIMIT_PER_MIN: "20000", PORT: String(PORT), DATABASE_URL: ADMIN.replace(/\/[^/]+$/, "/" + DB), LOG_LEVEL: "error" } });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + "/health/ready")).ok) return; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("API did not become ready");
};
const stop = () => { try { if (server?.pid) process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ } };

interface S { cookie: string; csrf: string }
const call = async (method: string, path: string, s: S | null, body?: unknown) => {
  const hd: Record<string, string> = body !== undefined ? { "content-type": "application/json" } : {};
  if (s) { hd["cookie"] = s.cookie; if (method !== "GET") hd["x-csrf-token"] = s.csrf; }
  const res = await fetch(BASE + path, { method, headers: hd, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: res.status, json, res };
};
const session = async (path: string, body: object): Promise<S> => {
  const r = await call("POST", path, null, body); if (r.status >= 300) throw new Error(`${path}: ${JSON.stringify(r.json)}`);
  return { cookie: (r.res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "), csrf: r.json.csrf_token };
};

(async () => {
  const adm = new pg.Client({ connectionString: ADMIN }); await adm.connect(); await adm.query(`CREATE DATABASE ${DB}`); await adm.end();
  await start();
  const owner = await session("/v1/auth/register", { email: "owner@demo.test", password: PW, name: "Ada (owner)", workspace_name: "Dakar Community Fund (regtest demo)" });
  for (const [email, name, role] of [["operator@demo.test", "Operator Ngozi", "operator"], ["approver@demo.test", "Approver Moussa", "approver"]] as const) {
    const r = await call("POST", "/v1/members", owner, { email, name, role, temporary_password: PW }); if (r.status !== 201) throw new Error(JSON.stringify(r.json));
  }
  const conn = (await call("POST", "/v1/connections", owner, { label: "alice (regtest LND)", kind: "lnd", lnd: { rest_url: reg.alice.restUrl, macaroon_hex: reg.alice.oryntMacaroonHex, tls_cert_pem: readFileSync(reg.alice.tlsCertPath, "utf8") } })).json;
  if (conn.network !== "regtest" || conn.is_simulator) throw new Error("expected a real regtest LND connection");

  const browser = await chromium.launch();
  const VW = 1280, VH = 720;
  const login = async (email: string) => {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1.5, acceptDownloads: true });
    const page = await ctx.newPage();
    await page.goto(BASE + "/app/login"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(PW);
    await page.getByRole("button", { name: "Sign in" }).click(); await page.waitForSelector("nav[aria-label=Main]"); await page.waitForSelector("main h1");
    return { ctx, page };
  };
  const shot = async (page: any, name: string) => { await page.waitForTimeout(500); await page.screenshot({ path: join(OUT, name + ".png") }); console.log("shot", name); };
  const newPayout = async (page: any, who: string, sats: number, memo: string, firstShot?: boolean) => {
    const inv = await lndAddInvoice(bobCfg(), BigInt(sats) * 1000n, memo);
    await page.goto(BASE + "/app/payouts/new"); await page.locator("#inv").fill(inv.paymentRequest);
    await page.waitForSelector("text=What this invoice says");
    await page.getByLabel("Recipient name").fill(who);
    if (firstShot) await shot(page, "01-invoice-decoded");
    await page.getByRole("button", { name: "Continue" }).click(); await page.locator("#memo").fill(memo);
    await page.getByRole("button", { name: "Review" }).click();
    if (firstShot) await shot(page, "02-review");
    await page.getByRole("button", { name: "Submit for approval" }).click(); await page.waitForSelector("text=Waiting for approval");
    if (firstShot) await shot(page, "03-awaiting-approval");
    return page.url();
  };

  // --- operator creates payout A (30,000 sats, bob's real invoice)
  const op = await login("operator@demo.test");
  const urlA = await newPayout(op.page, "Bob Studio", 30_000, "Design work, regtest demo", true);
  // --- approver signs in the browser (key created in the browser; private key never leaves it)
  const ap = await login("approver@demo.test");
  await ap.page.goto(BASE + "/app/approvals"); await ap.page.waitForSelector("text=Waiting for you");
  await ap.page.getByRole("button", { name: /Review & sign/ }).first().click(); await ap.page.waitForSelector("role=dialog");
  await shot(ap.page, "04-approver-dialog-key-setup");
  await ap.page.getByRole("button", { name: /Create and register key/ }).click();
  await ap.page.getByRole("button", { name: /Sign & approve/ }).waitFor(); await shot(ap.page, "05-approver-signs");
  await ap.page.getByRole("button", { name: /Sign & approve/ }).click(); await ap.page.waitForSelector("role=dialog", { state: "detached" });
  // --- operator sends (REAL LND payment)
  await op.page.goto(urlA); await op.page.waitForSelector("text=Approved and ready to send"); await shot(op.page, "06-approved-ready");
  await op.page.getByRole("button", { name: "Send payment" }).click();
  await op.page.waitForFunction(() => /Settled/.test(document.querySelector(".status-panel h2")?.textContent || ""), null, { timeout: 30000 });
  await shot(op.page, "07-settled-real");
  const dl = op.page.waitForEvent("download"); await op.page.getByRole("button", { name: "Download receipt" }).click();
  const f = await (await dl).path(); const receiptA = readFileSync(f, "utf8"); writeFileSync(join(OUT, "receipt-A.json"), receiptA);
  // --- payout B: fault injected so the wallet's answer is lost AFTER LND accepted the payment
  const urlB = await newPayout(op.page, "Chidi Contributions", 31_000, "Contribution, regtest demo");
  await ap.page.goto(BASE + "/app/approvals"); await ap.page.waitForSelector("text=Waiting for you");
  await ap.page.getByRole("button", { name: /Review & sign/ }).first().click(); await ap.page.getByRole("button", { name: /Sign & approve/ }).click(); await ap.page.waitForSelector("role=dialog", { state: "detached" });
  await call("POST", "/v1/dev/failpoints", owner, { name: "execute.after_provider_response", action: "throw" });
  await op.page.goto(urlB); await op.page.waitForSelector("text=Approved and ready to send");
  await op.page.getByRole("button", { name: "Send payment" }).click();
  await op.page.waitForSelector("text=We lost the wallet's answer", { timeout: 30000 });
  await shot(op.page, "08-unknown-send-disabled");
  await op.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot(op.page, "09-unknown-timeline");
  await op.page.evaluate(() => window.scrollTo(0, 0));
  await op.page.getByRole("button", { name: /Check the wallet's record now/ }).click();
  await op.page.waitForFunction(() => /Settled/.test(document.querySelector(".status-panel h2")?.textContent || ""), null, { timeout: 30000 });
  await shot(op.page, "10-resolved-after-uncertainty");
  const dl2 = op.page.waitForEvent("download"); await op.page.getByRole("button", { name: "Download receipt" }).click();
  writeFileSync(join(OUT, "receipt-B.json"), readFileSync(await (await dl2).path(), "utf8"));
  // --- in-browser verifier page with the real receipt
  const issuer = JSON.parse(receiptA).issuer.public_key;
  await op.page.goto(BASE + "/app/verify"); await op.page.locator("#r-json").fill(receiptA); await op.page.locator("#r-key").fill(issuer);
  await op.page.getByRole("button", { name: "Verify" }).click(); await op.page.waitForSelector("#res"); await shot(op.page, "11-verify-in-browser");
  const tampered = receiptA.replace("Design work, regtest demo", "Design work, regtest demp");
  await op.page.locator("#r-json").fill(tampered); await op.page.getByRole("button", { name: "Verify" }).click();
  await op.page.waitForFunction(() => /REJECTED/.test(document.querySelector("#res")?.textContent || "")); await shot(op.page, "12-verify-rejected");
  // --- list / wallet pages (credentials are never rendered)
  await op.page.goto(BASE + "/app/payouts"); await op.page.waitForSelector("table, .table-wrap"); await shot(op.page, "13-payouts-list");
  await writeFileSync(join(OUT, "issuer-key.txt"), issuer + "\n");
  await browser.close();
  console.log("OK frames in", OUT);
})().then(async () => { stop(); await drop(); process.exit(0); }, async (e) => { console.error("CAPTURE FAILED:", e); stop(); await drop(); process.exit(1); });
async function drop() { await new Promise((r) => setTimeout(r, 600)); try { const a = new pg.Client({ connectionString: ADMIN }); await a.connect(); await a.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); await a.end(); } catch { /* ignore */ } }
