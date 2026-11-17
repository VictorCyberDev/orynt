// Full-page screenshots (deviceScaleFactor 1) of key pages at 375/768/1440, plus a horizontal-overflow check on every page.
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";
import { loadPlaywright } from "./_playwright.mjs";
import { listPages } from "./_pages.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "../screenshots");
mkdirSync(out, { recursive: true });
const SHOT = {
  "/": "home",
  "/product/": "product",
  "/platform/": "platform",
  "/solutions/": "solutions",
  "/integrations/": "integrations",
  "/developers/": "developers",
  "/security/": "security",
  "/pricing/": "pricing",
  "/help/": "help",
  "/status/": "status",
  "/contact/": "contact",
};
const WIDTHS = [375, 768, 1440];
const scheme = process.env.SCHEME ?? "light";

const server = await startServer(Number(process.env.PORT ?? 4174));
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let failures = 0;
const rows = [];
for (const w of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  for (const path of listPages()) {
    await page.goto(`http://127.0.0.1:${server.address().port}${path}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    const ok = m.sw <= m.iw;
    if (!ok) failures++;
    rows.push(
      `${String(w).padStart(5)}  ${path.padEnd(16)} scrollWidth=${m.sw} innerWidth=${m.iw} ${ok ? "ok" : "OVERFLOW"}`,
    );
    if (SHOT[path])
      await page.screenshot({
        path: join(out, `${SHOT[path]}-${w}${scheme === "dark" ? "-dark" : ""}.png`),
        fullPage: true,
      });
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log(rows.join("\n"));
console.log(
  failures
    ? `\n${failures} overflow failure(s)`
    : `\nNo horizontal overflow on ${listPages().length} pages at ${WIDTHS.join("/")}px (${scheme}).`,
);
process.exit(failures ? 1 : 0);
