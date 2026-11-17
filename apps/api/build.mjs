import { build } from "esbuild";
import { cpSync, readFileSync, mkdirSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const external = Object.keys({ ...pkg.dependencies }).filter((d) => !d.startsWith("@orynt/"));
for (const entry of ["server", "tools/verify-audit"]) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: `dist/${entry}.mjs`,
    external,
    sourcemap: true,
    legalComments: "none",
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  });
}
mkdirSync("dist/migrations", { recursive: true });
cpSync("src/db/migrations", "dist/migrations", { recursive: true });
console.log("built dist/server.mjs, dist/tools/verify-audit.mjs and dist/migrations");
