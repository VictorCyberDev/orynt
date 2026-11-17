# Orynt: Dakar Bitcoin Hack 2026 submission checklist (refreshed 2026-11-11)

**DEVPOST STATUS: NOT SUBMITTED.** Nothing in this repository submits, posts or sends anything. Deadline (re-verified 2026-11-11 on the official Dates and Overview pages): **Fri 2026-11-20 3:00 PM EST = 20:00 UTC = 21:00 WAT (Lagos) = 20:00 GMT (Dakar)**; the Overview countdown read "9 more days to deadline" today. Internal target: submit by **2026-11-19 20:00 UTC** (24 h margin; advice, not a rule). Authoritative status: `docs/EXECUTION-REGISTER.md`, `docs/R3-CLOSURE-REGISTER.md`; claim map: `evidence-index.md`; rules: `rules-checklist.md`. The registration ID is held by the owner and is deliberately not written in this public repository (it appears in older commits of this repo's history: see A8).

Legend: `[x]` done and verified in this refresh, `[ ]` open. Section A is owner-only and comes first because it can make the rest irrelevant.

---

## A. OWNER DECISIONS (do first)

### A1. Eligibility: now a hard gate, not just a conflict
On 2026-11-11 an organiser account labelled **Manager** answered publicly on the forum: "This hackathon is strictly for students." (https://dakar-bitcoin-hack-2026.devpost.com/forum_topics/45847-eligibility-question-can-non-student-professionals-enter). The Rules tab still says "The participants should reside in Africa"; the Overview says "Students only", "Companies/professional organizations excluded", "Above legal age of majority in country of residence".
- [ ] I am a student (institution: ____ ) and reside in Africa (country: ____ ) and am of age: yes / no
- [ ] If any answer is "no": do not submit on the assumption that it will be accepted. Either obtain written confirmation from the organisers (`organizer-inquiry.md`, **drafted, not sent**) or stop. Record the decision and date: ____
- [ ] Enter as an individual, never under a company name
- [ ] Solo entry confirmed (no page states it; the forum asker assumed it)

### A2. Wallet requirement (still unanswered)
The Overview's "What to Submit" says "At least, a bitcoin/lightning wallet implementation"; the Rules tab does not. Orynt is payout-authorization software that integrates with an existing LND wallet. It is not a wallet.
- [ ] Send the inquiry (`organizer-inquiry.md`) from your own identity, or decide to proceed without an answer and record it: ____
- [ ] All materials use the honest wording ("payout-authorization software that integrates with a Lightning wallet"; never "wallet implementation"). Devpost text section 4 "Track fit" does this
- [ ] If the answer is "wallet mandatory": (a) submit anyway and say so, (b) withdraw. Building a thin wallet is not recommended (contradicts the non-custodial design)

### A3. Name and trademark
`docs/brand/name-clearance.md` shows conflicts (GitHub user `orynt` taken, domains held, possible pending marks, unverified). Decide: keep "Orynt" as a disclosed working title for the hackathon (all materials already say "working title") or rename now (cost: `@orynt/*` scopes, brand files, `orynt-verify`, docs, deck, video). Decision and date: ____

### A4. Licence and open source
`LICENSE` is Apache-2.0; `package.json` files say Apache-2.0. The Overview says "results are open-source" (no licence named).
- [ ] Owner confirms Apache-2.0 for the whole repository (fonts and brand assets carry their own licences)
- [ ] Organisers' answer or recorded assumption that any OSI licence and author-held IP are fine

### A5. Disclosures
- [x] AI-assisted development disclosed in `README.md` and `devpost-entry.md` section 12
- [ ] Pre-existing work: repository history starts 2026-11-09 (inside the window; 36+ commits, all 2026-11-09 to 2026-11-11). Add any earlier work honestly: ____
- [x] "Working title", "regtest only", "practice mode labelled", "not a wallet / not a custodian" appear in README, Devpost text, video and deck

### A6. Repository default branch (found in this refresh)
The GitHub repository `VictorCyberDev/orynt` is **public** (GitHub API, 2026-11-11) with licence Apache-2.0, but its default branch `main` contains only the baseline (`README.md`, `LICENSE`, `.gitignore`). All work is on branch `claude/busy-goodall-ajeb0p`, 35 commits ahead, draft PR #1 (open, not merged). A judge who opens the repo link lands on an empty project.
- [ ] Decide how judges will see the code: merge PR #1 to `main` (recommended; only the owner does this, after reviewing), or link the branch URL on Devpost
- [ ] After that, open the repository logged out and confirm `README.md` with the status table, `docs/evidence/` and the verifier receipts are visible

### A7. Hosting decision
No deployment exists. `R` accepts "a MVP accessible through internet (or a demo video)", so a video plus a public repo satisfies it. Recommended: no hosted backend (`deployment-plan.md`). Owner approval is required for any hosting, domain or paid plan; none was taken. Decision: ____

### A8. Registration ID in public history
The registration ID appears in older commits of the public repository (earlier versions of `rules-checklist.md` and `submission-checklist.md`); the current files no longer contain it. Removing it from history would require a history rewrite and force-push, which this refresh did not do and which is the owner's call. Decide whether that matters: ____

---

## B. LINK AND ASSET VISIBILITY CHECKLIST (tick each only after opening it logged out / in a private window)

| Item | What to check | Done |
|---|---|---|
| Devpost project page | Status is **Submitted** (a draft is not a submission); appears in the gallery; screenshot of the submitted state saved with timestamp | [ ] |
| Code repository link | public, default branch has the code (A6), README renders with the status table and the SVG diagram | [ ] |
| `docs/evidence/` | demo transcript, verifier transcript, receipts and the real-lightning test log are visible | [ ] |
| Demo video | uploaded; plays logged out; duration at or below 3:00 (`ffprobe`); description repeats the disclosure and "working title"; captions track attached or burned in | [ ] |
| Deck | `docs/hackathon/deck/orynt-deck.pdf` opens; or the text is pasted on Devpost | [ ] |
| Architecture image | `docs/architecture/orynt-architecture.svg` (or the `.png`) uploaded to the gallery | [ ] |
| Gallery images | UNKNOWN screen, settled screen, verifier VERIFIED/REJECTED (from `docs/hackathon/video/frames/`): no secrets, real names or balances | [ ] |
| "Try it out" link | none; write "Run locally: see README" (nothing is hosted) | [ ] |
| Links inside Devpost text | every link opens (repo files, evidence) | [ ] |
| Quickstarts | README Quickstart A on a clean machine (target 2026-11-18) | [ ] |
| No secrets in the repo | `.regtest/`, macaroons, `.env*` absent; gitleaks passes on CI (green on the PR branch) | [x] CI secret scan green; [ ] final check on the merged commit |

---

## C. REQUIRED BEFORE SUBMISSION (engineering and content)

### C1. Evidence (now present)
- [x] Real regtest run: `pnpm regtest:fetch` (= `bash infra/regtest/fetch.sh`), `node infra/regtest/up.mjs`, `pnpm test:real-lightning` (15/15), `pnpm demo:full` (all assertions) on 2026-11-11, plus the earlier 2026-11-10 run. Files: `docs/evidence/` (see its README)
- [x] Verifier transcripts incl. `--require-real`, tamper and no-trust-root (`docs/evidence/verifier-real-2026-11-11.txt`)
- [ ] Re-run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` on the final commit and update the counts if they changed (this refresh re-ran only `test:real-lightning`, `demo:full`, one integration test and `pnpm lint`; the 102 / 51 / 138 figures are from the 2026-11-10 register run)
- [ ] CI green on the final commit (6 jobs; last observed success: runs 43003470141 push and 43003477584 PR on 2026-11-11)

### C2. Repository and docs
- [x] Root `README.md`: what it is, honest status table, quickstarts that were run, architecture, constraints, metrics to track, next steps, AI disclosure
- [x] Architecture diagram (Mermaid + `orynt-architecture.svg`/`.png`) in `docs/architecture/`
- [x] Threat model linked (`docs/security/`); described as AI-reviewed, never as an audit
- [ ] **Two quickstart defects found while testing (not fixed here; code is outside this task's scope):** (1) the demo seed fails with `entitlement_exceeded` on the default free plan (workaround `ORYNT_DEFAULT_PLAN=enterprise`); (2) `pnpm start` serves 404 for `/` and `/app/` because the bundled server does not find `apps/web/dist` / `apps/site/dist` (workaround `ORYNT_WEB_DIST`, `ORYNT_SITE_DIST`; the Dockerfile sets them). Fix both or keep the documented workarounds
- [ ] `pnpm test:e2e` script names `run.mjs`; the file is `run.cjs` (call it directly, as the docs do)
- [ ] Docker/compose/`infra/deploy/*` remain unverified templates (the image builds and starts on GitHub CI only). `infra/deploy/render.yaml` sets `ORYNT_SEED_DEMO=1` (public password): do not use unchanged
- [ ] Working tree committed by the owner (this refresh edits files but never commits); includes `docs/hackathon/**`, `docs/evidence/*`, `docs/architecture/*`, `README.md`
- [ ] Fresh-clone test on a clean machine following only the README

### C3. Video and deck
- [x] Silent captioned 3-minute cut rendered: `docs/hackathon/video/orynt-demo-silent-captioned.mp4` (179 s, 3.4 MB) from real captures (`video-script-3min.md`)
- [ ] Voice-over recorded and `captions.en.srt` re-timed (or publish the silent captioned cut as is)
- [ ] Optional: a live screen recording instead of screenshots (plan in the script)
- [x] Deck rendered: `docs/hackathon/deck/orynt-deck.pdf` (12 slides) and `deck/png/`
- [ ] Every claim in video, deck and Devpost matches the evidence (`evidence-index.md`); re-check after any change

### C4. UX checks the Overview asks for
- [ ] Automated checks only (138 browser checks at 375/768/1440 px, axe). No low-bandwidth or mid-range-phone measurement, no human testing: say "untested", never "optimised for low bandwidth"
- [ ] Local-impact text has no invented figures; reach stated as "not estimated"

### C5. Devpost form
- [ ] Fill every field from `devpost-entry.md` (delete bracketed pointers and placeholders; keep the track-fit paragraph)
- [ ] Team/individual setting matches A1
- [ ] Click **Submit**; confirm "Submitted" status

### C6. Communication ("build in public")
- [ ] One honest progress post by the owner (what works, what does not, regtest only, working title). Nothing was drafted or sent here. No vote solicitation; Devpost's update warns against tampering with or compensating voters
- [ ] Ask the organisers whether public votes (open until 2026-11-24) affect the prizes (in `organizer-inquiry.md`)

---

## D. POST-HACKATHON (not needed to submit)

Trademark/domain work; human security review and pen test; 20 structured interviews (at least 4 in Africa) and the go/no-go review; counsel for Nigeria, Senegal/UEMOA, Kenya, South Africa; verified NWC/BTCPay adapters against real counterparts; hardware/passkey approval keys; staging deployment, real e-mail and billing only with owner approval (`docs/OWNER-REPORT-R2.md` section K).

## E. Day plan (UTC; WAT is UTC+1)

| Date | Do |
|---|---|
| Wed 11-11 | Read this file; decide A1 (student/residence) and send the inquiry (A2) if eligible |
| Thu 11-12 | A3, A4, A6 decisions; merge or link branch |
| Fri 11-13 | Review video and deck; record voice-over if wanted; fix or accept the two quickstart defects |
| Sat 11-14 to Sun 11-15 | Fresh-clone test; update counts after a final test run |
| Mon 11-16 | If no organiser answer: decide at own risk and record it; upload video |
| Tue 11-17 to Wed 11-18 | Devpost form as draft; section B checklist logged out |
| Thu 11-19 | **Submit by 20:00 UTC**; screenshot of the submitted state |
| Fri 11-20 | Buffer. **Hard deadline 20:00 UTC** |

## F. Email to organisers

Ready to send, not sent: `organizer-inquiry.md` (English, French, short forum version).

## G. Facts this refresh could not verify (owner to check)

- Devpost registration, project draft state, form field names and limits (login required)
- Whether you qualify under "Students only" / "reside in Africa" (owner facts)
- Organisers' answers to the open questions (wallet requirement, solo entry, public votes, prize payout)
- Whether the forum Manager's statement will be reflected on the official pages
- Fresh-machine behaviour of the quickstarts (tested here on one Linux x86_64 machine only)
