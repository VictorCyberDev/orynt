# Orynt pitch deck: slide-by-slide source (real-regtest edition, 2026-11-11)

**Devpost status: NOT SUBMITTED.** This file is the single source of the deck. `docs/hackathon/deck/build-deck.mjs` parses it (title, the bullets under "On slide", the optional "Image" path) and renders 12 slides, 16:9 (1920x1080), to `docs/hackathon/deck/orynt-deck.pdf` and `docs/hackathon/deck/png/slide-NN.png`: `node docs/hackathon/deck/build-deck.mjs` (Chromium via Playwright). Rendered on 2026-11-11; the speaker notes are not on the slides. About 6 to 7 minutes spoken; the 3-minute video is a separate artifact (`video-script-3min.md`). The Overview accepts "text or video" as the presentation: the PDF (or this text) is the text presentation.

Rules for every number on a slide: it must come from the repository or be labelled hypothesis/assumption; the claim-to-evidence map is `docs/hackathon/evidence-index.md`. Persistent footer on every slide: `Working title. Regtest / test coins only. Not a launched product.` Design tokens: Ink `#0f1b2d`, Paper `#f6f4ee`, Teal `#0e7c73`, uncertain/UNKNOWN indigo `#3a47a8`, simulator purple `#6b3fa0`; fonts Fraunces (titles), Inter (body), JetBrains Mono (code).

## Slide 1. Title

**On slide:**
- Orynt: every payment, under control
- Authorization, single-send safety and verifiable receipts for Lightning payouts
- Dakar Bitcoin Hack 2026 · working title · regtest only
- Not a wallet. Not a launched product.

**Image:** packages/ui/brand/logo.svg
**Speaker notes:** "A tool for a narrow problem: organisations that pay people in bitcoin over Lightning and need three answers. Who authorised this exact payment, was it sent once, and can anyone verify it later. It runs on regtest today and Orynt is a working title." (about 15 s)

## Slide 2. The problem (a hypothesis)

**On slide:**
- Bitcoin teams pay contractors, contributors and suppliers in sats
- Today: obligation in a sheet or chat, approval in a message, payment in a wallet screen, proof as a screenshot
- When the wallet's answer is lost mid-payment: retry and risk paying twice, or stall
- Hypothesis from desk research. No interviews, pilots or users yet

**Speaker notes:** "This description comes from the product brief and from reading how existing tools work. I have not interviewed users, so treat it as a hypothesis. What worries me is the lost response: an idempotency key does not tell you whether the money moved." (about 40 s)
**Evidence:** `docs/product/PRODUCT-BRIEF.md`; `docs/business/thesis-and-falsification.md`.

## Slide 3. Who it is for, and what is not claimed

**On slide:**
- Primary users (hypothesis): the payout operator and approvers at community groups, grant programmes, open-source projects and small Bitcoin businesses
- Cross-border payouts with few people to double-check make mistakes costly
- Not claimed: market size, reach, users, traction
- Plan: 20 structured interviews, at least 4 in Africa, with a written stop criterion

**Speaker notes:** "I think the pain is sharpest for small teams that pay across borders. That is an assumption. If almost nobody has lost or double-paid a payout, this is a plugin, not a product. No reach estimate exists and I will not invent one." (about 40 s)
**Evidence:** `docs/business/icp-and-segments.md`, `interview-guide.md`; `docs/OWNER-REPORT-R2.md` section H (30 organisations researched, none contacted).

## Slide 4. What Orynt is

**On slide:**
- A control layer in front of a wallet you already run; it holds no funds or keys
- Integrates with LND over REST (verified on regtest); labelled simulator for practice
- Obligation, approval, execution, truthful state, evidence
- Billing and e-mail providers are drawn dashed: not commissioned

**Image:** docs/architecture/orynt-architecture.svg
**Speaker notes:** "Orynt sits between the people and the wallet. The wallet keeps the money. Orynt decides who may pay, makes sure the wallet is asked once, tells the truth when it does not know, and produces evidence. It is software that integrates with a wallet; it is not itself a wallet." (about 30 s)

## Slide 5. Authorization: signed approvals

**On slide:**
- Default policy: 1 approver up to 100,000 sats, 2 above; the creator cannot approve
- Approvers sign the exact payment: revision, amount, hash, payee key, expiry, policy, wallet
- Edit anything and earlier approvals are void; roles are re-checked at execution
- Enforced by Orynt, not by the wallet: anyone holding the wallet credential bypasses it

**Image:** docs/hackathon/video/frames/ui/05-approver-signs.png
**Speaker notes:** "The approval is an Ed25519 signature over a digest of the exact payment, made with a key created in the approver's browser. Change the amount or the invoice and the signature no longer matches. Approval and limits live inside Orynt; if somebody has the wallet credential directly, they bypass all of it. That is a stated limit." (about 50 s)
**Evidence:** `packages/core/src/intent.ts`, `policy.ts`; tests "changes when ANY bound field changes", "terms changed after approval", "operators, viewers, API keys and the maker cannot approve".

## Slide 6. Exactly one send, and the UNKNOWN state

**On slide:**
- Reserve in PostgreSQL, mark DISPATCHING, then call the wallet
- Lost response means UNKNOWN, never FAILED; no path from UNKNOWN back to a send
- A second send is refused (HTTP 409) until the wallet's own record is read by payment hash
- Real LND: 10 concurrent executes, 1 payment

**Image:** docs/hackathon/video/frames/ui/08-unknown-send-disabled.png
**Speaker notes:** "This is the part I care about most. If the response is lost, the honest state is 'we don't know'. We show it in indigo, not red, block a second send, and ask the wallet by payment hash. A failure is only recorded when the wallet reports one or we can prove the request never left. The screen is from the real regtest run; the lost response is an injected fault." (about 55 s)
**Evidence:** `packages/core/src/states.ts`; `apps/api/src/services/execution.ts`; `lnd.itest` (10 concurrent executes; lost response); `docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.md`.

## Slide 7. Evidence you can check without us

**On slide:**
- Receipt = agreement + signed approvals + preimage + audit segment + issuer signature + what it cannot prove
- orynt-verify runs offline: explicit trust root, replay ledger, --require-real
- Real receipts: VERIFIED (exit 0); one changed character: REJECTED (exit 1); no trust root: exit 3
- A simulator receipt is refused under --require-real

**Image:** docs/hackathon/video/frames/ui/07-settled-real.png
**Speaker notes:** "A screenshot proves nothing. This receipt includes the preimage, which proves the payee's node released it, and the signed approvals. It also carries its limits: it does not prove the work was done or who the payee is. The audit log is tamper-evident, not immutable." (about 45 s)
**Evidence:** `docs/evidence/verifier-real-2026-11-11.txt`; `packages/verifier/test`.

## Slide 8. What I actually ran (real regtest)

**On slide:**
- pnpm demo:full against Bitcoin Core 29.5 + two LND v0.20.1-beta nodes: all assertions pass (2026-11-11)
- Real payment settled once; lost response (injected) reconciled; API SIGKILLed mid-payment and recovered
- 15 real-LND tests pass; 102 integration, 51 unit, 138 browser checks; 6 CI jobs green
- Regtest only. Never run on testnet or mainnet. Only LND verified

**Image:** docs/hackathon/video/frames/ui/10-resolved-after-uncertainty.png
**Speaker notes:** "This is regtest, with test coins. The fault in stage B is injected by the demo; the payment before it is a real regtest payment. The process kill in stage C is a real SIGKILL. The first real run found three bugs the simulator could not: that is why I trust the real run more than the simulator." (about 45 s)
**Evidence:** `docs/evidence/` (see its README), `docs/EXECUTION-REGISTER.md`.

## Slide 9. Security by design, and what is missing

**On slide:**
- Done: non-custodial; least-privilege roles; wallet permissions discovered; secrets encrypted at rest; validated inputs; tenant isolation; SSRF guards
- Done: TOTP MFA step-up (opt-in per user); hash-chained audit log
- Missing: human audit or pen test (the review was by AI); hardware-backed approval keys; SSO
- Missing: managed-node check against fake-LND "REAL" receipts; mature BOLT11 library

**Speaker notes:** "Security by design here means a small attack surface and refusing by default. I list what I have not done with the same weight as what I have, because a payment tool that overclaims is worse than none." (about 45 s)
**Evidence:** `docs/security/threat-model.md`, `threat-model-r2-delta.md`.

## Slide 10. How it is built

**On slide:**
- TypeScript monorepo; Fastify + PostgreSQL; Zod contract generates OpenAPI 3.1 and a typed SDK
- One wallet interface: LND REST adapter and a labelled simulator; NWC and BTCPay adapters contract-tested against local fakes only, not wired in
- Standalone verifier; deterministic fault injection; operations app and 18-page site
- CI on GitHub: lint, typecheck, tests, real-Lightning job, browser E2E, container build

**Speaker notes:** "Contract-first: one set of schemas validates requests, generates the API document and types the SDK. The wallet interface is small, so another wallet type means implementing the same few methods and passing the same adversarial tests. The NWC and BTCPay adapters are not verified against a real wallet and I make no claim for them." (about 30 s)

## Slide 11. Impact, and how we will find out

**On slide:**
- Hypothesis: one place for obligation, approval, send and proof
- To measure: onboarding completion, time to first authorised payout, exception time-to-resolution, duplicates blocked per 100 payouts (with n)
- No users, revenue, partners or reach estimate exist today
- Kill criterion: if interviews show nobody has lost or doubled a payout, stop

**Speaker notes:** "I am not showing growth numbers because there are none. I am showing what would change my mind." (about 45 s)
**Evidence:** `docs/business/metrics-and-privacy.md`, `go-no-go-framework.md`, `thesis-and-falsification.md`.

## Slide 12. Not verified, next, and the ask

**On slide:**
- Not verified: testnet, mainnet, other wallets, human audit, legal review, hosting, real e-mail and billing, any customer
- Next (plans): interviews, verified NWC and BTCPay adapters, hardware-backed approval keys, mobile-first approvals
- Ask: tell me whether payout control is a real problem; introductions to teams that pay contributors
- Working title; trademark unresolved. Code and evidence: see the Devpost page

**Speaker notes:** "The ask is simple: tell me if this is a real problem. If it is, the next steps are on this slide; if it is not, tell me why." (about 25 s)

---

## Q&A prep (one-liners, all must stay true)

- **Is this a wallet?** No. It is payout-authorization software that integrates with a wallet (LND). The organisers' "wallet implementation" line is unresolved (`rules-checklist.md`).
- **Isn't BTCPay already doing this?** It covers approve-then-pay for payouts. The gaps I am testing are signed approvals bound to the exact payment, the UNKNOWN discipline, and offline-verifiable receipts. The comparison is from documentation only.
- **Did you test on a real node?** Yes, on a local regtest network with two LND v0.20.1-beta nodes and Bitcoin Core 29.5: 15 real-LND tests and the full demo. Not on testnet or mainnet.
- **Why can the idempotency key not solve it?** It stops Orynt processing a duplicate request twice; it cannot tell you whether the wallet paid when the answer was lost.
- **Mainnet?** Disabled by default; never run; a human audit and legal review come first.
- **Other wallets?** NWC and BTCPay adapters are contract-tested against local fakes only and not wired into the API. No claim.
- **Who built it?** One person with an AI coding assistant; commits show it. The security review was also AI-performed.
