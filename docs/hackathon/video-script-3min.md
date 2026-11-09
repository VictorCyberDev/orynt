# Orynt 3-minute demo video: script, storyboard, recording plan

Status: draft source — video/deck unrendered; real-regtest evidence pending. **VIDEO: UNRENDERED. Devpost status: NOT SUBMITTED.**
Reconciled 2026-11-09 with the committed branch (HEAD `78990af`); the recording commands are now `pnpm regtest:fetch && pnpm regtest:up && pnpm demo:full` (primary) and `pnpm demo:full:sim` (labelled fallback). Companion files: `captions.en.srt` (main), `captions.fallback-sim.en.srt` (simulator fallback), `demo-runbook.md` (what the on-screen terminal must show).

Target length 3:00 (the Overview page suggests a 3-minute demo; no hard limit is stated; keep it at or below 3:00). Language: English. Narrative follows the Overview's "problem → solution → impact → next steps":
African Bitcoin business payout problem → Orynt authorization (maker/checker, signed approvals) → genuine Lightning payout on regtest → uncertain network response → refused duplicate → reconciliation → receipt verifier (one-character tamper rejected) → next steps / market expansion.

## 0. Rules for this video (non-negotiable)

1. **Disclosure on screen.** A persistent badge top-left for the **entire** video: `REGTEST - TEST COINS ONLY` (main cut) or `SIMULATOR - NO REAL PAYMENT` (fallback cut). A full-screen 3-second disclosure card at 0:34.
2. **Only show what was actually recorded.** Every "real Lightning" shot must come from an actual `pnpm demo:full` run on the owner's machine (`scripts/demo-full.ts`, written but **never run in real mode**; to be verified by running it on the owner's machine). If that run does not happen, use the fallback cut and never call it real.
3. **The lost response is an injected fault** (failpoint `execute.after_provider_response`), and the voice-over says "we inject a fault". The payment behind it is real regtest in the main cut. (The demo also performs a real `SIGKILL` of the API process, scenario C; it is not in the 3-minute cut.)
4. No invented statistics, customers, partners, endorsements or live URL. The problem statement is a hypothesis, labelled as such on screen.
5. Illustrative chat/spreadsheet visuals in the first 22 seconds are **mock-ups and are labelled "Illustrative"**. Do not show real people's messages or any real wallet balances.

## 1. Go / no-go gates before recording

| Gate | Date | Condition | If it fails |
|---|---|---|---|
| G1 | 2026-11-13 | `pnpm regtest:fetch && pnpm regtest:up` work and `pnpm test:real-lightning` no longer skips (the 8 gated adapter tests pass) | Plan the fallback cut (section 7) |
| G2 | 2026-11-14 | `pnpm demo:full` passes (scenarios A-D, `demo-runbook.md` section 3) twice in a row and writes `docs/evidence/demo-real-regtest-*.md` | Record only the stages that pass; label the rest as not shown; or fall back |
| G3 | 2026-11-14 | Optional: the web console (`/app/`, E2E 100/100 on the simulator) works against the real LND connection when you start the API yourself and connect alice | Use **Variant T** (terminal only) for all shots |
| G4 | 2026-11-16 | Final cut decision: main (real regtest) vs fallback (simulator) | Fallback is mandatory if G1 or G2 failed |
| G5 | 2026-11-18 | Video uploaded as a link that works logged-out; duration checked with `ffprobe` | Re-export |

## 2. Voice-over, timed (main cut)

Speaking rate about 120 words per minute, 356 words total. `captions.en.srt` is generated from this exact text (37 caption blocks, at most two lines of 46 characters, reading speed at or below 20 characters per second). Re-time the SRT after the real voice-over is recorded.

| # | Time | VO (spoken text) |
|---|---|---|
| 1 | 0:00.0–0:05.0 | African Bitcoin businesses and communities pay contractors and contributors in sats. |
| 2 | 0:05.0–0:11.0 | The approval is a chat message. The payment is a wallet screen. The proof is a screenshot. |
| 3 | 0:11.0–0:17.0 | When the wallet's answer is lost mid-payment, nobody knows whether the money moved. |
| 4 | 0:17.0–0:22.0 | So people retry and pay twice, or wait and leave someone unpaid. |
| 5 | 0:22.0–0:28.0 | Orynt sits in front of a wallet you already run. It never holds your funds. |
| 6 | 0:28.0–0:34.0 | It decides who may pay, makes sure a payment is sent once, and keeps the proof. |
| 7 | 0:34.0–0:40.0 | Everything you will see runs on Bitcoin regtest. These are test coins, not real money. |
| 8 | 0:40.0–0:47.0 | A maker enters a payout for Bob. Orynt decodes his invoice and binds the amount, node and expiry. |
| 9 | 0:47.0–0:54.0 | The default policy needs one approver for 30,000 sats, and two above 100,000. |
| 10 | 0:54.0–1:00.0 | The maker cannot approve their own payout. Refused. |
| 11 | 1:00.0–1:09.0 | The approver signs the exact payment with their own key. Change any field and the signature stops matching. |
| 12 | 1:09.0–1:15.0 | Roles are checked again at execution, not just at approval. |
| 13 | 1:15.0–1:22.0 | Execute. Orynt first reserves a single-use intent in PostgreSQL, then asks Alice's LND node to pay. |
| 14 | 1:22.0–1:31.0 | The node routes the payment over a regtest channel and returns the preimage. |
| 15 | 1:31.0–1:39.0 | Orynt checks the preimage hashes to the invoice, and only then marks the payout settled. |
| 16 | 1:39.0–1:45.0 | Bob's node independently shows the invoice as paid. |
| 17 | 1:45.0–1:53.0 | Now the failure that causes double payments. We inject a fault: the response is lost after the wallet accepted the payment. |
| 18 | 1:53.0–2:00.0 | Orynt does not call it failed. The state is unknown, and sending again is blocked. |
| 19 | 2:00.0–2:07.0 | Someone presses execute again. Refused: the first attempt may already have paid. |
| 20 | 2:07.0–2:15.0 | Reconciliation asks the wallet for its own record by payment hash. Settled. One send, one payment. |
| 21 | 2:15.0–2:22.0 | Orynt issues a signed receipt: the agreement, the approvals, the preimage and the audit chain. |
| 22 | 2:22.0–2:30.0 | A standalone command checks it offline, without contacting Orynt. Verified. |
| 23 | 2:30.0–2:40.0 | Now we change a single character of the receipt. Rejected. |
| 24 | 2:40.0–2:48.0 | Next: more wallet adapters, mobile-first approvals, and interviews with African Bitcoin teams to test whether this pain is real. |
| 25 | 2:48.0–2:55.0 | Limits today: regtest only, application-level enforcement, and an audit log that is tamper-evident, not immutable. |
| 26 | 2:55.0–2:59.5 | Orynt. Every payment, under control. |

Claim check for each line (all must stay true at recording time):
- 8: invoice decode and binding of amount, payee node key, expiry: `packages/core/src/bolt11.ts`, `intent.ts`; test "rejects garbage, tampered and wrong-network invoices".
- 9: `DEFAULT_POLICY_RULES` in `packages/core/src/policy.ts`: up to 100,000 sats one approver, above that two. `demo-full` pays 30,000 sats (one approver). A two-approver payout (above 100,000 sats) is not in the script; show it in the console or in a test if you want it on screen.
- 10: policy `requireDistinctMaker`, bound to the author of the **current revision** (test group "maker–checker uses the author of the CURRENT revision" in `security.itest.ts`); refusal text "Policy requires someone other than the creator to approve."; test "operators, viewers, API keys and the maker cannot approve". `demo-full` only asserts "approved by a different person than its creator"; the refusal itself is **not** in the script, so show it as a clearly labelled inset (test output or console on the simulator) or drop the line.
- 11: the approver (singular in `demo-full`) signs `intentDigest`; test "changes when ANY bound field changes"; "terms changed after approval → approvals void; old signature cannot be replayed on the new revision".
- 12: test "approver loses their role AFTER approving → execution refused (revoked role)".
- 13: phases in `services/execution.ts`; **LND call real only in the main cut**.
- 15: `applyRecord` requires sha256(preimage) = payment hash and amount equality before `SETTLED`.
- 17-20: tests "response lost AFTER the wallet accepted → UNKNOWN (not FAILED); second send blocked; reconcile proves SETTLED; only one send". For real LND this is `PENDING-REAL`.
- 22-23: `packages/verifier`; test "rejects when ANY single character of the serialized receipt is changed (sampled across the whole document)". `demo-full` changes one character of the memo ("demo 30000 sats" to "demo 30001 sats") and asserts verifier exit 1.
- 24: "more wallet adapters, mobile-first approvals" are **plans, not features**; "interviews" refers to `docs/business/interview-guide.md` (not yet done). Say "test whether this pain is real", never "we found".
- 25: matches `PRODUCT-BRIEF.md` honest limits.

## 3. Storyboard and shot list (16:9, 1920x1080)

Two variants. **Variant W** uses the web console (served by the API at `/app/`) for authorization and payout screens (only if gate G3 passes). **Variant T** is terminal only and uses the actual `demo-full` output (scenario banners A, B, D). The terminal panes show the banners described in `demo-runbook.md` section 3.

Global layout: persistent badge top-left (`REGTEST - TEST COINS ONLY`), burned-in lower-third caption bar at the bottom (the **overlay** text below; this is different from the SRT subtitles, which transcribe the voice-over), safe margins 5%.

| Shot | Time | Source (Variant T / W) | On-screen action | Overlay caption (burned in) | VO cues |
|---|---|---|---|---|---|
| S01 | 0:00–0:22 | Motion-graphic cards | Three flat cards slide in: "Chat: 'ok, approved'", "Wallet: Send", "Screenshot: 'proof'". Then a "?" appears over the wallet card at 0:11 and a duplicate card fades in at 0:17. All cards carry a small "Illustrative" tag | `Illustrative. Hypothesis from our research notes, not yet validated with interviews` | 1-4 |
| S02 | 0:22–0:34 | Diagram (one slide) | Left to right: Operator and approvers → **Orynt** (policy, signed approvals, single-use reservation, reconciler, receipts) → **your wallet** (LND). A dashed box around the wallet reads "funds stay here" | `Orynt does not custody funds` | 5-6 |
| S03 | 0:34–0:40 | Title card, then back to diagram corner | Full-screen card for 3 s: "REGTEST. Test coins only. Local test chain. No real money." Then the persistent badge stays | `Bitcoin regtest. No real money.` | 7 |
| S04 | 0:40–0:47 | T: `demo-full` workspace and scenario A lines. W: New payout form | Bob's invoice for 30,000 sats; highlight decoded fields: amount, payee node key, expiry, network regtest | `Invoice decoded and bound: amount, payee node, expiry` | 8 |
| S05 | 0:47–0:54 | T: policy block from the seed/console (`DEFAULT_POLICY_RULES` tiers). W: Team and policy screen | Zoom on the tiers: up to 100,000 sats 1 approver, above 2 | `Default policy: 1 approver up to 100,000 sats, 2 above` | 9 |
| S06 | 0:54–1:00 | Inset clip, labelled "Simulator / test output" | Output of the test "operators, viewers, API keys and the maker cannot approve", or the console on the seeded simulator: the creator's approve attempt is refused with "Policy requires someone other than the creator to approve." This inset is **not** from the real run and must be labelled so | `Maker cannot approve their own payout` | 10 |
| S07 | 1:00–1:15 | T: scenario A line `approved by a different person than its creator`. W: Approve dialog | Show the intent digest (short form) in the sign dialog; the signature is accepted; state turns APPROVED. At 1:09 overlay text about the execution-time role check (no separate visual) | `Each approver signs the exact payment. Roles re-checked at execution` | 11-12 |
| S08 | 1:15–1:31 | T: scenario A output. W: operator presses "Send payment" | Operator executes with an Idempotency-Key; state chip DISPATCHING then SETTLED; show `environment: REAL_PROVIDER` | `Alice's LND node pays over a regtest channel` | 13-14 |
| S09 | 1:31–1:45 | T: scenario A cross-check lines | Two lines side by side: `sha256(preimage) == payment_hash : true`; bob's `lndLookupInvoice` state `SETTLED` | `Preimage matches the invoice. Bob's node confirms` | 15-16 |
| S10 | 1:45–1:53 | T: scenario B start | Terminal shows the failpoint being armed: `execute.after_provider_response`. Overlay stays up the whole shot | `Fault injected by the demo. The payment itself is real regtest` | 17 |
| S11 | 1:53–2:00 | T: HTTP 202. W: indigo chip | Response 202, state `UNKNOWN` in indigo (not red), incident "wallet's answer was lost" | `UNKNOWN, not FAILED. A second send is blocked` | 18 |
| S12 | 2:00–2:07 | T/W | Execute again: HTTP 409 `send_blocked_unresolved` with the plain-language detail | `Duplicate refused (HTTP 409)` | 19 |
| S13 | 2:07–2:15 | T/W | Reconcile: wallet lookup by payment hash, state `SETTLED`, `reconciled_after_uncertainty: true`; then balance line "paid once" | `Reconciled from the wallet's own record. One send` | 20 |
| S14 | 2:15–2:30 | T: scenario D output | Show a `receipt-real-regtest-*.json` file's keys (environment, network, approvals, settlement.preimage, audit.segment); run `node packages/verifier/dist/orynt-verify.mjs ... --require-real`; output lines PASS; `VERDICT: VERIFIED`, exit 0 | `Offline check: signatures, preimage, approvals, audit chain` | 21-22 |
| S15 | 2:30–2:40 | T | Show the one-character edit (memo "30000" to "30001", diff highlight), re-run the verifier: `VERDICT: REJECTED`, exit 1 (the issuer signature check fails) | `One character changed: REJECTED` | 23 |
| S16 | 2:40–3:00 | Slide | Two columns: "Next (plans)": wallet adapters, mobile approvals, 20 interviews. "Limits today": regtest only; app-level enforcement; tamper-evident log. Footer: repo URL placeholder `[REPO URL]`, "Working title: Orynt". End card, no music sting | `Working title. Not a launched product` | 24-26 |

Do not add background music with unclear licensing. If music is used, use a track you own or one with a licence you can cite; otherwise none.

## 4. Recording instructions

**Capture.**
- Tool: OBS Studio (free). Canvas and output 1920x1080, 30 fps, sRGB, one scene per shot group (cards, diagram, terminal, console). Recording format MKV (crash-safe), remux to MP4 afterwards.
- Terminal: one window, 100 columns visible, font **JetBrains Mono** (the project already bundles `@fontsource/jetbrains-mono`; open font licence), size so that text is legible at 720p (about 26-28 px). Hide shell prompt noise: `PS1='$ '`. Clear scrollback between stages. Redact: never display macaroons, cookies, passwords, `.regtest/env` contents (use `cut` or the demo script's redaction).
- Browser (Variant W): Chrome or Firefox at 1920x1080, zoom 110-125%, no extensions, private window, bookmarks bar off, console language English.
- Theme: pick one for the whole video. Light uses the brand "paper" background `#f6f4ee` with ink text `#0f1b2d`; dark uses ink `#0f1b2d` background. Check contrast at least 4.5:1 for body text. State colours follow `packages/ui/tokens.css`: uncertain = indigo `#3a47a8`, proven failure = red, settled = green, simulator = purple (`--sim`). Never show UNKNOWN in red.
- Cards/slides: Inter for text and Fraunces for titles (from `@fontsource-variable/inter`, `@fontsource-variable/fraunces`), brand assets in `packages/ui/brand/`.
- Run `pnpm demo:full` twice before recording and film the second run. Keep the generated `docs/evidence/demo-real-regtest-<stamp>.md` and `.json` and receipts of the exact run you film.

**Voice-over.** Record separately (any decent USB or headset mic, quiet room), 48 kHz mono WAV, read the 26 lines above, leave about 0.3 s between lines. Normalise (not verified on your ffmpeg build):

```bash
ffmpeg -i vo-raw.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 vo.wav
```

**Assembly and export (ffmpeg, untested here; adjust after a trial render).**

```bash
# 1. Mux the picture with the voice-over, then burn the persistent badge/overlays in your editor (or via drawtext) BEFORE this step.
ffmpeg -i picture.mp4 -i vo.wav -map 0:v -map 1:a -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart orynt-demo.mp4

# 2. Optional burned-in subtitles. original_size makes FontSize a pixel value; tune the size by eye.
ffmpeg -i orynt-demo.mp4 -vf "subtitles=captions.en.srt:original_size=1920x1080:force_style='FontName=Inter,FontSize=34,Outline=2,MarginV=60'" -c:a copy orynt-demo-subs.mp4

# 3. Length check (must be <= 180 s)
ffprobe -v error -show_entries format=duration -of csv=p=0 orynt-demo.mp4
```

Prefer uploading `captions.en.srt` as a sidecar track where the host supports it, and keep the burned-in version as a backup. The disclosure badge and overlay captions must be burned in either way. Re-time the SRT after the final voice-over (start/end of each block).

**Alternatives.** Any editor (DaVinci Resolve, Kdenlive, CapCut) works; the requirements are 16:9, at most 3:00, burned-in disclosure, legible text at 720p, no secrets on screen. An HTML-to-video route (for example HyperFrames) is possible but unevaluated here.

**Accessibility.** Captions present; do not rely on colour alone (state names are written in the chips); avoid flashing; keep each overlay on screen at least 3 seconds.

## 5. Pre-flight checklist (tick when true)

- [ ] `pnpm demo:full` passed twice; evidence files saved under `docs/evidence/`
- [ ] Badge text correct for the cut (REGTEST vs SIMULATOR)
- [ ] No secrets, real names or balances on screen; terminal scrollback cleared
- [ ] Every VO line still matches what the screen shows
- [ ] Duration at or below 3:00; captions in sync; audio levels sane
- [ ] Link opens logged-out; description repeats the disclosure and says "working title"

## 6. Main-cut evidence status (2026-11-09)

| Shot group | Needs | Status today |
|---|---|---|
| S01-S03 | Slides only | Can be made now; UNRENDERED |
| S04-S05, S07 | `demo-full` real workspace/payout lines, or the console | Logic `SIM-TESTED`; real-mode run `PENDING-REAL` |
| S06 | Labelled simulator/test inset | Available now (tests pass) |
| S08-S09 | Real LND payment + bob invoice lookup (scenario A) | `PENDING-REAL`; to be verified by running `scripts/demo-full` on the owner's machine |
| S10-S13 | Failpoint over a real payment (scenario B) | `PENDING-REAL` |
| S14-S15 | Real receipt + built verifier | Verifier works today on simulator receipts (exit 4 / exit 1); real receipt `PENDING-REAL` |
| S16 | Slide | Can be made now |

## 7. Fallback plan: if the real regtest run is unavailable

Decision date 2026-11-16 (gate G4). The fallback cut is a different video, not an edit of the main cut, and it must say so.

**What to film.**
- Primary fallback: `pnpm demo:full:sim` in the terminal (verified end to end on 2026-11-09; evidence `docs/evidence/demo-simulator-2026-11-09T15-28-43-507Z.md`). It shows the whole story on the labelled simulator: payout settled as `SIMULATED_SETTLED`, lost response then HTTP 202 `UNKNOWN`, duplicate refused, reconcile, receipts with verifier exit 4 `VERIFIED_SIMULATED`, one changed character exit 1, replay rejected. Scenario C (kill) is skipped in this mode.
- Insets from existing tests (they pass today): `pnpm --filter @orynt/api test:integration -t "operators, viewers, API keys and the maker cannot approve"` and `-t "20 concurrent execute requests"`.
- The console on the seeded simulator workspace: `pnpm db:start && pnpm build:all && ORYNT_ENV=development ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 pnpm start`, then `http://127.0.0.1:8787/app/` (sign in `demo-owner@orynt.local` / `demo-password-123`). Its simulator labels are part of the product (`is_simulator` on connections; receipts say "SIMULATOR - no real value moved"). Screenshots already exist in `docs/evidence/screenshots/`.

**Mandatory changes.**
- Badge for the whole video: `SIMULATOR - NO REAL PAYMENT`. First frame after the problem section: card "This run uses a labelled wallet simulator. No Bitcoin network. No real or test coins moved."
- Replace VO lines 7, 13-17 and 22 with the fallback text below (already in `captions.fallback-sim.en.srt`). Do **not** use the phrases "genuine Lightning payout", "real payment", "settled" (use "simulated-settled").
- Closing must state: "A real Lightning adapter is implemented; it has not yet been run against a node."
- The Devpost description must use variant B (`devpost-entry.md`) so text and video agree.

| # | Fallback VO replacement |
|---|---|
| 7 | Everything you will see is a simulation. The wallet is a labelled simulator: no Bitcoin network, no real money. |
| 13 | Execute. Orynt first reserves a single-use intent in PostgreSQL, then asks the simulated wallet to pay. |
| 14 | The simulator returns a preimage, the way a real wallet would. |
| 15 | Orynt checks the preimage hashes to the invoice. The state is simulated-settled, never settled. |
| 16 | A real Lightning adapter exists in the code, but it has not yet been run against a node. |
| 17 | Now the failure that causes double payments. The simulator accepts the payment, then drops the response. |
| 22 | A standalone command checks it offline. The verdict is verified-simulated: not a real payment. |

Partial-real option: if only the real payment works but not the failpoint stage, film the real payment (S08-S09, S14) and cover the uncertain-response story with a clearly labelled simulator segment, with the badge switching to `SIMULATOR` for that segment.

## 8. Subtitle files

- `captions.en.srt`: main cut, 37 blocks, ends 2:59.5 (regenerated after the 2026-11-09 reconciliation: cues 9-11 now match `demo-full`).
- `captions.fallback-sim.en.srt`: fallback cut, 39 blocks, same timing.
- Both were generated from the cue lists above, not from a recording. Timings are estimates from word counts. Re-time after the voice-over exists.
