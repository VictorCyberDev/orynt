/**
 * BOLT 11 encoder. Used ONLY for tests and the clearly-labelled simulator provider, which must be able to mint
 * validly signed invoices with preimages it knows. Production invoices come from the payee's own node.
 */
import { bech32 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { sha256Bytes } from "./crypto";
import type { Network } from "./bolt11";

const PREFIX: Record<Network, string> = { mainnet: "bc", testnet: "tb", signet: "tbs", regtest: "bcrt" };

function bytesToWords(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >> bits) & 31);
      acc &= (1 << bits) - 1;
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}
function intToWords(n: number, len: number): number[] {
  const w: number[] = [];
  for (let i = 0; i < len; i++) {
    w.unshift(n % 32);
    n = Math.floor(n / 32);
  }
  return w;
}
function amountPart(msat: bigint | null): string {
  if (msat === null) return "";
  const pico = msat * 10n;
  for (const [unit, div] of [
    ["", 1_000_000_000_000n],
    ["m", 1_000_000_000n],
    ["u", 1_000_000n],
    ["n", 1_000n],
    ["p", 1n],
  ] as const) {
    if (pico % div === 0n) return (pico / div).toString() + unit;
  }
  throw new Error("unreachable");
}
function tag(type: number, dataWords: number[]): number[] {
  return [type, ...intToWords(dataWords.length, 2), ...dataWords];
}

export interface EncodeInvoiceParams {
  network: Network;
  amountMsat: bigint | null;
  paymentHashHex: string;
  paymentSecretHex?: string;
  description?: string;
  /** 32-byte hex sha256 of the description (BOLT11 `h` tag), used by LNURL-pay */
  descriptionHashHex?: string;
  timestamp: number;
  expirySeconds?: number;
  privateKeyHex: string; // payee node key
}

export function encodeInvoice(p: EncodeInvoiceParams): string {
  const hrp = `ln${PREFIX[p.network]}${amountPart(p.amountMsat)}`;
  const words: number[] = [...intToWords(p.timestamp, 7)];
  words.push(...tag(1, bytesToWords(hexToBytes(p.paymentHashHex))));
  if (p.paymentSecretHex) words.push(...tag(16, bytesToWords(hexToBytes(p.paymentSecretHex))));
  if (p.description) words.push(...tag(13, bytesToWords(utf8ToBytes(p.description))));
  if (p.descriptionHashHex) words.push(...tag(23, bytesToWords(hexToBytes(p.descriptionHashHex))));
  if (p.expirySeconds !== undefined) {
    let n = p.expirySeconds;
    const ws: number[] = [];
    do {
      ws.unshift(n % 32);
      n = Math.floor(n / 32);
    } while (n > 0);
    words.push(...tag(6, ws));
  }
  const msg = sha256Bytes(
    concatBytes(
      utf8ToBytes(hrp),
      (() => {
        // 5-bit words -> bytes with zero padding (matches decoder)
        const out: number[] = [];
        let acc = 0,
          bits = 0;
        for (const w of words) {
          acc = (acc << 5) | w;
          bits += 5;
          while (bits >= 8) {
            bits -= 8;
            out.push((acc >> bits) & 0xff);
            acc &= (1 << bits) - 1;
          }
        }
        if (bits > 0) out.push((acc << (8 - bits)) & 0xff);
        return Uint8Array.from(out);
      })(),
    ),
  );
  const rec = secp256k1.sign(msg, hexToBytes(p.privateKeyHex), { prehash: false, format: "recovered" }); // [recid, r, s]
  const sig = concatBytes(rec.slice(1), rec.slice(0, 1));
  words.push(...bytesToWords(sig));
  return bech32.encode(hrp, words, false);
}

export function nodePubkeyFromPrivate(privateKeyHex: string): string {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKeyHex), true));
}
