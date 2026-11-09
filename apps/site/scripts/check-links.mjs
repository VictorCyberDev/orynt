// Verifies that every internal link, asset reference and #fragment in dist/ resolves.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { dist, listPages } from "./_pages.mjs";

const fileFor = (urlPath) => {
  let p = decodeURIComponent(urlPath);
  if (p.endsWith("/")) p += "index.html";
  return join(dist, p);
};
const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};

let checked = 0, external = 0;
const broken = [];
for (const page of listPages()) {
  const html = readFileSync(fileFor(page), "utf8");
  const refs = [...html.matchAll(/\s(href|src|srcset|data-endpoint|content)="([^"]*)"/g)].filter((m) => m[1] !== "content" || m[2].startsWith("/")).map((m) => m[2]);
  for (const raw of refs) {
    for (const ref of raw.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean)) {
      if (/^(mailto:|tel:|data:|javascript:)/.test(ref)) continue;
      if (/^https?:\/\//.test(ref)) { external++; continue; }
      if (!ref.startsWith("/") && !ref.startsWith("#")) continue; // meta content text etc.
      if (ref.startsWith("/v1/")) continue; // API endpoint, served by apps/api, not part of this static site
      const [pathPart, hash] = ref.split("#");
      const target = pathPart ? pathPart.split("?")[0] : page;
      const file = fileFor(target);
      checked++;
      if (!existsSync(file) || !statSync(file).isFile()) { broken.push(`${page} -> ${ref} (missing ${file.replace(dist, "dist")})`); continue; }
      if (hash && file.endsWith(".html") && !idsOf(file).has(hash)) broken.push(`${page} -> ${ref} (no element id="${hash}")`);
    }
  }
}
for (const f of ["sitemap.xml", "robots.txt", "css/site.css", "js/site.js", "fonts/LICENSES.txt", "brand/og.png"]) {
  if (!existsSync(join(dist, f))) broken.push(`dist/${f} missing`);
}
console.log(`pages: ${listPages().length} | internal references checked: ${checked} | external references (not fetched): ${external} | broken: ${broken.length}`);
if (broken.length) { console.log(broken.join("\n")); process.exit(1); }
