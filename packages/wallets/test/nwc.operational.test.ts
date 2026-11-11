/**
 * OPERATIONAL CHECK against a REAL NWC wallet service. SKIPPED unless explicitly enabled. See src/nwc/README.md ("Operational test").
 *
 * This is the ONLY place where a real wallet is contacted, and it is inert by default. It refuses to run against mainnet,
 * refuses invoices above a tiny cap, and never prints the connection URI or the secret.
 *
 *   ORYNT_NWC_URI="$(cat ~/.orynt-nwc-test-uri)" \
 *   ORYNT_NWC_NETWORK=signet \
 *   pnpm --filter @orynt/wallets exec vitest run test/nwc.operational.test.ts
 *
 * Add ORYNT_NWC_INVOICE=<bolt11 from a SECOND throwaway wallet on the same test network> and ORYNT_NWC_CONFIRM_PAY=yes to also
 * pay it. Add ORYNT_NWC_ALLOW_LOOPBACK_WS=1 only if your throwaway relay is on 127.0.0.1 over ws://.
 */
import { describe, expect, it } from "vitest";
import { decodeInvoice, sha256Hex, hexToBytes, type Network } from "@orynt/core";
import { NwcProvider } from "../src/nwc/provider";

const uri = process.env["ORYNT_NWC_URI"];
const network = process.env["ORYNT_NWC_NETWORK"] as Network | undefined;
const invoice = process.env["ORYNT_NWC_INVOICE"];
const confirmPay = process.env["ORYNT_NWC_CONFIRM_PAY"] === "yes";
const MAX_MSAT = 10_000_000n; // 10,000 sat hard cap for this check, whatever the invoice says
const enabled = !!uri && (network === "regtest" || network === "signet" || network === "testnet");

describe.skipIf(!enabled)("OPERATIONAL (real NWC wallet service, non-mainnet only)", () => {
  const mk = () => new NwcProvider({
    uri: uri as string, network: network as Network, allowMainnet: false, unenforcedFeeLimit: "accept_and_report",
    allowInsecureLoopbackRelays: process.env["ORYNT_NWC_ALLOW_LOOPBACK_WS"] === "1",
    onDiagnostic: (d) => console.log("[nwc diagnostic]", JSON.stringify(d)),
  });

  it("connects, reads the info event and get_info, and agrees with the asserted network", async () => {
    const p = mk();
    try {
      const info = await p.getInfo();
      console.log("[nwc] wallet-reported/asserted network:", info.network, "alias:", info.alias);
      expect(info.network).toBe(network);
      const caps = await p.discoverCapabilities();
      console.log("[nwc] capabilities:", JSON.stringify(caps, null, 2));
      expect(caps.canReadInfo).not.toBe("unknown");
    } finally {
      p.close();
    }
  }, 60_000);

  it.skipIf(!invoice || !confirmPay)("pays ONE tiny test-network invoice and reconciles it by payment_hash", async () => {
    const dec = decodeInvoice(invoice as string);
    expect(dec.network).toBe(network);
    expect(dec.amountMsat).not.toBeNull();
    expect(dec.amountMsat as bigint).toBeLessThanOrEqual(MAX_MSAT);
    const p = mk();
    try {
      const rec = await p.sendPayment({ invoice: invoice as string, paymentHash: dec.paymentHash, amountMsat: dec.amountMsat as bigint, zeroAmountInvoice: false, feeLimitMsat: 1_000_000n, timeoutSeconds: 60 });
      console.log("[nwc] sendPayment status:", rec.status);
      expect(rec.status).toBe("SUCCEEDED");
      expect(sha256Hex(hexToBytes(rec.preimage as string))).toBe(dec.paymentHash);
      const looked = await p.lookupPayment(dec.paymentHash);
      console.log("[nwc] lookupPayment status:", looked.status);
      expect(looked.status).toBe("SUCCEEDED");
      expect(looked.preimage).toBe(rec.preimage);
    } finally {
      p.close();
    }
  }, 120_000);
});
