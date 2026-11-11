# Production readiness checklist — NOT READY FOR REAL FUNDS OR PAYING CUSTOMERS

Status as of 2026-11-11 (R3 start). **Do not use with mainnet or meaningful funds.** Authoritative companion: `docs/R3-CLOSURE-REGISTER.md`. Statuses: VERIFIED COMPLETE · IMPLEMENTED, NOT COMMISSIONED · SIMULATOR-VERIFIED · PARTIAL · BLOCKED · NOT STARTED.

| Area | Item | Status |
|---|---|---|
| Money safety | Invariants enforced in code + DB; adversarial suite on real PostgreSQL | VERIFIED COMPLETE (simulator wallet) |
| Money safety | LND adapter against real nodes | VERIFIED COMPLETE on **regtest** only (15 real tests + `demo:full`); testnet/mainnet never run |
| Money safety | Independent security audit / penetration test | NOT STARTED — AI-assisted reviews only; human audit is an external gate |
| Money safety | Mainnet execution | DISABLED by design; no supported production switch |
| Wallets | NWC, BTCPay, Core Lightning | NOT VERIFIED — see `docs/product/wallet-capability-matrix.md` (adapters, where present, are contract-tested against local fakes only) |
| Secrets | `ORYNT_SECRET_KEY`/`ORYNT_ISSUER_KEY` from a secret manager; rotation | key required at boot in production; **rotation tooling not built** |
| Auth | E-mail verification, password reset, invitations, sessions, TOTP MFA step-up | SIMULATOR-VERIFIED (mail goes to an outbox); MFA is opt-in per user, no org-level enforcement yet |
| Auth | Real e-mail delivery | IMPLEMENTED, NOT COMMISSIONED (needs owner's sending domain + provider key) |
| Approvals | WebAuthn/hardware-backed approval keys | NOT STARTED (key lives in browser storage) |
| Billing | Plans, entitlements, webhook parsing, sandbox provider | SIMULATOR-VERIFIED; live provider IMPLEMENTED, NOT COMMISSIONED; no charge has ever been made; billing and wallet commissioning are separate gates |
| Infra | Docker image builds and starts | VERIFIED COMPLETE on hosted CI |
| Infra | Production compose/worker, TLS termination, multi-instance behaviour, DB HA/PITR, off-site backups | NOT STARTED (local restore rehearsal passed earlier; single-instance assumption is documented) |
| Infra | Public staging deployment | BLOCKED — needs owner approval of a paid host |
| CI | lint, typecheck, unit, integration, real-regtest, browser E2E+axe, container, secret scan, dependency audit | VERIFIED COMPLETE (hosted CI green at 97a0951) |
| CI | formatting gate, SBOM/provenance | NOT STARTED |
| Ops | Alert routing, dashboards, on-call | metrics exist; NOT WIRED |
| Compliance | Legal review of Terms/Privacy/pricing; regulatory analysis (Nigeria and target countries) | NOT STARTED — `docs/business/legal-regulatory-register.md`; privacy/terms/acceptable-use pages are unreviewed drafts |
| Data | Retention/deletion policy, DPA, subprocessor list | NOT STARTED (account closure + export exist) |
| Supply chain | Lockfile + 3-day release-age cooldown; `pnpm audit` hard gate in CI; gitleaks | VERIFIED COMPLETE; SBOM/provenance NOT STARTED |
