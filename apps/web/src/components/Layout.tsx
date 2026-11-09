import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import { api, useSession, useAsync, usePolling } from "../api";
import { useI18n } from "../i18n";

export const MarkSprite = () => (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
    <symbol id="orynt-mark" viewBox="0 0 64 64">
      <path d="M26.7 14.1 A20 20 0 1 1 18.1 21.7" fill="none" stroke="currentColor" strokeWidth="6.2" strokeLinecap="round" opacity="0.001" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="var(--line-strong)" strokeWidth="6" strokeDasharray="3 9" strokeLinecap="round" />
      <path d="M45.8 17.6 A20 20 0 1 1 17.2 22.9" fill="none" stroke="var(--primary)" strokeWidth="6.2" strokeLinecap="round" />
    </symbol>
  </svg>
);

const nav: Array<[string, string, string, string]> = [
  ["/", "nav.overview", "Overview", "◐"], ["/payouts", "nav.payouts", "Payouts", "↗"], ["/approvals", "nav.approvals", "Approvals", "✓"], ["/incidents", "nav.incidents", "Incidents", "!"],
  ["/connections", "nav.connections", "Wallets", "◇"], ["/team", "nav.team", "Team & policy", "☰"], ["/activity", "nav.activity", "Activity", "≡"], ["/developers", "nav.developers", "Developers", "</>"], ["/settings", "nav.settings", "Settings", "⚙"],
];

export function Layout({ children }: { children?: ReactNode }) {
  const { me, setMe } = useSession();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const counts = useAsync(async () => (me ? api.overview() : null), [me?.workspace.id]);
  usePolling(counts.reload, 15000, !!me);
  const att = counts.data?.attention.length ?? 0;
  const sim = counts.data?.wallet.simulator_only;
  const signOut = async () => { try { await api.request("POST", "/v1/auth/logout"); } catch { /* ignore */ } setMe(null); };

  if (!me) return <div className="public-wrap"><header className="pub-head"><Link to="/login"><img src="/app/favicon.svg" alt="" width="28" height="28" /> Orynt</Link></header>{children}</div>;
  return (
    <div className="shell">
      <MarkSprite />
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <button className="icon-btn menu-btn" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>{open ? "×" : "☰"}</button>
        <Link to="/" className="brand" aria-label="Orynt home"><picture><source srcSet="/app/brand-dark.svg" media="(prefers-color-scheme: dark)" /><img src="/app/brand.svg" alt="Orynt" height="26" /></picture></Link>
        <span className="ws">{me.workspace.name}</span>
        {sim ? <span className="badge badge-sim" title="This workspace only has the practice wallet connected. No real value moves.">Practice wallet</span> : null}
      </header>
      <nav id="sidebar" className={`sidebar ${open ? "open" : ""}`} aria-label="Main">
        <ul>
          {nav.map(([to, key, label, icon]) => (
            <li key={to}><NavLink to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}><span className="ico" aria-hidden="true">{icon}</span>{t(key, label)}{to === "/" && att > 0 ? <span className="count" aria-label={`${att} items need attention`}>{att}</span> : null}</NavLink></li>
          ))}
          <li className="sep" aria-hidden="true" />
          <li><NavLink to="/guide"><span className="ico" aria-hidden="true">?</span>First-use guide</NavLink></li>
          <li><NavLink to="/verify"><span className="ico" aria-hidden="true">✔</span>{t("nav.verify", "Verify a receipt")}</NavLink></li>
        </ul>
        <div className="side-foot"><div className="who"><strong>{me.user.name}</strong><span>{me.role}</span></div><button className="link-btn" onClick={signOut}>{t("btn.signOut", "Sign out")}</button></div>
      </nav>
      <main id="main" tabIndex={-1}>{children ?? <Outlet />}</main>
      <nav className="tabbar" aria-label="Quick">
        {[["/", "Home", "◐"], ["/payouts", "Payouts", "↗"], ["/approvals", "Approve", "✓"], ["/incidents", "Issues", "!"]].map(([to, l, i]) => <NavLink key={to} to={to!} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}><span aria-hidden="true">{i}</span>{l}</NavLink>)}
      </nav>
    </div>
  );
}
