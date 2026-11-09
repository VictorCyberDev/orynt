# Orynt public demo: free-tier deployment plan (NOT EXECUTED)

Status: draft source — video/deck unrendered; real-regtest evidence pending. **Nothing is deployed. There is no live URL. Devpost status: NOT SUBMITTED.**
Reconciled 2026-11-09 with the committed branch (HEAD `78990af`). **No deployment, purchase, account creation, domain registration or paid plan may happen without the owner's explicit approval.** **Docker was unavailable in the build environment.** A `Dockerfile`, `infra/docker-compose.yml` and templates `infra/deploy/render.yaml` and `infra/deploy/fly.toml` now exist, but the image was never built and the templates were never used: treat all of them as UNVERIFIED. Native Node commands below are also unexecuted on any host.

## 1. Do you need a hosted URL at all?

`R` accepts "A MVP accessible through internet **(or a demo video)**". Orynt is regtest-only by design, so a hosted instance cannot show real Lightning anyway; it could at best show the simulator. **Recommended baseline: no hosted backend.** Submit repo + video + reproducible local steps (`demo-runbook.md`). Consider hosting only static artifacts (Option S below). A hosted multi-user sandbox (Options B/C) carries real risk (section 3) for little gain. Decision belongs to the owner.

## 2. Facts about the app that constrain hosting

| Fact | Source | Consequence |
|---|---|---|
| Long-running Fastify process with an in-process worker (`setInterval`, every 2 s) for reconciliation, recovery and webhooks | `apps/api/src/worker.ts`, `server.ts` | Needs an always-on process. Serverless functions do not fit. Free web services that sleep after idle pause reconciliation and webhooks |
| Simulators are in-process memory keyed by connection id | `apps/api/src/services/providers.ts` | A restart or spin-down loses simulator-registered preimages; simulated payments in flight afterwards cannot settle |
| `ORYNT_ENV` is mandatory (server refuses to start without it). **Production refuses the simulator wallet, failpoints and the demo seed** | `apps/api/src/config.ts`, `services/admin.ts`, `server.ts` | A *public* instance in production mode cannot demonstrate any payment (no simulator, no real wallet). A simulator demo must run in `development`, which relaxes protections (next rows) |
| In non-production, private webhook/LND targets are allowed and dev-default secret and issuer keys are derived from constants in the public source if `ORYNT_SECRET_KEY` / `ORYNT_ISSUER_KEY` are unset | `config.ts`, `lib/ssrf.ts` | Non-production on the internet means guessable keys unless you set them explicitly, and weaker SSRF checks |
| Registration is open (`POST /v1/auth/register`) | `routes.ts` | Any visitor can create a workspace. LND `rest_url` is now SSRF-vetted (production rules refuse private addresses), but in development mode it is not |
| The demo seed has a fixed public password (`demo-password-123`) | `apps/api/src/seed.ts` | Never seed a host that is reachable by others |
| Failpoints are one process-global table, not per workspace | `lib/failpoints.ts` | One visitor can arm a fault that hits another visitor's payout |
| The API now serves the marketing site (`apps/site/dist`) at `/` and the app (`apps/web/dist`) at `/app/` when built; `pnpm build:all` builds everything and `pnpm start` runs `node apps/api/dist/server.mjs` | `apps/api/src/http/app.ts`, `package.json`, `apps/api/build.mjs` | One Node service can host everything on one origin (needed because cookies are `SameSite=Lax`). Unverified on any host |
| `Dockerfile` builds with `pnpm build:all` and runs as `ORYNT_ENV=production` as a non-root user; `infra/deploy/render.yaml` overrides `ORYNT_ENV=development` and sets `ORYNT_SEED_DEMO=1` | `Dockerfile`, `infra/deploy/render.yaml` | **The Render template as written would publish the public seed password and does not set `ORYNT_ISSUER_KEY`. Do not use it unchanged** |

## 3. What must NOT be deployed or enabled

1. **No mainnet.** `ORYNT_ALLOW_MAINNET` must stay unset; never connect a mainnet node.
2. **No real keys or funds anywhere near a demo host.** No real LND macaroons, no seed phrases, no node connection to a node holding value.
3. **No public regtest/LND credentials.** Never commit or publish `.regtest/`, macaroons, TLS keys, cookies or `.env` files. `.gitignore` already excludes `.regtest/`, `.env*`, `.pgdata/`.
4. **No default keys.** Never run a public host with the derived dev `ORYNT_SECRET_KEY` / `ORYNT_ISSUER_KEY`. Generate fresh random 32-byte hex values and keep them only in the host's secret store: `openssl rand -hex 32` (twice).
5. **No failpoints on a shared host** (`ORYNT_FAILPOINTS` must stay unset) unless the instance is single-user and short-lived. Without failpoints the simulator-minting dev route is also off, so a public sandbox cannot mint demo invoices (another reason not to host one).
5a. **No `ORYNT_SEED_DEMO=1` on any reachable host** (public password).
6. **No open registration on a development-mode instance that can reach internal networks** (private targets are allowed outside production).
7. **No claims** that the hosted instance is real, production, audited or custodial-safe. Show the simulator/regtest badge permanently.
8. **No personal data** from real people. Demo accounts use `.invalid` addresses and generated passwords.
9. Do not use the receipt-issuer key of a demo host as a long-term trust root.

## 4. Options

Free-tier facts below were read from the vendors' pages on 2026-11-09 (cached copies) and can change; re-check before relying on them.

| Option | What it hosts | Cost | Main limits (verified 2026-11-09 from the cited page) | Verdict |
|---|---|---|---|---|
| **A. No hosting** (video + repo + local steps) | nothing | 0 | none | **Recommended baseline** |
| **S. Static-only site** (marketing site `apps/site`, deck PDF, sample receipts, the console's public "Verify a receipt" page if it builds as static files) | HTML/JS only; no API, no secrets | 0 on free static hosting (Render static sites, GitHub Pages, Vercel Hobby) | Render: static sites are free but count against monthly bandwidth/build minutes (render.com/docs/free). Vercel Hobby: "non-commercial, personal use only" (vercel.com/docs/plans/hobby). `apps/site` (12 pages) and the web app's verify-receipt page build per the register; a static host must serve `apps/web/dist` under `/app/` | Good optional extra. Zero attack surface beyond static files |
| **B. Render free web service + Render free Postgres** | API + worker, console proxy if added | 0, no card stated on the pages I read (verify at sign-up) | Free web service spins down after 15 minutes idle and takes about a minute to wake; 750 free instance hours per month; ephemeral filesystem; cannot send outbound SMTP ports; may be restarted at any time. **Free Postgres expires 30 days after creation** (14-day grace, then deleted), 1 GB, one per workspace, no backups (render.com/docs/free) | Possible for a short-lived sandbox only. Spin-down loses simulator state and pauses the reconciler |
| **C. Render free web service + Neon free Postgres** | API + worker on Render, database on Neon | 0 | Neon Free: no card, 1 GB storage per project, 100 CU-hours per month per project, compute scales to zero after 5 min idle, 5 GB egress per project per month (neon.com/pricing). Render limits as in B | Better than B for the database (no 30-day expiry). Same web-service caveats |
| **D. Vercel Hobby for API** | n/a | 0 | Serverless model, function duration limits (300 s on Hobby), no long-running worker, non-commercial terms | **Do not use** for the API/worker |
| **E. Owner's own machine/VPS + tunnel** | Everything, exposed only while demoing | 0 if hardware already owned | Unverified: tunnel services' free terms were not checked here | Reasonable for a live judging session; never leave running unattended |

Not evaluated: Fly.io, Railway, Koyeb, Cloudflare Pages/Workers, Deta-style hosts. Do not assume they are free.

## 5. Exact steps if the owner approves Option S (static only)

1. Build: `pnpm --filter @orynt/site build` (output `apps/site/dist`) and, for the public receipt-verifier page, `pnpm --filter @orynt/web build` (output `apps/web/dist`, base path `/app/`). The register reports the site build, link check (0 broken) and claims check passing; the static-host publish itself is unverified.
2. Pick one host. For Render: create an account (owner), choose "New → Static Site", connect the **public** GitHub repo, set the build command to the command above and the publish directory to the build output. For GitHub Pages: use a workflow or push the output to a `gh-pages` branch.
3. Confirm no secrets, `.env` or `.regtest` content is in the published directory: `grep -ri "macaroon\|BEGIN PRIVATE\|ORYNT_SECRET" <output dir>` must return nothing.
4. Add the badge "Working title. Regtest / test coins only." to every page. Open the URL logged out and from a phone.
5. Put the URL in Devpost only after step 4.

## 6. Exact steps if the owner approves Option B or C (hosted simulator sandbox, short-lived)

Only if the owner accepts the risks in section 2 (a development-mode instance on the internet), and only for a limited window (for example the judging period), then delete it.

1. Generate secrets locally: `openssl rand -hex 32` twice (store in a password manager).
2. Database: Option B, create "New → Postgres → Free" on Render (note the 30-day expiry date in the checklist). Option C, create a Neon project (free), copy the pooled connection string.
3. Web service: either (a) native Node: runtime Node 22, build `corepack enable && pnpm install --frozen-lockfile && pnpm build:all`, start `pnpm start` (runs `node apps/api/dist/server.mjs`); or (b) Docker, using `Dockerfile` (never built; note it sets `ORYNT_ENV=production`, so you must override it to `development` for a simulator sandbox). Do not use `infra/deploy/render.yaml` unchanged (section 2).
4. Environment variables: `ORYNT_ENV=development` (required for the simulator), `DATABASE_URL=<from step 2>`, `ORYNT_SECRET_KEY=<hex>`, `ORYNT_ISSUER_KEY=<hex>`, `ORYNT_ALLOWED_ORIGINS=https://<your-host>`, `COOKIE_SECURE=1`, `HOST=0.0.0.0`, `PORT=<provided by host>`, `LOG_LEVEL=info`. Leave unset: `ORYNT_ALLOW_MAINNET`, `ORYNT_FAILPOINTS`, `ORYNT_SEED_DEMO`.
5. Check `GET /health/ready` returns ok (it checks the database and migrations; migrations run at start).
6. Create the demo workspace and users by hand (generated passwords, `.invalid` emails). Do **not** use the `ORYNT_SEED_DEMO=1` seed on a public host (public password). Without failpoints there is no way to mint simulator invoices, so a visitor cannot complete a payout, and with failpoints on, the shared-failpoint risk (section 2) applies. This is why a hosted sandbox is not recommended.
7. After the judging period: delete the service and database, rotate/discard the keys.

## 7. Costs and approvals

| Item | Cost | Needs owner approval |
|---|---|---|
| Option A | 0 | no |
| Option S | 0 (free static tier) | yes: account creation and publishing |
| Option B/C | 0 if limits are respected; Render bills for overages of bandwidth/build minutes only if a payment method is on file (render.com/docs/free); do not add a card | yes |
| Custom domain | not free (`orynt.com` is listed for sale at a high price in `docs/brand/name-clearance.md`; do not buy anything) | yes, and not recommended before trademark work |
| Paid tiers | out of scope | yes |

## 8. Checklist before any deployment

- [ ] Owner approved the option in writing (chat is enough, record the date)
- [ ] No secrets in the published directory or repo (`git grep -i macaroon` and a secret scanner)
- [ ] Badge visible: working title, regtest/simulator, not production
- [ ] Teardown date set
- [ ] URL tested logged out; nothing there contradicts the Devpost text
