# Orynt pitch deck: slide-by-slide source

Status: draft source — video/deck unrendered; real-regtest evidence pending. **DECK: UNRENDERED** (no .pptx, .pdf or images exist). **Devpost status: NOT SUBMITTED.**
Reconciled 2026-11-09 with the committed branch (HEAD `78990af`). 12 slides, 16:9, about 6 to 7 minutes spoken (the 3-minute video is a separate artifact, `video-script-3min.md`). The Overview accepts "text or video" as the presentation; this deck can be exported to PDF as the text presentation.

## 0. Build notes

- **Variants.** Slides 8 and 12 have an A text (real regtest run completed) and a B text (simulator only). Keep the one that is true; delete the other. Nothing on slide 8 may be filled in before the run exists.
- **Design.** Use the brand tokens in `packages/ui/tokens.css`: Ink `#0f1b2d`, Paper `#f6f4ee`, Teal `#0e7c73` (primary), Cobalt `#2f5fd0`, Sand `#e7e0cf`; state colours: uncertain/UNKNOWN indigo `#3a47a8`, proven failure red `#a3301f`, settled green `#17663f`, simulator purple `#6b3fa0`. Fonts: Fraunces (titles), Inter (body), JetBrains Mono (code). Logo/mark files: `packages/ui/brand/` (SVG and PNG). One idea per slide, at most 6 short bullets, 28 pt minimum body text, contrast at least 4.5:1.
- **Persistent footer on every slide:** `Working title. Regtest / test coins only. Not a launched product.`
- **Rendering options (none has been run):** build by hand in Google Slides or PowerPoint; or write the bullets below as Marp markdown and export with `npx @marp-team/marp-cli deck.md --pdf` (Marp not evaluated here). Export a PDF and also paste the text into Devpost if "text" is chosen.
- **Rule for every number on a slide:** it must come from the repository (test counts, defaults) or be labelled "assumption". Test counts (`docs/EXECUTION-REGISTER.md`, 2026-11-09): integration 55 pass + 8 skipped (adversarial 32, security-regression 13, ops 7, load 1, flow 2; the 8 skipped are real-LND), unit core 24, verifier 26, contract 1; browser E2E 100/100. Update if the suite changes.

---

## Slide 1. Title

**On slide:** Orynt. "Every payment. Under control." Subtitle: "Authorization, single-send safety and verifiable receipts for Lightning payouts." Name, date, "Dakar Bitcoin Hack 2026", "Working title". `[PLACEHOLDER: owner name, repo URL]`
**Visual:** logo (`packages/ui/brand/logo.svg`), calm paper background.
**Speaker notes:** "I'm going to show a tool for a narrow problem: organisations that pay people in bitcoin over Lightning and need to know three things: who authorised this exact payment, was it sent once, and can anyone verify it later. It is regtest-only today and it is a working title." (about 15 s)

## Slide 2. The problem

**On slide:** Bitcoin teams pay contractors, contributors and suppliers in sats. Today: obligation in a sheet or chat; approval in a message; payment in a wallet screen; proof as a screenshot. When the wallet's answer is lost mid-payment: retry (risk paying twice) or stall (someone unpaid, support load).
**Visual:** four boxes (Sheet / Chat / Wallet / Screenshot) with arrows that do not connect; a "?" over the wallet box. Tag: "Hypothesis from desk research, not validated".
**Speaker notes:** "This description comes from the product brief and from reading how existing tools work. I have not yet interviewed users, so treat it as a hypothesis. The part that worries me is the lost response: an idempotency key doesn't tell you whether the money moved." (about 40 s)
**Claim source:** `docs/product/PRODUCT-BRIEF.md` "The problem"; `docs/business/thesis-and-falsification.md`.

## Slide 3. Who it is for, and why Africa

**On slide:** Primary users (hypothesis): the payout operator and the approvers at Bitcoin-native community groups, grant programmes, open-source projects and small Bitcoin businesses. Cross-border payouts to contractors and contributors make mistakes costly. Not claimed: market size, users, traction.
**Visual:** three role icons (Maker, Approver, Operator) and a "Not validated yet" stamp.
**Speaker notes:** "I think the pain is sharpest for small teams that pay across borders and have few people to double-check. That is an assumption. The plan is twenty structured interviews, at least four with African teams, and a pre-written kill criterion: if almost nobody has lost or double-paid a payout, this is a plugin, not a product." (about 40 s)
**Claim source:** `docs/business/icp-and-segments.md`, `docs/business/interview-guide.md`, `docs/research/differentiation-review.md` section 4.
**Judge-facing weak spot, say it:** no reach estimate exists; I will not invent one.

## Slide 4. What Orynt is

**On slide:** A control layer in front of a wallet you already run. It does not hold funds. 1. Obligation (decoded, bound invoice). 2. Approval (policy plus signed approvals). 3. Execution (exactly one send). 4. Truthful state (UNKNOWN is not FAILED). 5. Evidence (receipt plus offline verifier).
**Visual:** architecture diagram from `devpost-entry.md` section 7.
**Speaker notes:** "Orynt sits between the people and the wallet. The wallet keeps the money. Orynt decides who may pay, makes sure the wallet is asked once, tells the truth when it does not know, and produces evidence." (about 30 s)

## Slide 5. Authorization: maker-checker with signed approvals

**On slide:** Policy: up to 100,000 sats needs 1 approver, above needs 2 (defaults). By default the creator cannot approve. Approvers sign the exact payment: revision, amount, payment hash, payee node key, invoice expiry, policy, wallet. Edit anything and old approvals are void. Roles are checked again at execution.
**Visual:** a payout card with a digest short-hash and two signature ticks; a crossed-out "creator approves".
**Speaker notes:** "The approval is not a click in a log; it is an Ed25519 signature over a digest of the exact payment. If someone changes the amount or the invoice after approval, the signatures no longer match. Approval and limits are enforced inside Orynt, not by the wallet. If somebody has the wallet credential directly, they bypass all of it. That's a stated limit." (about 50 s)
**Evidence:** `packages/core/src/intent.ts`, `policy.ts`; tests "intent digest and approvals > changes when ANY bound field changes", "terms changed after approval → approvals void…", "approver loses their role AFTER approving → execution refused (revoked role)".

## Slide 6. Exactly one send, and the UNKNOWN state

**On slide:** Reserve in PostgreSQL, mark DISPATCHING, then call the wallet. Lost response means UNKNOWN (never FAILED); no path from UNKNOWN to a send state. Second send refused (HTTP 409) until the wallet's own record is read by payment hash. Settled only with a preimage that hashes to the invoice and the approved amount. Test: 20 concurrent executes, 1 wallet send.
**Visual:** state diagram: APPROVED → RESERVED → DISPATCHING → {SETTLED | PENDING | UNKNOWN → RECONCILING → SETTLED / FAILED}. UNKNOWN in indigo.
**Speaker notes:** "This is the part I care about most. If the response is lost, the honest state is 'we don't know'. We show it in indigo, not red, block a second send, and ask the wallet by payment hash. A failure is only recorded when the wallet reports one, or we can prove the request never left. An expired invoice alone does not count as proof." (about 55 s)
**Evidence:** `packages/core/src/states.ts`; `apps/api/src/services/execution.ts`, `reconcile.ts`; tests listed in `evaluation-matrix.md` C7. Candid note for Q&A: idempotency and approvals are not novel; the claimed contribution is the combination and the UNKNOWN discipline.

## Slide 7. Evidence you can check without us

**On slide:** Receipt = agreement + signed approvals + preimage + audit segment + issuer signature + a list of what it cannot prove. `orynt-verify` runs offline: trust root, replay ledger, freshness, `--require-real`. Simulator receipts verify only as "verified-simulated". Test: change characters at ~400 positions, zero accepted.
**Visual:** verifier output with PASS lines; second panel `REJECTED` after one character is changed.
**Speaker notes:** "A screenshot proves nothing. This receipt includes the preimage, which proves the payee's node released it, and the approvals, which prove who signed what. It also carries its own limits: it does not prove the work was done or that the payee is who they say. The audit log is tamper-evident, not immutable." (about 45 s)
**Evidence:** `packages/verifier/src/verify.ts`, `cli.ts`; `packages/core/src/receipt.ts` (`RECEIPT_LIMITATIONS`). Note: run the CLI via `pnpm exec tsx packages/verifier/src/cli.ts` (the built `dist` file currently fails).

## Slide 8. Demo evidence (choose A or B)

**[A] On slide:** "What I ran" with the real transcript excerpt from `docs/evidence/<timestamp>/`: network regtest, 30,000-sat payment approved by a different person than its author, injected lost response, 409, reconciliation from LND's record, real process kill and recovery, receipt `VERIFIED`, tampered `REJECTED`. Commit hash, LND and Bitcoin Core versions (`infra/regtest/versions.env`). `[PLACEHOLDER: only after pnpm demo:full has been run on the owner's machine; evidence file docs/evidence/demo-real-regtest-<stamp>.md]`
**[B] On slide:** "What I ran": `pnpm demo:full:sim` (all assertions pass, stamped SIMULATED, `docs/evidence/demo-simulator-*.md`) and 55 integration tests on real PostgreSQL with a labelled simulator; the real LND adapter exists, its 8 acceptance tests are skipped, and it **has not been run against a node**. List the test titles for duplicate-send, lost-response and tamper cases.
**Visual:** terminal screenshot (real) or test output (B), with a disclosure badge.
**Speaker notes (A):** "This is regtest. The fault in the middle is injected by the demo; the payment before it is real regtest. Here is the receipt and the check." **(B):** "I could not run a real node in time. Every payment in my tests goes through a simulator that is labelled everywhere and cannot produce a real-looking result. The Lightning adapter is written but unproven; that is the first thing I would run next." (about 45 s)

## Slide 9. Security by design, and what is missing

**On slide:** Done: non-custodial; least-privilege roles; wallet permissions discovered, fee capped, single path; secrets encrypted at rest; validated inputs; CSRF/origin checks; tenant isolation; SSRF guard on webhooks and LND URLs; append-only hash-chained audit. Missing: a human audit or pen test (the threat model rests on one independent AI review: 15 findings fixed with regression tests), MFA/SSO, hardware-backed approval keys (the console key lives in the browser), the approval screen signing a server-supplied digest, "REAL" receipts from a fake LND endpoint, LND behaviour unverified on a real node, a mature BOLT11 library (own codec checked against spec vectors).
**Visual:** two columns, "Done and tested" and "Not done", equal visual weight.
**Speaker notes:** "Security by design here means a small attack surface and refusing by default. But I'm listing what I haven't done with the same weight as what I have, because a payment tool that overclaims is worse than none." (about 45 s)
**Evidence:** `evaluation-matrix.md` C2 table.

## Slide 10. How it is built

**On slide:** TypeScript monorepo; Fastify + PostgreSQL; Zod contract generating OpenAPI 3.1 and a typed SDK; LND REST adapter and labelled simulator behind one provider interface; standalone verifier; deterministic fault injection; 55 integration + 51 unit tests (2026-11-09), browser E2E 100/100, operations console and marketing site served by the API. Docker and deploy templates exist but are unverified.
**Visual:** package map: `core`, `contract`, `wallets`, `verifier`, `sdk`, `ui`, `apps/api`, `apps/web`.
**Speaker notes:** "Contract-first: one set of schemas validates requests, generates the API document and types the SDK. The wallet interface has four methods, so adding another wallet type means implementing four methods and passing the same adversarial tests." (about 30 s)

## Slide 11. Impact and how we will find out

**On slide:** What changes for the user (hypothesis): one place for obligation, approval, send, proof. What we will measure: onboarding completion, time to first authorised payout, exception time-to-resolution, duplicates blocked per 100 payouts (with n), regtest/simulator separated from real funds. Next 90 days: 20 interviews, regtest pilots, legal review before real funds, go/no-go. No users, revenue or partners exist today.
**Visual:** a plain table of metric / question / decision; no charts of invented data.
**Speaker notes:** "I'm not showing growth numbers because there are none. I'm showing what would change my mind. If interviews show nobody has had a lost or duplicated payout, I stop." (about 45 s)
**Evidence:** `docs/business/metrics-and-privacy.md`, `go-no-go-framework.md`, `thesis-and-falsification.md`.

## Slide 12. Next iteration and ask

**On slide:** Next: [A] repeat the regtest run on signet and review the LND error mapping / [B] run the real LND path on regtest first. Then: README and threat model; passkey or hardware-backed approval keys; Nostr Wallet Connect adapter; Lightning-address payees; mobile-first approval; interviews in Dakar, Lagos, Nairobi. Ask: feedback from Bitcoin builders on whether payout-control is a real problem; introductions to teams that pay contributors. Repo `[PLACEHOLDER]`. Working title; trademark unresolved.
**Visual:** a short roadmap line, then the repo URL and a QR code (generate only after the repo is public).
**Speaker notes:** "The ask is simple: tell me if this is a real problem. If it is, the next steps are on this slide; if it isn't, tell me why." (about 25 s)

---

## Q&A prep (one-liners, all must stay true)

- **Is this a wallet?** No. It is a payer-side control layer with a wallet adapter. (Organisers' wallet requirement is unresolved; see `submission-checklist.md`.)
- **Isn't BTCPay already doing this?** It covers approve-then-pay for payouts. The gaps I am testing are signed approvals bound to the exact payment, the UNKNOWN discipline, and offline-verifiable receipts. The comparison is from documentation only.
- **Did you test on a real node?** `[A: only on a local regtest network, see evidence folder] [B: no]`.
- **Why can the idempotency key not solve it?** It prevents a duplicate request from being processed twice by Orynt; it cannot tell you whether the wallet paid when the answer was lost.
- **Mainnet?** Disabled by default; not tested; legal review required first.
- **Who built it?** One person with an AI coding assistant; commits show it.
