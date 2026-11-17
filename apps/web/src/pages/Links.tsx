import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorText, setCsrf, useSession } from "../api";
import { Button, ErrorNote, Field, Note } from "../components/ui";

const Shell = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="public-wrap">
    <div className="page narrow">
      <header className="pub-head">
        <Link to="/login">
          <img src="/app/favicon.svg" alt="" width="28" height="28" /> Orynt
        </Link>
      </header>
      <h1>{title}</h1>
      {children}
    </div>
  </div>
);

export function VerifyEmail() {
  const [sp] = useSearchParams();
  const [state, setState] = useState<"working" | "ok" | "bad">("working");
  const [msg, setMsg] = useState("");
  const { refresh } = useSession();
  useEffect(() => {
    const t = sp.get("token");
    if (!t) {
      setState("bad");
      setMsg("This link is incomplete.");
      return;
    }
    api.request("POST", "/v1/auth/verify-email", { body: { token: t } }).then(
      () => {
        setState("ok");
        void refresh();
      },
      (e) => {
        setState("bad");
        setMsg(errorText(e));
      },
    );
  }, [sp, refresh]);
  return (
    <Shell title="Confirm your email">
      {state === "working" ? (
        <p>Checking your link…</p>
      ) : state === "ok" ? (
        <Note tone="ok" title="Your email is confirmed.">
          You can now connect a real wallet and send payments. <Link to="/">Go to Orynt</Link>
        </Note>
      ) : (
        <ErrorNote>
          {msg} <Link to="/settings">Request a new link in Settings</Link>.
        </ErrorNote>
      )}
    </Shell>
  );
}
export function Forgot() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell title="Reset your password">
      {done ? (
        <Note tone="ok">
          If an account exists for that email, a reset link is on its way. It is valid for one hour.
        </Note>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await api.request("POST", "/v1/auth/forgot", { body: { email } });
              setDone(true);
            } catch (x) {
              setErr(errorText(x));
            }
          }}
        >
          {err ? <ErrorNote>{err}</ErrorNote> : null}
          <Field label="Email" htmlFor="fe">
            <input id="fe" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="actions">
            <Button variant="primary" type="submit">
              Send reset link
            </Button>
          </div>
        </form>
      )}
      <p className="alt">
        <Link to="/login">Back to sign in</Link>
      </p>
    </Shell>
  );
}
export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell title="Choose a new password">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api.request("POST", "/v1/auth/reset", {
              body: { token: sp.get("token") ?? "", password: pw },
            });
            nav("/login", { replace: true });
          } catch (x) {
            setErr(errorText(x));
          }
        }}
      >
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        <Field
          label="New password"
          htmlFor="np"
          hint="At least 12 characters. All your sessions will be signed out."
        >
          <input
            id="np"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <div className="actions">
          <Button variant="primary" type="submit">
            Set password
          </Button>
        </div>
      </form>
    </Shell>
  );
}
export function AcceptInvite() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { setMe } = useSession();
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell title="Join your team">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            const r = await api.request<import("@orynt/sdk").MeT>("POST", "/v1/auth/accept-invite", {
              body: { token: sp.get("token") ?? "", name: name || undefined, password: pw },
            });
            setCsrf(r.data.csrf_token);
            setMe(r.data);
            nav("/", { replace: true });
          } catch (x) {
            setErr(errorText(x));
          }
        }}
      >
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        <Field label="Your name" htmlFor="an" hint="Leave empty if you already have an Orynt account.">
          <input id="an" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Password"
          htmlFor="ap"
          hint="New here? Choose one (12+ characters). Existing account? Enter your current password."
        >
          <input
            id="ap"
            type="password"
            required
            minLength={1}
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <div className="actions">
          <Button variant="primary" type="submit">
            Accept invitation
          </Button>
        </div>
      </form>
    </Shell>
  );
}
export function SupportPublic() {
  const [f, setF] = useState({ email: "", subject: "", body: "", category: "account" });
  const [ref, setRef] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell title="Contact support">
      {ref ? (
        <Note tone="ok" title={`Request ${ref} received.`}>
          We emailed an acknowledgement. Quote the reference in follow-ups. We never ask for wallet
          credentials or seed phrases.
        </Note>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              const r = await api.request<{ reference: string }>("POST", "/v1/public/support", { body: f });
              setRef(r.data.reference);
            } catch (x) {
              setErr(errorText(x));
            }
          }}
        >
          {err ? <ErrorNote>{err}</ErrorNote> : null}
          <Field label="Email" htmlFor="se">
            <input
              id="se"
              type="email"
              required
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </Field>
          <Field label="Topic" htmlFor="sc">
            <select id="sc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="account">Account</option>
              <option value="billing">Billing</option>
              <option value="security">Security</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Subject" htmlFor="ss">
            <input
              id="ss"
              required
              minLength={3}
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
            />
          </Field>
          <Field
            label="How can we help?"
            htmlFor="sb"
            hint="Never include seed phrases, macaroons or private keys."
          >
            <textarea
              id="sb"
              rows={5}
              required
              minLength={10}
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          <div className="actions">
            <Button variant="primary" type="submit">
              Send
            </Button>
          </div>
        </form>
      )}
    </Shell>
  );
}
