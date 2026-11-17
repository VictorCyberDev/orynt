# BTCPay Server wallet adapter

*Written 2026-11-11 against BTCPay Server 2.4.7 (the newest release tag) and `BTCPayServer.Lightning` master. Sources are listed at the end.*

## Status, stated plainly

| Question | Answer |
|---|---|
| Does the code exist? | Yes: `packages/wallets/src/btcpay/`. |
| Is it wired into the API, the database or the UI? | **No.** See "What is still missing outside this package". |
| Was it run against a real BTCPay Server? | **No.** Never. |
| What was it tested against? | A **fake HTTP server on loopback**, written from BTCPay's published swagger and from reading its controller source. 54 tests in `packages/wallets/test/btcpay.test.ts`. They are **contract tests**, not verification. |
| May it be called "live", "verified" or "supported"? | **No.** The honest label is "adapter implemented, contract-tested against a fake built from the documentation". |
| Was a real BTCPay run attempted in the sandbox it was written in? | No. Docker has no daemon there. A .NET SDK and the BTCPay/NBXplorer sources were reachable, but building and running downloaded third-party code was not permitted by the sandbox's policy, so it was not attempted. It would also need NBXplorer, PostgreSQL, bitcoind and a Lightning node. See "Operational test". |

## What BTCPay's Greenfield API actually offers

Everything below is from the swagger (`https://docs.btcpayserver.org/API/Greenfield/v1/swagger.json`) and the BTCPay source; where they disagree, the source is what runs and the disagreement is stated.

| Need | Endpoint | Facts |
|---|---|---|
| Pay a BOLT11 | `POST /api/v1/stores/{storeId}/lightning/{cryptoCode}/invoices/pay` | Body `BOLT11`, optional `amount` (msat, **overrides the invoice amount**), `maxFeePercent`, `maxFeeFlat` (**whole satoshi**), `sendTimeout` (seconds, default 30). Returns `LightningPaymentData` `{id, status, BOLT11, paymentHash, preimage, createdAt, totalAmount, feeAmount}`; `status` is `Complete`, `Failed`, `Pending` or `Unknown`. `totalAmount` includes fees. **Synchronous up to `sendTimeout`**, then `202` and the final state must be fetched. |
| Look a payment up | `GET .../lightning/{cryptoCode}/payments/{paymentHash}` | `200` `LightningPaymentData`, or `404` `payment-not-found`. This is the reconciliation primitive. |
| Node info | `GET .../lightning/{cryptoCode}/info` | `nodeURIs` (`pubkey@host`), `alias`, `version`, `blockHeight`, channel counts. **No network, no chain, no "synced" flag.** |
| Key permissions | `GET /api/v1/api-keys/current` | `{id, apiKey, label, permissions[]}`. The swagger annotates it `canmanageusers`; the controller (`GreenfieldApiKeysController`) requires only a valid API key. **The response contains the key itself.** |
| Auth | `Authorization: token <key>` | Basic auth also exists but is for bootstrap only. |
| Internal-node variants | `/api/v1/server/lightning/{cryptoCode}/...` | Same shapes; server-level permission `btcpay.server.canuseinternallightningnode`, admin only. Not used by this adapter. |

Pay responses (controller `GreenfieldLightningNodeApiController.PayInvoice`): `200` ok, `202` pending/unknown, `400` with code `could-not-find-route` or `generic-error`, `422` validation (invalid BOLT11, **including a BOLT11 of a different network**, negative amount/fees), `403` `missing-permission`, `404` `lightning-not-configured` / `unknown-cryptocode`, `503` `lightning-node-unavailable`.

### Permissions: what the source says, and where the swagger misleads

- Store pay, payment lookup and node info are **all** authorised by one policy, `btcpay.store.canuselightningnode`. The swagger lists `cancreatelightninginvoice` for the pay endpoint; the controller attribute is `CanUseLightningNodeInStore`, and `cancreatelightninginvoice` / `canviewlightninginvoice` are *children* of it, not substitutes (`BTCPayServerServices.cs`).
- Consequences: (1) **there is no read-only lookup permission**. Whoever can reconcile can also pay. (2) The same permission also allows opening channels and connecting peers on the store's node. (3) The least-privilege key is exactly `btcpay.store.canuselightningnode:<storeId>`. `btcpay.store.canmodifystoresettings` and `unrestricted` include it; an unscoped store permission applies to all of the user's stores.
- If the store uses BTCPay's *internal* node, pay additionally requires the user to be a server admin (checked inside the controller, not visible in the key).
- A key's permission list is an upper bound: a key can never exceed its user's rights (e.g. the user's role in the store).

## Where BTCPay differs from LND (and what the adapter does about it)

| Topic | LND adapter | BTCPay | Adapter behaviour |
|---|---|---|---|
| Duplicate send | LND refuses; adapter throws `AlreadyExistsError` | No "already exists" error. The LND backend answers *"already paid"* as **success**; a payment in flight as `202` | Pre-send lookup by hash (default on): an existing `Complete`/`Pending` payment is returned, never re-paid. `Failed` allows a new attempt. If the check cannot be answered, nothing is sent. `AlreadyExistsError` is never thrown. |
| Definitive failure | Terminal `FAILED` record | `400` is produced for several situations, on several backends | A `400` is trusted **only if a lookup by hash returns `Failed`**. `400` with no record, or with a `Complete` record, is not "failed" (the latter becomes `SUCCEEDED`). |
| `503` | Not special | `lightning-node-unavailable` comes from an exception filter that wraps **every** exception in the controller, including ones after the payment was handed to the node | `OutcomeUnknownError`. A test shows the payment really can have happened. |
| Timeout | `OutcomeUnknown` | Same, plus: aborting our HTTP call does not cancel an HTLC already in flight | `OutcomeUnknownError`; deadline is `sendTimeout` + 15 s. |
| Fee limit | Absolute msat (`fee_limit_msat`) | `maxFeeFlat` in **whole sats**; `0` is **ignored** by the LND backend, which then applies its default (up to 100 % for payments <= 1000 sat, 5 % above) | Limit is floored to whole sats; a limit below 1 sat is **refused** (`NotSentError`) rather than silently loosened. Whether the backend enforced it is not verified after the fact. |
| Amount | `amt_msat` only for zero-amount invoices | `amount` *overrides* the invoice | Sent only for zero-amount invoices; fixed-amount invoices are checked locally against the approved amount. |
| Path splitting | `max_parts: 1` | Not controllable; the LND backend may use MPP | Not controllable. |
| Network | From the node | **Not exposed by the API** | Operator-declared; every send decodes the BOLT11 and refuses a different network; BTCPay re-checks (422). Optional `verifyNetworkWithInvoiceProbe` creates a 1-sat, 60 s invoice and reads its prefix (a write to the node, off by default). |
| Node identity | `identity_pubkey` | First `nodeURIs` entry, may be absent | `nodePubkey` or `null`. |
| Lookup of an absent payment | Authoritative | `payment-not-found` is only as reliable as the hidden backend: Phoenixd's client maps *any* API error to "not found"; BTCPay does not say which backend is behind a store | `NOT_FOUND` only if the operator sets `trustAbsenceOfPayment` (attesting LND, Core Lightning or Eclair). Otherwise absence is an `OutcomeUnknownError`. |
| Receipt evidence | Preimage and fee from the node | Preimage in the response, or fetched by hash; if still absent, the record is returned without one so core refuses to settle | Core re-verifies `sha256(preimage) == payment hash`. |
| Delivered amount | `value_msat` | Derived: `totalAmount - feeAmount` (documented semantics; not verified on a real node) | `amountMsat` only when both are present. A mismatch makes core raise `provider_inconsistent` rather than settle. |

### Error classification

| Result | Meaning for Orynt |
|---|---|
| `422`, `401`, `403`, `404 lightning-not-configured`, `429`, a 3xx, `400` without a Greenfield `code`, local refusals, connection refused / DNS / TLS | `NotSentError`: provably not processed. (A 401/403 on a send is `NotSentError` rather than `InsufficientPermissionsError` because the API layer maps the latter to "unknown" on the send path.) |
| Timeout, reset, `5xx`, `503`, unparseable `200`, any other status | `OutcomeUnknownError`: never failure. |
| `200` / `202` `Pending` | `IN_FLIGHT` |
| `200` `Complete` | `SUCCEEDED` (preimage fetched if missing) |
| `400` + lookup `Failed` | `FAILED` |
| `Unknown` status | resolved by lookup, else `OutcomeUnknownError` |

## Capability discovery

`discoverCapabilities()` never assumes; it combines (a) the key's permission list, (b) side-effect-free probes, and fails closed on disagreement:

- **Send**: `POST .../invoices/pay` with a string that cannot parse as BOLT11. BTCPay authorises, resolves the node and checks admin rights **before** validating, so `422` means "would have been allowed" and no payment can result (the same technique the LND adapter uses). `403` means no.
- **Lookup**: `GET .../payments/<all-zero hash>`; `404 payment-not-found` means the endpoint works for this key.
- **Info**: `GET .../info`.
- **Lookup is reported `unknown` unless `trustAbsenceOfPayment` is set**, because a lookup that can find payments but cannot prove absence is not enough to resolve an uncertain payment safely. The note says so in the connection's capability notes.
- Over-privileged keys (`unrestricted`, unscoped, other stores, server permissions) are flagged in the notes; `requireLeastPrivilege` turns the flag into `can_send = false`. Even the least-privilege key can open channels.
- A list that says "no" while the server says "yes" is reported `unknown`.

## Supported networks

BTCPay supports mainnet, testnet, signet and regtest per instance, but the Greenfield API does not report which. Orynt records the **declared** network and enforces it on every send (BOLT11 prefix, plus BTCPay's own 422). Verified against a real server on **no** network. Mainnet execution stays disabled by the API's existing switch.

## Limitations

1. Not run against a real BTCPay Server; all behaviour is inferred from documentation and source.
2. The Lightning backend behind a store is not disclosed; absence-of-payment reliability, fee enforcement and MPP depend on it.
3. No payment-only or lookup-only permission; the credential can also manage channels.
4. Fee limits are whole-sat, best-effort, unverified after payment; below 1 sat they cannot be expressed.
5. The network cannot be discovered without writing to the node.
6. Keysend and zero-amount-without-explicit-amount are not supported (invoice-based only, as for LND).
7. BTCPay can mark a payment `Unknown`; Orynt treats it as unresolved until BTCPay says otherwise.
8. Only `BTC` (no altcoin Lightning).
9. SSRF vetting (DNS resolution, private ranges) is not done here: `apps/api/src/lib/ssrf.ts` cannot be imported from a package. The adapter validates syntax only (https, no credentials, no query, loopback http only on request, redirects never followed). The API layer must vet the URL as it does for LND and should inject a DNS-pinned `fetch`.

## Alternative considered: pull payments / payouts

`POST /stores/{id}/payouts` -> approve -> `LightningAutomatedPayoutSenderFactory` processor pays it, with `paymentProof` carrying `paymentHash` and `preimage` once `Completed`. **Rejected for Orynt's execution model**: the payout is asynchronous and owned by BTCPay's processor, which on failure puts the payout back to `AwaitingPayment` and retries by itself (a second authority that can pay), it uses its own fee percentage, cancels on amount mismatch, expresses amounts as BTC decimals (no msat), and offers no synchronous definitive-failure signal. Orynt's single-writer state machine and "never re-send without proof" rule cannot coexist with a processor that retries on its own.

## What is still missing outside this package (not done: out of scope here)

1. `packages/wallets/src/types.ts`: `ProviderKind` must include `"btcpay"` (`export type ProviderKind = "lnd" | "nwc" | "btcpay" | "simulator";`). Until then the adapter casts its constant, in one place.
2. `packages/wallets/src/index.ts`: `export * from "./btcpay";`
3. `apps/api/src/db/migrations`: `provider_kind` has `CHECK (provider_kind IN ('lnd','nwc','simulator'))`; add `'btcpay'`.
4. `packages/contract/src/schemas.ts` (`ConnectionKind`, the connection DTO enum) and `packages/core/src/receipt.ts` (`provider.kind`) enums.
5. `apps/api/src/services/providers.ts` (`providerFor`), `admin.ts` (`createConnection`: input shape, encrypt `{base_url, api_key, store_id, network, trust_absence_of_payment}`, **vet the URL with `vetWebhookTarget`**, `connectionDto` summary that never shows the key).
6. `apps/api/src/services/execution.ts` `applyRecord` hard-codes the evidence `providerKind: isSim ? "simulator" : "lnd"`.
7. **Lookup is not enforced anywhere.** `gate()` in `execution.ts:34` and `obligations.ts:138` refuse only `can_send === "false"`; `can_lookup` is stored and displayed but ignored, and `"unknown"` passes. For BTCPay (and NWC) the gate should require `can_send === "true"` **and** `can_lookup === "true"` before dispatch. Without that change the adapter reports the truth and Orynt does not act on it.
8. `docs/product/wallet-capability-matrix.md`: the BTCPay column may say "adapter exists, contract-tested against a fake, not verified" and nothing stronger.

## Operational test (needs Docker; owner action)

Goal: promote this from "contract-tested" to "VERIFIED (regtest)" exactly as the LND column was: real settlement, preimage proof, lost-response reconcile, duplicate refused, no-route, wrong network, revoked key.

1. Prerequisites: Docker with Compose, .NET SDK 10 (per `Build/Common.csproj`), Git.
2. `git clone https://github.com/btcpayserver/btcpayserver && cd btcpayserver && git checkout v2.4.7`
3. `cd BTCPayServer.Tests && docker-compose up -d dev`. This starts, on regtest: bitcoind, NBXplorer, PostgreSQL, `merchant_lnd`/`customer_lnd` (LND), `merchant_lightningd`/`customer_lightningd` (Core Lightning). (Official: `docs/maintainers/local-development.md`.)
4. `cd .. && dotnet run --project BTCPayServer/BTCPayServer.csproj --launch-profile Bitcoin`. It listens on `http://localhost:14142/` with `BTCPAY_NETWORK=regtest` and admin registration open.
5. In the UI: register the first (admin) user; create a store; connect the store's Lightning node to **`merchant_lnd`** (the compose file exposes its REST on `127.0.0.1:35531`, no macaroons, no TLS; BTCPay's own `Bitcoin` launch profile uses `type=lnd-rest;server=http://lnd:lnd@127.0.0.1:35531/;allowinsecure=true`). Create a second run later with a Core Lightning node to compare backends.
6. Create the API key: Account > Manage Account > API Keys > **only** "Use the lightning nodes associated with your stores" scoped to that one store.
7. Fund the LND nodes and open channels (needed so there is something to pay *from*; the store's node must have outbound liquidity toward a second node you also control, e.g. `customer_lnd`). BTCPay's own test `LightningTests.CanUseLightningAPI` shows the sequence its suite uses; `BTCPayServer.Tests/README.md` documents `docker-bitcoin-cli.sh` and `docker-bitcoin-generate.sh`. This step is the least documented one: expect to work out the channel setup yourself.
8. Point a throwaway Orynt dev instance (or a script using `BtcpayProvider` directly with `allowInsecureLoopback: true`, `network: "regtest"`, `trustAbsenceOfPayment: true` only for the LND backend) at it and run, at least: pay OK; pay with no route; pay a hold invoice until `sendTimeout` (-> 202 / unknown, then lookup); duplicate send; kill BTCPay mid-payment and reconcile; revoked key; read the lookup response for an unknown hash on LND and on Core Lightning.
9. Record the observed raw responses next to the fake's assumptions and **change the fake and the adapter wherever they disagree**. Only then promote the matrix row, and only for the versions and backends actually run (BTCPay 2.4.7; LND `v0.21.6-beta-1` and the Core Lightning image used by the compose file).

Never run any of this with mainnet funds or a mainnet BTCPay.

## Is it recommended for Orynt's execution model?

Orynt's model requires: single dispatch, a payment-hash handle to ask "did this happen?", terminal-failure proof before any retry, and a credential that can be scoped. Judged against that:

- **Single dispatch + hash handle**: available (the pay call plus `payments/{hash}`), and the adapter adds the duplicate guard BTCPay lacks.
- **Failure proof**: only via a lookup that says `Failed`; achievable, and enforced.
- **Absence proof**: *not available in general* because the backend is hidden; the adapter fails closed unless the operator attests the backend.
- **Credential scope**: *weak*. No payment-only permission; the credential can open channels.
- **Observability of limits**: fee limits are coarse and unverified; network is not discoverable.
- **Unverified**: no real-server evidence.

## Verdict

**Do not ship BTCPay as a supported wallet yet.** Keep LND (the only wallet with real-node evidence) as the recommended path. BTCPay is a reasonable *second* integration for operators who already run BTCPay and want Orynt's approvals on top, **if and only if**: (a) the operational test above passes on regtest, (b) the lookup gate in "What is still missing" item 7 is implemented, (c) the store is backed by LND or Core Lightning and the operator sets `trustAbsenceOfPayment` knowingly, and (d) the key is the single store-scoped `canuselightningnode` permission on a dedicated store. Until (a) is done, the only accurate public statement is: "BTCPay adapter implemented and contract-tested against a documentation-derived fake; not verified; not available for execution."

## Sources (read 2026-11-11)

- Swagger: `https://docs.btcpayserver.org/API/Greenfield/v1/swagger.json` (excerpt of the schemas used: `packages/wallets/test/btcpay-swagger-excerpt.json`; the fake's requests and responses are checked against it on every test).
- BTCPay Server `master` @ `2cbc3d87`, version 2.4.7: `BTCPayServer/Controllers/GreenField/GreenfieldLightningNodeApiController{,.Store,.Internal}.cs`, `GreenfieldApiKeysController.cs`, `BTCPayServer.Client/Permissions.cs`, `BTCPayServer/Hosting/BTCPayServerServices.cs` (permission hierarchy), `BTCPayServer/PayoutProcessors/Lightning/LightningAutomatedPayoutProcessor.cs`, `BTCPayServer.Tests/LightningTests.cs`, `docs/maintainers/local-development.md`.
- `btcpayserver/BTCPayServer.Lightning` `master` @ `5f8c79cd`: `LndClient.cs` (`PayAsync`, `BuildRouterSendRequest`, `GetPayment`), `CLightningClient.cs`, `PhoenixdLightningClient.cs`, `EclairLightningClient.cs`, `LndHubLightningClient.cs`.
