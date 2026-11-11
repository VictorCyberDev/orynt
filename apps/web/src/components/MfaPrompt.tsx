import { useEffect, useState } from "react";
import { Button, Dialog, Field } from "./ui";

/** Asks the signed-in user for a current authenticator code. Used by the API client when the server answers `mfa_required` for a sensitive action. */
let openPrompt: ((resolve: (code: string | null) => void) => void) | null = null;
export const askMfa = () => new Promise<string | null>((resolve) => (openPrompt ? openPrompt(resolve) : resolve(null)));

export function MfaPrompt() {
  const [resolver, setResolver] = useState<((c: string | null) => void) | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { openPrompt = (r) => { setCode(""); setResolver(() => r); }; return () => { openPrompt = null; }; }, []);
  if (!resolver) return null;
  const finish = (c: string | null) => { resolver(c); setResolver(null); };
  return (
    <Dialog title="Confirm it's you" onClose={() => finish(null)}>
      <form onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) finish(code); }}>
        <p>This action moves money or changes security settings. Enter the 6-digit code from your authenticator app.</p>
        <Field label="Authenticator code" htmlFor="mfa-step-up" hint="Each code can be used once. If it was just used, wait for the next one.">
          <input id="mfa-step-up" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-describedby="mfa-step-up-hint" />
        </Field>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" onClick={() => finish(null)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!/^\d{6}$/.test(code)}>Confirm</Button>
        </div>
      </form>
    </Dialog>
  );
}
