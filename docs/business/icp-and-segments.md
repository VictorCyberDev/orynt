# ICP and segments

Status: DRAFT v0.1, 2026-11-09. Hypotheses only. No customer, interview or pilot data exists. Categories below are **types of organisation**, not named customers and not an implied pipeline.

## 1. Working ICP (hypothesis H-ICP-1)

An organisation, team or programme that:

1. pays **at least 10 distinct people or businesses per cycle**, at least monthly, in Bitcoin over Lightning (or intends to within 6 months);
2. has **at least two humans involved** in a payout decision (requester and approver), even informally;
3. controls its own Lightning wallet or node (or a wallet account whose API credentials it holds) and is willing to connect it with limited permissions;
4. has felt at least one of: a double payment, a payment of unknown outcome, an approval dispute, an audit/accounting request for proof of payment, or a payee asking "did you pay me?";
5. has someone who owns the payout process (operator) and someone who can approve spend (buyer or approver).

Anti-ICP (do not pursue until the thesis is proven elsewhere): regulated custodians and exchanges; consumers; anyone wanting Orynt to hold, move, convert or lend funds; anyone wanting autonomous/AI-initiated spending without human approval.

## 2. Named target categories (not named customers)

| # | Category | Typical payout pattern (hypothesis) | Likely buyer | Likely operator | Integration user | Initial priority hypothesis |
|---|---|---|---|---|---|---|
| C1 | Grant programs and foundations that fund open-source/Bitcoin work and pay in sats | Periodic recipient payouts, milestone-based | Programme director or finance lead | Programme manager / treasurer | Rare; mostly use UI/CLI | High for pain, low for budget |
| C2 | Wallet and Lightning app teams who run rewards, referrals, refunds or contributor payments | Frequent small payouts, partly automated | Product or engineering lead | Support/ops engineer | Backend engineer using SDK/webhooks | High (also channel) |
| C3 | Bounty, creator, affiliate and tipping platforms paying out in sats | Many small payouts, high frequency | Head of ops or founder | Payments/ops analyst | Platform engineer | Medium, regulatory sensitivity high |
| C4 | Open-source projects paying maintainers or contributors | Monthly or ad hoc | Maintainer or fiscal-host admin | Treasurer/maintainer | Maintainer scripting the CLI | Distribution channel, low revenue |
| C5 | Bitcoin-native companies paying contractors and suppliers in BTC | Monthly invoices, finance-run | CFO/finance lead or founder | Bookkeeper/ops | Developer if automated | Medium |
| C6 | Community and meetup/ecosystem organisations in emerging markets paying local contributors/vendors | Event-driven bursts | Programme lead | Community manager | Rare | Medium, depends on counsel for local rules |
| C7 | Merchants with BTC refund obligations | Event-driven, low volume | Ops/finance | Support agent | Plugin/engineer | Low (poor reachability) |
| C8 | Remittance-adjacent payroll for distributed teams | Recurring, individual payees | HR/finance | Payroll operator | Engineer | Deferred pending counsel (see [`legal-regulatory-register.md`](legal-regulatory-register.md)) |

Scoring rationale for these categories is in [`thesis-and-falsification.md`](thesis-and-falsification.md) section 4. Priorities here are hypotheses to be replaced by interview scores.

## 3. Roles and journeys

Orynt will have three distinct people in the loop. They have different goals; do not merge them in interviews.

### 3.1 Buyer (decides to adopt and to pay)

| Stage | What they do (hypothesis) | Orynt must show | Evidence to collect |
|---|---|---|---|
| Trigger | Incident, audit request, growth in payee count, hiring a finance person | Fast path to "see it with our data" without risking funds | Which trigger events actually occurred (section 5) |
| Evaluate | Compares to status quo, in-house script, wallet features | Honest limits, security posture ([`security-due-diligence.md`](security-due-diligence.md)), what is not done | Questions asked; objections (see GTM objection table) |
| Approve | Takes it to a team, risk owner or board | One-page ROI ([`roi-worksheet-and-pilot-contract.md`](roi-worksheet-and-pilot-contract.md)) | Who else must sign off; time to decision |
| Pay | Procures a subscription or pilot | Clear pricing hypothesis, exit terms | Whether budget exists, which cost centre |
| Renew | Looks at payouts completed, exceptions resolved | Usage and exception reports | Renewal rationale |

### 3.2 Operator (runs payouts day to day)

| Stage | What they do | Pain (hypothesis) | Orynt must show |
|---|---|---|---|
| Collect obligations | Gather payee, amount, invoice from chat/sheet | Wrong or expired invoices, copy-paste errors | Invoice decoded and bound to the record |
| Request approval | Ping approvers | Approvals are verbal and untraceable | Approval bound to exact intent digest |
| Execute | Paste into wallet UI | Fear of double send, lost responses | Reservation before dispatch, UNKNOWN never FAILED |
| Reconcile | Compare wallet history to sheet | Manual, error-prone | Provider-sourced result looked up by payment hash |
| Evidence | Screenshot into folder | Weak proof for accountants | Receipt + offline verifier |
| Handle exceptions | Respond to "where is my payment?" | Support load | Time-to-resolution tracking |

### 3.3 Integration user (developer who wires Orynt into a product or script)

| Stage | What they do | Needs | Risk |
|---|---|---|---|
| Discover | Reads docs/OpenAPI, tries SDK | Clear quickstart on regtest, honest limits | Hype-averse; will leave on any overclaim |
| Integrate | Implements adapter or webhooks | Typed SDK, signed webhooks, idempotency semantics | Breaking changes, unclear semantics |
| Operate | Monitors, debugs | Logs, stable errors, verifier | Lock-in fear; wants export |
| Advocate or churn | Recommends in community | Predictable behaviour | One bad incident ends trust |

## 4. Jobs to be done (JTBD)

Stated as hypotheses; each should appear in interview notes as unprompted or prompted.

| ID | Job | Context | Desired outcome | Current alternative |
|---|---|---|---|---|
| J1 | When I owe many people sats, help me keep the obligation, approval and evidence in one place so that I can answer "who approved this and was it paid?" quickly | Monthly payout cycle | Minutes, not hours, to reconstruct a payout | Sheet + chat + screenshots |
| J2 | When a wallet response is lost, help me know whether to retry so that I do not pay twice or leave someone unpaid | Network error mid-payment | No duplicates, no stalls | Manual wallet history check, guessing |
| J3 | When someone approves a payout, help me prove they approved that exact amount and payee | Controls requirement from a funder, board or auditor | Defensible approval trail | Chat message |
| J4 | When an accountant or funder asks for proof, help me hand over verifiable evidence without my involvement | Quarter-end or grant report | Self-serve verification | Screenshot bundle |
| J5 | When payee count grows, help me limit what any one operator can do | Scaling team | Role separation, limits | Shared wallet access |
| J6 | When I build a product with payouts, help me integrate safe payout semantics without reinventing them | Product roadmap | Fewer bespoke state machines | In-house script |

## 5. Trigger events (what would make someone look now)

- [ ] A duplicate or lost payment in the last 12 months.
- [ ] A funder, board member or auditor asked for payment evidence or approval trail.
- [ ] Payee count or payout frequency doubled.
- [ ] A person with wallet access left the organisation, or the team added a second approver.
- [ ] A move from manual wallet UI to scripted payouts.
- [ ] A new programme or grant round beginning, with payouts scheduled.
- [ ] Regulatory or banking pressure making records more important (do not assume; ask).

Record each trigger observed as a tally in the interview results table; absence of triggers is evidence against urgency.

## 6. Disqualifiers (stop spending time)

| Disqualifier | Why |
|---|---|
| Fewer than 5 payouts per month and no growth plan | Pain too low for a paid tool; may still be a free-core user |
| Expects Orynt to hold funds, convert fiat, run KYC, or act as exchange/escrow | Out of scope and conflicts with non-custodial positioning |
| Wants fully autonomous spending without human approval | Out of scope by design |
| Cannot grant any wallet access (even regtest/testnet demo with their workflow) | Cannot pilot; keep as a later lead |
| Requires immediate SOC 2/ISO certification to proceed | None exists; record as lost-deal reason, do not claim otherwise |
| Procurement cycle clearly longer than the validation window | Cannot be validated in 90 days |
| Relationship with the founder makes the signal unreliable | List separately as "friendly", exclude from thresholds |

## 7. Segment decision log (fill during validation)

| Date | Segment | Interviews done | Avg pain score (rubric) | Pilot agreed | Decision | Reason |
|---|---|---|---|---|---|---|
| | | | | | | |

Leave empty until real data exists.
