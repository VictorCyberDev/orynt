# Deployment templates (NOT DEPLOYED — requires owner approval)

Nothing in this repository has been deployed, and no paid service was provisioned. Before any public deployment:
1. Decide the eligibility/name questions in `docs/hackathon/submission-checklist.md`.
2. A public demo must run **simulator or regtest only**. Never set `ORYNT_ALLOW_MAINNET=1`; never put real wallet credentials in a hosted demo.
3. Production mode requires `ORYNT_SECRET_KEY` and `ORYNT_ISSUER_KEY` (the server refuses to start without them) and refuses `ORYNT_FAILPOINTS`/`ORYNT_SEED_DEMO`. The simulator wallet is also refused in production, so a *public* demo cannot use `ORYNT_ENV=production`; host it as `development` behind a banner, or demo from a video.
4. Free-tier options and exact steps: `docs/hackathon/deployment-plan.md`.

**Public-demo warning:** both templates set `ORYNT_SEED_DEMO=1`, which creates accounts with the publicly documented password `demo-password-123`. A hosted copy is therefore an open, simulator-only sandbox — never connect a real wallet to it, and do not host it under a real organisation name without removing the seed.

`render.yaml` and `fly.toml` below are UNTESTED templates; free-tier availability and limits were not verified.
