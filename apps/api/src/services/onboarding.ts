import { OryntError } from "@orynt/core";
import { withTx } from "../db/pool";
import { appendAudit } from "./audit";
import { actorTag, type Ctx, type Deps } from "./context";

/**
 * First-customer activation. Every step's `done` is DERIVED from real rows (never a client flag). Only four facts have no other footprint
 * and are therefore recorded by explicit authenticated decisions: profile filled in, plan consciously confirmed, policy reviewed, onboarding closed.
 */
type Step = { id: string; title: string; done: boolean; detail: string; path: string; optional?: boolean };

export async function getOrg(d: Deps, orgId: string) {
  const o = (
    await d.pool.query(
      "SELECT id,name,slug,plan,country,timezone,purpose,profile_completed_at,require_mfa FROM organizations WHERE id=$1",
      [orgId],
    )
  ).rows[0];
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    country: o.country,
    timezone: o.timezone,
    purpose: o.purpose,
    profile_completed: !!o.profile_completed_at,
    require_mfa: o.require_mfa,
  };
}

export async function updateOrg(
  d: Deps,
  ctx: Ctx,
  i: { name?: string; country?: string; timezone?: string; purpose?: string; require_mfa?: boolean },
) {
  if (i.require_mfa !== undefined && ctx.actor.role !== "owner")
    throw new OryntError("forbidden", 403, "Only an owner can change the two-factor policy.");
  await withTx(d.pool, async (tx) => {
    const cur = (await tx.query("SELECT * FROM organizations WHERE id=$1 FOR UPDATE", [ctx.orgId])).rows[0];
    const name = i.name ?? cur.name,
      country = i.country ?? cur.country,
      timezone = i.timezone ?? cur.timezone,
      purpose = i.purpose ?? cur.purpose;
    const complete = !!(country && timezone && purpose && purpose.trim().length >= 3);
    await tx.query(
      "UPDATE organizations SET name=$2, country=$3, timezone=$4, purpose=$5, profile_completed_at = CASE WHEN $6 THEN COALESCE(profile_completed_at, now()) ELSE NULL END, require_mfa=COALESCE($7, require_mfa) WHERE id=$1",
      [ctx.orgId, name, country, timezone, purpose, complete, i.require_mfa ?? null],
    );
    await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "org.profile_updated", `org:${ctx.orgId}`, {
      fields: Object.keys(i),
      profile_complete: complete,
    });
  });
  return getOrg(d, ctx.orgId);
}

export async function onboarding(d: Deps, orgId: string, userId: string | undefined) {
  const q = (s: string, p: unknown[] = [orgId]) => d.pool.query(s, p);
  const org = (await q("SELECT * FROM organizations WHERE id=$1")).rows[0];
  const verifier = userId
    ? (await d.pool.query("SELECT email_verified_at FROM users WHERE id=$1", [userId])).rows[0]
    : (
        await d.pool.query(
          "SELECT u.email_verified_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.role='owner' AND m.status='active' LIMIT 1",
          [orgId],
        )
      ).rows[0];
  const conns = (
    await q(
      "SELECT id,label,provider_kind,network FROM wallet_connections WHERE org_id=$1 AND status<>'disabled' ORDER BY created_at",
    )
  ).rows;
  const caps = conns.length
    ? (
        await q(
          "SELECT DISTINCT ON (wallet_connection_id) wallet_connection_id, can_send, can_lookup FROM provider_capabilities WHERE wallet_connection_id = ANY($1::uuid[]) ORDER BY wallet_connection_id, discovered_at DESC",
          [conns.map((c) => c.id)],
        )
      ).rows
    : [];
  const sendReady = caps.some((c) => c.can_send === "true" && c.can_lookup === "true");
  const sub = (
    await q("SELECT 1 FROM subscriptions WHERE org_id=$1 AND status='active' AND plan_id <> 'developer'")
  ).rowCount;
  const keyed = (
    await q(
      "SELECT count(*)::int AS n FROM memberships WHERE org_id=$1 AND status='active' AND approval_public_key IS NOT NULL AND role IN ('owner','admin','approver')",
    )
  ).rows[0].n as number;
  const mine = userId
    ? (
        await q(
          "SELECT approval_public_key IS NOT NULL AS has FROM memberships WHERE org_id=$1 AND user_id=$2 AND status='active'",
          [orgId, userId],
        )
      ).rows[0]
    : undefined;
  const recips = (await q("SELECT count(*)::int AS n FROM counterparties WHERE org_id=$1")).rows[0]
    .n as number;
  const approved = (await q("SELECT count(*)::int AS n FROM approvals WHERE org_id=$1")).rows[0].n as number;
  const receipt = (
    await q(
      "SELECT receipt->>'environment' AS env, receipt->>'network' AS network, sha256 FROM receipt_exports WHERE org_id=$1 ORDER BY issued_at LIMIT 1",
    )
  ).rows[0];

  const nets = new Set(conns.map((c) => (c.provider_kind === "simulator" ? "practice" : c.network)));
  const mode = !conns.length
    ? "none"
    : nets.has("mainnet")
      ? "real"
      : [...nets].every((n) => n === "practice")
        ? "practice"
        : nets.has("regtest")
          ? "regtest"
          : "test-network";
  const environment = {
    mode,
    label: {
      none: "No wallet connected yet",
      practice: "Practice mode — no real value moves",
      regtest: "Regtest — real Lightning software on a private test network, no real value",
      "test-network": "Test network — no real value",
      real: "Mainnet — real funds (disabled unless the operator explicitly enables it)",
    }[mode],
  };

  const steps: Step[] = [
    { id: "account", title: "Create your account", done: true, detail: "Your account exists.", path: "/" },
    {
      id: "verify_email",
      title: "Verify your e-mail",
      done: !!verifier?.email_verified_at,
      detail: verifier?.email_verified_at
        ? "E-mail verified."
        : "Open the link we e-mailed you. Connecting a real wallet needs a verified address.",
      path: "/settings",
    },
    {
      id: "organisation",
      title: "Create your organisation",
      done: true,
      detail: `${org.name}`,
      path: "/settings",
    },
    {
      id: "profile",
      title: "Complete the organisation profile",
      done: !!org.profile_completed_at,
      detail: org.profile_completed_at
        ? "Profile complete."
        : "Add your country, time zone and what you pay people for.",
      path: "/settings",
    },
    {
      id: "plan",
      title: "Confirm your plan",
      done: !!org.plan_confirmed_at || !!sub,
      detail: sub
        ? "A paid subscription is active."
        : org.plan_confirmed_at
          ? "Plan confirmed."
          : "Pick a plan or keep the free Developer plan. Plans do not authorise any payment.",
      path: "/billing",
    },
    {
      id: "wallet",
      title: "Connect a wallet",
      done: conns.length > 0,
      detail: conns.length
        ? conns
            .map(
              (c) =>
                `${c.label} (${c.provider_kind === "simulator" ? "practice" : c.provider_kind + " · " + c.network})`,
            )
            .join(", ")
        : "Start with the practice wallet or connect an LND node.",
      path: "/connections",
    },
    {
      id: "capabilities",
      title: "Check what the wallet can do",
      done: sendReady,
      detail: !conns.length
        ? "Connect a wallet first."
        : sendReady
          ? "Sending and payment lookup are both confirmed."
          : "Orynt could not confirm both sending and payment lookup. Re-check the connection or use a credential that allows both.",
      path: "/connections",
    },
    {
      id: "policy",
      title: "Review your approval policy",
      done: !!org.policy_reviewed_at,
      detail: org.policy_reviewed_at
        ? "Policy reviewed."
        : "A conservative default exists. Review it or publish your own.",
      path: "/settings",
    },
    {
      id: "approval_key",
      title: "Set up an approval key",
      done: keyed > 0,
      detail:
        keyed > 0
          ? mine?.has
            ? "Your approval key is registered."
            : "An approver has a key; you have not registered yours."
          : "Approvers sign with a key held in their own browser. Register yours before approving.",
      path: "/approvals",
    },
    {
      id: "recipient",
      title: "Add a recipient",
      done: recips > 0,
      detail: recips > 0 ? `${recips} recipient(s).` : "Who will you pay?",
      path: "/payouts/new",
    },
    {
      id: "first_payout",
      title: "Authorise your first payout",
      done: approved > 0,
      detail:
        approved > 0
          ? "A payout has been signed off by an approver."
          : "Create a payout; a different person (or key) must approve it.",
      path: "/payouts/new",
    },
    {
      id: "settlement",
      title: "Verify your first settlement",
      done: !!receipt,
      detail: receipt
        ? receipt.env === "SIMULATOR"
          ? "A receipt exists — it is labelled SIMULATOR: no real value moved."
          : `A signed receipt from a real wallet provider on ${receipt.network} exists. Verify it offline with orynt-verify --require-real.`
        : "Send the approved payout, then download and verify its receipt.",
      path: "/payouts",
    },
  ];
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  const allDone = doneCount === required.length;
  return {
    environment,
    steps,
    progress: { done: doneCount, total: required.length },
    next: steps.find((s) => !s.done)?.id ?? null,
    completed: !!org.onboarding_completed_at,
    can_complete: allDone && !org.onboarding_completed_at,
  };
}

/** Explicit, audited decisions for the two steps that otherwise leave no trace. */
export async function acknowledge(d: Deps, ctx: Ctx, step: "plan" | "policy") {
  const col = step === "plan" ? "plan_confirmed_at" : "policy_reviewed_at";
  await withTx(d.pool, async (tx) => {
    await tx.query(`UPDATE organizations SET ${col}=COALESCE(${col}, now()) WHERE id=$1`, [ctx.orgId]);
    await appendAudit(
      tx,
      ctx.orgId,
      "org",
      actorTag(ctx.actor),
      `onboarding.${step}_confirmed`,
      `org:${ctx.orgId}`,
      {},
    );
  });
}

export async function complete(d: Deps, ctx: Ctx) {
  const st = await onboarding(d, ctx.orgId, ctx.actor.userId);
  if (!st.can_complete && !st.completed)
    throw new OryntError(
      "invalid_state",
      409,
      `Onboarding can be completed only after every step is done (${st.progress.done}/${st.progress.total}). Next: ${st.next}.`,
    );
  await withTx(d.pool, async (tx) => {
    await tx.query(
      "UPDATE organizations SET onboarding_completed_at=COALESCE(onboarding_completed_at, now()) WHERE id=$1",
      [ctx.orgId],
    );
    await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "onboarding.completed", `org:${ctx.orgId}`, {
      environment: st.environment.mode,
    });
  });
  return onboarding(d, ctx.orgId, ctx.actor.userId);
}
