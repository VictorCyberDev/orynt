import { OryntError } from "@orynt/core";
import type { Deps } from "./context";

export interface Entitlements {
  members: number;
  wallets: number;
  payouts_per_month: number;
  webhooks: number;
  api_keys: number;
  batch: boolean;
  recurring: boolean;
  history_days: number;
}
const PAST_DUE_GRACE_DAYS = 7;

/** The plan that is actually in force. A canceled/incomplete subscription (or one past due beyond the grace period) falls back to the free Developer plan — never to unlimited. */
export async function effectivePlan(
  d: Deps,
  orgId: string,
): Promise<{
  plan_id: string;
  status: string;
  entitlements: Entitlements;
  provider: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}> {
  const r = (
    await d.pool.query(
      "SELECT s.*, p.entitlements AS ent FROM subscriptions s JOIN plan_definitions p ON p.id=s.plan_id WHERE s.org_id=$1",
      [orgId],
    )
  ).rows[0];
  const free = (await d.pool.query("SELECT entitlements FROM plan_definitions WHERE id='developer'")).rows[0]
    .entitlements as Entitlements;
  if (!r)
    return {
      plan_id: "developer",
      status: "active",
      entitlements: free,
      provider: "none",
      current_period_end: null,
      cancel_at_period_end: false,
    };
  const lapsed =
    r.status === "canceled" ||
    r.status === "incomplete" ||
    (r.status === "past_due" &&
      r.last_event_at &&
      Date.now() - new Date(r.last_event_at).getTime() > PAST_DUE_GRACE_DAYS * 86400_000);
  return {
    plan_id: lapsed ? "developer" : r.plan_id,
    status: r.status,
    entitlements: lapsed ? free : (r.ent as Entitlements),
    provider: r.provider,
    current_period_end: r.current_period_end ? new Date(r.current_period_end).toISOString() : null,
    cancel_at_period_end: r.cancel_at_period_end,
  };
}

export async function usage(d: Deps, orgId: string) {
  const q = async (s: string) => Number((await d.pool.query(s, [orgId])).rows[0].n);
  return {
    members: await q("SELECT count(*)::int AS n FROM memberships WHERE org_id=$1 AND status='active'"),
    wallets: await q(
      "SELECT count(*)::int AS n FROM wallet_connections WHERE org_id=$1 AND status<>'disabled'",
    ),
    payouts_this_month: await q(
      "SELECT count(*)::int AS n FROM payout_obligations WHERE org_id=$1 AND created_at >= date_trunc('month', now())",
    ),
    webhooks: await q("SELECT count(*)::int AS n FROM webhook_endpoints WHERE org_id=$1 AND status='active'"),
    api_keys: await q("SELECT count(*)::int AS n FROM api_keys WHERE org_id=$1 AND revoked_at IS NULL"),
  };
}

export type Dimension = "members" | "wallets" | "payouts" | "webhooks" | "api_keys" | "batch" | "recurring";
/** Server-side gate. Hidden buttons are not enforcement; this is. `adding` = how many of the resource are about to be created. */
export async function checkEntitlement(d: Deps, orgId: string, dim: Dimension, adding = 1): Promise<void> {
  const eff = await effectivePlan(d, orgId);
  const e = eff.entitlements;
  const u = await usage(d, orgId);
  const lim = (limit: number, used: number, label: string) => {
    if (limit !== -1 && used + adding > limit)
      throw new OryntError(
        "entitlement_exceeded",
        402,
        `Your ${eff.plan_id} plan allows ${limit} ${label}. Upgrade to add more.`,
        { entitlement: dim, plan: eff.plan_id, limit, used },
      );
  };
  switch (dim) {
    case "members":
      return lim(e.members, u.members, "team members");
    case "wallets":
      return lim(e.wallets, u.wallets, "connected wallets");
    case "payouts":
      return lim(e.payouts_per_month, u.payouts_this_month, "payouts per month");
    case "webhooks":
      return lim(e.webhooks, u.webhooks, "webhook endpoints");
    case "api_keys":
      return lim(e.api_keys, u.api_keys, "API keys");
    case "batch":
      if (!e.batch)
        throw new OryntError(
          "entitlement_exceeded",
          402,
          `Batch payouts are not included in the ${eff.plan_id} plan.`,
          { entitlement: dim, plan: eff.plan_id },
        );
      return;
    case "recurring":
      if (!e.recurring)
        throw new OryntError(
          "entitlement_exceeded",
          402,
          `Recurring schedules are not included in the ${eff.plan_id} plan.`,
          { entitlement: dim, plan: eff.plan_id },
        );
      return;
  }
}
