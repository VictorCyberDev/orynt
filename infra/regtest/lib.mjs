// Shared helpers for the regtest scripts. Plain Node 22, no dependencies.
import { readFileSync, existsSync } from "node:fs";
import https from "node:https";
import { join } from "node:path";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const DIR = join(ROOT, ".regtest");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, what, timeoutMs = 90_000, every = 800) {
  const end = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}${last ? `: ${last.message}` : ""}`);
    await sleep(every);
  }
}
export function findBin() {
  const home = process.env.ORYNT_BIN_DIR ?? join(DIR, "bin");
  const cands = {
    bitcoind: [
      process.env.ORYNT_BITCOIND,
      join(home, "bitcoin-29.5/bin/bitcoind"),
      "/opt/orynt-bin/bitcoin-29.5/bin/bitcoind",
    ],
    lnd: [
      process.env.ORYNT_LND,
      join(home, "lnd-linux-amd64-v0.20.1-beta/lnd"),
      "/opt/orynt-bin/lnd-linux-amd64-v0.20.1-beta/lnd",
    ],
  };
  const out = {};
  for (const [k, list] of Object.entries(cands)) {
    out[k] = list.find((p) => p && existsSync(p));
    if (!out[k])
      throw new Error(`${k} not found. Run: bash infra/regtest/fetch.sh (or set ORYNT_${k.toUpperCase()})`);
  }
  return out;
}
export async function rpc(cfg, method, params = [], wallet) {
  const res = await fetch(`http://127.0.0.1:${cfg.rpcPort}${wallet ? `/wallet/${wallet}` : ""}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${cfg.rpcUser}:${cfg.rpcPass}`).toString("base64"),
    },
    body: JSON.stringify({ jsonrpc: "1.0", id: "orynt", method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`bitcoind ${method}: ${j.error.message}`);
  return j.result;
}
export function lnd(node) {
  const mac = () => readFileSync(node.macaroonPath).toString("hex");
  const ca = () => readFileSync(node.tlsPath);
  return async (method, path, body, macaroonHex) =>
    new Promise((resolve, reject) => {
      const u = new URL(path, `https://127.0.0.1:${node.restPort}`);
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = https.request(
        {
          method,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          ca: ca(),
          headers: {
            "Grpc-Metadata-macaroon": macaroonHex ?? mac(),
            ...(payload
              ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
              : {}),
          },
        },
        (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            try {
              const j = JSON.parse(d || "{}");
              if ((res.statusCode ?? 500) >= 400)
                reject(new Error(`LND ${path} ${res.statusCode}: ${d.slice(0, 300)}`));
              else resolve(j);
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
}

export const PORTS = {
  bitcoind: { rpcPort: 18543, p2pPort: 18544, zmqBlock: 28332, zmqTx: 28333, rpcUser: "orynt" },
  alice: { rest: 8081, rpc: 10009, listen: 9735 },
  bob: { rest: 8082, rpc: 10010, listen: 9736 },
};
export const lndArgs = (name, rpcPass) => {
  const n = PORTS[name];
  const b = PORTS.bitcoind;
  const dir = join(DIR, name);
  return [
    `--lnddir=${dir}`,
    "--bitcoin.active",
    "--bitcoin.regtest",
    "--bitcoin.node=bitcoind",
    `--bitcoind.rpchost=127.0.0.1:${b.rpcPort}`,
    `--bitcoind.rpcuser=${b.rpcUser}`,
    `--bitcoind.rpcpass=${rpcPass}`,
    `--bitcoind.zmqpubrawblock=tcp://127.0.0.1:${b.zmqBlock}`,
    `--bitcoind.zmqpubrawtx=tcp://127.0.0.1:${b.zmqTx}`,
    `--listen=127.0.0.1:${n.listen}`,
    `--rpclisten=127.0.0.1:${n.rpc}`,
    `--restlisten=127.0.0.1:${n.rest}`,
    "--noseedbackup",
    `--alias=orynt-${name}`,
    "--tlsextraip=127.0.0.1",
    "--accept-keysend",
  ];
};
