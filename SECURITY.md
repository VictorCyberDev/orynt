# Security policy

Orynt is pre-release software that moves (test) money. **It has not been independently audited.** Do not use it with mainnet or meaningful funds.

## Reporting a vulnerability
Please report privately — do not open a public issue. Use GitHub's "Report a vulnerability" (private security advisory) on this repository. Include steps to reproduce and the commit. We aim to acknowledge within 5 working days; this is a solo-maintained project, so no SLA is promised.

## In scope
Authorization/approval bypass, double-dispatch, state-machine bypass, cross-tenant access, receipt/verifier forgery or false acceptance, secret exposure, SSRF, injection.

## Out of scope
Findings that need a malicious database administrator or a compromised host, social engineering, DoS by volume, and the documented limitations in `docs/security/threat-model.md` (e.g. browser-stored approval key, application-level limits).

Threat model: `docs/security/threat-model.md`.
