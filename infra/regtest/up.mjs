#!/usr/bin/env node
/**
 * Starts a LOCAL Bitcoin regtest network: bitcoind + two LND nodes (alice = payer that Orynt controls, bob = payee), funds alice,
 * opens a 5,000,000-sat channel alice→bob, and bakes least-privilege macaroons for Orynt. Writes .regtest/env.json.
 *
 *   bash infra/regtest/fetch.sh && node infra/regtest/up.mjs      (stop: node infra/regtest/down.mjs)
 *
 * STATUS: written against the bitcoind 32.1 / LND v0.20.1 CLI + REST APIs, but NOT EXECUTED in the build environment
 * (the sandbox refused to run downloaded binaries). Treat every step as unverified until you have run it.
 * Regtest coins have no value. This script refuses to run if anything looks like mainnet.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, openSync, existsSync, rmSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DIR, findBin, lnd, lndArgs, rpc, sleep, until } from "./lib.mjs";

const fresh = process.argv.includes("--fresh");
if (fresh && existsSync(DIR))
  for (const d of ["bitcoind", "alice", "bob", "pids.json", "env.json"])
    rmSync(join(DIR, d), { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const bin = findBin();
const btc = {
  rpcPort: 18543,
  p2pPort: 18544,
  rpcUser: "orynt",
  rpcPass: existsSync(join(DIR, "rpcpass"))
    ? readFileSync(join(DIR, "rpcpass"), "utf8")
    : randomBytes(16).toString("hex"),
  zmqBlock: 28332,
  zmqTx: 28333,
};
writeFileSync(join(DIR, "rpcpass"), btc.rpcPass, { mode: 0o600 });
const pids = {};
const start = (name, cmd, args) => {
  const out = openSync(join(DIR, `${name}.log`), "a");
  const p = spawn(cmd, args, { detached: true, stdio: ["ignore", out, out] });
  p.unref();
  pids[name] = p.pid;
  console.log(`started ${name} (pid ${p.pid})`);
};

// 1. bitcoind (regtest only)
mkdirSync(join(DIR, "bitcoind"), { recursive: true });
start("bitcoind", bin.bitcoind, [
  "-regtest",
  `-datadir=${join(DIR, "bitcoind")}`,
  "-server=1",
  "-txindex=1",
  "-listenonion=0",
  "-fallbackfee=0.0002",
  `-rpcuser=${btc.rpcUser}`,
  `-rpcpassword=${btc.rpcPass}`,
  `-rpcport=${btc.rpcPort}`,
  `-port=${btc.p2pPort}`,
  `-zmqpubrawblock=tcp://127.0.0.1:${btc.zmqBlock}`,
  `-zmqpubrawtx=tcp://127.0.0.1:${btc.zmqTx}`,
]);
writeFileSync(join(DIR, "pids.json"), JSON.stringify(pids));
await until(async () => (await rpc(btc, "getblockchaininfo")).chain === "regtest", "bitcoind RPC");
if ((await rpc(btc, "getblockchaininfo")).chain !== "regtest") throw new Error("refusing: not regtest");
try {
  await rpc(btc, "createwallet", ["miner"]);
} catch {
  try {
    await rpc(btc, "loadwallet", ["miner"]);
  } catch {
    /* already loaded */
  }
}
const minerAddr = await rpc(btc, "getnewaddress", [], "miner");
if ((await rpc(btc, "getblockcount")) < 101) await rpc(btc, "generatetoaddress", [101, minerAddr]);
const mine = (n = 1) => rpc(btc, "generatetoaddress", [n, minerAddr]);

// 2. two LND nodes
const mk = (name, p) => ({
  name,
  dir: join(DIR, name),
  restPort: p.rest,
  rpcPort: p.rpc,
  listen: p.listen,
  tlsPath: join(DIR, name, "tls.cert"),
  macaroonPath: join(DIR, name, "data/chain/bitcoin/regtest/admin.macaroon"),
});
const alice = mk("alice", { rest: 8081, rpc: 10009, listen: 9735 }),
  bob = mk("bob", { rest: 8082, rpc: 10010, listen: 9736 });
for (const n of [alice, bob]) {
  mkdirSync(n.dir, { recursive: true });
  start(`lnd-${n.name}`, bin.lnd, lndArgs(n.name, btc.rpcPass));
}
writeFileSync(join(DIR, "pids.json"), JSON.stringify(pids));
const A = lnd(alice),
  B = lnd(bob);
for (const [n, c] of [
  [alice, A],
  [bob, B],
])
  await until(
    async () => existsSync(n.macaroonPath) && (await c("GET", "/v1/getinfo")).synced_to_chain,
    `${n.name} synced`,
    120_000,
  );
const aInfo = await A("GET", "/v1/getinfo"),
  bInfo = await B("GET", "/v1/getinfo");
for (const i of [aInfo, bInfo])
  if (!i.chains?.some((c) => c.network === "regtest"))
    throw new Error("refusing: LND node is not on regtest");

// 3. fund alice, connect, open channel
const addr = (await A("GET", "/v1/newaddress?type=0")).address;
await rpc(btc, "sendtoaddress", [addr, 2], "miner");
await mine(6);
await until(
  async () => BigInt((await A("GET", "/v1/balance/blockchain")).confirmed_balance) > 0n,
  "alice funded",
);
// LND reports synced_to_chain before its server subsystem accepts RPCs: retry until it does.
await until(
  async () => {
    try {
      await A("POST", "/v1/peers", {
        addr: { pubkey: bInfo.identity_pubkey, host: `127.0.0.1:${bob.listen}` },
        perm: true,
      });
      return true;
    } catch (e) {
      if (/already connected/i.test(e.message)) return true;
      throw e;
    }
  },
  "alice can connect to bob",
  120_000,
  2000,
);
await until(
  async () => (await A("GET", "/v1/peers")).peers?.some((p) => p.pub_key === bInfo.identity_pubkey),
  "peer connected",
);
await until(
  async () => {
    await A("POST", "/v1/channels", {
      node_pubkey: Buffer.from(bInfo.identity_pubkey, "hex").toString("base64"),
      local_funding_amount: "5000000",
      push_sat: "0",
    });
    return true;
  },
  "channel funding accepted",
  120_000,
  2000,
);
await mine(6);
await until(
  async () => (await A("GET", "/v1/channels")).channels?.some((c) => c.active),
  "channel active",
  120_000,
);
await sleep(2000);

// 4. least-privilege macaroons for Orynt
const bake = async (perms) => (await A("POST", "/v1/macaroon", { permissions: perms })).macaroon;
const oryntMac = await bake([
  { entity: "info", action: "read" },
  { entity: "offchain", action: "read" },
  { entity: "offchain", action: "write" },
]);
const readOnlyMac = await bake([
  { entity: "info", action: "read" },
  { entity: "offchain", action: "read" },
]);
const env = {
  network: "regtest",
  createdAt: new Date().toISOString(),
  note: "LOCAL REGTEST ONLY. Coins have no value.",
  bitcoind: { rpcPort: btc.rpcPort, rpcUser: btc.rpcUser },
  alice: {
    restUrl: `https://127.0.0.1:${alice.restPort}`,
    tlsCertPath: alice.tlsPath,
    pubkey: aInfo.identity_pubkey,
    oryntMacaroonHex: oryntMac,
    readOnlyMacaroonHex: readOnlyMac,
  },
  bob: {
    restUrl: `https://127.0.0.1:${bob.restPort}`,
    tlsCertPath: bob.tlsPath,
    pubkey: bInfo.identity_pubkey,
    adminMacaroonPath: bob.macaroonPath,
  },
};
writeFileSync(join(DIR, "env.json"), JSON.stringify(env, null, 2), { mode: 0o600 });
console.log(
  `\nregtest ready. alice ${aInfo.identity_pubkey.slice(0, 16)}… → bob ${bInfo.identity_pubkey.slice(0, 16)}…  (env: .regtest/env.json)`,
);
