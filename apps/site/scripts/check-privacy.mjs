// Privacy check for the built site: no third-party requests or trackers, no cookies, no browser storage, no beacons.
// Static pass over dist/ plus a browser pass (served with the same CSP the API sends) that records every network request,
// cookie, storage write and CSP violation on every page. Fails on anything found.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { startServer } from "./server.mjs";
import { loadPlaywright } from "./_playwright.mjs";
import { dist, listPages } from "./_pages.mjs";

const problems = [];
let checks = 0;
const check = (cond, msg) => {
  checks++;
  if (!cond) problems.push(msg);
};

// ---- static ---------------------------------------------------------------------------------------------------------------
const TRACKERS =
  /google-analytics|googletagmanager|gtag\(|fbq\(|facebook\.net|doubleclick|hotjar|segment\.(com|io)|mixpanel|amplitude|plausible|posthog|matomo|piwik|clarity\.ms|fullstory|intercom|hubspot|sentry\.io|cloudflareinsights|fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com/i;
const walk = (d) =>
  readdirSync(d).flatMap((e) => (statSync(join(d, e)).isDirectory() ? walk(join(d, e)) : [join(d, e)]));
for (const f of walk(dist)) {
  if (!/\.(html|css|js|xml|txt|svg)$/.test(f) || f.endsWith("LICENSES.txt")) continue;
  const text = readFileSync(f, "utf8");
  const rel = f.replace(dist, "dist");
  check(!TRACKERS.test(text), `${rel}: mentions a known tracker or third-party CDN`);
  if (f.endsWith(".html")) {
    for (const m of text.matchAll(
      /<(script|link|img|iframe|source|embed|object|video|audio)\b[^>]*\s(?:src|href|srcset|data)="([^"]*)"/gi,
    )) {
      check(!/^(https?:)?\/\//i.test(m[2]), `${rel}: <${m[1]}> loads an external resource: ${m[2]}`);
    }
    check(!/<iframe/i.test(text), `${rel}: contains an iframe`);
    check(
      !/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/i.test(text),
      `${rel}: contains an inline executable script (blocked by script-src 'self')`,
    );
    check(!/<form[^>]+action="https?:/i.test(text), `${rel}: a form posts to another origin`);
  }
  if (f.endsWith(".css"))
    check(!/@import|url\(\s*["']?(https?:)?\/\//i.test(text), `${rel}: CSS imports or loads an external URL`);
  if (f.endsWith(".js")) {
    for (const [re, what] of [
      [/document\.cookie/, "document.cookie"],
      [/localStorage|sessionStorage|indexedDB/, "browser storage"],
      [/sendBeacon/, "navigator.sendBeacon"],
      [/XMLHttpRequest/, "XMLHttpRequest"],
      [/new\s+Image\s*\(/, "image pixel"],
      [/WebSocket|EventSource/, "a persistent connection"],
    ])
      check(!re.test(text), `${rel}: uses ${what}`);
    const fetches = [...text.matchAll(/fetch\(([^,)]*)/g)].map((m) => m[1].trim());
    check(
      fetches.every((a) => a === "endpoint"),
      `${rel}: fetch() calls something other than the contact-form endpoint (${fetches.join(", ")})`,
    );
  }
}

// ---- browser ----------------------------------------------------------------------------------------------------------------------
const server = await startServer(Number(process.env.PORT ?? 4177));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const foreign = new Set(),
  consoleErrors = [];
page.on("request", (r) => {
  if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) foreign.add(r.url());
});
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
await page.addInitScript(() => {
  document.addEventListener(
    "securitypolicyviolation",
    (e) => (window.__csp = (window.__csp || []).concat(e.violatedDirective + " " + e.blockedURI)),
  );
});
for (const path of listPages()) {
  await page.goto(origin + path, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => ({
    cookie: document.cookie,
    ls: localStorage.length,
    ss: sessionStorage.length,
    csp: window.__csp || [],
    js: document.documentElement.classList.contains("js"),
  }));
  check(r.cookie === "", `${path}: document.cookie is not empty`);
  check(r.ls === 0 && r.ss === 0, `${path}: wrote to local/session storage`);
  check(r.csp.length === 0, `${path}: CSP violations: ${r.csp.join("; ")}`);
  check(r.js, `${path}: the "js" class was not set (boot script blocked?)`);
}
const cookies = await ctx.cookies();
check(
  cookies.length === 0,
  `browser holds ${cookies.length} cookie(s) after visiting every page: ${cookies.map((c) => c.name).join(", ")}`,
);
check(foreign.size === 0, `requests to other origins: ${[...foreign].join(", ")}`);
check(
  consoleErrors.filter((e) => !/404/.test(e)).length === 0,
  `console errors: ${consoleErrors.join(" | ")}`,
);
await browser.close();
server.close();

if (problems.length) {
  console.log("PROBLEMS:\n" + problems.map((p) => "  !! " + p).join("\n"));
  process.exit(1);
}
console.log(
  `privacy: ${checks} checks passed over ${listPages().length} pages (no third-party requests, no cookies, no storage, no beacons, no CSP violations).`,
);
