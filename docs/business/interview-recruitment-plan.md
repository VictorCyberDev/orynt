# Interview recruitment plan (public channels and warm introductions only)

Status: DRAFT v0.1, 2026-11-10. This is a plan. **No message, post, email or invitation has been sent, and none should be sent until the owner has approved this plan and checked each channel's rules.** No interviews have been conducted; every table that records results is intentionally empty. Not legal advice; consent and retention wording must be confirmed by counsel (see `legal-regulatory-register.md`).

Goal: recruit the **20 completed interviews** (plan for 24) defined in `interview-guide.md` section 1, using the screener (section 2) and consent script (section 3) from that guide, without scraping, buying or inferring anyone's contact details.

## 1. Hard rules (compliance)

1. **Allowed routes only:** (a) a public invitation posted in a community channel where posting is permitted, which people answer if they choose to; (b) a warm introduction where the introducer first asks the other person and passes contact details only after a yes; (c) a reply to someone who contacted me first.
2. **Not allowed:** collecting emails, phone numbers or handles from websites, repositories, profiles or lists; buying, enriching or importing contact data (including the sales-data tools installed in this environment); bulk or templated direct messages to people who did not ask to be contacted; contacting an organisation from `prospect-list.md` on a route it did not publish for this purpose; creating fake accounts or hiding that this is research; paying for positive answers.
3. **Check each channel's own rules before posting.** I have **not** verified the posting rules of any channel below (NOT VERIFIED). Where a channel has moderators or an admin, ask first and post only if allowed. One post per channel; no repeat bumping; if no response, leave it.
4. **Say who you are and what this is.** Name the researcher (the owner), say it is research and not a sales call, and that the product is early and unproven. Do not describe the product in the invitation (the interview guide says never before Set F).
5. **Incentives:** none by default. If any is offered it is stated in the invitation and does not depend on what the person says (`interview-guide.md` consent item 6).
6. **Data minimisation:** collect only what the screener needs. Keep names and contact details in a separate access-controlled file outside this repository; the tracker below holds participant codes only. Retention figures in the guide (identifiable details up to 12 months; audio deleted within 30 days of transcription) are proposals pending counsel. The guide notes data-protection laws may apply to interviewees (for example Nigeria's NDPA); jurisdiction-by-jurisdiction advice is a counsel item.
7. **Never request or accept** wallet keys, seed phrases, macaroons, API tokens, payee names or real invoice/payment details, in the sign-up form or in conversation.
8. **Respect "no".** A decline or silence ends contact. Send at most one reminder, and only to someone who had opted in and then went quiet before booking.
9. **Competitor employees** are not recruited (offer a short non-sensitive chat, excluded from counts), per the screener.

## 2. Quotas and what each channel is for

Quotas come from `interview-guide.md` section 1 and are not changed here.

| Segment (from `icp-and-segments.md`) | Buyer | Operator | Integration user | Min. total |
|---|---|---|---|---|
| C1 grant programmes / foundations | 2 | 2 | 0 | 4 |
| C2 wallet / app teams | 1 | 2 | 3 | 6 |
| C3 bounty / creator / affiliate platforms | 1 | 2 | 1 | 4 |
| C4 open-source projects | 1 | 2 | 1 | 4 |
| C5-C8 mixed (explore) | 1 | 1 | 0 | 2 |
| **Total** | 6 | 9 | 5 | **20** (aim 24) |

Other constraints: at most 25 percent warm (so at most 5 of 20, or 6 of 24; warm interviews are excluded from thresholds); count an organisation once (at most 2 people per organisation); at least 4 interviewees in Africa and at least 2 outside Africa.

## 3. Channels

Existence was checked on 2026-11-10 by fetching the page named. Rules, audience size and response rates are NOT VERIFIED. "Segment fit" is my INFERENCE.

| Channel | What I verified | Segment fit (inference) | Region | Notes for posting |
|---|---|---|---|---|
| BTCPay Server community (Mattermost, GitHub, Telegram, Twitter listed under "Join The Community") | https://btcpayserver.org/ : "BTCPay Server is an open-source project, not a company"; lists those four community links | C1, C4, C5 operators who already run payouts; also the people who know the incumbent tool | Global | Ask moderators first. Useful for disconfirming evidence (people already satisfied with BTCPay payouts) |
| Stacker News (territories) | https://stacker.news/faq describes territories and notes posting can cost sats ("Why does it cost more to post in some territories?") | C2, C3, C4 developers | Global | Posting may cost sats; budget for it and follow the territory's rules. Read the FAQ section on territories first |
| BitDevs network (meetups, Socratic seminars) | https://bitdevs.org/ : "a community for those interested in discussing and participating in the research and development of Bitcoin and related protocols" | C2, C4 developers | Global (city chapters) | Ask the local organiser whether an invitation may be shared with their group |
| BitDevs in Africa (Btrust-sponsored) | https://btrust.tech/bitdevs : "a growing network of independent Bitcoin developer meetups sponsored by Btrust and run by local organizers" | C4, C1 (African programme and community staff), C6 | Africa | Local organisers are independent; ask each one, do not treat Btrust as a distribution list. Needed for the Africa quota |
| Public Nostr notes | Not fetched or verified (no source) | C2, C3, C4 | Global | Post once from an account that states who you are; do not message people who reply unless they ask |
| Warm introductions | Not a channel to verify; follows section 5 | All | Any | Cap at 25 percent; label "warm" |

**Candidate channels to verify before use (NOT VERIFIED, not yet researched):** the communities of wallet and node projects (for example Alby, LNbits), funder-run grantee communities, Africa-focused Bitcoin community hubs, and conference side-events. Add a channel to the table only after its rules have been read.

`prospect-list.md` names organisations to understand the market; it is **not** a contact list. A named organisation can be invited only by the same routes as anyone else (a public post it may choose to answer, or a warm introduction).

## 4. Public invitation (template; do not send until approved)

> **Research: how do organisations pay people in Bitcoin?**
> I am [name], working on an early, unproven project about paying people in Bitcoin. This is research, not a sales call, and I am not selling anything. I am looking for people who are involved in paying contributors, grantees, staff, suppliers or community members in Bitcoin, especially over Lightning: the person who runs the payments, the person who approves them, or the developer who automates them.
> What it involves: a 40-minute conversation about how you handle this today, including what has gone wrong. I will not ask for wallet keys, seed phrases, tokens, invoices or payee names, and you can skip any question.
> Your information is kept under a participant code; your name and contact are stored separately and you can ask me to delete them at any time. [State the incentive here, or write "There is no payment or reward."]
> If you would like to take part, or know someone who might, reply here or use [sign-up form link]. If this is not for you, no need to reply. I will not message you unless you reply first.

Sign-up form fields (nothing else): preferred way to be contacted (typed by the person); role (buyer, operator, developer, other); organisation type (one of the segment descriptions); approximate number of people paid last month (bands); share of payments in Bitcoin/Lightning (bands); country or region (optional); checkbox "I agree to be contacted about an interview and to my answers being used for screening, as described in the privacy note"; link to the privacy note. No tracking pixels, no third-party analytics.

## 5. Warm introductions (template; do not send until approved)

Ask the introducer, not the target:

> I am researching how organisations pay people in Bitcoin (research only, nothing is being sold). Do you know someone who runs, approves or automates these payouts and might be willing to talk for 40 minutes? Please ask them first. Only if they say yes, tell them who I am and share this note. If you are not sure, leave it. I will not contact anyone without their agreement.

Introducer to the introducee (their own words, with the invitation text in section 4 attached). Contact details are exchanged only after the introducee answers yes. Record the interview as **warm** in the tracker. Do not ask the introducer for a list of contacts. If an introducer suggests several people in one organisation, count the organisation once.

## 6. Stages and review points

The ICP gives a 90-day validation window (`icp-and-segments.md`). Phases are relative; dates are for the owner to set. No response rate is assumed because none is known.

| Phase | Actions | Review question |
|---|---|---|
| 0. Approval | Owner approves this plan, template wording and incentive decision; counsel reviews consent and retention wording | Are consent text and retention acceptable? |
| 1. Channel check | Read the rules of each channel in section 3, ask moderators or organisers where needed, note the answer in the channel log | Which channels allow an invitation? |
| 2. Post and introduce | One post per approved channel; warm-introduction requests (within the 25 percent cap) | Count sign-ups per channel; do not chase |
| 3. Screen and book | Use screener S1-S8 only for people who opted in; book qualified candidates; politely decline others | Is the quota mix being met (segment, role, Africa/non-Africa)? |
| 4. Interview | Follow `interview-guide.md`; consent first; notes scored within 24 hours | Any bias warnings (hackathon halo, warm) to label? |
| 5. Adjust | If a segment or region is short after the first round of posting, add a verified channel or seek introductions; do not escalate to unsolicited contact | Are we filling gaps by drift? |

Success is measured as in the guide's aggregate table (interviews completed with consent; qualified organisations); recruiting funnel counts are tracked below only to find which channels work.

## 7. Risks and biases specific to recruiting

- **Selection bias:** public posts attract engaged, technical, English-speaking people; record region and role and say so in conclusions (`interview-guide.md` section 9).
- **Hackathon halo:** mark any participant who arrives through the event.
- **Africa quota:** channels that reach African organisers are fewer than global ones; start those first. Language needs (for example French-speaking regions) are not covered by the guide, which is English.
- **Reciprocity and incentive effects:** no free access offered in exchange for praise; pilots are separate (`roi-worksheet-and-pilot-contract.md`).
- **Platform risk:** posting may be removed or can cost sats; do not repost to get around removal.
- **Reachability of C7 and C8:** poor or deferred in the ICP, so expect to fill "explore" slots slowly.

## 8. Tracking templates (EMPTY on purpose; no real or example data)

### 8.1 Channel log

| Channel | Date rules checked | Rules allow invitation? (Y/N/asked) | Who was asked (role, not name) | Date posted | Sign-ups | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |

### 8.2 Candidate pipeline (participant codes only; identity file kept outside the repo)

| Participant code | Source (channel / warm intro / inbound reply) | Warm? | Region (Africa / outside) | Segment | Role (B/O/I) | Opted in (date) | Screener done (Y/N) | Qualifies? | Booked (date) | Completed (date) | Consent / audio | Declined or withdrew (date) | Deletion requested (date) / done (date) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

### 8.3 Quota tracker

| Segment | Buyer done / target | Operator done / target | Integration user done / target | Total done / min |
|---|---|---|---|---|
| C1 | / 2 | / 2 | n/a | / 4 |
| C2 | / 1 | / 2 | / 3 | / 6 |
| C3 | / 1 | / 2 | / 1 | / 4 |
| C4 | / 1 | / 2 | / 1 | / 4 |
| C5-C8 | / 1 | / 1 | n/a | / 2 |
| **All** | / 6 | / 9 | / 5 | / 20 |

| Constraint | Count | Limit |
|---|---|---|
| Warm interviews | | at most 25 percent |
| Interviewees in Africa | | at least 4 |
| Interviewees outside Africa | | at least 2 |
| Organisations with more than 2 interviewees | | 0 |

Interview results go in the scorecard in `interview-guide.md` section 8, not here.

### 8.4 Pre-post checklist (complete for every channel)

- [ ] Channel rules read and quoted in the log
- [ ] Moderator/organiser asked where applicable, answer recorded
- [ ] Invitation states who I am, that it is research, and the incentive (or none)
- [ ] No contact data collected from anywhere except the person's own reply or form
- [ ] Privacy note linked; deletion route stated
- [ ] No claim about the product beyond "early and unproven"

## 9. Not verified

Channel posting rules; audience sizes; response rates; whether any named organisation wants to be contacted; legal sufficiency of the consent and retention wording in each jurisdiction.
