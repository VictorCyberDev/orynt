import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, errorText, setCsrf, useSession } from "../api";
import { Button, ErrorNote, Field, Note } from "../components/ui";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { setMe } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ email: "", password: "", name: "", workspace: "", mfa: "" });
  const [needMfa, setNeedMfa] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = mode === "login"
        ? await api.request<import("@orynt/sdk").MeT>("POST", "/v1/auth/login", { body: { email: f.email, password: f.password, ...(f.mfa ? { mfa_code: f.mfa } : {}) } })
        : await api.request<import("@orynt/sdk").MeT>("POST", "/v1/auth/register", { body: { email: f.email, password: f.password, name: f.name, workspace_name: f.workspace } });
      setCsrf(r.data.csrf_token); setMe(r.data);
      nav((loc.state as { from?: string } | null)?.from ?? (mode === "signup" ? "/guide" : "/"), { replace: true });
    } catch (e2) { if ((e2 as { problem?: { mfa_required?: boolean } }).problem?.mfa_required) { setNeedMfa(true); setErr("Enter the 6-digit code from your authenticator app."); } else setErr(errorText(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        <img src="/app/brand.svg" alt="" height="40" />
        <h1>Your payments, under control.</h1>
        <p>Approve exactly what will be sent. See exactly what happened. Keep proof anyone can check.</p>
        <ul><li>Every payout needs a signed approval for its exact amount and recipient.</li><li>A lost answer from your wallet is “checking”, never “failed”.</li><li>Receipts verify offline, without trusting us.</li></ul>
      </div>
      <form className="auth-form" onSubmit={submit} aria-labelledby="auth-h">
        <h2 id="auth-h">{mode === "login" ? "Sign in" : "Create your workspace"}</h2>
        {mode === "signup" ? <Note tone="info" title="Test network only.">This build runs against Bitcoin regtest or a practice wallet. No real funds.</Note> : null}
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        {mode === "signup" ? <><Field label="Your name" htmlFor="name"><input id="name" required autoComplete="name" value={f.name} onChange={set("name")} /></Field>
          <Field label="Workspace name" htmlFor="ws" hint="Usually your organisation."><input id="ws" required value={f.workspace} onChange={set("workspace")} /></Field></> : null}
        <Field label="Email" htmlFor="email"><input id="email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Password" htmlFor="pw" hint={mode === "signup" ? "At least 12 characters." : undefined}><input id="pw" type="password" required minLength={mode === "signup" ? 12 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={set("password")} /></Field>
        {needMfa ? <Field label="Authenticator code" htmlFor="mfa"><input id="mfa" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={f.mfa} onChange={set("mfa")} /></Field> : null}
        <Button variant="primary" type="submit" busy={busy}>{mode === "login" ? "Sign in" : "Create workspace"}</Button>
        <p className="alt">{mode === "login" ? <><Link to="/forgot">Forgot your password?</Link> · </> : null}{mode === "login" ? <>New here? <Link to="/signup">Create a workspace</Link></> : <>Already have one? <Link to="/login">Sign in</Link></>} · <Link to="/verify">Verify a receipt</Link></p>
      </form>
    </div>
  );
}
