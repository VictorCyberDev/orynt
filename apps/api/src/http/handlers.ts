import type { FastifyReply, FastifyRequest } from "fastify";
import { OryntError } from "@orynt/core";
import type { Ctx, Deps } from "../services/context";
import * as auth from "../services/auth";
import * as ob from "../services/obligations";
import * as ex from "../services/execution";
import * as rc from "../services/reconcile";
import * as admin from "../services/admin";
import { issueReceipt } from "../services/receipts";
import { verifyAllStreams } from "../services/audit";
import { obligationDto, publicObligation, paymentDto } from "../services/dto";
import { listObligationIds, overview } from "../services/overview";
import { pendingMigrations } from "../db/migrate";

export interface HandlerArgs {
  deps: Deps; ctx: Ctx | null; principal: auth.Principal | null; params: Record<string, string>; query: Record<string, any>; body: any;
  req: FastifyRequest; reply: FastifyReply; setSession: (reply: FastifyReply, token: string) => unknown;
}
type Out = { status?: number; body: unknown };
type H = (a: HandlerArgs) => Promise<Out>;

const need = <T,>(v: T | null): T => { if (!v) throw new OryntError("unauthenticated", 401, "Not signed in."); return v; };
const view = async (a: HandlerArgs, id: string, status?: number): Promise<Out> => {
  const c = need(a.ctx);
  const v = await obligationDto(a.deps.pool, c.orgId, id, c.actor.role);
  if (!v) throw new OryntError("not_found", 404, "Payout not found.");
  return { status, body: publicObligation(v) };
};
const sessionFor = async (a: HandlerArgs, r: { userId: string; orgId: string; token: string; csrf: string }): Promise<Out> => {
  a.setSession(a.reply, r.token);
  const p = await auth.principalFromSession(a.deps, r.token);
  return { body: await auth.meOf(a.deps, { ...need(p), csrf: r.csrf }) };
};

export const handlers: Record<string, H> = {
  register: async (a) => { const r = await auth.register(a.deps, a.body, a.req.headers["user-agent"]); const o = await sessionFor(a, r); return { status: 201, body: o.body }; },
  login: async (a) => sessionFor(a, await auth.login(a.deps, a.body.email, a.body.password, a.req.headers["user-agent"])),
  logout: async (a) => { if (a.principal?.sessionId) await auth.revokeSession(a.deps, a.principal.sessionId); a.reply.clearCookie("orynt_session", { path: "/" }); return { body: { ok: true } }; },
  switchWorkspace: async (a) => { await auth.switchWorkspace(a.deps, need(a.principal), a.body.workspace_id); const p = await auth.principalFromSession(a.deps, a.req.cookies["orynt_session"]!); return { body: await auth.meOf(a.deps, need(p)) }; },
  me: async (a) => ({ body: await auth.meOf(a.deps, need(a.principal)) }),
  registerApprovalKey: async (a) => { await auth.registerApprovalKey(a.deps, need(a.principal), a.body.public_key, a.body.proof_signature); return { body: await auth.meOf(a.deps, need(a.principal)) }; },
  overview: async (a) => ({ body: await overview(a.deps, need(a.ctx).orgId, a.principal?.actor.userId, need(a.principal).role) }),

  listMembers: async (a) => ({ body: await auth.listMembers(a.deps, need(a.ctx).orgId) }),
  addMember: async (a) => ({ status: 201, body: await auth.addMember(a.deps, need(a.principal), a.body) }),
  updateMember: async (a) => ({ body: await auth.updateMember(a.deps, need(a.principal), a.params["id"]!, a.body) }),

  listCounterparties: async (a) => ({ body: await admin.listCounterparties(a.deps, need(a.ctx).orgId, a.query["limit"]) }),
  createCounterparty: async (a) => ({ status: 201, body: await admin.createCounterparty(a.deps, need(a.ctx), a.body) }),
  updateCounterparty: async (a) => ({ body: await admin.updateCounterparty(a.deps, need(a.ctx), a.params["id"]!, a.body) }),

  listConnections: async (a) => ({ body: await admin.listConnections(a.deps, need(a.ctx).orgId) }),
  createConnection: async (a) => ({ status: 201, body: await admin.createConnection(a.deps, need(a.ctx), a.body) }),
  checkConnection: async (a) => ({ body: await admin.checkConnection(a.deps, need(a.ctx), a.params["id"]!) }),
  disableConnection: async (a) => ({ body: await admin.disableConnection(a.deps, need(a.ctx), a.params["id"]!) }),

  listPolicies: async (a) => ({ body: await admin.listPolicies(a.deps, need(a.ctx).orgId) }),
  createPolicy: async (a) => ({ status: 201, body: await admin.createPolicy(a.deps, need(a.ctx), a.body.name, a.body.rules) }),

  createObligation: async (a) => { const id = await ob.createObligation(a.deps, need(a.ctx), a.body); return view(a, id, 201); },
  listObligations: async (a) => {
    const c = need(a.ctx);
    const q = a.query;
    let state = q["state"] as string | undefined;
    if (q["needs"] === "my_approval") state = "AWAITING_APPROVAL";
    if (q["needs"] === "attention") state = "AWAITING_APPROVAL,APPROVED,UNKNOWN,RECONCILING,PENDING,DISPATCHING,DEFINITIVELY_FAILED";
    const r = await listObligationIds(a.deps, c.orgId, { state, q: q["q"], cursor: q["cursor"], limit: q["limit"] });
    const data = [];
    for (const id of r.ids) { const v = await obligationDto(a.deps.pool, c.orgId, id, c.actor.role); if (v) data.push(publicObligation(v)); }
    return { body: { data, next_cursor: r.next } };
  },
  getObligation: async (a) => view(a, a.params["id"]!),
  reviseObligation: async (a) => { await ob.reviseObligation(a.deps, need(a.ctx), a.params["id"]!, a.body); return view(a, a.params["id"]!); },
  submitObligation: async (a) => { await ob.submitObligation(a.deps, need(a.ctx), a.params["id"]!); return view(a, a.params["id"]!); },
  approveObligation: async (a) => { await ob.approveObligation(a.deps, need(a.ctx), a.params["id"]!, a.body); return view(a, a.params["id"]!); },
  rejectObligation: async (a) => { await ob.rejectObligation(a.deps, need(a.ctx), a.params["id"]!, a.body.reason); return view(a, a.params["id"]!); },
  cancelObligation: async (a) => { await ob.cancelObligation(a.deps, need(a.ctx), a.params["id"]!, a.body.reason); return view(a, a.params["id"]!); },
  executeObligation: async (a) => { const r = await ex.executeObligation(a.deps, need(a.ctx), a.params["id"]!, "execute"); return view(a, r.obligationId, r.httpStatus); },

  getPayment: async (a) => {
    const c = need(a.ctx);
    const it = (await a.deps.pool.query("SELECT * FROM payment_intents WHERE id=$1 AND org_id=$2", [a.params["id"], c.orgId])).rows[0];
    if (!it) throw new OryntError("not_found", 404, "Payment not found.");
    const conn = (await a.deps.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [it.wallet_connection_id])).rows[0];
    const o = (await a.deps.pool.query("SELECT * FROM payout_obligations WHERE id=$1", [it.obligation_id])).rows[0];
    return { body: await paymentDto(a.deps.pool, it, conn, o) };
  },
  reconcilePayment: async (a) => {
    const c = need(a.ctx);
    const it = (await a.deps.pool.query("SELECT obligation_id FROM payment_intents WHERE id=$1 AND org_id=$2", [a.params["id"], c.orgId])).rows[0];
    if (!it) throw new OryntError("not_found", 404, "Payment not found.");
    const r = await rc.reconcileObligation(a.deps, c, it.obligation_id, "operator");
    if (r === "NOTHING_TO_DO") throw new OryntError("invalid_state", 409, "This payment has nothing to reconcile.");
    return view(a, it.obligation_id, r === "BUSY" ? 202 : 200);
  },
  confirmNotSent: async (a) => { const id = await rc.confirmNotSent(a.deps, need(a.ctx), a.params["id"]!, a.body.note); return view(a, id); },
  retryPayment: async (a) => {
    const c = need(a.ctx);
    const it = (await a.deps.pool.query("SELECT obligation_id FROM payment_intents WHERE id=$1 AND org_id=$2", [a.params["id"], c.orgId])).rows[0];
    if (!it) throw new OryntError("not_found", 404, "Payment not found.");
    const r = await ex.executeObligation(a.deps, c, it.obligation_id, "retry");
    return view(a, r.obligationId, r.httpStatus);
  },
  getReceipt: async (a) => ({ body: await issueReceipt(a.deps, need(a.ctx), a.params["id"]!) }),

  listIncidents: async (a) => ({ body: await admin.listIncidents(a.deps, need(a.ctx).orgId, a.query["status"], a.query["limit"]) }),
  resolveIncident: async (a) => ({ body: await admin.resolveIncident(a.deps, need(a.ctx), a.params["id"]!, a.body.note) }),
  listAudit: async (a) => ({ body: await admin.listAudit(a.deps, need(a.ctx).orgId, a.query["stream"], a.query["cursor"], a.query["limit"]) }),
  verifyAudit: async (a) => ({ body: await verifyAllStreams(a.deps, need(a.ctx).orgId) }),

  listApiKeys: async (a) => ({ body: await admin.listApiKeys(a.deps, need(a.ctx).orgId) }),
  createApiKey: async (a) => ({ status: 201, body: await auth.createApiKey(a.deps, need(a.principal), a.body) }),
  revokeApiKey: async (a) => ({ body: await admin.revokeApiKey(a.deps, need(a.ctx), a.params["id"]!) }),
  listWebhooks: async (a) => ({ body: await admin.listWebhooks(a.deps, need(a.ctx).orgId) }),
  createWebhook: async (a) => ({ status: 201, body: await admin.createWebhook(a.deps, need(a.ctx), a.body) }),
  deleteWebhook: async (a) => ({ body: await admin.deleteWebhook(a.deps, need(a.ctx), a.params["id"]!) }),
  listDeliveries: async (a) => ({ body: await admin.listDeliveries(a.deps, need(a.ctx), a.params["id"]!) }),

  issuerKeys: async (a) => ({ body: { data: (await a.deps.pool.query("SELECT key_id, public_key, valid_from FROM issuer_keys ORDER BY valid_from")).rows.map((r) => ({ key_id: r.key_id, public_key: r.public_key, valid_from: new Date(r.valid_from).toISOString() })) } }),
  createLead: async (a) => { await admin.createLead(a.deps, a.body); return { status: 201, body: { ok: true } }; },
  healthLive: async () => ({ body: { status: "ok" } }),
  healthReady: async (a) => {
    const checks: Record<string, string> = {};
    try { await a.deps.pool.query("SELECT 1"); checks["database"] = "ok"; } catch { checks["database"] = "unavailable"; }
    try { const p = await pendingMigrations(a.deps.pool); checks["migrations"] = p.length ? `pending: ${p.join(",")}` : "ok"; } catch { checks["migrations"] = "unknown"; }
    const ok = Object.values(checks).every((v) => v === "ok");
    return { status: ok ? 200 : 503, body: { status: ok ? "ready" : "not_ready", checks } };
  },
};
