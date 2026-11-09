// Cross-checks what the built site says about the API/SDK against the real sources in this monorepo:
//  - every /v1/... path shown exists in packages/contract/src/routes.ts (or is the OpenAPI route in apps/api)
//  - every webhook event and payment state shown exists in the code; the contact form matches the createLead route
//  - the TypeScript samples type-check against packages/sdk/src (needs the repo's typescript)
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dist, listPages } from "./_pages.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const problems = [];
const ok = [];
const check = (cond, msg) => (cond ? ok.push(msg) : problems.push(msg));

const routesSrc = read("packages/contract/src/routes.ts");
const routes = [...routesSrc.matchAll(/method: "(GET|POST|PUT|PATCH|DELETE)", path: "([^"]+)"/g)].map((m) => ({ method: m[1], path: m[2] }));
routes.push({ method: "GET", path: "/v1/openapi.json" });
check(/app\.get\("\/v1\/openapi\.json"/.test(read("apps/api/src/http/app.ts")), "apps/api serves GET /v1/openapi.json");
const routeRegexes = routes.map((r) => ({ ...r, re: new RegExp("^" + r.path.replace(/:[A-Za-z_]+/g, "[^/]+") + "$") }));
const matchRoute = (path) => routeRegexes.filter((r) => r.re.test(path.replace(/\$[A-Z_]+/g, "x")));

const pages = listPages().map((p) => ({ path: p, html: readFileSync(join(dist, p.endsWith("/") ? p + "index.html" : p), "utf8") }));
const allHtml = pages.map((p) => p.html).join("\n");

// 1. every /v1 path mentioned anywhere on the site
const mentioned = new Set([...allHtml.matchAll(/\/v1\/[A-Za-z0-9_\-/:.$]+/g)].map((m) => m[0].replace(/[.,;:)]+$/, "")));
for (const p of mentioned) check(matchRoute(p).length > 0, `route exists for ${p}`);

// 2. method+path pairs in the developer endpoint table
const dev = pages.find((p) => p.path === "/developers/").html;
const rowRe = /data-label="Method"><code>([A-Z]+)<\/code><\/th><td data-label="Path"><code>([^<]+)<\/code>/g;
let rows = 0;
for (const m of dev.matchAll(rowRe)) {
  rows++;
  check(matchRoute(m[2]).some((r) => r.method === m[1]), `endpoint table: ${m[1]} ${m[2]} exists`);
}
check(rows >= 10, `endpoint table parsed (${rows} rows)`);
// HTTP methods used in sample curl
check(matchRoute("/v1/obligations/x/execute").some((r) => r.method === "POST"), "curl sample: POST execute exists");
check(/id: "executeObligation"[^\n]*idempotency: "required"/.test(routesSrc), "execute requires Idempotency-Key (as the page says)");
check(/id: "reconcilePayment"/.test(routesSrc) && /id: "getReceipt"/.test(routesSrc), "reconcile and receipt routes exist");
check(/id: "registerApprovalKey"[^\n]*\/v1\/me\/approval-key/.test(routesSrc) || /\/v1\/me\/approval-key/.test(routesSrc), "approval-key route exists");

// 3. webhook events
const evSrc = read("apps/api/src/services/webhooks.ts");
const events = [...evSrc.match(/EVENT_TYPES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const shownEvents = new Set([...dev.matchAll(/<code>((?:obligation|payment|incident)\.[a-z]+)<\/code>/g)].map((m) => m[1]));
for (const e of shownEvents) check(events.includes(e), `webhook event ${e} exists`);
for (const e of events) check(shownEvents.has(e), `webhook event ${e} documented on /developers/`);
check(/orynt-signature/.test(evSrc) && /signPayload/.test(evSrc), "webhooks are sent with an orynt-signature header");

// 4. payment states
const states = [...read("packages/core/src/states.ts").match(/STATES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const product = pages.find((p) => p.path === "/product/").html;
const shownStates = new Set([...product.matchAll(/<code>([A-Z_]{4,})<\/code>/g)].map((m) => m[1]));
for (const s of shownStates) check(states.includes(s), `state ${s} exists`);
for (const s of states) check(shownStates.has(s), `state ${s} listed on /product/`);

// 5. error codes named in prose or samples
const codes = [...read("packages/core/src/problems.ts").match(/PROBLEM_CODES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
for (const m of new Set([...dev.matchAll(/<code>([a-z]+(?:_[a-z]+)+)<\/code>/g)].map((x) => x[1]))) if (codes.includes(m) || /^(?:payment|obligation|incident)/.test(m)) check(codes.includes(m) || events.includes(m), `error code ${m} exists`);
for (const m of allHtml.matchAll(/err\.code === &quot;([a-z_]+)&quot;|err\.code === "([a-z_]+)"/g)) check(codes.includes(m[1] ?? m[2]), `sample error code ${m[1] ?? m[2]} exists`);

// 6. contact form vs createLead
const lead = routesSrc.split("\n").find((l) => l.includes('id: "createLead"')) ?? "";
const leadBodyLine = routesSrc.split("\n")[routesSrc.split("\n").indexOf(lead) + 1] ?? "";
const leadKeys = [...leadBodyLine.matchAll(/(\w+): z\./g)].map((m) => m[1]);
const js = readFileSync(join(dist, "js/site.js"), "utf8");
for (const k of ["email", "name", "organization", "message", "consent", "source"]) {
  check(leadKeys.includes(k), `createLead accepts "${k}"`);
  check(new RegExp(`\\b${k}:`).test(js), `site.js sends "${k}"`);
}
check(/consent: z\.literal\(true\)/.test(leadBodyLine) && /consent: true/.test(js), "consent sent as literal true");
check(/source: "site"/.test(js), 'source is "site"');
check(/data-endpoint="[^"]*\/v1\/public\/leads"/.test(pages.find((p) => p.path === "/contact/").html), "form posts to /v1/public/leads");
check(/id: "createLead", method: "POST"/.test(routesSrc), "createLead is POST");
check(/id: "createApiKey"[\s\S]{0,300}z\.enum\(\["operator", "developer", "viewer"\]\)/.test(routesSrc), "API key roles are operator/developer/viewer");

// 7. TypeScript samples type-check against the real SDK
const tsc = join(repo, "node_modules/typescript/bin/tsc");
if (!existsSync(tsc)) problems.push("typescript not found at repo root; cannot type-check samples");
else {
  const snip = (n) => readFileSync(join(here, "../src/snippets", n), "utf8");
  const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "orynt-site-snippets-"));
  const main = `declare const approverClient: import("@orynt/sdk").OryntClient;\n` + ["1-create.ts", "2-approve.ts", "3-execute.ts", "4-receipt.ts"].map(snip).join("\n") + "\nexport {};\n";
  writeFileSync(join(tmp, "quickstart.ts"), main);
  writeFileSync(join(tmp, "webhook.ts"), snip("6-webhook.ts"));
  const sdk = join(repo, "packages/sdk/src/index.ts");
  writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2023", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2023", "DOM"], strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, types: ["node"], typeRoots: [join(repo, "node_modules/@types")], paths: { "@orynt/sdk": [sdk] } },
    files: ["quickstart.ts", "webhook.ts"],
  }));
  const r = spawnSync("node", [tsc, "-p", join(tmp, "tsconfig.json")], { encoding: "utf8" });
  check(r.status === 0, "TypeScript samples type-check against packages/sdk (strict)");
  if (r.status !== 0) problems.push((r.stdout + r.stderr).trim());
}

// 8. verifier CLI flags and exit codes shown on the page
const cli = read("packages/verifier/src/cli.ts");
for (const flag of ["--trust-key", "--expect-payment-hash", "--expect-amount-msat", "--expect-network"]) check(cli.includes(flag), `verifier supports ${flag}`);
check(/process\.exit\(report\.verdict === "VERIFIED" \? 0 : report\.verdict === "REJECTED" \? 1 : report\.verdict === "INTEGRITY_ONLY" \? 3 : 4\)/.test(cli), "verifier exit codes 0/1/3/4 as documented");
check(existsSync(join(repo, "packages/verifier/build.mjs")) && /dist\/orynt-verify\.mjs/.test(read("packages/verifier/build.mjs")), "verifier builds to dist/orynt-verify.mjs");

console.log(ok.map((m) => "  ok  " + m).join("\n"));
if (problems.length) { console.log("\nPROBLEMS:\n" + problems.map((m) => "  !!  " + m).join("\n")); process.exit(1); }
console.log(`\n${ok.length} claim checks passed, 0 problems.`);
