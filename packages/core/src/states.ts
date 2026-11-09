/**
 * Obligation lifecycle. The single authoritative state lives on the obligation row; payment facts
 * (provider status, preimage, fees) live on attempts. Transitions are validated here AND by a
 * compare-and-set UPDATE in the database, so a stale writer can never move an obligation backwards.
 */
export const STATES = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "EXECUTION_RESERVED",
  "DISPATCHING",
  "PENDING",
  "UNKNOWN",
  "RECONCILING",
  "SETTLED",
  "SIMULATED_SETTLED",
  "DEFINITIVELY_FAILED",
  "REJECTED",
  "CANCELLED",
] as const;
export type State = (typeof STATES)[number];

const T: Record<State, readonly State[]> = {
  DRAFT: ["AWAITING_APPROVAL", "CANCELLED"],
  AWAITING_APPROVAL: ["APPROVED", "REJECTED", "DRAFT", "CANCELLED"],
  APPROVED: ["EXECUTION_RESERVED", "AWAITING_APPROVAL", "DRAFT", "CANCELLED"],
  // released_before_dispatch is only legal because DISPATCHING is entered by CAS *before* any provider call
  EXECUTION_RESERVED: ["DISPATCHING", "APPROVED"],
  DISPATCHING: ["PENDING", "SETTLED", "SIMULATED_SETTLED", "DEFINITIVELY_FAILED", "UNKNOWN"],
  PENDING: ["SETTLED", "SIMULATED_SETTLED", "DEFINITIVELY_FAILED", "UNKNOWN"],
  // No blind retry: UNKNOWN can only go to RECONCILING.
  UNKNOWN: ["RECONCILING"],
  RECONCILING: ["SETTLED", "SIMULATED_SETTLED", "DEFINITIVELY_FAILED", "PENDING", "UNKNOWN"],
  SETTLED: [],
  SIMULATED_SETTLED: [],
  // A *proven* failure may be retried (new attempt), revised (new revision) or abandoned.
  DEFINITIVELY_FAILED: ["EXECUTION_RESERVED", "DRAFT", "CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
};

export const TERMINAL: readonly State[] = ["SETTLED", "SIMULATED_SETTLED", "REJECTED", "CANCELLED"];
/** States in which money may have left, or may still leave, the payer wallet. */
export const MONEY_MAY_HAVE_MOVED: readonly State[] = [
  "DISPATCHING",
  "PENDING",
  "UNKNOWN",
  "RECONCILING",
  "SETTLED",
  "SIMULATED_SETTLED",
];
/** States where a human must not trigger a second irreversible send. */
export const SEND_FORBIDDEN: readonly State[] = [...MONEY_MAY_HAVE_MOVED, "EXECUTION_RESERVED"];
export const NEEDS_RECONCILIATION: readonly State[] = ["DISPATCHING", "PENDING", "UNKNOWN", "RECONCILING"];

export class TransitionError extends Error {
  constructor(
    public readonly from: State,
    public readonly to: State,
    message: string,
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

export function canTransition(from: State, to: State): boolean {
  return T[from].includes(to);
}

export interface TransitionEvidence {
  /** provider kind of the attempt that produced this transition (if any) */
  providerKind?: "lnd" | "nwc" | "simulator";
  /** hex preimage returned by provider; required to settle */
  preimageVerified?: boolean;
  /** provider reported a terminal failure (not merely a timeout or expiry) */
  providerReportedTerminalFailure?: boolean;
  /** the request provably never reached the wallet (e.g. TCP connection refused before any byte was written) */
  notSentProven?: boolean;
  /** an authorised human confirmed non-dispatch after a fresh NOT_FOUND lookup and invoice expiry */
  operatorConfirmedNotSent?: boolean;
}

/** Throws unless `from -> to` is a legal, evidence-backed transition. */
export function assertTransition(from: State, to: State, ev: TransitionEvidence = {}): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to, `illegal transition ${from} -> ${to}`);
  if (to === "SETTLED") {
    if (ev.providerKind === "simulator") throw new TransitionError(from, to, "a simulator can never produce SETTLED");
    if (!ev.preimageVerified) throw new TransitionError(from, to, "SETTLED requires a verified payment preimage");
  }
  if (to === "SIMULATED_SETTLED" && ev.providerKind !== "simulator") {
    throw new TransitionError(from, to, "SIMULATED_SETTLED is reserved for the simulator provider");
  }
  if (to === "DEFINITIVELY_FAILED" && !(ev.providerReportedTerminalFailure || ev.notSentProven || ev.operatorConfirmedNotSent)) {
    throw new TransitionError(from, to, "DEFINITIVELY_FAILED requires provider-reported failure or proof the request was never sent");
  }
}

export interface ActionAvailability {
  action: "edit" | "submit" | "approve" | "reject" | "execute" | "reconcile" | "retry" | "cancel" | "confirm_not_sent" | "receipt";
  allowed: boolean;
  /** Plain-language reason shown to the operator when `allowed` is false. */
  reason?: string;
}

/** What may a person do right now, by state alone (role checks are layered on separately). */
export function stateActions(state: State): ActionAvailability[] {
  const a = (action: ActionAvailability["action"], allowed: boolean, reason?: string): ActionAvailability =>
    allowed ? { action, allowed } : { action, allowed, reason };
  const sent = (MONEY_MAY_HAVE_MOVED as readonly string[]).includes(state);
  return [
    a("edit", state === "DRAFT" || state === "AWAITING_APPROVAL" || state === "APPROVED" || state === "DEFINITIVELY_FAILED",
      sent ? "This payment may already have been sent, so its terms are frozen." : "Terms are frozen in this state."),
    a("submit", state === "DRAFT", "Only a draft can be submitted for approval."),
    a("approve", state === "AWAITING_APPROVAL", "Nothing is waiting for approval."),
    a("reject", state === "AWAITING_APPROVAL", "Only a payment awaiting approval can be rejected."),
    a(
      "execute",
      state === "APPROVED",
      state === "UNKNOWN" || state === "RECONCILING" || state === "PENDING" || state === "DISPATCHING"
        ? "Sending again is blocked: the first attempt may already have paid. Orynt must check the wallet's own record first."
        : state === "SETTLED" || state === "SIMULATED_SETTLED"
          ? "This payment has already been settled."
          : "The payment needs a current approval before it can be sent.",
    ),
    a(
      "reconcile",
      NEEDS_RECONCILIATION.includes(state),
      "There is nothing to reconcile in this state.",
    ),
    a(
      "retry",
      state === "DEFINITIVELY_FAILED",
      NEEDS_RECONCILIATION.includes(state)
        ? "Retry is blocked until the wallet's record proves the earlier attempt failed."
        : "Only a payment with a proven failure can be retried.",
    ),
    a(
      "cancel",
      state === "DRAFT" || state === "AWAITING_APPROVAL" || state === "APPROVED" || state === "DEFINITIVELY_FAILED",
      sent ? "Cancelling is not possible once a payment may have been sent. A refund would be a separate payment." : "Not cancellable.",
    ),
    a("confirm_not_sent", state === "UNKNOWN" || state === "RECONCILING", "Only an unresolved payment can be confirmed as not sent."),
    a("receipt", state === "SETTLED" || state === "SIMULATED_SETTLED", "A receipt exists only for a settled payment."),
  ];
}
