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
  reconcileInitialDelaySeconds: number;
}

export function loadConfig(e: NodeJS.ProcessEnv = process.env): Config {
  if (!e["ORYNT_ENV"]) throw new Error("ORYNT_ENV must be set explicitly (development | test | production). Refusing to guess: the development defaults use publicly known keys.");
  const env = e["ORYNT_ENV"] as Env;
  if (!["development", "test", "production"].includes(env)) throw new Error("ORYNT_ENV must be development|test|production");
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
  return {
    env, port: Number(e["PORT"] ?? 8787), host: e["HOST"] ?? "127.0.0.1",
    databaseUrl: e["DATABASE_URL"] ?? "postgres://orynt:orynt@127.0.0.1:5432/orynt_dev",
    secretKey: Buffer.from(secretHex, "hex"), issuerPrivateKey: issuer, allowMainnet, failpoints,
    workerEnabled: e["ORYNT_WORKER"] !== "0", workerIntervalMs: Number(e["ORYNT_WORKER_INTERVAL_MS"] ?? 2000),
    cookieSecure: prod || e["COOKIE_SECURE"] === "1",
    allowedOrigins: (e["ORYNT_ALLOWED_ORIGINS"] ?? "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8787").split(",").map((s) => s.trim()).filter(Boolean),
    allowPrivateWebhookTargets: !prod,
    logLevel: e["LOG_LEVEL"] ?? (env === "test" ? "silent" : "info"),
    trustProxy: e["ORYNT_TRUST_PROXY"] === "1",
    assumeSingleInstance: (e["ORYNT_ASSUME_SINGLE_INSTANCE"] ?? (prod ? "0" : "1")) === "1",
    rateLimitPerMinute: Number(e["ORYNT_RATE_LIMIT_PER_MIN"] ?? 600),
    sendTimeoutSeconds: Number(e["ORYNT_SEND_TIMEOUT_SECONDS"] ?? 30),
    reconcileInitialDelaySeconds: Number(e["ORYNT_RECONCILE_INITIAL_DELAY_SECONDS"] ?? 10),
  };
}
