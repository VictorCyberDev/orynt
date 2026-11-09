# Local regtest Lightning network (UNEXECUTED in the build environment)

`bash infra/regtest/fetch.sh` downloads Bitcoin Core 32.1 and LND v0.20.1-beta (Linux x86_64) and **refuses to proceed unless the SHA-256 equals the pinned value** in `versions.env` (pinned on 2026-11-09 from the publishers' checksum files; PGP/guix attestations were *not* verified).
`node infra/regtest/up.mjs [--fresh]` starts `bitcoind -regtest`, two LND nodes (alice = the payer Orynt controls, bob = payee), funds alice, opens a 5,000,000-sat channel alice→bob, and bakes two macaroons for Orynt: **least-privilege** (`info:read, offchain:read, offchain:write`) and **read-only** (to demonstrate the "insufficient permissions" path). Output: `.regtest/env.json` (git-ignored). Stop: `node infra/regtest/down.mjs [--wipe]`.

Then: `pnpm test:real-lightning` (adapter + end-to-end acceptance against LND) and `pnpm demo:full` (the full story with real payments, including a SIGKILL of the API after LND accepts the payment).

**Status:** these scripts and tests have never been executed — the build sandbox refused to run downloaded binaries. They are written against the documented bitcoind JSON-RPC and LND REST APIs; expect to fix small issues on first run (port clashes, REST field names such as `node_pubkey` encoding). Regtest only: `up.mjs` aborts if any node reports a non-regtest chain. Never point Orynt at mainnet credentials.
