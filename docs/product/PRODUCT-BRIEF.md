# Orynt — product brief (source of truth for writers)

> Status rule for anyone writing docs: describe a capability as **built** only if `docs/EXECUTION-REGISTER.md`
> lists it as VERIFIED. Everything else must be worded as "designed", "planned" or "hypothesis".
> Never invent customers, metrics, partners, certifications, testimonials, prices as facts, or legal conclusions.

**Name:** Orynt (provisional; no trademark/domain clearance). **Tagline:** Every payment. Under control.
**Category:** Bitcoin-native financial operations and payment authorization infrastructure.
**First product:** Lightning Payout Operations — an authorization-to-settlement layer in front of an existing
Lightning wallet/node (it does not custody funds; the operator connects a wallet they control).

## The problem
Bitcoin-native organisations that pay contractors, contributors, grant recipients, suppliers or users repeatedly
keep the obligation (spreadsheet/chat), the approval (chat/verbal), the execution (wallet UI) and the evidence
(screenshots) in different places. When a wallet response is lost mid-payment nobody can tell whether money moved,
so people either retry (risking a double payment) or stall (support load, weak accountability).

## What Orynt does (design)
1. **Obligation** — operator creates/imports a payout: payee, exact amount (integer millisatoshis), BOLT11 invoice.
   Invoice is decoded and its signature verified; network, amount, expiry and payee node key are bound to the record.
   Edits create immutable revisions; an edit invalidates earlier approvals.
2. **Approval** — a policy decides how many approvers are needed (maker-checker, thresholds, limits). Approvers sign
   the exact *intent digest* with a device-held Ed25519 key. Roles are checked at approval *and* again at execution.
3. **Execution** — a single-use, durable execution intent is reserved in PostgreSQL inside a transaction, then the
   wallet adapter is called. The adapter is chosen per workspace: real LND (REST) on regtest, or a clearly labelled simulator.
4. **Truthful state** — states are monotonic and evidence-based:
   DRAFT → AWAITING_APPROVAL → APPROVED → EXECUTION_RESERVED → DISPATCHING → PENDING | UNKNOWN → RECONCILING →
   SETTLED | DEFINITIVELY_FAILED (plus REJECTED / CANCELLED only before any dispatch; SIMULATED_SETTLED for simulator).
   A lost response is **UNKNOWN/RECONCILING, never FAILED**, and a second send is refused until the provider's
   authoritative record (looked up by payment hash) says what happened. An expired invoice is not proof of failure.
5. **Evidence** — a versioned receipt binds agreement hash, approvals (with signatures), payee/payer/amount/invoice and
   the provider-sourced payment result including the **payment preimage** (sha256(preimage) = payment hash, which is
   cryptographic proof of payment independent of Orynt). A standalone verifier CLI checks it offline and rejects tampered,
   replayed, stale or forged receipts. A receipt cannot prove: delivery/quality of work, legal enforceability, absence of
   other payments, or trustless escrow.
6. **Developer platform** — REST + OpenAPI, typed TypeScript SDK, signed webhooks, CLI.

## Honest limits (must appear wherever relevant)
- Not a custodian, exchange, escrow, lender, trading tool, or autonomous AI spender.
- Approval/limit enforcement is application-level; funds protection is only as strong as the wallet permissions given to Orynt.
- Audit log is tamper-*evident* (hash chain + signed checkpoints), not immutable: a database administrator can rewrite rows.
- Local development uses Bitcoin regtest only. No mainnet execution is enabled by default.
- Commercial viability, willingness to pay, and market size are **unvalidated hypotheses**.
