/**
 * NIP-47 connection URI parsing: nostr+walletconnect://<wallet-service-pubkey>?relay=<wss-url>[&relay=...]&secret=<hex>[&lud16=...]
 * Strict by design: anything malformed is rejected. Error messages never echo the input (it contains a secret).
 */
import { hexToBytes } from "@noble/hashes/utils.js";
import { NwcUriError } from "./errors";
import { getPublicKeyHex, isHex64, isValidSecretKey, isValidXOnlyPubkey } from "./nostr";
import { RedactedSecret } from "./secret";

export const NWC_URI_SCHEME = "nostr+walletconnect://";
export const MAX_RELAYS = 8;
export const MAX_URI_LENGTH = 4096;

export interface ParseNwcUriOptions {
  /** Permit ws:// relays, but ONLY on loopback hosts (127.0.0.0/8, ::1, localhost). Intended for tests / local relays. */
  allowInsecureLoopbackRelays?: boolean;
}

export interface NwcConnection {
  /** 32-byte x-only public key of the wallet service (lowercase hex) */
  walletPubkey: string;
  /** public key derived from the client secret (lowercase hex); this is the identity the wallet service knows */
  clientPubkey: string;
  relays: string[];
  lud16: string | null;
  /** the client's signing/encryption key; redacted in every serialization */
  secret: RedactedSecret;
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || /^127(?:\.\d{1,3}){3}$/.test(h);
}

function normalizeRelay(raw: string, opts: ParseNwcUriOptions): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new NwcUriError("relay parameter is not a valid URL");
  }
  if (u.username || u.password) throw new NwcUriError("relay URL must not contain credentials");
  if (u.hash) throw new NwcUriError("relay URL must not contain a fragment");
  if (!u.hostname) throw new NwcUriError("relay URL has no host");
  if (u.protocol === "wss:") return u.href;
  if (u.protocol === "ws:") {
    if (opts.allowInsecureLoopbackRelays && isLoopbackHost(u.hostname)) return u.href;
    throw new NwcUriError("relay must use wss:// (ws:// is only allowed for loopback hosts when explicitly enabled)");
  }
  throw new NwcUriError("relay must use the wss:// scheme");
}

export function parseNwcUri(uri: string, opts: ParseNwcUriOptions = {}): NwcConnection {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > MAX_URI_LENGTH) throw new NwcUriError("connection URI is empty or too long");
  if (uri.trim() !== uri) throw new NwcUriError("connection URI has leading or trailing whitespace");
  if (uri.slice(0, NWC_URI_SCHEME.length).toLowerCase() !== NWC_URI_SCHEME) throw new NwcUriError("connection URI must start with nostr+walletconnect://");
  const rest = uri.slice(NWC_URI_SCHEME.length);
  if (rest.includes("#")) throw new NwcUriError("connection URI must not contain a fragment");
  const q = rest.indexOf("?");
  const authority = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? "" : rest.slice(q + 1);

  const walletPubkey = authority.toLowerCase();
  if (!isHex64(walletPubkey)) throw new NwcUriError("wallet service public key must be 32 bytes of hex");
  if (!isValidXOnlyPubkey(walletPubkey)) throw new NwcUriError("wallet service public key is not a valid secp256k1 point");

  const params = new URLSearchParams(query);
  const secrets = params.getAll("secret");
  if (secrets.length !== 1) throw new NwcUriError(secrets.length === 0 ? "secret parameter is required" : "secret parameter must appear exactly once");
  const secretHex = (secrets[0] as string).toLowerCase();
  if (!isHex64(secretHex)) throw new NwcUriError("secret must be 32 bytes of hex");
  const secretBytes = hexToBytes(secretHex);
  if (!isValidSecretKey(secretBytes)) {
    secretBytes.fill(0);
    throw new NwcUriError("secret is not a valid secp256k1 private key");
  }

  const relayParams = params.getAll("relay");
  if (relayParams.length === 0) {
    secretBytes.fill(0);
    throw new NwcUriError("at least one relay parameter is required");
  }
  const relays: string[] = [];
  try {
    for (const r of relayParams) {
      const n = normalizeRelay(r, opts);
      if (!relays.includes(n)) relays.push(n);
    }
  } catch (e) {
    secretBytes.fill(0);
    throw e;
  }
  if (relays.length > MAX_RELAYS) {
    secretBytes.fill(0);
    throw new NwcUriError(`at most ${MAX_RELAYS} relays are supported`);
  }

  const lud = params.getAll("lud16");
  let lud16: string | null = null;
  if (lud.length > 1) {
    secretBytes.fill(0);
    throw new NwcUriError("lud16 parameter must appear at most once");
  }
  if (lud.length === 1) {
    const v = lud[0] as string;
    if (!/^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}$/.test(v)) {
      secretBytes.fill(0);
      throw new NwcUriError("lud16 is not a valid lightning address");
    }
    lud16 = v;
  }

  return { walletPubkey, clientPubkey: getPublicKeyHex(secretBytes), relays, lud16, secret: new RedactedSecret(secretBytes) };
}
