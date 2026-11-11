# Go-to-market and partnerships

Status: DRAFT v0.1, 2026-11-09. Everything here is a **hypothesis or plan**. Orynt has **no customers, no partners, no endorsements, no grants, and no existing relationships** with any organisation named below. Named organisations appear only as potential targets or funding landscape facts, with sources.

## 1. Distribution strategy (hypotheses)

Principle: with a solo founder and no budget, reach comes from places where the target already gathers, through useful artefacts (docs, verifier, open-source code) and direct conversations. Paid acquisition is off the table during validation.

| ID | Channel | Hypothesis | First action | Metric (pre-registered) | Kill rule |
|---|---|---|---|---|---|
| G1 | Wallet and Lightning app teams (integration users) | Teams with payout features share the problem and can integrate or advise | Ask 10 teams for a 30-min process conversation, not a sale | Conversations booked per 10 asks; qualified share | Fewer than 3 qualified conversations from 20 asks |
| G2 | Open-source projects that pay contributors | Easy to reach; produce free-core adopters and word of mouth, little revenue | Offer a free regtest walkthrough and the offline verifier; ask how they pay contributors | Projects trying the CLI/verifier; issues filed | No external trial after 8 weeks |
| G3 | Bitcoin developer networks (BitDevs-style meetups, developer forums, Lightning dev communities, nostr) | Developers will read honest technical write-ups about UNKNOWN/RECONCILING payment states | Publish one technical post on the lost-response problem and the receipt proof (sha256(preimage) = payment hash) | Qualified replies; interviews booked | Zero qualified replies from 3 posts |
| G4 | Btrust ecosystem and African Bitcoin builder communities | Builder communities are concentrated; a sub-group may run payouts to contributors and communities. **Target only; no relationship exists** | Attend/observe public community channels; request interviews as an independent researcher; no pitch | Interviews booked, region diversity | Interviews only from warm contacts |
| G5 | Grant programs and foundations paying recipients in sats | Pain in accountability and evidence for funders | 4 interviews with programme staff (see segment C1) | Qualified interviews; pilot interest | None want to pilot |
| G6 | Accountant and bookkeeper communities serving Bitcoin-native companies | Evidence need may come from them | 3 exploratory interviews | Do they ask for verifiable proofs unprompted? | No interest |
| G7 | Content: honest "what we do not do" documentation and public hackathon demo video | Honesty is a differentiator in a hype-heavy market | Publish limits page derived from PRODUCT-BRIEF | Inbound qualified requests | No inbound after 6 weeks |

### What the Btrust ecosystem and African communities are, and are not, here

- Btrust describes itself as a non-profit focused on decentralising Bitcoin development, and runs Btrust Builders (training for African software engineers), grants, developer events and BitDevs links. Source: https://btrust.tech/builders/apply (fetched 2026-11-09); more context: https://www.mariblock.com/stories/btrust-builders-kicks-off-inaugural-fellowship-for-bitcoin-developers-in-africa (search result, 2026-11-09, secondary; details of cohort numbers vary by source and are not used here).
- Btrust Builders is a training/fellowship programme for developers, not a customer, partner or buyer. Treating it as a payer of payouts would be an unverified assumption. A legitimate approach is to ask its staff whether the programmes (stipends, grants) involve recurring Lightning payouts and what pain exists, as a research interview.
- Orynt has **no relationship** with Btrust or any African community. Do not imply one in any material. Do not use their logos, names as endorsements, or claim membership.

## 2. Funding and grant landscape (verify before relying; cite)

Facts below were retrieved on 2026-11-09. Primary pages were fetched where noted; others are web-search snippets and marked unverified. **Eligibility for Orynt is not determined.** Orynt is a provisionally named startup with a possible commercial layer; many programmes fund free and open-source work only. Whether the core will be open source, and under what licence, is not yet decided in the docs reviewed.

| Funder / programme | What it says it funds (source) | Fit hypothesis for Orynt | Verification status |
|---|---|---|---|
| OpenSats | "Good for Bitcoin", "Free and Open-Source", "Transparency & Education"; worldwide applicants; projects must have a proper open-source licence; general grants, LTS, RED (https://opensats.org/apply, fetched 2026-11-09). Search snippets add: budgeted in USD, paid in bitcoin; requires references (https://opensats.org/faq/application, search result only) | Possible for the open-source core if released under an open licence and framed as public-good tooling; a commercial cloud layer may sit uneasily | Primary page verified for criteria; for-profit eligibility not stated on that page; references requirement unverified |
| Spiral (Block initiative) | Open-source bitcoin and AI; apply by emailing grants@spiral.xyz; page does not state licence requirement or for-profit eligibility (https://spiral.xyz/grants/, fetched 2026-11-09). A search snippet from a third-party directory says projects must be free/open-source without profit motive (https://www.spark.money/tools/bitcoin-development-grant-directory) | Possibly Lightning payments tooling; unclear | Primary page verified; restrictions UNVERIFIED |
| Human Rights Foundation Bitcoin Development Fund | Software developers, activists, educators, community builders, translators, UX designers; focus on privacy, security, decentralisation and freedom technologies; excludes projects based on other cryptocurrencies; year-round applications; no fixed amounts (https://hrf.org/DevFund, fetched 2026-11-09) | Weak fit unless Orynt is framed around freedom-tool use cases; honest framing required | Primary verified |
| Btrust grants and developer programmes | Btrust Builders page mentions grant matching for open-source Bitcoin development work (https://btrust.tech/builders/apply, fetched 2026-11-09). Separate Btrust developer-grant announcements appear in search results (damus.io link, not fetched) | Unclear; Builders is about developers' careers, not payout tooling | Builders page verified; grant criteria for projects like Orynt UNVERIFIED |
| Hackathon prizes | Depend on event | Forcing function only; see [`go-no-go-framework.md`](go-no-go-framework.md) | Event rules not in repo; UNVERIFIED |
| Regulatory sandboxes/incubators (for example Nigeria SEC's ARIP) | Pre-licensing frameworks for VASPs per secondary sources (https://www.mondaq.com/nigeria/securities/1699044/a-closer-look-at-the-securities-and-exchange-commissions-sec-accelerated-regulatory-incubation-program-structure, search result 2026-11-09) | Only relevant if counsel concludes Orynt is in scope; not funding | UNVERIFIED; counsel item |
| Venture or angel funding | Not researched | Not appropriate before evidence; do not pursue before the day-90 review | n/a |

Funding-readiness checklist:
- [ ] Decide core licence (open source or not) and record why.
- [ ] Prepare a funder-safe one-page project statement using only the verified claims from PRODUCT-BRIEF and EXECUTION-REGISTER.
- [ ] Gather two non-friend references (some funders ask; unverified for each).
- [ ] Do not accept funds that carry reporting or legal obligations without counsel review of terms.
- [ ] Do not describe the project as "funded by" or "supported by" any named funder unless a written grant exists.

## 3. Outreach DRAFT emails

**DRAFTS ONLY. NEVER SENT. Do not send any until: the interview guide is finalised, consent language is confirmed by counsel where required, and the sender has checked for unsolicited-email and anti-spam rules in the recipient's jurisdiction (counsel question).** Replace bracketed placeholders. No claim in a draft may exceed PRODUCT-BRIEF.

### Draft 1: process research request to a wallet or app team (not a pitch)

Subject: Question about how you handle payout approvals (research, 30 minutes)

> Hi [Name],
>
> I'm [founder name], independently researching how Bitcoin-native teams pay people over Lightning (contributors, rewards, refunds, suppliers) and how they handle approvals and cases where a payment's outcome is unclear.
>
> I'm not selling anything; the project is early (provisionally called Orynt) and unproven. I'm trying to learn how it works in practice before building more. Would you be open to a 30-40 minute conversation, or to answering three written questions if that's easier?
>
> I'd keep your answers confidential and share nothing with names attached; I can send the consent terms in advance. You can also tell me not to contact you again and I will not.
>
> Thanks,
> [Name, contact]

### Draft 2: grant programme or foundation staff

Subject: Research on documenting payouts to grant recipients in sats

> Hi [Name],
>
> I'm studying how organisations that fund Bitcoin and open-source work keep track of who approved a payout, whether it was paid, and how they show that to their own funders.
>
> I'd value 30 minutes with someone who runs that process, to hear how it works today and where it's awkward. I'm early-stage and am not asking for funding or a partnership; this is research and I'll share a short anonymised summary with participants if they want it.
>
> Would a short call work in the next few weeks? If you'd prefer not to, no problem.
>
> [Name, contact]

### Draft 3: open-source maintainer who pays contributors

Subject: How do you pay contributors in sats? (looking for honest answers)

> Hi [Name],
>
> I saw that [project] pays contributors [only if verifiable from public pages; otherwise remove]. I'm researching the practical side: who approves, how it's paid, and what happens when a payment fails or its status is unclear.
>
> I'm building an early, open-source-oriented tool in this area (Orynt, provisional name, not production-ready). I'm not asking you to use it; I'd like to learn from your experience, and I can share what I learn.
>
> Open to a 30-minute chat, or a reply with your biggest headache?
>
> [Name, contact]

### Draft 4: follow-up after interview (no pitch)

> Thank you for your time on [date]. As agreed, I've stored your notes under a participant code, not your name, and will delete them on request. If you'd like, I can send a short summary of what I learn across interviews. If you're open to it later, I may ask whether you would try an early regtest-only walkthrough with no real funds; you can say no without any follow-up.

### Draft 5: pilot invitation (only after counsel reviews the pilot template)

> Based on our conversation, you mentioned [specific pain they described]. I'd like to offer a short, free, regtest-only trial in which we map your payout process and test whether an approval-and-evidence workflow would have helped. No real funds, no keys, no commitments, and either side can stop at any time. The terms are in the attached draft agreement, which you may want your own advisers to read. The product is early and not audited.

## 4. Landing page CTA measurement plan

Page purpose: collect honest signal, not signups at any cost. Copy must follow the honest limits in PRODUCT-BRIEF (not a custodian, tamper-evident not immutable, regtest only by default, unvalidated). See [`metrics-and-privacy.md`](metrics-and-privacy.md) for instrumentation ethics.

| Element | Design |
|---|---|
| Primary CTA | "Request a regtest pilot" with short form: organisation type, payouts/month range, role, region (optional), free-text pain |
| Secondary CTA | "Read how receipts are verified" (docs link), "Run the verifier on a sample receipt" |
| Tertiary CTA (test) | "Tell us what you would pay" (free-text, optional; no price shown) |
| Do not | Fake countdowns, fake customer logos, fake counts, fake testimonials, auto-opt-in marketing, or any "buy" button |
| Variants (A/B only if traffic permits; otherwise sequential) | Headline A "Every payment. Under control." vs B "Know whether a Lightning payout actually went through." |
| Events (consented, first-party, no third-party trackers) | page_view (aggregate), cta_click, form_start, form_submit, verifier_demo_run |
| Qualification | A request is **qualified** if the screener fields meet ICP criteria (10+ payees/period, 2+ people involved); store as boolean, not as free-text analysis |
| Weekly review | Requests, qualified requests, unique organisations, source channel (self-reported, optional) |
| Threshold | At least 10 qualified requests from 5 organisations in 6 weeks with no paid traffic (see [`pricing-hypotheses.md`](pricing-hypotheses.md) E2) |
| Caveat | Small n and a self-selected audience cannot indicate market size; do not report conversion rates without counts |

## 5. Pilot structure (how first customers would be run)

| Stage | Duration | Activities | Gate to next stage |
|---|---|---|---|
| 0 Qualification | 1 week | Interview, ROI worksheet baseline ([`roi-worksheet-and-pilot-contract.md`](roi-worksheet-and-pilot-contract.md)) | Qualified per rubric; access willingness >= 3 |
| 1 Paper mapping | 1 week | Map their payout process to the Orynt states without software | They confirm map is accurate |
| 2 Simulator/regtest | 1-2 weeks | Run their anonymised scenarios on regtest or simulator; rehearse "lost response" | Operators complete tasks without founder |
| 3 Decision | 1 day | Joint review against agreed metrics | Continue / stop |
| 4 Optional capped mainnet | 2-4 weeks | Only after written consent, EXECUTION-REGISTER VERIFIED status for the required path, counsel review, security review of that path | Written go from both parties |

Target for validation window: 3 organisations through stage 2, 1 through stage 4 (only if the gates are met). Stage 4 is optional and must not be rushed for the sake of a demo.

## 6. Buyer objection handling

Honest answers only; where the honest answer is "not yet", say so.

| Objection | Honest response | Evidence required to answer better |
|---|---|---|
| "Is this audited? SOC 2? ISO?" | No. Nothing is audited or certified. Status per [`security-due-diligence.md`](security-due-diligence.md). Use regtest/simulator first | Independent code review and later certification, if justified |
| "Why not build it ourselves?" | You may be right. If your volume is small, a script may suffice. Orynt's bet is that approvals, truthful state and evidence are tedious to get right | Comparison in ROI worksheet; competitor facts in `docs/research/competitor-matrix.md` |
| "Will it hold our funds?" | No: designed as non-custodial, in front of a wallet you control. Funds protection depends on the permissions you give | Architecture docs; counsel view on non-custodial positioning (not obtained) |
| "What if Orynt is down or you disappear?" | Honest: solo founder, early stage (key-person risk in [`risk-register.md`](risk-register.md)). Core is intended to be self-hostable; receipts verify offline without Orynt | Self-host docs verified; escrowed continuity plan (not done) |
| "Is it legal in our country?" | We cannot give legal advice. Questions are listed for counsel in [`legal-regulatory-register.md`](legal-regulatory-register.md) | Counsel opinions per jurisdiction |
| "Wallet permissions scare us" | Use least-privilege credentials, regtest first, caps, per-payout approval; you can revoke any time | Documented permission sets; test results |
| "We already have approvals in chat" | Chat can show intent but not bind approval to exact amount/payee/invoice. Is that a gap for you? (ask) | Interview evidence |
| "You are one person." | True. Hence the narrow scope, honest limits and pilot-first approach | Contributors, reviewers, continuity plan |
| "What does it cost?" | Not decided. We are testing price hypotheses; the core is intended to be free | Pricing experiments |
| "Can it send automatically via AI?" | No: not an autonomous AI spender; humans approve | n/a |
| "What about privacy of our payees?" | Minimise payee data; data handling in pilot terms; legal basis for processing is a counsel question | DPIA-style review (not done) |
| "Why Bitcoin/Lightning only?" | Focus on one rail so the state machine is correct. Other rails not planned | n/a |
| "Show me a customer." | There are none. We are looking for early evaluators | n/a |

## 7. Partnership posture

- No partnership is claimed. Possible partnership forms to explore later: wallet teams as integrators, grant programmes as design partners, accountants as evidence consumers, security reviewers.
- Rule: no logo, name or quotation of any organisation appears in public materials without written permission.
- Reciprocity rule: no promises of exclusivity, revenue share or equity in validation phase.
