# Orynt: Dakar Bitcoin Hack 2026 submission checklist

Status: draft source — video/deck unrendered; real-regtest evidence pending.
**DEVPOST STATUS: NOT SUBMITTED.** (Not verifiable from here: the registration ID 3424410 and the submission state need a Devpost login. Nothing in the repo or in these files claims a submission.)
Reconciled 2026-11-09 with the committed branch (HEAD `78990af`; status table `docs/EXECUTION-REGISTER.md`). Deadline **Fri 2026-11-20 20:00 UTC = 21:00 WAT (Lagos) = 20:00 GMT (Dakar)** (3:00 PM EST on the Devpost pages; see `rules-checklist.md` section 1). 11 days remain. Internal target: submit by **2026-11-19 20:00 UTC** (24 h of margin; advice, not a rule).

Legend: `[ ]` open, `[x]` done. Nothing below is ticked because nothing has been confirmed by the owner. Section A items are decisions only the owner can make; they come first because they can make the rest irrelevant.

---

## A. OWNER DECISIONS: REQUIRED-BEFORE-SUBMISSION (do first, by 2026-11-10)

### A1. Eligibility conflict (can disqualify the entry)

The Rules tab (`R`) says participants "should reside in Africa". The Overview (`O`) says "Students only", "Companies/professional organizations excluded", "Above legal age of majority", "All countries/territories, excluding standard exceptions" (undefined). The two pages disagree and the Rules tab is a short summary, not legal Official Rules (`rules-checklist.md` section 0).

- [ ] I reside in Africa (country: `____`)
- [ ] I am a student (yes / no / unclear): `____`. If no, the Overview's "Students only" may exclude me
- [ ] I am above the age of majority in my country of residence
- [ ] I am entering as an individual, not as a company or professional organisation
- [ ] My country is not covered by the undefined "standard exceptions"
- [ ] Organisers confirmed in writing which text prevails (`R` vs `O`) and that I qualify, or I have decided to proceed at my own risk and recorded that decision: `____`
- [ ] Solo entry confirmed allowed (no page states it)

**Do not spend further build time on the submission until at least the organisers' answer or a recorded owner decision exists.**

### A2. Wallet requirement (could make the entry non-compliant)

`O` lists "At least, a bitcoin/lightning wallet implementation". Orynt is not a wallet: it never holds keys or balances, and contains only a payer-side LND adapter plus a simulator (`evaluation-matrix.md` C8).

- [ ] Ask the organisers whether a payout-authorization layer in front of an LND wallet satisfies this (email text in section E)
- [ ] Decision if the answer is "wallet required": (a) submit anyway and say so openly, (b) withdraw, or (c) scope a thin wallet feature. **Not recommended: (c).** It contradicts the non-custodial design and is unreviewed key-handling code
- [ ] Wording chosen for Devpost: never call the adapter "a wallet implementation" unless the organisers say so

### A3. Name and trademark risk

`docs/brand/name-clearance.md` (not legal advice; sandbox searches only): GitHub username `orynt` is taken by another account; `orynt.com/.io/.co` are held and parked for sale (`.com` listed at a high price); `orynt.dev` is in use by another site; an aggregator snippet reports a pending **ORYNT** US application (serial 99583221, class 32, unverified) plus near-identical ORYN OS (99101760) and THE ORYN (99746736) filings (unverified). The stop conditions in its section 6 may already apply.

- [ ] Decide: keep "Orynt" as a disclosed working title for the hackathon, or rename now
- [ ] If keeping: say "working title" in the Devpost text, README, video and deck; do not buy domains or file marks; do not use an org name that collides with the existing `orynt` GitHub account
- [ ] If renaming: cost is repo/package scope `@orynt/*`, `packages/ui/brand/*`, `orynt-verify`, HTTP problem URIs `https://orynt.dev/problems/...`, all docs, and the deck/video; decide by 2026-11-12 or keep the name
- [ ] Manual searches in `name-clearance.md` section 5 (USPTO TSDR for the three serials, WIPO, EUIPO/TMview, OAPI) scheduled after the hackathon, or done now by the owner
- [ ] Note the HTTP problem-type URI points at `orynt.dev`, a domain owned by someone else; change it before any real release

### A4. Licence and open-source obligations

`LICENSE` is Apache-2.0 and all `package.json` files say `"license": "Apache-2.0"`, but `docs/business/pricing-hypotheses.md` says the licence is "not yet decided". The Overview says "results are open-source"; no licence is specified.

- [ ] Owner confirms Apache-2.0 is intended for the whole repository (including `apps/`, `docs/`, brand assets, fonts' own licences)
- [ ] Organisers confirm (or owner records the assumption) that any OSI licence satisfies "open-source" and that IP stays with the author
- [ ] Third-party licence check done (`pnpm licenses list` or equivalent; not run here)

### A5. Disclosures the rules are silent on (default: disclose)

- [ ] AI-assisted development disclosed in README and Devpost (commits carry `Co-Authored-By: Claude`). Rules do not address AI coding aids
- [ ] Pre-existing work: all 15 commits are dated 2026-11-09 (after the window opened 2026-10-26). Owner adds any earlier work honestly: `____`
- [ ] "Working title", "regtest only", "simulator labelled", "not a custodian" present in all materials

### A6. Hosting decision

- [ ] Choose: **A. video + repo only (recommended)** / S. static pages / B-C. hosted simulator sandbox (not recommended; see `deployment-plan.md`). Record the date and choice: `____`
- [ ] If any hosting: owner approval recorded, nothing purchased

### A7. Real regtest run: owner and dates

The real Lightning path (`packages/wallets/src/lnd.ts`) has never run against a node: the build sandbox refused to execute the downloaded `bitcoind`/`lnd`. The scripts now exist but were never executed: `pnpm regtest:fetch`, `pnpm regtest:up`, `pnpm test:real-lightning` (8 tests, skipped), `pnpm demo:full`. The simulator equivalent `pnpm demo:full:sim` passes and is the fallback.

- [ ] Owner machine has `bitcoind` and `lnd` runnable (the build sandbox blocked executing them)
- [ ] Gate G1 2026-11-13: `pnpm regtest:fetch && pnpm regtest:up` succeed and `pnpm test:real-lightning` passes (not skipped); fix first-run problems in `infra/regtest/` and `packages/wallets/src/lnd.ts`
- [ ] Gate G2 2026-11-14: `pnpm demo:full` passes twice (scenarios A-D) and writes `docs/evidence/demo-real-regtest-*.md`
- [ ] Gate G4 2026-11-16: choose main cut (real) or fallback (simulator); text variants A/B in `devpost-entry.md` follow this decision

---

## B. REQUIRED BEFORE SUBMISSION (engineering and content)

### B1. Evidence

- [ ] Run `pnpm regtest:fetch && pnpm regtest:up && pnpm test:real-lightning && pnpm demo:full` on the owner's machine **twice**; keep `docs/evidence/demo-real-regtest-<stamp>.{md,json}`, the receipts, versions (`infra/regtest/versions.env`) and a redacted transcript; keep failing runs too
- [ ] If the real run fails on first contact (likely; LND error classification is unproven), fix it and re-run, or take the simulator fallback (`pnpm demo:full:sim`, already verified) and use Devpost variant B
- [ ] Commit one real and one simulator sample receipt so judges can run the verifier without a server (simulator samples already exist: `docs/evidence/receipt-simulator-*.json`)
- [ ] Re-run `pnpm test:integration` and `pnpm test` on the final commit; paste the counts into the README (register, 2026-11-09: integration 55 pass + 8 skipped; unit core 24, verifier 26, contract 1; browser E2E 100/100)
- [ ] Update `docs/EXECUTION-REGISTER.md` and `docs/evidence/README.md` after the real run (M2 regtest row, M4 LND row, `demo:full`, `test:real-lightning`)

### B2. Repository and docs

- [ ] Verifier bundle is fixed; confirm `pnpm --filter @orynt/verifier build && node packages/verifier/dist/orynt-verify.mjs --help` works on a clean clone
- [ ] `pnpm test:e2e` still names `apps/web/e2e/run.mjs`; the file is `run.cjs` (fix the script or document `node apps/web/e2e/run.cjs`)
- [ ] Check the **README** (now ~50 lines) against the required sections: setup, architecture diagram (`devpost-entry.md` section 7; `docs/architecture/` exists), constraints, metrics to track (`docs/business/metrics-and-privacy.md`), next iteration, AI disclosure, honest limits, how to run tests and the demo
- [ ] `docs/security/threat-model.md` exists (AI-reviewed only): link it from the README and the Devpost text; do not call it an audit
- [ ] Docker/compose/`infra/deploy/*` are UNVERIFIED templates: either build once on a machine with Docker and record it, or label them unverified in the README. `infra/deploy/render.yaml` as written sets `ORYNT_SEED_DEMO=1` (public password): do not use unchanged
- [ ] Working tree clean and committed (`git status`), including `docs/hackathon/*` (all files in this folder are new and uncommitted at the time of writing)
- [ ] Repository is **public**, visible logged out, default branch contains the code (README currently refers to branch `claude/busy-goodall-ajeb0p`; make sure judges land on it)
- [ ] No secrets, macaroons, `.env`, `.regtest/` in history (`git log -p | grep -i macaroon`, secret scanner)
- [ ] Fresh-clone test on a clean machine/VM following only the README (target 2026-11-18)

### B3. Video and deck (both UNRENDERED today)

- [ ] Record per `video-script-3min.md` (main cut) or the fallback cut; badge and disclosure burned in
- [ ] Re-time `captions.en.srt` (or `captions.fallback-sim.en.srt`) to the final voice-over
- [ ] `ffprobe` duration at or below 3:00; upload; open the link logged out
- [ ] Render `pitch-deck-source.md` to PDF (slides 8 and 12 variant chosen); text version also pasted if "text" is the chosen presentation
- [ ] Every claim in video, deck and Devpost matches the evidence folder

### B4. UX checks the Overview asks for (not done)

- [ ] The console has automated checks only (E2E 100/100 at 375/768/1440 px, axe, screenshots in `docs/evidence/screenshots/`). Optionally measure payload sizes on throttled "Slow 4G" and do a manual phone test; otherwise say it is untested. Do not claim "optimised for low bandwidth" without numbers
- [ ] Local-impact paragraph contains no invented figures; reach stated as "not estimated"

### B5. Devpost form

- [ ] Fill every field from `devpost-entry.md` (choose variant A or B; delete bracketed notes)
- [ ] Links: public repo, video, deck/text, evidence folder. "Try it out": leave empty or "run locally"
- [ ] Team/individual setting matches A1
- [ ] Click **Submit** (a saved draft is not a submission). Confirm the project appears under "My projects" as submitted and in the gallery as required; screenshot saved with timestamp
- [ ] Re-open the public project page logged out and click every link

### B6. Communication ("build in public")

- [ ] One honest progress post (what works, what does not, regtest-only, working title). No vote solicitation, no claims of users or traction. Platform and frequency are not specified by the rules
- [ ] Ask in the organisers' Discord/Telegram whether public voting affects winners (voting 2026-11-09 to 2026-11-24)

---

## C. POST-HACKATHON (not needed to submit)

- [ ] Trademark/domain work per `docs/brand/name-clearance.md` section 5 and 7; pick and clear a final name
- [ ] Human review of the threat model and a penetration test; first external review of signing, reservation and reconciliation paths before any real-funds pilot (`docs/business/security-due-diligence.md` 1.3)
- [ ] 20 structured interviews with the plan in `docs/business/interview-guide.md` (at least 4 in Africa); fill the scorecard; apply `docs/business/go-no-go-framework.md` 90 days after
- [ ] Counsel for Nigeria, Senegal/UEMOA, Kenya, South Africa before any pilot (`docs/business/legal-regulatory-register.md`, all items NOT STARTED)
- [ ] Run F1 and F2 from `docs/research/differentiation-review.md` section 4 (does LND already refuse a duplicate send for the same hash; BTCPay edit-after-approve behaviour)
- [ ] Hardware- or passkey-backed approval keys; per-workspace failpoints; MFA; recompute the digest client-side before signing; managed-node allow-list against fake-LND receipts
- [ ] Additional wallet adapters (NWC), LNURL/Lightning-address payees, mobile-first approval UX, measured low-bandwidth performance, reviewed French and local-language copy
- [ ] Build and run the `Dockerfile` / compose file once a Docker daemon is available; verify or delete `infra/deploy/*`
- [ ] Hosting only per `deployment-plan.md` (production mode cannot run the simulator, so a public instance cannot demo payments)

---

## D. Day-by-day plan (UTC dates; WAT is UTC+1)

| Date | Do |
|---|---|
| Mon 11-09 | Decisions A1-A5 started; email organisers (section E); commit decisions |
| Tue 11-10 | A1-A4 recorded; start `infra/regtest` and `demo-full` |
| Wed 11-11 | Regtest nodes up; first real payment by hand |
| Thu 11-12 | Name decision deadline (A3); `demo-full` stages S0-S6 |
| Fri 11-13 | Gate G1; stages S7-S9 |
| Sat 11-14 | Gates G2, G3; record footage |
| Sun 11-15 | README, threat model, register update; commit uncommitted work that works |
| Mon 11-16 | Gate G4: main vs fallback cut; fix verifier build and missing scripts |
| Tue 11-17 | Edit video, captions, deck PDF |
| Wed 11-18 | Fresh-clone test; Devpost form complete as draft; links verified |
| Thu 11-19 | **Submit by 20:00 UTC**; screenshot of submitted state |
| Fri 11-20 | Buffer. **Hard deadline 20:00 UTC** |

## E. Draft email to organisers (contact@dakarbitcoindays.com; also ask in Discord)

> Subject: Dakar Bitcoin Hack 2026: three eligibility and scope questions (registration 3424410)
>
> Hello, I am entering as an individual. The Rules tab says participants "should reside in Africa", while the Overview says "Students only", "Companies/professional organizations excluded" and "All countries/territories, excluding standard exceptions". (1) Which text governs, and does my situation qualify? `[state country, student status]` (2) The Overview lists "at least a bitcoin/lightning wallet implementation". My project is a payout authorization and reconciliation layer that sits in front of an existing LND wallet (it does not hold funds). Is that acceptable? (3) Is a demo video acceptable instead of a hosted MVP, is a regtest-only prototype acceptable, which open-source licence is expected, and is AI-assisted development permitted with disclosure? Also: do public votes count toward winners? Thank you.

## F. Facts I could not verify (owner to check)

- Devpost registration ID, project draft state, form field names and limits (login required)
- Whether the repository has a remote and is public; whether the default branch is the intended one
- Organisers' answers to every question in `rules-checklist.md` section 8
- Real-network behaviour of the LND adapter (never executed); exact LND error strings (`AlreadyExistsError` etc.) across versions
- Free-tier terms of any host at the time you deploy (read on 2026-11-09 only)
- Whether the web console and site build and run (uncommitted at time of writing)
