import { useState } from "react";
import { DEFAULT_POLICY_RULES, ROLES, parseSatsInput, formatMsat, type PolicyRules } from "@orynt/core";
import { api, errorText, useAsync, useSession } from "../api";
import { Badge, Button, Card, Dialog, ErrorNote, Field, Note, Skeleton, toast } from "../components/ui";

export function Team() {
  const { me } = useSession();
  const members = useAsync(
    () => api.request<{ data: import("@orynt/sdk").Member[] }>("GET", "/v1/members").then((r) => r.data),
    [],
  );
  const pols = useAsync(
    () => api.request<{ data: import("@orynt/sdk").PolicyT[] }>("GET", "/v1/policies").then((r) => r.data),
    [],
  );
  const [add, setAdd] = useState(false);
  const [invite, setInvite] = useState(false);
  const canManage = me?.permissions.includes("member:manage");
  const canPolicy = me?.permissions.includes("policy:manage");
  const active = pols.data?.data.find((p) => p.active);
  const setRole = async (id: string, role: string) => {
    try {
      await api.request("PATCH", `/v1/members/${id}`, { body: { role } });
      toast("ok", "Role updated.");
      members.reload();
    } catch (e) {
      toast("danger", errorText(e));
    }
  };
  const revoke = async (id: string, status: "active" | "revoked") => {
    try {
      await api.request("PATCH", `/v1/members/${id}`, { body: { status } });
      toast(
        "ok",
        status === "revoked" ? "Access revoked. Their approvals no longer count." : "Access restored.",
      );
      members.reload();
    } catch (e) {
      toast("danger", errorText(e));
    }
  };
  return (
    <div className="page">
      <header className="page-h">
        <div>
          <h1>Team &amp; policy</h1>
          <p className="lede">Who may do what, and the rules every payment must pass.</p>
        </div>
        {canManage ? (
          <div className="actions">
            <Button onClick={() => setInvite(true)}>Invite by email</Button>
            <Button variant="primary" onClick={() => setAdd(true)}>
              Add with temporary password
            </Button>
          </div>
        ) : null}
      </header>
      <Card title="Members" id="mem">
        {members.loading && !members.data ? <Skeleton /> : null}
        {members.error ? <ErrorNote>{members.error}</ErrorNote> : null}
        {members.data ? (
          <div className="table-wrap" role="region" aria-label="Members" tabIndex={0}>
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Approval key</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.data.data.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Person">
                      <strong>{m.user.name}</strong>
                      <div className="muted small">{m.user.email}</div>
                    </td>
                    <td data-label="Role">
                      {canManage && m.user.id !== me?.user.id ? (
                        <select
                          aria-label={`Role for ${m.user.name}`}
                          value={m.role}
                          onChange={(e) => setRole(m.id, e.target.value)}
                        >
                          {ROLES.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        m.role
                      )}
                    </td>
                    <td data-label="Approval key">
                      {m.approval_key_registered ? <Badge tone="ok">registered</Badge> : <Badge>none</Badge>}
                    </td>
                    <td data-label="Status">
                      {m.status === "active" ? (
                        <Badge tone="ok">active</Badge>
                      ) : (
                        <Badge tone="danger">revoked</Badge>
                      )}
                    </td>
                    <td>
                      {canManage && m.user.id !== me?.user.id ? (
                        <Button
                          variant="ghost"
                          onClick={() => revoke(m.id, m.status === "active" ? "revoked" : "active")}
                        >
                          {m.status === "active" ? "Revoke access" : "Restore"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="muted small">
          Operators create and send payouts; approvers sign them; nobody approves their own. API keys can
          never approve. Roles are checked again when a payment is sent.
        </p>
      </Card>
      <Card
        title="Approval policy"
        id="pol"
        aside={active ? <Badge>revision {active.revision}</Badge> : null}
      >
        {pols.loading && !pols.data ? <Skeleton /> : null}
        {active ? (
          <PolicyForm
            rules={active.rules as PolicyRules}
            editable={!!canPolicy}
            onSaved={() => pols.reload()}
          />
        ) : null}
        <Note tone="info">
          Publishing a new revision means payouts approved under the old one must be re-approved before they
          can be sent.
        </Note>
      </Card>
      {invite ? <InviteMember onClose={() => setInvite(false)} /> : null}
      {add ? (
        <AddMember
          onClose={() => setAdd(false)}
          onDone={() => {
            setAdd(false);
            members.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PolicyForm({
  rules,
  editable,
  onSaved,
}: {
  rules: PolicyRules;
  editable: boolean;
  onSaved: () => void;
}) {
  const toSats = (m: string | null) => (m === null ? "" : (BigInt(m) / 1000n).toString());
  const [max, setMax] = useState(toSats(rules.maxPaymentMsat));
  const [day, setDay] = useState(toSats(rules.dailyLimitMsat));
  const [thr, setThr] = useState(toSats(rules.tiers[0]?.upToMsat ?? null));
  const [hi, setHi] = useState(String(rules.tiers[1]?.requiredApprovals ?? 2));
  const [lo, setLo] = useState(String(rules.tiers[0]?.requiredApprovals ?? 1));
  const [maker, setMaker] = useState(rules.requireDistinctMaker);
  const [margin, setMargin] = useState(String(rules.minInvoiceRemainingSeconds));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const next: PolicyRules = {
        ...DEFAULT_POLICY_RULES,
        ...rules,
        maxPaymentMsat: parseSatsInput(max).toString(),
        dailyLimitMsat: day ? parseSatsInput(day).toString() : null,
        tiers: [
          { upToMsat: parseSatsInput(thr).toString(), requiredApprovals: Number(lo) },
          { upToMsat: null, requiredApprovals: Number(hi) },
        ],
        requireDistinctMaker: maker,
        minInvoiceRemainingSeconds: Number(margin),
      };
      await api.request("POST", "/v1/policies", { body: { name: "Default policy", rules: next } });
      toast("ok", "New policy revision published.");
      onSaved();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="formgrid">
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <Field label="Largest single payment (sats)" htmlFor="p-max">
        <input
          id="p-max"
          inputMode="numeric"
          disabled={!editable}
          value={max}
          onChange={(e) => setMax(e.target.value)}
        />
      </Field>
      <Field label="24-hour limit (sats, empty = none)" htmlFor="p-day">
        <input
          id="p-day"
          inputMode="numeric"
          disabled={!editable}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>
      <Field label="Up to this amount (sats)…" htmlFor="p-thr">
        <input
          id="p-thr"
          inputMode="numeric"
          disabled={!editable}
          value={thr}
          onChange={(e) => setThr(e.target.value)}
        />
      </Field>
      <Field label="…approvals required" htmlFor="p-lo">
        <input
          id="p-lo"
          type="number"
          min={1}
          max={10}
          disabled={!editable}
          value={lo}
          onChange={(e) => setLo(e.target.value)}
        />
      </Field>
      <Field label="Above it, approvals required" htmlFor="p-hi">
        <input
          id="p-hi"
          type="number"
          min={1}
          max={10}
          disabled={!editable}
          value={hi}
          onChange={(e) => setHi(e.target.value)}
        />
      </Field>
      <Field label="Invoice must stay valid for at least (seconds)" htmlFor="p-margin">
        <input
          id="p-margin"
          type="number"
          min={0}
          disabled={!editable}
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
        />
      </Field>
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            disabled={!editable}
            checked={maker}
            onChange={(e) => setMaker(e.target.checked)}
          />{" "}
          The creator can never approve their own payout
        </label>
      </div>
      <p className="muted small">
        Networks allowed: {rules.allowedNetworks.join(", ")} · Limit{" "}
        {formatMsat(BigInt(rules.maxPaymentMsat))} per payment.
      </p>
      {editable ? (
        <div className="actions">
          <Button variant="primary" type="submit" busy={busy}>
            Publish new revision
          </Button>
        </div>
      ) : (
        <p className="muted small">Only owners and admins can change policy.</p>
      )}
    </form>
  );
}

function AddMember({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", role: "operator", pw: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog title="Add a member" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await api.request("POST", "/v1/members", {
              body: { name: f.name, email: f.email, role: f.role, temporary_password: f.pw },
            });
            toast("ok", "Member added. Share the temporary password privately.");
            onDone();
          } catch (e2) {
            setErr(errorText(e2));
          } finally {
            setBusy(false);
          }
        }}
      >
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        <Field label="Name" htmlFor="m-n">
          <input id="m-n" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="m-e">
          <input
            id="m-e"
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <Field label="Role" htmlFor="m-r">
          <select id="m-r" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {ROLES.filter((r) => r !== "owner").map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Temporary password"
          htmlFor="m-p"
          hint="At least 12 characters. They should change it after signing in."
        >
          <input
            id="m-p"
            required
            minLength={12}
            value={f.pw}
            onChange={(e) => setF({ ...f, pw: e.target.value })}
          />
        </Field>
        <div className="actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={busy}>
            Add member
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InviteMember({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("operator");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog title="Invite by email" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api.request("POST", "/v1/invitations", { body: { email, role } });
            toast("ok", "Invitation sent. It expires in 7 days.");
            onClose();
          } catch (x) {
            setErr(errorText(x));
          }
        }}
      >
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        <Field label="Email" htmlFor="ie">
          <input id="ie" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="ir">
          <select id="ir" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter((r) => r !== "owner").map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <div className="actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
