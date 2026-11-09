// axe-core on every built page, light and dark, at a phone and a desktop width. Fails on serious/critical violations.
import { readFileSync } from "node:fs";
import { startServer } from "./server.mjs";
import { loadPlaywright, axePath } from "./_playwright.mjs";
import { listPages } from "./_pages.mjs";

const axeSource = readFileSync(axePath(), "utf8");
const server = await startServer(Number(process.env.PORT ?? 4175));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let runs = 0, blocking = 0, minor = 0;
const report = [];
async function audit(page, label) {
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(() => window.axe.run(document, { resultTypes: ["violations"] }));
  runs++;
  for (const v of res.violations) {
    const bad = v.impact === "serious" || v.impact === "critical";
    if (bad) blocking++; else minor++;
    report.push(`${bad ? "BLOCKING" : "minor   "} [${v.impact}] ${v.id} @ ${label}: ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }
}
for (const colorScheme of ["light", "dark"]) {
  for (const width of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme });
    const page = await ctx.newPage();
    for (const path of listPages()) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await audit(page, `${path} ${colorScheme} ${width}px`);
    }
    if (width === 375) { // also audit with the mobile menu open
      await page.goto(base + "/", { waitUntil: "networkidle" });
      await page.click(".menu-toggle");
      await audit(page, `/ (menu open) ${colorScheme} ${width}px`);
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(report.join("\n") || "no violations");
console.log(`\naxe runs: ${runs} | serious/critical violations: ${blocking} | minor/moderate: ${minor}`);
process.exit(blocking ? 1 : 0);
