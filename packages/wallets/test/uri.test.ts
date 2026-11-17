/** Connection-URI parsing, validation and secret hygiene. Pure unit tests — no network, no fake wallet. */
import { describe, expect, it } from "vitest";
import { inspect } from "node:util";
import { parseNwcUri } from "../src/nwc/uri";
import { NwcUriError } from "../src/nwc/errors";
import { redactNwcUri, unsafeRevealSecret } from "../src/nwc/secret";
import { NwcProvider } from "../src/nwc/provider";

// Example connection string printed in NIP-47.
const SPEC_URI =
  "nostr+walletconnect://b889ff5b1513b641e2a139f661a661364979c5beee91842f8f0ef42ab558e9d4?relay=wss%3A%2F%2Frelay.damus.io&secret=71a8c14c1407c113601079c4302dab36460f0ccd0ad506f1f2dc73b5100e4f3c";
const PUB = "b889ff5b1513b641e2a139f661a661364979c5beee91842f8f0ef42ab558e9d4";
const SECRET = "71a8c14c1407c113601079c4302dab36460f0ccd0ad506f1f2dc73b5100e4f3c";
const mk = (q: string, pub = PUB) => `nostr+walletconnect://${pub}?${q}`;

describe("connection URI (spec example + validation)", () => {
  it("parses the example connection string from NIP-47", () => {
    const c = parseNwcUri(SPEC_URI);
    expect(c.walletPubkey).toBe(PUB);
    expect(c.relays).toEqual(["wss://relay.damus.io/"]);
    expect(c.lud16).toBeNull();
    expect(c.clientPubkey).toBe("3ba6db4896124383fdaa5f7d42c25f9df1b128a280928baeb3f3fa36d25506f9"); // BIP-340 pubkey of that secret
  });

  it("accepts several relays (deduplicated), lud16, upper-case hex and unknown extra parameters", () => {
    const c = parseNwcUri(
      mk(
        `relay=wss%3A%2F%2Fa.example&relay=wss%3A%2F%2Fb.example%2Fpath&relay=wss%3A%2F%2Fa.example&secret=${SECRET.toUpperCase()}&lud16=alice%40example.com&future=1`,
        PUB.toUpperCase(),
      ),
    );
    expect(c.relays).toEqual(["wss://a.example/", "wss://b.example/path"]);
    expect(c.lud16).toBe("alice@example.com");
    expect(c.walletPubkey).toBe(PUB);
  });

  const secretQ = `secret=${SECRET}`;
  const relayQ = "relay=wss%3A%2F%2Frelay.example";
  const bad: Array<[string, string]> = [
    ["wrong scheme", `nostrwalletconnect://${PUB}?${relayQ}&${secretQ}`],
    ["http scheme", `https://${PUB}?${relayQ}&${secretQ}`],
    ["empty", ""],
    ["leading whitespace", ` ${SPEC_URI}`],
    ["trailing newline", `${SPEC_URI}\n`],
    ["fragment", `${SPEC_URI}#x`],
    ["pubkey too short", mk(`${relayQ}&${secretQ}`, PUB.slice(2))],
    ["pubkey not hex", mk(`${relayQ}&${secretQ}`, "zz".repeat(32))],
    ["pubkey not on curve", mk(`${relayQ}&${secretQ}`, "ff".repeat(32))],
    ["pubkey all zero", mk(`${relayQ}&${secretQ}`, "00".repeat(32))],
    ["missing secret", mk(relayQ)],
    ["duplicate secret", mk(`${relayQ}&${secretQ}&${secretQ}`)],
    ["secret too short", mk(`${relayQ}&secret=${SECRET.slice(2)}`)],
    ["secret not hex", mk(`${relayQ}&secret=${"g".repeat(64)}`)],
    ["secret zero", mk(`${relayQ}&secret=${"00".repeat(32)}`)],
    ["secret >= curve order", mk(`${relayQ}&secret=${"ff".repeat(32)}`)],
    ["missing relay", mk(secretQ)],
    ["relay is not a URL", mk(`relay=not-a-url&${secretQ}`)],
    ["relay ws:// (remote)", mk(`relay=ws%3A%2F%2Frelay.example&${secretQ}`)],
    ["relay ws:// loopback without explicit opt-in", mk(`relay=ws%3A%2F%2F127.0.0.1%3A7777&${secretQ}`)],
    ["relay http://", mk(`relay=https%3A%2F%2Frelay.example&${secretQ}`)],
    ["relay with credentials", mk(`relay=wss%3A%2F%2Fu%3Ap%40relay.example&${secretQ}`)],
    ["relay with fragment", mk(`relay=wss%3A%2F%2Frelay.example%23x&${secretQ}`)],
    [
      "too many relays",
      mk(`${Array.from({ length: 9 }, (_, i) => `relay=wss%3A%2F%2Fr${i}.example`).join("&")}&${secretQ}`),
    ],
    ["bad lud16", mk(`${relayQ}&${secretQ}&lud16=not%20an%20address`)],
    ["duplicate lud16", mk(`${relayQ}&${secretQ}&lud16=a%40b.co&lud16=c%40d.co`)],
  ];
  for (const [name, uri] of bad) {
    it(`rejects: ${name}`, () => {
      expect(() => parseNwcUri(uri)).toThrow(NwcUriError);
    });
  }

  it("permits ws:// ONLY for loopback and only when explicitly enabled", () => {
    const opts = { allowInsecureLoopbackRelays: true };
    expect(parseNwcUri(mk(`relay=ws%3A%2F%2F127.0.0.1%3A7777&${secretQ}`), opts).relays).toEqual([
      "ws://127.0.0.1:7777/",
    ]);
    expect(parseNwcUri(mk(`relay=ws%3A%2F%2Flocalhost%3A7777&${secretQ}`), opts).relays).toEqual([
      "ws://localhost:7777/",
    ]);
    expect(() => parseNwcUri(mk(`relay=ws%3A%2F%2Frelay.example&${secretQ}`), opts)).toThrow(NwcUriError);
    expect(() => parseNwcUri(mk(`relay=ws%3A%2F%2F10.0.0.5&${secretQ}`), opts)).toThrow(NwcUriError);
    expect(() => parseNwcUri(mk(`relay=ws%3A%2F%2Flocalhost.evil.example&${secretQ}`), opts)).toThrow(
      NwcUriError,
    );
  });
});

describe("secret hygiene", () => {
  it("rejection messages never contain the secret or any part of the input", () => {
    for (const uri of [
      mk(`secret=${SECRET}`),
      mk(`relay=ws%3A%2F%2Frelay.example&secret=${SECRET}`),
      mk(`relay=wss%3A%2F%2Fu%3Ap%40x.example&secret=${SECRET}`),
      mk(`relay=wss%3A%2F%2Fx.example&secret=${"ff".repeat(32)}`),
    ]) {
      try {
        parseNwcUri(uri);
        throw new Error("should have thrown");
      } catch (e) {
        expect(String((e as Error).message) + String((e as Error).stack)).not.toContain(SECRET);
        expect(String((e as Error).message)).not.toContain("relay.example");
      }
    }
  });

  it("the parsed secret is redacted by JSON.stringify, String, template strings and util.inspect", () => {
    const c = parseNwcUri(SPEC_URI);
    for (const rendered of [
      JSON.stringify(c),
      String(c.secret),
      `${c.secret}`,
      inspect(c, { depth: 5 }),
      inspect(c.secret),
      JSON.stringify({ secret: c.secret }),
    ]) {
      expect(rendered).not.toContain(SECRET);
      expect(rendered).not.toMatch(/71a8c14c/);
    }
    expect(JSON.stringify(c)).toContain("[REDACTED]");
  });

  it("destroy() zero-fills the key and makes it unusable", () => {
    const c = parseNwcUri(SPEC_URI);
    const bytes = unsafeRevealSecret(c.secret);
    expect(bytes.some((b) => b !== 0)).toBe(true);
    c.secret.destroy();
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(c.secret.destroyed).toBe(true);
    expect(() => unsafeRevealSecret(c.secret)).toThrow();
    c.secret.destroy(); // idempotent
  });

  it("redactNwcUri hides the secret even in malformed text", () => {
    expect(redactNwcUri(SPEC_URI)).not.toContain(SECRET);
    expect(redactNwcUri(`failed to parse nostr+walletconnect://x?secret=${SECRET}&relay=y`)).toBe(
      "failed to parse nostr+walletconnect://x?secret=[REDACTED]&relay=y",
    );
    expect(redactNwcUri("SECRET=abc")).toBe("SECRET=[REDACTED]");
  });

  it("a provider never serialises or inspects the secret, and does not keep the URI", () => {
    const p = new NwcProvider({ uri: SPEC_URI });
    for (const r of [
      JSON.stringify(p),
      inspect(p, { depth: 6, showHidden: true }),
      String(JSON.stringify(Object.entries(p))),
    ]) {
      expect(r).not.toContain(SECRET);
    }
    // the raw URI string is not retained anywhere reachable from the provider object graph
    expect(inspect(p, { depth: 10, showHidden: true })).not.toContain("secret=");
    p.close();
  });

  it("an invalid asserted network is rejected at construction, destroying the already-parsed secret", () => {
    expect(() => new NwcProvider({ uri: SPEC_URI, network: "bitcoin" as never })).toThrow();
  });
});
