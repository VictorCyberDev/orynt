import { useState } from "react";
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
      <Card title="This workspace" id="ws"><dl className="summary"><dt>Name</dt><dd>{me?.workspace.name}</dd><dt>Signed in as</dt><dd>{me?.user.name} ({me?.role})</dd><dt>Permissions</dt><dd className="muted small">{me?.permissions.join(", ")}</dd></dl></Card>
    </div>
  );
}
