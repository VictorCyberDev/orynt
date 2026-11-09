# Orynt public demo: free-tier deployment plan (NOT EXECUTED)

Status: draft source — video/deck unrendered; real-regtest evidence pending. **Nothing is deployed. There is no live URL. Devpost status: NOT SUBMITTED.**
Written 2026-11-09. **No deployment, purchase, account creation, domain registration or paid plan may happen without the owner's explicit approval.** Docker was unavailable in the build environment, so there is no Dockerfile, no compose file and no container image; everything below uses a native Node.js runtime and was never run.

## 1. Do you need a hosted URL at all?

`R` accepts "A MVP accessible through internet **(or a demo video)**". Orynt is regtest-only by design, so a hosted instance cannot show real Lightning anyway; it could at best show the simulator. **Recommended baseline: no hosted backend.** Submit repo + video + reproducible local steps (`demo-runbook.md`). Consider hosting only static artifacts (Option S below). A hosted multi-user sandbox (Options B/C) carries real risk (section 3) for little gain. Decision belongs to the owner.

## 2. Facts about the app that constrain hosting

| Fact | Source | Consequence |
|---|---|---|
| Long-running Fastify process with an in-process worker (`setInterval` every 2 s) for reconciliation, recovery and webhooks | `apps/api/src/worker.ts`, `server.ts` | Needs an always-on process. Serverless functions do not fit. Free web services that sleep after idle will pause reconciliation and webhooks |
| Simulators are in-process memory keyed by connection id ("no durable state") | `apps/api/src/services/providers.ts` | A restart or spin-down loses simulator-registered preimages; any simulated payment in flight afterwards cannot settle |
| Simulator and `/v1/dev/*` routes are refused when `ORYNT_ENV=production`; `ORYNT_FAILPOINTS=1` is refused in production | `config.ts`, `services/admin.ts`, `services/execution.ts` | A public simulator demo must run with a **non-production** `ORYNT_ENV`, which relaxes protections (next row) |
| `allowPrivateWebhookTargets = !prod`; dev-default secret/issuer keys derive from constants in the public source if `ORYNT_SECRET_KEY` / `ORYNT_ISSUER_KEY` are unset | `config.ts` | Non-production mode on the internet means weaker SSRF checks and guessable keys unless you set the keys explicitly |
| Registration is open (`POST /v1/auth/register`); LND connection `rest_url` is not SSRF-vetted | `routes.ts`, `services/admin.ts` | On a public host, any visitor can create a workspace and ask the server to call arbitrary URLs. Do not host a multi-tenant instance that can reach private networks or cloud metadata |
| Failpoints are one process-global table, not per workspace | `lib/failpoints.ts` | One visitor can arm a fault that hits another visitor's payout |
| Web console is built with Vite `base: "/app/"` and relies on a dev proxy from `/v1` and `/health` to the API. In the committed code the API serves no static files; an **uncommitted, unverified** change in `apps/api/src/http/app.ts` makes it serve `apps/web/dist` at `/app/` and `apps/site/dist` at `/` when they exist | `apps/web/vite.config.ts`, `git diff apps/api/src/http/app.ts` | Cookie sessions are `SameSite=Lax`, so the console must share an origin with the API. If that change is committed and works, one Node service can host both; confirm before relying on it |
| No `Dockerfile`; `pnpm build` currently fails at `@orynt/api` (missing `build.mjs`, as of 2026-11-09 15:12 UTC); `start` runs `tsx src/server.ts`, and `tsx` is a root devDependency | `package.json`, `apps/api/package.json` | A host must install devDependencies, or the API needs a proper build step first (to be added) |

## 3. What must NOT be deployed or enabled

1. **No mainnet.** `ORYNT_ALLOW_MAINNET` must stay unset; never connect a mainnet node.
2. **No real keys or funds anywhere near a demo host.** No real LND macaroons, no seed phrases, no node connection to a node holding value.
3. **No public regtest/LND credentials.** Never commit or publish `.regtest/`, macaroons, TLS keys, cookies or `.env` files. `.gitignore` already excludes `.regtest/`, `.env*`, `.pgdata/`.
4. **No default keys.** Never run a public host with the derived dev `ORYNT_SECRET_KEY` / `ORYNT_ISSUER_KEY`. Generate fresh random 32-byte hex values and keep them only in the host's secret store: `openssl rand -hex 32` (twice).
5. **No failpoints on a shared host** (`ORYNT_FAILPOINTS` must stay unset) unless the instance is single-user and short-lived. Without failpoints the simulator-minting dev route is also off, so a public sandbox cannot mint demo invoices (another reason not to host one).
6. **No open registration on an instance that can reach internal networks.** Fix the LND URL vetting first.
7. **No claims** that the hosted instance is real, production, audited or custodial-safe. Show the simulator/regtest badge permanently.
8. **No personal data** from real people. Demo accounts use `.invalid` addresses and generated passwords.
9. Do not use the receipt-issuer key of a demo host as a long-term trust root.

## 4. Options

Free-tier facts below were read from the vendors' pages on 2026-11-09 (cached copies) and can change; re-check before relying on them.

| Option | What it hosts | Cost | Main limits (verified 2026-11-09 from the cited page) | Verdict |
|---|---|---|---|---|
| **A. No hosting** (video + repo + local steps) | nothing | 0 | none | **Recommended baseline** |
| **S. Static-only site** (marketing site `apps/site`, deck PDF, sample receipts, the console's public "Verify a receipt" page if it builds as static files) | HTML/JS only; no API, no secrets | 0 on free static hosting (Render static sites, GitHub Pages, Vercel Hobby) | Render: static sites are free but count against monthly bandwidth/build minutes (render.com/docs/free). Vercel Hobby: "non-commercial, personal use only" (vercel.com/docs/plans/hobby). Whether `apps/site` and the verify page build is **unverified** (both are uncommitted work in progress) | Good optional extra. Zero attack surface beyond static files |
| **B. Render free web service + Render free Postgres** | API + worker, console proxy if added | 0, no card stated on the pages I read (verify at sign-up) | Free web service spins down after 15 minutes idle and takes about a minute to wake; 750 free instance hours per month; ephemeral filesystem; cannot send outbound SMTP ports; may be restarted at any time. **Free Postgres expires 30 days after creation** (14-day grace, then deleted), 1 GB, one per workspace, no backups (render.com/docs/free) | Possible for a short-lived sandbox only. Spin-down loses simulator state and pauses the reconciler |
| **C. Render free web service + Neon free Postgres** | API + worker on Render, database on Neon | 0 | Neon Free: no card, 1 GB storage per project, 100 CU-hours per month per project, compute scales to zero after 5 min idle, 5 GB egress per project per month (neon.com/pricing). Render limits as in B | Better than B for the database (no 30-day expiry). Same web-service caveats |
| **D. Vercel Hobby for API** | n/a | 0 | Serverless model, function duration limits (300 s on Hobby), no long-running worker, non-commercial terms | **Do not use** for the API/worker |
| **E. Owner's own machine/VPS + tunnel** | Everything, exposed only while demoing | 0 if hardware already owned | Unverified: tunnel services' free terms were not checked here | Reasonable for a live judging session; never leave running unattended |

Not evaluated: Fly.io, Railway, Koyeb, Cloudflare Pages/Workers, Deta-style hosts. Do not assume they are free.

## 5. Exact steps if the owner approves Option S (static only)

1. Confirm what builds: `pnpm --filter @orynt/site build` and `pnpm --filter @orynt/web build` (both unverified; the first writes into `apps/site`'s output directory, the second into `apps/web/dist`). Fix build errors first.
2. Pick one host. For Render: create an account (owner), choose "New → Static Site", connect the **public** GitHub repo, set the build command to the command above and the publish directory to the build output. For GitHub Pages: use a workflow or push the output to a `gh-pages` branch.
3. Confirm no secrets, `.env` or `.regtest` content is in the published directory: `grep -ri "macaroon\|BEGIN PRIVATE\|ORYNT_SECRET" <output dir>` must return nothing.
4. Add the badge "Working title. Regtest / test coins only." to every page. Open the URL logged out and from a phone.
5. Put the URL in Devpost only after step 4.

## 6. Exact steps if the owner approves Option B or C (hosted simulator sandbox, short-lived)

Only after the LND URL vetting fix exists and the API-serves-the-console change is committed and tested (section 2), and only for a limited window (for example the judging period), then delete it.

1. Generate secrets locally: `openssl rand -hex 32` twice (store in a password manager).
2. Database: Option B, create "New → Postgres → Free" on Render (note the 30-day expiry date in the checklist). Option C, create a Neon project (free), copy the pooled connection string.
3. Web service: "New → Web Service", connect the public repo, runtime Node 22, build `corepack enable && pnpm install --frozen-lockfile` (and `pnpm --filter @orynt/web build` plus `pnpm --filter @orynt/site build` if the API is to serve them), start `pnpm --filter @orynt/api start`. Make sure devDependencies are installed (the start script uses `tsx`).
4. Environment variables: `ORYNT_ENV=development` (required for the simulator; see section 3 for why this is risky), `DATABASE_URL=<from step 2>`, `ORYNT_SECRET_KEY=<hex>`, `ORYNT_ISSUER_KEY=<hex>`, `ORYNT_ALLOWED_ORIGINS=https://<your-host>`, `COOKIE_SECURE=1`, `HOST=0.0.0.0`, `PORT=<provided by host>`, `LOG_LEVEL=info`. Leave unset: `ORYNT_ALLOW_MAINNET`, `ORYNT_FAILPOINTS`.
5. Check `GET /health/ready` returns ok (it checks the database and migrations; migrations run at start).
6. Create the demo workspace and users by hand (generated passwords, `.invalid` emails). Do **not** use the `ORYNT_SEED_DEMO=1` seed on a public host: its password is public in the source. Note: without failpoints there is no way to mint simulator invoices, so a visitor cannot complete a payout, and with failpoints on, the shared-failpoint risk (section 2) applies. This is why a hosted sandbox is not recommended.
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
