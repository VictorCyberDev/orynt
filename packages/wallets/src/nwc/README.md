# NWC (NIP-47) wallet adapter

`NwcProvider` implements the same `WalletProvider` contract as the LND adapter (`getInfo`, `discoverCapabilities`,
`sendPayment`, `lookupPayment`) on top of Nostr Wallet Connect.

> **Status: implemented and CONTRACT-TESTED against a local fake. NOT operationally verified.**
> No real NWC wallet service, no real relay and no real funds have ever been used with this code. Every test in
> `packages/wallets/test/*.contract.test.ts` talks to an in-process fake relay and an in-process fake wallet service that
> were written from the same reading of NIP-47 as the adapter; they prove the adapter follows that reading and classifies
> outcomes safely, **not** that any real wallet behaves that way. Do not describe this adapter as "live", "supported" or
> "verified with <wallet>" until the operational test below has been run and recorded.

## Files

| File | Purpose |
|---|---|
| `provider.ts` | `NwcProvider`: contract implementation, error classification, network and permission policy |
| `client.ts` | info-event retrieval, request/response exchange over relays, authenticity checks |
| `relay.ts` | one WebSocket connection to one relay (`ws`) |
| `uri.ts` | strict `nostr+walletconnect://` parsing |
| `nostr.ts` | NIP-01 events, BIP-340 Schnorr sign/verify, NIP-40 expiration |
| `encryption.ts` | NIP-44 v2 and legacy NIP-04 |
| `secret.ts` | redacting holder for the client key |
| `errors.ts` | `NwcNotSentError`, `NwcNetworkError`, … |

Crypto primitives are `@noble/curves`, `@noble/hashes`, `@noble/ciphers` (audited, widely used); WebSocket is `ws`.

## Usage

```ts
const wallet = new NwcProvider({
  uri: process.env.ORYNT_NWC_URI!,        // contains the client secret; never log it
  network: "signet",                       // OWNER'S ASSERTION; required unless the wallet reports its network in get_info
  unenforcedFeeLimit: "accept_and_report", // see "Fee limits"
});
try {
  await wallet.getInfo();
  await wallet.discoverCapabilities();
  await wallet.sendPayment({ /* SendRequest */ });
} finally {
  wallet.close(); // aborts in-flight work, closes sockets, zero-fills the secret
}
```

`close()` is **local** revocation only. The connection stays valid at the wallet service until the user revokes it in the
wallet. Revoke there too.

## How outcomes are classified (the part the payment state machine depends on)

| Situation | Result | Why |
|---|---|---|
| invoice/amount/hash/network/fee-limit/permission pre-flight fails | `NwcNotSentError` (extends `NotSentError`) | nothing was published |
| no relay reachable; relay refused the response subscription; relay never answered the subscription | `NwcNotSentError` | the request is only published after the response subscription is confirmed (EOSE) |
| every relay answered `OK false` with prefix `blocked`/`invalid`/`restricted`/`rate-limited`/`pow`/`auth-required` | `NwcNotSentError` | no relay accepted the event |
| `OK false` with any other prefix (`error`, `duplicate`, `mute`, unknown) | `OutcomeUnknownError` | the relay may have forwarded it |
| wallet error `RATE_LIMITED`, `QUOTA_EXCEEDED`, `INSUFFICIENT_BALANCE`, `RESTRICTED`, `UNAUTHORIZED`, `NOT_IMPLEMENTED`, `UNSUPPORTED_ENCRYPTION` | `NwcNotSentError` (`reason: "wallet_rejected"`, `walletCode`) | NIP-47 defines these as refusals before the payment is attempted. **This relies on the wallet following the spec; verify per wallet.** |
| wallet error `PAYMENT_FAILED` | confirmed through `lookup_invoice`: `failed` -> `FAILED`; `settled` -> `SUCCEEDED`; `pending` -> `IN_FLIGHT`; no record / lookup unavailable -> `OutcomeUnknownError` | NIP-47 says `PAYMENT_FAILED` "may be due to a timeout", so it is not believed on its own |
| wallet error `INTERNAL`, `OTHER`, `NOT_FOUND`, or any code not in the spec | `OutcomeUnknownError` | not evidence either way |
| error message says a payment already exists | `AlreadyExistsError` | reconcile, do not retry |
| **timeout, no authentic response** | **`OutcomeUnknownError`** | never a failure |
| **all relay connections lost after publishing** | **`OutcomeUnknownError`** | immediately, without waiting for the timeout |
| `close()` while a published request is in flight | `OutcomeUnknownError` | it may have executed |
| success response with a missing/invalid preimage | `OutcomeUnknownError` | reconcile by lookup |
| success response with a preimage that does not hash to the payment hash | `SUCCEEDED` is returned as-is (and a `preimage_mismatch` diagnostic is emitted) | the state machine's own preimage check then holds the payment as inconsistent; the adapter never converts it into success *or* failure |

Reconciliation (`lookupPayment`) uses `lookup_invoice` with `payment_hash` only: `settled` -> `SUCCEEDED`, `failed` -> `FAILED`,
`pending`/`accepted` -> `IN_FLIGHT`, `NOT_FOUND` -> `NOT_FOUND`. Everything else is `OutcomeUnknownError`: an `incoming` record with the same hash,
a record for another hash, `expired`/`canceled`/unknown states, `RATE_LIMITED`/`INTERNAL`, a timeout. A missing `state` is
accepted only when the returned preimage hashes to the payment hash. `RESTRICTED`/`UNAUTHORIZED`/`NOT_IMPLEMENTED` ->
`InsufficientPermissionsError`.

A response can only decide an outcome if it is: well-formed NIP-01; kind 23195; authored by the wallet service key; has `p` =
our client key and `e` = this request's id; not expired (NIP-40); not older than the request by more than 5 minutes; carries a
valid BIP-340 signature (checked **before** decrypting, as NIP-44 requires); decrypts; and has `result_type` equal to the method.
Anything else is dropped and surfaced through `onDiagnostic` only.

## Network (NWC has no mandatory network field)

`get_info` may carry `network` (`mainnet|testnet|signet|regtest`); wallets may omit it, and the info event never has it. Rules:

1. wallet reports a valid network that contradicts the owner's `network` -> `NwcNetworkError("mismatch")`, sends refused;
2. wallet reports a valid network -> used;
3. otherwise the owner's `network` assertion is used and flagged as **unverified** in `discoverCapabilities().notes`;
4. otherwise -> `NwcNetworkError("unverified")`, sends refused.

Sends additionally require: resolved network is not `mainnet` unless `allowMainnet: true`; and the invoice's own network equals the
resolved network. The invoice check is the real safety net: a wallet cannot pay an invoice of another network.

## Fee limits

NIP-47 `pay_invoice` has **no fee-limit parameter**. The authorised `feeLimitMsat` therefore cannot be enforced by the wallet.
Default (`unenforcedFeeLimit: "refuse"`): `sendPayment` throws `NwcNotSentError(reason: "fee_limit_not_enforceable")`. With
`"accept_and_report"` the payment is sent, the actual `fees_paid` is returned in `feeMsat`, and a `fee_limit_exceeded` diagnostic fires if
it exceeded the limit. Use the connection budget at the wallet (`get_budget`, NWC-13) as the real control.

## Known implementers of NIP-47 (wallet-service side)

These are **third-party claims**, not something this repository has tested. They come from the community list maintained by the
Alby team and from the projects' own READMEs; none has been exercised with this adapter.

* Community index of NWC wallets, services and apps: <https://github.com/getAlby/awesome-nwc> (lists, among others: Alby Hub, Coinos, LNbits, Primal Wallet, Rizful,
  Zeus (from 0.12), Electrum, Cashu.me, Minibits, Flash Wallet, Blitz, Buho, LNCurl).
* Alby Hub (self-custodial node + NWC service): <https://github.com/getAlby/hub>. Its CLI README documents running against a test network
  ("To test without real bitcoin, run the hub against Mutinynet (signet): `NETWORK=signet` ..."): <https://github.com/getAlby/hub-cli>.
* LND bridge: <https://github.com/benthecarman/nostr-wallet-connect-lnd> (README: macaroon needs `TrackPaymentV2` so `lookup_invoice` can find outgoing payments;
  default max routing fee 1,000 sat via `--max-fee`; takes `--relay`, `--lnd-host`, `--macaroon-file`, `--cert-file`).
* Core Lightning plugins: <https://github.com/daywalker90/cln-nip47>, <https://github.com/gudnuf/cln_nwc>.
* LNbits NWC service: <https://github.com/SamSamskies/lnbits-nwc-service> (experimental, per the list).
* Protocol: NIP-47 <https://github.com/nostr-protocol/nips/blob/master/47.md>; extensions incl. NWC-09 (`lookup_payment`) and NWC-13 (`get_budget`):
  <https://github.com/nostr-wallet-connect/nwc>; interoperability tracker linked from awesome-nwc: <https://github.com/nostrability/nostrability/issues/77>.

## Operational test (owner, real wallet service, NON-MAINNET ONLY)

Purpose: find out how a real wallet service actually behaves for the assumptions the contract tests encode. **Never use mainnet. Never use a wallet that
holds funds you care about. Use a throwaway wallet and the smallest amounts.** No step below needs mainnet.

1. **Pick a throwaway wallet service on a test network**, one of:
   * Alby Hub on signet/Mutinynet (see `getAlby/hub-cli` above), or
   * this repo's own regtest LND (`pnpm regtest:up`) behind `benthecarman/nostr-wallet-connect-lnd` with a **local** relay on `127.0.0.1`
     (then set `ORYNT_NWC_ALLOW_LOOPBACK_WS=1`; check that the bridge accepts a `ws://` relay — not verified here), or
   * any other wallet from the list that supports a test network.
2. **Create a connection with least privilege**: methods `get_info`, `lookup_invoice`, `pay_invoice` only (no `make_invoice`), a **tiny budget** (e.g. 10,000 sat)
   and the shortest expiry the wallet offers. Save the `nostr+walletconnect://…` URI to a file outside the repo with mode 600
   (`umask 077; pbpaste > ~/.orynt-nwc-test-uri`). Do not paste it into chat, tickets or CI logs.
3. **Read-only check first** (pays nothing):
   ```sh
   ORYNT_NWC_URI="$(cat ~/.orynt-nwc-test-uri)" ORYNT_NWC_NETWORK=signet \
     pnpm --filter @orynt/wallets exec vitest run test/nwc.operational.test.ts
   ```
   Record: does `get_info` return `network`? which `methods`? which encryption scheme was negotiated (see `notes`)? Is `get_budget` advertised?
4. **One tiny payment**: from a *second* throwaway wallet on the same test network create an invoice of at most a few hundred sat, then
   ```sh
   ORYNT_NWC_URI="$(cat ~/.orynt-nwc-test-uri)" ORYNT_NWC_NETWORK=signet \
   ORYNT_NWC_INVOICE=lntbs… ORYNT_NWC_CONFIRM_PAY=yes \
     pnpm --filter @orynt/wallets exec vitest run test/nwc.operational.test.ts
   ```
   The check refuses mainnet, refuses amounts above 10,000 sat, verifies `sha256(preimage) == payment_hash` and reconciles with `lookup_invoice`.
5. **Observe the behaviours the fake can only assume** (do these by hand with a small script around `NwcProvider`; write the results down):
   * Does `lookup_invoice` by `payment_hash` find an **outgoing** payment, and does it report `type: "outgoing"`, `state`, `preimage`, and an `amount` that **excludes** fees? (core compares `amount` to the approved amount; a wallet that includes fees there will park payments as inconsistent.)
   * Pay the **same invoice twice**: does the wallet refuse (and with which code/message), or does it try again? This decides whether a retry after UNKNOWN can ever double-pay.
   * Exceed the budget: is the code `QUOTA_EXCEEDED` and is it returned before any payment attempt?
   * Revoke the connection in the wallet, then `sendPayment`: expect `RESTRICTED`/`UNAUTHORIZED` or silence (-> UNKNOWN), never a false failure.
   * Pay an invoice that cannot be routed: is the error `PAYMENT_FAILED`, and does `lookup_invoice` then show `failed` or `NOT_FOUND`?
   * Stop the relay mid-payment: response lost -> `OutcomeUnknownError`, then reconcile after the relay returns.
   * Does the wallet honour the request `expiration` tag?
6. **Teardown**: revoke the connection in the wallet, `shred -u ~/.orynt-nwc-test-uri`, drain the throwaway wallets.
7. **Record the results** (wallet + version, relay, scheme, each observation above) in `docs/product/wallet-capability-matrix.md`. Only then may a row be marked VERIFIED, and only for what was observed.

## Not implemented / limitations

* No NIP-42 relay authentication: relays that require `AUTH` cannot be used (they answer `auth-required`, which is treated as "not sent").
* One short-lived WebSocket per relay per operation (no connection pooling, no notifications, no kind 23196/23197). Safe and simple; slower than a persistent connection.
* `lookup_payment` (NWC-09) and `make_invoice`, `list_transactions`, `pay_keysend`, hold invoices are not used. Reconciliation is `lookup_invoice` by `payment_hash`.
* A re-sent request after UNKNOWN would be a **new** Nostr event (new id): NIP-47 has no idempotency key. Only the caller's state machine (and the wallet's own payment-hash dedupe) prevents a double payment.
* JavaScript cannot guarantee zeroization: `close()` zero-fills the key bytes the adapter holds, not copies already made by the caller (the URI string) or by the runtime.

## Deviations from / findings about the specifications

* The adapter is **stricter than NIP-47** where safety needs it: a response must carry `p` and `e` tags (the NIP says SHOULD); only `nostr+walletconnect://` (exactly) is accepted as scheme (older wallets used other spellings); `ws://` relays only on loopback with an explicit option.
* NIP-47 (current master) is a "simplified core": `get_budget` and the richer features live in the separate `nostr-wallet-connect/nwc` repository (NWC-13 etc.). The core NIP text lists `PAYMENT_FAILED` and `NOT_FOUND` as method-specific errors rather than in the general error list.
* The signed info event printed in the NIP-47 appendix is **not self-consistent**: its `(id, pubkey, sig)` is a genuine BIP-340 signature, but the printed tags/content do not hash to the printed `id`. Pinned in `bip340-nip01-vectors.test.ts`.
* The checksum-pinned `nip44.vectors.json` still lists plaintext lengths 65536 and 100000 as invalid, while the current NIP-44 text defines a 6-byte extended length prefix with its own checksummed vectors that require them to work. The adapter follows the NIP text; NWC payloads never approach that size. Pinned in `nip44-vectors.test.ts`.
* NIP-04 has no published test vectors; it is checked by round trip and against an independent `node:crypto` AES-256-CBC computation.
