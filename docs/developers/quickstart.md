# Developer quickstart

Base URL (local): `http://127.0.0.1:8787`. Full contract: [`docs/api/openapi.json`](../api/openapi.json) (generated: `pnpm openapi`; also served at `/v1/openapi.json`). Amounts are **integer millisatoshi strings** (`"25000000"` = 25,000 sats) — never numbers.

## 1. Run it
```bash
pnpm install && pnpm db:start
pnpm build:all
ORYNT_ENV=development ORYNT_SEED_DEMO=1 ORYNT_FAILPOINTS=1 pnpm start      # labelled demo workspace on the SIMULATOR wallet
# sign in at http://127.0.0.1:8787/app  as demo-owner@orynt.local / demo-password-123
```
## 2. Get an API key
App → Developers → "Create key" (role `operator`). API keys can create, submit, **execute** and read; they can **never approve** (approvals are signatures by people).

## 3. Create → submit → (a human approves) → execute
```ts
import { OryntClient } from "@orynt/sdk";
const orynt = new OryntClient({ baseUrl: "http://127.0.0.1:8787", apiKey: process.env.ORYNT_API_KEY });

const ob = await orynt.obligations.create({ counterparty_name: "Bob Studio", amount_msat: "25000000", invoice, memo: "Design work" });
await orynt.obligations.submit(ob.id);                        // now AWAITING_APPROVAL; approvers sign in the app

const { obligation, certain, idempotencyKey } = await orynt.obligations.execute(ob.id);
if (!certain) {
  // HTTP 202 → state UNKNOWN/RECONCILING. The wallet's answer was lost. DO NOT send again.
  const settled = await orynt.obligations.waitUntilResolved(ob.id);   // Orynt reconciles by payment hash
}
```
`execute` **requires** an `Idempotency-Key` (the SDK generates one). Retrying the same key replays the original response; reusing it with different input is `422 idempotency_conflict`. Even without the key, the server guarantees at most one wallet send per obligation.

## 4. Verify the receipt without trusting us
```bash
node packages/verifier/dist/orynt-verify.mjs receipt.json --trust-key <issuer-public-key-hex> --require-real
# exit 0 VERIFIED · 1 REJECTED · 2 usage · 3 integrity OK but issuer not trusted · 4 VERIFIED_SIMULATED (not a real payment)
```
Get the issuer key **out-of-band** (a key fetched from the same server proves nothing independent). Optional claimant checks: `--expect-payment-hash`, `--expect-amount-msat`, `--expect-payee-pubkey`, `--expect-network`, `--max-age-seconds`, `--seen-file` (replay ledger).

## Pagination, errors, ids
List endpoints return `{ data, next_cursor }`; pass `cursor`, `limit` (≤100). Every error is `application/problem+json` (RFC 7807) with a stable `code`, a human `detail`, and `request_id` (also the `x-request-id` header; send your own `x-request-id` to correlate).

| code | HTTP | meaning |
|---|---|---|
| `validation_failed` | 400/422 | malformed request |
| `unauthenticated` / `forbidden` | 401 / 403 | no/invalid credentials · role lacks permission (fail-closed) |
| `not_found` | 404 | also returned for other workspaces' resources |
| `conflict`, `idempotency_conflict` | 409, 422 | |
| `invalid_state` | 409 | action not possible in the current state (message says why) |
| **`send_blocked_unresolved`** | 409 | a payment may already exist; **reconcile, don't retry** |
| `policy_violation`, `approval_invalid`, `approval_stale`, `approval_insufficient` | 4xx | approval rules |
| `invoice_invalid`, `invoice_expired`, `network_mismatch`, `amount_mismatch`, `destination_mismatch` | 422/409 | invoice binding checks |
| `wallet_unavailable`, `wallet_insufficient_permissions`, `mainnet_disabled` | 409/503/422 | |
| `rate_limited` | 429 | |

## Webhooks
Register in the app or `POST /v1/webhooks {url, events}` (`["*"]` for all). Events: `obligation.submitted|approved|rejected|cancelled`, `payment.dispatching|pending|unknown|settled|failed`, `incident.opened|resolved`. Delivery is **at-least-once** with exponential backoff (5 s → 6 h, then dead). Each request carries `Orynt-Event-Id`, `Orynt-Event-Type`, `Orynt-Delivery-Attempt` and `Orynt-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.
```ts
import { verifyWebhook } from "@orynt/sdk";
const event = verifyWebhook(rawBody, req.headers["orynt-signature"], process.env.ORYNT_WHSEC);   // throws on bad signature or >5 min skew
if (seen.has(event.id)) return res.sendStatus(200);                                                  // de-duplicate on event.id
```
Targets must be https (private/loopback/metadata addresses are refused outside development; DNS is pinned to the vetted address).

## Limits
Rate limits are per client IP (default 600 req/min, configurable with `ORYNT_RATE_LIMIT_PER_MIN`; 15/min on sign-in/registration, 60/min on public endpoints; set `ORYNT_TRUST_PROXY=1` behind a trusted reverse proxy). Bodies ≤ 256 KB. API versioning: `/v1` (additive changes only within v1).
