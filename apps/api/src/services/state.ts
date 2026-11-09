import { OryntError, assertTransition, TransitionError, type State, type TransitionEvidence } from "@orynt/core";
import type { Tx } from "../db/pool";

/** Compare-and-set state transition. The legality check is shared with the domain package; the WHERE clause is what stops a stale writer. */
export async function cas(tx: Tx, orgId: string, id: string, from: State, to: State, ev: TransitionEvidence = {}, set = ""): Promise<Record<string, any>> {
  try { assertTransition(from, to, ev); } catch (e) {
    if (e instanceof TransitionError) throw new OryntError("invalid_state", 409, e.message);
    throw e;
  }
  const r = await tx.query(
    `UPDATE payout_obligations SET state=$4, version=version+1, updated_at=now(), state_changed_at=now() ${set ? "," + set : ""} WHERE id=$1 AND org_id=$2 AND state=$3 RETURNING *`,
    [id, orgId, from, to],
  );
  if (!r.rowCount) throw new OryntError("conflict", 409, "This payment changed while your request was being processed. Reload and check its current state.");
  return r.rows[0];
}

export async function lockObligation(tx: Tx, orgId: string, id: string): Promise<Record<string, any>> {
  const r = (await tx.query("SELECT * FROM payout_obligations WHERE id=$1 AND org_id=$2 FOR UPDATE", [id, orgId])).rows[0];
  if (!r) throw new OryntError("not_found", 404, "Payout not found.");
  return r;
}
