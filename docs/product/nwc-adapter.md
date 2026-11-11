# NWC (NIP-47) wallet adapter

*Status: **implemented and contract-tested against a local fake; not operationally verified; not wired into the API.** No real NWC wallet service, relay or funds have been used. This page describes what the code does and does not do. It is not a support claim for any wallet. Source: `packages/wallets/src/nwc/` (engineering detail and the operational-test procedure are in `packages/wallets/src/nwc/README.md`).*

## What it is

A `WalletProvider` (`kind: "nwc"`, `isReal: true`) that lets Orynt pay and reconcile through a wallet that exposes **Nostr Wallet Connect** (NIP-47). The operator pastes a connection URI from their wallet (`nostr+walletconnect://<wallet-service-pubkey>?relay=wss://…&secret=<hex>`). Orynt then sends end-to-end-encrypted requests to the wallet service over Nostr relays. Orynt never sees the wallet's own keys or the node; it holds only a per-connection key whose authority the wallet can limit and revoke.

## Supported methods

| NIP-47 / NWC method | Used for | Notes |
|---|---|---|
| info event (kind 13194) | which methods and encryption schemes the wallet service offers | newest event signed by the wallet-service key wins; forged/unsigned/expired ones are ignored |
| `get_info` | network, alias, node pubkey, **per-connection** method list | optional; if refused, the owner's network assertion is the only source |
| `pay_invoice` | `sendPayment` | BOLT11 only; `amount` (msat) is sent only for zero-amount invoices |
| `lookup_invoice` (by `payment_hash`) | `lookupPayment` / reconciliation | outgoing payments only; see classification below |
| `get_budget` (NWC-13) | capability notes, `getBudget()` | only if advertised; informational, never changes `canSendPayments` |
| `get_balance`, `make_invoice`, `list_transactions`, `pay_keysend`, `lookup_payment` (NWC-09), notifications | **not used** | — |

Encryption: NIP-44 v2 is used whenever the wallet service lists it; legacy NIP-04 is used only when the service lists nothing else (or has no `encryption` tag, which NIP-47 defines as NIP-04-only) and `allowNip04` is not `false`.

## Capability discovery (what the operator sees)

`canSendPayments` is **`true` only if** `pay_invoice` is advertised in the info event **and** the connection's own `get_info.methods` lists it. Advertised but unconfirmable (e.g. `get_info` refused or not offered) is **`"unknown"`**. Not advertised, or the connection lacks it, is **`false`**. Relays unreachable gives `"unknown"` for everything. The same rule applies to `canLookupPayments` (`lookup_invoice`). Notes also state: the encryption in use, the network and whether it is wallet-reported or owner-asserted, the connection budget remaining (if `get_budget` is available), and that the fee limit cannot be enforced (below).

## Networks

NIP-47 has **no network field in the connection URI or the info event**; `get_info.network` exists in the spec's example but wallets may omit it. The adapter therefore never assumes a network:

1. A wallet-reported network (`mainnet|testnet|signet|regtest`) that **contradicts** the owner's assertion: refuse everything (`NwcNetworkError: mismatch`).
2. A wallet-reported network: use it.
3. Nothing reported but the owner asserted one (`network` in the connection config): use it and label it **unverified** in the capability notes.
4. Nothing reported and nothing asserted: **refuse** (`NwcNetworkError: unverified`). There is no default.

Additionally, a send is refused if the resolved network is `mainnet` and `allowMainnet` is not explicitly set, and if the **invoice's network differs from the resolved network**. The invoice check does not depend on the wallet's honesty: a wallet cannot pay an invoice of a different network. Mainnet execution remains disabled at product level regardless of this adapter.

When connecting a wallet that does not report its network, the operator must assert it deliberately, after checking the wallet itself. The assertion is stored with the connection like any other setting and is the owner's responsibility.

## Payment outcomes

The state machine depends on one distinction, kept strictly:

* **Definitely not sent** (`NotSentError`): the request was never published, every relay refused it with a definitive prefix, or the wallet service itself refused it before attempting (`RATE_LIMITED`, `QUOTA_EXCEEDED`, `INSUFFICIENT_BALANCE`, `RESTRICTED`, `UNAUTHORIZED`, `NOT_IMPLEMENTED`, `UNSUPPORTED_ENCRYPTION`).
* **Terminal result**: an authentic `pay_invoice` success with a preimage; or `PAYMENT_FAILED` **confirmed** by `lookup_invoice` (the spec says it "may be due to a timeout", so it is never believed alone).
* **Unknown** (`OutcomeUnknownError`) for everything else: timeout, no authentic response, connection lost after publishing, `INTERNAL`, `OTHER`, unknown codes, malformed success, relay `OK false` with an ambiguous reason. **A timeout is never a failure.** An unknown outcome is resolved by `lookup_invoice` with the payment hash, or by an operator.

Responses that are forged, replayed, addressed elsewhere, expired, stale or undecryptable are dropped and can never decide an outcome.

## Limitations (read before offering NWC to a customer)

* **No per-payment fee limit.** NIP-47 `pay_invoice` carries no fee limit, so Orynt's authorised fee limit cannot be enforced. By default sends are **refused**; the owner may opt into `accept_and_report` (the actual fee is recorded and an overrun is reported after the fact). The control that actually limits spend is the connection budget configured in the wallet.
* **No idempotency key.** A second request after an unknown outcome is a new Nostr event. Whether a wallet refuses a duplicate payment for the same invoice is wallet-specific and **unverified**; the state machine's "no second send while UNKNOWN" rule is what protects against a double payment.
* **`NOT_FOUND` is weaker than with LND.** It means "no payment visible to this connection", not "the node never attempted it". Wallets may not index failed attempts. The existing rule (operator confirmation, invoice expired) is what makes it safe.
* **Ephemeral events.** Request and response events are ephemeral on relays: a lost response is lost for good; recovery is always by `lookup_invoice`. A wallet connection without `lookup_invoice` cannot reconcile and should not be used for real payouts.
* **Amount reported by `lookup_invoice`** is compared by the core to the approved amount. A wallet that includes fees in `amount` will park payments as inconsistent (fail-safe, but operationally noisy). Unverified per wallet.
* No NIP-42 relay authentication; one short-lived connection per relay per operation; BOLT11 only (no BOLT12/keysend/BIP-321).
* Wallet correctness is assumed where NIP-47 defines semantics (for example that `INSUFFICIENT_BALANCE` is returned before an attempt). This is exactly what the operational test must confirm per wallet.

## Security notes

* **Secret handling.** The URI's `secret` is parsed into a redacting holder; it appears in no log, error, diagnostic, `JSON.stringify` or `util.inspect` output (tested). The provider does not keep the URI string. `close()` zero-fills the key and refuses further use. JavaScript cannot erase copies the caller already holds; store the URI encrypted at rest like the LND macaroon (`apps/api/src/lib/box`) and construct the provider per operation, calling `close()` in a `finally`.
* **Local close is not revocation.** The secret stays valid at the wallet until the user revokes the connection there. Offboarding a NWC connection must include that step and say so.
* **Least privilege.** Ask the user for a connection with `pay_invoice`, `lookup_invoice`, `get_info` (and `get_budget` if wanted), a budget and an expiry. Never `make_invoice` or key-management permissions.
* **Transport.** Relays must be `wss://`; `ws://` is accepted only for loopback and only when explicitly enabled. Relay URLs can contain access tokens: diagnostics and serialisations show only scheme and host. Redirects are not followed. Frames are capped at 256 KiB.
* **Relays are untrusted.** They see metadata (who talks to whom, when) but not content; they can drop, delay, replay or forge events. Authenticity rests on the wallet-service signature, not on the relay. Dropping is handled as UNKNOWN.
* **Cryptography.** BIP-340 Schnorr, NIP-44 v2 and NIP-04 from `@noble/*`, checked against the official BIP-340 and NIP-44 vectors in CI. NIP-04 is unauthenticated encryption inside a signed event and is deprecated; set `allowNip04: false` to require NIP-44.
* **Dependencies.** `@noble/curves`, `@noble/hashes`, `@noble/ciphers` (2.4.x), `ws` 8.22.1 (exact; chosen to respect the 3-day minimum release age). `pnpm audit --prod --audit-level=high` is clean.

## Integration status (what is NOT done)

* `apps/api/src/services/providers.ts` does not construct `NwcProvider` (it throws "not implemented" for `nwc`); no connection-creation flow, stored config shape (`uri`, asserted `network`, options) or UI exists. `provider.close()` is not called anywhere because `WalletProvider` has no `close`.
* `apps/api/src/services/execution.ts` records `providerKind: isSim ? "simulator" : "lnd"` in settlement evidence; an NWC payment would be mislabelled `lnd` until that is generalised.
* `docs/product/wallet-capability-matrix.md` still correctly says NWC has no verified cells; nothing may be promoted until the operational test has been run and recorded.
* No customer-facing page or marketing may say NWC is supported; at most "roadmap".

## Evidence

| Claim | Evidence | Kind |
|---|---|---|
| BIP-340 sign/verify correct | 19 official vectors + the signing path used for events | spec vectors |
| NIP-44 v2 correct | all official `nip44.vectors.json` groups (checksum-pinned) + extended-length checksums | spec vectors |
| NIP-04 correct | round trip + independent `node:crypto` AES-256-CBC computation (no official vectors exist) | cross-check |
| URI parsing/validation, redaction | `uri.test.ts`, the NIP-47 example string | unit tests |
| Classification of every outcome in this page | `nwc-send/lookup/discovery.contract.test.ts` | **contract tests against a local fake (not a real wallet)** |
| Works with a real wallet service / relay | — | **not done** |
