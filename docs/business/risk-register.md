# Risk register

Status: DRAFT v0.1, 2026-11-09. Likelihood (L) and Impact (I): 1 low to 5 high, author's judgement before evidence. Score = L x I. Owner is a role; today every owner is the solo founder unless stated. Review at each go/no-go checkpoint ([`go-no-go-framework.md`](go-no-go-framework.md)).

Rating key: 1-6 low, 8-12 medium, 15-25 high.

## 1. Market risks

| ID | Risk | L | I | Score | Early warning | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| M1 | Niche too small: too few orgs meet the ICP (A1 low in [`market-model.md`](market-model.md)) | 4 | 4 | 16 | Screener pass rate under 25 percent | Build counted census early; widen to wallet-team channel; accept open-source/grant-funded outcome | Founder |
| M2 | Pain is real but not acute: spreadsheets and chat are "good enough" | 4 | 4 | 16 | Few real incidents in interviews (T3) | Target orgs with incidents/audit pressure; stop if threshold fails | Founder |
| M3 | Willingness to pay is near zero (open-source culture; small budgets) | 4 | 5 | 20 | No budget lines named; no paid pilot | Paid concierge test; services model; grant funding; stop rule | Founder |
| M4 | Wallet/node vendors or payout platforms add similar features | 3 | 4 | 12 | Release notes of competitors (see `docs/research/competitor-matrix.md`) | Neutral cross-wallet positioning; deeper evidence/reconciliation | Founder |
| M5 | In-house scripts win | 4 | 3 | 12 | "We built our own" answers | ROI worksheet vs build cost; SDK that makes build-vs-buy easier | Founder |
| M6 | Bias in sample (reachable builders not representative) | 4 | 3 | 12 | All interviews from one community | Quotas by region/role; disconfirming-evidence notes | Founder |
| M7 | Hackathon success mistaken for validation | 4 | 4 | 16 | Planning based on stars, awards | Explicit distinction in go/no-go; thresholds pre-registered | Founder |

## 2. Product risks

| ID | Risk | L | I | Score | Early warning | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| P1 | Scope creep into custody, exchange, escrow, AI spending | 3 | 5 | 15 | Feature requests that need holding funds | Honest-limits list in brief; written refusal criteria | Founder |
| P2 | Users overtrust the product (treat tamper-evident as immutable, receipts as legal proof) | 3 | 4 | 12 | Questions assuming guarantees | Limits shown in UI/docs and receipts; sales language review | Founder |
| P3 | Approval friction: approvers refuse device-signing step | 3 | 4 | 12 | Observation task O4 failures | UX tests; alternative approval channels (designed per brief only) | Founder |
| P4 | Capability overstated in docs or demos (claims beyond VERIFIED) | 3 | 5 | 15 | Docs vs EXECUTION-REGISTER mismatches | Status rule in brief; pre-publication check against register | Founder |
| P5 | Single wallet backend (LND REST on regtest) too narrow | 4 | 3 | 12 | Prospects use other wallets/nodes | Adapter abstraction; measure demand by backend in interviews | Founder |

## 3. Technical risks

| ID | Risk | L | I | Score | Early warning | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| T1 | Double payment or lost-funds bug in execution path | 2 | 5 | 10 | Reconciliation test failures | Reserve-before-dispatch design, fault-injection tests, independent review before mainnet, no real funds without consent | Founder |
| T2 | Wrongly classifying UNKNOWN as FAILED (or vice versa) | 2 | 5 | 10 | Mismatch vs provider records in tests | Evidence-based monotonic states; property tests; adapter conformance suite | Founder |
| T3 | Key or credential compromise (approver keys, wallet credentials, API keys) | 3 | 5 | 15 | Any secret-scan alert | Least privilege; secrets handling doc; rotation procedure; regtest-first | Founder |
| T4 | Database administrator tampering (log is tamper-evident not immutable) | 3 | 3 | 9 | Checkpoint mismatch | Signed checkpoints; external anchoring (not done) | Founder |
| T5 | Lightning backend behaviour differences / API changes | 3 | 3 | 9 | Adapter test failures after upstream releases | Pin versions; conformance tests | Founder |
| T6 | Execution register not verified: features presented as built are not | 3 | 5 | 15 | Rows not VERIFIED | Do not claim; run commands, save evidence paths | Founder |
| T7 | Toolchain constraints (no docker daemon; unexecuted bitcoind/lnd per M0 note) delay verification | 4 | 3 | 12 | Milestones slipping | Local PostgreSQL path; schedule verification early | Founder |

## 4. Regulatory and legal risks

| ID | Risk | L | I | Score | Early warning | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| R1 | Counsel concludes licensing is required for the intended architecture (hypothesis T8 fails) | 3 | 5 | 15 | Counsel responses to X1, NG1, KE1, ZA1 | Engage counsel early; keep self-host option; stop/pivot rule | Founder / Counsel TBD |
| R2 | Hosted tier changes characterisation vs self-host | 3 | 4 | 12 | Counsel X2 | Delay hosted tier until answered | Founder |
| R3 | Data protection non-compliance (NDPA, GDPR, others) in research or telemetry | 3 | 4 | 12 | Complaints; missing consent records | Consent script; minimisation; counsel review | Founder |
| R4 | Customers use Orynt for illicit flows | 2 | 5 | 10 | Abuse reports | Acceptable use policy; cooperate with lawful requests; no custody | Founder |
| R5 | Misleading marketing (claims of compliance, customers, security) | 2 | 5 | 10 | Review findings | Claims checklist against brief; no fabricated assets | Founder |
| R6 | Regulatory landscape shifts quickly (several jurisdictions changed rules in 2025, per secondary sources) | 4 | 3 | 12 | Counsel updates | Quarterly review of register | Founder / Counsel TBD |
| R7 | Name/trademark conflict ("Orynt" has no clearance) | 3 | 3 | 9 | Search hits | Clearance search before public launch | Founder |

## 5. Key-person risk (solo founder)

| ID | Risk | L | I | Score | Early warning | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| K1 | Founder unavailable (illness, burnout, income need) | 3 | 5 | 15 | Missed weekly reviews | Pre-agree stop dates; document runbooks; self-hostable core and offline verifier | Founder |
| K2 | Single reviewer for code, security, legal reading, finance | 4 | 4 | 16 | No second pair of eyes on money paths | External review before mainnet; advisers | Founder |
| K3 | Founder bias in reading evidence | 4 | 4 | 16 | No disconfirming notes | Pre-registered thresholds; external reviewer of scorecards | Founder |
| K4 | Support load destroys development time | 3 | 3 | 9 | Hours per customer above assumption | Cap pilots; docs | Founder |
| K5 | No continuity for customers if project stops | 3 | 4 | 12 | Customer asks | Exit terms; open-source core; data export | Founder |

## 6. Supply-chain and dependency risks

| ID | Risk | L | I | Score | Early warning | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| S1 | Malicious or vulnerable third-party package dependency (any package registry) | 3 | 5 | 15 | Audit alerts | Pin versions, lockfiles, minimise dependencies, review of crypto-related packages | Founder |
| S2 | Compromised release artefacts for bitcoind/lnd | 2 | 5 | 10 | Checksum mismatch | Checksum verification (done for download per register note, not executed); verify signatures | Founder |
| S3 | Upstream breaking changes (LND, PostgreSQL, SDK deps) | 3 | 3 | 9 | CI failures | Version pinning; adapter tests | Founder |
| S4 | CI/CD or repository account compromise | 2 | 5 | 10 | Unexpected pushes | 2FA, branch protection, signed commits (planned) | Founder |
| S5 | Hosting provider lock-in or outage (hosted tier) | 3 | 3 | 9 | Outage | Portable deployment; backups (not done) | Founder |
| S6 | Licence incompatibility among dependencies and chosen core licence | 2 | 3 | 6 | Licence scan | Licence audit before release | Founder |

## 7. Top risks heading into the validation phase

1. M3 willingness to pay (20)
2. M1, M2, M7, K2, K3 (16 each)
3. P1, P4, T3, T6, R1, K1, S1 (15 each)

Actions by 2026-12-07: write counsel brief; run register verification (T6); start census; pre-register thresholds; second reviewer for scorecards.

## 8. Risk review log (empty)

| Date | Risk ID | Change (L/I) | Reason | New action |
|---|---|---|---|---|
| | | | | |
