import { NotSentError } from "../types";

/** The connection URI was rejected. The message never contains the offending input (it may hold a secret). */
export class NwcUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NwcUriError";
  }
}

export type NwcNotSentReason =
  | "adapter_closed"
  | "invalid_request"
  | "relay_unreachable"
  | "relay_rejected"
  | "wallet_info_unavailable"
  | "method_not_advertised"
  | "encryption_unsupported"
  | "network_refused"
  | "fee_limit_not_enforceable"
  | "wallet_rejected";

/**
 * Provably never executed by the wallet. Extends the contract's NotSentError so `instanceof NotSentError` holds, and adds
 * a machine-readable reason (and, for explicit wallet refusals, the NIP-47 error code).
 */
export class NwcNotSentError extends NotSentError {
  constructor(message: string, public readonly reason: NwcNotSentReason, public readonly walletCode?: string) {
    super(message);
    this.name = "NwcNotSentError";
  }
}

/** The network of the wallet could not be established (and was not asserted by the owner), or contradicts the assertion. */
export class NwcNetworkError extends Error {
  constructor(message: string, public readonly kind: "unverified" | "mismatch" | "mainnet_not_allowed") {
    super(message);
    this.name = "NwcNetworkError";
  }
}

/** No relay could be reached / none answered. Whether this means "not sent" depends on the caller's phase. */
export class NwcRelayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NwcRelayUnavailableError";
  }
}

/** A NIP-47 error object returned by the wallet service (authenticated). Internal carrier; mapped by the provider. */
export class NwcWalletError extends Error {
  constructor(public readonly code: string, public readonly walletMessage: string, public readonly method: string) {
    super(`wallet service returned ${code} for ${method}`);
    this.name = "NwcWalletError";
  }
}

/** Strip control characters and cap length of free text that came from a remote party before it is surfaced. */
export function sanitizeRemoteText(s: unknown, max = 200): string {
  const t = typeof s === "string" ? s : "";
  // eslint-disable-next-line no-control-regex
  return t.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}
