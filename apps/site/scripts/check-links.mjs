// Verifies that every internal link, asset reference and #fragment in dist/ resolves.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dist, listPages } from "./_pages.mjs";
import { APP } from "../src/site.config.mjs";

// Links into the product app (served by apps/api under /app, not part of this static site) are accepted only if they are declared in APP.
// Declared paths are also checked against the web app's real route table (apps/web/src/App.tsx), so a renamed or removed route fails here.
const APP_PATHS = new Set(Object.values(APP));

const fileFor = (urlPath) => {
  let p = decodeURIComponent(urlPath);
  if (p.endsWith("/")) p += "index.html";
  return join(dist, p);
};
const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file))
    idsCache.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};

// /app/* is the product app (apps/web), served by the same API process. Its links are checked against the app's real
// route table instead of dist/, so a renamed or removed route breaks this check.
const appRoutes = (() => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../web/src/App.tsx"), "utf8");
  return new Set([...src.matchAll(/<Route path="([^"*]+)"/g)].map((m) => m[1].replace(/^\//, "")));
})();
let checked = 0,
  external = 0,
  appLinks = 0;
const broken = [];
for (const page of listPages()) {
  const html = readFileSync(fileFor(page), "utf8");
  const refs = [...html.matchAll(/\s(href|src|srcset|data-endpoint|content)="([^"]*)"/g)]
    .filter((m) => m[1] !== "content" || m[2].startsWith("/"))
    .map((m) => m[2]);
  for (const raw of refs) {
    for (const ref of raw
      .split(",")
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean)) {
      if (/^(mailto:|tel:|data:|javascript:)/.test(ref)) continue;
      if (/^https?:\/\//.test(ref)) {
        external++;
        continue;
      }
      if (!ref.startsWith("/") && !ref.startsWith("#")) continue; // meta content text etc.
      if (ref.startsWith("/app/") || ref === "/app") {
        const bare = ref.split(/[?#]/)[0];
        appLinks++;
        if (!APP_PATHS.has(bare))
          broken.push(
            `${page} -> ${ref} (undeclared /app path; add it to APP in site.config.mjs once it exists in the web router)`,
          );
        else if (!appRoutes.has(bare.slice("/app/".length)))
          broken.push(`${page} -> ${ref} (declared in APP but no such route in apps/web/src/App.tsx)`);
        continue;
      }
      if (ref.startsWith("/v1/")) continue; // API endpoint, served by apps/api, not part of this static site
      if (ref === "/health/live" || ref === "/health/ready") continue; // API probes
      const [pathPart, hash] = ref.split("#");
      const target = pathPart ? pathPart.split("?")[0] : page;
      const file = fileFor(target);
      checked++;
      if (!existsSync(file) || !statSync(file).isFile()) {
        broken.push(`${page} -> ${ref} (missing ${file.replace(dist, "dist")})`);
        continue;
      }
      if (hash && file.endsWith(".html") && !idsOf(file).has(hash))
        broken.push(`${page} -> ${ref} (no element id="${hash}")`);
    }
  }
}
for (const f of [
  "sitemap.xml",
  "robots.txt",
  "css/site.css",
  "js/site.js",
  "fonts/LICENSES.txt",
  "brand/og.png",
]) {
  if (!existsSync(join(dist, f))) broken.push(`dist/${f} missing`);
}
console.log(
  `pages: ${listPages().length} | internal references checked: ${checked} | app links (checked against apps/web routes): ${appLinks} | external references (not fetched): ${external} | broken: ${broken.length}`,
);
if (broken.length) {
  console.log(broken.join("\n"));
  process.exit(1);
}
