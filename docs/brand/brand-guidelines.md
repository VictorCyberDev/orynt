# Orynt brand guidelines (provisional)

> **Name status:** "Orynt" is a working name. No trademark or domain clearance exists; research found possible conflicts — see `name-clearance.md`. Do not commission print/merch or buy domains before the stop conditions there are cleared.

**Ethos:** Calm · Command · Confidence. **Theme:** precision + intelligent optimism + quiet authority. **Promise:** regaining control from uncertainty, with proof.

## Mark and wordmark (original artwork, `packages/ui/brand/`)
- **Mark** (`mark.svg`): a solid ring segment with a short trail of dots on the same circle that thins out — scattered events resolving into one ordered whole. Built from SVG primitives; no font or third-party artwork.
- **Wordmark** (`wordmark.svg`): lowercase "orynt" drawn from rounded geometric strokes (no font is embedded or redistributed).
- Lockup: `logo.svg` / `logo-dark.svg`. Favicon: `favicon.svg`, `apple-touch-icon.png`. Social: `og.svg`/`og.png`. Mono: `mark-mono.svg`.
- Clear space = the mark's stroke width ×2. Minimum size: mark 16 px, lockup 96 px wide.
- **Known risk (honest design review):** the ring-with-trail resembles a loading spinner. Mitigation: the mark is never animated; animation is reserved for genuinely *resolving* states. If tests with real users read it as "loading", redesign the mark.
- Don't: recolour to orange, add glow/gradients, rotate, place on busy photos, or animate the logo.

## Colour (5 brand colours + calm semantic set; tokens in `packages/ui/tokens.css`)
| Token | Light | Use |
|---|---|---|
| Ink | `#0F1B2D` | text, mark |
| Paper | `#F6F4EE` | background |
| Teal | `#0E7C73` (dark UI `#4FD1C0`) | primary action, the "resolved" accent |
| Cobalt | `#2F5FD0` | information |
| Sand | `#E7E0CF` | neutral surfaces |
Semantic: ok green · warn amber · **danger red only for proven failure** · **unknown indigo for uncertainty** · violet for *simulated*. Avoid Bitcoin orange, neon, trading charts. Contrast was machine-checked (axe-core, WCAG 2 AA) in light and dark on every app screen; see `docs/evidence/e2e-results.json`.

## Typography (all OFL, self-hosted)
Fraunces (display/headlines) · Inter Variable (UI) · JetBrains Mono (hashes, keys, amounts in code contexts). Base 15 px, scale in tokens.

## Voice
Plain, concrete, human. Say "We lost the wallet's answer" not "Reconciliation pending". Avoid protocol jargon; explain preimage/payment hash once, where needed. Never celebrate uncertain or failed money movement; no confetti, ever.
- Do: "Nothing has been marked failed." · "Sending again could pay twice, and a payment can't be taken back."
- Don't: "Oops!" · "Payment failed" (when it is unknown) · hype ("revolutionary", "unhackable", "bank-grade").

## Motion
Subtle, purposeful: 120–420 ms ease-out. A slow breathing ring on *unknown* states only. Everything is disabled under `prefers-reduced-motion`.

## Iconography
Minimal glyphs in the app shell (text-based placeholders). **Known gap:** a bespoke SVG icon set was not produced; the nav glyphs are Unicode and low-fidelity. Tracked as design debt.

## Claims discipline
No invented customers, logos, testimonials, metrics, certifications, partners, or security guarantees — anywhere. Say "designed", "tested on regtest", "not audited".
