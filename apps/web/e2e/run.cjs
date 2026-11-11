/* Browser E2E: fresh PostgreSQL database + fresh API process (seeded, simulator wallet) + real Chromium.
   Usage: pnpm --filter @orynt/web build && node apps/web/e2e/run.cjs      (needs local PostgreSQL: `pnpm db:start`)  */
const { chromium } = require("playwright");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const nodeCrypto = require("node:crypto");
const totp = (secret, t = Date.now()) => {
  const B = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "")) bits += B.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = nodeCrypto.createHmac("sha1", key).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(
    6,
    "0",
  );
};
const ROOT = path.resolve(__dirname, "../../..");
const PORT = 8799,
  BASE = `http://127.0.0.1:${PORT}`;
const DB = "orynt_e2e_" + Date.now();
const SHOTS = path.join(ROOT, "docs/evidence/screenshots");
const PGADMIN = "postgres://orynt:orynt@127.0.0.1:5432/orynt_test";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const VIEWPORTS = [
  [375, 812, "375"],
  [768, 1024, "768"],
  [1440, 900, "1440"],
];
const axeSrc = fs.readFileSync(
  require.resolve("axe-core/axe.min.js", { paths: [path.join(ROOT, "apps/web")] }),
  "utf8",
);

(async () => {
  execSync(`psql "${PGADMIN}" -c "CREATE DATABASE ${DB}"`, { stdio: "ignore" });
  const server = spawn("npx", ["tsx", "src/server.ts"], {
    cwd: path.join(ROOT, "apps/api"),
    env: {
      ...process.env,
      ORYNT_ENV: "development",
      ORYNT_DEFAULT_PLAN: "enterprise",
      ORYNT_BILLING_WEBHOOK_SECRET: "whsec_dev_sandbox_only",
      ORYNT_RATE_LIMIT_PER_MIN: "20000",
      ORYNT_FAILPOINTS: "1",
      ORYNT_SEED_DEMO: "1",
      ORYNT_RECONCILE_INITIAL_DELAY_SECONDS: "10",
      PORT: String(PORT),
      DATABASE_URL: PGADMIN.replace(/\/[^/]+$/, "/" + DB),
      LOG_LEVEL: "error",
      ORYNT_ALLOWED_ORIGINS: BASE,
    },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  let browser;
  const cleanup = async () => {
    try {
      await browser?.close();
    } catch {}
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    try {
      execSync(`psql "${PGADMIN}" -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE)"`, { stdio: "ignore" });
    } catch {}
  };
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(BASE + "/health/ready")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 1500)); // seed runs before listen, but be generous
    browser = await chromium.launch();
    const ctxFor = async (email, vp = [1440, 900], bypassCSP = false) => {
      const ctx = await browser.newContext({
        viewport: { width: vp[0], height: vp[1] },
        deviceScaleFactor: 1,
        acceptDownloads: true,
        bypassCSP,
      });
      const page = await ctx.newPage();
      await page.goto(BASE + "/app/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("demo-password-123");
      await page.getByRole("button", { name: "Sign in" }).click();
      page.on("response", (r) => {
        if (r.url().includes("/v1/auth/login"))
          r.text().then((t) => {
            if (r.status() !== 200) console.log("LOGIN", r.status(), t.slice(0, 200));
          });
      });
      try {
        await page.waitForSelector("nav[aria-label=Main]", { timeout: 20000 });
      } catch (e) {
        console.log("URL", page.url(), (await page.locator("body").innerText()).slice(0, 300));
        throw e;
      }
      await page.waitForSelector("main h1");
      return { ctx, page };
    };
    const shot = async (page, vp, name) => {
      const dir = path.join(SHOTS, vp);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, name + ".png"), fullPage: true });
    };
    const overflow = async (page) =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    // --- 0. signed-out redirect + login page
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE + "/app/payouts");
      await p.waitForURL(/\/app\/login/);
      check("signed-out visitors are redirected to sign-in", true);
      await shot(p, "1440", "00-login");
      await ctx.close();
    }

    // --- 1. approver2 has no key yet: approves a submitted payout from the UI (key setup + signature)
    const a2 = await ctxFor("demo-approver2@orynt.local");
    await a2.page.goto(BASE + "/app/approvals");
    await a2.page.waitForSelector("text=Waiting for you");
    check("approvals queue lists payouts waiting for me", (await a2.page.locator(".queue li").count()) >= 2);
    await a2.page
      .getByRole("button", { name: /Review & sign/ })
      .first()
      .click();
    await a2.page.waitForSelector("role=dialog");
    check(
      "approval dialog shows exact terms before signing",
      /Amount/.test(await a2.page.locator("role=dialog").innerText()) &&
        /Digest you sign/.test(await a2.page.locator("role=dialog").innerText()),
    );
    await shot(a2.page, "1440", "01-approve-key-setup");
    await a2.page.getByRole("button", { name: /Create and register key/ }).click();
    await a2.page.getByRole("button", { name: /Sign & approve/ }).waitFor();
    await a2.page.getByRole("button", { name: /Sign & approve/ }).click();
    await a2.page.waitForSelector("role=dialog", { state: "detached" });
    check("approver created a browser key and signed an approval through the UI", true);
    await a2.ctx.close();

    // --- 2. operator: send the approved payout, settle (simulated), receipt download, verify page
    const op = await ctxFor("demo-operator@orynt.local");
    await op.page.goto(BASE + "/app/payouts?state=APPROVED");
    await op.page.waitForSelector("table, .table-wrap, .empty");
    await op.page.locator("a", { hasText: /^PO-/ }).first().click();
    await op.page.waitForSelector("text=Approved and ready to send");
    await shot(op.page, "1440", "02-payout-approved");
    await op.page.getByRole("button", { name: "Send payment" }).click();
    await op.page.waitForSelector("text=Simulated — no real money moved", { timeout: 15000 });
    check(
      "sending settles on the practice wallet and says SIMULATED (never 'Settled')",
      !(await op.page.locator(".status-panel h2").innerText()).startsWith("Settled"),
    );
    check(
      "a second send is impossible after settlement (no Send action offered)",
      !(await op.page.getByRole("button", { name: "Send payment" }).count()),
    );
    const dl = op.page.waitForEvent("download");
    await op.page.getByRole("button", { name: "Download receipt" }).click();
    const file = await (await dl).path();
    const receiptText = fs.readFileSync(file, "utf8");
    check(
      "receipt downloads as JSON with the simulator label",
      JSON.parse(receiptText).environment === "SIMULATOR",
    );
    await shot(op.page, "1440", "03-payout-simulated-settled");
    await op.page.goto(BASE + "/app/verify");
    await op.page.locator("#r-json").fill(receiptText);
    const pub = JSON.parse(receiptText).issuer.public_key;
    await op.page.locator("#r-key").fill(pub);
    await op.page.getByRole("button", { name: "Verify" }).click();
    await op.page.waitForSelector("#res");
    check(
      "in-browser verifier: simulated receipt → VERIFIED SIMULATED",
      /VERIFIED SIMULATED/.test(await op.page.locator("#res").innerText()),
    );
    // tamper one character
    const tampered = receiptText.replace(/"memo": "[^"]/, (m) => m.slice(0, -1) + "Z");
    await op.page.locator("#r-json").fill(tampered);
    await op.page.getByRole("button", { name: "Verify" }).click();
    await op.page.waitForFunction(() => /REJECTED/.test(document.querySelector("#res")?.textContent || ""));
    check("in-browser verifier rejects a receipt changed by one character", true);
    await shot(op.page, "1440", "04-verify-rejected");

    // --- 3. the signature moment: lost response → UNKNOWN → check wallet → settled by evidence
    await op.page.goto(BASE + "/app/payouts?state=UNKNOWN,RECONCILING");
    await op.page.waitForSelector(".table-wrap");
    await op.page.locator("a", { hasText: /^PO-/ }).first().click();
    await op.page.waitForSelector("text=We lost the wallet's answer");
    const send = op.page.getByRole("button", { name: "Send payment" });
    check(
      "UNKNOWN payout: the panel states what is known / not known",
      /what we don't know yet/i.test(await op.page.locator(".status-panel").innerText()),
    );
    check(
      "UNKNOWN payout: Send is present but DISABLED, and the reason is written out in words",
      (await send.count()) === 1 &&
        (await send.isDisabled()) &&
        /Why .Send. is off/.test(await op.page.locator(".status-panel").innerText()) &&
        /may already have paid/.test(await op.page.locator("main").innerText()),
    );
    check(
      "UNKNOWN is not styled or worded as failure",
      !/Failed/.test(await op.page.locator(".status-panel").innerText()),
    );
    await shot(op.page, "1440", "05-payout-unknown-signature-moment");
    await op.page.getByRole("button", { name: /Check the wallet's record now/ }).click();
    await op.page.waitForSelector("text=Simulated — no real money moved", { timeout: 15000 });
    check(
      "checking the wallet's record resolves the uncertain payment from evidence",
      /after an uncertain moment/.test(await op.page.locator("main").innerText()),
    );
    await shot(op.page, "1440", "06-payout-resolved-after-uncertainty");

    // --- 3c. step-up: a user with MFA is asked for a fresh authenticator code in the UI before a sensitive action (API-key creation here). Own account/context so the demo users stay MFA-free.
    {
      const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const reg = await mctx.request.post(BASE + "/v1/auth/register", {
        data: {
          email: "mfa-e2e@orynt.local",
          password: "correct horse battery staple",
          name: "MFA E2E",
          workspace_name: "MFA Org",
        },
      });
      const csrf2 = (await reg.json()).csrf_token;
      const begin = await (
        await mctx.request.post(BASE + "/v1/me/mfa/begin", { headers: { "x-csrf-token": csrf2 } })
      ).json();
      const conf = await mctx.request.post(BASE + "/v1/me/mfa/confirm", {
        headers: { "x-csrf-token": csrf2 },
        data: { code: totp(begin.secret) },
      });
      check("step-up: MFA can be enabled through the API", conf.ok());
      const pg = await mctx.newPage();
      await pg.goto(BASE + "/app/developers");
      await pg.waitForSelector("#k-n");
      await pg.locator("#k-n").fill("ci-key");
      await pg.getByRole("button", { name: "Create key" }).click();
      await pg.waitForSelector("#mfa-step-up");
      check(
        "step-up: the UI asks for an authenticator code (dialog, focused field)",
        await pg.evaluate(() => !!document.activeElement && document.activeElement.id === "mfa-step-up"),
      );
      const early = await (await mctx.request.get(BASE + "/v1/api-keys")).json();
      check(
        "step-up: nothing is created before the code is entered",
        !early.data.some((k) => k.name === "ci-key"),
      );
      await pg.locator("#mfa-step-up").fill(totp(begin.secret, Date.now() + 30000)); // a later time-step than the one used to enable MFA (codes are single-use)
      await pg.getByRole("button", { name: "Confirm" }).click();
      await pg.waitForSelector("#mfa-step-up", { state: "detached", timeout: 10000 });
      let made = false; // the dialog closes on submit while the retried request is still in flight, so poll briefly
      for (let i = 0; i < 20 && !made; i++) {
        made = (await (await mctx.request.get(BASE + "/v1/api-keys")).json()).data.some(
          (k) => k.name === "ci-key",
        );
        if (!made) await new Promise((r) => setTimeout(r, 250));
      }
      check("step-up: after the code the key exists on the server", made);
      await mctx.close();
    }

    // --- 4. wizard: mint a simulator invoice as owner, paste it, review, submit
    const ow = await ctxFor("demo-owner@orynt.local");

    // --- 3b. onboarding checklist: state comes from the server; the profile step flips only after a real save
    await ow.page.goto(BASE + "/app/start");
    await ow.page.waitForSelector("main h1");
    check(
      "onboarding: page renders the checklist with a server-derived environment note",
      /Get started/.test(await ow.page.locator("main h1").innerText()) &&
        (await ow.page.locator("text=Where you are working").count()) > 0,
    );
    const onbBefore = await (await ow.ctx.request.get(BASE + "/v1/onboarding")).json();
    check(
      "onboarding: profile step is open before the form is saved (server says so)",
      onbBefore.steps.find((x) => x.id === "profile").done === false,
    );
    check(
      "onboarding: 'Finish setup' is disabled while steps are open",
      await ow.page.getByRole("button", { name: "Finish setup" }).isDisabled(),
    );
    await ow.page.locator("#onb-country").fill("NG");
    await ow.page.locator("#onb-tz").fill("Africa/Lagos");
    await ow.page.locator("#onb-purpose").fill("Contributor payouts");
    await ow.page.getByRole("button", { name: "Save profile" }).click();
    await ow.page.waitForSelector("text=Profile complete.");
    const onbAfter = await (await ow.ctx.request.get(BASE + "/v1/onboarding")).json();
    check(
      "onboarding: after saving, the SERVER reports the profile step done",
      onbAfter.steps.find((x) => x.id === "profile").done === true,
    );
    await ow.page.reload();
    await ow.page.waitForSelector("text=Profile complete.");
    check("onboarding: progress survives a reload (stored server-side)", true);
    check(
      "onboarding: the Overview page links back to setup while it is unfinished",
      (await (async () => {
        await ow.page.goto(BASE + "/app/");
        await ow.page.waitForSelector("main h1");
        return ow.page.locator("text=Finish setting up").count();
      })()) > 0,
    );
    const conns = await (await ow.ctx.request.get(BASE + "/v1/connections")).json();
    const csrf = (await (await ow.ctx.request.get(BASE + "/v1/me")).json()).csrf_token;
    const inv = await (
      await ow.ctx.request.post(`${BASE}/v1/dev/simulator/${conns.data[0].id}/invoice`, {
        headers: { "x-csrf-token": csrf },
        data: { amount_msat: "7500000", behavior: "succeed" },
      })
    ).json();
    await ow.page.goto(BASE + "/app/payouts/new");
    await ow.page.locator("#inv").fill("lnbcrt1garbage");
    check(
      "wizard flags an invalid invoice in plain words",
      (await ow.page.locator("text=This isn't a valid invoice").count()) > 0,
    );
    await ow.page.locator("#inv").fill(inv.invoice);
    await ow.page.waitForSelector("text=What this invoice says");
    check(
      "wizard decodes and shows amount/network/payee from the invoice itself",
      /7,500 sats/.test(await ow.page.locator(".decoded").innerText()),
    );
    await ow.page.getByLabel("Recipient name").fill("E2E Recipient");
    await shot(ow.page, "1440", "07-new-payout-step1");
    await ow.page.getByRole("button", { name: "Continue" }).click();
    await ow.page.locator("#memo").fill("E2E test payout");
    await ow.page.getByRole("button", { name: "Review" }).click();
    await shot(ow.page, "1440", "08-new-payout-review");
    await ow.page.getByRole("button", { name: "Submit for approval" }).click();
    await ow.page.waitForSelector("text=Waiting for approval");
    check("wizard creates and submits a payout", true);
    // --- 4b. billing through the UI (SANDBOX provider: same signed-webhook path, no real money)
    await ow.page.goto(BASE + "/app/billing");
    await ow.page.waitForSelector("text=Sandbox billing");
    check(
      "billing page labels the sandbox provider as not charging real money",
      /No card is charged/.test(await ow.page.locator("main").innerText()),
    );
    await ow.page.getByRole("button", { name: "Choose Business" }).click();
    await ow.page.waitForSelector("text=Sandbox checkout complete");
    await ow.page.reload();
    await ow.page.waitForSelector("text=Current plan");
    check(
      "plan change via sandbox checkout takes effect (server-side entitlement)",
      /business/i.test(await ow.page.locator("#cur, section").first().innerText()) &&
        (await ow.page.locator("text=current").count()) > 0,
    );
    await shot(ow.page, "1440", "09-billing");
    // --- 4c. support request through the UI
    await ow.page.goto(BASE + "/app/support");
    await ow.page.locator("#ts").fill("Payment shows checking");
    await ow.page.locator("#tb").fill("PO-0003 has been checking for a while, please look.");
    await ow.page.getByRole("button", { name: "Send request" }).click();
    await ow.page.waitForSelector("text=received");
    check(
      "support request returns a reference number",
      /SUP-[0-9A-F]{8}/.test(await ow.page.locator("main").innerText()),
    );
    await ow.ctx.close();

    // --- 5. responsive screenshots, overflow and accessibility across routes/viewports/themes
    const routes = [
      ["", "overview"],
      ["start", "start"],
      ["payouts", "payouts"],
      ["approvals", "approvals"],
      ["connections", "wallets"],
      ["team", "team"],
      ["activity", "activity"],
      ["developers", "developers"],
      ["settings", "settings"],
      ["guide", "guide"],
      ["incidents", "incidents"],
      ["billing", "billing"],
      ["reports", "reports"],
      ["batches", "batches"],
      ["schedules", "schedules"],
      ["support", "support"],
    ];
    const unknownId = await (async () => {
      const r = await (
        await op.ctx.request.get(BASE + "/v1/obligations?state=SIMULATED_SETTLED&limit=1")
      ).json();
      return r.data[0]?.id;
    })();
    const incidentId = await (async () => {
      const r = await (await op.ctx.request.get(BASE + "/v1/incidents?limit=5")).json();
      return r.data[0]?.id;
    })();
    // --- 3d. exception workbench (operator): the resolved uncertain-payment incident is investigable and tells the truth
    {
      await op.page.goto(BASE + "/app/incidents");
      await op.page.waitForSelector("main h1");
      try {
        await op.page.getByRole("link", { name: "Investigate" }).first().waitFor({ timeout: 8000 });
      } catch {
        console.log(
          "INCIDENTS PAGE TEXT:",
          (await op.page.locator("main").innerText()).slice(0, 400).replace(/\n/g, " | "),
        );
      }
      await op.page.getByRole("link", { name: "Investigate" }).first().click();
      await op.page.waitForSelector("text=What is actually known about the payment");
      const txt = await op.page.locator("main").innerText();
      check(
        "workbench: shows payment truth, investigation tools and an evidence timeline",
        /Evidence timeline/.test(txt) && /Investigation/.test(txt) && /Approvals on record/.test(txt),
      );
      check(
        "workbench: nothing calls an uncertain payment 'failed'",
        !/failed, proven not paid/i.test(txt) || /Resolved/.test(txt),
      );
      const dl = op.page.waitForEvent("download");
      await op.page.getByRole("button", { name: "Export evidence (JSON)" }).click();
      const file = await dl;
      const body = JSON.parse(fs.readFileSync(await file.path(), "utf8"));
      check(
        "workbench: evidence export downloads an integrity-hashed bundle",
        /^[0-9a-f]{64}$/.test(body.integrity.sha256) && body.evidence_version === 1,
      );
      await shot(op.page, "1440", "10-incident-workbench");
    }
    await op.ctx.close();
    for (const [w, h, vp] of VIEWPORTS) {
      const s = await ctxFor("demo-owner@orynt.local", [w, h], true); // CSP bypassed ONLY so axe can be injected; all functional flows above ran under the real CSP
      const rr = [
        ...routes,
        ["payouts/" + unknownId, "payout-detail"],
        ["payouts/new", "new-payout"],
        ["incidents/" + incidentId, "incident-detail"],
      ];
      for (const [r, name] of rr) {
        await s.page.goto(`${BASE}/app/${r}`);
        try {
          await s.page.waitForSelector("main h1", { timeout: 10000 });
        } catch (e) {
          console.log(
            `NO H1 @${vp}px /${name} url=${s.page.url()} body=${(await s.page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " | ")}`,
          );
          throw e;
        }
        await s.page.waitForTimeout(250);
        const ov = await overflow(s.page);
        check(`no horizontal overflow @${vp}px /${name}`, ov <= 0, ov > 0 ? `${ov}px too wide` : "");
        await shot(s.page, vp, "app-" + name);
        if (vp === "375" || vp === "1440")
          for (const theme of ["light", "dark"]) {
            await s.page.evaluate((t) => {
              document.documentElement.dataset.theme = t;
            }, theme);
            await s.page.addStyleTag({
              content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
            });
            await s.page.waitForTimeout(60); // measure the SETTLED theme, not a mid-transition colour
            await s.page.addScriptTag({ content: axeSrc });
            const res = await s.page.evaluate(async () => {
              const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] });
              return r.violations
                .filter((v) => v.impact === "serious" || v.impact === "critical")
                .map((v) => ({
                  id: v.id,
                  n: v.nodes.length,
                  impact: v.impact,
                  sample: v.nodes[0]?.target?.join(" "),
                }));
            });
            check(
              `axe serious/critical @${vp}px ${theme} /${name}`,
              res.length === 0,
              res.map((v) => `${v.id}×${v.n}(${v.sample})`).join("; "),
            );
          }
        await s.page.evaluate(() => delete document.documentElement.dataset.theme);
      }
      if (vp === "375") {
        await s.page.goto(BASE + "/app/");
        await s.page.getByRole("button", { name: "Open menu" }).click();
        await s.page.waitForTimeout(350);
        await shot(s.page, "375", "app-mobile-menu-open");
      }
      await s.ctx.close();
    }
    const failed = results.filter((r) => !r.ok);
    fs.writeFileSync(
      path.join(ROOT, "docs/evidence/e2e-results.json"),
      JSON.stringify(
        {
          ran_at: new Date().toISOString(),
          base: "fresh DB + fresh API, SIMULATOR wallet (not real payments)",
          total: results.length,
          failed: failed.length,
          results,
        },
        null,
        2,
      ),
    );
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    await cleanup();
    process.exit(failed.length ? 1 : 0);
  } catch (e) {
    console.error("E2E ERROR:", e);
    await cleanup();
    process.exit(2);
  }
})();
