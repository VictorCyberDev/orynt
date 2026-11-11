import { useState } from "react";
import type { Obligation } from "@orynt/sdk";
import { api, errorText, useSession } from "../api";
import { createKey, loadKey, proofFor, signApprovalBody } from "../keys";
import { Button, Dialog, ErrorNote, Mono, Note, toast } from "./ui";
import { sats, until, when } from "../format";

/** Signing happens on the approver's device. The dialog shows the exact terms that the signature will bind. */
export function ApproveDialog({
  ob,
  onClose,
  onDone,
}: {
  ob: Obligation;
  onClose: () => void;
  onDone: () => void;
}) {
  const { me, setMe } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mfa, setMfa] = useState("");
  const userId = me!.user.id,
    orgId = me!.workspace.id;
  const local = loadKey(userId, orgId);
  const registered = me!.approval_key.public_key;
  const keyState: "none" | "unregistered" | "mismatch" | "ok" = !local
    ? "none"
    : !registered
      ? "unregistered"
      : local.publicKey !== registered
        ? "mismatch"
        : "ok";

  const setup = async () => {
    setBusy(true);
    setErr(null);
    try {
      const k = local ?? createKey(userId, orgId);
      const m = await api.request<typeof me>("POST", "/v1/me/approval-key", {
        body: { public_key: k.publicKey, proof_signature: proofFor(k, orgId) },
      });
      setMe(m.data);
      toast("ok", "Approval key registered.");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.obligations.approve(ob.id, {
        ...signApprovalBody(local!, ob, userId, orgId),
        ...(me!.mfa_enabled ? { mfa_code: mfa } : {}),
      } as never);
      toast("ok", `Approved ${ob.ref} — exact terms signed.`);
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Approve ${ob.ref}`} onClose={onClose}>
      <p className="muted">
        You are signing exactly this. If anything changes later, your signature stops counting.
      </p>
      <dl className="summary">
        <dt>Amount</dt>
        <dd className="big">{sats(ob.amount_msat)}</dd>
        <dt>Recipient</dt>
        <dd>
          {ob.counterparty.name}
          {ob.counterparty.bound_payee_pubkey ? (
            <span className="muted"> · node key bound</span>
          ) : (
            <span className="muted"> · node key not bound</span>
          )}
        </dd>
        <dt>Invoice issued by</dt>
        <dd>
          <Mono value={ob.payee_pubkey} n={10} />
        </dd>
        <dt>Network</dt>
        <dd>
          {ob.network}
          {ob.environment === "SIMULATOR" ? " · practice wallet (no real value)" : ""}
        </dd>
        <dt>Invoice expires</dt>
        <dd>
          {when(ob.invoice_expires_at)} ({until(ob.invoice_expires_at)})
        </dd>
        <dt>For</dt>
        <dd>{ob.memo || "—"}</dd>
        <dt>Digest you sign</dt>
        <dd>
          <Mono value={ob.intent_digest ?? ""} n={10} />
        </dd>
      </dl>
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      {keyState !== "ok" ? (
        <Note
          tone="warn"
          title={
            keyState === "mismatch"
              ? "This browser's key differs from your registered key."
              : "You need an approval key first."
          }
        >
          {keyState === "mismatch"
            ? "Approvals made here would be rejected. Register this browser's key (replaces the old one) or use the browser where you set up your key."
            : "It is created in this browser and never leaves it. Orynt stores only the public half."}
          <div className="actions">
            <Button variant="primary" onClick={setup} busy={busy}>
              {keyState === "mismatch" ? "Register this browser's key" : "Create and register key"}
            </Button>
          </div>
        </Note>
      ) : (
        <>
          {me!.mfa_enabled ? (
            <div className="field">
              <label htmlFor="am">Authenticator code</label>
              <input
                id="am"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={mfa}
                onChange={(e) => setMfa(e.target.value)}
              />
            </div>
          ) : null}
          <div className="actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={approve} busy={busy}>
              Sign &amp; approve
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
