import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { encodeInvoice, type Network } from "@orynt/core";
import { FakeRelay } from "./fake-relay";
import { FakeWallet, type FakeWalletOptions } from "./fake-wallet";
import { NwcProvider, type NwcConfig } from "../../src/nwc/provider";
import { getPublicKeyHex } from "../../src/nwc/nostr";
import type { NwcDiagnostic } from "../../src/nwc/client";
import type { SendRequest } from "../../src/types";

export const PAYEE_KEY = "0000000000000000000000000000000000000000000000000000000000000007";

export interface Harness {
  relay: FakeRelay;
  wallet: FakeWallet;
  provider: NwcProvider;
  uri: string;
  secretHex: string;
  diagnostics: NwcDiagnostic[];
  /** mints a validly signed regtest invoice whose preimage the fake wallet knows */
  invoice(amountMsat?: bigint | null, network?: Network, opts?: { known?: boolean }): { invoice: string; paymentHash: string; preimage: string };
  req(inv: { invoice: string; paymentHash: string }, amountMsat: bigint, extra?: Partial<SendRequest>): SendRequest;
  makeProvider(over?: Partial<NwcConfig>): NwcProvider;
  stop(): Promise<void>;
}

export interface HarnessOptions {
  wallet?: Partial<FakeWalletOptions>;
  provider?: Partial<NwcConfig>;
  /** skip starting the wallet service (no info event published) */
  noWallet?: boolean;
}

export async function harness(opts: HarnessOptions = {}): Promise<Harness> {
  const relay = new FakeRelay();
  const url = await relay.start();
  const walletSecret = randomBytes(32);
  const clientSecret = randomBytes(32);
  const secretHex = bytesToHex(clientSecret);
  const walletPub = getPublicKeyHex(walletSecret);
  const clientPub = getPublicKeyHex(clientSecret);
  const wallet = new FakeWallet({
    relays: [url], walletSecret, clientPubkey: clientPub, network: "regtest",
    dropRelays: () => relay.dropAllConnections(),
    ...opts.wallet,
  });
  if (!opts.noWallet) await wallet.start();
  const uri = `nostr+walletconnect://${walletPub}?relay=${encodeURIComponent(url)}&secret=${secretHex}`;
  const diagnostics: NwcDiagnostic[] = [];
  const makeProvider = (over: Partial<NwcConfig> = {}) =>
    new NwcProvider({
      uri, allowInsecureLoopbackRelays: true, unenforcedFeeLimit: "accept_and_report",
      connectTimeoutMs: 1500, infoTimeoutMs: 1500, readTimeoutMs: 800, payTimeoutMarginMs: 0, relayGraceMs: 150, infoCacheMs: 0,
      onDiagnostic: (d) => diagnostics.push(d),
      ...opts.provider, ...over,
    });
  const provider = makeProvider();
  const h: Harness = {
    relay, wallet, provider, uri, secretHex, diagnostics,
    invoice(amountMsat: bigint | null = 100_000n, network: Network = "regtest", o = {}) {
      const preimage = bytesToHex(randomBytes(32));
      const paymentHash = bytesToHex(sha256(Buffer.from(preimage, "hex")));
      if (o.known !== false) wallet.registerInvoicePreimage(preimage);
      const invoice = encodeInvoice({ network, amountMsat, paymentHashHex: paymentHash, paymentSecretHex: bytesToHex(randomBytes(32)), description: "contract test", timestamp: Math.floor(Date.now() / 1000), expirySeconds: 3600, privateKeyHex: PAYEE_KEY });
      return { invoice, paymentHash, preimage };
    },
    req(inv, amountMsat, extra = {}) {
      return { invoice: inv.invoice, paymentHash: inv.paymentHash, amountMsat, zeroAmountInvoice: false, feeLimitMsat: 5_000n, timeoutSeconds: 0.4, ...extra };
    },
    makeProvider,
    async stop() {
      provider.close();
      await wallet.stop();
      await relay.stop();
    },
  };
  return h;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not reached in time");
    await sleep(20);
  }
}
