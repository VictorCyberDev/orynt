import { notifyApprovalRequested } from "./notify";
import { randomUUID } from "node:crypto";
import {
  APPROVER_ROLES,
  Bolt11Error,
  toMsat,
  OryntError,
  decodeInvoice,
  evaluatePolicy,
  revisionHash,
  PolicyRulesSchema,
  verifyApproval,
  hashCanonical,
  type ApprovalPayload,
  type Network,
  type PolicyRules,
} from "@orynt/core";
import { withTx, type Tx } from "../db/pool";
import { appendAudit } from "./audit";
import { actorTag, type Ctx, type Deps } from "./context";
import { bindingFor, validApprovals } from "./dto";
import { cas, lockObligation } from "./state";
import { emitEvent } from "./webhooks";
import { checkEntitlement } from "./entitlements";
import { track } from "./analytics";

export async function dispatchedLast24h(tx: Tx, orgId: string, excludeObligationId: string): Promise<bigint> {
  const r = await tx.query(
    `SELECT COALESCE(sum(pi.amount_msat),0)::bigint AS s FROM payment_intents pi JOIN payout_obligations o ON o.id=pi.obligation_id
     WHERE pi.org_id=$1 AND pi.obligation_id<>$2 AND pi.created_at > now() - interval '24 hours' AND o.state NOT IN ('DEFINITIVELY_FAILED','REJECTED','CANCELLED')`,
    [orgId, excludeObligationId],
  );
  return BigInt(r.rows[0].s);
}

interface RevInput {
  counterpartyId: string;
  amountMsat: bigint;
  memo: string;
  externalRef: string;
  invoice: string;
  walletConnectionId: string | null;
}

/** Shared validation for create and revise: the invoice is decoded and its signature verified here, never trusted from the client. */
async function validateRevision(tx: Tx, d: Deps, orgId: string, input: RevInput, obligationId: string) {
  let inv;
  try {
    inv = decodeInvoice(input.invoice);
  } catch (e) {
    throw new OryntError(
      "invoice_invalid",
      422,
      e instanceof Bolt11Error
        ? `That doesn't look like a valid Lightning invoice: ${e.message}.`
        : "Invalid invoice.",
    );
  }
  let conn;
  if (input.walletConnectionId)
    conn = (
      await tx.query("SELECT * FROM wallet_connections WHERE id=$1 AND org_id=$2", [
        input.walletConnectionId,
        orgId,
      ])
    ).rows[0];
  else {
    const all = (
      await tx.query(
        "SELECT * FROM wallet_connections WHERE org_id=$1 AND status='active' ORDER BY created_at",
        [orgId],
      )
    ).rows;
    if (all.length > 1)
      throw new OryntError(
        "validation_failed",
        422,
        "More than one wallet is connected. Choose which wallet should pay this.",
      );
    conn = all[0];
  }
  if (!conn || conn.status !== "active")
    throw new OryntError("wallet_unavailable", 409, "Connect a wallet before creating a payout.");
  if (inv.network !== conn.network)
    throw new OryntError(
      "network_mismatch",
      422,
      `This invoice is for ${inv.network}, but the selected wallet is on ${conn.network}. Orynt will not mix networks.`,
    );
  if (inv.expiresAt * 1000 <= Date.now())
    throw new OryntError(
      "invoice_expired",
      422,
      "This invoice has already expired. Ask the recipient for a new one.",
    );
  if (input.amountMsat <= 0n)
    throw new OryntError("validation_failed", 422, "Amount must be greater than zero.");
  if (inv.amountMsat !== null && inv.amountMsat !== input.amountMsat)
    throw new OryntError(
      "amount_mismatch",
      422,
      "The amount you entered differs from the amount inside the invoice. Orynt only pays the exact invoiced amount.",
      { invoice_amount_msat: inv.amountMsat.toString() },
    );
  const cp = (
    await tx.query("SELECT * FROM counterparties WHERE id=$1 AND org_id=$2", [input.counterpartyId, orgId])
  ).rows[0];
  if (!cp) throw new OryntError("not_found", 404, "Recipient not found.");
  if (cp.bound_payee_pubkey && cp.bound_payee_pubkey !== inv.payeePubkey)
    throw new OryntError(
      "destination_mismatch",
      422,
      `This invoice was issued by a different Lightning node than the one ${cp.name} is bound to. Orynt blocks destination substitution.`,
      { bound: cp.bound_payee_pubkey, invoice_payee: inv.payeePubkey },
    );
  const rh = revisionHashFor(obligationId, 0, cp, input, inv.paymentHash, inv.payeePubkey, inv.network);
  return {
    inv,
    conn,
    cp,
    rhFor: (revision: number) =>
      revisionHashFor(obligationId, revision, cp, input, inv.paymentHash, inv.payeePubkey, inv.network),
    _rh: rh,
  };
}
function revisionHashFor(
  obligationId: string,
  revision: number,
  cp: Record<string, any>,
  i: RevInput,
  paymentHash: string,
  payee: string,
  network: Network,
) {
  return revisionHash({
    obligationId,
    revision,
    counterpartyId: cp.id,
    boundPayeePubkey: cp.bound_payee_pubkey ?? "",
    amountMsat: i.amountMsat,
    memo: i.memo,
    externalRef: i.externalRef,
    invoice: i.invoice,
    paymentHash,
    payeePubkey: payee,
    network,
  });
}

async function claimInvoice(tx: Tx, orgId: string, hash: string, obligationId: string) {
  const r = await tx.query(
    "INSERT INTO invoice_claims(org_id,payment_hash,obligation_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1",
    [orgId, hash, obligationId],
  );
  if (!r.rowCount) {
    const other = (
      await tx.query(
        "SELECT o.seq, o.id FROM invoice_claims c JOIN payout_obligations o ON o.id=c.obligation_id WHERE c.org_id=$1 AND c.payment_hash=$2",
        [orgId, hash],
      )
    ).rows[0];
    if (other && other.id === obligationId) return;
    throw new OryntError(
      "conflict",
      409,
      `This invoice is already attached to PO-${String(other?.seq ?? 0).padStart(4, "0")}. One invoice can back only one payout.`,
    );
  }
}
export const releaseClaim = (tx: Tx, orgId: string, obligationId: string) =>
  tx.query("DELETE FROM invoice_claims WHERE org_id=$1 AND obligation_id=$2", [orgId, obligationId]);

export async function createObligation(
  d: Deps,
  ctx: Ctx,
  i: {
    counterparty_id?: string;
    counterparty_name?: string;
    amount_msat: string;
    memo: string;
    external_ref: string;
    invoice: string;
    wallet_connection_id?: string;
    batch_id?: string;
  },
): Promise<string> {
  await checkEntitlement(d, ctx.orgId, "payouts");
  const created = await withTx(d.pool, async (tx) => {
    let cpId = i.counterparty_id;
    if (!cpId) {
      const name = i.counterparty_name!.trim();
      const ex = (
        await tx.query("SELECT id FROM counterparties WHERE org_id=$1 AND lower(name)=lower($2)", [
          ctx.orgId,
          name,
        ])
      ).rows[0];
      cpId =
        ex?.id ??
        (
          await tx.query("INSERT INTO counterparties(org_id,name) VALUES ($1,$2) RETURNING id", [
            ctx.orgId,
            name,
          ])
        ).rows[0].id;
    }
    const id = randomUUID();
    let amt: bigint;
    try {
      amt = toMsat(i.amount_msat);
    } catch {
      throw new OryntError("validation_failed", 422, "Amount is not a valid number of millisatoshis.");
    }
    const input: RevInput = {
      counterpartyId: cpId!,
      amountMsat: amt,
      memo: i.memo.trim(),
      externalRef: i.external_ref.trim(),
      invoice: i.invoice.trim(),
      walletConnectionId: i.wallet_connection_id ?? null,
    };
    const v = await validateRevision(tx, d, ctx.orgId, input, id);
    const seq = (
      await tx.query(
        "INSERT INTO org_counters(org_id,name,value) VALUES ($1,'obligation',1) ON CONFLICT (org_id,name) DO UPDATE SET value=org_counters.value+1 RETURNING value",
        [ctx.orgId],
      )
    ).rows[0].value;
    await tx.query(
      "INSERT INTO payout_obligations(id,org_id,seq,state,wallet_connection_id,created_by) VALUES ($1,$2,$3,'DRAFT',$4,$5)",
      [id, ctx.orgId, seq, v.conn.id, ctx.actor.userId ?? (await systemUser(tx, ctx))],
    );
    await claimInvoice(tx, ctx.orgId, v.inv.paymentHash, id);
    await tx.query(
      `INSERT INTO obligation_revisions(obligation_id,revision,counterparty_id,bound_payee_pubkey,amount_msat,memo,external_ref,invoice,payment_hash,payee_pubkey,network,invoice_expires_at,revision_hash,created_by)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11),$12,$13)`,
      [
        id,
        v.cp.id,
        v.cp.bound_payee_pubkey ?? "",
        input.amountMsat,
        input.memo,
        input.externalRef,
        input.invoice,
        v.inv.paymentHash,
        v.inv.payeePubkey,
        v.inv.network,
        v.inv.expiresAt,
        v.rhFor(1),
        ctx.actor.userId ?? (await systemUser(tx, ctx)),
      ],
    );
    if (v.cp.suspended_at)
      throw new OryntError(
        "invalid_state",
        409,
        `${v.cp.name} is suspended. Reactivate the recipient before creating payouts.`,
      );
    if (i.batch_id) await tx.query("UPDATE payout_obligations SET batch_id=$2 WHERE id=$1", [id, i.batch_id]);
    await appendAudit(
      tx,
      ctx.orgId,
      `obligation:${id}`,
      actorTag(ctx.actor),
      "obligation.created",
      `obligation:${id}`,
      {
        revision: 1,
        amount_msat: input.amountMsat.toString(),
        payment_hash: v.inv.paymentHash,
        payee_pubkey: v.inv.payeePubkey,
        counterparty: v.cp.name,
        network: v.inv.network,
        batch_id: i.batch_id ?? null,
      },
    );
    return id;
  });
  await track(d, "payout_created", ctx.orgId);
  return created;
}

/** API keys act on behalf of the user who created them; fall back to that user for FK columns. */
async function systemUser(tx: Tx, ctx: Ctx): Promise<string> {
  if (ctx.actor.kind === "apikey")
    return (await tx.query("SELECT created_by FROM api_keys WHERE id=$1", [ctx.actor.id])).rows[0].created_by;
  throw new OryntError("forbidden", 403, "This action needs a signed-in person.");
}

export async function reviseObligation(
  d: Deps,
  ctx: Ctx,
  id: string,
  patch: {
    amount_msat?: string;
    memo?: string;
    external_ref?: string;
    invoice?: string;
    counterparty_id?: string;
    wallet_connection_id?: string;
  },
) {
  await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, id);
    if (!["DRAFT", "AWAITING_APPROVAL", "APPROVED", "DEFINITIVELY_FAILED"].includes(o.state))
      throw new OryntError(
        "invalid_state",
        409,
        "Terms can no longer be changed: this payment may already have been sent.",
      );
    const cur = (
      await tx.query("SELECT * FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [
        id,
        o.current_revision,
      ])
    ).rows[0];
    const input: RevInput = {
      counterpartyId: patch.counterparty_id ?? cur.counterparty_id,
      amountMsat:
        patch.amount_msat !== undefined
          ? (() => {
              try {
                return toMsat(patch.amount_msat);
              } catch {
                throw new OryntError(
                  "validation_failed",
                  422,
                  "Amount is not a valid number of millisatoshis.",
                );
              }
            })()
          : cur.amount_msat,
      memo: (patch.memo ?? cur.memo).trim(),
      externalRef: (patch.external_ref ?? cur.external_ref).trim(),
      invoice: (patch.invoice ?? cur.invoice).trim(),
      walletConnectionId: patch.wallet_connection_id ?? o.wallet_connection_id,
    };
    const v = await validateRevision(tx, d, ctx.orgId, input, id);
    const next = o.current_revision + 1;
    if (v.inv.paymentHash !== cur.payment_hash) {
      await releaseClaim(tx, ctx.orgId, id);
      await claimInvoice(tx, ctx.orgId, v.inv.paymentHash, id);
    } else if (o.state === "DEFINITIVELY_FAILED")
      throw new OryntError(
        "invoice_invalid",
        422,
        "The previous attempt failed on this invoice. Provide a fresh invoice for the new revision.",
      );
    await tx.query(
      `INSERT INTO obligation_revisions(obligation_id,revision,counterparty_id,bound_payee_pubkey,amount_msat,memo,external_ref,invoice,payment_hash,payee_pubkey,network,invoice_expires_at,revision_hash,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12),$13,$14)`,
      [
        id,
        next,
        v.cp.id,
        v.cp.bound_payee_pubkey ?? "",
        input.amountMsat,
        input.memo,
        input.externalRef,
        input.invoice,
        v.inv.paymentHash,
        v.inv.payeePubkey,
        v.inv.network,
        v.inv.expiresAt,
        v.rhFor(next),
        ctx.actor.userId ?? (await systemUser(tx, ctx)),
      ],
    );
    // Earlier approvals are bound to the old digest and stop counting; they remain in the record.
    await tx.query(
      "UPDATE approvals SET revoked_at=now(), revoked_reason='Terms changed (new revision)' WHERE obligation_id=$1 AND revision=$2 AND revoked_at IS NULL",
      [id, o.current_revision],
    );
    if (o.state !== "DRAFT") await cas(tx, ctx.orgId, id, o.state, "DRAFT");
    await tx.query(
      "UPDATE payout_obligations SET current_revision=$2, policy_id=NULL, required_approvals=NULL, intent_digest=NULL, wallet_connection_id=$3, updated_at=now() WHERE id=$1",
      [id, next, v.conn.id],
    );
    await appendAudit(
      tx,
      ctx.orgId,
      `obligation:${id}`,
      actorTag(ctx.actor),
      "obligation.revised",
      `obligation:${id}`,
      {
        revision: next,
        previous_revision: o.current_revision,
        amount_msat: input.amountMsat.toString(),
        payment_hash: v.inv.paymentHash,
        voided_approvals: true,
      },
    );
  });
}

export async function submitObligation(d: Deps, ctx: Ctx, id: string) {
  await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, id);
    if (o.state !== "DRAFT")
      throw new OryntError("invalid_state", 409, "Only a draft can be submitted for approval.");
    const rev = (
      await tx.query("SELECT * FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [
        id,
        o.current_revision,
      ])
    ).rows[0];
    const pol = (await tx.query("SELECT * FROM approval_policies WHERE org_id=$1 AND active", [ctx.orgId]))
      .rows[0];
    if (!pol)
      throw new OryntError(
        "policy_violation",
        409,
        "No active approval policy. Ask an admin to publish one.",
      );
    const rules = PolicyRulesSchema.parse(pol.rules) as PolicyRules;
    if (rev.network === "mainnet" && !d.config.allowMainnet)
      throw new OryntError("mainnet_disabled", 409, "Mainnet execution is disabled on this server.");
    if (rev.invoice_expires_at.getTime() <= Date.now() + rules.minInvoiceRemainingSeconds * 1000)
      throw new OryntError(
        "invoice_expired",
        422,
        "This invoice expires too soon to be approved and paid. Ask for a fresh one.",
      );
    const conn = (await tx.query("SELECT * FROM wallet_connections WHERE id=$1", [o.wallet_connection_id]))
      .rows[0];
    if (!conn || conn.status !== "active")
      throw new OryntError("wallet_unavailable", 409, "The selected wallet is not available.");
    const caps = (
      await tx.query(
        "SELECT * FROM provider_capabilities WHERE wallet_connection_id=$1 ORDER BY discovered_at DESC LIMIT 1",
        [conn.id],
      )
    ).rows[0];
    if (caps?.can_send === "false")
      throw new OryntError(
        "wallet_insufficient_permissions",
        409,
        "This wallet connection cannot send payments (its credential is read-only). Connect one with send permission.",
      );
    const res = evaluatePolicy(rules, {
      amountMsat: rev.amount_msat,
      network: rev.network,
      dispatchedLast24hMsat: await dispatchedLast24h(tx, ctx.orgId, id),
    });
    if (res.violations.length)
      throw new OryntError("policy_violation", 422, res.violations.map((v) => v.message).join(" "), {
        violations: res.violations,
      });
    const cp = (await tx.query("SELECT * FROM counterparties WHERE id=$1", [rev.counterparty_id])).rows[0];
    if (cp.bound_payee_pubkey && cp.bound_payee_pubkey !== rev.payee_pubkey)
      throw new OryntError(
        "destination_mismatch",
        422,
        "The recipient's bound node key no longer matches this invoice.",
      );
    await tx.query("UPDATE payout_obligations SET policy_id=$2, required_approvals=$3 WHERE id=$1", [
      id,
      pol.id,
      res.requiredApprovals,
    ]);
    const o2 = { ...o, policy_id: pol.id, required_approvals: res.requiredApprovals };
    const b = await bindingFor(tx, o2, rev);
    await tx.query("UPDATE payout_obligations SET intent_digest=$2 WHERE id=$1", [id, b!.digest]);
    await cas(tx, ctx.orgId, id, "DRAFT", "AWAITING_APPROVAL");
    await notifyApprovalRequested(
      tx,
      ctx.orgId,
      `PO-${String(o.seq).padStart(4, "0")}`,
      d.config.appBaseUrl,
      ctx.actor.userId ?? null,
    );
    await appendAudit(
      tx,
      ctx.orgId,
      `obligation:${id}`,
      actorTag(ctx.actor),
      "obligation.submitted",
      `obligation:${id}`,
      {
        revision: rev.revision,
        intent_digest: b!.digest,
        policy_id: pol.id,
        policy_revision: pol.revision,
        required_approvals: res.requiredApprovals,
      },
    );
    await emitEvent(tx, ctx.orgId, "obligation.submitted", {
      obligation_id: id,
      revision: rev.revision,
      required_approvals: res.requiredApprovals,
      intent_digest: b!.digest,
    });
  });
}

export async function approveObligation(
  d: Deps,
  ctx: Ctx,
  id: string,
  body: { intent_digest: string; signed_at: string; signature: string },
) {
  if (ctx.actor.kind !== "user")
    throw new OryntError("forbidden", 403, "Approvals must be signed by a person; API keys cannot approve.");
  await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, id);
    if (o.state !== "AWAITING_APPROVAL")
      throw new OryntError("invalid_state", 409, "This payout is not waiting for approval.");
    const rev = (
      await tx.query("SELECT * FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [
        id,
        o.current_revision,
      ])
    ).rows[0];
    const b = await bindingFor(tx, o, rev);
    if (!b) throw new OryntError("invalid_state", 409, "Payout has no bound policy.");
    const rules = PolicyRulesSchema.parse(b.pol.rules) as PolicyRules;
    // 1. what was signed must be exactly what the server computes from the stored, immutable terms *now*
    if (body.intent_digest !== b.digest || o.intent_digest !== b.digest)
      throw new OryntError(
        "approval_invalid",
        422,
        "The approval does not match the current terms of this payout (they may have changed). Reload and review again.",
      );
    const m = (
      await tx.query("SELECT * FROM memberships WHERE org_id=$1 AND user_id=$2 AND status='active'", [
        ctx.orgId,
        ctx.actor.userId,
      ])
    ).rows[0];
    if (!m || !(APPROVER_ROLES as readonly string[]).includes(m.role))
      throw new OryntError("forbidden", 403, "Your role cannot approve payments.");
    if (!m.approval_public_key)
      throw new OryntError(
        "approval_invalid",
        422,
        "Set up your approval key first (Settings → Approval key).",
      );
    if (rules.requireDistinctMaker && rev.created_by === ctx.actor.userId)
      throw new OryntError(
        "policy_violation",
        403,
        "Policy requires someone other than the person who wrote these terms (the creator or whoever last revised them) to approve.",
      );
    const skew = Math.abs(Date.now() - Date.parse(body.signed_at));
    if (Number.isNaN(skew) || skew > 5 * 60_000)
      throw new OryntError(
        "approval_invalid",
        422,
        "The approval timestamp is too far from server time (clock skew). Check your device clock.",
      );
    if (rev.invoice_expires_at.getTime() <= Date.now())
      throw new OryntError(
        "invoice_expired",
        422,
        "The invoice has expired; revise the payout with a fresh invoice.",
      );
    const payload: ApprovalPayload = {
      v: 1,
      type: "approval",
      intent_digest: b.digest,
      approver_user_id: ctx.actor.userId!,
      workspace_id: ctx.orgId,
      signed_at: body.signed_at,
    };
    if (!verifyApproval(m.approval_public_key, payload, body.signature))
      throw new OryntError("approval_invalid", 422, "The approval signature is invalid.");
    const ins = await tx.query(
      "INSERT INTO approvals(org_id,obligation_id,revision,approver_user_id,approver_role,decision,public_key,intent_digest,payload,signature,signed_at) VALUES ($1,$2,$3,$4,$5,'approved',$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id",
      [
        ctx.orgId,
        id,
        rev.revision,
        ctx.actor.userId,
        m.role,
        m.approval_public_key,
        b.digest,
        JSON.stringify(payload),
        body.signature,
        body.signed_at,
      ],
    );
    if (!ins.rowCount) throw new OryntError("conflict", 409, "You have already responded to this revision.");
    await appendAudit(
      tx,
      ctx.orgId,
      `obligation:${id}`,
      actorTag(ctx.actor),
      "obligation.approval_signed",
      `obligation:${id}`,
      {
        revision: rev.revision,
        intent_digest: b.digest,
        approver_role: m.role,
        public_key: m.approval_public_key,
      },
    );
    const valid = (await validApprovals(tx, o, rev, b.digest)).filter((a) => a.valid);
    const adminOk =
      !rules.unverifiedPayeeNeedsAdmin ||
      valid.some((a) => ["owner", "admin"].includes(a.row.approver_role)) ||
      !!(
        await tx.query("SELECT 1 FROM counterparties WHERE id=$1 AND verified_at IS NOT NULL", [
          rev.counterparty_id,
        ])
      ).rowCount;
    if (valid.length >= o.required_approvals && adminOk) {
      await cas(tx, ctx.orgId, id, "AWAITING_APPROVAL", "APPROVED");
      await appendAudit(
        tx,
        ctx.orgId,
        `obligation:${id}`,
        "system:policy",
        "obligation.approved",
        `obligation:${id}`,
        { revision: rev.revision, approvals: valid.length, required: o.required_approvals },
      );
      await emitEvent(tx, ctx.orgId, "obligation.approved", { obligation_id: id, revision: rev.revision });
    }
  });
}

export async function rejectObligation(d: Deps, ctx: Ctx, id: string, reason: string) {
  await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, id);
    if (ctx.actor.kind !== "user")
      throw new OryntError("forbidden", 403, "Rejections must come from a person.");
    await cas(tx, ctx.orgId, id, o.state, "REJECTED");
    await tx.query(
      "INSERT INTO approvals(org_id,obligation_id,revision,approver_user_id,approver_role,decision,signed_at,reason) VALUES ($1,$2,$3,$4,$5,'rejected',now(),$6) ON CONFLICT (obligation_id,revision,approver_user_id) DO UPDATE SET decision='rejected', reason=$6, signed_at=now()",
      [ctx.orgId, id, o.current_revision, ctx.actor.userId, ctx.actor.role, reason],
    );
    await releaseClaim(tx, ctx.orgId, id);
    await appendAudit(
      tx,
      ctx.orgId,
      `obligation:${id}`,
      actorTag(ctx.actor),
      "obligation.rejected",
      `obligation:${id}`,
      { reason },
    );
    await emitEvent(tx, ctx.orgId, "obligation.rejected", { obligation_id: id, reason });
  });
}

export async function cancelObligation(d: Deps, ctx: Ctx, id: string, reason: string) {
  await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, id);
    await cas(tx, ctx.orgId, id, o.state, "CANCELLED");
    await releaseClaim(tx, ctx.orgId, id);
    await appendAudit(
      tx,
      ctx.orgId,
      `obligation:${id}`,
      actorTag(ctx.actor),
      "obligation.cancelled",
      `obligation:${id}`,
      { reason },
    );
    await emitEvent(tx, ctx.orgId, "obligation.cancelled", { obligation_id: id, reason });
  });
}
void hashCanonical;
