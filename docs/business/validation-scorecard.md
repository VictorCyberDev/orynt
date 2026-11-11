# Validation scorecard

Status: DRAFT, **as of 2026-11-11**. This file holds the true counters for the Orynt validation effort, their definitions, the evidence needed to move each one, and the results that would mean "stop" or "pivot". Update a counter only when the evidence in the "Evidence required" column exists. Never round up, never include friends or hackathon contacts in the threshold counts, and never describe a counter as traction.

**Headline: PRODUCT-MARKET FIT = NOT VALIDATED.** Nothing here shows demand, willingness to pay, retention or that the problem is acute. Orynt has no customers, no pilots, no revenue and no independent audit. It is an early prototype verified on a private test network (regtest) only. Desk research (the prospect list) is not validation.

## 1. Current counters

| # | Counter | Current value | Stage |
|---|---|---|---|
| 1 | Organisations on the desk-research list | **30** | research |
| 2 | ...of which re-verified against live pages in R3 (2026-11-11) | **8** | research |
| 3 | ...of which have a sourced public contact route | **6** (OpenSats, Afribit, Btrust, Bitcoin Babies, BTC Shule, HRF) | research |
| 4 | Outreach drafts written (not sent) | **8** (6 sendable pending owner approval, 2 on HOLD) | preparation |
| 5 | People or organisations contacted | **0** | outreach |
| 6 | Replies received | **0** | outreach |
| 7 | Declines | **0** | outreach |
| 8 | Interviews scheduled | **0** | learning |
| 9 | Interviews completed (consent recorded, organisations counted once, non-warm) | **0** | learning |
| 10 | Qualified organisations (interview rubric) | **0** | learning |
| 11 | Organisations reporting a real payout incident in the last 12 months | **0** | learning |
| 12 | Pilots (signed scope, real workflow data) | **0** | commitment |
| 13 | Activated organisations | **0** | commitment |
| 14 | Written commitments with an amount (LOI or paid pilot) | **0** | commitment |
| 15 | Paying customers | **0** | revenue |
| 16 | Revenue | **0** (no currency; no account, price or charge exists) | revenue |
| 17 | Retention | **n/a** (no activated organisation exists, so there is nothing to retain) | retention |
| 18 | Product-market fit | **NOT VALIDATED** | verdict |

Counters 1-4 measure *our own work*. Counters 5 onwards measure the world. Do not add them together or present counters 1-4 as pipeline.

## 2. Definitions and the evidence needed to move each counter

| # | Definition (strict) | Evidence required to increase it | Does NOT count |
|---|---|---|---|
| 1 | A distinct organisation in `prospect-list.md` section 1 with a cited public page | A row with source URL, quote and retrieval date | Search-result snippets; third-party articles not fetched |
| 2 | An organisation whose key public fact was re-read from the live page and recorded with quote, URL and date | The R3 table in `prospect-list.md` | A page that was unreachable |
| 3 | A target whose own page publishes a contact route (email, form) usable for an inquiry | URL of the page and the route as written | A guessed, scraped or personal address; a social-media DM; an application form for applicants |
| 4 | A written draft in `outreach-drafts.md` | The draft exists | A draft is not contact |
| 5 | A message actually sent to a distinct organisation by the owner from the owner's own identity | Sent-mail record or form confirmation, logged with date and route in the tracker | A draft; a public post (count public posts separately under `interview-recruitment-plan.md` section 8.1); a warm-intro request to a third party |
| 6 | A response from a person at a contacted organisation that is not an automatic reply | The reply itself | Auto-responders; delivery failures; reactions to a public post by people not at a target organisation (count as sign-ups, not replies) |
| 7 | An explicit "no", or a request not to contact again | The reply | Silence (record as "no reply", not as a decline) |
| 8 | A date and time agreed in writing with a person who has opted in | The written agreement | A vague "maybe later" |
| 9 | An interview held in which the consent script was read and consent recorded, with notes scored within 24 hours | Consent line in the notes (`consent: yes / audio: yes\|no / date`) and the score row in `interview-guide.md` section 8 | Casual chats; hackathon contacts; friends or warm contacts (count them separately as "warm" and exclude from thresholds); a second person from the same organisation (count the organisation once) |
| 10 | An organisation whose interview scored Recurrence >= 3 and Access willingness >= 1 and which is not warm | The scored row | An enthusiastic interviewee who scored lower |
| 11 | A qualified organisation describing a *specific* duplicate, lost-response, unknown-outcome or approval-dispute event in the last 12 months, with cost | The interview notes record the incident, date range and cost | Hypotheticals ("it could happen"); fear without an event |
| 12 | An organisation with a signed pilot scope (from `roi-worksheet-and-pilot-contract.md`, after counsel review) that has started on their real process map | The signed scope and a measured baseline | An agreement in principle; a demo; a trial on our sample data |
| 13 | A pilot organisation that has completed at least one full approve, execute and receipt cycle on its own workflow data, with its own approver, and has repeated it at least once without the founder doing it for them | Timestamped records of both cycles in the pilot log | A single guided demo; a first login; a sign-up |
| 14 | A written statement from an independent organisation naming an amount or a paid pilot (ladder levels E5 and E6 in `pricing-hypotheses.md`) | The signed document | "We would pay"; verbal interest |
| 15 | An organisation that has paid money to Orynt under an invoice, once an entity, billing account and counsel review exist | A paid invoice or provider receipt | Free pilots; donations; pre-orders without a charge. **None of the prerequisites exist yet** (`OWNER-REPORT-R2.md` section E) |
| 16 | Money received, net of refunds, in a stated currency | Bank or provider records | Pledges; LOIs; hackathon prizes |
| 17 | Share of activated organisations still completing payout cycles 90 days after activation | Pilot logs at day 90 | Anything before there are activated organisations |
| 18 | See section 4 | See section 4 | Prizes, stars, followers, judge praise, "interesting" |

Counter integrity rules: one count per organisation; independent organisations only for thresholds; every non-zero value needs a pointer to the evidence file; if a claim is later found to be inflated, correct this file and reset the affected counter (`go-no-go-framework.md` section 3).

## 3. Update log

| Date | Counter(s) changed | New value | Evidence pointer | Updated by |
|---|---|---|---|---|
| 2026-11-11 | 1-4 set from the R3 desk research; 5-17 confirmed at zero/n/a | see section 1 | `prospect-list.md` R3 section; `outreach-drafts.md` | R3 research pass |
| | | | | |

## 4. Falsification: what would mean "stop" or "pivot"

The thresholds already ratified in draft in `thesis-and-falsification.md` (T1-T9) and `go-no-go-framework.md` stay authoritative. They are reproduced below with checkpoints (D0 = 2026-11-20; day 30 = 2026-12-20; day 45 = 2027-01-04; day 90 = 2027-02-18). Rows marked **PROPOSED** are new in this file and need the owner to ratify them *before* any data is read.

### 4.1 Company-level kill and pivot criteria (from existing documents)

| Result | Meaning | Action |
|---|---|---|
| Fewer than 8 interviews completed by day 30, and still fewer than 8 by day 45 | Recruitment approach fails | Change the channel once; if still under 8 at day 45, stop the current approach |
| Fewer than 12 qualified interviews at day 90 (after one 30-day extension) | Not enough evidence to decide | Stop |
| Under 6 qualified organisations with a real payout incident in 12 months (T3) | The pain is not acute | Pivot segment or stop; zero among the first 10 qualified at day 45 means revisit the ICP now |
| Under 6 of 24 completed interviews pass the screener on recurrence and payee count (T1) | The ICP is too thin | Re-pick the segment per `thesis-and-falsification.md` section 4 |
| Most interviewees run an integrated internal tool with approval and evidence in one place (T2) | The "fragmented process" premise is wrong | Weaken the thesis; reconsider |
| A majority rank cost or speed above approval and evidence (T4) | Buyers treat approvals as overhead | Pivot the product emphasis or stop |
| Fewer than 2 organisations agree in principle to a limited-permission pilot (T5) | Trust is the real problem | Redesign around self-host or stop |
| Zero organisations complete a trial on their own process map by day 90 | No pull | Stop |
| Zero written paid commitments by day 90 (T6) | The free core is enough, or there is no budget | Stop or become pure open source |
| Counsel says a licence is required in all first-launch jurisdictions and the owner will not pursue it (T8) | The architecture is not viable | Stop or restructure |
| Independent review finds an unfixable funds-loss defect (T9) | The product is not safe | Halt pilots with real funds |
| Any proof that metrics or claims were inflated | Trust broken | Correct, reset the evidence count |

### 4.2 Findings from the R3 desk research that sharpen the tests (INFERENCE, to be tested, not conclusions)

| Risk visible in public pages | Interview question that tests it | Result that would falsify the segment |
|---|---|---|
| The best-evidenced funder (OpenSats) describes a monthly multi-signer ceremony and a very low fee, which suggests on-chain multisig rather than Lightning | Q4 (rails) and Q7 (walk-through of the last cycle) | Most C1 organisations pay mainly on-chain or by multisig: the Lightning-payout wedge for funders is wrong. Pivot to Lightning-heavy segments or stop |
| Community programmes pay small amounts to wallets such as Blink, Machankura and Cashu | Q4, Q10 | Most payees cannot supply a BOLT11 per payout, and LNURL/Lightning-address support is not built (`product-spec.md`): the current build does not fit this segment until it is |
| Several programmes pay fewer than 10 people per cycle (Bitcoin Ekasi, Maelstrom) | Screener S2 | Median qualified organisation pays under 10 people: the ICP threshold fails; drop the 10-payee rule or re-pick the segment |
| BTCPay Server already has payout approval, batching and automated processors (`docs/research/competitor-reverification-2026-11.md`) | Q22, Q26, observation O1 | Organisations that evaluated BTCPay payouts say it already solves the approval need: the differentiator is falsified for them |
| Payouts at the best-fit platforms are automatic, with no human approval per payment | Q5, Q9 | If approval is informal and nobody wants it formalised, T4 fails |

### 4.3 Outreach-stage criteria (PROPOSED, owner to ratify first)

| Result | Meaning | Action |
|---|---|---|
| 12 distinct organisations contacted through sourced routes, with 0 replies | The route or the offer does not work; the thesis is untested, not refuted | Stop sending on this route; switch to public posts and warm introductions per `interview-recruitment-plan.md`; do not scale up the same message |
| 25 distinct organisations contacted by any route and fewer than 3 interviews booked | Reaching target organisations is hard (T7 under pressure) | Review T7. Under 10 qualified conversations from all channels by day 45 is a distribution problem |
| 4 or more declines that give the same reason (for example "we do not pay in Lightning", "we use BTCPay", "no approvals needed") | A repeatable reason to say no | Treat that reason as disconfirming evidence and update section 4.2 |
| Any reply asking to be removed | Respect it | Stop contacting that organisation; do not count them as qualified |

### 4.4 What does not count toward validation

Draft quality, number of prospects, page views, stars, prizes, hackathon placement, judges' comments, "interesting", a friendly reply, or any interview with a warm contact. Replies are not interest; interest is not a pilot; a pilot is not a customer.

## 5. How this file is used

1. Before sending anything: confirm the owner has approved `outreach-drafts.md`.
2. After each real action: update section 1 and add a row to section 3 with an evidence pointer.
3. At each checkpoint (day 30, 45, 90): read section 4 first, then the numbers, and write the decision in `go-no-go-framework.md` with the date.
4. Until counters 9 to 14 move above zero on real evidence, the correct description of the project is "an unvalidated hypothesis with a working prototype".
