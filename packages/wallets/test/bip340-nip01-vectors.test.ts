/**
 * SPEC TEST VECTORS: BIP-340 official test vectors (bitcoin/bips bip-0340/test-vectors.csv) exercised through the exact
 * schnorrSign / schnorrVerify wrappers the adapter uses, plus the signed NIP-47 info event printed in the NIP-47 appendix.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  computeEventId, getPublicKeyHex, isExpired, isValidXOnlyPubkey, parseEventShape, schnorrSign, schnorrVerify, serializeEvent, signEvent, verifyEventSignature,
} from "../src/nwc/nostr";

const rows = readFileSync(new URL("./fixtures/bip340-test-vectors.csv", import.meta.url), "utf8").trim().split("\n").slice(1).map((l) => l.split(","));

describe("BIP-340 official vectors (spec vectors)", () => {
  it("has the 19 published vectors", () => expect(rows).toHaveLength(19));

  for (const [index, secret, pub, aux, msg, sig, result, comment] of rows as string[][]) {
    if (secret) {
      it(`vector ${index}: public key derivation and signing reproduce the published signature (${comment || "no comment"})`, () => {
        expect(getPublicKeyHex(hexToBytes(secret))).toBe((pub as string).toLowerCase());
        const produced = schnorrSign(hexToBytes(msg as string), hexToBytes(secret), hexToBytes(aux as string));
        expect(bytesToHex(produced)).toBe((sig as string).toLowerCase());
      });
    }
    it(`vector ${index}: verification result is ${result} (${comment || "no comment"})`, () => {
      const expected = result === "TRUE";
      let got: boolean;
      try {
        got = schnorrVerify(hexToBytes(sig as string), hexToBytes(msg as string), hexToBytes(pub as string));
      } catch {
        got = false;
      }
      expect(got).toBe(expected);
    });
  }
});

describe("NIP-01 / NIP-47 event handling (spec example)", () => {
  // The info event printed in the NIP-47 appendix (id and sig are as published in the NIP).
  const spec = {
    id: "df467db0a9f9ec77ffe6f561811714ccaa2e26051c20f58f33c3d66d6c2b4d1c",
    pubkey: "c04ccd5c82fc1ea3499b9c6a5c0a7ab627fbe00a0116110d4c750faeaecba1e2",
    created_at: 1713883677,
    kind: 13194,
    tags: [["encryption", "nip44_v2 nip04"], ["extensions", "02 03 04 06 07 08"]],
    content: "pay_invoice get_balance get_info make_invoice lookup_invoice",
    sig: "31f57b369459b5306a5353aa9e03be7fbde169bc881c3233625605dd12f53548179def16b9fe1137e6465d7e4d5bb27ce81fd6e75908c46b06269f4233c845d8",
  };

  it("SPEC FINDING: the NIP-47 appendix example is not self-consistent — its body does not hash to its printed id", () => {
    // The (id, pubkey, sig) triple is a genuine BIP-340 signature...
    expect(schnorrVerify(hexToBytes(spec.sig), hexToBytes(spec.id), hexToBytes(spec.pubkey))).toBe(true);
    expect(isValidXOnlyPubkey(spec.pubkey)).toBe(true);
    expect(parseEventShape(spec)).not.toBeNull();
    // ...but the printed tags/content were edited for the document, so the NIP-01 id of the printed body differs.
    // The adapter correctly refuses such an event (id must be recomputed, never trusted).
    expect(computeEventId(spec)).not.toBe(spec.id);
    expect(verifyEventSignature(spec)).toBe(false);
  });

  it("any single-field tamper breaks verification of a correctly signed event", () => {
    const sk = hexToBytes("71a8c14c1407c113601079c4302dab36460f0ccd0ad506f1f2dc73b5100e4f3c");
    const good = signEvent({ pubkey: getPublicKeyHex(sk), created_at: 1713883677, kind: 13194, tags: [["encryption", "nip44_v2 nip04"]], content: "pay_invoice get_info" }, sk);
    expect(verifyEventSignature(good)).toBe(true);
    expect(verifyEventSignature({ ...good, content: `${good.content} x` })).toBe(false);
    expect(verifyEventSignature({ ...good, created_at: good.created_at + 1 })).toBe(false);
    expect(verifyEventSignature({ ...good, tags: [] })).toBe(false);
    expect(verifyEventSignature({ ...good, sig: good.sig.replace(/.$/, good.sig.endsWith("9") ? "8" : "9") })).toBe(false);
    expect(verifyEventSignature({ ...good, id: "00".repeat(32) })).toBe(false);
  });

  it("serialization is compact and escapes per NIP-01", () => {
    expect(serializeEvent({ pubkey: "ab".repeat(32), created_at: 1, kind: 1, tags: [["t", "x"]], content: 'a"b\\c\nd' })).toBe(`[0,"${"ab".repeat(32)}",1,1,[["t","x"]],"a\\"b\\\\c\\nd"]`);
  });

  it("sign/verify round trip with a fresh key", () => {
    const sk = hexToBytes("71a8c14c1407c113601079c4302dab36460f0ccd0ad506f1f2dc73b5100e4f3c");
    const ev = signEvent({ pubkey: getPublicKeyHex(sk), created_at: 1700000000, kind: 23194, tags: [], content: "x" }, sk);
    expect(verifyEventSignature(ev)).toBe(true);
  });

  it("shape validation rejects non-NIP-01 values", () => {
    for (const bad of [null, [], "x", { ...spec, id: "XYZ" }, { ...spec, sig: "00" }, { ...spec, kind: 70000 }, { ...spec, created_at: 1.5 }, { ...spec, tags: [[1]] }, { ...spec, tags: [[]] }, { ...spec, content: 5 }]) {
      expect(parseEventShape(bad)).toBeNull();
    }
  });

  it("NIP-40 expiration", () => {
    expect(isExpired({ tags: [["expiration", "100"]] }, 100)).toBe(true);
    expect(isExpired({ tags: [["expiration", "101"]] }, 100)).toBe(false);
    expect(isExpired({ tags: [["expiration", "abc"]] }, 100)).toBe(false);
    expect(isExpired({ tags: [] }, 100)).toBe(false);
  });
});
