import { describe, expect, it } from "vitest";
import { decodeInvoice, Bolt11Error } from "../src/bolt11";

// Vectors from https://github.com/lightning/bolts/blob/master/11-payment-encoding.md (retrieved 2026-11-09).
// All are signed by priv_key e126f68f...b734 => pubkey 03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad
const PAYEE = "03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad";
const V1 =
  "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql";
const V2 =
  "lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh";
const V_TESTNET_20M =
  "lntb20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqfpp3x9et2e20v6pu37c5d9vax37wxq72un989qrsgqdj545axuxtnfemtpwkc45hx9d2ft7x04mt8q7y6t0k2dge9e7h8kpy9p34ytyslj3yu569aalz2xdk8xkd7ltxqld94u8h2esmsmacgpghe9k8";
const V_PICO =
  "lnbc9678785340p1pwmna7lpp5gc3xfm08u9qy06djf8dfflhugl6p7lgza6dsjxq454gxhj9t7a0sd8dgfkx7cmtwd68yetpd5s9xar0wfjn5gpc8qhrsdfq24f5ggrxdaezqsnvda3kkum5wfjkzmfqf3jkgem9wgsyuctwdus9xgrcyqcjcgpzgfskx6eqf9hzqnteypzxz7fzypfhg6trddjhygrcyqezcgpzfysywmm5ypxxjemgw3hxjmn8yptk7untd9hxwg3q2d6xjcmtv4ezq7pqxgsxzmnyyqcjqmt0wfjjq6t5v4khxsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsxqyjw5qcqp2rzjq0gxwkzc8w6323m55m4jyxcjwmy7stt9hwkwe2qxmy8zpsgg7jcuwz87fcqqeuqqqyqqqqlgqqqqn3qq9q9qrsgqrvgkpnmps664wgkp43l22qsgdw4ve24aca4nymnxddlnp8vh9v2sdxlu5ywdxefsfvm0fq3sesf08uf6q9a2ke0hc9j6z6wlxg5z5kqpu2v9wz";

describe("bolt11 decoder against BOLT 11 spec vectors", () => {
  it("decodes the any-amount donation invoice and recovers the payee key", () => {
    const d = decodeInvoice(V1);
    expect(d.network).toBe("mainnet");
    expect(d.amountMsat).toBeNull();
    expect(d.timestamp).toBe(1496314658);
    expect(d.paymentHash).toBe("0001020304050607080900010203040506070809000102030405060708090102");
    expect(d.paymentSecret).toBe("11".repeat(32));
    expect(d.payeePubkey).toBe(PAYEE);
    expect(d.description).toBe("Please consider supporting this project");
  });
  it("decodes 2500u as exactly 250,000,000 msat with 60s expiry", () => {
    const d = decodeInvoice(V2);
    expect(d.amountMsat).toBe(250_000_000n);
    expect(d.expirySeconds).toBe(60);
    expect(d.payeePubkey).toBe(PAYEE);
  });
  it("detects testnet and 20m = 2,000,000,000 msat", () => {
    const d = decodeInvoice(V_TESTNET_20M);
    expect(d.network).toBe("testnet");
    expect(d.amountMsat).toBe(2_000_000_000n);
    expect(d.payeePubkey).toBe(PAYEE);
  });
  it("handles pico amounts without losing precision (9678785340p = 967,878,534 msat)", () => {
    const d = decodeInvoice(V_PICO);
    expect(d.amountMsat).toBe(967_878_534n);
  });
  it("rejects a single flipped character (bech32 checksum)", () => {
    const bad = V2.slice(0, 40) + (V2[40] === "q" ? "p" : "q") + V2.slice(41);
    expect(() => decodeInvoice(bad)).toThrow(Bolt11Error);
  });
  it("rejects mixed case and non-invoices", () => {
    expect(() => decodeInvoice("LNBC" + V2.slice(4))).toThrow(Bolt11Error);
    expect(() => decodeInvoice("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toThrow(Bolt11Error);
  });
});

import { encodeInvoice, nodePubkeyFromPrivate } from "../src/bolt11-encode";
import { sha256Hex } from "../src/crypto";

describe("bolt11 encoder round-trips through the independent decoder", () => {
  const priv = "e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734";
  it("reproduces the spec payee key and round-trips fields", () => {
    expect(nodePubkeyFromPrivate(priv)).toBe(PAYEE);
    const preimage = "07".repeat(32);
    const inv = encodeInvoice({
      network: "regtest", amountMsat: 123_456n, paymentHashHex: sha256Hex(Buffer.from(preimage, "hex")),
      paymentSecretHex: "11".repeat(32), description: "invoice #42 — café", timestamp: 1_800_000_000, expirySeconds: 600, privateKeyHex: priv,
    });
    const d = decodeInvoice(inv);
    expect(d).toMatchObject({ network: "regtest", amountMsat: 123_456n, timestamp: 1_800_000_000, expirySeconds: 600, payeePubkey: PAYEE });
    expect(d.description).toBe("invoice #42 — café");
    expect(d.paymentHash).toBe(sha256Hex(Buffer.from(preimage, "hex")));
  });
  it("encodes amounts exactly across units", () => {
    for (const amt of [1n, 10n, 1000n, 1_000_000n, 123_456_789n, 100_000_000_000n, 2_100_000_000_000_000_000n]) {
      const d = decodeInvoice(encodeInvoice({ network: "regtest", amountMsat: amt, paymentHashHex: "ab".repeat(32), timestamp: 1_800_000_000, privateKeyHex: priv }));
      expect(d.amountMsat).toBe(amt);
    }
    expect(decodeInvoice(encodeInvoice({ network: "mainnet", amountMsat: null, paymentHashHex: "ab".repeat(32), timestamp: 1_800_000_000, privateKeyHex: priv })).amountMsat).toBeNull();
  });
});
