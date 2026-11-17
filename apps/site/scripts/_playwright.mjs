// Playwright is pre-installed globally in this environment; it is intentionally not a dependency of the site.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const req = createRequire(import.meta.url);
export function loadPlaywright() {
  try {
    return req("playwright");
  } catch {
    /* fall through to the global install */
  }
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  return createRequire(globalRoot + "/")("playwright");
}
export const axePath = () => req.resolve("axe-core/axe.min.js");
