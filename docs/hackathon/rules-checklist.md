# Dakar Bitcoin Hack 2026: rules checklist

Verified against pages retrieved **2026-11-09 (~14:20 UTC)** via Firecrawl (WebFetch is blocked with HTTP 403 by Devpost):

- Rules: https://dakar-bitcoin-hack-2026.devpost.com/rules (`R`)
- Dates: https://dakar-bitcoin-hack-2026.devpost.com/details/dates (`D`)
- Overview: https://dakar-bitcoin-hack-2026.devpost.com/ (`O`)
- Resources: https://dakar-bitcoin-hack-2026.devpost.com/resources (`Res`); Updates page (`U`) had no announcements.

Owner: registration ID **3424410**, working **solo**, **not yet submitted**. I could not verify the registration ID or submission status (needs Devpost login; "My projects" link is behind sign-in).

## 0. Read this first

1. **The Rules tab (`R`) is a short summary, not legal Official Rules.** It has no clauses on IP, AI use, pre-existing work, teams, language or disqualification. The Overview (`O`) contradicts it on several points (below). **Ask the organisers (contact@dakarbitcoindays.com) before relying on either.**
2. **Deadline: Fri 2026-11-20, 3:00 PM EST = 20:00 UTC = 21:00 WAT (Lagos, UTC+1) = 20:00 GMT in Dakar (UTC+0, no DST).** 11 days remain from 2026-11-09 (`O` says "11 more days to deadline"). EST on that date is UTC-5 (US daylight time ended before 2026-11-20).
3. **Eligibility conflict that could disqualify you:** `R` says participants "should reside in Africa"; `O` says "Students only", "Companies/professional organizations excluded", "Above legal age of majority", "All countries/territories, excluding standard exceptions". You must confirm that you qualify under the **stricter** reading (African resident + student?) before spending more time.
4. **Submission conflict:** `O` says "At least, a bitcoin/lightning wallet implementation". Orynt is not a wallet (brief: "does not custody funds"). `R` does not say this. Confirm with organisers whether a wallet is mandatory.

## 1. Dates (source `D`, timezone shown on page: EST)

| Period | Begins | Ends | UTC conversion |
|---|---|---|---|
| Submissions | October 26, 4:00AM EDT | **November 20, 3:00PM EST** | ends 2026-11-20 20:00 UTC |
| Public Voting | November 09, 4:00AM EST | November 24, 12:00PM EST | 09:00 UTC 2026-11-09 to 17:00 UTC 2026-11-24 |
| Judging | November 21, 4:00AM EST | November 26, 12:00PM EST | 09:00 UTC 2026-11-21 to 17:00 UTC 2026-11-26 |
| Winners Announced | | November 28, 12:00PM EST | 17:00 UTC 2026-11-28 |

Notes:
- `R` says only "From October 26th to November 20th 2026" (no time, no timezone). `D` and `O` give 3:00 PM EST.
- Public Voting started today, before the submission deadline. Whether public votes affect winner selection is **not stated** (`O`/`R` describe judges only).
- Devpost shows times in the viewer's preference timezone setting; the page was rendered as EST. Re-check the countdown while logged in.
- Practical buffer (my advice, not a rule): submit at least 24 h early, i.e. by 2026-11-19 20:00 UTC.

## 2. Who may enter

| Item | What the page says | Source | Status |
|---|---|---|---|
| Residency | "The participants should reside **in Africa**." | `R` | Conflicts with `O` ("All countries/territories, excluding standard exceptions") |
| Age | "Above legal age of majority in country of residence" | `O` | Stated |
| Students | "**Students only**" | `O` | Stated on `O` only; not on `R`. High risk if you are not a student |
| Companies | "Companies/professional organizations excluded from participation" | `O` | Stated. Submit as an individual; do not enter under a company name (INTERP) |
| Sanctions/"standard exceptions" | "excluding standard exceptions" | `O` | Undefined on the pages |
| Solo allowed? | **Not stated** on any retrieved page | | Ask. Devpost generally has team and individual flows but I could not retrieve rule text on it |
| Team size limit | Not stated | | |
| Participants registered | 203 (at retrieval) | `O` | info |

## 3. Required submission artifacts

| Artifact | `R` (Rules tab) | `O` (Overview) | Orynt implication |
|---|---|---|---|
| Presentation | "A presentation (text or video)" | "A brief presentation of the proposed solution (can be text or video)" | Both agree. Video length limit **not stated** |
| Public GitHub repo | "A **public github repo**" | Not listed under "What to Submit", but "results are open-source" | Repo must be public by deadline. Licence not specified |
| Working MVP | "A MVP accessible through internet (or a demo video)" | "A prototype, Minimum Viable Product (MVP) or Proof of Concept (Poc)" | A hosted URL is preferred; **demo video is accepted as an alternative** (`R`). Orynt is regtest-only, so a demo video of regtest is consistent with `R` |
| Wallet implementation | not mentioned | "**At least, a bitcoin/lightning wallet implementation**" | Unresolved conflict. Orynt wraps a wallet adapter (LND REST) but is not a wallet |
| 3-minute demo | not mentioned | Under criterion "Clear Pitch & Docs": "3-minute demo: problem → solution → impact → next steps" | Treat as a target, not a verified hard limit |
| README | not mentioned | "README with setup, architecture diagram, constraints, metrics to track, and what you'll ship in the next iteration" | Plan it as a required deliverable |
| One-command setup | not mentioned | "One-command setup (Docker or script), seed data, and a testable happy path. Avoid mockups when a minimal integration is possible." | Note EXECUTION-REGISTER: docker daemon not available locally; script path needed |
| Build in public | not mentioned | "to **build in public** and to **communicate** about your journey" | Stated as the only thing you "need to do"; no required platform/frequency stated |

## 4. Judging criteria and weights

**No weights, points or scoring rubric are stated on any retrieved page.**

`R`: "The judges will mainly focused on solutions that offers a MVP that can be tested and which gives a glimpse on its potential. Besides that, we will also judge the originality, the usefulness of the solution and the technicality." Then "We are looking for: Usefulness and social impact; Security by design; UX/UI quality; MVP; A clear pitch".

`O` criteria (verbatim headings and descriptions):

1. **Usefulness & Local Impact:** "Solve a real, well-scoped local problem. Identify your primary user, show how it changes their daily workflow, and estimate reach (e.g., merchants served per week)."
2. **Security by Design:** "Build with a minimal attack surface: threat model, least-privilege access, safe secret handling, validated inputs, no PII in logs. Prefer proven Bitcoin/Lightning libraries and secure defaults."
3. **UX/UI Quality:** "Fast, frictionless flows on low bandwidth and mid-range phones. Clear labels, helpful errors, accessible contrast/size, and simple copy free of jargon."
4. **Working MVP:** "End-to-end demo that actually runs. One-command setup (Docker or script), seed data, and a testable happy path. Avoid mockups when a minimal integration is possible."
5. **Clear Pitch & Docs:** "3-minute demo: problem → solution → impact → next steps. README with setup, architecture diagram, constraints, metrics to track, and what you'll ship in the next iteration."

Judges listed on `O`: Mouhamadou Kouta (Banxaas), Kelvin Isievwore (Head of Engineering, Btrust), Peter Tyonum (Btrust grantee), Yogen Ghodke (AI Solutions Engineer, Hexaware Technologies).

INTERP: Orynt's security-by-design and MVP fit the criteria well. Its weak points are criterion 1 (an African *local* problem and reach estimate: the brief names none) and criterion 3 (low-bandwidth, mid-range phones: the brief is operator-console oriented).

## 5. Prizes (quoted; the two pages disagree)

- `R`: "1st prize: **500.000 sats**; 2nd prize: **250.000 sats**; 3rd prize: **100.000 sats**".
- `O`: "$900 in cryptocurrency": "1st Place $500 of BTC (1 winner); 2nd Place $250 of BTC (1 winner); 3rd Place $150 of BTC (1 winner)".
- Not stated: payout method, timing, taxes, KYC, whether prizes are cumulative, whether non-African/non-student winners are paid.
- Sats vs USD denomination is unreconciled; do not quote either figure externally without organiser confirmation.

## 6. IP, open source, pre-existing work, AI, language, disqualification

| Topic | What is stated | Status |
|---|---|---|
| Open source | `O`: "For this event, organizers are volunteers and **results are open-source**." `R`: public GitHub repo required | Stated loosely. **Licence not specified.** Ask whether any OSI licence is acceptable and whether "results are open-source" obliges you to licence the *whole* project (INTERP: yes for what is in the repo) |
| IP ownership / licence grant to organisers | Not stated | Ask |
| Pre-existing work / start date of coding | Not stated. Submissions window opens Oct 26 | Ask whether code written before 2026-10-26 is allowed and must be disclosed. Check git history: the repo baseline commit is `6684fcb` (date not checked here) |
| AI-assisted code | **Not stated.** "Machine Learning/AI" is a listed theme and "Bitcoin & AI" is an example project type (`O`), so AI as a *topic* is welcome; AI as a *coding aid* is unaddressed | Ask; disclose in README regardless (advice) |
| Language of submission | Not stated; pages are in English | Use English; consider adding French summary (Dakar). Advice only |
| Disqualification conditions | **Not stated** on retrieved pages ("standard exceptions" undefined) | Ask |
| Mainnet/real funds | Not addressed | Orynt is regtest-only by design |
| Tools allowed | `Res` lists Bitcoin Core, BDK, BTCPayServer, Electrum, LDK, Fulcrum, Lightning Core, C-Lightning, USSD, LNURLPoS, mempool.space, Mobile Money APIs, Sparrow, Nostr, NWC, AI. LND is not listed. Judging text: "Prefer proven Bitcoin/Lightning libraries" and the overview says "Bitcoin FOSS and close source tools" are allowed | LND not prohibited per retrieved text |
| Contact | contact@dakarbitcoindays.com; Discord, Telegram, X (@dakarbtcdays) per `Res` | |

## 7. Checklist for the owner

### Eligibility (do before more build time)
- [ ] I reside in Africa (confirm country): _____
- [ ] I am of legal age in my country of residence
- [ ] I am a student (needed if "Students only" on `O` applies): yes / no / unclear
- [ ] I am entering as an individual, not as a company or professional organisation
- [ ] My country is not under the undefined "standard exceptions" (ask what they are)
- [ ] Organisers confirmed in writing that solo entry is allowed
- [ ] Organisers confirmed which eligibility text prevails (`R` vs `O`)
- [ ] Registration ID 3424410 visible under "My projects" when logged in

### Before deadline (2026-11-20 20:00 UTC)
- [ ] Project created on Devpost and **submitted**, not left as draft (confirm on gallery)
- [ ] Public GitHub repository, visible logged-out, contains the code
- [ ] Open-source licence file added (organiser confirmation of licence expectations)
- [ ] Presentation (text or video) attached
- [ ] MVP link reachable from the internet, **or** demo video attached (`R`)
- [ ] Demo video within 3 minutes (`O` target; no hard limit stated)
- [ ] README: setup, architecture diagram, constraints, metrics to track, next iteration
- [ ] One-command setup (Docker or script), seed data, testable happy path
- [ ] Threat model document, least-privilege, secret handling, input validation, no PII in logs
- [ ] UX checked on low bandwidth and a mid-range phone viewport
- [ ] Primary user and local-impact statement with reach estimate (no invented figures)
- [ ] Wallet requirement resolved with organisers (`O` "wallet implementation")
- [ ] AI-assistance disclosure included in README
- [ ] Honest limits stated (regtest only, not a custodian, tamper-evident log, app-level enforcement)
- [ ] Submitted at least 24 h early; screenshot of the submitted state saved

### Public voting (open now)
- [ ] Ask whether public voting influences prizes; if it does, plan an honest "build in public" post. No vote solicitation tactics are required by any retrieved rule

## 8. Rules ambiguities to confirm with organisers

Send to contact@dakarbitcoindays.com (and ask in Discord for a public answer):

1. Which text governs eligibility: "reside in Africa" (`R`) or "All countries/territories... Students only... Companies excluded" (`O`)? Is non-student entry allowed?
2. Is solo entry allowed? Maximum team size?
3. Is "at least a bitcoin/lightning wallet implementation" (`O`) mandatory? Is a payout-authorization layer in front of an LND wallet acceptable?
4. Prizes: 500k/250k/100k sats (`R`) or $500/$250/$150 in BTC (`O`)? Payment method and timing?
5. Do public votes (open 2026-11-09 to 2026-11-24) count toward winners, and what weight do judging criteria carry?
6. Exact deadline moment and timezone: 3:00 PM EST 2026-11-20 = 20:00 UTC? Is a late edit after submission allowed?
7. Is a demo video acceptable instead of a hosted MVP, and is there a maximum length?
8. Required licence for the public repo? Who owns the IP? Does "results are open-source" bind the team?
9. Is pre-existing code (started before 2026-10-26) allowed? What must be disclosed?
10. Is AI-assisted coding permitted, and must it be disclosed?
11. Language requirements for the presentation/README?
12. Disqualification grounds and the meaning of "standard exceptions"?
13. Are projects that run only on Bitcoin regtest (no mainnet) acceptable as an "MVP"?
