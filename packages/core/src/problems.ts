/** RFC 7807-style problem types used by the API; shared so SDK/UI can switch on `code`. */
export const PROBLEM_CODES = [
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_conflict",
  "rate_limited",
  "invalid_state",
  "policy_violation",
  "invoice_invalid",
  "invoice_expired",
  "network_mismatch",
  "amount_mismatch",
  "destination_mismatch",
  "approval_invalid",
  "approval_stale",
  "approval_insufficient",
  "wallet_unavailable",
  "wallet_insufficient_permissions",
  "mainnet_disabled",
  "send_blocked_unresolved",
  "internal",
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  instance?: string;
  request_id?: string;
  errors?: Array<{ path: string; message: string }>;
}

export class OryntError extends Error {
  constructor(
    public readonly code: ProblemCode,
    public readonly status: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OryntError";
  }
}
