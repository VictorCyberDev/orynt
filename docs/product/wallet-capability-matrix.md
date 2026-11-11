# Wallet capability matrix

*Evidence-based. A cell says what was **observed in this repository**, not what the wallet's documentation promises. Last updated against branch `claude/busy-goodall-ajeb0p`.*

Legend: **VERIFIED (regtest)** = exercised against a real node in `apps/api/test/lnd.itest.ts` / `pnpm demo:full` · **SIMULATOR-VERIFIED** = only the in-repo simulator · **NOT STARTED** · **NOT EVALUATED**. No wallet has been exercised on mainnet or testnet; mainnet execution is disabled.

| Capability | LND (REST) | Simulator (labelled) | NWC (NIP-47) | BTCPay Server | Core Lightning |
|---|---|---|---|---|---|
| Adapter exists in code | yes — `packages/wallets/src/lnd.ts` (wired into the API) | yes | **code exists, NOT wired to the API**, contract-tested vs a local fake (`src/nwc`) | **code exists, NOT wired to the API**, contract-tested vs a documentation-derived fake (`src/btcpay`) | **no** |
| Connect + node identity/network | VERIFIED (regtest) | SIMULATOR-VERIFIED | — | — | — |
| Permission discovery without over-reach | VERIFIED (regtest): authorization probes; least-privilege and read-only macaroons baked through LND `POST /v1/macaroon` in `infra/regtest/up.mjs` | simulated rows only | — | — | — |
| Read-only credential refused for sending | VERIFIED (regtest) | SIMULATOR-VERIFIED | — | — | — |
| Pay BOLT11 | VERIFIED (regtest) — real settlement, preimage proves payment | settles as `SIMULATED_SETTLED` (never "real") | — | — | — |
| Lookup by payment hash (reconcile) | VERIFIED (regtest) — needs padded base64 in the REST path (defect found and fixed on first real run) | SIMULATOR-VERIFIED | — | — | — |
| Lost response → UNKNOWN → reconcile → one payment | VERIFIED (regtest, incl. SIGKILL of the API) | SIMULATOR-VERIFIED | — | — | — |
| Duplicate send refused by the wallet itself | VERIFIED (regtest) | SIMULATOR-VERIFIED | — | — | — |
| Expired invoice / no route / insufficient liquidity | VERIFIED (regtest) | SIMULATOR-VERIFIED | — | — | — |
| Destination / network substitution caught before send | VERIFIED (regtest) | SIMULATOR-VERIFIED | — | — | — |
| 10 concurrent executes → 1 payment | VERIFIED (regtest) | SIMULATOR-VERIFIED (100 payouts × 3) | — | — | — |
| Our-node restart mid-payment; payee offline then retry | VERIFIED (regtest) | — | — | — | — |
| LNURL-pay / Lightning Address end to end | VERIFIED (regtest local LNURL server) | SIMULATOR-VERIFIED | — | — | — |
| Fee limit enforced by wallet | passed through as `fee_limit` — **not separately asserted** | SIMULATOR-VERIFIED | — | — | — |
| Keysend / spontaneous payment | **not supported** by design (invoice-based only) | — | — | — | — |
| Mainnet / testnet | **disabled** / **never run** | n/a | — | — | — |
| Versions tested | LND v0.20.1-beta with Bitcoin Core 29.5 (Core 32.1 rejected by LND v0.20.1) | — | — | — | — |

## What this does and does not allow us to say
- We **can** say: the LND REST adapter was exercised against two real LND nodes on regtest through the failure modes listed, and a produced receipt verifies with `--require-real` against the issuer key.
- We **cannot** say: it works with any other LND version, with remote/hosted LND providers, over Tor, on testnet/mainnet, or with channel/routing conditions that regtest does not produce (probabilistic routing failures, MPP/AMP, long-held HTLCs).
- We **cannot** say anything about NWC, BTCPay or Core Lightning: there is no adapter, so no claim of support, "coming soon" marketing excepted only if it is labelled as roadmap.

## Decision log (why only LND)
LND was the only candidate whose full failure-mode behaviour could be verified here without third-party accounts or spend. NWC needs a relay and a wallet service to test honestly; a mock would only test our own assumptions, so it is not shipped. BTCPay Server and Core Lightning need their own deployments (Docker/binaries) and are the next candidates; each must reach the same "VERIFIED (regtest)" bar above before any row is promoted.

## R3 update (2026-11-11)
| | LND | NWC | BTCPay | Core Lightning |
|---|---|---|---|---|
| Status | **VERIFIED (regtest)** — 15/15 real-node tests re-run today, including the stricter NOT_FOUND rule and connect-time address vetting | **IMPLEMENTED, NOT COMMISSIONED** — 203 contract tests; BIP-340 and NIP-44 official vectors pass; never run against a real wallet service or relay | **IMPLEMENTED, NOT COMMISSIONED** — 54 contract tests; never run against a real BTCPay Server | **NOT STARTED** (no evaluation written) |
| Networks | regtest verified; testnet/mainnet never run (mainnet disabled) | no mandatory network field: the adapter requires the owner's assertion unless the wallet reports one; mainnet needs an explicit opt-in | declared by the operator and checked against the BOLT11 prefix; the API does not expose the node's network | – |
| Reconciliation | lookup by payment hash; absence is authoritative only for LND's own messages | `lookup_invoice`; `PAYMENT_FAILED` is confirmed by lookup before it is believed | lookup by hash; absence is *unknown* unless the operator attests the backend (`trustAbsenceOfPayment`) | – |
| Known limits | – | no fee-limit parameter in NIP-47 (refuses by default); no idempotency key; no NIP-42 | one permission covers pay + lookup + more; 503 can hide a completed payment; payout/pull-payment flow rejected by design | – |
| What is needed to promote | – | a throwaway real NWC wallet + `ORYNT_NWC_URI` and the documented operational test, then wiring (`providers.ts`, config shape, receipt provider kind) | the documented BTCPay regtest procedure (Docker + .NET), then wiring | an evaluation and an adapter |

Execution gate (new): the API refuses to send through any wallet whose payment lookup is `false`, and requires lookup to be `true` for every provider other than LND and the labelled simulator. No row above may be promoted without an operational run recorded in `docs/evidence/`.
