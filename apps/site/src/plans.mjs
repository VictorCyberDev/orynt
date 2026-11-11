// Plan table, read at build time from the migration that the API actually runs (plan_definitions rows in
// apps/api/src/db/migrations/003_saas_foundations.up.sql). Nothing is typed by hand, so the site cannot drift from the
// entitlements the server enforces. If the file or a row cannot be parsed the build FAILS (it never falls back to guesses).
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATION_PATH = resolve(here, "../../api/src/db/migrations/003_saas_foundations.up.sql");
export const MIGRATION_REPO_PATH = "apps/api/src/db/migrations/003_saas_foundations.up.sql";

/** Entitlement dimensions in display order. `-1` means unlimited in the database. */
export const DIMENSIONS = [
  { key: "members", label: "Team members", note: "Active members of the workspace." },
  { key: "wallets", label: "Connected wallets", note: "Wallet connections that are not disabled." },
  {
    key: "payouts_per_month",
    label: "Payouts per month",
    note: "Payouts created in the calendar month, whatever their state.",
  },
  { key: "webhooks", label: "Webhook endpoints", note: "Active endpoints." },
  { key: "api_keys", label: "API keys", note: "Keys that are not revoked." },
  { key: "batch", label: "Batch CSV payouts", note: "Create a batch of draft payouts from a CSV file." },
  {
    key: "recurring",
    label: "Recurring schedules",
    note: "Weekly or monthly schedules that open an invoice-needed task each cycle.",
  },
  { key: "history_days", label: "Report history", note: "How far back payout reports reach." },
];

function load() {
  if (!existsSync(MIGRATION_PATH))
    throw new Error(
      `Plan migration not found: ${MIGRATION_PATH}. The pricing page is generated from it, so the build stops.`,
    );
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const block = sql.match(/INSERT INTO plan_definitions\([^)]*\)\s*VALUES([\s\S]*?);/);
  if (!block) throw new Error("Could not find the plan_definitions INSERT in the migration.");
  const plans = [];
  const rowRe = /\(\s*'([a-z_]+)'\s*,\s*'([^']+)'\s*,\s*(NULL|\d+)\s*,\s*'(\{[^']*\})'\s*,\s*(\d+)\s*\)/g;
  for (const m of block[1].matchAll(rowRe)) {
    const entitlements = JSON.parse(m[4]);
    for (const d of DIMENSIONS)
      if (!(d.key in entitlements))
        throw new Error(`Plan ${m[1]} has no "${d.key}" entitlement in the migration.`);
    plans.push({
      id: m[1],
      name: m[2],
      priceCents: m[3] === "NULL" ? null : Number(m[3]),
      entitlements,
      sort: Number(m[5]),
    });
  }
  if (plans.length < 2)
    throw new Error(
      "Parsed fewer than two plans from the migration; refusing to build a pricing page from it.",
    );
  return plans.sort((a, b) => a.sort - b.sort);
}

export const PLANS = load();
export const plan = (id) => PLANS.find((p) => p.id === id);

/** "Free", "$29", "Custom" */
export const priceLabel = (p) =>
  p.priceCents === null ? "Custom" : p.priceCents === 0 ? "Free" : `$${p.priceCents / 100}`;

/** Human text for one entitlement value. */
export function valueLabel(key, v) {
  if (typeof v === "boolean") return v ? "Included" : "Not included";
  if (v === -1) return key === "history_days" ? "Full history" : "Unlimited";
  if (key === "history_days") return `${v} days`;
  return String(v);
}

/** First plan (by display order) whose entitlement turns on a boolean feature. */
export const firstPlanWith = (key) => PLANS.find((p) => p.entitlements[key] === true);
