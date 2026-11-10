import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { OryntError } from "@orynt/core";
import { withTx } from "../db/pool";
import { appendAudit } from "./audit";
import type { Deps } from "./context";
import { effectivePlan, usage } from "./entitlements";
import { queueMail } from "./mail";

/** Normalised billing event: every provider is mapped into this so entitlement logic exists exactly once. */
export interface BillingEvent {
  provider: string; eventId: string; type: string; occurredAt: number; // unix seconds, used to ignore stale/out-of-order events
  kind: "activated" | "updated" | "canceled" | "payment_failed" | "payment_succeeded" | "ignored";
  orgId?: string; planId?: string; customerId?: string; subscriptionId?: string; periodEnd?: number; cancelAtPeriodEnd?: boolean;
}
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const hmac = (alg: "sha256" | "sha512", key: string, data: string) => createHmac(alg, key).update(data).digest("hex");

// ---- webhook verification + mapping (per provider documentation; UNVERIFIED against live providers) ---------------------------------------------------
/** Stripe: `Stripe-Signature: t=<ts>,v1=<hex>`, v1 = HMAC-SHA256(secret, `${t}.${rawBody}`), tolerance 5 min. */
export function parseStripe(raw: string, sigHeader: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): BillingEvent {
  const parts = Object.fromEntries((sigHeader ?? "").split(",").map((p) => p.split("=") as [string, string]));
  if (!parts["t"] || !parts["v1"]) throw new OryntError("unauthenticated", 401, "Missing Stripe signature.");
  if (Math.abs(nowSec - Number(parts["t"])) > 300) throw new OryntError("unauthenticated", 401, "Stale webhook timestamp.");
  if (!eq(hmac("sha256", secret, `${parts["t"]}.${raw}`), parts["v1"]!)) throw new OryntError("unauthenticated", 401, "Invalid webhook signature.");
  const e = JSON.parse(raw); const o = e.data?.object ?? {}; const base = { provider: "stripe", eventId: String(e.id), type: String(e.type), occurredAt: Number(e.created) };
  const meta = o.metadata ?? {};
  // Stripe API 2025-03-31 ("basil") moved these fields; accept both shapes. The new locations come from the provider evaluation's reading of Stripe's changelog and are UNVERIFIED against live webhook traffic.
  const periodEndOf = (x: any): number | undefined => x?.current_period_end ?? x?.items?.data?.[0]?.current_period_end;
  const invoiceSub = (x: any): string | undefined => x?.subscription ?? x?.parent?.subscription_details?.subscription;
  switch (e.type) {
    case "checkout.session.completed": return { ...base, kind: "activated", orgId: meta.org_id ?? o.client_reference_id, planId: meta.plan_id, customerId: o.customer, subscriptionId: o.subscription };
    case "customer.subscription.updated": return { ...base, kind: "updated", orgId: meta.org_id, planId: meta.plan_id, customerId: o.customer, subscriptionId: o.id, periodEnd: periodEndOf(o), cancelAtPeriodEnd: !!o.cancel_at_period_end };
    case "customer.subscription.deleted": return { ...base, kind: "canceled", orgId: meta.org_id, subscriptionId: o.id, customerId: o.customer };
    case "invoice.payment_failed": return { ...base, kind: "payment_failed", subscriptionId: invoiceSub(o), customerId: o.customer };
    case "invoice.paid": return { ...base, kind: "payment_succeeded", subscriptionId: invoiceSub(o), customerId: o.customer, periodEnd: o.lines?.data?.[0]?.period?.end };
    default: return { ...base, kind: "ignored" };
  }
}
/** Paystack: `x-paystack-signature` = HMAC-SHA512(secretKey, rawBody). */
export function parsePaystack(raw: string, sigHeader: string | undefined, secret: string): BillingEvent {
  if (!sigHeader || !eq(hmac("sha512", secret, raw), sigHeader.toLowerCase())) throw new OryntError("unauthenticated", 401, "Invalid webhook signature.");
  const e = JSON.parse(raw); const d = e.data ?? {}; const meta = d.metadata ?? {};
  const base = { provider: "paystack", eventId: e.id !== undefined ? String(e.id) : `${e.event}:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}` /* no stable id in the payload: identical retries hash identically, distinct events never collide */, type: String(e.event), occurredAt: Math.floor(Date.parse(d.paid_at ?? d.createdAt ?? new Date().toISOString()) / 1000) };
  switch (e.event) {
    case "charge.success": return { ...base, kind: "activated", orgId: meta.org_id, planId: meta.plan_id, customerId: d.customer?.customer_code }; // the transaction reference is NOT a subscription id; subscription.create supplies the subscription code
    case "subscription.create": return { ...base, kind: "activated", orgId: meta.org_id, planId: meta.plan_id, customerId: d.customer?.customer_code, subscriptionId: d.subscription_code };
    case "subscription.not_renew": return { ...base, kind: "updated", cancelAtPeriodEnd: true, subscriptionId: d.subscription_code, customerId: d.customer?.customer_code }; // stops renewing; access continues to period end
    case "subscription.disable": return { ...base, kind: "canceled", subscriptionId: d.subscription_code, customerId: d.customer?.customer_code };
    case "invoice.payment_failed": return { ...base, kind: "payment_failed", subscriptionId: d.subscription?.subscription_code, customerId: d.customer?.customer_code };
    default: return { ...base, kind: "ignored" };
  }
}
/** Sandbox provider: same envelope shape as Stripe, signed with ORYNT_BILLING_WEBHOOK_SECRET. For tests/dev only — it grants real entitlements to the org, which is why it is refused in production. */
export function parseSandbox(raw: string, sigHeader: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): BillingEvent {
  const e = parseStripe(raw, sigHeader, secret, nowSec); return { ...e, provider: "sandbox" };
}

export function parseWebhook(d: Deps, provider: string, raw: string, headers: Record<string, string | string[] | undefined>): BillingEvent {
  const secret = d.config.billingWebhookSecret;
  if (!secret) throw new OryntError("unauthenticated", 401, "Billing webhooks are not configured.");
  if (provider === "sandbox") { if (d.config.env === "production") throw new OryntError("forbidden", 403, "The sandbox billing provider is disabled in production."); return parseSandbox(raw, headers["stripe-signature"] as string | undefined, secret); }
  if (provider === "stripe") return parseStripe(raw, headers["stripe-signature"] as string | undefined, secret);
  if (provider === "paystack") return parsePaystack(raw, headers["x-paystack-signature"] as string | undefined, secret);
  throw new OryntError("not_found", 404, "Unknown billing provider.");
}

/** Idempotent and order-tolerant. Returns what happened so webhook handlers can answer 200 to duplicates and stale events (providers retry on non-2xx). */
export async function applyBillingEvent(d: Deps, ev: BillingEvent, rawPayload: unknown): Promise<"applied" | "duplicate" | "stale" | "ignored"> {
  return withTx(d.pool, async (tx) => {
    const ins = await tx.query("INSERT INTO billing_events(provider,event_id,type,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id", [ev.provider, ev.eventId, ev.type, JSON.stringify(rawPayload)]);
    if (!ins.rowCount) return "duplicate"; // the same event can never grant an entitlement twice
    const done = (res: "applied" | "stale" | "ignored") => tx.query("UPDATE billing_events SET processed_at=now(), result=$2 WHERE id=$1", [ins.rows[0].id, res]).then(() => res);
    if (ev.kind === "ignored") return done("ignored");
    // locate the subscription: by org (checkout) or by provider subscription id (later events)
    let sub = ev.orgId ? (await tx.query("SELECT * FROM subscriptions WHERE org_id=$1 FOR UPDATE", [ev.orgId])).rows[0] : undefined;
    if (!sub && ev.subscriptionId) sub = (await tx.query("SELECT * FROM subscriptions WHERE provider=$1 AND provider_subscription_id=$2 FOR UPDATE", [ev.provider, ev.subscriptionId])).rows[0];
    if (!sub) return done("ignored");
    if (sub.last_event_at && Math.floor(new Date(sub.last_event_at).getTime() / 1000) > ev.occurredAt) return done("stale"); // older than what we already applied
    const plan = ev.planId ? (await tx.query("SELECT id FROM plan_definitions WHERE id=$1", [ev.planId])).rows[0] : null;
    if (ev.planId && !plan) return done("ignored");
    const period = ev.periodEnd ? new Date(ev.periodEnd * 1000) : null;
    const set = (cols: string, vals: unknown[]) => tx.query(`UPDATE subscriptions SET ${cols}, last_event_at=to_timestamp($1), updated_at=now() WHERE id=$${vals.length + 2}`, [ev.occurredAt, ...vals, sub.id]);
    switch (ev.kind) {
      case "activated": await set("plan_id=COALESCE($2,plan_id), status='active', provider=$3, provider_customer_id=COALESCE($4,provider_customer_id), provider_subscription_id=COALESCE($5,provider_subscription_id), current_period_end=COALESCE($6,current_period_end), cancel_at_period_end=false", [ev.planId ?? null, ev.provider, ev.customerId ?? null, ev.subscriptionId ?? null, period]); break;
      case "updated": await set("plan_id=COALESCE($2,plan_id), cancel_at_period_end=$3, current_period_end=COALESCE($4,current_period_end)", [ev.planId ?? null, !!ev.cancelAtPeriodEnd, period]); break;
      case "payment_succeeded": await set("status='active', current_period_end=COALESCE($2,current_period_end)", [period]); break;
      case "payment_failed": await set("status='past_due'", []); break;
      case "canceled": await set("status='canceled', cancel_at_period_end=false", []); break;
    }
    await appendAudit(tx, sub.org_id, "org", `system:billing:${ev.provider}`, `billing.${ev.kind}`, `subscription:${sub.id}`, { event_id: ev.eventId, plan: ev.planId ?? null });
    if (ev.kind === "payment_failed") { const owner = (await tx.query("SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.role='owner' AND m.status='active' LIMIT 1", [sub.org_id])).rows[0]; if (owner) await queueMail(tx, owner.email, "payment_failed", "Orynt: your subscription payment failed", "We couldn't collect your latest subscription payment. Update your payment method to keep your plan; paid features lapse after a 7-day grace period.", sub.org_id); }
    return done("applied");
  });
}

// ---- customer-facing operations ------------------------------------------------------------------------------------------------------------
export async function billingOverview(d: Deps, orgId: string) {
  const eff = await effectivePlan(d, orgId);
  const plans = (await d.pool.query("SELECT id,name,price_usd_cents,entitlements,is_hypothesis FROM plan_definitions WHERE public ORDER BY sort")).rows;
  return { current: { plan_id: eff.plan_id, status: eff.status, provider: eff.provider, current_period_end: eff.current_period_end, cancel_at_period_end: eff.cancel_at_period_end }, entitlements: eff.entitlements, usage: await usage(d, orgId), plans, billing_provider: d.config.billingProvider, notes: ["Prices are hypotheses under test, not offers.", d.config.billingProvider === "sandbox" ? "Sandbox billing: no real money moves." : "Live billing provider configured."] };
}
/** Starts a checkout. Sandbox returns a marker the UI completes through /billing/sandbox/complete; Stripe/Paystack create a hosted-checkout session via their API (IMPLEMENTED, NOT COMMISSIONED). */
export async function startCheckout(d: Deps, orgId: string, planId: string, email: string) {
  const plan = (await d.pool.query("SELECT * FROM plan_definitions WHERE id=$1 AND public", [planId])).rows[0];
  if (!plan) throw new OryntError("not_found", 404, "Unknown plan.");
  if (plan.price_usd_cents === null) throw new OryntError("invalid_state", 409, "This plan is by arrangement — contact sales.");
  if (plan.price_usd_cents === 0) throw new OryntError("invalid_state", 409, "The Developer plan is free; cancel your subscription to return to it.");
  const p = d.config.billingProvider;
  if (p === "sandbox") { if (d.config.env === "production") throw new OryntError("forbidden", 403, "The sandbox billing provider is disabled in production."); return { mode: "sandbox", plan_id: planId, url: null }; }
  if (!d.config.billingApiKey) throw new OryntError("wallet_unavailable", 503, "Billing is not configured on this server.");
  if (p === "stripe") {
    const price = process.env[`ORYNT_STRIPE_PRICE_${planId.toUpperCase()}`]; if (!price) throw new OryntError("invalid_state", 503, "No Stripe price is configured for this plan.");
    const body = new URLSearchParams({ mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1", client_reference_id: orgId, customer_email: email, "metadata[org_id]": orgId, "metadata[plan_id]": planId, "subscription_data[metadata][org_id]": orgId, "subscription_data[metadata][plan_id]": planId, success_url: `${d.config.appBaseUrl}/app/billing?checkout=success`, cancel_url: `${d.config.appBaseUrl}/app/billing?checkout=cancelled` });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${d.config.billingApiKey}`, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15000) });
    const j = await r.json() as { url?: string }; if (!r.ok || !j.url) throw new OryntError("internal", 502, "The billing provider could not start checkout.");
    return { mode: "redirect", plan_id: planId, url: j.url };
  }
  const code = process.env[`ORYNT_PAYSTACK_PLAN_${planId.toUpperCase()}`]; if (!code) throw new OryntError("invalid_state", 503, "No Paystack plan code is configured for this plan.");
  const r = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { authorization: `Bearer ${d.config.billingApiKey}`, "content-type": "application/json" }, body: JSON.stringify({ email, plan: code, callback_url: `${d.config.appBaseUrl}/app/billing?checkout=success`, metadata: { org_id: orgId, plan_id: planId } }), signal: AbortSignal.timeout(15000) });
  const j = await r.json() as { data?: { authorization_url?: string } }; if (!r.ok || !j.data?.authorization_url) throw new OryntError("internal", 502, "The billing provider could not start checkout.");
  return { mode: "redirect", plan_id: planId, url: j.data.authorization_url };
}
/** Sandbox-only: builds a correctly SIGNED event and feeds it through exactly the same verification + processing path as a real webhook. */
export async function sandboxComplete(d: Deps, orgId: string, planId: string) {
  if (d.config.env === "production" || d.config.billingProvider !== "sandbox") throw new OryntError("forbidden", 403, "Sandbox billing is not enabled.");
  const secret = d.config.billingWebhookSecret ?? (() => { throw new OryntError("invalid_state", 503, "ORYNT_BILLING_WEBHOOK_SECRET is not set."); })();
  const now = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify({ id: `evt_sbx_${orgId.slice(0, 8)}_${now}_${Math.random().toString(36).slice(2, 8)}`, type: "checkout.session.completed", created: now, data: { object: { client_reference_id: orgId, customer: `cus_sbx_${orgId.slice(0, 8)}`, subscription: `sub_sbx_${orgId.slice(0, 8)}`, metadata: { org_id: orgId, plan_id: planId } } } });
  const sig = `t=${now},v1=${hmac("sha256", secret, `${now}.${raw}`)}`;
  const ev = parseSandbox(raw, sig, secret, now);
  return applyBillingEvent(d, { ...ev, periodEnd: now + 30 * 86400 }, JSON.parse(raw));
}
export async function cancelSubscription(d: Deps, orgId: string, actorId: string) {
  const s = (await d.pool.query("SELECT * FROM subscriptions WHERE org_id=$1", [orgId])).rows[0];
  if (!s || s.provider === "none" || s.status === "canceled") throw new OryntError("invalid_state", 409, "There is no paid subscription to cancel.");
  if (s.provider === "stripe" && s.provider_subscription_id && d.config.billingApiKey) {
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${s.provider_subscription_id}`, { method: "POST", headers: { authorization: `Bearer ${d.config.billingApiKey}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ cancel_at_period_end: "true" }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new OryntError("internal", 502, "The billing provider could not schedule cancellation.");
  } else if (s.provider === "paystack") throw new OryntError("invalid_state", 501, "Paystack subscriptions are cancelled from the Paystack customer email link; in-app cancellation is not implemented for this provider.");
  await withTx(d.pool, async (tx) => { await tx.query("UPDATE subscriptions SET cancel_at_period_end=true, updated_at=now() WHERE org_id=$1", [orgId]); await appendAudit(tx, orgId, "org", `user:${actorId}`, "billing.cancel_scheduled", `subscription:${s.id}`, {}); });
}
