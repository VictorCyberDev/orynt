import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import {
  OryntError,
  canonicalize,
  hasPermission,
  hmacSha256Hex,
  publicKeyFromPrivate,
  type Problem,
  type ProblemCode,
} from "@orynt/core";
import { buildOpenApi, routes, type RouteSpec } from "@orynt/contract";
import type { Config } from "../config";
import { createPool, type Db } from "../db/pool";
import { migrateUp } from "../db/migrate";
import { enableFailpoints } from "../lib/failpoints";
import { gauge, inc, render } from "../lib/metrics";
import { principalFromApiKey, principalFromSession, type Principal } from "../services/auth";
import type { Ctx, Deps } from "../services/context";
import { handlers, type HandlerArgs } from "./handlers";
import { registerDevRoutes } from "./dev";
import { registerStaff } from "./staff";
import { registerProviderCallbacks } from "./callbacks";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
    spec?: RouteSpec;
  }
}

const PROBLEM_TITLES: Record<string, string> = {
  validation_failed: "Validation failed",
  unauthenticated: "Authentication required",
  forbidden: "Not allowed",
  not_found: "Not found",
  conflict: "Conflict",
  idempotency_conflict: "Idempotency key reused with a different request",
  rate_limited: "Too many requests",
  invalid_state: "Not possible in the current state",
  policy_violation: "Policy violation",
  invoice_invalid: "Invalid invoice",
  invoice_expired: "Invoice expired",
  network_mismatch: "Network mismatch",
  amount_mismatch: "Amount mismatch",
  destination_mismatch: "Destination mismatch",
  approval_invalid: "Approval invalid",
  approval_stale: "Approval stale",
  approval_insufficient: "Not enough valid approvals",
  wallet_unavailable: "Wallet unavailable",
  wallet_insufficient_permissions: "Wallet permissions insufficient",
  mainnet_disabled: "Mainnet disabled",
  send_blocked_unresolved: "Sending is blocked",
  internal: "Internal error",
};

export interface BuiltApp {
  app: ReturnType<typeof Fastify>;
  deps: Deps;
  pool: Db;
}

export async function buildApp(
  config: Config,
  opts: { pool?: Db; migrate?: boolean } = {},
): Promise<BuiltApp> {
  enableFailpoints(config.failpoints);
  const pool = opts.pool ?? createPool(config.databaseUrl);
  if (opts.migrate !== false) await migrateUp(pool);
  const issuerPublicKey = publicKeyFromPrivate(config.issuerPrivateKey);
  const issuerKeyId = "orynt-" + issuerPublicKey.slice(0, 8);
  await pool.query("INSERT INTO issuer_keys(key_id,public_key) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
    issuerKeyId,
    issuerPublicKey,
  ]);

  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            // one-time tokens travel in query strings (e-mailed links); never write them to logs
            serializers: {
              req: (r: { method?: string; url?: string; hostname?: string; ip?: string }) => ({
                method: r.method,
                url: (r.url ?? "").split("?")[0],
                host: r.hostname,
                remoteAddress: r.ip,
              }),
            },
            // never log credentials, cookies, macaroons, invoices' secrets or signing secrets
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers['set-cookie']",
                "*.macaroon_hex",
                "*.password",
                "*.temporary_password",
                "*.tls_cert_pem",
                "*.secret",
                "*.signing_secret",
              ],
              censor: "[redacted]",
            },
          },
    genReqId: (req) => {
      const h = req.headers["x-request-id"];
      return typeof h === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(h) ? h : randomUUID();
    },
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
  });
  const log = {
    info: (o: object, m?: string) => app.log.info(o, m),
    warn: (o: object, m?: string) => app.log.warn(o, m),
    error: (o: object, m?: string) => app.log.error(o, m),
  };
  const deps: Deps = { pool, config, issuerPublicKey, issuerKeyId, log };

  // Tolerate an empty body sent with a JSON content-type (common with curl and SDKs on body-less POSTs); malformed JSON is still a 400.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = String(body);
    (_req as unknown as { rawBody?: string }).rawBody = text; // billing webhook signatures are computed over the exact bytes
    if (text.trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error("Request body is not valid JSON.") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMinute,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
    // the abuse limiter protects the API; static pages/assets (cheap, cacheable) must not consume or be blocked by it
    allowList: (req) => !req.url.startsWith("/v1/") && !req.url.startsWith("/metrics"),
  });

  app.setSerializerCompiler(
    () => (data) => JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "no-store");
    reply.header("referrer-policy", "no-referrer");
    if (config.cookieSecure) reply.header("strict-transport-security", "max-age=15552000; includeSubDomains");
  });

  const problem = (
    reply: FastifyReply,
    req: FastifyRequest,
    status: number,
    code: ProblemCode,
    detail: string,
    extra: Partial<Problem> = {},
  ) =>
    reply
      .status(status)
      .type("application/problem+json")
      .send({
        type: config.problemBaseUrl ? `${config.problemBaseUrl}/${code}` : `urn:orynt:problem:${code}`,
        title: PROBLEM_TITLES[code] ?? code,
        status,
        code,
        detail,
        instance: req.url.split("?")[0],
        request_id: req.id,
        ...extra,
      });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof OryntError) {
      inc("orynt_http_problems_total", { code: err.code });
      return problem(
        reply,
        req,
        err.status,
        err.code,
        err.message,
        err.extra ? ({ ...err.extra } as Partial<Problem>) : {},
      );
    }
    if (err instanceof ZodError)
      return problem(reply, req, 422, "validation_failed", "The request is not valid.", {
        errors: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 429)
      return problem(reply, req, 429, "rate_limited", "Too many requests. Slow down and retry shortly.");
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500)
      return problem(
        reply,
        req,
        e.statusCode,
        e.statusCode === 413 ? "validation_failed" : "validation_failed",
        e.statusCode === 413 ? "Request body too large." : e.message,
      );
    app.log.error({ err: { message: e.message, code: e.code }, reqId: req.id }, "unhandled error");
    if (e.code === "23505") return problem(reply, req, 409, "conflict", "That conflicts with existing data.");
    return problem(
      reply,
      req,
      500,
      "internal",
      "Something went wrong on our side. Nothing was changed unless the response says so.",
    );
  });
  // ---- static front ends (built by `pnpm build`): the marketing site at / and the app at /app/ ------------------------------
  const here = dirname(fileURLToPath(import.meta.url));
  // works both from source (apps/api/src/http) and from the bundle (apps/api/dist): take the first candidate that really holds an index.html
  const pick = (envVal: string | undefined, name: string) =>
    resolve(
      envVal ??
        [
          join(here, "../../../" + name + "/dist"),
          join(here, "../../" + name + "/dist"),
          join(here, "../../../../apps/" + name + "/dist"),
        ].find((c) => existsSync(join(c, "index.html"))) ??
        join(here, "../../../" + name + "/dist"),
    );
  const webDist = pick(process.env["ORYNT_WEB_DIST"], "web");
  const siteDist = pick(process.env["ORYNT_SITE_DIST"], "site");
  const CSP =
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  app.addHook("onSend", async (_req, reply) => {
    if (String(reply.getHeader("content-type") ?? "").startsWith("text/html")) {
      reply.header("content-security-policy", CSP);
      reply.header("x-frame-options", "DENY");
    }
  });
  const hasWeb = existsSync(join(webDist, "index.html")),
    hasSite = existsSync(join(siteDist, "index.html"));
  if (hasSite)
    await app.register(fastifyStatic, {
      root: siteDist,
      prefix: "/",
      decorateReply: false,
      cacheControl: false,
      setHeaders: (res) => {
        res.header("cache-control", "public, max-age=300");
      },
    });
  if (hasWeb)
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/app/",
      decorateReply: false,
      wildcard: false,
      setHeaders: (res, p) => {
        res.header(
          "cache-control",
          p.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0] ?? "";
    if (
      hasWeb &&
      req.method === "GET" &&
      path.startsWith("/app") &&
      !path.startsWith("/app/assets/") &&
      !/\.[A-Za-z0-9]{1,6}$/.test(path)
    )
      return reply
        .type("text/html")
        .header("cache-control", "no-cache")
        .send(readFileSync(join(webDist, "index.html")));
    return problem(reply, req, 404, "not_found", "No such endpoint.");
  });

  // ---- contract-driven routes ---------------------------------------------------------------------------------------
  const setSession = (reply: FastifyReply, token: string) =>
    reply.setCookie("orynt_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: config.cookieSecure,
      maxAge: 12 * 3600,
    });

  async function authenticate(req: FastifyRequest): Promise<Principal | null> {
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) return principalFromApiKey(deps, h.slice(7).trim());
    const tok = req.cookies["orynt_session"];
    return tok ? principalFromSession(deps, tok) : null;
  }
  function csrfOk(req: FastifyRequest, p: Principal): boolean {
    if (p.auth !== "session") return true; // bearer tokens are not ambient credentials
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) return false;
    const t = req.headers["x-csrf-token"];
    if (typeof t !== "string" || !p.csrf) return false;
    const a = Buffer.from(t),
      b = Buffer.from(p.csrf);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  for (const spec of routes) {
    const rateCfg =
      spec.rate === "auth"
        ? { max: 15, timeWindow: "1 minute" }
        : spec.rate === "public"
          ? { max: 60, timeWindow: "1 minute" }
          : undefined;
    app.route({
      method: spec.method,
      url: spec.path,
      config: rateCfg ? { rateLimit: rateCfg } : {},
      handler: async (req, reply) => {
        req.spec = spec;
        let principal: Principal | null = null;
        if (spec.auth !== "public") {
          principal = await authenticate(req);
          if (!principal)
            return problem(reply, req, 401, "unauthenticated", "Sign in or provide a valid API key.");
          if (spec.method !== "GET" && !spec.noCsrf && !csrfOk(req, principal))
            return problem(reply, req, 403, "forbidden", "Missing or invalid CSRF token.");
          if (spec.auth !== "any" && !hasPermission(principal.role, spec.auth))
            return problem(
              reply,
              req,
              403,
              "forbidden",
              `Your role (${principal.role}) is not allowed to do this.`,
            );
          req.principal = principal;
        } else if (spec.method !== "GET" && !spec.noCsrf) {
          // public state-changing routes are marked noCsrf explicitly; reaching here means a spec bug — fail closed
          return problem(reply, req, 403, "forbidden", "CSRF protection required.");
        }
        const params = spec.params ? spec.params.parse(req.params) : {};
        const query = spec.query ? spec.query.parse(req.query) : {};
        const body = spec.body ? spec.body.parse(req.body ?? {}) : undefined;
        const ctx: Ctx | null = principal
          ? { orgId: principal.orgId, actor: principal.actor, reqId: req.id }
          : null;
        const args: HandlerArgs = {
          deps,
          ctx,
          principal,
          params: params as Record<string, string>,
          query: query as Record<string, any>,
          body: body as any,
          req,
          reply,
          setSession,
        };
        const handler = handlers[spec.id];
        if (!handler) return problem(reply, req, 501, "internal", "Not implemented.");

        const run = async () => handler(args);
        // ---- idempotency ----
        const idemHeader = req.headers["idempotency-key"];
        if (spec.idempotency && principal) {
          const key = typeof idemHeader === "string" ? idemHeader : undefined;
          if (!key && spec.idempotency === "required")
            return problem(
              reply,
              req,
              400,
              "validation_failed",
              "This operation requires an Idempotency-Key header (8–120 characters). Reuse the same key when retrying.",
            );
          if (key) {
            if (key.length < 8 || key.length > 120)
              return problem(
                reply,
                req,
                400,
                "validation_failed",
                "Idempotency-Key must be 8–120 characters.",
              );
            const scope = `${spec.method} ${req.url.split("?")[0]}`;
            const hash = createHash("sha256")
              .update(canonicalize({ params, body: body ?? null }))
              .digest("hex");
            const ins = await pool.query(
              "INSERT INTO idempotency_keys(org_id,scope,key,request_hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING 1",
              [principal.orgId, scope, key, hash],
            );
            if (!ins.rowCount) {
              const ex = (
                await pool.query("SELECT * FROM idempotency_keys WHERE org_id=$1 AND scope=$2 AND key=$3", [
                  principal.orgId,
                  scope,
                  key,
                ])
              ).rows[0];
              if (ex.request_hash !== hash)
                return problem(
                  reply,
                  req,
                  422,
                  "idempotency_conflict",
                  "This Idempotency-Key was already used with a different request.",
                );
              if (ex.status === "completed") {
                reply.header("idempotent-replayed", "true");
                return reply.status(ex.response_status).send(ex.response_body);
              }
              return problem(
                reply,
                req,
                409,
                "conflict",
                "A request with this Idempotency-Key is still being processed. Wait and retry with the same key.",
              );
            }
            try {
              const out = await run();
              const status = out.status ?? spec.success.status;
              await pool.query(
                "UPDATE idempotency_keys SET status='completed', response_status=$4, response_body=$5 WHERE org_id=$1 AND scope=$2 AND key=$3",
                [
                  principal.orgId,
                  scope,
                  key,
                  status,
                  JSON.stringify(out.body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
                ],
              );
              return reply.status(status).send(out.body);
            } catch (e) {
              await pool
                .query(
                  "DELETE FROM idempotency_keys WHERE org_id=$1 AND scope=$2 AND key=$3 AND status='in_progress'",
                  [principal.orgId, scope, key],
                )
                .catch(() => {});
              throw e;
            }
          }
        }
        const out = await run();
        if ((out as { contentType?: string }).contentType)
          reply.type((out as { contentType?: string }).contentType!);
        return reply.status(out.status ?? spec.success.status).send(out.body);
      },
    });
  }

  // ---- ops ----------------------------------------------------------------------------------------------------------------
  const openapi = buildOpenApi();
  app.get("/v1/openapi.json", async () => openapi);
  gauge("orynt_unresolved_payments", async () =>
    Number(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM payout_obligations WHERE state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING')",
        )
      ).rows[0].n,
    ),
  );
  gauge("orynt_oldest_unresolved_payment_age_seconds", async () =>
    Number(
      (
        await pool.query(
          "SELECT COALESCE(extract(epoch FROM now()-min(state_changed_at)),0)::int AS n FROM payout_obligations WHERE state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING')",
        )
      ).rows[0].n,
    ),
  );
  gauge("orynt_webhook_deliveries_pending", async () =>
    Number(
      (await pool.query("SELECT count(*)::int AS n FROM webhook_deliveries WHERE status='pending'")).rows[0]
        .n,
    ),
  );
  app.get("/metrics", async (req, reply) => {
    const token = process.env["ORYNT_METRICS_TOKEN"];
    const given = Buffer.from(String(req.headers.authorization ?? "")),
      want = Buffer.from(`Bearer ${token ?? ""}`);
    const okToken = !!token && given.length === want.length && timingSafeEqual(given, want);
    // Behind a reverse proxy every client can look like loopback, so in production the token is the ONLY way in; loopback access is a development convenience.
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip);
    if (!okToken && !(config.env !== "production" && loopback))
      return problem(reply, req, 403, "forbidden", "Metrics are restricted.");
    return reply.type("text/plain; version=0.0.4").send(await render());
  });
  registerProviderCallbacks(app, deps, problem);
  registerStaff(app, deps, problem);
  if (config.failpoints) registerDevRoutes(app, deps, authenticate, problem);
  void hmacSha256Hex;
  return { app, deps, pool };
}
