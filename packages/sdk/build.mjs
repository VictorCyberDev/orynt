import { build } from "esbuild";
await build({ entryPoints: ["src/index.ts"], bundle: true, platform: "neutral", format: "esm", target: "es2022", outfile: "dist/index.js", external: ["zod"], legalComments: "none", mainFields: ["module", "main"] });
console.log("built dist/index.js");
