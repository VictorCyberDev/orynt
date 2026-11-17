import { useState } from "react";
import { api, errorText, useAsync, useSession } from "../api";
import { Badge, Button, Card, ErrorNote, Field, Note, Skeleton, toast } from "../components/ui";

type SessionInfo = { id: string; created_at: string; expires_at: string; user_agent: string; current: boolean };
type OrgInfo = { id: string; name: string; require_mfa: boolean; country?: string | null; timezone?: string | null; purpose?: string | null };
type MemberInfo = { id: string; status: string; role: string; user: { id: string; name: string; email: string } };

export function OrgAdmin() {
  const { me, refresh } = useSession();
  const isOwner = me?.role === "owner";
  const canManage = me?.permissions.includes("member:manage") ?? false;
  const sessions = useAsync(() => api.request<{ data: SessionInfo[] }>("GET", "/v1/me/sessions").then(r => r.data), []);
  const org = useAsync(() => api.request<OrgInfo>("GET", "/v1/org").then(r => r.data), []);
  const members = useAsync(() => api.request<{ data: MemberInfo[] }>("GET", "/v1/members").then(r => r.data), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [transferPassword, setTransferPassword] = useState("");
  const [closureName, setClosureName] = useState("");
  const [closurePassword, setClosurePassword] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [confirmClosure, setConfirmClosure] = useState(false);
  const run = async (fn: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast("ok", message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page narrow">
      <header className="page-h"><div><h1>Workspace security</h1><p className="lede">Review active sessions and manage high-impact organization actions.</p></div></header>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Card title="Your active sessions">
        {sessions.loading && !sessions.data ? <Skeleton /> : null}
        {sessions.error ? <ErrorNote>{sessions.error}</ErrorNote> : null}
        {sessions.data?.data.map(s => (
          <div key={s.id} className="row wrap" style={{ justifyContent: "space-between", gap: 12, marginBlock: 12 }}>
            <div>
              <strong>{s.user_agent || "Unidentified device"}</strong> {s.current ? <Badge tone="ok">This session</Badge> : null}
              <div className="muted small">Started {new Date(s.created_at).toLocaleString()} · Expires {new Date(s.expires_at).toLocaleString()}</div>
            </div>
            <Button disabled={busy} variant="ghost" onClick={() => void run(async () => {
              await api.request("DELETE", `/v1/me/sessions/${s.id}`);
              if (s.current) window.location.assign("/app/login");
              else sessions.reload();
            }, "Session revoked.")}>{s.current ? "Sign out here" : "Revoke session"}</Button>
          </div>
        ))}
        <Button disabled={busy} onClick={() => void run(async () => {
          await api.request("POST", "/v1/me/sessions/revoke-others");
          sessions.reload();
        }, "Other sessions revoked.")}>Sign out other devices</Button>
      </Card>
      <Card title="Workspace authentication">
        {org.loading && !org.data ? <Skeleton /> : null}
        {org.error ? <ErrorNote>{org.error}</ErrorNote> : null}
        {org.data ? <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div><strong>Require two-factor authentication for privileged roles</strong><p className="muted small">Owner and administrative financial actions require additional verification.</p></div>
          <Badge tone={org.data.require_mfa ? "ok" : "warn"}>{org.data.require_mfa ? "Required" : "Not required"}</Badge>
          {isOwner ? <Button disabled={busy} onClick={() => void run(async () => {
            await api.request("PATCH", "/v1/org", { body: { require_mfa: !org.data!.require_mfa } });
            org.reload();
          }, "Workspace authentication policy updated.")}>{org.data.require_mfa ? "Disable requirement" : "Require MFA"}</Button> : null}
        </div> : null}
      </Card>
      {isOwner && canManage ? <>
        <Card title="Transfer ownership">
          <Note tone="warn">The new owner must already be an active member with a verified email. You will become an administrator. This changes financial authority.</Note>
          <form onSubmit={e => { e.preventDefault(); if (!confirmTransfer) return; void run(async () => {
            await api.request("POST", "/v1/org/transfer-ownership", { body: { user_id: target, password: transferPassword } });
            setTransferPassword(""); setConfirmTransfer(false); await refresh(); members.reload();
          }, "Ownership transferred."); }}>
            <Field label="New owner" htmlFor="new-owner">
              <select id="new-owner" required value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Select a member</option>
                {members.data?.data.filter(m => m.status === "active" && m.user.id !== me?.user.id).map(m =>
                  <option key={m.user.id} value={m.user.id}>{m.user.name} ({m.user.email})</option>)}
              </select>
            </Field>
            <Field label="Your password" htmlFor="owner-password"><input id="owner-password" type="password" autoComplete="current-password" required value={transferPassword} onChange={e => setTransferPassword(e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={confirmTransfer} onChange={e => setConfirmTransfer(e.target.checked)} /> I understand this transfers financial workspace ownership.</label>
            <div className="actions"><Button variant="danger" type="submit" disabled={!target || !transferPassword || !confirmTransfer || busy}>Transfer ownership</Button></div>
          </form>
        </Card>
        <Card title="Close organization" tone="danger">
          <Note tone="warn">Closing disables financial operations, sessions, keys, wallet connections and schedules. It is refused while a payment is unresolved. Records are retained for 90 days. It does not automatically cancel an external billing subscription.</Note>
          <form onSubmit={e => { e.preventDefault(); if (!confirmClosure || closureName !== org.data?.name) return; void run(async () => {
            await api.request("POST", "/v1/org/close", { body: { confirm_name: closureName, password: closurePassword } });
            window.location.assign("/app/login");
          }, "Workspace closed."); }}>
            <Field label="Type the exact workspace name" htmlFor="closure-name"><input id="closure-name" required value={closureName} onChange={e => setClosureName(e.target.value)} /></Field>
            <Field label="Your password" htmlFor="closure-password"><input id="closure-password" type="password" autoComplete="current-password" required value={closurePassword} onChange={e => setClosurePassword(e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={confirmClosure} onChange={e => setConfirmClosure(e.target.checked)} /> I understand this closes the organization and disables access.</label>
            <div className="actions"><Button type="submit" variant="danger" disabled={busy || closureName !== org.data?.name || !closurePassword || !confirmClosure}>Close organization</Button></div>
          </form>
        </Card>
      </> : null}
    </div>
  );
}
