import { OryntError } from "@orynt/core";
import * as acc from "../services/accounts";
import * as auth from "../services/auth";
import * as bill from "../services/billing";
import * as bat from "../services/batches";
import * as sch from "../services/schedules";
import * as rep from "../services/reports";
import * as sup from "../services/support";
import * as onb from "../services/onboarding";
import { orgFunnel, track } from "../services/analytics";
import { obligationDto, publicObligation } from "../services/dto";
import { withTx } from "../db/pool";
import { appendAudit } from "../services/audit";
import { actorTag } from "../services/context";
import type { HandlerArgs } from "./handlers";

type Out = { status?: number; body: unknown; contentType?: string };
type H = (a: HandlerArgs) => Promise<Out>;
const need = <T,>(v: T | null): T => { if (!v) throw new OryntError("unauthenticated", 401, "Not signed in."); return v; };
const ok = { ok: true };

export const saasHandlers: Record<string, H> = {
  verifyEmail: async (a) => { await acc.verifyEmail(a.deps, a.body.token); await track(a.deps, "email_verified", null); return { body: ok }; },
  resendVerification: async (a) => { await acc.sendVerification(a.deps, need(a.principal).actor.userId!); return { body: ok }; },
  forgotPassword: async (a) => { await acc.forgotPassword(a.deps, a.body.email); return { status: 202, body: ok }; },
  resetPassword: async (a) => { await acc.resetPassword(a.deps, a.body.token, a.body.password); return { body: ok }; },
  acceptInvite: async (a) => {
    const r = await acc.acceptInvite(a.deps, a.body.token, { name: a.body.name, password: a.body.password }, a.req.headers["user-agent"]);
    a.setSession(a.reply, r.token);
    const p = await auth.principalFromSession(a.deps, r.token);
    return { body: await auth.meOf(a.deps, { ...need(p), csrf: r.csrf }) };
  },
  inviteMember: async (a) => { await acc.invite(a.deps, need(a.principal), a.body.email, a.body.role); return { status: 202, body: ok }; },
  mfaBegin: async (a) => ({ body: await acc.beginMfa(a.deps, need(a.principal).actor.userId!) }),
  mfaConfirm: async (a) => { await acc.confirmMfa(a.deps, need(a.principal).actor.userId!, a.body.code); return { body: ok }; },
  closeAccount: async (a) => { await acc.closeAccount(a.deps, need(a.principal), a.body.password); a.reply.clearCookie("orynt_session", { path: "/" }); return { body: ok }; },
  exportOrgData: async (a) => ({ body: await acc.exportOrgData(a.deps, need(a.ctx).orgId) }),

  listPlans: async (a) => ({ body: { data: (await a.deps.pool.query("SELECT id,name,price_usd_cents,entitlements,is_hypothesis FROM plan_definitions WHERE public ORDER BY sort")).rows, note: "Prices are hypotheses under test, not offers." } }),
  billingOverview: async (a) => ({ body: await bill.billingOverview(a.deps, need(a.ctx).orgId) }),
  billingCheckout: async (a) => { const email = (await a.deps.pool.query("SELECT email FROM users WHERE id=$1", [need(a.principal).actor.userId])).rows[0].email; await track(a.deps, "checkout_started", need(a.ctx).orgId); return { body: await bill.startCheckout(a.deps, need(a.ctx).orgId, a.body.plan_id, email) }; },
  billingSandboxComplete: async (a) => { const r = await bill.sandboxComplete(a.deps, need(a.ctx).orgId, a.body.plan_id); if (r === "applied") await track(a.deps, "subscription_activated", need(a.ctx).orgId); return { body: { result: r, billing: await bill.billingOverview(a.deps, need(a.ctx).orgId) } }; },
  billingCancel: async (a) => { await bill.cancelSubscription(a.deps, need(a.ctx).orgId, need(a.principal).actor.id); return { body: ok }; },
  billingWebhook: async (a) => {
    const raw = (a.req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(a.body);
    const ev = bill.parseWebhook(a.deps, a.params["provider"]!, raw, a.req.headers as Record<string, string | undefined>); // throws 401 on a bad/stale signature
    const r = await bill.applyBillingEvent(a.deps, ev, JSON.parse(raw));
    return { body: { received: true, result: r } }; // duplicates and stale events are acknowledged 200 so the provider stops retrying
  },

  previewBatch: async (a) => ({ body: await bat.previewBatch(a.body.csv) }),
  createBatch: async (a) => ({ status: 201, body: await bat.createBatch(a.deps, need(a.ctx), a.body.label, a.body.csv, a.body.wallet_connection_id) }),
  getBatch: async (a) => ({ body: await bat.batchStatus(a.deps, need(a.ctx).orgId, a.params["id"]!) }),
  submitBatch: async (a) => ({ body: { items: await bat.submitBatch(a.deps, need(a.ctx), a.params["id"]!) } }),
  executeBatch: async (a) => ({ body: { items: await bat.executeBatch(a.deps, need(a.ctx), a.params["id"]!), status: await bat.batchStatus(a.deps, need(a.ctx).orgId, a.params["id"]!) } }),

  listSchedules: async (a) => ({ body: { data: await sch.listSchedules(a.deps, need(a.ctx).orgId) } }),
  createSchedule: async (a) => ({ status: 201, body: await sch.createSchedule(a.deps, need(a.ctx), a.body) }),
  scheduleAction: async (a) => { await sch.setScheduleStatus(a.deps, need(a.ctx), a.params["id"]!, ({ pause: "paused", resume: "active", cancel: "cancelled" } as const)[a.params["action"] as "pause"]); return { body: ok }; },
  runDueSchedules: async (a) => ({ body: { opened: await sch.runDueSchedules(a.deps) } }),
  listCycles: async (a) => ({ body: { data: await sch.listCycles(a.deps, need(a.ctx).orgId) } }),
  fulfilCycle: async (a) => { const id = await sch.fulfilCycle(a.deps, need(a.ctx), a.params["id"]!, a.body.invoice); const v = await obligationDto(a.deps.pool, need(a.ctx).orgId, id, need(a.ctx).actor.role); return { status: 201, body: publicObligation(v!) }; },

  payoutReport: async (a) => {
    const r = await rep.payoutReport(a.deps, need(a.ctx).orgId, a.query);
    return a.query["format"] === "csv" ? { body: rep.payoutReportCsv(r), contentType: "text/csv; charset=utf-8" } : { body: r };
  },
  recipientStatement: async (a) => ({ body: await rep.recipientStatement(a.deps, need(a.ctx).orgId, a.params["id"]!) }),

  createTicket: async (a) => ({ status: 201, body: await sup.createTicket(a.deps, need(a.principal), a.body, a.req.id) }),
  listTickets: async (a) => ({ body: { data: await sup.listTickets(a.deps, need(a.ctx).orgId) } }),
  publicSupport: async (a) => ({ status: 201, body: await sup.createTicket(a.deps, null, a.body, a.req.id) }),
  resolveLightningAddress: async (a) => {
    const c = need(a.ctx);
    const conns = (await a.deps.pool.query("SELECT network FROM wallet_connections WHERE org_id=$1 AND status='active' AND ($2::uuid IS NULL OR id=$2) ORDER BY created_at", [c.orgId, a.body.wallet_connection_id ?? null])).rows;
    if (conns.length !== 1) throw new OryntError("validation_failed", 422, conns.length ? "More than one wallet is connected: choose which wallet will pay." : "Connect a wallet first.");
    return { body: await (await import("../services/lnurl")).resolveLightningAddress(a.deps, a.body.address, a.body.amount_msat, conns[0].network) };
  },
  getOrg: async (a) => ({ body: await onb.getOrg(a.deps, need(a.ctx).orgId) }),
  updateOrg: async (a) => ({ body: await onb.updateOrg(a.deps, need(a.ctx), a.body) }),
  getOnboarding: async (a) => ({ body: await onb.onboarding(a.deps, need(a.ctx).orgId, need(a.principal).actor.userId) }),
  ackOnboardingStep: async (a) => {
    const step = a.params["step"] as "plan" | "policy";
    const role = need(a.principal).actor.role;
    if (role === "system" || !(step === "plan" ? ["owner", "admin"] : ["owner", "admin"]).includes(role)) throw new OryntError("forbidden", 403, "Only an owner or admin can confirm this step.");
    await onb.acknowledge(a.deps, need(a.ctx), step);
    return { body: await onb.onboarding(a.deps, need(a.ctx).orgId, need(a.principal).actor.userId) };
  },
  completeOnboarding: async (a) => ({ body: await onb.complete(a.deps, need(a.ctx)) }),
  funnel: async (a) => ({ body: { data: await orgFunnel(a.deps, need(a.ctx).orgId) } }),

  recipientAction: async (a) => {
    const c = need(a.ctx);
    const r = await withTx(a.deps.pool, async (tx) => {
      const row = (await tx.query("UPDATE counterparties SET suspended_at = CASE WHEN $3='suspend' THEN now() ELSE NULL END WHERE id=$1 AND org_id=$2 RETURNING *", [a.params["id"], c.orgId, a.params["action"]])).rows[0];
      if (!row) throw new OryntError("not_found", 404, "Recipient not found.");
      await appendAudit(tx, c.orgId, "org", actorTag(c.actor), `counterparty.${a.params["action"]}`, `counterparty:${row.id}`, {});
      return row;
    });
    return { body: { id: r.id, name: r.name, bound_payee_pubkey: r.bound_payee_pubkey, verified: !!r.verified_at, notes: r.notes, created_at: new Date(r.created_at).toISOString(), suspended: !!r.suspended_at } };
  },
  incidentNote: async (a) => {
    const c = need(a.ctx);
    const inc = (await a.deps.pool.query("SELECT id FROM incidents WHERE id=$1 AND org_id=$2", [a.params["id"], c.orgId])).rows[0]; if (!inc) throw new OryntError("not_found", 404, "Incident not found.");
    await a.deps.pool.query("INSERT INTO incident_notes(incident_id,org_id,author,note) VALUES ($1,$2,$3,$4)", [inc.id, c.orgId, c.actor.name, a.body.note]);
    return { status: 201, body: ok };
  },
  incidentNotes: async (a) => ({ body: { data: (await a.deps.pool.query("SELECT n.author, n.note, n.created_at FROM incident_notes n JOIN incidents i ON i.id=n.incident_id WHERE n.incident_id=$1 AND i.org_id=$2 ORDER BY n.created_at", [a.params["id"], need(a.ctx).orgId])).rows } }),
  incidentAssign: async (a) => {
    const c = need(a.ctx);
    if (a.body.user_id && !(await a.deps.pool.query("SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2 AND status='active'", [c.orgId, a.body.user_id])).rowCount) throw new OryntError("validation_failed", 422, "That person is not a member of this workspace.");
    const r = await a.deps.pool.query("UPDATE incidents SET assigned_to=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [a.params["id"], c.orgId, a.body.user_id]);
    if (!r.rowCount) throw new OryntError("not_found", 404, "Incident not found.");
    return { body: { id: r.rows[0].id, assigned_to: a.body.user_id } };
  },
};
