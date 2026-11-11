import { decodeInvoice, sha256Hex, hexToBytes } from "@orynt/core";
import type { Network } from "@orynt/core";
import {
  NotSentError,
  OutcomeUnknownError,
  type Capabilities,
  type PaymentRecord,
  type SendRequest,
  type WalletInfo,
  type WalletProvider,
} from "./types";

/**
 * SIMULATOR — clearly labelled, never real.
 *  - `isReal` is false; core's state machine refuses SETTLED from a simulator (it yields SIMULATED_SETTLED only).
 *  - It only "knows" preimages for invoices registered with it (for tests/demo seed data).
 * Behaviours can be scripted per payment hash to exercise the unhappy paths deterministically.
 */
export type SimBehavior =
  | "succeed"
  | "fail_no_route"
  | "pending_then_succeed" // first lookup: IN_FLIGHT, afterwards SUCCEEDED
  | "accept_then_lose_response" // payment "goes through" but the send call times out (OutcomeUnknown)
  | "not_sent_unreachable"
  | "error_then_no_record" // call fails ambiguously and the wallet never created a record
  | "fail_insufficient" // terminal failure: not enough channel liquidity
  | "succeed_bad_preimage"; // a misbehaving wallet: claims success with a preimage that does not match

export class SimulatorProvider implements WalletProvider {
  readonly kind = "simulator" as const;
  readonly isReal = false;
  private preimages = new Map<string, string>();
  private behaviors = new Map<string, SimBehavior>();
  private records = new Map<string, PaymentRecord>();
  private lookupCounts = new Map<string, number>();
  sendCalls = 0;
  /** make lookups throw, to model an unreachable node during reconciliation */
  failLookups = false;

  constructor(private readonly network: Network = "regtest") {}

  register(preimageHex: string, behavior: SimBehavior = "succeed"): string {
    const hash = sha256Hex(hexToBytes(preimageHex));
    this.preimages.set(hash, preimageHex);
    this.behaviors.set(hash, behavior);
    return hash;
  }
  setBehavior(hash: string, b: SimBehavior) {
    this.behaviors.set(hash, b);
  }

  async getInfo(): Promise<WalletInfo> {
    return {
      kind: "simulator",
      network: this.network,
      nodePubkey: null,
      alias: "SIMULATOR (not a real wallet)",
      version: "sim-1",
      syncedToChain: true,
    };
  }
  async discoverCapabilities(): Promise<Capabilities> {
    return {
      canSendPayments: true,
      canLookupPayments: true,
      canReadInfo: true,
      notes: ["Simulator: no real funds move."],
      discoveredAt: new Date().toISOString(),
    };
  }

  private succeed(hash: string, amountMsat: bigint): PaymentRecord {
    const rec: PaymentRecord = {
      status: "SUCCEEDED",
      paymentHash: hash,
      preimage: this.preimages.get(hash),
      amountMsat,
      feeMsat: 0n,
      settledAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      providerRef: "sim",
    };
    this.records.set(hash, rec);
    return rec;
  }

  async sendPayment(req: SendRequest): Promise<PaymentRecord> {
    this.sendCalls++;
    const hash = decodeInvoice(req.invoice).paymentHash;
    if (this.records.has(hash) && this.records.get(hash)!.status !== "FAILED") {
      throw new OutcomeUnknownError("simulator: payment already exists");
    }
    const b = this.behaviors.get(hash) ?? "fail_no_route";
    switch (b) {
      case "succeed":
        return this.succeed(hash, req.amountMsat);
      case "pending_then_succeed":
        this.records.set(hash, {
          status: "IN_FLIGHT",
          paymentHash: hash,
          observedAt: new Date().toISOString(),
        });
        return this.records.get(hash)!;
      case "fail_no_route": {
        const rec: PaymentRecord = {
          status: "FAILED",
          paymentHash: hash,
          failureReason: "FAILURE_REASON_NO_ROUTE",
          observedAt: new Date().toISOString(),
        };
        this.records.set(hash, rec);
        return rec;
      }
      case "accept_then_lose_response":
        this.succeed(hash, req.amountMsat);
        throw new OutcomeUnknownError("simulator: connection reset after the wallet accepted the payment");
      case "not_sent_unreachable":
        throw new NotSentError("simulator: wallet unreachable");
      case "fail_insufficient": {
        const rec: PaymentRecord = {
          status: "FAILED",
          paymentHash: hash,
          failureReason: "FAILURE_REASON_INSUFFICIENT_BALANCE",
          observedAt: new Date().toISOString(),
        };
        this.records.set(hash, rec);
        return rec;
      }
      case "succeed_bad_preimage": {
        const rec: PaymentRecord = {
          status: "SUCCEEDED",
          paymentHash: hash,
          preimage: "ff".repeat(32),
          amountMsat: req.amountMsat,
          feeMsat: 0n,
          settledAt: new Date().toISOString(),
          observedAt: new Date().toISOString(),
        };
        this.records.set(hash, rec);
        return rec;
      }
      case "error_then_no_record":
        throw new OutcomeUnknownError("simulator: ambiguous error, no record was created");
    }
  }

  async lookupPayment(hash: string): Promise<PaymentRecord> {
    if (this.failLookups) throw new OutcomeUnknownError("simulator: node unreachable");
    const n = (this.lookupCounts.get(hash) ?? 0) + 1;
    this.lookupCounts.set(hash, n);
    const rec = this.records.get(hash);
    if (!rec) return { status: "NOT_FOUND", paymentHash: hash, observedAt: new Date().toISOString() };
    if (rec.status === "IN_FLIGHT" && this.behaviors.get(hash) === "pending_then_succeed" && n >= 2) {
      return this.succeed(hash, 0n);
    }
    return { ...rec, observedAt: new Date().toISOString() };
  }
}
