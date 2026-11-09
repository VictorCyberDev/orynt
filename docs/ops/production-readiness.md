# Production readiness checklist — NOT READY FOR REAL FUNDS

Status: this build is a hackathon-stage foundation. **Do not use it with mainnet or meaningful funds.** Items:

| Area | Item | Status |
|---|---|---|
| Money safety | Invariants enforced in code + DB, adversarial test suite on real PostgreSQL | DONE (simulator wallet) |
| Money safety | Real LND adapter exercised against a real node | **NOT DONE** (`pnpm test:real-lightning`) |
| Money safety | Independent security audit / penetration test | **NOT DONE** |
| Money safety | Mainnet execution | **DISABLED** by design (`ORYNT_ALLOW_MAINNET` is not a supported production switch) |
| Secrets | `ORYNT_SECRET_KEY`/`ORYNT_ISSUER_KEY` from a secret manager; rotation procedure for the secret key (re-encrypt stored credentials) | key required at boot; **rotation tooling not built** |
| Auth | MFA/SSO, password reset, email verification, session management UI | **NOT BUILT** |
| Approvals | WebAuthn/hardware-backed approval keys | **NOT BUILT** (browser localStorage key) |
| Infra | Docker image build, TLS termination, multi-instance behaviour, DB HA/PITR, off-site backups | Dockerfile unverified; rest **NOT DONE** |
| Ops | Alert routing, dashboards, on-call | metrics exist; **NOT WIRED** |
| Compliance | Legal review of Terms/Privacy; regulatory analysis (Nigeria and target countries) | **NOT DONE** — see `docs/business/legal-regulatory-register.md` |
| Data | Retention/deletion, DPA, subprocessor list | **NOT DONE** |
| Supply chain | Lockfile + 3-day release-age cooldown; `pnpm audit` in CI (advisory) | partial; SBOM/provenance **NOT DONE** |
