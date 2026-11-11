/**
 * Renders docs/hackathon/pitch-deck-source.md (the single source) into docs/hackathon/deck/orynt-deck.pdf and png/slide-NN.png.
 * Usage (repo root): node docs/hackathon/deck/build-deck.mjs      Needs Chromium via Playwright (apps/web).
 * Parsed per slide: "## Slide N. Title", the bullets under "**On slide:**", and an optional "**Image:** <repo-relative path>" line.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "docs/hackathon/deck");
const { chromium } = createRequire(join(ROOT, "apps/web/package.json"))("playwright");
const md = readFileSync(join(ROOT, "docs/hackathon/pitch-deck-source.md"), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

const slides = md.split(/\n(?=## Slide \d+\. )/).slice(1).map((blk) => {
  const title = /^## Slide (\d+)\. (.+)$/m.exec(blk);
  const on = /\*\*On slide:\*\*\n((?:- .*\n?)+)/.exec(blk);
  const img = /\*\*Image:\*\* (\S+)/.exec(blk);
  if (!title || !on) throw new Error("cannot parse slide block: " + blk.slice(0, 60));
  return { n: Number(title[1]), title: title[2], bullets: on[1].trim().split("\n").map((l) => l.replace(/^- /, "")), img: img?.[1] };
});
if (slides.length !== 12) throw new Error(`expected 12 slides, parsed ${slides.length}`);

const css = `
*{box-sizing:border-box}html,body{margin:0}
@page{size:1920px 1080px;margin:0}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;background:#f6f4ee;color:#0f1b2d;font-family:Inter,Arial,sans-serif;page-break-after:always;break-after:page}
.top{position:absolute;left:0;right:0;top:0;height:14px;background:#0e7c73}
h1{font-family:Fraunces,Georgia,serif;font-size:76px;line-height:1.08;margin:0;position:absolute;left:96px;top:70px;width:1728px}
.body{position:absolute;left:96px;top:215px;bottom:130px;display:flex;gap:60px;align-items:flex-start;width:1728px}
ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:26px}
li{font-size:40px;line-height:1.28;padding-left:40px;position:relative}
li::before{content:"";position:absolute;left:0;top:17px;width:16px;height:16px;border-radius:4px;background:#0e7c73}
.txt{flex:1 1 auto}.pic{flex:0 0 auto;display:flex;align-items:center;justify-content:center}
.pic img{max-width:820px;max-height:760px;border:2px solid #cfc8b5;border-radius:10px;background:#fff;box-shadow:0 8px 24px rgba(15,27,45,.15)}
.pic img.logo{border:none;box-shadow:none;background:none;width:560px}
.has-pic .txt{width:880px}
code{font-family:"JetBrains Mono",monospace;font-size:.82em;background:#e7e0cf;padding:2px 8px;border-radius:5px}
.foot{position:absolute;left:0;right:0;bottom:0;height:70px;background:#0f1b2d;color:#f6f4ee;font-size:25px;display:flex;align-items:center;justify-content:space-between;padding:0 96px}
.foot b{color:#f2c14e}
.title-slide h1{font-size:120px;top:170px}.title-slide .body{top:430px}.title-slide li{font-size:44px}
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orynt deck</title><style>${css}</style></head><body>${slides.map((s) => {
  const pic = s.img ? `<div class="pic"><img class="${/logo\.svg$/.test(s.img) ? "logo" : ""}" src="file://${join(ROOT, s.img)}" alt=""></div>` : "";
  const isTitle = s.n === 1;
  const lis = s.bullets.map((b) => `<li>${inline(b)}</li>`).join("");
  return `<section class="slide ${isTitle ? "title-slide" : ""} ${pic && !isTitle ? "has-pic" : ""}"><div class="top"></div><h1>${isTitle ? "Orynt" : esc(s.title)}</h1><div class="body"><div class="txt"><ul>${lis}</ul></div>${pic}</div><div class="foot"><span><b>Working title.</b> Regtest / test coins only. Not a launched product.</span><span>${s.n} / ${slides.length}</span></div></section>`;
}).join("")}</body></html>`;
mkdirSync(join(OUT, "png"), { recursive: true });
writeFileSync(join(OUT, "deck.html"), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file://" + join(OUT, "deck.html")); await page.waitForTimeout(500);
await page.pdf({ path: join(OUT, "orynt-deck.pdf"), width: "1920px", height: "1080px", printBackground: true });
const els = await page.$$(".slide");
for (const [i, el] of els.entries()) await el.screenshot({ path: join(OUT, "png", `slide-${String(i + 1).padStart(2, "0")}.png`) });
await browser.close();
console.log(`rendered ${slides.length} slides -> ${join(OUT, "orynt-deck.pdf")} and png/`);
