import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";

export type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "unknown" | "sim";
const STATE_TONE: Record<string, [Tone, string]> = {
  DRAFT: ["neutral", "Draft"], AWAITING_APPROVAL: ["info", "Awaiting approval"], APPROVED: ["info", "Approved"], EXECUTION_RESERVED: ["info", "Starting"],
  DISPATCHING: ["info", "Sending…"], PENDING: ["info", "In flight"], UNKNOWN: ["unknown", "Checking wallet record"], RECONCILING: ["unknown", "Checking wallet record"],
  SETTLED: ["ok", "Settled"], SIMULATED_SETTLED: ["sim", "Simulated"], DEFINITIVELY_FAILED: ["danger", "Failed · proven not paid"], REJECTED: ["neutral", "Rejected"], CANCELLED: ["neutral", "Cancelled"],
};
export function StateBadge({ state }: { state: string }) {
  const { t } = useI18n();
  const [tone, label] = STATE_TONE[state] ?? ["neutral", state];
  return <span className={`badge badge-${tone}`}><span className="dot" aria-hidden="true" />{t(`state.${state}`, label)}</span>;
}
export const Badge = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => <span className={`badge badge-${tone}`}>{children}</span>;

export function Button({ variant = "secondary", busy, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean }) {
  return <button {...p} className={`btn btn-${variant} ${p.className ?? ""}`} disabled={p.disabled || busy} aria-busy={busy || undefined}>{busy ? <span className="spinner" aria-hidden="true" /> : null}{children}</button>;
}

export function Card({ title, aside, children, tone, id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; tone?: Tone; id?: string }) {
  return <section className={`card ${tone ? `card-${tone}` : ""}`} aria-labelledby={title && id ? id : undefined}>{title || aside ? <header className="card-h">{title ? <h2 id={id}>{title}</h2> : <span />}{aside}</header> : null}{children}</section>;
}
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return <div className="field"><label htmlFor={htmlFor}>{label}</label>{children}{hint ? <p className="hint" id={`${htmlFor}-hint`}>{hint}</p> : null}{error ? <p className="err" role="alert">{error}</p> : null}</div>;
}
export const ErrorNote = ({ children }: { children: ReactNode }) => <div className="note note-danger" role="alert"><strong>That didn't work.</strong> {children}</div>;
export const Note = ({ tone = "info", title, children }: { tone?: Tone; title?: string; children: ReactNode }) => <div className={`note note-${tone}`}>{title ? <strong>{title} </strong> : null}{children}</div>;

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><use href="#orynt-mark" /></svg><h3>{title}</h3>{children ? <p>{children}</p> : null}{action}</div>;
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton" aria-busy="true" aria-live="polite"><span className="visually-hidden">Loading…</span>{Array.from({ length: rows }, (_, i) => <div key={i} className="sk-row" style={{ width: `${90 - i * 12}%` }} />)}</div>;
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])");
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input,select,textarea,[tabindex]:not([tabindex='-1'])")];
        if (!f.length) return;
        const a = f[0]!, z = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header><h2>{title}</h2><button className="icon-btn" data-close onClick={onClose} aria-label="Close dialog">×</button></header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button className="link-btn" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard unavailable */ } }} aria-label={`${label} to clipboard`}>{done ? "Copied" : label}</button>;
}
export function Mono({ value, n = 10, copy = true }: { value: string; n?: number; copy?: boolean }) {
  return <span className="mono-wrap"><code title={value}>{value.length > n * 2 + 1 ? `${value.slice(0, n)}…${value.slice(-n)}` : value}</code>{copy ? <CopyButton value={value} /> : null}</span>;
}

export type Toast = { id: number; tone: Tone; text: string };
let toastPush: (t: Omit<Toast, "id">) => void = () => {};
export const toast = (tone: Tone, text: string) => toastPush({ tone, text });
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => { toastPush = (t) => { const id = Date.now() + Math.random(); setItems((s) => [...s, { ...t, id }]); setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 6000); }; }, []);
  return <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast note-${t.tone}`}>{t.text}</div>)}</div>;
}
