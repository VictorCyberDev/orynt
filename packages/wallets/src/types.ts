import type { Network } from "@orynt/core";

export type ProviderKind = "lnd" | "nwc" | "simulator";

export interface WalletInfo {
  kind: ProviderKind;
  network: Network;
  nodePubkey: string | null;
  alias: string | null;
  version: string | null;
  syncedToChain: boolean | null;
}

/** Capabilities are DISCOVERED from the provider, never assumed. Unknown stays unknown. */
export interface Capabilities {
  canSendPayments: boolean | "unknown";
  canLookupPayments: boolean | "unknown";
  canReadInfo: boolean | "unknown";
  /** free-text notes shown to operators, e.g. which macaroon permission is missing */
  notes: string[];
  discoveredAt: string;
}

export type PaymentStatus = "SUCCEEDED" | "FAILED" | "IN_FLIGHT" | "NOT_FOUND";

export interface PaymentRecord {
  status: PaymentStatus;
  paymentHash: string;
  /** hex preimage; present only for SUCCEEDED. The caller MUST still verify sha256(preimage) === paymentHash. */
  preimage?: string;
  amountMsat?: bigint;
  feeMsat?: bigint;
  /** provider's terminal failure reason; present only for FAILED */
  failureReason?: string;
  providerRef?: string;
  settledAt?: string;
  observedAt: string;
}

export interface SendRequest {
  invoice: string;
  paymentHash: string;
  /** exact amount authorised; for zero-amount invoices it is sent explicitly, otherwise it must equal the invoice amount */
  amountMsat: bigint;
  /** true when the invoice carries no amount, so `amountMsat` must be sent explicitly */
  zeroAmountInvoice: boolean;
  feeLimitMsat: bigint;
  timeoutSeconds: number;
}

/** The request provably never reached the wallet (connection refused, TLS/DNS failure, explicit pre-processing rejection). */
export class NotSentError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NotSentError";
  }
}
/** The request may or may not have reached the wallet (timeout, reset, 5xx, cut stream). NEVER treat as failure. */
export class OutcomeUnknownError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OutcomeUnknownError";
  }
}
/** The wallet says a payment for this hash already exists. Reconcile; do not retry. */
export class AlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyExistsError";
  }
}
export class InsufficientPermissionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientPermissionsError";
  }
}

export interface WalletProvider {
  readonly kind: ProviderKind;
  /** true only for providers that move real value on a real network (even regtest) */
  readonly isReal: boolean;
  getInfo(): Promise<WalletInfo>;
  discoverCapabilities(): Promise<Capabilities>;
  sendPayment(req: SendRequest): Promise<PaymentRecord>;
  lookupPayment(paymentHash: string): Promise<PaymentRecord>;
}
