#!/usr/bin/env node
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { verifyReceipt, type TrustedKey, type VerifyOptions } from "./verify";

const USAGE = `orynt-verify <receipt.json> [options]

Verifies an Orynt payment receipt offline, without contacting Orynt.

Options:
  --trust-key <hex32>          Issuer public key you trust (repeatable)
  --trust-file <keys.json>     JSON array of {key_id, public_key, valid_from?, valid_until?}
  --require-real               Reject simulator receipts
  --expect-payment-hash <hex>  Receipt must be for this payment hash
  --expect-amount-msat <n>     Receipt must be for exactly this amount
  --expect-payee-pubkey <hex>  Receipt must pay this node key
  --expect-network <name>      mainnet | testnet | signet | regtest
  --max-age-seconds <n>        Reject receipts older than this
  --seen-file <path>           Replay ledger: reject receipt ids listed here; append on success
  --json                       Machine-readable output

Exit codes: 0 VERIFIED (trusted issuer) | 1 REJECTED | 2 usage/IO error | 3 integrity OK but issuer NOT trusted | 4 VERIFIED_SIMULATED (not a real payment)`;

function fail(msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  process.stdout.write(USAGE + "\n");
  process.exit(args.length === 0 ? 2 : 0);
}
const file = args[0] as string;
const opts: VerifyOptions = { trustedKeys: [], expect: {} };
let json = false;
let seenFile: string | undefined;
for (let i = 1; i < args.length; i++) {
  const a = args[i] as string;
  const v = () => args[++i] ?? fail(`missing value for ${a}`);
  switch (a) {
    case "--trust-key": opts.trustedKeys!.push({ key_id: "cli", public_key: v().toLowerCase() }); break;
    case "--trust-file": {
      try { opts.trustedKeys!.push(...(JSON.parse(readFileSync(v(), "utf8")) as TrustedKey[])); } catch (e) { fail(`cannot read trust file: ${(e as Error).message}`); }
      break;
    }
    case "--require-real": opts.requireReal = true; break;
    case "--expect-payment-hash": opts.expect!.paymentHash = v().toLowerCase(); break;
    case "--expect-amount-msat": opts.expect!.amountMsat = v(); break;
    case "--expect-payee-pubkey": opts.expect!.payeePubkey = v().toLowerCase(); break;
    case "--expect-network": opts.expect!.network = v(); break;
    case "--max-age-seconds": opts.maxAgeSeconds = Number(v()); break;
    case "--seen-file": seenFile = v(); break;
    case "--json": json = true; break;
    default: fail(`unknown option ${a}\n\n${USAGE}`);
  }
}
let data: unknown;
try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`cannot read receipt: ${(e as Error).message}`); }
if (seenFile) opts.seenReceiptIds = new Set(existsSync(seenFile) ? readFileSync(seenFile, "utf8").split("\n").filter(Boolean) : []);

const report = verifyReceipt(data, opts);
if (json) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
else {
  const icon = { PASS: "✔", FAIL: "✘", WARN: "!", SKIP: "-" } as const;
  for (const c of report.checks) process.stdout.write(` ${icon[c.status]} ${c.id.padEnd(28)} ${c.detail}\n`);
  process.stdout.write(`\nVERDICT: ${report.verdict}\n`);
  if (report.summary) process.stdout.write(`  ${report.summary.amountMsat} msat on ${report.summary.network} (${report.summary.environment}), payment_hash ${report.summary.paymentHash}\n`);
  if (report.verdict !== "REJECTED" && report.cannotProve.length) {
    process.stdout.write("\nThis receipt cannot prove:\n");
    for (const l of report.cannotProve) process.stdout.write(`  - ${l}\n`);
  }
}
if (seenFile && report.verdict !== "REJECTED" && report.summary) appendFileSync(seenFile, report.summary.receiptId + "\n");
process.exit(report.verdict === "VERIFIED" ? 0 : report.verdict === "REJECTED" ? 1 : report.verdict === "INTEGRITY_ONLY" ? 3 : 4);
