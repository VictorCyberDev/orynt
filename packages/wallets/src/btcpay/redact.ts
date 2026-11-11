/**
 * Secret redaction for anything that leaves the BTCPay adapter as an error message, note or log line.
 *
 * Remote text is never trusted to be free of credentials: BTCPay's 503 `lightning-node-unavailable` body embeds the
 * .NET exception type and message of the failing node connection, which can name hosts and connection-string
 * fragments. We therefore (1) remove the exact API key, (2) remove anything shaped like an auth header or a
 * credential assignment, (3) remove long hex blobs (macaroons are hundreds of hex characters; payment hashes and
 * preimages are 64 and are deliberately kept), and (4) truncate.
 */
const MAX_LEN = 300;

const SHAPES: RegExp[] = [
  /\b(?:token|bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:macaroon|api[_-]?key|apikey|secret|password|passwd|rune|authorization)\s*[=:]\s*["']?[^\s"'&;,]{4,}/gi,
  /\b[0-9a-f]{80,}\b/gi,
];

export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = String(text);
  for (const s of secrets) {
    if (s.length >= 4) out = out.split(s).join("[REDACTED]");
  }
  for (const re of SHAPES) out = out.replace(re, "[REDACTED]");
  out = Array.from(out, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
    .join("")
    .trim();
  return out.length > MAX_LEN ? `${out.slice(0, MAX_LEN)}...` : out;
}
