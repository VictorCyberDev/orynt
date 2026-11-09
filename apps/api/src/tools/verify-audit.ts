/** Ops tool: re-verify every audit hash chain of every workspace in a database (use after restore). Exit 0 = all intact. */
import { loadConfig } from "../config";
import { createPool } from "../db/pool";
import { verifyAllStreams } from "../services/audit";
import type { Deps } from "../services/context";

const config = loadConfig();
const pool = createPool(config.databaseUrl, 2);
const deps = { pool, config, issuerPublicKey: "", issuerKeyId: "", log: { info() {}, warn() {}, error() {} } } as Deps;
let bad = 0;
for (const o of (await pool.query("SELECT id, name FROM organizations ORDER BY created_at")).rows) {
  const r = await verifyAllStreams(deps, o.id);
  console.log(`${r.ok ? "OK  " : "FAIL"} ${o.name}: ${r.entries} entries in ${r.streams} streams${r.ok ? "" : " — " + JSON.stringify(r.broken)}`);
  if (!r.ok) bad++;
}
await pool.end();
process.exit(bad ? 1 : 0);
