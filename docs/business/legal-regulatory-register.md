# Legal and regulatory issue register (for counsel)

Status: DRAFT v0.1, 2026-11-09. **This is an issue list for qualified counsel. It states no conclusions.** Nothing here says that any licence, registration or exemption applies or does not apply. The author is not a lawyer. Every statute, rule or regulator cited below **must be verified by counsel** against the primary text and its current status; the notes are search-snippet-level context retrieved on 2026-11-09 from secondary sources and may be wrong, incomplete or out of date.

Key framing: Orynt's non-custodial positioning is a **hypothesis that depends on architecture**. The product is designed to sit in front of a wallet the operator controls and not to custody funds (see [`../product/PRODUCT-BRIEF.md`](../product/PRODUCT-BRIEF.md)). Whether that design, the permissions Orynt is given (for example the ability to initiate payments via a wallet credential), the hosted Team Cloud tier, the receipts, and any fee structure change the legal characterisation in any jurisdiction is exactly what counsel must answer. Facts needed by counsel: what keys or credentials Orynt holds or can use, whether Orynt can initiate payments without a human approval, who instructs and who executes, and where data and servers are located.

Risk level in the table is the author's triage of "how much could this block or reshape the business if the answer is unfavourable" (High / Medium / Low). It is not a legal risk assessment. Owner: "Founder" to brief; "Counsel TBD" because no counsel has been engaged. Status for every item: **NOT STARTED**.

## 1. How to use this register

1. Engage counsel with Nigeria and one other African jurisdiction experience first (Nigeria is the first hypothesised market), plus a US/EU adviser for the reference regimes.
2. Give counsel the architecture facts above and PRODUCT-BRIEF.
3. Ask for written answers per item; record date, counsel, and conclusion in the log (section 4), not in this file's question text.
4. Until answers exist, no public claim that Orynt is "compliant", "licensed", "exempt", "regulated" or "non-custodial for legal purposes".

## 2. Issue register

### 2.1 Cross-cutting (architecture and positioning)

| ID | Question | Jurisdiction | Why it matters to Orynt | Risk | Owner | Status |
|---|---|---|---|---|---|---|
| X1 | Does a software layer that holds a limited-permission credential to a user's wallet, and can instruct payments after human approval, fall within any money transmission, payment service or virtual asset service concept? Does it matter whether credentials can only pay or can also move funds out freely? | All below; US and EU as reference | Core to the non-custodial thesis (T8) | High | Founder to brief; Counsel TBD | NOT STARTED |
| X2 | Does the hosted Team Cloud tier change the answer in X1 compared with self-hosted core? | All | Business model depends on hosted tier | High | Founder; Counsel TBD | NOT STARTED |
| X3 | Is pricing as a percentage of payout volume or per payout treated differently from flat software pricing? | All | Pricing guardrail in [`pricing-hypotheses.md`](pricing-hypotheses.md) | Medium | Founder; Counsel TBD | NOT STARTED |
| X4 | What disclosures, terms of service and limits-of-liability are advisable for a product that triggers payments (lost-funds scenarios, wallet-permission misuse, application-level enforcement only)? | All | Funds-adjacent liability | High | Founder; Counsel TBD | NOT STARTED |
| X5 | Corporate structure and entity location (incorporation, IP ownership, open-source licence choice, contributor agreements, trademark/domain clearance for "Orynt") | Founder's jurisdiction plus target markets | No entity exists to contract; name provisional | Medium | Founder; Counsel TBD | NOT STARTED |
| X6 | Sanctions screening: is any obligation triggered for a non-custodial software provider whose users send payments? | US, EU, others | Could be relevant to hosted cloud | Medium | Founder; Counsel TBD | NOT STARTED |
| X7 | Does providing "receipts" or "evidence" create any regulatory or professional-services implication (for example evidentiary or accounting claims)? Receipts already disclaim delivery, enforceability and absence of other payments | All | Marketing language risk | Low | Founder; Counsel TBD | NOT STARTED |
| X8 | Tax and accounting treatment of Bitcoin-denominated revenue and of payouts | Founder's jurisdiction | Pricing and billing mechanics | Medium | Founder; Counsel/accountant TBD | NOT STARTED |
| X9 | Unsolicited outreach and email rules for the draft outreach in [`go-to-market-and-partnerships.md`](go-to-market-and-partnerships.md) | Recipient jurisdictions | Compliance of GTM | Low | Founder; Counsel TBD | NOT STARTED |

### 2.2 Nigeria

Context to verify (secondary, 2026-11-09): reports that the Investments and Securities Act 2025 (signed in 2025; sources differ on the exact date) defines securities to include virtual and digital assets and brings digital asset operators and VASPs under the SEC's remit (https://www.pwc.com/ng/en/publications/summary-of-key-changes-investments-securities-act-2025.html; https://www.mondaq.com/nigeria/fin-tech/1623238/what-the-investment-and-securities-act-2025-means-for-digital-and-virtual-assets-in-nigeria). SEC Nigeria has a pre-licensing incubation framework for VASPs and amended digital asset rules (https://www.mondaq.com/nigeria/securities/1699044/a-closer-look-at-the-securities-and-exchange-commissions-sec-accelerated-regulatory-incubation-program-structure; https://chambers.com/articles/overview-of-the-sec-s-amended-digital-assets-rules); status of the amended rules was inconsistently reported. Data protection: reports that the NDPC issued a General Application and Implementation Directive (GAID) 2025 under the Nigeria Data Protection Act 2023, effective 19 September 2025 (https://www.mondaq.com/nigeria/privacy-protection/1606106/the-nigeria-data-protection-commission-issues-the-general-application-and-implementation-directive-2025-gaid; https://digitalpolicyalert.org/event/33615-data-protection-commissions-general-application-and-implementation-directive-including-data-protection-authority-governance-ndpcndp-act-gaid012025-enters-into-force). Reports that Nigeria was removed from the FATF increased-monitoring list in October 2025 (https://nairametrics.com/2025/10/24/fatf-removes-nigeria-from-grey-list-boosting-investor-confidence/). All of this requires counsel verification.

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| NG1 | Under SEC Nigeria's digital-asset framework, could a non-custodial payout-authorization software provider be a "digital asset operator", "VASP" or other regulated category, in self-hosted and hosted forms? What are the licensing and registration implications, if any? | Determines feasibility of the first hypothesised market | High | Founder; Counsel TBD | NOT STARTED |
| NG2 | Is a Bitcoin (non-issuer) payout a "security" or relevant "digital asset" under the ISA 2025 for these purposes; does it matter that Orynt does not issue, offer, or trade? | Frames SEC scope | Medium | Counsel TBD | NOT STARTED |
| NG3 | CBN posture: what is the current position on banks and regulated financial institutions interacting with crypto-asset businesses, and how does it affect customers who need naira on/off-ramps (not an Orynt function) or who bank with Nigerian institutions? | Customer ecosystem and off-ramp assumptions | Medium | Counsel TBD | NOT STARTED |
| NG4 | NDPA 2023 and GAID 2025: is Orynt a data controller or processor for payee data; registration with NDPC (data controller/processor of major importance), DPIA triggers, cross-border transfer requirements, breach notification timing | Telemetry, hosted tier, pilot contract | High | Founder; Counsel TBD | NOT STARTED |
| NG5 | AML/CFT: does the Money Laundering (Prevention and Prohibition) framework or SEC AML rules impose obligations on a software provider; do customers (grant programmes, platforms) have obligations that Orynt's receipts should support? | Product requirements and positioning | High | Counsel TBD | NOT STARTED |
| NG6 | Travel rule: if applicable to customers who are VASPs, what data must accompany payments and could Orynt's data model become relevant? | Evidence/receipt design | Medium | Counsel TBD | NOT STARTED |
| NG7 | Is outsourcing payouts to Nigerian contributors by foreign organisations subject to exchange-control or tax rules relevant to our users? | Customer demand and messaging | Low | Counsel TBD | NOT STARTED |
| NG8 | Does the SEC incubation/sandbox route make sense, or invite unnecessary scrutiny? | Strategy | Medium | Founder; Counsel TBD | NOT STARTED |

### 2.3 Senegal and UEMOA / BCEAO

Context to verify (secondary, low-reliability in parts): reports that the BCEAO has no dedicated crypto-asset framework yet and has restated that crypto is not a currency; preparatory work for a UEMOA-level framework; a reference to a BCEAO instruction on AML/travel rule that is only on a low-reliability source (https://www.ecofinagency.com/news-finances/2407-57691-waemu-cryptoasset-regulation-remains-in-preparation-bceao-urges-caution; https://www.financialafrik.com/en/2026/08/26/regulation-of-cryptoassets-in-the-uemoa-between-financial-innovation-and-preservation-of-monetary-stability/). Treat as unverified.

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| SN1 | What is the legal status of offering a crypto-payment software tool to users in Senegal / UEMOA states given the absence (as reported) of a specific framework? Is BCEAO authorisation relevant to non-custodial software? | Francophone West Africa as a market | High | Counsel (local) TBD | NOT STARTED |
| SN2 | Foreign-exchange and payment-system rules that may affect organisations paying UEMOA residents in Bitcoin | Customer demand; messaging | Medium | Counsel TBD | NOT STARTED |
| SN3 | Language and consumer-law requirements (French-language terms) | Docs/terms | Low | Counsel TBD | NOT STARTED |
| SN4 | Data protection law of Senegal and any regional rules for processing payee data | Telemetry and hosted tier | Medium | Counsel TBD | NOT STARTED |

### 2.4 Kenya

Context to verify (secondary, 2026-11-09): reports that the Virtual Asset Service Providers Act, 2025 was assented on 15 October 2025 and commenced in November 2025, with the CBK and CMA as regulators, regulations still being developed and a transition window for existing providers (https://www.cliffedekkerhofmeyr.com/news/publications/2026/Kenya/Corporate-Commercial/corporate-and-commercial-alert-15-january-Kenya-VASP-Act-2025-A-new-era-for-virtual-asset-regulation; https://taxnews.ey.com/news/2025-2314-kenya-enacts-virtual-asset-service-providers-act-2025-a-new-regulatory-era). Sources disagree on commencement date. Counsel must verify.

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| KE1 | Does the VASP Act (or regulations) cover a non-custodial software layer for payouts, hosted or self-hosted; which regulator (CBK vs CMA) would be relevant? | Kenya is a plausible early market | High | Counsel (local) TBD | NOT STARTED |
| KE2 | Kenya Data Protection Act 2019 obligations (registration as controller/processor, cross-border transfer) | Hosted tier | Medium | Counsel TBD | NOT STARTED |
| KE3 | Obligations of customers (platforms paying Kenyan recipients) that Orynt's evidence could support or complicate | Product requirements | Medium | Counsel TBD | NOT STARTED |

### 2.5 South Africa

Context to verify: reports that crypto-asset service providers are licensed by the FSCA as financial services providers, that a travel-rule implementation notice exists, and that South Africa left the FATF increased-monitoring list in October 2025 (https://sundayworld.co.za/business/national-treasury-ecstatic-as-south-africa-is-removed-from-greylist; https://www.moneylaundering.com/wp-content/uploads/2024/04/SouthAfrica.NoticeComment.ImplementationTravelRule.041824.pdf). Counsel must verify.

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| ZA1 | Is a non-custodial payout-authorization software provider a "crypto asset service provider" under FAIS/FSCA declarations? What does "non-custodial" mean in this regime? | Entry point for a formally regulated market | High | Counsel (local) TBD | NOT STARTED |
| ZA2 | Travel rule and FIC Act obligations of customers and any derivative obligations on the software provider | Product requirements | Medium | Counsel TBD | NOT STARTED |
| ZA3 | POPIA obligations for processing payee data, cross-border transfer | Hosted tier | Medium | Counsel TBD | NOT STARTED |
| ZA4 | Exchange-control restrictions relevant to South African organisations paying abroad in Bitcoin | Customer demand | Low | Counsel TBD | NOT STARTED |

### 2.6 Reference regimes: EU (MiCA) and US

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| EU1 | Under MiCA and related EU rules (including the transfer-of-funds / travel rule regime for crypto-asset transfers), is a non-custodial payout-authorization tool a CASP service, or outside scope? Does hosting change this? | EU customers/hosting location; reference benchmark | High | Counsel (EU) TBD | NOT STARTED |
| EU2 | GDPR: controller/processor roles, lawful basis for telemetry, transfers, DPA templates for pilots | Hosted tier, interviews | Medium | Counsel (EU) TBD | NOT STARTED |
| US1 | FinCEN money transmitter analysis (including guidance on "user" vs "administrator" and software providers) and state money transmission laws if any US users or hosted US operations | US customers, US-based hosting | High | Counsel (US) TBD | NOT STARTED |
| US2 | Securities law relevance for any token or equity-linked incentives (none planned) | Fundraising | Low | Counsel TBD | NOT STARTED |
| US3 | OFAC and export/crypto cryptography rules for open-source distribution | OSS release | Low | Counsel TBD | NOT STARTED |

### 2.7 Global AML/CFT and travel rule (FATF framework)

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| FA1 | Where customers are VASPs subject to FATF Recommendation 16 style rules, what data would their workflows need to carry, and should Orynt's schema accommodate it or explicitly refuse? | Avoid accidental scope expansion | Medium | Counsel TBD | NOT STARTED |
| FA2 | Should Orynt refuse or flag operation involving sanctioned destinations or addresses? Is that a legal duty, a policy choice, or beyond scope? | Product policy | Medium | Counsel TBD | NOT STARTED |
| FA3 | Is it prudent to adopt an Acceptable Use Policy prohibiting illicit use, and what enforcement is reasonable for a non-custodial tool? | Terms of service | Medium | Counsel TBD | NOT STARTED |

### 2.8 Product-specific consumer/contract points

| ID | Question | Why it matters | Risk | Owner | Status |
|---|---|---|---|---|---|
| P1 | Are electronic signatures by approvers (device-held Ed25519 keys) legally meaningful for approvals in any target jurisdiction, and what should the product say about that? (Receipts already disclaim enforceability.) | Marketing claims on "evidence" | Medium | Counsel TBD | NOT STARTED |
| P2 | Pilot agreement (draft in [`roi-worksheet-and-pilot-contract.md`](roi-worksheet-and-pilot-contract.md)): liability, data processing, governing law | Pilots cannot start without it | High | Founder; Counsel TBD | NOT STARTED |
| P3 | Open-source licence choice and effect on commercial layer, contributor licence agreements, patents | Business model and grant eligibility | Medium | Founder; Counsel TBD | NOT STARTED |
| P4 | Export of audit logs and receipts as evidence in disputes: retention duties | Retention design | Low | Counsel TBD | NOT STARTED |
| P5 | Interview and research consent compliance under data protection law ([`interview-guide.md`](interview-guide.md)) | Validation programme | Medium | Counsel TBD | NOT STARTED |

## 3. Pre-counsel guardrails (what Orynt does in the meantime)

- [ ] Describe Orynt only as in PRODUCT-BRIEF; never claim licensed, compliant, regulated, exempt or audited.
- [ ] No mainnet execution for third parties until at least X1, X4, P2 and the relevant jurisdiction items have written counsel answers.
- [ ] No fiat on/off-ramps, custody, escrow or conversion features.
- [ ] No payment of customers' funds from Orynt-controlled wallets.
- [ ] No percentage-of-volume pricing.
- [ ] Interviews and pilots start on regtest/simulator with no real personal data of payees.

## 4. Counsel response log (empty)

| Date | Item ID | Counsel / firm | Answer summary (as written by counsel) | Follow-up actions |
|---|---|---|---|---|
| | | | | |
