# Interview guide: buyers and operators

Status: DRAFT v0.1, 2026-11-09. Not yet piloted. **The results tables are intentionally empty. No interviews have been conducted. Do not fill them with example data.**

Goal: learn how payouts actually work today, how often they go wrong, what people do about it, and what they would give up (time, access, money) to change it. Not to pitch.
Target: at least **20 completed** interviews (plan for 24 to allow for drop-outs), mix defined in section 1.

## 1. Quota and sampling

| Segment (see [`icp-and-segments.md`](icp-and-segments.md)) | Buyer interviews | Operator interviews | Integration-user interviews | Min. total |
|---|---|---|---|---|
| C1 grant programs / foundations | 2 | 2 | 0 | 4 |
| C2 wallet / app teams | 1 | 2 | 3 | 6 |
| C3 bounty / creator / affiliate platforms | 1 | 2 | 1 | 4 |
| C4 open-source projects | 1 | 2 | 1 | 4 |
| C5 / C6 / C7 / C8 mixed (explore) | 1 | 1 | 0 | 2 |
| **Total** | 6 | 9 | 5 | **20** (aim 24) |

Rules:
- At most 25 percent of interviews from the founder's existing contacts; label them "warm" in the results table and exclude them from keep/kill thresholds.
- Do not interview more than 2 people from one organisation for threshold counting (count the organisation once).
- Include at least 4 interviewees based in Africa and at least 2 outside Africa so the Africa-specific hypothesis is not tested only on itself.
- Recruiting channels are hypotheses; see [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md).

## 2. Screener (5 minutes, async or live)

Ask before booking. Record answers; do not tell the candidate which answers qualify.

| # | Question | Qualifies (for threshold counting) |
|---|---|---|
| S1 | What is your role in paying people or businesses at your organisation? | Buyer, operator, or developer touching payouts |
| S2 | Roughly how many different people or businesses did you pay in the last full month? | 10 or more (or clear plan to reach it) |
| S3 | How many of those payments were in Bitcoin, and how many over Lightning? | At least 5 Lightning in the last 3 months, or plans |
| S4 | How many people take part in deciding or approving a payout? | 2 or more |
| S5 | Do you control the wallet or node used to pay, or does a third party? | Self-controlled or credentials held |
| S6 | Are you comfortable being interviewed for 40 minutes about your payout process, with no sales pitch? | Yes |
| S7 | Do you have a personal or professional relationship with the interviewer? | Label warm/cold only |
| S8 | Country/region you operate from (optional) | Quota tracking |

Disqualify politely if S2 < 5 and no growth plan, or if the candidate is a competitor employee (offer a short non-sensitive chat, excluded from counts).

## 3. Consent and privacy script (read aloud, record agreement)

> Thanks for your time. I am researching how organisations pay people in Bitcoin. This is research, not a sales call, and nothing I say is a product promise. The product I am working on is early and unproven.
>
> Before we start, I want to be clear about what happens to what you tell me:
> 1. I will take written notes. I would like to record audio only if you agree; you can say no and we will carry on.
> 2. I will not ask for wallet keys, seed phrases, macaroons, API tokens, payee names, or real invoice/payment details. If you show me your screen, please hide or redact anything of that kind. If something sensitive appears, tell me and I will not note it.
> 3. Your notes will be stored with a participant code, not your name. Name and contact are kept in a separate file that only I can access. I will keep identifiable details for up to 12 months unless you ask me to delete them sooner, and I will delete audio within 30 days of transcription. (Retention values are proposals; counsel and the privacy policy must confirm.)
> 4. I may quote you anonymously in internal documents. I will not name you or your organisation publicly without separate written permission.
> 5. You can stop at any time, skip any question, and ask me to delete your data by emailing me. I will confirm deletion.
> 6. I am not paying you for this unless I told you so beforehand (state any incentive in the invitation; do not offer incentives that depend on giving positive feedback).
> 7. Do you consent to proceed on these terms? Do you consent to audio recording? (record yes/no separately)

Operational notes:
- Record consent as the first line of the notes (`consent: yes / audio: yes|no / date`).
- Data protection law may apply to interviewees (for example Nigeria's NDPA and related directives, and others depending on location). That is a question for counsel; see register item in [`legal-regulatory-register.md`](legal-regulatory-register.md).
- Store notes in an access-controlled location; never in a public repo.

## 4. Interview flow (about 40 minutes)

| Min | Block |
|---|---|
| 0-3 | Consent, framing, permission to record |
| 3-10 | Context (Set A) |
| 10-20 | Process walk-through and observation task O1 (Sets B) |
| 20-27 | Incidents (Set C) |
| 27-32 | Priorities and rank exercise (Set D) |
| 32-36 | Trust and security (Set E) |
| 36-40 | Buying and budget (Set F), wrap-up (Set G) |

Never describe Orynt before Set F. If asked early, say "I'll show you at the end."

## 5. Questions (non-leading)

Use open prompts. Follow with "Can you tell me about the last time that happened?" Prefer past behaviour over hypotheticals. Silence is a tool.

### Set A: context
1. Tell me about your organisation and what you personally do day to day.
2. What do you pay people or businesses for, and who are they?
3. How did the way you pay people today come about?
4. How many payments went out last month, roughly, and over what rails?
5. Who else is involved when a payment goes out?
6. How has this changed over the last year?

### Set B: process
7. Walk me through the last payout cycle from "we owe someone" to "it is done and recorded." (Observation task O1.)
8. Where do you keep the list of who is owed what?
9. How does someone approve a payment? Show me the last example, with anything sensitive hidden.
10. How do you choose or check the invoice or destination?
11. After the payment, how do you know it arrived?
12. How do you record it for accounting, a funder, or your own records?

### Set C: incidents and workarounds
13. Tell me about the last time a payout went wrong or surprised you.
14. Has a payment ever gone out twice or been unclear whether it went out? What happened next?
15. What did you do in the minutes after you realised? Who did you tell?
16. How long did it take to be sure, and what did it cost you (time, money, trust)?
17. What did you change afterwards, if anything?
18. Besides what we discussed, what other workarounds or checks do you do before pressing send?

### Set D: priorities
19. If you could change one thing about how you pay people, what would it be, and why that?
20. Rank these by how much they matter to you today (move them around and explain): speed of payment; fees; knowing exactly who approved what; avoiding duplicate payments; having proof for someone else; fewer manual steps; staying in control of the funds. (Randomise order each interview.)
21. What would you never want a tool to do with your payouts?

### Set E: trust and security
22. Which tools do you currently trust with access to your wallet or node, and what made you trust them?
23. If a third-party tool needed access to pay from your wallet, what would you want to be true before you allowed it?
24. What have you been asked about security or controls by funders, auditors, boards or insurers?
25. Who in your organisation would have a veto on adding a new tool in the payment path?

### Set F: buying and budget (only now introduce a neutral description of the idea, then ask)
26. What have you paid for, or built, to solve problems like this in the past?
27. If this problem disappeared tomorrow, what would you do with the time or money saved?
28. Who holds the budget for tools around payments, and how are such decisions made?
29. How long would an evaluation take in your organisation, and what would a trial need to include?
30. Tell me about the last tool you adopted in this area: how did you find it, what did it cost, what almost stopped you?

### Set G: wrap-up
31. What did I not ask that I should have?
32. Who else should I speak to, who feels this problem strongly or disagrees with what you said? (Ask for introductions only with consent.)

## 6. Observation tasks

| ID | Task | What to watch for | Safety |
|---|---|---|---|
| O1 | "Show me how you handled your last payout cycle." (screen share or walkthrough) | Number of tools touched, manual copy/paste points, where approval and evidence live, waiting time | Redact payee data and credentials; do not capture real invoices |
| O2 | "Here is an anonymised payout record (provided by interviewer). Tell me what you would check before approving it." | What they look for; do they notice the invoice expiry/amount mismatch seeded in the record | Use fabricated example data labelled as test data |
| O3 | "Imagine the wallet gave a timeout after you pressed send. Show me what you would do next." (use their own tools, no real funds) | Whether they retry; how they look up the outcome | No real payment attempted |
| O4 | Optional: show a clickable prototype or CLI session on regtest; ask them to complete one task aloud | Confusions; trust objections; where they stop | Clearly labelled as prototype on regtest; no claims beyond PRODUCT-BRIEF |

## 7. Scoring rubric (per interview, scored by the interviewer within 24 hours, second-scored where possible)

Score each dimension 0 to 4 on **observed behaviour**, not enthusiasm.

| Dimension | 0 | 2 | 4 |
|---|---|---|---|
| Recurrence | No recurring payouts | Monthly, under 10 payees | At least monthly with 10+ payees |
| Pain evidence | No incident, no workaround | Workarounds exist but no incident | Real incident in last 12 months with measurable cost |
| Process fragmentation | One integrated tool | Two disconnected places | Obligation, approval, execution, evidence in 3+ places |
| Approval need | No approver | Informal approval | Formal or externally required approval/evidence |
| Current spend | Nothing spent or built | Internal time but no spend | Paid for or built something (time or money quantified) |
| Access willingness | Refuses any connection | Would consider after security review | Would pilot on regtest/testnet or capped wallet within 30 days |
| Budget authority | None, cannot influence | Influencer | Holds or directly controls budget |
| Urgency | No trigger | A trigger within a year | Trigger now (section 5 of ICP) |

Pain score = mean of Pain evidence, Process fragmentation and Approval need. Interview is **qualified** if Recurrence >= 3 and Access willingness >= 1 and organisation is not warm.
Interviewer must also record `disconfirming evidence` (anything that argues against the thesis) for every interview. An interview with no disconfirming note is under-reviewed.

## 8. Scorecard and results (EMPTY on purpose)

| Participant code | Date | Segment | Role (B/O/I) | Region | Warm? | Consent / audio | Recur. | Pain ev. | Fragm. | Approval | Spend | Access | Budget | Urgency | Qualified? | Real incident? | Disconfirming note | Follow-up commitment (behavioural) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | | | | | |

Aggregate (formulas for later; do not fill without data):

| Metric | Formula | Value |
|---|---|---|
| Interviews completed | count rows with consent = yes | |
| Qualified organisations | count unique orgs with Qualified = yes | |
| Real-incident rate | orgs with Real incident = yes / qualified orgs | |
| Mean pain score | mean Pain score over qualified | |
| Access-willing share | qualified with Access >= 3 / qualified | |
| Behavioural commitments | count follow-up commitments that cost the interviewee time or data | |

## 9. Bias warnings

- **Confirmation bias**: you want this to work. Pre-commit to the thresholds in [`thesis-and-falsification.md`](thesis-and-falsification.md) and write disconfirming notes.
- **Politeness bias**: people say "interesting." Ask for the last time, the cost, and the next step.
- **Leading questions**: do not name a feature in Sets A-E. Never say "wouldn't it be useful if". Do not mention Orynt before Set F.
- **Hypothetical bias**: "would you pay" answers are almost worthless. Anchor on past spend and past incidents.
- **Selection bias**: reachable Bitcoin builders over-represent engaged, technical, English-speaking people. Track region and role and say so in conclusions.
- **Survivorship**: organisations that stopped paying in Bitcoin do not reply. Ask about churned practices.
- **Hackathon halo**: people may be nice because of event context. Mark interviews arising from hackathon contact.
- **Anchoring**: do not state price numbers before they speak about budget.
- **Founder-as-product-owner**: do not defend the design in the interview. Take notes.
- **Reciprocity pressure**: do not offer free access in exchange for praise; invitations to pilot are separate (see [`roi-worksheet-and-pilot-contract.md`](roi-worksheet-and-pilot-contract.md)).

## 10. After each interview checklist

- [ ] Notes scored within 24 hours; second scorer if available.
- [ ] Sensitive info removed; identity file separated.
- [ ] Behavioural commitment recorded (or "none").
- [ ] Update the results table and segment decision log.
- [ ] Thank-you message with no pitch; deletion request instructions included.
