import { createHmac } from "node:crypto";

export type Env = "development" | "test" | "production";
export interface Config {
  env: Env;
  port: number;
  host: string;
  databaseUrl: string;
  secretKey: Buffer; // 32 bytes: encrypts wallet credentials and webhook secrets at rest
  issuerPrivateKey: string; // ed25519 hex: signs receipts and audit checkpoints
  allowMainnet: boolean;
  failpoints: boolean;
  workerEnabled: boolean;
  workerIntervalMs: number;
  cookieSecure: boolean;
  allowedOrigins: string[];
  allowPrivateWebhookTargets: boolean;
  logLevel: string;
  sendTimeoutSeconds: number;
  rateLimitPerMinute: number;
  trustProxy: boolean;
  /** true: on startup every DISPATCHING payout is immediately treated as interrupted (safe only if no other instance can be mid-call). false: use the age threshold. */
  assumeSingleInstance: boolean;
  requireEmailVerification: boolean;
  /** plan assigned to new workspaces; anything but "developer" is refused in production */
  defaultPlan: string;
  appBaseUrl: string;
  /** Base for RFC 9457 problem `type` URIs. Null → non-resolvable URN `urn:orynt:problem:<code>` (never a domain we do not control). Set to an https URL on a domain you own once docs are hosted there. */
  problemBaseUrl: string | null;
  mailProvider: "log" | "resend" | "brevo";
  resendApiKey: string | null;
  brevoApiKey: string | null;
  /** override the provider API base URL (tests point this at a local controlled service) */
  mailApiUrl: string | null;
  mailWebhookSecret: string | null;
  mailFrom: string;
  billingProvider: "sandbox" | "stripe" | "paystack";
  billingWebhookSecret: string | null;
  billingApiKey: string | null;
  reconcileInitialDelaySeconds: number;
}

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): Config {
  // Docker Compose and shells pass unset variables as "": an empty value means "not set", never a real setting (a blank mail sender, a blank billing provider).
  const e: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  );
  if (!e["ORYNT_ENV"])
    throw new Error(
      "ORYNT_ENV must be set explicitly (development | test | production). Refusing to guess: the development defaults use publicly known keys.",
    );
  const env = e["ORYNT_ENV"] as Env;
  if (!["development", "test", "production"].includes(env))
    throw new Error("ORYNT_ENV must be development|test|production");
  const prod = env === "production";
  let secretHex = e["ORYNT_SECRET_KEY"];
  if (!secretHex) {
    if (prod) throw new Error("ORYNT_SECRET_KEY (64 hex chars) is required in production");
    secretHex = createHmac("sha256", "orynt-dev-only").update("secret-key").digest("hex"); // deterministic DEV key; never for real funds
  }
  if (!/^[0-9a-f]{64}$/.test(secretHex)) throw new Error("ORYNT_SECRET_KEY must be 64 hex chars");
  let issuer = e["ORYNT_ISSUER_KEY"];
  if (!issuer) {
    if (prod) throw new Error("ORYNT_ISSUER_KEY (64 hex chars) is required in production");
    issuer = createHmac("sha256", "orynt-dev-only").update("issuer-key").digest("hex");
  }
  if (!/^[0-9a-f]{64}$/.test(issuer)) throw new Error("ORYNT_ISSUER_KEY must be 64 hex chars");
  const failpoints = e["ORYNT_FAILPOINTS"] === "1";
  if (failpoints && prod) throw new Error("ORYNT_FAILPOINTS must not be enabled in production");
  const allowMainnet = e["ORYNT_ALLOW_MAINNET"] === "1";
  // Fail closed: a production process with placeholder providers would look healthy while billing nothing and e-mailing nobody.
  // Staging that deliberately runs uncommissioned providers must say so explicitly.
  if (prod && e["ORYNT_ALLOW_UNCOMMISSIONED"] !== "1") {
    const missing: string[] = [];
    if ((e["ORYNT_BILLING_PROVIDER"] ?? "sandbox") === "sandbox")
      missing.push("ORYNT_BILLING_PROVIDER (still the sandbox: no real billing)");
    if ((e["ORYNT_MAIL_PROVIDER"] ?? "log") === "log")
      missing.push("ORYNT_MAIL_PROVIDER (still 'log': no mail is ever sent)");
    if (!/^https:\/\//.test(e["ORYNT_APP_URL"] ?? ""))
      missing.push("ORYNT_APP_URL (must be the public https URL used in e-mailed links)");
    if (missing.length)
      throw new Error(
        `Refusing to start in production with uncommissioned settings: ${missing.join("; ")}. Configure them, or set ORYNT_ALLOW_UNCOMMISSIONED=1 for a staging environment that knowingly runs without them.`,
      );
  }
  if (prod && (e["ORYNT_DEFAULT_PLAN"] ?? "developer") !== "developer")
    throw new Error(
      "ORYNT_DEFAULT_PLAN must be developer in production: paid plans are granted only by verified billing events",
    );
  return {
    env,
    port: Number(e["PORT"] ?? 8787),
    host: e["HOST"] ?? "127.0.0.1",
    databaseUrl: e["DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_dev",
    secretKey: Buffer.from(secretHex, "hex"),
    issuerPrivateKey: issuer,
    allowMainnet,
    failpoints,
    workerEnabled: e["ORYNT_WORKER"] !== "0",
    workerIntervalMs: Number(e["ORYNT_WORKER_INTERVAL_MS"] ?? 2000),
    cookieSecure: prod || e["COOKIE_SECURE"] === "1",
    allowedOrigins: (
      e["ORYNT_ALLOWED_ORIGINS"] ?? "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8787"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    allowPrivateWebhookTargets: !prod,
    logLevel: e["LOG_LEVEL"] ?? (env === "test" ? "silent" : "info"),
    trustProxy: e["ORYNT_TRUST_PROXY"] === "1",
    defaultPlan: e["ORYNT_DEFAULT_PLAN"] ?? "developer",
    requireEmailVerification: (e["ORYNT_REQUIRE_EMAIL_VERIFICATION"] ?? (prod ? "1" : "0")) === "1",
    appBaseUrl: e["ORYNT_APP_URL"] ?? "http://127.0.0.1:8787",
    problemBaseUrl: e["ORYNT_PROBLEM_BASE_URL"]?.replace(/\/+$/, "") ?? null,
    mailProvider: (e["ORYNT_MAIL_PROVIDER"] ?? "log") as "log" | "resend" | "brevo",
    resendApiKey: e["RESEND_API_KEY"] ?? null,
    brevoApiKey: e["BREVO_API_KEY"] ?? null,
    mailApiUrl: e["ORYNT_MAIL_API_URL"]?.replace(/\/+$/, "") ?? null,
    mailWebhookSecret: e["ORYNT_MAIL_WEBHOOK_SECRET"] ?? null,
    mailFrom: e["ORYNT_MAIL_FROM"] ?? "Orynt <no-reply@orynt.example>",
    billingProvider: (e["ORYNT_BILLING_PROVIDER"] ?? "sandbox") as "sandbox" | "stripe" | "paystack",
    billingWebhookSecret: e["ORYNT_BILLING_WEBHOOK_SECRET"] ?? null,
    billingApiKey: e["ORYNT_BILLING_API_KEY"] ?? null,
    assumeSingleInstance: (e["ORYNT_ASSUME_SINGLE_INSTANCE"] ?? (prod ? "0" : "1")) === "1",
    rateLimitPerMinute: Number(e["ORYNT_RATE_LIMIT_PER_MIN"] ?? 600),
    sendTimeoutSeconds: Number(e["ORYNT_SEND_TIMEOUT_SECONDS"] ?? 30),
    reconcileInitialDelaySeconds: Number(e["ORYNT_RECONCILE_INITIAL_DELAY_SECONDS"] ?? 10),
  };
}
