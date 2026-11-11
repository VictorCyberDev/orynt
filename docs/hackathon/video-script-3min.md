# Orynt 3-minute demo video: script, storyboard, production notes (real-regtest edition, 2026-11-11)

**Devpost status: NOT SUBMITTED.** A silent, captioned cut was produced locally on 2026-11-11 from real captures: `docs/hackathon/video/orynt-demo-silent-captioned.mp4` (1920x1080, 30 fps, **179.0 s**, 3.4 MB, H.264 + a silent AAC track). **There is no voice-over**; the captions carry the narration (`docs/hackathon/captions.en.srt`, 35 cues, same timing as the burned-in captions). It has **not been uploaded anywhere**. Rebuild: `node docs/hackathon/video/tools/build-video.mjs` (needs the frames in `docs/hackathon/video/frames/`, Chromium via Playwright, ffmpeg). The real UI captures come from `pnpm exec tsx docs/hackathon/video/tools/capture-real-ui.mts` against the running regtest network (`demo-runbook.md` section 4).

Narrative follows the Overview's "problem -> solution -> impact -> next steps". "Impact" is deliberately thin: no user, interview, reach figure or traction exists, so the video says so instead of inventing any.

## 0. Rules for this video (all met by the produced cut)

1. **Disclosure on every frame.** Persistent badge top-left `REGTEST · TEST COINS ONLY`; a full-screen disclosure card at 0:32-0:38.
2. **Every scene carries a source tag, top-right**, and a one-line note under the picture where needed:
   - `REAL REGTEST · BROWSER`: screenshot of the real operations app during the real regtest run (frames `video/frames/ui/`).
   - `REAL REGTEST · FAULT INJECTED`: same, in the scene where the lost response is a failpoint (note says so on screen).
   - `TRANSCRIPT OF THE REAL RUN`: excerpt of the `pnpm demo:full` transcript (`docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.transcript.txt`), rendered as terminal text. It is a rendering of the recorded text, **not a live screen recording**.
   - `REAL RECEIPT · VERIFIER OUTPUT`: real output of `orynt-verify` on real receipts (elided lines are marked on screen).
   - `PRACTICE MODE · TEST OUTPUT`: real test output on the labelled simulator wallet (the maker-cannot-approve test); labelled on screen as not from the regtest run.
   - `ILLUSTRATIVE`: the two problem cards (mock-ups); labelled as a hypothesis from desk research.
   - `DIAGRAM`, `DISCLOSURE`, `LIMITS AND NEXT STEPS`: slides.
3. **The lost response is an injected fault** (failpoint `execute.after_provider_response`) and the video says "we inject a fault". The payment behind it is a real regtest payment. The process kill (scene 15) is a real `SIGKILL`, delivered by a failpoint to the API process itself right after LND accepted the payment; the on-screen note says "A failpoint sends SIGKILL to the API process itself".
4. No invented statistics, customers, partners, endorsements or live URL. No music. No real names, balances or secrets on screen (the app shows only the wallet label; invoices are regtest).
5. Caveat for honesty: the app screenshots were taken from the working tree's build, which contains in-progress UI work from parallel workstreams (for example a "Get started" menu item that is not part of the verified 138-check suite). The payment flows shown are the verified ones.

## 1. Storyboard, timed captions and claim check

The captions below are the burned-in narration (35 caption cues; two per scene). "Evidence" is where each on-screen claim is backed. Scene length in seconds; start-end times are cumulative.

| # | Time | Source tag | Picture | Caption (verbatim) | Evidence for what is shown / said |
|---|---|---|---|---|---|
| 1 | 0:00-0:10 | ILLUSTRATIVE | cards: chat "ok, approved", wallet "Send", screenshot "proof" | "Organisations that pay people in bitcoin often approve in a chat message, pay from a wallet screen, and keep a screenshot as proof." | hypothesis, labelled on screen; `docs/product/PRODUCT-BRIEF.md`, `docs/business/icp-and-segments.md` |
| 2 | 0:10-0:20 | ILLUSTRATIVE | same cards + "?" over the wallet and a "Send again?" duplicate | "When the wallet's answer is lost mid-payment, nobody knows whether the money moved. So people retry and risk paying twice, or wait and leave someone unpaid." | hypothesis, labelled; no user evidence exists |
| 3 | 0:20-0:32 | DIAGRAM | `docs/architecture/orynt-architecture.svg` | "Orynt sits in front of a Lightning wallet you already run. It never holds your funds. It decides who may pay, sends exactly once, and keeps the proof." Note: "Not a wallet: payout-authorization software that integrates with an existing LND wallet" | `docs/architecture/ARCHITECTURE.md`; diagram marks NWC/BTCPay as contract-tested only and billing/e-mail as not commissioned |
| 4 | 0:32-0:38 | DISCLOSURE | full-screen card | "The payments you will see run on Bitcoin regtest: a local test chain with worthless coins." | `infra/regtest/up.mjs` aborts on a non-regtest chain; mainnet disabled |
| 5 | 0:38-0:48 | REAL REGTEST · BROWSER | `ui/01-invoice-decoded.png`: new-payout page, invoice pasted, "What this invoice says": 30,000 sats, regtest, expiry, issuing node, signature valid | "An operator pastes Bob's invoice. Orynt decodes it and shows amount, network, expiry and the issuing node." | `lnd.itest` "my independent BOLT11 decoder agrees with a real LND-issued invoice"; `packages/core/test/bolt11.test.ts` |
| 6 | 0:48-0:57 | PRACTICE MODE · TEST OUTPUT | verbose vitest line + the default policy | "Default policy: one approver up to 100,000 sats, two above. The maker cannot approve their own payout. Operators and API keys cannot approve." | `packages/core/src/policy.ts` `DEFAULT_POLICY_RULES`; test "operators, viewers, API keys and the maker cannot approve" (run 2026-11-11, simulator). The real run itself uses one approver (30,000 sats) and does not demonstrate a refused self-approval |
| 7 | 0:57-1:07 | REAL REGTEST · BROWSER | `ui/05-approver-signs.png`: approval dialog with exact terms and the digest the approver signs | "The approver signs the exact payment with a key created in their browser. Change any field afterwards and the signature stops counting." | `packages/core/src/intent.ts`; `adversarial.itest` "terms changed after approval"; the key is in browser storage (stated limit) |
| 8 | 1:07-1:15 | REAL REGTEST · BROWSER | `ui/06-approved-ready.png` | "Execute: Orynt first reserves a single-use send in PostgreSQL, then asks Alice's LND node to pay." | `docs/architecture/ARCHITECTURE.md` execution protocol; `lnd.itest` real execution |
| 9 | 1:15-1:26 | REAL REGTEST · BROWSER | `ui/07-settled-real.png`: "Settled — proof in hand" | "Settled with proof in hand: the preimage matches the invoice's payment hash. Only then does Orynt call a payout settled." | `applyRecord` requires sha256(preimage) = hash; demo stage A |
| 10 | 1:26-1:37 | TRANSCRIPT OF THE REAL RUN | stage A excerpt | "Bob's node independently shows the invoice paid, with the same preimage. Excerpt of the recorded demo:full run." | `demo-real-regtest-2026-11-11T10-26-29-483Z.md` stage A |
| 11 | 1:37-1:47 | REAL REGTEST · FAULT INJECTED | `ui/08-unknown-send-disabled.png`: indigo "We lost the wallet's answer — checking its record" | "Now the failure that causes double payments. In this run we inject a fault: the answer is lost after LND accepted the payment." Note on screen: lost response is an injected failpoint, payment is real | demo stage B; `lnd.itest` lost-response test |
| 12 | 1:47-1:56 | REAL REGTEST · FAULT INJECTED | `ui/09b-unknown-actions-send-disabled.png`: Send disabled, reason in words, "Check the wallet's record now" | "Orynt does not call it failed. The state is unknown, and Send is switched off with the reason written out in plain words." | `docs/evidence/screenshots/1440/05-payout-unknown-signature-moment.png` (practice); real run `ui/` |
| 13 | 1:56-2:07 | TRANSCRIPT OF THE REAL RUN | stage B excerpt | "A second send is refused with HTTP 409: the first attempt may already have paid. Reconciling by payment hash finds LND's own record: settled, one payment." | demo stage B lines (HTTP 202 UNKNOWN, `send_blocked_unresolved`, SETTLED, "LND shows exactly one successful payment") |
| 14 | 2:07-2:16 | REAL REGTEST · BROWSER | `ui/10-resolved-after-uncertainty.png` | "The payout settles from the wallet's own record. The receipt says it was settled after an uncertain moment." | receipt B `settlement.reconciled_after_uncertainty: true` (`frames/ui/receipt-B.json`) |
| 15 | 2:16-2:28 | TRANSCRIPT OF THE REAL RUN | stage C excerpt incl. `[failpoint] ... killing process` | "We also killed the API process with SIGKILL right after LND accepted a payment. After restart: unknown, never failed. Reconciled to settled. One payment." | demo stage C; `failpoints.ts` sends `SIGKILL` to its own process |
| 16 | 2:28-2:41 | REAL RECEIPT · VERIFIER OUTPUT | `orynt-verify` on receipt A: checks, `VERDICT: VERIFIED`, `exit=0` | "A standalone command verifies the receipt offline: approvals, preimage, audit chain. Verified, exit code 0, and --require-real would refuse a simulator receipt." Note: the trust key is passed in by the caller | `docs/evidence/verifier-real-2026-11-11.txt` (full output; simulator receipt refused, exit 1) |
| 17 | 2:41-2:51 | REAL RECEIPT · VERIFIER OUTPUT | tampered receipt: `✘ attestation.signature`, `✘ agreement.hash`, `VERDICT: REJECTED`, `exit=1`, memo diff | "Change a single character of the receipt. Rejected, exit code 1." | same file; `packages/verifier/test` |
| 18 | 2:51-2:59 | LIMITS AND NEXT STEPS | two columns: not verified / next (plans) | "Limits today: regtest only, LND only, application-level enforcement, no human audit, no users. Working title, not a launched product." | `docs/hackathon/evidence-index.md` section C |

Not shown, on purpose: the real-LND SIGKILL as a screen recording (only its transcript), a two-approver payout (not demonstrated in the real run), any mainnet/testnet, any customer, any hosted URL, the in-browser verifier verdict (the verdict is below the fold in the captured page; the terminal verifier is used instead).

## 2. What is NOT produced and how to finish (owner)

- **Voice-over: not recorded.** The 35 captions are the narration; read them at about 120 words per minute (about 330 words total) or tighten them, then re-time `captions.en.srt` to the recording. Record in a quiet room, 48 kHz mono WAV, normalise (untested on your ffmpeg build): `ffmpeg -i vo-raw.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 vo.wav`. Mux: `ffmpeg -i docs/hackathon/video/orynt-demo-silent-captioned.mp4 -i vo.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest orynt-demo-vo.mp4`.
- **Live screen recording: not produced.** The cut uses screenshots and rendered transcript text. If you prefer motion, re-run the two commands in the runbook while OBS records (1920x1080, 30 fps), keep the same tags and notes, and keep the total at or below 3:00.
- **Upload: not done.** Upload only after the eligibility decision (`rules-checklist.md`), then open the link logged out and tick the checklist in `submission-checklist.md` section B3. The organisers have not stated a maximum video length (the Overview mentions a 3-minute demo).
- Check duration after any change: `ffprobe -v error -show_entries format=duration -of csv=p=0 docs/hackathon/video/orynt-demo-silent-captioned.mp4` (must be at or below 180).

## 3. Style notes (as built)

Dark ink background `#0f1b2d`; amber badge `#f2c14e`; tag colours: green real, purple practice, grey illustrative, blue slide. Fonts: Inter (text), JetBrains Mono (terminal), Fraunces (titles). Captions are burned into the frames at 42 px, at most two lines, each cue shown for 2.8 s or more, at most 16.6 characters per second. State colours follow the product: uncertain = indigo, never red. Accessibility: captions present, no flashing, colour never the only signal (state names are written).

## 4. Files

`docs/hackathon/video/orynt-demo-silent-captioned.mp4` (the cut), `docs/hackathon/captions.en.srt` (sidecar captions), `docs/hackathon/video/frames/ui/` (real UI captures and the two real receipts they produced), `docs/hackathon/video/frames/term/` (real verifier outputs and the tampered receipt), `docs/hackathon/video/tools/capture-real-ui.mts` and `build-video.mjs` (reproduce everything). Total size of `docs/hackathon/video/` is about 6 MB. The older simulator-fallback caption file was deleted: the real run replaced the fallback plan.
