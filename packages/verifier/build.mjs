import { build } from "esbuild";
await build({
  entryPoints: ["src/cli.ts"], bundle: true, platform: "node", target: "node22", format: "esm",
  outfile: "dist/orynt-verify.mjs", minify: false, sourcemap: false, legalComments: "none",
});
console.log("built dist/orynt-verify.mjs");
