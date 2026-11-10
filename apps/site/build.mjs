// Static site builder: pages (src/pages/*.mjs) + layout partials -> dist/. No framework, no bundler.
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderPage } from "./src/layout.mjs";
import { SITEMAP_ORIGIN, SITE_URL } from "./src/site.config.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const ui = resolve(root, "../../packages/ui");
const uiModules = join(ui, "node_modules");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const write = (rel, data) => {
  const out = join(dist, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
};

// ---- pages -----------------------------------------------------------------------------------------------
const pageDir = join(root, "src/pages");
const pages = [];
for (const f of readdirSync(pageDir).filter((n) => n.endsWith(".mjs")).sort()) {
  const mod = await import(pathToFileURL(join(pageDir, f)).href);
  pages.push(mod.default);
}
for (const page of pages) {
  const html = renderPage(page, page.body());
  const rel = page.file ?? (page.path === "/" ? "index.html" : page.path.replace(/^\//, "") + "index.html");
  write(rel, html);
}

// ---- styles & scripts -----------------------------------------------------------------------------------------
write("css/tokens.css", readFileSync(join(ui, "tokens.css")));
write("css/base.css", readFileSync(join(ui, "base.css")));
cpSync(join(root, "src/assets/site.css"), join(dist, "css/site.css"));
cpSync(join(root, "src/assets/site.js"), join(dist, "js/site.js"));
cpSync(join(root, "src/assets/boot.js"), join(dist, "js/boot.js"));

// ---- brand assets (original files from packages/ui; never redrawn) ---------------------------------------------------
cpSync(join(ui, "brand"), join(dist, "brand"), { recursive: true });

// ---- self-hosted fonts (latin subset only, SIL OFL 1.1) --------------------------------------------------------------
const FONTS = [
  { pkg: "@fontsource-variable/inter", file: "inter-latin-wght-normal.woff2", family: "Inter Variable", weight: "100 900", format: "woff2-variations", licence: "Inter" },
  { pkg: "@fontsource-variable/fraunces", file: "fraunces-latin-wght-normal.woff2", family: "Fraunces Variable", weight: "100 900", format: "woff2-variations", licence: "Fraunces" },
  { pkg: "@fontsource/jetbrains-mono", file: "jetbrains-mono-latin-400-normal.woff2", family: "JetBrains Mono", weight: "400", format: "woff2", licence: "JetBrains Mono" },
];
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
let fontCss = "/* Self-hosted, latin subset. See /fonts/LICENSES.txt */\n";
let licences = `Fonts bundled with this site are self-hosted copies of the "latin" subset published by Fontsource.
Each is licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org). Full licence texts follow.
No font is loaded from a third-party server.\n`;
for (const f of FONTS) {
  const src = join(uiModules, f.pkg, "files", f.file);
  if (!existsSync(src)) throw new Error(`Font file missing: ${src}. Run pnpm install first.`);
  cpSync(src, join(dist, "fonts", f.file));
  fontCss += `@font-face{font-family:"${f.family}";font-style:normal;font-display:swap;font-weight:${f.weight};src:url(/fonts/${f.file}) format("${f.format}");unicode-range:${LATIN}}\n`;
  licences += `\n${"=".repeat(78)}\n${f.licence}  (${f.pkg}, file ${f.file})\n${"=".repeat(78)}\n\n${readFileSync(join(uiModules, f.pkg, "LICENSE"), "utf8")}\n`;
}
write("css/fonts.css", fontCss);
write("fonts/LICENSES.txt", licences);

// ---- robots, sitemap, 404 handled as a page ------------------------------------------------------------------------------
const indexable = pages.filter((p) => !p.noindex);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
    .map((p) => `  <url><loc>${SITEMAP_ORIGIN}${p.path}</loc></url>`)
    .join("\n")}\n</urlset>\n`,
);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITEMAP_ORIGIN}/sitemap.xml\n`);

// ---- report ---------------------------------------------------------------------------------------------------------------
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
console.log(`built ${pages.length} pages -> ${dist} (${(size(dist) / 1024).toFixed(0)} KiB total incl. brand PNGs)`);
if (!SITE_URL) console.log("note: ORYNT_SITE_URL not set -> canonical/OG URLs are relative; sitemap uses placeholder origin " + SITEMAP_ORIGIN);
