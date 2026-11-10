#!/usr/bin/env node
/** Test helper: stop/start one regtest LND node to exercise node-restart and node-disconnected paths.   node infra/regtest/node.mjs stop|start alice|bob
 *  Nodes are located by their --lnddir (not a stored pid, which goes stale); `start` is a no-op if the node already answers. */
import { execFileSync, spawn } from "node:child_process";
import { openSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DIR, findBin, lnd, lndArgs, until } from "./lib.mjs";
const [cmd, name] = process.argv.slice(2);
if (!["stop", "start"].includes(cmd) || !["alice", "bob"].includes(name)) { console.error("usage: node.mjs stop|start alice|bob"); process.exit(2); }
const pidsOf = () => { try { return execFileSync("pgrep", ["-f", "--", `lnddir=${join(DIR, name)}`], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number); } catch { return []; } };
const ports = { alice: 8081, bob: 8082 };
const client = () => lnd({ restPort: ports[name], tlsPath: join(DIR, name, "tls.cert"), macaroonPath: join(DIR, name, "data/chain/bitcoin/regtest/admin.macaroon") });
const answers = async () => { try { return !!(await client()("GET", "/v1/getinfo")).identity_pubkey; } catch { return false; } };
if (cmd === "stop") {
  for (const pid of pidsOf()) { try { process.kill(pid, "SIGTERM"); } catch { /* gone */ } }
  await until(async () => pidsOf().length === 0, `${name} to exit`, 60000, 500);
  console.log(`stopped ${name}`);
} else {
  if (pidsOf().length && await answers()) { console.log(`${name} already running`); process.exit(0); }
  const out = openSync(join(DIR, `lnd-${name}.log`), "a");
  const p = spawn(findBin().lnd, lndArgs(name, readFileSync(join(DIR, "rpcpass"), "utf8")), { detached: true, stdio: ["ignore", out, out] }); p.unref();
  const pf = join(DIR, "pids.json"); if (existsSync(pf)) { const pids = JSON.parse(readFileSync(pf, "utf8")); pids[`lnd-${name}`] = p.pid; writeFileSync(pf, JSON.stringify(pids)); }
  await until(async () => (await client()("GET", "/v1/getinfo")).synced_to_chain, `${name} synced`, 120000, 1500);
  console.log(`started ${name}`);
}
