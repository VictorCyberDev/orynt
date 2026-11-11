# Architecture

Orynt is an authorization-to-settlement layer in front of a Lightning wallet the customer controls. It never holds funds.

Rendered diagram (also usable as a Devpost gallery image): [`orynt-architecture.svg`](orynt-architecture.svg) (PNG copy: `orynt-architecture.png`). It uses three fills: verified by running it, labelled practice mode, and not commissioned / not verified against the real thing.

```mermaid
flowchart LR
  subgraph Clients
    UI["Browser: operations app (apps/web)<br/>approver Ed25519 key stays in the browser"]
    SDK["Developer systems<br/>@orynt/sdk, API keys (never approve)"]
  end
  subgraph Server["Orynt server (one Node process)"]
    API["Fastify API<br/>contract-first routes, roles, policy"]
    SVC["Services<br/>obligations, approvals, execution,<br/>reconcile, receipts, audit chain"]
    W["Worker (in-process)<br/>reconcile, recovery, webhooks, mail"]
    PG[("PostgreSQL 16<br/>state, audit hash chains,<br/>outbox, leases, idempotency")]
    WP["Wallet provider contract<br/>(packages/wallets)"]
  end
  UI --> API
  SDK --> API
  API --> SVC
  W --> SVC
  SVC --> PG
  SVC --> WP
  WP --> LND["LND REST adapter<br/>VERIFIED on regtest (v0.20.1-beta)"]
  WP --> SIM["Simulator<br/>labelled, never REAL"]
  WP -.-> NWC["NWC / BTCPay adapters<br/>contract-tested vs local fakes only, not wired in"]
  LND --> NODE[("Your Lightning node<br/>funds and keys stay here<br/>regtest only")]
  SVC --> R[["Signed receipt JSON"]]
  R --> V["orynt-verify CLI / library<br/>offline, explicit trust roots, --require-real"]
  API -- "HMAC-signed, at-least-once" --> HOOK["Customer webhook receiver"]
  W -.-> BILL["Billing provider (Stripe/Paystack parsers, sandbox)<br/>NOT COMMISSIONED"]
  W -.-> MAIL["E-mail provider (outbox / Resend client)<br/>NOT COMMISSIONED"]
  classDef ok fill:#e3f1ee,stroke:#0e7c73;
  classDef sim fill:#efe8f7,stroke:#6b3fa0;
  classDef nc fill:#f1f1f1,stroke:#6b7280,stroke-dasharray:5 3;
  class LND,V ok;
  class SIM sim;
  class NWC,BILL,MAIL nc;
```

### Component status (what was actually run)

| Component | Status | Evidence |
|---|---|---|
| API, services, worker, PostgreSQL schema and migrations | verified on real PostgreSQL 16 (integration suite, 102 pass at the 2026-11-10 register run) | `docs/EXECUTION-REGISTER.md` |
| LND REST adapter | **verified on regtest** (LND v0.20.1-beta, Bitcoin Core 29.5): 15 real-LND tests and `pnpm demo:full` incl. SIGKILL recovery, re-run 2026-11-11 | `docs/evidence/real-lightning-test-2026-11-11.txt`, `docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.md` |
| Simulator wallet | verified; labelled everywhere; can never produce a real settlement | `adversarial.itest`, `docs/evidence/demo-simulator-*.md` |
| NWC / BTCPay adapters | implemented in `packages/wallets/src/{nwc,btcpay}`, **contract-tested against local fakes only, not wired into the API, never run against a real wallet or server; no claim of support** | `docs/product/nwc-adapter.md`, `docs/product/btcpay-adapter.md`, `docs/product/wallet-capability-matrix.md` |
| Core Lightning | not started | same |
| Receipts + `orynt-verify` | verified: 26 verifier tests; real receipts verify with `--require-real` | `docs/evidence/verifier-real-2026-11-11.txt` |
| Webhooks (HMAC, retry, replay/dedupe) | verified in the integration suite against a local receiver | `apps/api/test/ops.itest.ts` |
| Billing provider (Stripe/Paystack parsers, sandbox) | **implemented, not commissioned**: signatures checked against locally computed values only; no provider account, no live webhook, no charge | `docs/OWNER-REPORT-R2.md` section E |
| E-mail provider | **implemented, not commissioned**: mail goes to an outbox; no sending domain or key; no real delivery | `docs/OWNER-REPORT-R2.md` sections B, K |
| Hosting, backups/PITR, TLS, monitoring | **do not exist** (Dockerfile builds and starts on GitHub CI only; deploy templates unverified) | `docs/ops/production-readiness.md` |


## Packages

| Package | Role | Depends on |
|---|---|---|
| `@orynt/core` | amounts (bigint msat), canonical JSON, BOLT11 decode/encode, state machine, roles, policy, intent digest, approvals, audit chain, receipt schema | noble/scure, zod |
| `@orynt/wallets` | provider contract; LND REST adapter; labelled simulator | core |
| `@orynt/contract` | zod schemas + route table → validation, OpenAPI, SDK types | core |
| `@orynt/verifier` | standalone receipt verifier (library + single-file CLI) | core |
| `@orynt/sdk` | typed client, webhook verification, approval signing helpers | contract, core |
| `@orynt/api` | Fastify server, services, migrations, worker | all of the above |
| `@orynt/web` | operations app (React/Vite) | sdk, verifier, core |
| `@orynt/site` | static marketing site | — |

## The lifecycle (single authoritative state on the obligation)

`DRAFT → AWAITING_APPROVAL → APPROVED → EXECUTION_RESERVED → DISPATCHING → PENDING | UNKNOWN → RECONCILING → SETTLED | SIMULATED_SETTLED | DEFINITIVELY_FAILED`; `REJECTED`/`CANCELLED` only before any dispatch. Transition table: `packages/core/src/states.ts`.

## Invariants and where each is enforced

| # | Invariant | Code | Database |
|---|---|---|---|
| 1 | Only an approved, immutable obligation may reach wallet dispatch | `executeObligation` → `gate()` re-derives revision hash, intent digest, policy, limits, invoice expiry, wallet capability, and re-verifies every approval signature **and the approver's current role** | `obligation_revisions` append-only trigger |
| 2 | Execution is bound to exact invoice/hash, amount, payee, network, expiry, policy revision, approval, workspace | `intentDigest()` (core/intent.ts); `payment_intents.binding` | `UNIQUE(org_id,payment_hash)`, `UNIQUE(obligation_id,revision)` |
| 3 | One obligation never causes two economic executions | state CAS; reserve→mark-DISPATCHING→call ordering | partial unique index `one_open_attempt` (≤1 open attempt per intent); `invoice_claims` (one invoice ↔ one live payout) |
| 4 | Concurrency, duplicate webhooks and restarts cannot bypass control | row lock (`FOR UPDATE`) + CAS `UPDATE … WHERE state=$from`; leases for reconcilers; recovery sweeps | `provider_events UNIQUE(connection,event_id)`; idempotency table |
| 5 | A wallet response is not proof | `applyRecord`: success requires `sha256(preimage)==payment_hash` and matching amount, else UNKNOWN + critical incident | — |
| 6 | Simulator can never produce real settlement | `assertTransition`: `SETTLED` rejects `providerKind=simulator`; `SIMULATED_SETTLED` rejects anything else; gate refuses simulator in production | `SIMULATED_SETTLED` is a distinct state |
| 7 | Permissions fail closed; capabilities discovered not assumed | `hasPermission` (unknown role → deny); LND `checkpermissions`; stale (>24h) capability list blocks sends | — |
| 8 | Verifier has explicit trust roots | `verifyReceipt`: no trust root ⇒ at most `INTEGRITY_ONLY` | — |
| 9 | Refund/void/compensation is a separate economic act | no edit path exists after dispatch; `SETTLED` has no outgoing transition | revisions immutable |
| 10 | Audit is tamper-**evident**, not immutable | `appendAudit` hash chain per stream; signed checkpoints in receipts; `/v1/audit/verify` | append-only trigger (a DBA can still disable it — documented) |

## The execution protocol (why a crash cannot cause a double send)

1. **Preflight** (no locks): ask the wallet for `getinfo`; network must match.
2. **Reserve** (one transaction, row-locked): re-run `gate()`, insert intent + attempt `RESERVED`, CAS `APPROVED→EXECUTION_RESERVED`, append audit. Commit.
3. **Mark dispatching** (second transaction): CAS `→DISPATCHING`, attempt `DISPATCHING`. Commit. **This commits before any wallet call.**
4. **Call the wallet.** Only here does money move.
5. **Persist the outcome**: success (verified preimage) → settled; terminal failure reported by the wallet → `DEFINITIVELY_FAILED`; request provably never sent → `DEFINITIVELY_FAILED(NOT_SENT)`; *anything else* (timeout, reset, 5xx, already-exists, crash) → `UNKNOWN`.

Crash windows: before 2 commits → nothing happened; between 2 and 3 → `EXECUTION_RESERVED` is released by the sweep because `DISPATCHING` never committed (so the wallet provably wasn't called); after 3 → `DISPATCHING` with no outcome becomes `UNKNOWN` on restart. `UNKNOWN → RECONCILING` is the only exit: the worker asks the wallet by payment hash. `NOT_FOUND` never closes an obligation by itself; an authorised person may `confirm-not-sent` only with a fresh `NOT_FOUND`, an **expired invoice**, and the send-timeout grace elapsed — and that act is audited and attributed.

## What is application-level vs wallet-enforced

Approvals, limits, maker-checker and roles are enforced **by Orynt**, not by the wallet. Anyone holding the LND credential Orynt was given can spend within what that credential allows, bypassing Orynt. We recommend an `offchain:read/write + info:read` macaroon and discover what the credential allows; we cannot detect that it is *too strong*. Wallet credentials are stored AES-256-GCM encrypted (key in `ORYNT_SECRET_KEY`, bound to the row id); the plaintext exists in server memory while in use.

## Persistence

PostgreSQL only. Money is `bigint` msat (max 2.1e18 < 9.22e18) parsed as `BigInt`, never as a JS number; API amounts are decimal strings. Migrations are SQL up/down files run under an advisory lock, one transaction each, with checksum-drift detection. Durable jobs are rows (`next_reconcile_at`, `webhook_deliveries`), so a restart loses nothing. No Redis or queue.

## Decisions (short ADRs)

- **TypeScript monorepo, Fastify, `pg`, no ORM.** SQL is where the safety properties live; an ORM would hide them.
- **Contract-first routes.** One zod table drives validation, OpenAPI and SDK types, preventing drift (`packages/contract`).
- **Own BOLT11 decoder** (tested against the spec's vectors and cross-checked against real LND-issued invoices on regtest in `lnd.itest`): the verifier must not trust a node or a library for the facts it certifies.
- **Approvals are Ed25519 signatures over an intent digest, made in the browser.** Orynt can verify but not forge. Trade-off: the key is in `localStorage` (a stolen profile could sign). Production should use WebAuthn/hardware keys.
- **Single process with an in-process worker.** Simple and sufficient for a pilot; multi-instance needs only the existing leases/locks, but has not been exercised.
- **LND first.** LND is the only wallet verified against a real node (regtest). NWC and BTCPay adapters exist as packages and are contract-tested against local fakes only (not wired into the API); no real wallet or server was available to verify them, so they carry no claim of support (`docs/product/nwc-adapter.md`, `btcpay-adapter.md`) (see `docs/product/wallet-capability-matrix.md`).
