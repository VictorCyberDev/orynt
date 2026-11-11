/**
 * SPEC TEST VECTORS (not a fake): the official NIP-44 v2 vectors from https://github.com/paulmillr/nip44 (nip44.vectors.json).
 * The fixture's SHA-256 is pinned to the checksum published inside NIP-44 itself, so a tampered or stale copy fails loudly.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createCipheriv, createDecipheriv } from "node:crypto";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  nip04Decrypt, nip04Encrypt, nip44CalcPaddedLen, nip44ConversationKey, nip44Decrypt, nip44Encrypt, nip44MessageKeys,
} from "../src/nwc/encryption";

const raw = readFileSync(new URL("./fixtures/nip44.vectors.json", import.meta.url));
const V = JSON.parse(raw.toString("utf8")).v2 as any;
const pubOf = (sec: string) => bytesToHex(secp256k1.getPublicKey(hexToBytes(sec), true).slice(1));
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

describe("NIP-44 v2 official vectors (spec vectors)", () => {
  it("fixture is byte-identical to the checksum published in NIP-44", () => {
    expect(sha(raw)).toBe("269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040");
  });

  it("valid.get_conversation_key", () => {
    for (const v of V.valid.get_conversation_key) {
      expect(bytesToHex(nip44ConversationKey(hexToBytes(v.sec1), hexToBytes(v.pub2)))).toBe(v.conversation_key);
    }
    expect(V.valid.get_conversation_key.length).toBeGreaterThan(30);
  });

  it("valid.get_message_keys", () => {
    const ck = hexToBytes(V.valid.get_message_keys.conversation_key);
    for (const k of V.valid.get_message_keys.keys) {
      const m = nip44MessageKeys(ck, hexToBytes(k.nonce));
      expect(bytesToHex(m.chachaKey)).toBe(k.chacha_key);
      expect(bytesToHex(m.chachaNonce)).toBe(k.chacha_nonce);
      expect(bytesToHex(m.hmacKey)).toBe(k.hmac_key);
    }
  });

  it("valid.calc_padded_len", () => {
    for (const [len, padded] of V.valid.calc_padded_len) expect(nip44CalcPaddedLen(len)).toBe(padded);
  });

  it("valid.encrypt_decrypt: both directions derive the same key, payload matches byte for byte, and decrypts", () => {
    for (const v of V.valid.encrypt_decrypt) {
      const k1 = nip44ConversationKey(hexToBytes(v.sec1), hexToBytes(pubOf(v.sec2)));
      const k2 = nip44ConversationKey(hexToBytes(v.sec2), hexToBytes(pubOf(v.sec1)));
      expect(bytesToHex(k1)).toBe(v.conversation_key);
      expect(bytesToHex(k2)).toBe(v.conversation_key);
      expect(nip44Encrypt(v.plaintext, k1, hexToBytes(v.nonce))).toBe(v.payload);
      expect(nip44Decrypt(v.payload, k2)).toBe(v.plaintext);
    }
  });

  it("valid.encrypt_decrypt_long_msg (checksummed)", () => {
    for (const v of V.valid.encrypt_decrypt_long_msg) {
      const ck = hexToBytes(v.conversation_key);
      const plaintext = (v.pattern as string).repeat(v.repeat);
      expect(sha(plaintext)).toBe(v.plaintext_sha256);
      const payload = nip44Encrypt(plaintext, ck, hexToBytes(v.nonce));
      expect(sha(payload)).toBe(v.payload_sha256);
      expect(nip44Decrypt(payload, ck)).toBe(plaintext);
    }
  });

  it("extended length prefix vectors published in NIP-44 (65535 / 65536 / 65537 bytes)", () => {
    const ck = hexToBytes("c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d");
    const nonce = hexToBytes("0000000000000000000000000000000000000000000000000000000000000001");
    const table: Array<[number, string, string]> = [
      [65535, "6e1bebca6a8229364a162a72ef064826c4cd7457bf54f190ef782bd9deff3e42", "6d8c2810d1e870fbaa1f0a0937126cca837a15f9260e27060c331d70a3c0bc84"],
      [65536, "bf718b6f653bebc184e1479f1935b8da974d701b893afcf49e701f3e2f9f9c5a", "b7b4edb36ba92e267d322d56d9aebc22e7fa96ff52e3c12adc07f07a43cbc616"],
      [65537, "008ffc88d3c96a9f307524eb361e47c5222a887fc45fa0c1fb8d429c5c23b430", "eeb7c7c5373894ea2c1547cfd3ccb15d5a0b2d619da852e5c79df792dcc9e435"],
    ];
    for (const [len, plainSha, payloadSha] of table) {
      const plaintext = "a".repeat(len);
      expect(sha(plaintext)).toBe(plainSha);
      const payload = nip44Encrypt(plaintext, ck, nonce);
      expect(sha(payload)).toBe(payloadSha);
      expect(nip44Decrypt(payload, ck)).toBe(plaintext);
    }
  });

  it("invalid.encrypt_msg_lengths: 0 is rejected (65536 and 100000 are listed by the vector file but superseded by the NIP text, see below)", () => {
    const ck = hexToBytes("c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d");
    // SPEC INCONSISTENCY found while writing this test: the checksum-pinned nip44.vectors.json still lists 65536 and 100000 as
    // invalid plaintext lengths (the old 16-bit-only format), while the current NIP-44 text defines a 6-byte extended prefix and
    // publishes checksummed vectors that REQUIRE 65536/65537-byte plaintexts to encrypt (asserted in the previous test).
    // We follow the NIP text. NWC messages are far below 64 KiB, so this never matters on the wire.
    expect(V.invalid.encrypt_msg_lengths).toEqual(expect.arrayContaining([0, 65536, 100000]));
    expect(() => nip44Encrypt("", ck)).toThrow();
    expect(nip44Decrypt(nip44Encrypt("a".repeat(65536), ck), ck)).toHaveLength(65536);
  });

  it("invalid.get_conversation_key throws", () => {
    for (const v of V.invalid.get_conversation_key) {
      expect(() => nip44ConversationKey(hexToBytes(v.sec1), hexToBytes(v.pub2)), v.note).toThrow();
    }
  });

  it("invalid.decrypt throws", () => {
    for (const v of V.invalid.decrypt) {
      expect(() => nip44Decrypt(v.payload, hexToBytes(v.conversation_key)), v.note).toThrow();
    }
  });
});

describe("NIP-04 (legacy) — no official vectors exist, so: round trip + independent cross-check with node:crypto", () => {
  const a = hexToBytes("0000000000000000000000000000000000000000000000000000000000000001");
  const b = hexToBytes("0000000000000000000000000000000000000000000000000000000000000002");
  const aPub = hexToBytes(pubOf(bytesToHex(a)));
  const bPub = hexToBytes(pubOf(bytesToHex(b)));

  it("round trips both ways", () => {
    const ct = nip04Encrypt('{"method":"pay_invoice"}', a, bPub);
    expect(ct).toMatch(/^[A-Za-z0-9+/]+=*\?iv=[A-Za-z0-9+/]+=*$/);
    expect(nip04Decrypt(ct, b, aPub)).toBe('{"method":"pay_invoice"}');
  });

  it("matches an independent AES-256-CBC implementation keyed with the unhashed ECDH x-coordinate", () => {
    const x = secp256k1.getSharedSecret(a, new Uint8Array([2, ...bPub])).slice(1, 33);
    const iv = new Uint8Array(16).fill(7);
    const c = createCipheriv("aes-256-cbc", x, iv);
    const expected = `${Buffer.concat([c.update("hello nip04", "utf8"), c.final()]).toString("base64")}?iv=${Buffer.from(iv).toString("base64")}`;
    expect(nip04Encrypt("hello nip04", a, bPub, iv)).toBe(expected);
    const [ctB64, ivB64] = expected.split("?iv=") as [string, string];
    const d = createDecipheriv("aes-256-cbc", x, Buffer.from(ivB64, "base64"));
    expect(Buffer.concat([d.update(Buffer.from(ctB64, "base64")), d.final()]).toString("utf8")).toBe("hello nip04");
  });

  it("rejects malformed payloads and the wrong key", () => {
    const ct = nip04Encrypt("secret", a, bPub);
    expect(() => nip04Decrypt("not-a-payload", b, aPub)).toThrow();
    expect(() => nip04Decrypt(ct.replace("?iv=", "?iv=AA"), b, aPub)).toThrow();
    const wrong = hexToBytes("0000000000000000000000000000000000000000000000000000000000000003");
    expect(() => nip04Decrypt(ct, wrong, aPub)).toThrow();
  });
});
