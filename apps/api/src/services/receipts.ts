import { randomUUID, createHash } from "node:crypto";
import { RECEIPT_LIMITATIONS, OryntError, attestReceipt, hashCanonical, policyDigestInput, PolicyRulesSchema, type ReceiptBody, type Receipt } from "@orynt/core";
import { withTx } from "../db/pool";
import { appendAudit, rowToEntry, signedCheckpoint } from "./audit";
import { actorTag, iso, type Ctx, type Deps } from "./context";
import { bindingFor, validApprovals } from "./dto";
import { lockObligation } from "./state";
import { track } from "./analytics";

export async function issueReceipt(d: Deps, ctx: Ctx, paymentId: string): Promise<Receipt> {
  const it = (await d.pool.query("SELECT * FROM payment_intents WHERE id=$1 AND org_id=$2", [paymentId, ctx.orgId])).rows[0];
  if (!it) throw new OryntError("not_found", 404, "Payment not found.");
  const existing = (await d.pool.query("SELECT receipt FROM receipt_exports WHERE intent_id=$1", [paymentId])).rows[0];
  if (existing) return existing.receipt as Receipt;

  const issued = await withTx(d.pool, async (tx) => {
    const o = await lockObligation(tx, ctx.orgId, it.obligation_id);
    const again = (await tx.query("SELECT receipt FROM receipt_exports WHERE intent_id=$1", [paymentId])).rows[0];
    if (again) return again.receipt as Receipt;
    if (o.state !== "SETTLED" && o.state !== "SIMULATED_SETTLED") throw new OryntError("invalid_state", 409, "A receipt exists only once a payment is settled with proof.");
    const rev = (await tx.query("SELECT * FROM obligation_revisions WHERE obligation_id=$1 AND revision=$2", [o.id, it.revision])).rows[0];
    const cp = (await tx.query("SELECT * FROM counterparties WHERE id=$1", [rev.counterparty_id])).rows[0];
    const conn = (await tx.query("SELECT * FROM wallet_connections WHERE id=$1", [it.wallet_connection_id])).rows[0];
    const org = (await tx.query("SELECT id,name FROM organizations WHERE id=$1", [ctx.orgId])).rows[0];
    const maker = (await tx.query("SELECT id,name FROM users WHERE id=$1", [rev.created_by])).rows[0]; // author of the approved revision
    const b = await bindingFor(tx, o, rev);
    if (!b || b.digest !== it.intent_digest) throw new OryntError("internal", 500, "Stored intent does not match recomputed binding; refusing to issue a receipt.");
    const rules = PolicyRulesSchema.parse(b.pol.rules);
    const apps = (await validApprovals(tx, o, rev, b.digest)).filter((a) => a.valid || a.row.decision === "approved").filter((a) => a.row.decision === "approved" && a.row.signature && !a.row.revoked_at);
    const attempts = (await tx.query("SELECT * FROM execution_attempts WHERE intent_id=$1 ORDER BY attempt_no", [it.id])).rows;
    const win = attempts.find((a) => a.outcome === "SUCCEEDED");
    if (!win) throw new OryntError("internal", 500, "Settled payment has no successful attempt.");
    const sim = conn.provider_kind === "simulator";
    const stream = `obligation:${o.id}`;
    const { checkpoint, signature } = await signedCheckpoint(d, tx, ctx.orgId, stream);
    const segment = (await tx.query("SELECT * FROM audit_events WHERE org_id=$1 AND stream=$2 ORDER BY seq", [ctx.orgId, stream])).rows.map(rowToEntry);
    const unix = Math.floor(rev.invoice_expires_at.getTime() / 1000);
    const body: ReceiptBody = {
      schema: "orynt.receipt/1", receipt_id: randomUUID(), issued_at: iso(new Date()),
      issuer: { key_id: d.issuerKeyId, public_key: d.issuerPublicKey }, network: rev.network, environment: sim ? "SIMULATOR" : "REAL_PROVIDER",
      provider: { kind: conn.provider_kind, node_pubkey: conn.node_pubkey ?? null, label: sim ? "SIMULATOR — no real value moved" : conn.label },
      workspace: { id: org.id, name: org.name },
      agreement: { obligation_id: o.id, revision: rev.revision, revision_hash: rev.revision_hash, counterparty: { id: cp.id, name: cp.name, bound_payee_pubkey: rev.bound_payee_pubkey }, amount_msat: rev.amount_msat.toString(), memo: rev.memo, external_ref: rev.external_ref, invoice: rev.invoice, payment_hash: rev.payment_hash, payee_pubkey: rev.payee_pubkey, invoice_expires_at: unix, created_by: { user_id: maker.id, name: maker.name } },
      policy: { id: b.pol.id, revision: b.pol.revision, digest: b.pol.digest, required_approvals: o.required_approvals, require_distinct_maker: rules.requireDistinctMaker },
      intent: { id: it.id, digest: it.intent_digest, wallet_connection_id: it.wallet_connection_id, binding: it.binding },
      approvals: apps.map(({ row: a }) => ({ approver: { user_id: a.approver_user_id, name: a.uname, role: a.approver_role }, public_key: a.public_key, payload: a.payload, signature: a.signature })),
      attempts: attempts.filter((a) => a.dispatched_at).map((a) => ({ attempt_no: a.attempt_no, started_at: iso(a.dispatched_at), outcome: (["SUCCEEDED", "FAILED", "UNKNOWN", "PENDING"].includes(a.outcome) ? a.outcome : a.outcome === "NOT_SENT" ? "FAILED" : "UNKNOWN") as "SUCCEEDED", note: a.note ?? "" })),
      settlement: { state: sim ? "SIMULATED_SETTLED" : "SETTLED", preimage: win.preimage, amount_msat: (win.amount_msat ?? it.amount_msat).toString(), fee_msat: (win.fee_msat ?? 0n).toString(), settled_at: iso(win.settled_at ?? win.finished_at), provider_payment_ref: win.provider_ref ?? "", source: /reconcil/i.test(win.note) ? "provider_lookup" : "provider_response", reconciled_after_uncertainty: /reconcil/i.test(win.note) },
      audit: { segment, checkpoint, checkpoint_signature: signature },
      limitations: RECEIPT_LIMITATIONS,
    };
    // the policy digest recorded in the binding must equal the digest of the stored rules
    if (hashCanonical(policyDigestInput(rules)) !== b.pol.digest) throw new OryntError("internal", 500, "Policy rules do not match their stored digest.");
    const receipt = attestReceipt(d.config.issuerPrivateKey, d.issuerKeyId, body);
    await tx.query("INSERT INTO receipt_exports(org_id,intent_id,receipt_id,receipt,sha256,issued_by) VALUES ($1,$2,$3,$4,$5,$6)", [ctx.orgId, it.id, body.receipt_id, JSON.stringify(receipt), createHash("sha256").update(JSON.stringify(receipt)).digest("hex"), actorTag(ctx.actor)]);
    await appendAudit(tx, ctx.orgId, stream, actorTag(ctx.actor), "receipt.issued", stream, { receipt_id: body.receipt_id, payment_hash: rev.payment_hash });
    return receipt;
  });
  await track(d, "receipt_issued", ctx.orgId); // after the transaction: never touch the pool from inside one
  return issued;
}
