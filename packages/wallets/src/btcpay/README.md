# BTCPay Server adapter (Greenfield API, store-level Lightning node)

**Status: contract-tested against a fake, NOT verified against a real BTCPay Server. Not live. Not wired into the API.**

- `provider.ts` implements `WalletProvider` (`getInfo`, `discoverCapabilities`, `sendPayment`, `lookupPayment`).
- `http.ts` is the only code that touches the network: injectable `fetch`, hard deadlines, no redirects, key only in the
  `Authorization: token <key>` header (held in a `#private` field), transport errors split into NotSent / OutcomeUnknown.
- `permissions.ts` interprets `GET /api/v1/api-keys/current`; `config.ts` validates configuration; `redact.ts` scrubs secrets.
- The tests (`packages/wallets/test/btcpay.test.ts`) are **CONTRACT TESTS against a fake server written from BTCPay's
  published swagger and its source code** (`test/btcpay-fake-server.ts`). Every suite name says so. They prove the adapter
  does what it was designed to do for the documented responses; they prove nothing about a real BTCPay Server.

Read `docs/product/btcpay-adapter.md` before using it: it lists what BTCPay cannot tell us (backend type, network),
where its behaviour differs from LND, and the integration changes the API layer still needs.
