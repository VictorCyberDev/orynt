import { OryntClient, OryntApiError, newIdempotencyKey, generateKeyPair, signApprovalBody } from "@orynt/sdk";

const orynt = new OryntClient({
  baseUrl: "http://127.0.0.1:8787",   // your own Orynt API (regtest)
  apiKey: process.env.ORYNT_API_KEY,  // starts with "orynt_"; an API key can never approve
});

// 1. Record the obligation. Amounts are whole millisatoshis, sent as strings.
const draft = await orynt.obligations.create(
  {
    counterparty_name: "Ada (docs contributor)",
    amount_msat: "250000000",         // 250,000 sats
    invoice: "lnbcrt1…",              // the payee's BOLT11 invoice
    memo: "October docs work",
    external_ref: "grant-2026-014",
  },
  newIdempotencyKey(),                // optional: the same key replays the same result
);

// 2. Freeze this revision and request approval.
const submitted = await orynt.obligations.submit(draft.id);
console.log(submitted.state, submitted.intent_digest); // approvers sign this digest
