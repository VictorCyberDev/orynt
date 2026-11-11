# Billing provider evaluation (solo founder in Nigeria, USD subscriptions)

Status: DRAFT v0.1, 2026-11-10. **This is a desk evaluation, not advice and not a decision.** It is based on public vendor pages and docs read on 2026-11-10. No account was created and no provider, bank or regulator was contacted. Nothing here says a provider will accept Orynt; acceptance is decided by each provider's own review.

How to read evidence labels:

- `[Sn]` = a source in section 10 (URL plus retrieval date). A vendor page is the vendor's claim, not a guarantee.
- **(secondary)** = third-party blog, news or search-result summary. Treat as a lead, not a fact.
- **NOT VERIFIED** = I could not confirm it from a primary page in this session. Do not rely on it.
- **(inference)** = my reasoning from the sources, not stated by any of them.

Scope notes and honest limits:

- Prices assumed by the request: $29 / $99 / $299 per month. These are **not** in [`pricing-hypotheses.md`](pricing-hypotheses.md), whose test cells are P1 $50-150, P2 $300-800, P3 $20-60 per approver seat. $29 is outside every cell and $299 sits just under P2. Treat the three prices as the request's working numbers, not as repo-approved pricing.
- Per the repo's own guardrails, nothing may be shown as pricing publicly until counsel has reviewed it and an entity exists to bill from ([`pricing-hypotheses.md`](pricing-hypotheses.md) header; [`legal-regulatory-register.md`](legal-regulatory-register.md) X5, X8 are NOT STARTED). This evaluation does not lift that guardrail. `billing.ts` should stay on the `sandbox` provider until it is lifted.
- Some pages were summarised by a fetch tool rather than read verbatim; a few (Paystack docs) blocked plain fetching and were read through a scraper. Firecrawl credits ran out partway, so a few checks (Paddle webhook retries, Polar checkout API fields, BTCPay webhook signing) are NOT VERIFIED.
- Fees, country lists and policies change. Re-check each before acting.

## 1. Summary

| | |
|---|---|
| Recommended primary | **Polar** (merchant of record), **conditional** on written answers to the gating questions in section 5.1. It is the only MoR I found that explicitly lists Nigeria for payouts [S38] and lets a solo founder start without a company-formation project. |
| Recommended fallback | **Stripe direct through a Delaware entity formed with Stripe Atlas** (you become the seller and carry tax). Alternate MoR if only Polar-specific problems appear: **Paddle** (Nigeria is not on its unsupported list [S32]; pays by USD wire [S35]). |
| Not recommended now | Paystack or Flutterwave as the **primary** rail (crypto-adjacent ineligibility, NGN-by-default settlement, weak subscription dunning); Lemon Squeezy for a new build (Stripe-owned, in transition, and Stripe's own MoR product excludes Nigeria [S17]); Chargebee/Recurly (a billing layer still needs a gateway, so it solves nothing for eligibility). |
| Bitcoin-native (BTCPay Server, Zaprite) | **Defer.** Accepting Bitcoin for fees is a separate regulatory and tax question (section 8). |
| Biggest unknowns | (1) Whether any card/MoR provider treats Orynt (Bitcoin payout-approval software) as a restricted "crypto" or "financial services" product. (2) Whether Nigerian payout through Stripe-powered rails works end to end, and in which currency (NGN vs USD). (3) Whether a Nigeria-resident founder passes Atlas and Stripe verification. (4) Nigerian tax and CBN treatment of the receipts. |
| `billing.ts` | Several webhook mappings are wrong or stale against current provider docs (section 6.1). They should be fixed before any live use, whichever provider is chosen. |

## 2. Comparison table

All fee arithmetic is mine, on published rates. It excludes payout fees, FX spread, taxes on fees and disputes. International = non-US card.

| Provider | Eligibility for a Nigerian seller | International cards in USD | Recurring subs + customer portal | Webhooks: reliability / signature | Tax / VAT: who is merchant of record | Fees (as published) | Payout / settlement to a Nigerian bank | Sandbox / test | Main risks | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **Stripe direct (via Atlas US entity)** | Stripe's availability page lists Nigeria only as "Extended network", linking to Paystack rather than to Stripe sign-up [S1][S2]. Docs say NUBAN bank payouts to Nigeria are only for Connect cross-border-payout accounts [S3]. Opening an account needs a legal entity, tax ID, local bank account in the account's country [S5]. Atlas: Delaware C-corp/LLC "from almost anywhere" [S6]; Nigeria eligibility **NOT VERIFIED** (not stated [S6][S7]). | Yes (US account). | Stripe Billing + Customer Portal [S16]. | `Stripe-Signature: t=..,v1=..` HMAC-SHA256 over `t.rawBody`, 5 min tolerance, may carry several `v1` during secret roll; live retries up to 3 days with exponential backoff, sandbox 3 retries; no ordering guarantee [S13]. | **You** are merchant and carry sales tax/VAT. Stripe Tax optional: 0.5% (no-code) or $0.50 per txn (API) where registered [S11]. Stripe Managed Payments (MoR) is not offered to Nigerian businesses [S17]; an Atlas US entity might qualify, unverified (inference). | 2.9% + 30c; +1.5% international; +1% if conversion; Billing 0.7%; dispute $15 [S11]. Atlas $500, then $100/yr [S6]; Delaware LLC tax $300/yr, C-corp franchise tax varies [S8]. | Funds land in the **US entity's USD account**; getting them to Nigeria is a separate bank/wire step (inference; fee and FX **NOT VERIFIED**). | Yes, sandbox [S13]. | Restricted list includes crypto "exchanges and wallets" and money transmitters (contact sales) [S12]; Orynt's classification unknown. Atlas does not guarantee payments approval [S7]. US entity tax and filing burden [S8]. Founder KYC outcome unknown. | **Fallback (heavy)** |
| **Paystack** (Stripe subsidiary [S2]) | Native Nigerian merchant. International payments need a request, compliance docs for your business type, and approval in ~48 working hours [S19]. **Ineligible for international payments: "Cryptocurrency businesses" and "Investment and other financial service businesses"**; extra scrutiny for web design/development and digital products [S20]. Nigeria-specific unsupported: cryptocurrency trading, forex, IMTOs [S21]. | Yes, Visa/Mastercard/Verve; USD charging available to Nigeria and Kenya merchants, $2.00 minimum (secondary snippet of docs [S24]). | Plans + subscriptions API; hosted subscription manage link/email [S23]. "Subscriptions aren't retried" if a charge fails [S23] (page also says it re-attempts on next payment date; contradictory). | New: `Paystack-Signature: t=..,v1=<kid>:<hex>`, HMAC-SHA512 over `t.rawBody`, secret `whsec_`, 300 s tolerance, rotation overlap 1 h to 7 d. Legacy `x-paystack-signature` = HMAC-SHA512(secret key, rawBody), no timestamp, sent only while a secret key exists. Live retries every 3 min x4 then hourly for 72 h; test mode hourly for 10 h; 3 IPs published; resend API is not idempotent [S22]. | **You.** No MoR. Paystack fees may attract VAT (**NOT VERIFIED** for Paystack). | International cards: 3.9% + NGN 100 (NGN) or 3.9% (USD); AmEx NGN 4.5% [S18][S19]. | Default: international cards charged and settled in **NGN**. USD payout only to a **Zenith Bank USD domiciliary account** (Nigeria and Kenya only) [S19]; pricing page calls USD settlement a "public pilot" [S18]. | Test mode; webhooks work in test with hourly retries [S22]. | Crypto-adjacent ineligibility (above); USD requires one named bank; dunning is weak; NGN conversion occurs before you see the money. | **Optional local-methods rail only** |
| **Flutterwave** | Nigerian merchant account. Eligibility for a crypto-adjacent product **NOT VERIFIED**. | Yes; international cards "charged and settled in your local currency by default" [S25]. | Payment plans: "Flutterwave will manage future billing cycles and offer options to cancel or reactivate" (search snippet [S28]). Hosted portal **NOT VERIFIED**. | `verif-hash` header = the static secret hash you set (not an HMAC of the body); retries 3x at 30-minute intervals; 60 s timeout; docs say to re-query the transaction API before granting value [S27]. | **You.** Fees carry 7.5% VAT [S25]. | Local 2.0%; **international 4.8%** [S25]. | Nigerian merchants: Naira-card transactions settle in NGN "in line with the dollarisation policy"; other currencies can settle to a payout balance or a bank account in that currency on request, 1-5 business days [S26]. | Test mode **NOT VERIFIED** here. | Static-secret webhook auth; highest international fee of the card options; same crypto-adjacent review risk. | **Not recommended** |
| **Polar** (MoR) | Nigeria is in the listed payout countries (via Stripe Connect Express); sanctioned-country buyers excluded [S38]. Individual or business can onboard; the person who completes onboarding is the legal recipient [S43]. **Caveat:** Stripe's own pages are inconsistent about Nigeria (section 4.1), so confirm end to end. | Yes. Polar charges customers as MoR; "Stripe Payments doesn't need to be available in your country" [S38]. | Subscriptions; hosted customer portal (view, cancel, update payment method, invoices) [S45]. | Standard Webhooks headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; secrets generated on/after 2026-09-08 are Standard Webhooks, older secrets use Polar HMAC; up to 10 retries with exponential backoff; 10 s timeout; **endpoint auto-disabled after 10 consecutive failures** [S41]. | **Polar is merchant of record**; uses Stripe Tax; remits internationally. Seller still owes own income tax in country of residence [S44]. | Starter **5% + 50c**; +1.5% international (non-US) cards; Pro $20/mo = 3.8% + 40c; Growth $100/mo = 3.6% + 35c; disputes $15 each [S39]. Payout: Stripe fees pass-through ($2/mo active payout; 0.25% + $0.25 per payout; cross-border conversion 0.25% EU to 1% elsewhere) [S39]. | Payout account must be a bank account **in your country in the local currency** (Wise/Payoneer multi-currency "generally don't qualify") [S43], i.e. NGN (inference); FX rate and spread **NOT VERIFIED**. | Separate sandbox: `sandbox-api.polar.sh`, Stripe test cards [S46]. | **Acceptable Use Policy lists "Trading and Financial Services ... (a) services facilitating transactions ... (d) NFTs and Crypto assets" as prohibited** [S40]; Orynt could be read either way. Account can be suspended if dispute rate nears card-network thresholds (~0.7%+) [S39]. Younger platform. | **Primary (conditional)** |
| **Paddle** (MoR) | Unsupported-country list does **not** include Nigeria (Cuba, Iran, Russia, Syria, etc. do) [S32]. Seller acceptance in practice **NOT VERIFIED**; Paddle runs periodic seller reviews. | Yes, MoR checkout. | Paddle Billing subscriptions (`subscription.created/activated/updated/canceled/past_due/paused/resumed/trialing`) [S37]. Customer portal **NOT VERIFIED** here. | `Paddle-Signature: ts=..;h1=..`, HMAC-SHA256 over `ts:rawBody`, several `h1` possible during rotation; SDK tolerance default 5 s [S36]. Retry schedule **NOT VERIFIED**. | **Paddle is merchant of record**; collects, files and remits tax [S33]. | **5% + 50c** per checkout transaction, all-inclusive, no monthly fee [S33]. No separate international surcharge appears on the page (**NOT VERIFIED** beyond that). | Monthly: balance converts to a payout on the 1st above a threshold you set (min $100), paid by the 15th, by **wire or Payoneer**. USD to a non-US bank is SWIFT: $15 fee in some cases plus bank fees. A different payout currency may add up to 1.5% conversion margin [S35]. | Webhook simulator confirmed [S37]; separate sandbox **NOT VERIFIED** here. | **AUP excludes** payment services/money transmitters/MoR, "regulated financial product or service in any jurisdiction", exchanges/trading platforms "enabling transactions in ... cryptocurrencies" [S34]. Monthly payouts, $100 minimum. | **Alternate MoR** |
| **Lemon Squeezy** (MoR, Stripe-owned) | Nigeria is in the bank-payout country list [S29]. | Yes. | Subscriptions + customer portal (site navigation) ; details **NOT VERIFIED**. | `X-Signature` = HMAC hex digest of the payload with the signing secret [S31]. Retries **NOT VERIFIED**. | MoR. | 5% + 50c; +0.5% subscriptions; +1.5% international; +1.5% PayPal (secondary [S30]; the official pricing page extract was garbled). | Bank or PayPal payouts; non-US bank payout fee ~1% (secondary [S30]). | **NOT VERIFIED** | Stripe acquired it 2024-07-26; Jan 2026 update says the team is building Stripe Managed Payments and an "easy migration path" (secondary [S30]); Managed Payments excludes Nigerian business locations [S17], so a forced migration could strand a Nigerian seller (inference). Slower support (secondary). | **Avoid for new build** |
| **Chargebee / Recurly** (billing layers) | They are not processors; you still need an eligible gateway. Support for Paystack/Flutterwave **NOT VERIFIED**. | n/a | Yes (full billing engines). | Not evaluated. | You (unless paired with an MoR). | Chargebee reportedly ~$599/mo on annual contract on one plan, with reports of a plan change in Aug 2026; Recurly reportedly from ~$249/mo plus ~0.9% of volume. Third-party sites disagree (secondary [S47]). | n/a | n/a | Cost and complexity far exceed a three-plan solo SaaS; adds nothing to Nigerian eligibility. | **No** |
| **BTCPay Server** (self-hosted) | No account or approval needed; you run the server. | n/a (Bitcoin only). | Native subscriptions since v2.3 (announced Dec 2025, secondary [S48]): offerings/plans, two modes: customer pays each period after a reminder, or prepaid credit that renewals draw down; public customer management page; Greenfield API. Features are stored but not enforced by BTCPay [S48]. | Subscription webhook events and signing scheme **NOT VERIFIED** (docs page read does not cover them). | **You.** Tax/regulatory treatment is a separate question (section 8). | No platform fee (you pay for hosting and operations). | Bitcoin to your own wallet; converting to NGN is outside BTCPay. | Self-host test setup **NOT VERIFIED** here. | Bitcoin has no card-style auto-charge, so churn on manual renewals; optimistic on-chain activation can later need manual deactivation [S48]; operations burden; regulatory/tax. | **Defer** |
| **Zaprite** (hosted Bitcoin invoicing) | Hosted account; eligibility rules **NOT VERIFIED**. | Fiat card acceptance **NOT VERIFIED**. | Recurring invoices (launched Aug 2024) (secondary [S49]). | **NOT VERIFIED** | You. | Account fee quoted at $20-25/mo (sources conflict); no transaction fee on invoices and recurring invoices; fees on some Bitcoin products (API/WooCommerce 1%, capped $15); plans to surcharge fiat-paid plan fees (secondary [S49]). | **NOT VERIFIED** (where funds settle) | **NOT VERIFIED** | Same regulatory/tax question as BTCPay; vendor-held funds model unverified. | **Defer** |

Polar note: a legacy "Early Member" rate (4% + 40c, +0.5% on subscriptions) exists only for organizations that signed up under it; organizations created on or after 2026-05-27 start on Starter (5% + 50c) [S39].

### 2.1 Fee arithmetic on the three plan prices (international card, one charge per month)

| Route | $29 | $99 | $299 | Notes |
|---|---|---|---|---|
| Polar Starter (5% + 50c, +1.5% intl) | $2.39 (8.2%) | $6.94 (7.0%) | $19.94 (6.7%) | Plus payout fees ($2/mo active payout, 0.25% + $0.25 per payout) and FX [S39] |
| Polar Pro (3.8% + 40c, +1.5% intl) | $1.94 | $5.65 | $16.25 | Plus $20/mo fixed; published break-even vs Starter ~$1,379/mo sales [S39] |
| Paddle (5% + 50c) | $1.95 (6.7%) | $5.45 (5.5%) | $15.45 (5.2%) | No intl surcharge shown [S33]; plus wire and FX |
| Stripe direct (2.9% + 30c, +1.5% intl, Billing 0.7%) | $1.78 (6.1%) | $5.35 (5.4%) | $15.55 (5.2%) | Add Stripe Tax 0.5%: +$0.15 / +$0.50 / +$1.50; excludes the cost of being the seller of record [S11] |
| Paystack USD intl (3.9%) | $1.13 | $3.86 | $11.66 | Needs Zenith USD account for USD payout [S18][S19] |
| Flutterwave intl (4.8%) | $1.39 | $4.75 | $14.35 | Fees carry 7.5% VAT; NGN settlement by default [S25][S26] |

Implication for the repo's cost model: [`pricing-hypotheses.md`](pricing-hypotheses.md) assumes billing fees B of 3-5% of revenue. A merchant-of-record route lands at roughly 5-8% on these prices. At B = 8% the base-case break-even rises from about $281 to about $293 per month (270 / 0.92); at B = 6% about $287. That does not change the document's existing finding (only the $299 tier approaches base-case cost to serve) but B's range should be updated once a provider is chosen.

## 3. Why the Stripe, Paystack and MoR answers are less simple than they look

### 3.1 Stripe and Nigeria

- Stripe's availability page lists Nigeria as "Extended network" and links it to Paystack's page "Does Stripe operate in Nigeria?" [S1][S2]. That page says Paystack is "a Stripe subsidiary" and that many African businesses use "Paystack for local payments within Africa, and use Stripe for international payments", which "requires registering a business in the US" and names Stripe Atlas [S2]. So Stripe's own routing for a Nigerian merchant is Paystack, or a US entity.
- A Stripe account in another country needs a legal entity, tax ID, physical location, phone, ID and a **physical bank account in that country** [S5]. For an Atlas company that means a US bank/Treasury account.
- Atlas does not publish an eligible-country list; it says apply "from almost anywhere" and that Atlas cannot guarantee Payments approval, and it will refund the fee "if we're unable to support your business" [S6][S7]. Whether a Nigeria-resident founder passes Stripe Payments verification and Treasury eligibility is **NOT VERIFIED**. US bank eligibility "varies by provider ... founder location" [S10].
- Stripe documents are not consistent about Nigerian recipients: the payouts page lists a Nigerian NUBAN account format but says it is "only available for Connect cross-border payouts" [S3]; the cross-border payouts page says self-serve cross-border payouts are for platforms and recipients in US/UK/EEA/Canada/Switzerland [S4]; Nigeria is absent from the Global Payouts recipient table I read (US sender) [S3b]. Polar nonetheless lists Nigeria [S38]. This is the single most important thing to confirm before building on Polar (section 5.1, question 3).

### 3.2 Paystack as a rail

- Paystack is the natural Nigerian rail and has a subscriptions API, but for **international** cards it lists "Cryptocurrency businesses" and "Investment and other financial service businesses" as ineligible [S20] and, for Nigeria, "Cryptocurrency trading" as unsupported [S21]. Orynt is software for authorising Bitcoin payouts, not a trading or custody business, but a reviewer may not see that distinction. Ask in writing.
- USD charge and USD payout exist for Nigerian merchants only through a Zenith Bank USD domiciliary account [S19]. Without it you are charged and settled in NGN. Flutterwave states the same "dollarisation" rule for Naira cards [S26].
- Paystack does not retry failed subscription charges [S23], which matters for B2B SaaS where cards expire. Stripe Billing offers Smart Retries and revenue-recovery settings [S16].

### 3.3 Merchant-of-record trade-offs

- A MoR sells to your customers in its own name, so you do not register for VAT/sales tax abroad. You still owe income tax in Nigeria [S44].
- The cost is the higher fee (5-8%) and the provider's Acceptable Use Policy. Polar and Paddle both exclude or restrict crypto assets, trading/financial services, or payment services [S34][S40]; Stripe's restricted list does so for crypto exchanges/wallets and money transmitters [S12]. Orynt's non-custodial claim is, per [`legal-regulatory-register.md`](legal-regulatory-register.md) X1/X2, still an untested hypothesis. A provider asking "do you move money?" will get an answer that counsel has not reviewed. Resolve the wording for the support request with counsel or at least keep it factual (see 5.1).

## 4. Candid recency notes

- Everything above was read on 2026-11-10; some scraper results were served from cache dated 2026-11-08 to 2026-11-10 (listed in section 10). Provider pages change without notice.
- Polar's fee page says paid tiers were introduced as the platform "was catching up on feature parity with other Merchant of Record providers" [S39]. Treat Polar as a younger platform than Paddle or Stripe (inference from that wording).
- Lemon Squeezy is in transition inside Stripe (secondary [S30]). A new build on it has a roadmap risk.
- Chargebee pricing reportedly changed in August 2026 (single secondary source [S47]).

## 5. Recommendation and exact owner next steps

Recommendation order: **Polar (primary, conditional) -> Stripe via Atlas (fallback) -> Paddle (alternate MoR)**. Bitcoin-native fee collection is deferred (section 8). Do none of this live until the entity/counsel/pricing guardrails above are cleared; sandbox work is fine now.

Decision logic (inference): if Polar declines on AUP grounds, Paddle's AUP is at least as restrictive [S34], so move to Stripe direct, whose restricted list targets crypto "exchanges and wallets" and money transmitters rather than software generally [S12]; this is more likely to fit but is not guaranteed. If Polar's problem is only Nigerian payout mechanics (for example NGN-only payout at a poor rate), Paddle's USD wire to a Nigerian USD domiciliary account may fit better [S35].

### 5.1 Primary: Polar - steps for the owner

The owner performs these; I created no account.

1. **Pre-flight, no account yet.** Decide who the contracting party will be: you as an individual, or a registered business. Polar says the person who completes onboarding is the legal recipient [S43]; the repo's entity decision is open ([`legal-regulatory-register.md`](legal-regulatory-register.md) X5). Ask your Nigerian accountant how foreign-currency receipts to an individual versus a registered business are treated (section 7).
2. **Write to Polar support before building** (Support link in the docs, `polar.sh/docs/support`; do not rely on chat only, keep the thread). Ask:
   1. "Orynt is self-hostable software that lets organisations require human approvals before Bitcoin payouts; Orynt does not hold customer funds or keys [confirm the exact wording with counsel before sending]. Does this fall under your Acceptable Use Policy 'Trading and Financial Services ... services facilitating transactions ... NFTs and Crypto assets'? Please confirm in writing whether you will accept this product."
   2. Is a Nigerian individual (or a Nigerian registered business, state which) able to complete Stripe Connect Express onboarding today? Which documents does Stripe request?
   3. In which currency is the payout made to a Nigerian bank account (NGN or USD), who sets the exchange rate, what is the spread, and what are the payout schedule and minimum? Is a USD domiciliary account accepted? (Your docs say multi-currency accounts such as Wise or Payoneer generally do not qualify [S43].)
   4. Do you collect and remit VAT/sales tax on B2B sales to EU, UK and other countries, and do you validate buyer VAT IDs? What documents do I get for my own books?
   5. What dispute rate triggers a review or suspension, and how are refunds within 60 days handled [S39]?
   6. Is the +1.5% international-card fee applied to EU/UK cards?
   7. Webhook semantics: which events indicate access should end (`subscription.revoked` versus `subscription.canceled`) [S42]?
3. **Only if the answers are acceptable:** create a Polar **sandbox** account and organisation (separate server and token [S46]), create three monthly subscription products ($29, $99, $299 USD), register a webhook endpoint and keep the secret in your secrets store.
4. Connect the payout account (Stripe Connect Express): identity details and business details if applicable; a Nigerian bank account in the local currency [S43]. Documents likely requested: government-issued ID, proof of address, bank account details. **NOT VERIFIED:** whether BVN/NIN or CAC registration documents are requested for Nigerian individuals; do not assume.
5. Run the sandbox end to end (Stripe test card 4242 4242 4242 4242 [S46]) against the updated `billing.ts` (section 6).
6. Go live with one small real purchase by yourself on the lowest plan, refund it, and record: time to payout, currency received, the rate, all fees. That measured result replaces the unverified items in the table.

### 5.2 Fallback: Stripe direct through Atlas - steps for the owner

1. Before paying: contact Stripe support/sales and ask (a) whether a Nigeria-resident founder can complete Atlas and activate Stripe Payments and Treasury, (b) whether software for authorising Bitcoin payouts is acceptable under the restricted-business list [S12], (c) whether payouts can go from the US entity's account to a Nigerian bank and at what cost. Atlas refunds its fee "if we're unable to support your business" [S7] but plan around the non-refundable parts.
2. Documents likely: government ID (any country accepted for ID on the account page [S5]), company address (home or a partner virtual address is allowed [S7]), a US-format phone number (a personal number or partner virtual number is allowed [S7]), founder details; the Atlas form asks for an SSN or ITIN, and without an SSN the EIN takes 5-35 business days [S7].
3. Budget: $500 Atlas, then $100/yr registered agent [S6]; Delaware annual tax (LLC $300; C-corp franchise tax varies) [S8]; a US-experienced accountant. Stripe's own tax page lists US federal/state income tax, Delaware tax and "transfer pricing (if you're based outside the US)" among obligations [S8]. I did not verify specific IRS forms for a foreign-owned entity; ask the accountant.
4. If you proceed, collect sales tax/VAT yourself (Stripe Tax is available at 0.5%/$0.50 per transaction where you are registered [S11]) or check whether the US entity would be eligible for Stripe Managed Payments (+3.5% per transaction, secondary [S30]; eligibility is reviewed case by case [S17]).

### 5.3 Alternate MoR: Paddle - what to ask

Written questions to Paddle: (1) Is a Nigeria-based seller (individual or business) accepted; what verification is required? (2) Does Orynt fall within the AUP lines on payment services, regulated financial products, or crypto-transaction enabling [S34]? (3) Can payouts be made in USD by SWIFT to a Nigerian USD domiciliary account; which fees apply [S35]? (4) Webhook retry schedule and sandbox availability (both **NOT VERIFIED** here).

### 5.4 Optional later: Paystack for African customers

Only add it if real African customers ask for local methods. Ask Paystack in writing: is Orynt a "Cryptocurrency business" or "Investment and other financial service business" for international payments [S20][S21]; do USD plans work with `plan` on transaction initialize (see 6.2); is a failed subscription charge retried [S23]. A second provider requires `billing.ts` and the `subscriptions` model to cope with one org having a different provider than another org (it already stores `provider` per subscription).

## 6. Code changes needed in `apps/api/src/services/billing.ts`

Method: I compared the existing mapping to each provider's current documentation. Line numbers refer to the file as read on 2026-11-10. Items marked "(inference)" depend on payload fields I could not see in a live payload; the file's own header says its mappings are "UNVERIFIED against live providers", and that remains true. Add recorded sandbox payloads as test fixtures for each provider.

### 6.1 Defects in the existing mappings

**Stripe (`parseStripe`, lines 19-35)**

1. **`current_period_end` moved (line 29).** From API version `2025-03-31.basil`, `current_period_start`/`current_period_end` are removed from the Subscription and exist on each subscription item: read `o.items.data[0].current_period_end` [S14]. On a current account `o.current_period_end` is `undefined`, so `periodEnd` is `undefined` and `COALESCE($4, current_period_end)` never updates the period. Which shape arrives depends on the webhook endpoint's API version, which is fixed per event [S13]. Support both shapes.
2. **`invoice.subscription` removed (lines 31-32).** From the same version, use `invoice.parent.subscription_details.subscription` after checking `invoice.parent.type === "subscription_details"` [S15]. On a current API version `o.subscription` is `undefined` for `invoice.payment_failed` and `invoice.paid`, so `subscriptionId` is missing, the row cannot be found (`orgId` is also absent), and `applyBillingEvent` returns `"ignored"` (line 73). **Payment failures and renewals would be silently ignored.** Same for `invoice.lines.data[0].period.end` (line 32): the changelog I read did not say `lines.data[].period` was removed, so re-check it against a current-version payload.
3. **Multiple `v1` signatures (line 21).** `Object.fromEntries` keeps the last `v1` only. During a secret roll Stripe sends one signature per active secret [S13]; verify against **every** `v1` and ignore all non-`v1` schemes (the docs say to ignore `v0`).
4. **Ordering by `created` (lines 25, 74).** Stripe says event order is not guaranteed and "Don't use `created` to determine event order"; use event IDs for dedupe and re-fetch the object from the API for truth [S13]. Line 74 drops any event with an older `created` as `"stale"`, which can discard legitimate out-of-order events. Better: on each event, fetch the subscription/invoice from the Stripe API and derive state from it.
5. **Events can be swallowed forever (lines 66-73).** The `billing_events` row is inserted first, then an unlinkable event is marked `"ignored"`. Because Stripe sees a 200, it will not retry, and a later redelivery by event ID would be a `"duplicate"`. Example: `invoice.paid` arriving before `checkout.session.completed` has stored `provider_subscription_id`. Fix: for unlinkable events, either return non-2xx so the provider retries, or store them as `pending` and re-process after linking, and add a lookup by `provider_customer_id`.
6. **Status changes not handled (line 29).** `customer.subscription.updated` ignores `status`. The Stripe docs say to revoke access when status becomes `canceled` or `unpaid`, to notify on `past_due`, and to confirm the subscription is `active` after `invoice.paid` before extending access [S16]. Map `status`: `past_due` -> `payment_failed`, `unpaid`/`canceled`/`incomplete_expired` -> `canceled`.
7. **Plan identity from metadata only (lines 28-29).** A plan change made in the Customer Portal will not change `metadata.plan_id`. Map the subscription item's price ID to a plan using the `ORYNT_STRIPE_PRICE_*` variables instead.
8. **Missing events:** `charge.dispute.created`, `charge.refunded`, `radar.early_fraud_warning.created` [S16]. At minimum record them and email the founder.
9. **`checkout.session.completed` (line 28):** no check of `payment_status`/`mode`. Low risk for cards; add anyway.
10. **No API version pin in `startCheckout`/`cancelSubscription` (lines 110, 133).** Send a `Stripe-Version` header and set the same version on the webhook endpoint, so payload shapes are known.
11. **No customer portal.** Add `POST /v1/billing_portal/sessions` for plan change and card updates (endpoint name from Stripe's public API; not re-fetched this session).

**Paystack (`parsePaystack`, lines 36-48)**

1. **Signature (line 38).** Only the legacy `x-paystack-signature` is checked. Paystack now documents `Paystack-Signature: t=<unix>,v1=<kid>:<hex>`, HMAC-SHA512 of `t + "." + rawBody` using the `whsec_` secret, with a 300 s tolerance, and says the legacy header is sent only while a secret key exists and stops if the key is deleted [S22]. The legacy scheme has no timestamp (no replay protection). Verify the new header first; keep legacy as a transition. Note that the legacy secret is the API secret key, so `billingWebhookSecret` and `billingApiKey` would be the same credential (the code uses one shared `billingWebhookSecret` for all providers, line 55; give each provider its own secret).
2. **`charge.success` uses the transaction reference as the subscription ID (line 42).** `reference` identifies a transaction, not a subscription; subscription codes (`SUB_...`) come from `subscription.create` [S23]. Every renewal is a new `charge.success` with a new reference, and `COALESCE($5, provider_subscription_id)` (line 80) would overwrite the stored ID each cycle, so later `subscription.disable` and `invoice.payment_failed` lookups by `subscription_code` fail and are ignored. Fix: do not set `subscriptionId` from `reference`; treat repeat `charge.success` as `payment_succeeded`; let `subscription.create` supply the code.
3. **`subscription.create` cannot be linked (line 43).** The documented `subscription.create` payload is a subscription object with customer and plan fields; it shows no `metadata` [S23] (inference: transaction metadata is not echoed). `meta.org_id` is therefore undefined and the code stored the transaction reference, not the subscription code, so no row matches. Fix: add a lookup by `provider_customer_id` (set at activation from `charge.success`'s `customer.customer_code`) and store `subscription_code` and `email_token` from `subscription.create`.
4. **Dedupe key collapses (line 40).** The documented payloads have an `event` and `data` but no top-level event `id` [S22][S23]. The fallback is `${e.event}:${d.id ?? d.subscription_code ?? d.reference}`. For `invoice.payment_failed` and `invoice.create/update`, none of `d.id`, `d.subscription_code`, `d.reference` is present in the documented invoice payload (it has `invoice_code`, and `subscription.subscription_code` nested) [S23], so the key is `invoice.payment_failed:undefined` for every failure. `ON CONFLICT DO NOTHING` (line 66) then treats the second and later payment failures as **duplicates**. Use `invoice_code` for invoice events, or hash the raw body (Paystack retries resend the same body; resends are explicitly not idempotent [S22]).
5. **`subscription.not_renew` treated as cancellation (line 44).** Per Paystack, `not_renew` means the subscription stays active but will not be charged on the next payment date; `subscription.disable` is sent on that date [S23]. Mapping both to `"canceled"` cuts off access immediately for a period the customer has paid for. Map `not_renew` -> `"updated"` with `cancelAtPeriodEnd = true` and the period end from the subscription's `next_payment_date`; map `disable` -> `"canceled"`.
6. **`occurredAt` (line 40).** `d.paid_at ?? d.createdAt ?? now`. For subscription events `createdAt` is likely the subscription's creation time (as in the documented `subscription.create` sample; inference for `disable`/`not_renew`), which is older than `last_event_at`, so a cancellation would be dropped as `"stale"` (line 74). Use receipt time, or avoid timestamp ordering (see Stripe item 4).
7. **Missing events:** `invoice.update` (docs: "usually means we were able to charge the customer successfully"), `invoice.create` (sent 3 days before the charge: useful for a payment-due notice), `subscription.expiring_cards`, `charge.dispute.create/remind/resolve`, `refund.*` [S22][S23].
8. **`startCheckout` Paystack branch (lines 114-117).** The documented request includes `amount` alongside `plan` ("will override the transaction amount") [S23]; the code sends none (whether `amount` is mandatory is **NOT VERIFIED**; docs fetch was blocked). For USD, plans must be created with `currency: "USD"` and amounts in cents (2900, 9900, 29900); the transaction currency defaults to the integration currency (NGN) [S24]. Pass `currency: "USD"` and confirm in the test dashboard that the plan's currency governs.
9. **In-app cancellation (line 135) returns 501.** Paystack documents a hosted manage-subscription link (`GET /subscription/:code/manage/link`) and a manage email endpoint [S23]; use these for the customer portal. An API disable call exists in Paystack's API (needs the subscription `code` and its `email_token`); its exact shape is **NOT VERIFIED** here, so confirm against the Subscription API page before use.
10. **Optional hardening:** Paystack publishes three source IPs [S22]; allow-listing is optional.

**Sandbox provider and shared logic**

- `parseSandbox` reuses Stripe parsing, so fixing Stripe items 1-2 also changes sandbox payloads; keep sandbox fixtures in both shapes.
- Line 55: one `billingWebhookSecret` for every provider cannot work once a primary and fallback both run. Use per-provider secrets (e.g. `ORYNT_STRIPE_WEBHOOK_SECRET`, `ORYNT_POLAR_WEBHOOK_SECRET`).
- Ensure the route passes the **raw** body bytes to every parser (Stripe, Paystack and Paddle all sign raw bytes) [S13][S22][S36].
- Add a provider-agnostic "refetch state from provider API" reconcile job, so a lost or reordered webhook cannot leave an org on the wrong plan. Flutterwave's docs also tell integrators to re-query the transaction API rather than trust the webhook alone [S27].

### 6.2 Changes for the recommended provider (Polar)

New `parsePolar(raw, headers, secret)`:

- **Verification:** headers `webhook-id`, `webhook-timestamp`, `webhook-signature` [S41]. Secrets generated on/after 2026-09-08 are Standard Webhooks; older secrets use Polar's HMAC variant and need the `whsec_` string base64-encoded before passing to a Standard Webhooks library [S41]. Use the `standardwebhooks` library (or the Polar SDK, 1.0.0-alpha.19+ tries both key forms [S41]) instead of hand-rolling. The signed-content layout (`id.timestamp.body`) is from the Standard Webhooks specification, which I did not fetch; do not hand-roll without reading it.
- **Event ID:** use the `webhook-id` header as `eventId` (Standard Webhooks convention; not fetched).
- **Mapping** (event names from [S42]; payload field names are **NOT VERIFIED** and must be checked against the Polar API reference at build time):

| Polar event | `BillingEvent.kind` | Notes |
|---|---|---|
| `subscription.created` | `ignored` or link only | Created before payment may have cleared; do not grant access yet |
| `subscription.active` | `activated` | Grants plan; capture customer ID, subscription ID, period end |
| `subscription.updated` | `updated` | Catch-all for cancellations and un-cancellations; read `cancel_at_period_end` |
| `subscription.canceled` | `updated` with `cancelAtPeriodEnd = true` | With end-of-period cancellation the subscription **stays `active`** with `cancel_at_period_end = true` [S42]; do not set status `canceled` |
| `subscription.revoked` | `canceled` | Billing stopped and benefits removed [S42] |
| `subscription.past_due` | `payment_failed` | "Fired when a subscription payment has failed" [S42] |
| `order.paid` | `payment_succeeded` | Renewal order after payment succeeds; `order.created.billing_reason` distinguishes `subscription_cycle` [S42] |
| `subscription.cycled` | `ignored` (or `updated` for new period) | Sent at the start of a new period whether or not payment succeeds [S42]; do not treat as paid |
| `order.refunded` | record only | Notify founder |

- **Linking the org:** pass `orgId` and `planId` when creating the checkout (Polar metadata or external customer ID; field names **NOT VERIFIED**), and add the `provider_customer_id` lookup fallback described above.
- **`startCheckout`:** call Polar's checkout API with the product for the plan; use `https://sandbox-api.polar.sh` in sandbox [S46]. Endpoint and fields **NOT VERIFIED**.
- **Customer portal:** Polar hosts it (view/cancel subscriptions, update payment method, invoices) [S45]; the docs I read say pre-authenticated links can be generated from your app but did not show how, and updating payment method is only in the hosted portal [S45]. Replace the Paystack-style 501 branch with a portal redirect.
- **Operations:** respond 2xx within 2 s and process asynchronously (Polar recommends 2 s; 10 s timeout; endpoint disabled after 10 consecutive non-2xx [S41]). Add an alert when the endpoint is disabled (Polar emails org members).

### 6.3 Changes if falling back to Paddle (sketch)

`Paddle-Signature: ts=..;h1=..`; HMAC-SHA256 over `ts + ":" + rawBody`; accept any matching `h1`; reject stale `ts` [S36]. Subscription events: `subscription.created/activated/updated/canceled/past_due/paused/resumed/trialing` [S37]; Paddle calls `subscription.updated` the catch-all for renewals, plan changes and cancellations [S37]. Transaction event names and payload fields were not fetched (**NOT VERIFIED**).

## 7. Risks

**Chargebacks and disputes**

- Stripe: $15 fee per dispute; $15 more per manual response; Smart Disputes is 30% of won disputes [S11]. Polar: $15 per dispute regardless of outcome; Polar monitors against card-network thresholds (~0.7%+) and may suspend accounts [S39]. Stripe Managed Payments/MoR products state a requirement for low historical dispute rates [S17].
- Paystack advertises automated chargeback alerts [S18] and lists "create significant risk of chargebacks" as a prohibited activity [S21].
- Bitcoin-business customers may be seen by acquirers as crypto-adjacent (inference). Low initial volume means a few disputes can move the percentage sharply; keep refunds easy and descriptors clear.

**Currency controls (Nigeria)**

- Flutterwave and Paystack settle Naira-card and international transactions in NGN by default; USD payout needs a USD account (Zenith for Paystack) [S19][S26].
- CBN: secondary reports say non-oil export proceeds must be repatriated within 180 days of the bill of lading and that CBN stopped approving extensions in January 2025; reports say cash withdrawals from export-proceeds domiciliary accounts are no longer permitted under the 2026 framework (secondary: [S50]). I found nothing specific to software or services exporters. **NOT VERIFIED.** Ask a Nigerian bank (authorised dealer) and counsel what documentation applies to foreign receipts via a MoR or a US entity, and whether the NXP system applies.
- Receiving payouts as NGN from a MoR avoids holding foreign currency but exposes you to the provider's conversion rate (spread unknown, see 5.1 question 3).

**Tax**

- You owe income tax in Nigeria on revenue under every route; a MoR does not change that [S44].
- Nigeria Tax Act 2025 took effect 2026-01-01; secondary sources say exported services are zero-rated for VAT and small companies are exempt from filing/paying VAT, and that foreign-currency expenses are deductible only at the official rate, with export relief tied to repatriation through authorised banks (secondary: [S50]). I did not read the Act. **NOT VERIFIED.**
- Stripe-direct (Atlas): you are the seller of record, so VAT/sales-tax registration abroad becomes your problem unless you use Stripe Tax and register where required [S11], plus US federal/state/Delaware obligations [S8].
- MoR: collection and remittance of consumer taxes is the MoR's job; keep their payout statements for your Nigerian tax filings.
- Tax and accounting treatment of any Bitcoin-denominated revenue is its own open item: [`legal-regulatory-register.md`](legal-regulatory-register.md) X8.

**Provider policy and concentration**

- All card and MoR providers reviewed restrict crypto-adjacent or financial-services products to some degree (S12, S20, S21, S34, S40). A rejection after launch can cut revenue overnight. Mitigation: get written clearance first; keep customer data and plan state portable (`billing.ts` already normalises events); keep a second provider's sandbox integration warm.
- Polar and Paddle can hold funds or suspend accounts for dispute or compliance reasons (policy language in [S39][S34]); keep a runway buffer.
- Webhook endpoint disablement (Polar) or missed events are single points of failure; build the reconcile job (6.1).

**Regulatory (repo register)**

- Pricing percentages: the repo prohibits percentage-of-volume pricing by Orynt until counsel clears it (X3). Provider percentage fees are a cost, not Orynt pricing, but disclose them accurately to counsel.
- Do not accept payment in a form that makes Orynt hold customer funds (register guardrail).

## 8. Bitcoin-native collection: a separate regulatory and tax question

Collecting subscription fees in Bitcoin is attractive for this audience, but it is **not** a billing-provider choice; it creates its own issues that [`legal-regulatory-register.md`](legal-regulatory-register.md) has not answered (X8 NOT STARTED; NG1, NG2, NG5, NG3 relate):

1. **You would hold crypto.** Nigeria's Investments and Securities Act 2025 and SEC digital-asset rules (register NG1/NG2) and the Nigeria Tax Act 2025 treat digital assets as chargeable assets; the revenue service reportedly issued crypto tax guidelines in August 2026 (secondary: [S50]). Reports disagree on rates (15%/25%/30% appear in different sources). **NOT VERIFIED.**
2. **Converting to NGN needs an on-ramp** (exchange or P2P) with its own KYC, tax and CBN-related issues (register NG3). The repo's guardrail is "No fiat on/off-ramps" for the product; this would be a personal/corporate treasury activity but needs counsel.
3. **Export-proceeds evidence.** Bitcoin receipts do not arrive through an authorised bank, so tax relief tied to repatriation through authorised channels may not apply (secondary [S50]; inference).
4. **Valuation and records.** Each receipt needs a USD (and NGN) valuation at receipt for tax. Price plans in USD and invoice at the spot rate.
5. **Tooling reality.** BTCPay Server (self-hosted) has native subscriptions since v2.3: either manual renewal after a reminder or prepaid credit that renewals deduct; BTCPay stores features but "your application must apply them", and optimistic on-chain activation can later require manual deactivation [S48]. Webhook coverage for subscription state is **NOT VERIFIED**. Zaprite offers recurring invoices with a flat account fee; where funds settle and who holds them was **NOT VERIFIED** (secondary [S49]).
6. **Customer-side compliance.** Customers that are VASPs or regulated entities may have their own constraints on paying vendors in Bitcoin.

Recommendation: do not offer Bitcoin payment in the validation window; offer it only after counsel answers X8 and the NG items. If offered later, treat it as an additional payment method on top of a USD card rail, price in USD, use prepaid credit (not manual per-period payment) to reduce churn, and keep the Bitcoin receipts out of any Orynt-controlled operating wallet used for product testing.

## 9. Decision checklist

Gate 1 - before touching any provider

- [ ] Counsel/accountant has chosen the contracting party (individual vs registered business) and answered X5 and X8 in writing.
- [ ] A factual, counsel-reviewed one-paragraph description of what Orynt does and does not do with money/keys exists for provider support emails.
- [ ] Pricing is approved for external use (guardrail in `pricing-hypotheses.md`); until then billing stays on `sandbox`.

Gate 2 - provider clearance (get each answer in writing)

- [ ] Polar: AUP acceptance of Orynt; Nigerian onboarding works; payout currency, rate, schedule; tax handling; dispute thresholds.
- [ ] If Polar says no or Nigeria payout fails: Stripe/Atlas pre-flight answers (founder eligibility, restricted-business view, payout path to Nigeria) or Paddle answers (seller acceptance, AUP, USD wire to a Nigerian USD domiciliary account).
- [ ] Fees recomputed with the actual payout currency and spread; pricing-hypotheses `B` updated.

Gate 3 - engineering

- [ ] `billing.ts` Stripe and Paystack defects in 6.1 fixed or those providers removed from the build.
- [ ] Per-provider webhook secrets; raw-body verification; signature verified against every provided signature.
- [ ] Events that cannot be linked are not lost (retry or pending queue); customer-ID lookup fallback added.
- [ ] Sandbox end-to-end test of: first payment, renewal, failed payment, card update, cancel at period end, immediate cancel/revoke, refund, dispute; payloads saved as fixtures.
- [ ] Reconcile job against the provider API; alert on webhook-endpoint disablement and on any event type not recognised.

Gate 4 - go-live

- [ ] One real low-value purchase by the founder, then refund; record payout time, currency, rate, all fees.
- [ ] Nigerian tax and CBN documentation path confirmed with a bank and accountant for the first real receipts.
- [ ] Chargeback process written (evidence template, refund rules, customer-facing descriptor and support contact).
- [ ] A second provider's sandbox integration remains warm for failover.

## 10. Sources

All retrieved 2026-11-10 unless a different cache date is noted. "Cache" means the scraper returned a stored copy with that timestamp.

- [S1] Stripe global availability. https://stripe.com/global. Nigeria shown as "Extended network" linking to https://paystack.com/stripe/nigeria.
- [S2] Paystack, "Does Stripe operate in Nigeria?". https://paystack.com/stripe/nigeria. Cache 2026-11-10T09:33Z.
- [S3] Stripe payouts docs. https://docs.stripe.com/payouts. (Nigeria NUBAN "only available for Connect cross-border payouts"; first 100,000 characters read.)
- [S3b] Stripe Global Payouts recipient requirements. https://docs.stripe.com/global-payouts/recipient-requirements. Nigeria not in the US-sender tables.
- [S4] Stripe Connect cross-border payouts. https://docs.stripe.com/connect/cross-border-payouts.
- [S5] Stripe support, requirements to open an account in another country. https://support.stripe.com/questions/requirements-to-open-a-stripe-account-in-another-country. Cache 2026-11-10T13:13Z.
- [S6] Stripe Atlas. https://stripe.com/atlas.
- [S7] Stripe Atlas sign-up docs. https://docs.stripe.com/atlas/signup.
- [S8] Atlas business taxes. https://docs.stripe.com/atlas/business-taxes.
- [S9] Atlas bank accounts. https://docs.stripe.com/atlas/payments-business-bank.
- [S10] How to get a US bank account. https://support.stripe.com/questions/how-to-get-a-us-bank-account.
- [S11] Stripe pricing (US). https://stripe.com/pricing.
- [S12] Stripe prohibited and restricted businesses. https://stripe.com/legal/restricted-businesses. Cache 2026-11-10T07:26Z.
- [S13] Stripe webhooks. https://docs.stripe.com/webhooks.
- [S14] Stripe changelog 2025-03-31.basil, subscription billing periods. https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end.
- [S15] Stripe changelog 2025-03-31.basil, invoice `parent`. https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects.
- [S16] Stripe, using webhooks with subscriptions. https://docs.stripe.com/billing/subscriptions/webhooks.
- [S17] Stripe Managed Payments eligibility. https://docs.stripe.com/payments/managed-payments/eligibility. Supported business locations are CA, US, listed European countries, AU, HK, JP, SG; Nigeria absent.
- [S18] Paystack pricing (Nigeria). https://paystack.com/pricing. Cache 2026-11-10T09:33Z.
- [S19] Paystack, enabling international payments. https://support.paystack.com/en/articles/2130690. Cache 2026-11-09T17:36Z.
- [S20] Paystack, international payment eligibility. https://support.paystack.com/en/articles/2127682. Cache 2026-11-09T16:05Z.
- [S21] Paystack, ineligible businesses. https://support.paystack.com/en/articles/2127042. Cache 2026-11-09T16:01Z.
- [S22] Paystack webhooks docs. https://paystack.com/docs/payments/webhooks/. Cache 2026-11-10T09:45Z.
- [S23] Paystack subscriptions docs. https://paystack.com/docs/payments/subscriptions/. Cache 2026-11-10T09:45Z.
- [S24] Paystack Plan API and currency notes via search result summary. https://paystack.com/docs/api/plan/ (page itself not fetched; secondary-quality).
- [S25] Flutterwave pricing (Nigeria). https://flutterwave.com/ng/pricing. Cache 2026-11-10T06:11Z.
- [S26] Flutterwave, settlement in different currencies. https://flutterwave.com/ug/support/payments/settlement-in-different-currencies.
- [S27] Flutterwave webhooks. https://developer.flutterwave.com/docs/webhooks. Cache 2026-11-08T18:04Z.
- [S28] Flutterwave payment plans (search snippet). https://developer.flutterwave.com/docs/payment-plans-1.
- [S29] Lemon Squeezy supported countries (search snippet). https://docs.lemonsqueezy.com/help/getting-started/supported-countries.
- [S30] Secondary: Lemon Squeezy 2026 update https://www.lemonsqueezy.com/blog/2026-update (existence confirmed; body not extracted); https://www.turbostarter.dev/blog/lemon-squeezy-vs-stripe; https://www.paritydeals.com/stripe-managed-payments-vs-lemon-squeezy-fees/; official pricing page https://www.lemonsqueezy.com/pricing (extract garbled).
- [S31] Lemon Squeezy webhook signing. https://docs.lemonsqueezy.com/help/webhooks/signing-requests.
- [S32] Paddle, supported countries. https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle. Cache 2026-11-10T09:15Z.
- [S33] Paddle pricing. https://www.paddle.com/pricing. Cache 2026-11-10T11:54Z.
- [S34] Paddle Acceptable Use Policy help page. https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle. Cache 2026-11-10T09:38Z.
- [S35] Paddle payouts. https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid ; https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts ; https://www.paddle.com/help/manage/get-paid/can-i-be-paid-in-my-local-currency (search excerpts).
- [S36] Paddle webhook signature verification. https://developer.paddle.com/webhooks/signature-verification.
- [S37] Paddle webhooks overview. https://developer.paddle.com/webhooks/overview.
- [S38] Polar supported countries. https://polar.sh/docs/merchant-of-record/supported-countries.
- [S39] Polar fees. https://polar.sh/docs/merchant-of-record/fees. Cache 2026-11-10T11:54Z.
- [S40] Polar Acceptable Use Policy. https://polar.sh/legal/acceptable-use-policy. Cache 2026-11-09T06:13Z.
- [S41] Polar webhook delivery. https://polar.sh/docs/integrate/webhooks/delivery.
- [S42] Polar webhook events. https://polar.sh/docs/integrate/webhooks/events.
- [S43] Polar payout accounts. https://polar.sh/docs/features/finance/accounts.
- [S44] Polar merchant of record introduction. https://polar.sh/docs/merchant-of-record/introduction.
- [S45] Polar customer portal. https://polar.sh/docs/features/customer-portal.
- [S46] Polar sandbox. https://polar.sh/docs/integrate/sandbox.
- [S47] Secondary, Chargebee/Recurly pricing and gateway coverage (search summaries, 2026-11-10): https://www.costbench.com/software/subscription-billing/chargebee/ ; https://www.swell.is/content/recurly-pricing ; https://docs.recurly.com/docs/payment-gateways-1. No primary price page was read.
- [S48] BTCPay Server subscriptions. https://docs.btcpayserver.org/Subscriptions ; release announcement https://blog.btcpayserver.org/btcpay-server-2-3-0/ (search summary; dated 2025-12-18 by the search tool).
- [S49] Zaprite (secondary, search summaries). https://help.zaprite.com/en/articles/12125797-zaprite-pricing ; https://blog.zaprite.com/recurring-invoices-now-available/ ; https://www.zaprite.com.
- [S50] Nigerian tax and CBN context (secondary, search summaries; Act and circulars not read). https://www.forvismazars.com/ng/en/services/tax/nigeria-s-tax-reform-in-focus/2025-nta-vat-key-business-changes ; https://www.pwc.com/ng/en/assets/pdf/the-nigeria-tax-reform-acts-top-20-changes-to-know-and-top-6-things-to-do-pwc.pdf ; https://nairametrics.com/2026/08/03/nrs-issues-crypto-tax-guidelines-as-companies-face-30-income-tax/ ; https://www.thisdaylive.com/2025/01/10/cbn-halts-extension-of-export-proceeds-repatriation/ ; https://techeconomy.ng/cbn-halts-export-proceeds-repatriation-extension.
- Repo context read: `apps/api/src/services/billing.ts`, `docs/business/pricing-hypotheses.md`, `docs/business/legal-regulatory-register.md` (as of 2026-11-10).
