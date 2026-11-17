import { z } from "zod";
import type { Network } from "./bolt11";

const msatStr = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);

export const PolicyRulesSchema = z.object({
  /** Hard cap for a single payment (msat as decimal string). */
  maxPaymentMsat: msatStr,
  /** Rolling 24h cap on dispatched (non-proven-failed) payments in the workspace; null = no cap. */
  dailyLimitMsat: msatStr.nullable(),
  /** Ascending tiers. A payment uses the first tier whose upToMsat >= amount (null upTo = unbounded). */
  tiers: z
    .array(z.object({ upToMsat: msatStr.nullable(), requiredApprovals: z.number().int().min(1).max(10) }))
    .min(1),
  /** The creator of an obligation may never approve it. */
  requireDistinctMaker: z.boolean(),
  allowedNetworks: z.array(z.enum(["mainnet", "testnet", "signet", "regtest"])).min(1),
  /** Invoice must still be valid for at least this long at execution time. */
  minInvoiceRemainingSeconds: z.number().int().min(0).max(86400),
  /** A payee node key not yet verified by an admin requires the admin/owner role among approvers. */
  unverifiedPayeeNeedsAdmin: z.boolean(),
  /** Approvals older than this at execution time are stale. */
  approvalMaxAgeSeconds: z
    .number()
    .int()
    .min(60)
    .max(30 * 86400),
});
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;

export const DEFAULT_POLICY_RULES: PolicyRules = {
  maxPaymentMsat: "1000000000", // 1,000,000 sats
  dailyLimitMsat: "5000000000",
  tiers: [
    { upToMsat: "100000000", requiredApprovals: 1 }, // up to 100k sats: 1 approver
    { upToMsat: null, requiredApprovals: 2 },
  ],
  requireDistinctMaker: true,
  allowedNetworks: ["regtest"],
  minInvoiceRemainingSeconds: 120,
  unverifiedPayeeNeedsAdmin: false,
  approvalMaxAgeSeconds: 24 * 3600,
};

export interface PolicyContext {
  amountMsat: bigint;
  network: Network;
  /** msat already dispatched (not proven failed) in the last 24h, excluding this obligation */
  dispatchedLast24hMsat: bigint;
}

export interface PolicyResult {
  requiredApprovals: number;
  violations: Array<{ code: string; message: string }>;
}

export function evaluatePolicy(rules: PolicyRules, ctx: PolicyContext): PolicyResult {
  const violations: PolicyResult["violations"] = [];
  if (ctx.amountMsat <= 0n)
    violations.push({ code: "amount_not_positive", message: "Amount must be greater than zero." });
  if (ctx.amountMsat > BigInt(rules.maxPaymentMsat))
    violations.push({
      code: "over_payment_limit",
      message: "Amount exceeds the per-payment limit set by your policy.",
    });
  if (
    rules.dailyLimitMsat !== null &&
    ctx.dispatchedLast24hMsat + ctx.amountMsat > BigInt(rules.dailyLimitMsat)
  )
    violations.push({
      code: "over_daily_limit",
      message: "This payment would exceed the 24-hour limit set by your policy.",
    });
  if (!rules.allowedNetworks.includes(ctx.network))
    violations.push({
      code: "network_not_allowed",
      message: `The ${ctx.network} network is not allowed by your policy.`,
    });
  const tier = rules.tiers.find((t) => t.upToMsat === null || ctx.amountMsat <= BigInt(t.upToMsat));
  const required = tier ? tier.requiredApprovals : Math.max(...rules.tiers.map((t) => t.requiredApprovals));
  return { requiredApprovals: required, violations };
}

export function policyDigestInput(rules: PolicyRules) {
  return {
    maxPaymentMsat: rules.maxPaymentMsat,
    dailyLimitMsat: rules.dailyLimitMsat,
    tiers: rules.tiers.map((t) => ({ upToMsat: t.upToMsat, requiredApprovals: t.requiredApprovals })),
    requireDistinctMaker: rules.requireDistinctMaker,
    allowedNetworks: [...rules.allowedNetworks].sort(),
    minInvoiceRemainingSeconds: rules.minInvoiceRemainingSeconds,
    unverifiedPayeeNeedsAdmin: rules.unverifiedPayeeNeedsAdmin,
    approvalMaxAgeSeconds: rules.approvalMaxAgeSeconds,
  };
}
