/**
 * Builds the silent, captioned 3-minute demo video from REAL captures:
 *   - browser screenshots of the operations app driving real LND regtest payments (frames/ui, produced by capture-real-ui.mts)
 *   - excerpts of real terminal output (docs/evidence/*transcript.txt and frames/term/*.txt, produced by the real verifier CLI)
 *   - labelled slides (problem cards = ILLUSTRATIVE, architecture diagram, disclosure card, closing card)
 * Every scene carries a source tag. Nothing is simulated or mocked except what the tag says (PRACTICE MODE = labelled simulator test output).
 *
 * Usage (repo root): node docs/hackathon/video/tools/build-video.mjs   -> docs/hackathon/video/orynt-demo-silent-captioned.mp4 + captions.en.srt
 * Needs: Chromium via Playwright (apps/web), ffmpeg. Scene PNGs go to $VIDEO_SCENES (default: a temp dir) and are not committed.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const { chromium } = createRequire(join(ROOT, "apps/web/package.json"))("playwright");
const V = join(ROOT, "docs/hackathon/video");
const UI = join(V, "frames/ui"), TERM = join(V, "frames/term");
const SCENES = process.env.VIDEO_SCENES ?? mkdtempSync(join(tmpdir(), "orynt-scenes-"));
mkdirSync(SCENES, { recursive: true });
const transcript = readFileSync(join(ROOT, "docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.transcript.txt"), "utf8").split("\n");
const TRANSCRIPT_SRC = "docs/evidence/demo-real-regtest-2026-11-11T10-26-29-483Z.transcript.txt";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const between = (from, to) => { const a = transcript.findIndex((l) => l.includes(from)); const b = transcript.findIndex((l, i) => i > a && (to ? l.includes(to) : false)); return transcript.slice(a, b < 0 ? undefined : b).filter((l) => l.trim() !== ""); };
const termHtml = (lines) => `<pre class="term">${lines.map((l) => {
  const t = esc(l);
  if (/^\s*✔/.test(l)) return `<span class="ok">${t}</span>`;
  if (/^\s*✘/.test(l) || /REJECTED/.test(l)) return `<span class="bad">${t}</span>`;
  if (/^\s*!/.test(l) || /^\s*…/.test(l) || /^\[failpoint\]/.test(l)) return `<span class="warn">${t}</span>`;
  if (/^━━/.test(l) || /^\$ /.test(l)) return `<span class="hd">${t}</span>`;
  if (/VERIFIED|exit=0/.test(l)) return `<span class="ok">${t}</span>`;
  return t;
}).join("\n")}</pre>`;
const pick = (txt, pats, head) => { const ls = txt.split("\n"); const out = [ls[0]]; for (const p of pats) { const m = ls.find((l, i) => i > 0 && p.test(l)); if (m) out.push(m); } return [...(head ?? []), ...out]; };

const verA = readFileSync(join(TERM, "verify-A.txt"), "utf8");
const verT = readFileSync(join(TERM, "verify-tampered.txt"), "utf8");
const trim = (l) => (l.startsWith("$ ") ? l.trimEnd() : l.trimEnd().slice(0, 118));
const tVerify = [
  ...pick(verA, [/attestation\.signature/, /issuer\.trusted/, /invoice\.signature/, /intent\.digest/, /approval\..* approver/, /approval\.threshold/, /settlement\.preimage/, /require\.real/, /network\.note/, /audit\.chain/, /audit\.checkpoint_signature/]).map(trim),
  "  … 29 passing checks in the full output (docs/evidence/verifier-real-2026-11-11.txt)", "", ...verA.split("\n").filter((l) => /^VERDICT|^ {2}30000000 msat|^exit=/.test(l)).map(trim),
];
const tTamper = [
  ...pick(verT, [/attestation\.signature/, /agreement\.hash/, /approval\.threshold/, /settlement\.preimage/]).map(trim), "  … other checks unchanged", "",
  ...verT.split("\n").filter((l) => /^VERDICT|^exit=/.test(l)).map(trim), "",
  "the only difference between the two receipts:", '-   "memo": "Design work, regtest demo",', '+   "memo": "Design work, regtest demp",',
];
const tMaker = [
  '$ pnpm --filter @orynt/api exec vitest run --config vitest.integration.config.ts --reporter=verbose \\',
  '      -t "operators, viewers, API keys and the maker cannot approve" test/adversarial.itest.ts', "",
  " ✓ test/adversarial.itest.ts > approvals > operators, viewers, API keys and the maker cannot approve 236ms", "",
  " Test Files  1 passed (1)", "      Tests  1 passed | 31 skipped (32)", "",
  "default policy (packages/core/src/policy.ts):", "  up to 100,000 sats  -> 1 approver", "  above               -> 2 approvers", "  requireDistinctMaker: true   allowedNetworks: [regtest]",
];

const scenes = [
  { id: "s01", dur: 10, tag: ["ill", "ILLUSTRATIVE"], kind: "cards1", note: "Illustrative: a hypothesis from desk research, not validated with users", cues: ["Organisations that pay people in bitcoin often approve in a chat message,", "pay from a wallet screen, and keep a screenshot as proof."] },
  { id: "s02", dur: 10, tag: ["ill", "ILLUSTRATIVE"], kind: "cards2", note: "Illustrative: a hypothesis from desk research, not validated with users", cues: ["When the wallet's answer is lost mid-payment, nobody knows whether the money moved.", "So people retry and risk paying twice, or wait and leave someone unpaid."] },
  { id: "s03", dur: 12, tag: ["slide", "DIAGRAM"], kind: "svg", note: "Not a wallet: payout-authorization software that integrates with an existing LND wallet", cues: ["Orynt sits in front of a Lightning wallet you already run. It never holds your funds.", "It decides who may pay, sends exactly once, and keeps the proof."] },
  { id: "s04", dur: 6, tag: ["slide", "DISCLOSURE"], kind: "disclosure", cues: ["The payments you will see run on Bitcoin regtest: a local test chain with worthless coins."] },
  { id: "s05", dur: 10, tag: ["real", "REAL REGTEST · BROWSER"], kind: "img", img: "01-invoice-decoded.png", note: "A real invoice issued by a local regtest LND node (bob)", cues: ["An operator pastes Bob's invoice.", "Orynt decodes it and shows amount, network, expiry and the issuing node."] },
  { id: "s06", dur: 9, tag: ["sim", "PRACTICE MODE · TEST OUTPUT"], kind: "term", lines: tMaker, note: "Test output on the practice wallet (simulator), not from the regtest run", cues: ["Default policy: one approver up to 100,000 sats, two above.", "The maker cannot approve their own payout. Operators and API keys cannot approve."] },
  { id: "s07", dur: 10, tag: ["real", "REAL REGTEST · BROWSER"], kind: "img", img: "05-approver-signs.png", note: "The approval key is created and kept in the approver's browser", cues: ["The approver signs the exact payment with a key created in their browser.", "Change any field afterwards and the signature stops counting."] },
  { id: "s08", dur: 8, tag: ["real", "REAL REGTEST · BROWSER"], kind: "img", img: "06-approved-ready.png", cues: ["Execute: Orynt first reserves a single-use send in PostgreSQL,", "then asks Alice's LND node to pay."] },
  { id: "s09", dur: 11, tag: ["real", "REAL REGTEST · BROWSER"], kind: "img", img: "07-settled-real.png", cues: ["Settled with proof in hand: the preimage matches the invoice's payment hash.", "Only then does Orynt call a payout settled."] },
  { id: "s10", dur: 11, tag: ["real", "TRANSCRIPT OF THE REAL RUN"], kind: "term", lines: ["$ pnpm demo:full      (excerpt, stage A)", ...between("━━ A. A normal payout", "━━ B.")], note: `Excerpt of ${TRANSCRIPT_SRC}`, cues: ["Bob's node independently shows the invoice paid, with the same preimage.", "Excerpt of the recorded demo:full run."] },
  { id: "s11", dur: 10, tag: ["real", "REAL REGTEST · FAULT INJECTED"], kind: "img", img: "08-unknown-send-disabled.png", note: "The lost response is an injected fault (failpoint); the payment itself is a real regtest payment", cues: ["Now the failure that causes double payments.", "In this run we inject a fault: the answer is lost after LND accepted the payment."] },
  { id: "s12", dur: 9, tag: ["real", "REAL REGTEST · FAULT INJECTED"], kind: "img", img: "09b-unknown-actions-send-disabled.png", note: "The lost response is an injected fault (failpoint); the payment itself is a real regtest payment", cues: ["Orynt does not call it failed. The state is unknown, and Send is switched off", "with the reason written out in plain words."] },
  { id: "s13", dur: 11, tag: ["real", "TRANSCRIPT OF THE REAL RUN"], kind: "term", lines: ["$ pnpm demo:full      (excerpt, stage B)", ...between("━━ B. The wallet's answer", "━━ C.")], note: `Excerpt of ${TRANSCRIPT_SRC}`, cues: ["A second send is refused with HTTP 409: the first attempt may already have paid.", "Reconciling by payment hash finds LND's own record: settled, one payment."] },
  { id: "s14", dur: 9, tag: ["real", "REAL REGTEST · BROWSER"], kind: "img", img: "10-resolved-after-uncertainty.png", cues: ["The payout settles from the wallet's own record.", "The receipt says it was settled after an uncertain moment."] },
  { id: "s15", dur: 12, tag: ["real", "TRANSCRIPT OF THE REAL RUN"], kind: "term", lines: ["$ pnpm demo:full      (excerpt, stage C)", ...between("━━ C. The API process", "━━ D.")], note: `Excerpt of ${TRANSCRIPT_SRC}. A failpoint sends SIGKILL to the API process itself, right after LND accepted the payment`, cues: ["We also killed the API process with SIGKILL right after LND accepted a payment.", "After restart: unknown, never failed. Reconciled to settled. One payment."] },
  { id: "s16", dur: 13, tag: ["real", "REAL RECEIPT · VERIFIER OUTPUT"], kind: "term", lines: tVerify, note: "Real output of orynt-verify (elided lines marked). The trust key is passed in by the caller, as a real verifier would", cues: ["A standalone command verifies the receipt offline: approvals, preimage, audit chain.", "Verified, exit code 0, and --require-real would refuse a simulator receipt."] },
  { id: "s17", dur: 10, tag: ["real", "REAL RECEIPT · VERIFIER OUTPUT"], kind: "term", lines: tTamper, note: "Same receipt with one character changed (memo), real output of orynt-verify", cues: ["Change a single character of the receipt.", "Rejected, exit code 1."] },
  { id: "s18", dur: 8, tag: ["slide", "LIMITS AND NEXT STEPS"], kind: "closing", cues: ["Limits today: regtest only, LND only, application-level enforcement,", "no human audit, no users. Working title, not a launched product."] },
];

const css = `
*{box-sizing:border-box}body{margin:0;width:1920px;height:1080px;background:#0f1b2d;color:#f6f4ee;font-family:Inter,Arial,sans-serif;position:relative;overflow:hidden}
.badge{position:absolute;left:36px;top:24px;background:#f2c14e;color:#0f1b2d;font-weight:800;font-size:26px;padding:10px 18px;border-radius:8px;letter-spacing:.04em;z-index:5}
.tag{position:absolute;right:36px;top:24px;font-weight:800;font-size:24px;padding:10px 18px;border-radius:8px;letter-spacing:.04em;z-index:5}
.tag.real{background:#17663f;color:#fff}.tag.sim{background:#6b3fa0;color:#fff}.tag.ill{background:#5b6472;color:#fff}.tag.slide{background:#2f5fd0;color:#fff}
.stage{position:absolute;left:0;right:0;top:96px;height:800px;display:flex;align-items:center;justify-content:center}
.stage img.shot{height:792px;width:1408px;border:3px solid #33415c;border-radius:10px;background:#fff}
.stage img.svg{height:790px;background:#f6f4ee;border-radius:10px}
.note{position:absolute;left:0;right:0;top:900px;text-align:center;font-size:25px;color:#f2c14e;min-height:34px;padding:0 60px}
.cap{position:absolute;left:120px;right:120px;top:944px;height:116px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:42px;line-height:1.2;font-weight:600;background:rgba(0,0,0,.45);border-radius:12px;padding:0 30px}
pre.term{margin:0;width:1700px;max-height:780px;background:#0a1120;border:3px solid #33415c;border-radius:10px;padding:26px 34px;font:27px/1.38 "JetBrains Mono",monospace;color:#d6deeb;white-space:pre-wrap;overflow:hidden;font-variant-ligatures:none}
.ok{color:#58d68d}.bad{color:#ff7b72;font-weight:700}.warn{color:#f2c14e}.hd{color:#7fd1ff}
.cards{display:flex;gap:44px;align-items:center}.card{width:400px;height:300px;background:#f6f4ee;color:#0f1b2d;border-radius:18px;padding:30px;font-size:34px;position:relative;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.card b{display:block;font-size:26px;color:#5b6472;margin-bottom:16px;letter-spacing:.06em}.card .btn{display:inline-block;margin-top:30px;background:#0e7c73;color:#fff;border-radius:10px;padding:14px 34px}
.q{position:absolute;right:-26px;top:-40px;width:92px;height:92px;border-radius:50%;background:#3a47a8;color:#fff;font-size:64px;font-weight:800;display:flex;align-items:center;justify-content:center}
.dup{opacity:.75;transform:rotate(-3deg)}
.big{text-align:center}.big h1{font-family:Fraunces,Georgia,serif;font-size:96px;margin:0 0 10px}.big p{font-size:38px;line-height:1.35;max-width:1400px;margin:10px auto;color:#dfe6f2}
.cols{display:flex;gap:70px;width:1600px}.cols div{flex:1;background:#16253d;border-radius:14px;padding:26px 34px;font-size:30px;line-height:1.45}.cols h2{margin:0 0 10px;font-size:32px;color:#f2c14e}
`;
const stageHtml = (s) => {
  if (s.kind === "img") return `<img class="shot" src="file://${join(UI, s.img)}">`;
  if (s.kind === "term") return termHtml(s.lines);
  if (s.kind === "svg") return `<img class="svg" src="file://${join(ROOT, "docs/architecture/orynt-architecture.svg")}">`;
  if (s.kind === "cards1" || s.kind === "cards2") return `<div class="cards"><div class="card"><b>CHAT</b>"ok, approved ✓"</div><div class="card" style="position:relative"><b>WALLET</b>Send 30,000 sats<br><span class="btn">Send</span>${s.kind === "cards2" ? '<div class="q">?</div>' : ""}</div><div class="card"><b>SCREENSHOT</b>proof_final_v2.png</div>${s.kind === "cards2" ? '<div class="card dup"><b>WALLET</b>Send 30,000 sats<br><span class="btn">Send again?</span></div>' : ""}</div>`;
  if (s.kind === "disclosure") return `<div class="big"><h1>REGTEST. TEST COINS ONLY.</h1><p>A local Bitcoin test chain with two LND nodes. No real money. No testnet. No mainnet.</p><p>Segments from practice mode (labelled simulator) are tagged PRACTICE MODE. Illustrative slides are tagged ILLUSTRATIVE.</p></div>`;
  if (s.kind === "closing") return `<div style="display:flex;flex-direction:column;align-items:center;gap:26px"><div class="big"><h1>Orynt <span style="font-size:44px">(working title)</span></h1></div><div class="cols"><div><h2>Not verified</h2>testnet and mainnet · any wallet other than LND · a human security audit · hosting · real e-mail and billing · any user or customer</div><div><h2>Next (plans, not features)</h2>interviews with Bitcoin-native organisations to test whether the pain is real · more wallet adapters · mobile-first approvals · human review</div></div><div class="big"><p style="font-size:30px">Not a wallet. Not a launched product. Code and evidence: see the Devpost page.</p></div></div>`;
  return "";
};
const pageHtml = (s) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="badge">REGTEST · TEST COINS ONLY</div><div class="tag ${s.tag[0]}">${esc(s.tag[1])}</div><div class="stage">${stageHtml(s)}</div><div class="note" id="note">${esc(s.note ?? "")}</div><div class="cap" id="cap"></div></body></html>`;

const fmt = (t) => { const ms = Math.round(t * 1000); const p = (n, w) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let t = 0, n = 0; const srt = []; const list = [];
for (const s of scenes) {
  writeFileSync(join(SCENES, s.id + ".html"), pageHtml(s));
  await page.goto("file://" + join(SCENES, s.id + ".html")); await page.waitForTimeout(300);
  const total = s.cues.reduce((a, c) => a + c.length, 0);
  let acc = 0;
  for (const [i, c] of s.cues.entries()) {
    const d = i === s.cues.length - 1 ? s.dur - acc : Math.round((s.dur * c.length) / total * 10) / 10;
    // join cue lines that belong to one sentence: a cue is displayed as-is, wrapped by the browser
    await page.evaluate((txt) => { document.getElementById("cap").textContent = txt; }, c);
    const f = join(SCENES, `${String(++n).padStart(2, "0")}-${s.id}.png`);
    await page.screenshot({ path: f });
    list.push(`file '${f}'`, `duration ${d}`);
    srt.push(`${srt.length + 1}\n${fmt(t)} --> ${fmt(t + d)}\n${c}\n`);
    t += d; acc += d;
  }
}
await browser.close();
list.push(list[list.length - 2]);
writeFileSync(join(SCENES, "list.txt"), list.join("\n") + "\n");
writeFileSync(join(V, "..", "captions.en.srt"), srt.join("\n"));
const out = join(V, "orynt-demo-silent-captioned.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(SCENES, "list.txt"), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "27", "-preset", "medium", "-c:a", "aac", "-b:a", "32k", "-t", String(t), "-movflags", "+faststart", out], { stdio: "inherit" });
console.log(`wrote ${out} (${t.toFixed(1)} s) and captions.en.srt (${srt.length} cues); scene PNGs in ${SCENES}`);
