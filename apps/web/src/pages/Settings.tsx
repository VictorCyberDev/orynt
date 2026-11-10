import { useState } from "react";
import { Field, ErrorNote } from "../components/ui";
import { api, errorText, useSession } from "../api";
import { Badge, Button, Card, Mono, Note, toast } from "../components/ui";
import { createKey, loadKey, proofFor } from "../keys";
import { useI18n } from "../i18n";

export function Settings() {
  const { me, setMe } = useSession();
  const { lang, setLang } = useI18n();
  const [theme, setTheme] = useState(() => document.documentElement.dataset["theme"] ?? "system");
  const [busy, setBusy] = useState(false);
  const local = me ? loadKey(me.user.id, me.workspace.id) : null;
  const reg = me?.approval_key.public_key ?? null;
  const setTh = (t: string) => { setTheme(t); if (t === "system") delete document.documentElement.dataset["theme"]; else document.documentElement.dataset["theme"] = t; try { localStorage.setItem("orynt.theme", t); } catch { /* ignore */ } };
  const register = async () => {
    setBusy(true);
    try { const k = local ?? createKey(me!.user.id, me!.workspace.id); const r = await api.request<typeof me>("POST", "/v1/me/approval-key", { body: { public_key: k.publicKey, proof_signature: proofFor(k, me!.workspace.id) } }); setMe(r.data); toast("ok", "Approval key registered."); } catch (e) { toast("danger", errorText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="page narrow">
      <header className="page-h"><div><h1>Settings</h1></div></header>
      <Card title="Approval key" id="ak">
        <p>Approvers sign each payment's exact terms with a key kept in this browser. Orynt stores only the public key and verifies every signature; it cannot sign for you.</p>
        <dl className="summary"><dt>This browser</dt><dd>{local ? <Mono value={local.publicKey} /> : <span className="muted">no key yet</span>}</dd><dt>Registered</dt><dd>{reg ? <><Mono value={reg} /> {local && local.publicKey === reg ? <Badge tone="ok">matches this browser</Badge> : <Badge tone="warn">not this browser</Badge>}</> : <span className="muted">none</span>}</dd></dl>
        <Button variant="primary" busy={busy} disabled={!!local && local.publicKey === reg} onClick={register}>{local ? "Register this browser's key" : "Create and register a key"}</Button>
        <Note tone="warn" title="Limit of this build.">The key lives in browser storage; malware or a stolen browser profile could sign. Production should use a passkey or hardware key.</Note>
      </Card>
      <Card title="Appearance and language" id="ap">
        <div className="seg" role="group" aria-label="Theme">{["system", "light", "dark"].map((t) => <button key={t} className={theme === t ? "on" : ""} aria-pressed={theme === t} onClick={() => setTh(t)}>{t}</button>)}</div>
        <div className="seg" role="group" aria-label="Language"><button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button><button className={lang === "fr" ? "on" : ""} aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>Français</button></div>
        {lang === "fr" ? <Note tone="warn">Traduction française non vérifiée par un relecteur natif — core screens only.</Note> : null}
      </Card>
      <AccountSecurity />
      <Card title="This workspace" id="ws"><dl className="summary"><dt>Name</dt><dd>{me?.workspace.name}</dd><dt>Signed in as</dt><dd>{me?.user.name} ({me?.role})</dd><dt>Permissions</dt><dd className="muted small">{me?.permissions.join(", ")}</dd></dl></Card>
    </div>
  );
}

function AccountSecurity() {
  const { me, refresh } = useSession();
  const [mfa, setMfa] = useState<{ secret: string; otpauth_uri: string } | null>(null); const [code, setCode] = useState(""); const [err, setErr] = useState<string | null>(null); const [pw, setPw] = useState(""); const [closing, setClosing] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setErr(null); try { await fn(); if (ok) toast("ok", ok); await refresh(); } catch (e) { setErr(errorText(e)); } };
  const exportData = async () => { try { const r = await api.request<unknown>("GET", "/v1/export"); const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "orynt-export.json"; a.click(); URL.revokeObjectURL(url); } catch (e) { setErr(errorText(e)); } };
  return (
    <Card title="Account security" id="sec">
      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <dl className="summary"><dt>Email</dt><dd>{me?.user.email} {me?.email_verified ? <Badge tone="ok">verified</Badge> : <><Badge tone="warn">not verified</Badge> <button className="link-btn" onClick={() => run(() => api.request("POST", "/v1/auth/resend-verification"), "Verification email sent.")}>Send link</button></>}</dd>
        <dt>Authenticator (MFA)</dt><dd>{me?.mfa_enabled ? <Badge tone="ok">on — required to sign in, approve and send</Badge> : mfa ? null : <Button onClick={() => run(async () => setMfa((await api.request<{ secret: string; otpauth_uri: string }>("POST", "/v1/me/mfa/begin")).data))}>Set up</Button>}</dd></dl>
      {mfa && !me?.mfa_enabled ? <Note tone="info" title="Add this key to your authenticator app, then enter a code.">Secret: <code className="mono">{mfa.secret}</code><div className="muted small">or open <code>{mfa.otpauth_uri.slice(0, 40)}…</code> in an app that reads otpauth links.</div><Field label="6-digit code" htmlFor="mc"><input id="mc" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field><Button variant="primary" onClick={() => run(async () => { await api.request("POST", "/v1/me/mfa/confirm", { body: { code } }); setMfa(null); }, "Authenticator enabled.")}>Confirm</Button></Note> : null}
      <div className="actions wrap"><Button onClick={exportData}>Export workspace data</Button><Button variant="ghost" onClick={() => setClosing(!closing)}>Close my account…</Button></div>
      {closing ? <Note tone="warn" title="Closing your account signs you out everywhere and revokes your API keys.">If you are a workspace's only owner, transfer ownership first.<Field label="Confirm with your password" htmlFor="cp"><input id="cp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><Button variant="danger" onClick={() => run(async () => { await api.request("POST", "/v1/me/close", { body: { password: pw } }); window.location.href = "/app/login"; })}>Close account</Button></Note> : null}
    </Card>
  );
}
