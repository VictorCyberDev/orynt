// Cross-checks what the built site says about the API/SDK against the real sources in this monorepo:
//  - every /v1/... path shown exists in packages/contract/src/routes.ts (or is the OpenAPI route in apps/api)
//  - every webhook event and payment state shown exists in the code; the contact form matches the createLead route
//  - the TypeScript samples type-check against packages/sdk/src (needs the repo's typescript)
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dist, listPages } from "./_pages.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const read = (p) => readFileSync(join(repo, p), "utf8");
// The checks below match code SHAPES (e.g. `OryntError("code", 402`). Prettier lays calls out over several lines with trailing commas, so source text is normalised
// to a canonical single-line form before matching: whitespace collapsed, no space inside brackets, no trailing commas.
const norm = (t) =>
  t
    .replace(/\s+/g, " ")
    .replace(/([([{]) /g, "$1")
    .replace(/ ([)\]}])/g, "$1")
    .replace(/,([)\]}])/g, "$1");
const readSrc = (p) => norm(read(p));
const problems = [];
const ok = [];
const check = (cond, msg) => (cond ? ok.push(msg) : problems.push(msg));

// Prettier lays each route object out over several lines; the checks below were written against one-route-per-line, so normalise back to that shape.
const routesSrc = read("packages/contract/src/routes.ts")
  .replace(/\s+/g, " ")
  .replace(/\{ id: "/g, '\n{ id: "');
const routes = [...routesSrc.matchAll(/method: "(GET|POST|PUT|PATCH|DELETE)", path: "([^"]+)"/g)].map(
  (m) => ({ method: m[1], path: m[2] }),
);
routes.push({ method: "GET", path: "/v1/openapi.json" });
check(
  /app\.get\("\/v1\/openapi\.json"/.test(read("apps/api/src/http/app.ts")),
  "apps/api serves GET /v1/openapi.json",
);
const routeRegexes = routes.map((r) => ({
  ...r,
  re: new RegExp("^" + r.path.replace(/:[A-Za-z_]+/g, "[^/]+") + "$"),
}));
const matchRoute = (path) => routeRegexes.filter((r) => r.re.test(path.replace(/\$[A-Z_]+/g, "x")));

const pages = listPages().map((p) => ({
  path: p,
  html: readFileSync(join(dist, p.endsWith("/") ? p + "index.html" : p), "utf8"),
}));
const allHtml = pages.map((p) => p.html).join("\n");

// 1. every /v1 path mentioned anywhere on the site
// template-literal placeholders in code samples (e.g. `/v1/schedules/${schedule.id}/pause`) stand for one path segment
const htmlForRoutes = allHtml.replace(/\$\{[^}]*\}/g, "x");
const mentioned = new Set(
  [...htmlForRoutes.matchAll(/\/v1\/[A-Za-z0-9_\-/:.$]+/g)].map((m) => m[0].replace(/[.,;:)]+$/, "")),
);
for (const p of mentioned) check(matchRoute(p).length > 0, `route exists for ${p}`);

// 2. method+path pairs in the developer endpoint table
const dev = pages.find((p) => p.path === "/developers/").html;
const rowRe = /data-label="Method"><code>([A-Z]+)<\/code><\/th><td data-label="Path"><code>([^<]+)<\/code>/g;
let rows = 0;
for (const m of dev.matchAll(rowRe)) {
  rows++;
  check(
    matchRoute(m[2]).some((r) => r.method === m[1]),
    `endpoint table: ${m[1]} ${m[2]} exists`,
  );
}
check(rows >= 10, `endpoint table parsed (${rows} rows)`);
// HTTP methods used in sample curl
check(
  matchRoute("/v1/obligations/x/execute").some((r) => r.method === "POST"),
  "curl sample: POST execute exists",
);
check(
  /id: "executeObligation"[^\n]*idempotency: "required"/.test(routesSrc),
  "execute requires Idempotency-Key (as the page says)",
);
check(
  /id: "reconcilePayment"/.test(routesSrc) && /id: "getReceipt"/.test(routesSrc),
  "reconcile and receipt routes exist",
);
check(
  /id: "registerApprovalKey"[^\n]*\/v1\/me\/approval-key/.test(routesSrc) ||
    /\/v1\/me\/approval-key/.test(routesSrc),
  "approval-key route exists",
);

// 3. webhook events
const evSrc = read("apps/api/src/services/webhooks.ts");
const events = [...evSrc.match(/EVENT_TYPES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const shownEvents = new Set(
  [...dev.matchAll(/<code>((?:obligation|payment|incident)\.[a-z]+)<\/code>/g)].map((m) => m[1]),
);
for (const e of shownEvents) check(events.includes(e), `webhook event ${e} exists`);
for (const e of events) check(shownEvents.has(e), `webhook event ${e} documented on /developers/`);
check(
  /orynt-signature/.test(evSrc) && /signPayload/.test(evSrc),
  "webhooks are sent with an orynt-signature header",
);

// 4. payment states
const states = [
  ...read("packages/core/src/states.ts")
    .match(/STATES = \[([^\]]+)\]/)[1]
    .matchAll(/"([^"]+)"/g),
].map((m) => m[1]);
const product = pages.find((p) => p.path === "/product/").html;
const shownStates = new Set([...product.matchAll(/<code>([A-Z_]{4,})<\/code>/g)].map((m) => m[1]));
for (const s of shownStates) check(states.includes(s), `state ${s} exists`);
for (const s of states) check(shownStates.has(s), `state ${s} listed on /product/`);

// 5. error codes named in prose or samples
const codes = [
  ...read("packages/core/src/problems.ts")
    .match(/PROBLEM_CODES = \[([^\]]+)\]/)[1]
    .matchAll(/"([^"]+)"/g),
].map((m) => m[1]);
for (const m of new Set([...dev.matchAll(/<code>([a-z]+(?:_[a-z]+)+)<\/code>/g)].map((x) => x[1])))
  if (codes.includes(m) || /^(?:payment|obligation|incident)/.test(m))
    check(codes.includes(m) || events.includes(m), `error code ${m} exists`);
for (const m of allHtml.matchAll(/err\.code === &quot;([a-z_]+)&quot;|err\.code === "([a-z_]+)"/g))
  check(codes.includes(m[1] ?? m[2]), `sample error code ${m[1] ?? m[2]} exists`);

// 6. contact form vs createLead
const lead = routesSrc.split("\n").find((l) => l.includes('id: "createLead"')) ?? "";
const leadBodyLine = lead; // after normalisation the body is on the same line
const leadKeys = [...leadBodyLine.matchAll(/(\w+): z\./g)].map((m) => m[1]);
const js = readFileSync(join(dist, "js/site.js"), "utf8");
for (const k of ["email", "name", "organization", "message", "consent", "source"]) {
  check(leadKeys.includes(k), `createLead accepts "${k}"`);
  check(new RegExp(`\\b${k}:`).test(js), `site.js sends "${k}"`);
}
check(
  /consent: z\.literal\(true\)/.test(leadBodyLine) && /consent: true/.test(js),
  "consent sent as literal true",
);
check(/source: "site"/.test(js), 'source is "site"');
check(
  /data-endpoint="[^"]*\/v1\/public\/leads"/.test(pages.find((p) => p.path === "/contact/").html),
  "form posts to /v1/public/leads",
);
check(/id: "createLead", method: "POST"/.test(routesSrc), "createLead is POST");
check(
  /id: "createApiKey"[\s\S]{0,300}z\.enum\(\["operator", "developer", "viewer"\]\)/.test(routesSrc),
  "API key roles are operator/developer/viewer",
);

// 7. TypeScript samples type-check against the real SDK
const tsc = join(repo, "node_modules/typescript/bin/tsc");
if (!existsSync(tsc)) problems.push("typescript not found at repo root; cannot type-check samples");
else {
  const snip = (n) => readFileSync(join(here, "../src/snippets", n), "utf8");
  const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "orynt-site-snippets-"));
  const main =
    `declare const approverClient: import("@orynt/sdk").OryntClient;\n` +
    ["1-create.ts.txt", "2-approve.ts.txt", "3-execute.ts.txt", "4-receipt.ts.txt"].map(snip).join("\n") +
    "\nexport {};\n";
  writeFileSync(join(tmp, "quickstart.ts"), main);
  writeFileSync(join(tmp, "webhook.ts"), snip("6-webhook.ts.txt"));
  // Newer-endpoint samples are each standalone programs.
  const standalone = [
    "8-batch.ts.txt",
    "9-schedule.ts.txt",
    "11-limit.ts.txt",
    "12-billing-signature.ts.txt",
  ];
  for (const n of standalone) writeFileSync(join(tmp, n.replace(".txt", "")), snip(n));
  const sdk = join(repo, "packages/sdk/src/index.ts");
  writeFileSync(
    join(tmp, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2023", "DOM"],
        strict: true,
        noUncheckedIndexedAccess: true,
        noEmit: true,
        skipLibCheck: true,
        types: ["node"],
        typeRoots: [join(repo, "node_modules/@types")],
        paths: { "@orynt/sdk": [sdk] },
      },
      files: ["quickstart.ts", "webhook.ts", ...standalone.map((n) => n.replace(".txt", ""))],
    }),
  );
  const r = spawnSync("node", [tsc, "-p", join(tmp, "tsconfig.json")], { encoding: "utf8" });
  check(r.status === 0, "TypeScript samples type-check against packages/sdk (strict)");
  if (r.status !== 0) problems.push((r.stdout + r.stderr).trim());
}

// 8. verifier CLI flags and exit codes shown on the page
const cli = readSrc("packages/verifier/src/cli.ts");
for (const flag of ["--trust-key", "--expect-payment-hash", "--expect-amount-msat", "--expect-network"])
  check(cli.includes(flag), `verifier supports ${flag}`);
check(
  /process\.exit\(report\.verdict === "VERIFIED" \? 0 : report\.verdict === "REJECTED" \? 1 : report\.verdict === "INTEGRITY_ONLY" \? 3 : 4\)/.test(
    cli,
  ),
  "verifier exit codes 0/1/3/4 as documented",
);
check(
  existsSync(join(repo, "packages/verifier/build.mjs")) &&
    /dist\/orynt-verify\.mjs/.test(read("packages/verifier/build.mjs")),
  "verifier builds to dist/orynt-verify.mjs",
);

// ---- 9. plan table: the built pricing page must equal the migration the server runs ---------------------------------------------------
const migSql = read("apps/api/src/db/migrations/003_saas_foundations.up.sql");
const planRows = [
  ...migSql.matchAll(
    /\(\s*'([a-z_]+)'\s*,\s*'([^']+)'\s*,\s*(NULL|\d+)\s*,\s*'(\{[^']*\})'\s*,\s*(\d+)\s*\)/g,
  ),
].map((m) => ({ id: m[1], name: m[2], cents: m[3] === "NULL" ? "custom" : m[3], ent: JSON.parse(m[4]) }));
check(
  planRows.length === 5,
  `migration defines ${planRows.length} plans (expected 5: developer, startup, growth, business, enterprise)`,
);
const pricing = pages.find((p) => p.path === "/pricing/").html;
const cells = new Map(
  [...pricing.matchAll(/<span data-plan="([a-z_]+)" data-ent="([a-z_]+)" data-v="([^"]*)">/g)].map((m) => [
    `${m[1]}.${m[2]}`,
    m[3],
  ]),
);
for (const pl of planRows) {
  check(cells.get(`${pl.id}.price`) === pl.cents, `pricing: ${pl.id} price cell is ${pl.cents}`);
  for (const [k, v] of Object.entries(pl.ent))
    check(cells.get(`${pl.id}.${k}`) === String(v), `pricing: ${pl.id}.${k} = ${v} (matches migration)`);
}
check(cells.size === planRows.length * 9, `pricing: ${cells.size} plan cells built (5 plans x 9)`);
for (const [id, label] of [
  ["developer", "Free"],
  ["startup", "$29"],
  ["growth", "$99"],
  ["business", "$299"],
  ["enterprise", "Custom"],
])
  check(
    new RegExp(`data-plan="${id}" data-ent="price"[^>]*>${label.replace("$", "\\$")}<`).test(pricing),
    `pricing: ${id} shows ${label}`,
  );
check(
  pricing.includes(
    "Pricing hypotheses under test — not final offers; the app currently uses a SANDBOX billing provider, no card is charged",
  ),
  "pricing: exact hypothesis/sandbox label present",
);
check(/app\/billing/.test(pricing), "pricing links to /app/billing");
check(
  /is_hypothesis boolean NOT NULL DEFAULT true/.test(migSql),
  "plan rows are hypotheses by default (is_hypothesis)",
);
const entSrc = readSrc("apps/api/src/services/entitlements.ts");
check(
  /PAST_DUE_GRACE_DAYS = 7/.test(entSrc) && /7 days/.test(pricing),
  "pricing FAQ: 7-day past-due grace matches entitlements.ts",
);
check(/"entitlement_exceeded", 402/.test(entSrc), "entitlement_exceeded is HTTP 402");
check(
  /Math\.abs\(nowSec - Number\(parts\["t"\]\)\) > 300/.test(read("apps/api/src/services/billing.ts")) &&
    /hmac\("sha512"/.test(read("apps/api/src/services/billing.ts")) &&
    /x-paystack-signature/.test(read("apps/api/src/services/billing.ts")),
  "billing webhook signature scheme (Stripe-style t/v1 300 s, Paystack HMAC-SHA512) as documented",
);
check(
  /ORYNT_BILLING_PROVIDER"\] \?\? "sandbox"/.test(read("apps/api/src/config.ts")),
  "billing provider defaults to sandbox",
);

// ---- 10. help center: error codes, receipt fields, verdicts --------------------------------------------------------------------------
const help = pages.find((p) => p.path === "/help/").html;
const apiSrc = [
  "apps/api/src/http/app.ts",
  ...[
    "accounts",
    "admin",
    "auth",
    "batches",
    "billing",
    "entitlements",
    "execution",
    "incidents",
    "lnurl",
    "obligations",
    "reconcile",
    "reports",
    "schedules",
    "support",
    "webhooks",
    "receipts",
    "gates",
    "providers",
  ].map((n) => `apps/api/src/services/${n}.ts`),
  "apps/api/src/http/handlers.ts",
  "apps/api/src/http/handlers-saas.ts",
  "apps/api/src/http/callbacks.ts",
  "packages/core/src/index.ts",
]
  .filter((f) => existsSync(join(repo, f)))
  .map(readSrc)
  .join("\n");
const errRows = [
  ...help.matchAll(
    /<th scope="row" data-label="Code"><code>([a-z_]+)<\/code><\/th><td data-label="HTTP">([^<]*)<\/td>/g,
  ),
].map((m) => ({ code: m[1], http: m[2].split(",").map((x) => x.trim()) }));
for (const c of codes)
  check(
    errRows.some((r) => r.code === c),
    `help: error code ${c} is listed`,
  );
for (const r of errRows) {
  check(codes.includes(r.code), `help: ${r.code} is a real problem code`);
  for (const h of r.http) {
    if (h === "—") continue;
    const re = new RegExp(`OryntError\\("${r.code}", ${h}\\b|problem\\(reply, req, ${h}, "${r.code}"`);
    check(re.test(apiSrc), `help: ${r.code} really is returned with HTTP ${h}`);
  }
}
const rcpt = read("packages/core/src/receipt.ts");
const rcptKeys = [
  ...rcpt
    .match(/export const ReceiptSchema = z\.object\(\{([\s\S]*?)\n\}\);/)[1]
    .matchAll(/^ {2}(\w+)[:,]/gm),
].map((m) => m[1]);
const shownFields = new Set(
  [...help.matchAll(/<th scope="row" data-label="Field"><code>([^<]+)<\/code>/g)].flatMap((m) =>
    m[1].split(",").map((x) => x.trim()),
  ),
);
for (const k of rcptKeys) check(shownFields.has(k), `help: receipt field ${k} explained`);
for (const k of shownFields) check(rcptKeys.includes(k), `help: receipt field ${k} exists in ReceiptSchema`);
const verSrc = read("packages/verifier/src/verify.ts");
for (const v of ["VERIFIED", "REJECTED", "INTEGRITY_ONLY", "VERIFIED_SIMULATED"])
  check(
    verSrc.includes(`"${v}"`) && new RegExp(`<code>${v}</code>`).test(help),
    `help: verifier verdict ${v} exists and is explained`,
  );
for (const [v, e] of [
  ["VERIFIED", 0],
  ["REJECTED", 1],
  ["INTEGRITY_ONLY", 3],
  ["VERIFIED_SIMULATED", 4],
])
  check(
    new RegExp(`<code>${v}</code></th><td data-label="Exit code"><code>${e}</code>`).test(help),
    `help: ${v} exit code ${e} as the CLI uses`,
  );
check(
  /send_blocked_unresolved/.test(help) &&
    /Check the wallet's record now/.test(help) &&
    read("apps/web/src/pages/PayoutDetail.tsx").includes("Check the wallet's record now"),
  "help: 'Check the wallet's record now' is the real button label",
);
check(
  read("apps/web/src/components/ui.tsx").includes("Checking wallet record"),
  "help: 'Checking wallet record' is the real UI label",
);
check(
  read("apps/web/src/pages/PayoutDetail.tsx").includes("Confirm it was never sent"),
  "help: 'Confirm it was never sent' is the real button label",
);
check(
  /confirmNotSent[^\n]*z\.string\(\)\.min\(10\)/.test(routesSrc),
  "help: confirm-not-sent note is at least 10 characters",
);
check(
  /environment: z\.enum\(\["REAL_PROVIDER", "SIMULATOR"\]\)/.test(rcpt),
  "receipt environment values are REAL_PROVIDER / SIMULATOR",
);
const stateOrExtra = new Set([
  ...states,
  "VERIFIED",
  "REJECTED",
  "INTEGRITY_ONLY",
  "VERIFIED_SIMULATED",
  "REAL_PROVIDER",
  "SIMULATOR",
]);
for (const pg of ["/platform/", "/help/", "/status/", "/solutions/", "/integrations/", "/pricing/"]) {
  for (const m of pages.find((p) => p.path === pg).html.matchAll(/<code>([A-Z][A-Z_]{3,})<\/code>/g))
    check(stateOrExtra.has(m[1]), `${pg}: <code>${m[1]}</code> is a real state or verdict`);
}

// ---- 11. status page vs health endpoints -----------------------------------------------------------------------------------------------
const status = pages.find((p) => p.path === "/status/").html;
const hsrc = read("apps/api/src/http/handlers.ts");
check(
  /healthLive: async \(\) => \(\{ body: \{ status: "ok" \} \}\)/.test(hsrc) &&
    /id: "healthLive", method: "GET", path: "\/health\/live"/.test(routesSrc),
  "status: /health/live returns {status:ok}",
);
check(
  /"ready"/.test(hsrc) &&
    /"not_ready"/.test(hsrc) &&
    /status: ok \? 200 : 503/.test(hsrc) &&
    /checks\["database"\]/.test(hsrc) &&
    /checks\["migrations"\]/.test(hsrc) &&
    /pending: /.test(hsrc),
  "status: /health/ready is 200 ready / 503 not_ready with database + migrations checks",
);
check(
  /No public uptime history/.test(status) && /\/health\/ready/.test(status),
  "status page says there is no uptime history and explains /health/ready",
);
check(
  !/\b\d{2,3}(\.\d+)?\s?% uptime|operational|all systems/i.test(
    status.replace(/<script[\s\S]*?<\/script>/g, ""),
  ),
  "status page claims no uptime figure or 'operational' status",
);

// ---- 12. integrations matrix and honesty of capability labels ----------------------------------------------------------------------------------------
const integ = pages.find((p) => p.path === "/integrations/").html;
const register = read("docs/EXECUTION-REGISTER.md");
check(
  /Real Lightning adapter\*\* \(LND REST\) \| VERIFIED \(regtest\)/.test(register),
  "register: LND adapter VERIFIED (regtest)",
);
check(
  /NWC \/ BTCPay \/ Core Lightning adapters \| NOT STARTED/.test(register),
  "register: NWC / BTCPay / Core Lightning adapters NOT STARTED",
);
check(
  /LNURL-pay \/ Lightning Address[^|]*\| VERIFIED/.test(register),
  "register: LNURL-pay / Lightning Address VERIFIED (matches integrations page)",
);
check(
  existsSync(join(repo, "packages/wallets/src/lnd.ts")) &&
    !existsSync(join(repo, "packages/wallets/src/nwc.ts")) &&
    !existsSync(join(repo, "packages/wallets/src/btcpay.ts")) &&
    !existsSync(join(repo, "packages/wallets/src/cln.ts")),
  "wallet adapters on disk: lnd + simulator only (no nwc/btcpay/cln)",
);
for (const w of ["Nostr Wallet Connect (NWC)", "BTCPay Server", "Core Lightning"]) {
  const row = integ.match(
    new RegExp(`<th scope="row" data-label="Wallet">${w.replace(/[()]/g, "\\$&")}</th>[\\s\\S]*?</tr>`),
  );
  check(
    !!row && !/tag--ok/.test(row[0]) && /Planned · not implemented/.test(row[0]),
    `integrations: ${w} is shown as planned / not implemented, never verified`,
  );
}
check(
  /15 real-node tests/.test(integ) && /\*\*15\/15 pass\*\*/.test(register),
  "integrations: '15 real-node tests' matches the register",
);

// ---- 13. batches / schedules facts ----------------------------------------------------------------------------------------------------------------------
const batSrc = read("apps/api/src/services/batches.ts");
check(
  /MAX_ROWS = 200/.test(batSrc) && /counterparty, amount_sats, invoice/.test(batSrc),
  "batches: 200-row limit and counterparty,amount_sats,invoice header as documented",
);
check(
  /cadence: z\.enum\(\["weekly", "monthly"\]\)/.test(routesSrc) &&
    /UNIQUE \(schedule_id, cycle\)/.test(migSql),
  "schedules: weekly/monthly and one task per schedule per cycle",
);
check(/never pays by itself/.test(routesSrc), "schedules: contract says a schedule never pays by itself");

// ---- 14. calls to action on every page --------------------------------------------------------------------------------------------------------------------
for (const pg of pages) {
  const headerHtml = (pg.html.match(/<header class="site-header">[\s\S]*?<\/header>/) ?? [""])[0];
  const footerHtml = (pg.html.match(/<footer[\s\S]*?<\/footer>/) ?? [""])[0];
  check(
    /href="\/app\/login">Sign in</.test(headerHtml) &&
      /href="\/app\/signup">Create account</.test(headerHtml),
    `${pg.path}: header shows Sign in + Create account`,
  );
  check(
    /href="\/app\/contact-support">Contact support</.test(footerHtml) &&
      /href="\/contact\/">Request a pilot</.test(footerHtml),
    `${pg.path}: footer has Contact support + Request a pilot`,
  );
}
for (const pg of [
  "/",
  "/product/",
  "/platform/",
  "/solutions/",
  "/integrations/",
  "/developers/",
  "/pricing/",
  "/help/",
  "/status/",
  "/security/",
  "/faq/",
]) {
  const html = pages.find((p) => p.path === pg).html;
  const main = (html.match(/<main[\s\S]*<\/main>/) ?? [""])[0];
  check(
    /<a class="btn btn--(primary|secondary)" href="(\/app\/signup|\/contact\/|\/app\/contact-support)">/.test(
      main,
    ),
    `${pg}: has a call-to-action button in the page body`,
  );
}

// ---- 15. things the site must never contain -------------------------------------------------------------------------------------------------------------------
const banned = [
  /<blockquote/i,
  /class="[^"]*testimonial/i,
  /\btrusted by\b/i,
  /\bour customers\b/i,
  /\bas seen (in|on)\b/i,
  /SOC ?2 (type|compliant|certified)/i,
  /ISO ?27001[ -]certified/i,
  /\b(guaranteed|guarantees?) (uptime|returns?)\b/i,
  /<img[^>]+src="(?!\/brand\/)/i,
];
for (const pg of pages)
  for (const re of banned) check(!re.test(pg.html.replace(/<!--[\s\S]*?-->/g, "")), `${pg.path}: no ${re}`);
check(
  !allHtml.includes("orynt.dev") && !allHtml.includes("orynt.io") && !allHtml.includes("orynt.com"),
  "site names no domain it does not own",
);
for (const pg of pages)
  if (pg.path !== "/404.html" && pg.path !== "/use-cases/") {
    const draft = ["/privacy/", "/terms/", "/acceptable-use/"].includes(pg.path);
    if (draft)
      check(/Draft — not reviewed by counsel/.test(pg.html), `${pg.path}: marked as an unreviewed draft`);
  }

console.log(ok.map((m) => "  ok  " + m).join("\n"));
if (problems.length) {
  console.log("\nPROBLEMS:\n" + problems.map((m) => "  !!  " + m).join("\n"));
  process.exit(1);
}
console.log(`\n${ok.length} claim checks passed, 0 problems.`);
