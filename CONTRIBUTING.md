# Contributing

1. `pnpm install` (Node ≥ 22, pnpm 10). A package release-age cooldown (3 days) is configured in `pnpm-workspace.yaml`.
2. `pnpm db:start` (local PostgreSQL 16) — tests need a real database; set `TEST_ADMIN_DATABASE_URL` if yours differs.
3. Before a PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`. UI changes: `pnpm --filter @orynt/web build && node apps/web/e2e/run.cjs`.
4. **Rules of the road for money-path code:** no floats for money; no state change without `cas()`; no wallet call outside `executeObligation`; every new failure mode needs a test that asserts the *state and the database*, not just the HTTP status; never weaken or skip a test to get green.
5. Don't invent claims in docs/UI/site: describe a capability as built only if the register says VERIFIED.
6. Licensed under Apache-2.0; by contributing you agree your contribution is under that licence.
