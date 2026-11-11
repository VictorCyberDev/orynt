import { mkdirSync, writeFileSync } from "node:fs";
import { buildOpenApi } from "@orynt/contract";
mkdirSync("docs/api", { recursive: true });
writeFileSync("docs/api/openapi.json", JSON.stringify(buildOpenApi(), null, 2) + "\n");
console.log("wrote docs/api/openapi.json");
