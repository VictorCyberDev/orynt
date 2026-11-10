#!/usr/bin/env node
/** Test helper: stop/start one regtest LND node to exercise node-restart and node-disconnected paths.   node infra/regtest/node.mjs stop|start alice|bob */
import { spawn } from "node:child_process";
import { openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIR, findBin, lnd, lndArgs, until } from "./lib.mjs";
const [cmd, name] = process.argv.slice(2);
if (!["stop", "start"].includes(cmd) || !["alice", "bob"].includes(name)) { console.error("usage: node.mjs stop|start alice|bob"); process.exit(2); }
const pidsFile = join(DIR, "pids.json"); const pids = JSON.parse(readFileSync(pidsFile, "utf8"));
if (cmd === "stop") {
  try { process.kill(pids[`lnd-${name}`], "SIGTERM"); } catch { /* already gone */ }
  await until(async () => { try { process.kill(pids[`lnd-${name}`], 0); return false; } catch { return true; } }, `${name} to exit`, 60000, 500);
  console.log(`stopped ${name}`);
} else {
  const out = openSync(join(DIR, `lnd-${name}.log`), "a");
  const p = spawn(findBin().lnd, lndArgs(name, readFileSync(join(DIR, "rpcpass"), "utf8")), { detached: true, stdio: ["ignore", out, out] }); p.unref();
  pids[`lnd-${name}`] = p.pid; writeFileSync(pidsFile, JSON.stringify(pids));
  const env = JSON.parse(readFileSync(join(DIR, "env.json"), "utf8")); const ports = { alice: 8081, bob: 8082 };
  const c = lnd({ restPort: ports[name], tlsPath: join(DIR, name, "tls.cert"), macaroonPath: join(DIR, name, "data/chain/bitcoin/regtest/admin.macaroon") });
  await until(async () => (await c("GET", "/v1/getinfo")).synced_to_chain, `${name} synced`, 120000, 1500);
  console.log(`started ${name}`); void env;
}
