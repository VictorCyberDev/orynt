import { readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist");
/** All built HTML pages as URL paths, e.g. "/", "/product/", "/404.html". */
export function listPages() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".html")) {
        const rel = "/" + relative(dist, p).split("\\").join("/");
        out.push(rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel);
      }
    }
  };
  walk(dist);
  return out.sort();
}
