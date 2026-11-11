import dns from "node:dns";
import type net from "node:net";
import { isPrivateAddress } from "../lib/ssrf";
import { LndRestProvider, SimulatorProvider, type WalletProvider } from "@orynt/wallets";
import type { Network } from "@orynt/core";
import { open } from "../lib/box";
import type { Deps } from "./context";

/** In-process simulators keyed by connection id (they have no durable state; tests and seed data register payments on them). */
const simulators = new Map<string, SimulatorProvider>();
export const simulatorFor = (connectionId: string, network: Network = "regtest") => {
  let s = simulators.get(connectionId);
  if (!s) simulators.set(connectionId, (s = new SimulatorProvider(network)));
  return s;
};

export interface ConnectionRow { id: string; org_id: string; provider_kind: "lnd" | "nwc" | "simulator"; network: Network; config_ciphertext: Buffer | null }

/** Every address the wallet hostname resolves to is vetted at CONNECT time, not just once when the connection was created (defeats DNS rebinding). */
export const vettedLookup = (allowPrivate: boolean): net.LookupFunction => (hostname, options, cb) => {
  dns.lookup(hostname, { all: true, family: options.family }, (err, addrs) => {
    if (err) return (cb as (e: Error) => void)(err);
    const ok = addrs.filter((a) => allowPrivate || !isPrivateAddress(a.address));
    if (!ok.length) return (cb as (e: Error) => void)(new Error("wallet address is not allowed (private or internal destination)"));
    if (options.all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, ok);
    (cb as unknown as (e: null, a: string, f: number) => void)(null, ok[0]!.address, ok[0]!.family);
  });
};
export function providerFor(d: Deps, c: ConnectionRow): WalletProvider {
  if (c.provider_kind === "simulator") return simulatorFor(c.id, c.network);
  if (c.provider_kind === "lnd") {
    if (!c.config_ciphertext) throw new Error("connection has no stored credentials");
    const cfg = JSON.parse(open(d.config.secretKey, c.config_ciphertext, c.id)) as { rest_url: string; macaroon_hex: string; tls_cert_pem?: string };
    return new LndRestProvider({ restUrl: cfg.rest_url, macaroonHex: cfg.macaroon_hex, tlsCertPem: cfg.tls_cert_pem, lookup: vettedLookup(d.config.allowPrivateWebhookTargets) });
  }
  throw new Error(`provider kind ${c.provider_kind} is not implemented`);
}
