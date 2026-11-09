/**
 * Independent BOLT 11 decoder + signature verifier.
 * Written against https://github.com/lightning/bolts/blob/master/11-payment-encoding.md and tested with the
 * specification's own vectors. It does NOT trust a node or an external library for decoding: the payee key is
 * either taken from the `n` field (and the signature is verified against it) or recovered from the signature.
 */
import { bech32 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { sha256Bytes } from "./crypto";
import { MSAT_PER_BTC } from "./amount";

export type Network = "mainnet" | "testnet" | "signet" | "regtest";

const PREFIXES: Array<[string, Network]> = [
  ["bcrt", "regtest"],
  ["tbs", "signet"],
  ["bc", "mainnet"],
  ["tb", "testnet"],
];

export interface DecodedInvoice {
  network: Network;
  /** null for "any amount" invoices */
  amountMsat: bigint | null;
  timestamp: number;
  expirySeconds: number;
  expiresAt: number; // unix seconds
  paymentHash: string; // hex
  paymentSecret: string | null;
  payeePubkey: string; // hex compressed, signature-verified
  description: string | null;
  descriptionHash: string | null;
  minFinalCltvExpiry: number;
  signatureValid: true;
}

export class Bolt11Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Bolt11Error";
  }
}

function wordsToInt(words: number[]): number {
  return words.reduce((a, w) => a * 32 + w, 0);
}

/** Convert 5-bit words to bytes. `pad=false` requires the leftover bits to be zero padding of < 5 bits. */
function wordsToBytes(words: number[], pad: boolean): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    if (!pad && acc !== 0) throw new Bolt11Error("non-zero padding bits");
    if (pad) out.push((acc << (8 - bits)) & 0xff);
  }
  return Uint8Array.from(out);
}

function parseHrp(hrp: string): { network: Network; amountMsat: bigint | null } {
  if (!hrp.startsWith("ln")) throw new Bolt11Error("not a lightning invoice (missing ln prefix)");
  const rest = hrp.slice(2);
  let network: Network | undefined;
  let amountPart = "";
  for (const [p, n] of PREFIXES) {
    if (rest.startsWith(p)) {
      // the remainder must be an amount (digits + optional multiplier) or empty
      const r = rest.slice(p.length);
      if (r === "" || /^[0-9]/.test(r)) {
        network = n;
        amountPart = r;
        break;
      }
    }
  }
  if (!network) throw new Bolt11Error("unknown network prefix");
  if (amountPart === "") return { network, amountMsat: null };
  const m = /^([1-9][0-9]*)([munp]?)$/.exec(amountPart);
  if (!m) throw new Bolt11Error("malformed amount");
  const v = BigInt(m[1] as string);
  const mult = m[2] as string;
  let msat: bigint;
  switch (mult) {
    case "":
      msat = v * MSAT_PER_BTC;
      break;
    case "m":
      msat = v * (MSAT_PER_BTC / 1000n);
      break;
    case "u":
      msat = v * (MSAT_PER_BTC / 1_000_000n);
      break;
    case "n":
      msat = v * (MSAT_PER_BTC / 1_000_000_000n);
      break;
    case "p":
      if (v % 10n !== 0n) throw new Bolt11Error("pico-bitcoin amount must be a multiple of 10 (sub-msat)");
      msat = v / 10n;
      break;
    default:
      throw new Bolt11Error("bad multiplier");
  }
  if (msat <= 0n) throw new Bolt11Error("amount must be positive");
  return { network, amountMsat: msat };
}

export function decodeInvoice(invoice: string): DecodedInvoice {
  const inv = invoice.trim();
  if (inv !== inv.toLowerCase() && inv !== inv.toUpperCase()) throw new Bolt11Error("mixed-case invoice");
  const lower = inv.toLowerCase();
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32.decode(lower as `${string}1${string}`, false);
  } catch (e) {
    throw new Bolt11Error(`invalid bech32: ${(e as Error).message}`);
  }
  const { prefix: hrp, words } = decoded;
  const { network, amountMsat } = parseHrp(hrp);
  // 35-bit timestamp (7 words) + tagged fields + 104 words (520 bits) of signature
  if (words.length < 7 + 104) throw new Bolt11Error("invoice too short");
  const sigWords = words.slice(words.length - 104);
  const dataWords = words.slice(0, words.length - 104);
  const timestamp = wordsToInt(dataWords.slice(0, 7));

  let paymentHash: string | null = null;
  let paymentSecret: string | null = null;
  let payee: string | null = null;
  let description: string | null = null;
  let descriptionHash: string | null = null;
  let expiry = 3600;
  let cltv = 18;
  let seenX = false, seenC = false;

  let i = 7;
  while (i < dataWords.length) {
    if (i + 3 > dataWords.length) throw new Bolt11Error("truncated tagged field header");
    const type = dataWords[i] as number;
    const len = (dataWords[i + 1] as number) * 32 + (dataWords[i + 2] as number);
    i += 3;
    if (i + len > dataWords.length) throw new Bolt11Error("tagged field overruns invoice");
    const f = dataWords.slice(i, i + len);
    i += len;
    switch (type) {
      case 1: // p — payment hash
        if (len === 52) {
          if (paymentHash !== null) throw new Bolt11Error("duplicate payment hash field");
          paymentHash = bytesToHex(wordsToBytes(f, false));
        }
        break;
      case 16: // s — payment secret
        if (len === 52 && paymentSecret === null) paymentSecret = bytesToHex(wordsToBytes(f, false));
        break;
      case 19: // n — payee pubkey
        if (len === 53 && payee === null) payee = bytesToHex(wordsToBytes(f, false));
        break;
      case 13: // d — description
        if (description === null) description = new TextDecoder("utf-8", { fatal: false }).decode(wordsToBytes(f, false));
        break;
      case 23: // h — description hash
        if (len === 52 && descriptionHash === null) descriptionHash = bytesToHex(wordsToBytes(f, false));
        break;
      case 6: // x — expiry
        if (seenX) throw new Bolt11Error("duplicate expiry field"); seenX = true;
        if (len > 7) throw new Bolt11Error("expiry field too long");
        expiry = wordsToInt(f);
        break;
      case 24: // c — min_final_cltv_expiry_delta
        if (seenC) throw new Bolt11Error("duplicate min_final_cltv_expiry field"); seenC = true;
        if (len > 7) throw new Bolt11Error("cltv field too long");
        cltv = wordsToInt(f);
        break;
      default:
        break; // unknown / informational fields are ignored (e.g. features, fallback, route hints)
    }
  }
  if (paymentHash === null) throw new Bolt11Error("invoice has no payment hash");

  // ---- signature -----------------------------------------------------------------------------
  const sigBytes = wordsToBytes(sigWords, false); // 65 bytes: r(32) s(32) recid(1)
  if (sigBytes.length !== 65) throw new Bolt11Error("bad signature length");
  const compact = sigBytes.slice(0, 64);
  const recid = sigBytes[64] as number;
  if (recid > 3) throw new Bolt11Error("bad recovery id");
  // signed message = hrp bytes || data (5-bit words packed to bytes, zero padded)
  const msg = sha256Bytes(concatBytes(utf8ToBytes(hrp), wordsToBytes(dataWords, true)));
  let payeePubkey: string;
  try {
    if (payee !== null) {
      const ok = secp256k1.verify(compact, msg, Uint8Array.from(Buffer.from(payee, "hex")), { prehash: false, lowS: false });
      if (!ok) throw new Bolt11Error("signature does not match payee key (n field)");
      payeePubkey = payee;
    } else {
      const rec = concatBytes(Uint8Array.of(recid), compact);
      const pk = secp256k1.recoverPublicKey(rec, msg, { prehash: false });
      payeePubkey = bytesToHex(pk);
    }
  } catch (e) {
    if (e instanceof Bolt11Error) throw e;
    throw new Bolt11Error(`signature verification failed: ${(e as Error).message}`);
  }

  return {
    network,
    amountMsat,
    timestamp,
    expirySeconds: expiry,
    expiresAt: timestamp + expiry,
    paymentHash,
    paymentSecret,
    payeePubkey,
    description,
    descriptionHash,
    minFinalCltvExpiry: cltv,
    signatureValid: true,
  };
}
