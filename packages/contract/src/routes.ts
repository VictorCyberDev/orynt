import { z } from "zod";
import type { Permission } from "@orynt/core";
import * as S from "./schemas";

export interface RouteSpec {
  id: string; // operationId
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // fastify style: /v1/obligations/:id
  summary: string;
  tags: string[];
  /** public = no credentials; any = any authenticated principal; otherwise the permission required (fail-closed) */
  auth: "public" | "any" | Permission;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  success: { status: number; schema: z.ZodTypeAny };
  /** "required": request is rejected without an Idempotency-Key header */
  idempotency?: "required" | "optional";
  /** state-changing routes reachable with a browser session need CSRF; true by default for non-GET */
  noCsrf?: boolean;
  /** rate-limit bucket override */
  rate?: "auth" | "default" | "public";
}

const Id = z.object({ id: S.Uuid });
const ok = (schema: z.ZodTypeAny, status = 200) => ({ status, schema });
const Empty = z.object({ ok: z.literal(true) });

export const coreRoutes: RouteSpec[] = [
  // ---- auth -----------------------------------------------------------------------------------------
  { id: "register", method: "POST", path: "/v1/auth/register", summary: "Create an account and a workspace", tags: ["auth"], auth: "public", rate: "auth", noCsrf: true,
    body: z.object({ email: z.string().email().max(200), password: z.string().min(12).max(200), name: z.string().min(1).max(120), workspace_name: z.string().min(1).max(120) }),
    success: ok(S.Me, 201) },
  { id: "login", method: "POST", path: "/v1/auth/login", summary: "Sign in", tags: ["auth"], auth: "public", rate: "auth", noCsrf: true,
    body: z.object({ email: z.string().email(), password: z.string().max(200), mfa_code: z.string().regex(/^\d{6}$/).optional() }), success: ok(S.Me) },
  { id: "logout", method: "POST", path: "/v1/auth/logout", summary: "Sign out", tags: ["auth"], auth: "any", success: ok(Empty) },
  { id: "switchWorkspace", method: "POST", path: "/v1/auth/switch", summary: "Switch the active workspace of this session", tags: ["auth"], auth: "any", body: z.object({ workspace_id: S.Uuid }), success: ok(S.Me) },
  { id: "me", method: "GET", path: "/v1/me", summary: "Current principal, role and permissions", tags: ["auth"], auth: "any", success: ok(S.Me) },
  { id: "registerApprovalKey", method: "POST", path: "/v1/me/approval-key", summary: "Register the Ed25519 public key used to sign approvals", tags: ["auth"], auth: "any",
    body: z.object({ public_key: S.Hex(32), proof_signature: S.Hex(64).describe("signature over the string 'orynt.register-key:' + workspace_id + ':' + public_key, proving possession") }), success: ok(S.Me) },

  // ---- overview ----------------------------------------------------------------------------------------
  { id: "overview", method: "GET", path: "/v1/overview", summary: "Attention queue and live operational state (real queries)", tags: ["overview"], auth: "obligation:read", success: ok(S.Overview) },

  // ---- team ------------------------------------------------------------------------------------------------
  { id: "listMembers", method: "GET", path: "/v1/members", summary: "List workspace members", tags: ["team"], auth: "obligation:read", success: ok(z.object({ data: z.array(S.MemberDto) })) },
  { id: "addMember", method: "POST", path: "/v1/members", summary: "Add a member with a temporary password", tags: ["team"], auth: "member:manage",
    body: z.object({ email: z.string().email(), name: z.string().min(1).max(120), role: S.RoleEnum, temporary_password: z.string().min(12).max(200) }), success: ok(S.MemberDto, 201) },
  { id: "updateMember", method: "PATCH", path: "/v1/members/:id", summary: "Change a member's role or revoke access", tags: ["team"], auth: "member:manage", params: Id,
    body: z.object({ role: S.RoleEnum.optional(), status: z.enum(["active", "revoked"]).optional() }), success: ok(S.MemberDto) },

  // ---- counterparties ---------------------------------------------------------------------------------------
  { id: "listCounterparties", method: "GET", path: "/v1/counterparties", summary: "List payees", tags: ["counterparties"], auth: "obligation:read", query: S.PageQuery, success: ok(S.Page(S.Counterparty)) },
  { id: "createCounterparty", method: "POST", path: "/v1/counterparties", summary: "Create a payee", tags: ["counterparties"], auth: "obligation:create",
    body: z.object({ name: z.string().min(1).max(120), bound_payee_pubkey: S.Hex(33).optional(), notes: z.string().max(500).default("") }), success: ok(S.Counterparty, 201) },
  { id: "updateCounterparty", method: "PATCH", path: "/v1/counterparties/:id", summary: "Bind a payee to a node key / mark verified", tags: ["counterparties"], auth: "policy:manage", params: Id,
    body: z.object({ bound_payee_pubkey: S.Hex(33).optional(), verified: z.boolean().optional(), notes: z.string().max(500).optional() }), success: ok(S.Counterparty) },

  // ---- connections -------------------------------------------------------------------------------------------
  { id: "listConnections", method: "GET", path: "/v1/connections", summary: "List wallet connections (secrets redacted)", tags: ["connections"], auth: "connection:read", success: ok(z.object({ data: z.array(S.Connection) })) },
  { id: "createConnection", method: "POST", path: "/v1/connections", summary: "Connect a wallet; capabilities are discovered, not assumed", tags: ["connections"], auth: "connection:manage",
    body: z.object({
      label: z.string().min(1).max(80), kind: S.ConnectionKind,
      lnd: z.object({ rest_url: z.string().url(), macaroon_hex: z.string().regex(/^[0-9a-f]+$/), tls_cert_pem: z.string().optional() }).optional(),
    }), success: ok(S.Connection, 201) },
  { id: "checkConnection", method: "POST", path: "/v1/connections/:id/check", summary: "Re-run health and capability discovery", tags: ["connections"], auth: "connection:manage", params: Id, success: ok(S.Connection) },
  { id: "disableConnection", method: "DELETE", path: "/v1/connections/:id", summary: "Disable a wallet connection", tags: ["connections"], auth: "connection:manage", params: Id, success: ok(S.Connection) },

  // ---- policies -------------------------------------------------------------------------------------------------
  { id: "listPolicies", method: "GET", path: "/v1/policies", summary: "Approval policies (immutable revisions)", tags: ["policies"], auth: "obligation:read", success: ok(z.object({ data: z.array(S.Policy) })) },
  { id: "createPolicy", method: "POST", path: "/v1/policies", summary: "Publish a new policy revision and activate it", tags: ["policies"], auth: "policy:manage",
    body: z.object({ name: z.string().min(1).max(80), rules: S.Policy.shape.rules }), success: ok(S.Policy, 201) },

  // ---- obligations ------------------------------------------------------------------------------------------------
  { id: "createObligation", method: "POST", path: "/v1/obligations", summary: "Create a payout obligation (draft)", tags: ["obligations"], auth: "obligation:create", body: S.ObligationCreate, idempotency: "optional", success: ok(S.ObligationDto, 201) },
  { id: "listObligations", method: "GET", path: "/v1/obligations", summary: "List obligations", tags: ["obligations"], auth: "obligation:read", query: S.ObligationListQuery, success: ok(S.Page(S.ObligationDto)) },
  { id: "getObligation", method: "GET", path: "/v1/obligations/:id", summary: "Get an obligation with approvals, payment and next safe actions", tags: ["obligations"], auth: "obligation:read", params: Id, success: ok(S.ObligationDto) },
  { id: "reviseObligation", method: "PUT", path: "/v1/obligations/:id", summary: "Create a new immutable revision (voids earlier approvals)", tags: ["obligations"], auth: "obligation:create", params: Id, body: S.ObligationRevise, success: ok(S.ObligationDto) },
  { id: "submitObligation", method: "POST", path: "/v1/obligations/:id/submit", summary: "Freeze the revision, bind policy and request approval", tags: ["obligations"], auth: "obligation:submit", params: Id, success: ok(S.ObligationDto) },
  { id: "approveObligation", method: "POST", path: "/v1/obligations/:id/approve", summary: "Approve with a signature over the intent digest", tags: ["obligations"], auth: "obligation:approve", params: Id, body: S.ApproveBody, success: ok(S.ObligationDto) },
  { id: "rejectObligation", method: "POST", path: "/v1/obligations/:id/reject", summary: "Reject (only before any dispatch)", tags: ["obligations"], auth: "obligation:reject", params: Id, body: S.ReasonBody, success: ok(S.ObligationDto) },
  { id: "cancelObligation", method: "POST", path: "/v1/obligations/:id/cancel", summary: "Cancel (only when no payment can have been sent)", tags: ["obligations"], auth: "obligation:cancel", params: Id, body: S.ReasonBody, success: ok(S.ObligationDto) },
  { id: "executeObligation", method: "POST", path: "/v1/obligations/:id/execute", summary: "Execute an approved obligation exactly once. Returns 202 when the outcome is not yet certain.", tags: ["obligations"], auth: "payment:execute", params: Id, idempotency: "required", success: ok(S.ObligationDto, 200) },

  // ---- payments ---------------------------------------------------------------------------------------------------
  { id: "getPayment", method: "GET", path: "/v1/payments/:id", summary: "Payment intent, attempts and settlement evidence", tags: ["payments"], auth: "obligation:read", params: Id, success: ok(S.PaymentDto) },
  { id: "reconcilePayment", method: "POST", path: "/v1/payments/:id/reconcile", summary: "Ask the wallet for its authoritative record of this payment", tags: ["payments"], auth: "payment:reconcile", params: Id, success: ok(S.ObligationDto) },
  { id: "confirmNotSent", method: "POST", path: "/v1/payments/:id/confirm-not-sent", summary: "Attest, with fresh evidence, that an unresolved payment was never sent", tags: ["payments"], auth: "incident:resolve", params: Id, body: z.object({ note: z.string().min(10).max(500) }), success: ok(S.ObligationDto) },
  { id: "retryPayment", method: "POST", path: "/v1/payments/:id/retry", summary: "Start a new attempt after a PROVEN failure", tags: ["payments"], auth: "payment:execute", params: Id, idempotency: "required", success: ok(S.ObligationDto) },
  { id: "getReceipt", method: "GET", path: "/v1/payments/:id/receipt", summary: "Issue (once) and download the signed receipt for a settled payment", tags: ["payments"], auth: "receipt:read", params: Id, success: ok(S.Receipt) },

  // ---- incidents / audit ---------------------------------------------------------------------------------------------
  { id: "listIncidents", method: "GET", path: "/v1/incidents", summary: "Incidents", tags: ["incidents"], auth: "obligation:read", query: S.PageQuery.extend({ status: z.enum(["open", "resolved"]).optional() }), success: ok(S.Page(S.IncidentDto)) },
  { id: "resolveIncident", method: "POST", path: "/v1/incidents/:id/resolve", summary: "Resolve a manual-review incident", tags: ["incidents"], auth: "incident:resolve", params: Id, body: z.object({ note: z.string().min(5).max(500) }), success: ok(S.IncidentDto) },
  { id: "listAudit", method: "GET", path: "/v1/audit", summary: "Audit log", tags: ["audit"], auth: "audit:read", query: S.PageQuery.extend({ stream: z.string().optional() }), success: ok(S.Page(S.AuditEntryDto)) },
  { id: "verifyAudit", method: "GET", path: "/v1/audit/verify", summary: "Re-verify every audit hash chain in this workspace", tags: ["audit"], auth: "audit:read",
    success: ok(z.object({ ok: z.boolean(), streams: z.number().int(), entries: z.number().int(), broken: z.array(z.object({ stream: z.string(), seq: z.number().int(), error: z.string() })), note: z.string() })) },

  // ---- developer platform -----------------------------------------------------------------------------------------------
  { id: "listApiKeys", method: "GET", path: "/v1/api-keys", summary: "API keys (hash only)", tags: ["developers"], auth: "apikey:manage", success: ok(z.object({ data: z.array(S.ApiKeyDto) })) },
  { id: "createApiKey", method: "POST", path: "/v1/api-keys", summary: "Create an API key (secret shown once)", tags: ["developers"], auth: "apikey:manage",
    body: z.object({ name: z.string().min(1).max(80), role: z.enum(["operator", "developer", "viewer"]) }), success: ok(S.ApiKeyDto.extend({ secret: z.string() }), 201) },
  { id: "revokeApiKey", method: "DELETE", path: "/v1/api-keys/:id", summary: "Revoke an API key", tags: ["developers"], auth: "apikey:manage", params: Id, success: ok(S.ApiKeyDto) },
  { id: "listWebhooks", method: "GET", path: "/v1/webhooks", summary: "Webhook endpoints", tags: ["developers"], auth: "webhook:manage", success: ok(z.object({ data: z.array(S.WebhookDto) })) },
  { id: "createWebhook", method: "POST", path: "/v1/webhooks", summary: "Register a webhook endpoint (signing secret shown once)", tags: ["developers"], auth: "webhook:manage",
    body: z.object({ url: z.string().url(), events: z.array(z.string()).min(1) }), success: ok(S.WebhookDto.extend({ signing_secret: z.string() }), 201) },
  { id: "deleteWebhook", method: "DELETE", path: "/v1/webhooks/:id", summary: "Disable a webhook endpoint", tags: ["developers"], auth: "webhook:manage", params: Id, success: ok(S.WebhookDto) },
  { id: "listDeliveries", method: "GET", path: "/v1/webhooks/:id/deliveries", summary: "Delivery log for an endpoint", tags: ["developers"], auth: "webhook:manage", params: Id, success: ok(z.object({ data: z.array(S.DeliveryDto) })) },

  // ---- public / ops ---------------------------------------------------------------------------------------------------------
  { id: "issuerKeys", method: "GET", path: "/v1/public/issuer-keys", summary: "Receipt-issuer public keys (informational — a trust root must be obtained out-of-band)", tags: ["public"], auth: "public", rate: "public",
    success: ok(z.object({ data: z.array(z.object({ key_id: z.string(), public_key: z.string(), valid_from: z.string() })) })) },
  { id: "createLead", method: "POST", path: "/v1/public/leads", summary: "Request a demo / pilot conversation", tags: ["public"], auth: "public", rate: "public", noCsrf: true,
    body: z.object({ email: z.string().email().max(200), name: z.string().min(1).max(120), organization: z.string().max(200).default(""), message: z.string().max(2000).default(""), consent: z.literal(true), source: z.string().max(60).default("site") }),
    success: ok(Empty, 201) },
  { id: "healthLive", method: "GET", path: "/health/live", summary: "Liveness", tags: ["ops"], auth: "public", rate: "public", success: ok(z.object({ status: z.literal("ok") })) },
  { id: "healthReady", method: "GET", path: "/health/ready", summary: "Readiness (database + migrations)", tags: ["ops"], auth: "public", rate: "public", success: ok(z.object({ status: z.string(), checks: z.record(z.string(), z.string()) })) },
];

const Any = z.record(z.string(), z.unknown());
const Tok = z.object({ token: z.string().min(20).max(200) });
const Pw = z.string().min(12).max(200);
const Role = S.RoleEnum;
export const saasRoutes: RouteSpec[] = [
  // ---- account lifecycle ----
  { id: "verifyEmail", method: "POST", path: "/v1/auth/verify-email", summary: "Confirm an email address with the emailed single-use token", tags: ["auth"], auth: "public", rate: "auth", noCsrf: true, body: Tok, success: ok(Empty) },
  { id: "resendVerification", method: "POST", path: "/v1/auth/resend-verification", summary: "Send another verification email", tags: ["auth"], auth: "any", success: ok(Empty) },
  { id: "forgotPassword", method: "POST", path: "/v1/auth/forgot", summary: "Request a password-reset email (same response whether or not the account exists)", tags: ["auth"], auth: "public", rate: "auth", noCsrf: true, body: z.object({ email: z.string().email() }), success: ok(Empty, 202) },
  { id: "resetPassword", method: "POST", path: "/v1/auth/reset", summary: "Set a new password with the emailed token (signs out every session)", tags: ["auth"], auth: "public", rate: "auth", noCsrf: true, body: Tok.extend({ password: Pw }), success: ok(Empty) },
  { id: "acceptInvite", method: "POST", path: "/v1/auth/accept-invite", summary: "Accept a workspace invitation", tags: ["auth"], auth: "public", rate: "auth", noCsrf: true, body: Tok.extend({ name: z.string().min(1).max(120).optional(), password: Pw, mfa_code: z.string().regex(/^\d{6}$/).optional() }), success: ok(S.Me) },
  { id: "inviteMember", method: "POST", path: "/v1/invitations", summary: "Invite a person by email (expires in 7 days)", tags: ["team"], auth: "member:manage", body: z.object({ email: z.string().email(), role: Role }), success: ok(Empty, 202) },
  { id: "mfaBegin", method: "POST", path: "/v1/me/mfa/begin", summary: "Start TOTP authenticator setup", tags: ["auth"], auth: "any", success: ok(Any) },
  { id: "mfaConfirm", method: "POST", path: "/v1/me/mfa/confirm", summary: "Confirm TOTP setup with a current code", tags: ["auth"], auth: "any", body: z.object({ code: z.string().regex(/^\d{6}$/) }), success: ok(Empty) },
  { id: "closeAccount", method: "POST", path: "/v1/me/close", summary: "Close your own account", tags: ["auth"], auth: "any", body: z.object({ password: z.string().max(200) }), success: ok(Empty) },
  { id: "exportOrgData", method: "GET", path: "/v1/export", summary: "Export all organisation data (no secrets)", tags: ["team"], auth: "member:manage", success: ok(Any) },
  // ---- billing ----
  { id: "listPlans", method: "GET", path: "/v1/plans", summary: "Public plan catalogue (prices are hypotheses)", tags: ["billing"], auth: "public", rate: "public", success: ok(Any) },
  { id: "billingOverview", method: "GET", path: "/v1/billing", summary: "Current plan, status, entitlements and usage", tags: ["billing"], auth: "obligation:read", success: ok(Any) },
  { id: "billingCheckout", method: "POST", path: "/v1/billing/checkout", summary: "Start a hosted checkout for a plan", tags: ["billing"], auth: "billing:manage", body: z.object({ plan_id: z.string() }), success: ok(Any) },
  { id: "billingSandboxComplete", method: "POST", path: "/v1/billing/sandbox/complete", summary: "SANDBOX ONLY: complete a checkout through the real webhook path", tags: ["billing"], auth: "billing:manage", body: z.object({ plan_id: z.string() }), success: ok(Any) },
  { id: "billingCancel", method: "POST", path: "/v1/billing/cancel", summary: "Cancel at the end of the paid period", tags: ["billing"], auth: "billing:manage", success: ok(Empty) },
  { id: "billingWebhook", method: "POST", path: "/v1/billing/webhook/:provider", summary: "Billing-provider webhook (signature-verified, idempotent)", tags: ["billing"], auth: "public", rate: "public", noCsrf: true, params: z.object({ provider: z.enum(["stripe", "paystack", "sandbox"]) }), body: Any, success: ok(Any) },
  { id: "mailWebhook", method: "POST", path: "/v1/mail/webhook/:provider", summary: "Mail-provider delivery-status webhook (signature-verified)", tags: ["ops"], auth: "public", rate: "public", noCsrf: true, params: z.object({ provider: z.enum(["resend"]) }), body: Any, success: ok(Any) },
  // ---- batches ----
  { id: "previewBatch", method: "POST", path: "/v1/batches/preview", summary: "Validate a payout CSV without creating anything", tags: ["batches"], auth: "obligation:create", body: z.object({ csv: z.string().max(400_000) }), success: ok(Any) },
  { id: "createBatch", method: "POST", path: "/v1/batches", summary: "Create a batch of draft payouts from CSV", tags: ["batches"], auth: "obligation:create", body: z.object({ label: z.string().min(1).max(120), csv: z.string().max(400_000), wallet_connection_id: S.Uuid.optional() }), success: ok(Any, 201) },
  { id: "getBatch", method: "GET", path: "/v1/batches/:id", summary: "Batch status with per-item states", tags: ["batches"], auth: "obligation:read", params: Id, success: ok(Any) },
  { id: "submitBatch", method: "POST", path: "/v1/batches/:id/submit", summary: "Submit every draft item for approval", tags: ["batches"], auth: "obligation:submit", params: Id, success: ok(Any) },
  { id: "executeBatch", method: "POST", path: "/v1/batches/:id/execute", summary: "Execute every approved item (each one single-use, individually guarded)", tags: ["batches"], auth: "payment:execute", params: Id, success: ok(Any) },
  // ---- recurring ----
  { id: "listSchedules", method: "GET", path: "/v1/schedules", summary: "Recurring schedules", tags: ["schedules"], auth: "obligation:read", success: ok(Any) },
  { id: "createSchedule", method: "POST", path: "/v1/schedules", summary: "Create a recurring schedule (opens an invoice-needed task each cycle; never pays by itself)", tags: ["schedules"], auth: "obligation:create", body: z.object({ counterparty_id: S.Uuid, amount_sats: z.string(), memo: z.string().max(500).default(""), cadence: z.enum(["weekly", "monthly"]), first_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), wallet_connection_id: S.Uuid.optional() }), success: ok(Any, 201) },
  { id: "scheduleAction", method: "POST", path: "/v1/schedules/:id/:action", summary: "Pause, resume or cancel a schedule", tags: ["schedules"], auth: "obligation:create", params: z.object({ id: S.Uuid, action: z.enum(["pause", "resume", "cancel"]) }), success: ok(Empty) },
  { id: "runDueSchedules", method: "POST", path: "/v1/schedules/run-due", summary: "Open invoice-needed tasks for due schedules now", tags: ["schedules"], auth: "obligation:create", success: ok(Any) },
  { id: "listCycles", method: "GET", path: "/v1/schedule-cycles", summary: "Schedule cycles (invoice-needed tasks)", tags: ["schedules"], auth: "obligation:read", success: ok(Any) },
  { id: "fulfilCycle", method: "POST", path: "/v1/schedule-cycles/:id/invoice", summary: "Provide the invoice for a cycle → creates a normal draft payout", tags: ["schedules"], auth: "obligation:create", params: Id, body: z.object({ invoice: z.string().min(20).max(4000) }), success: ok(S.ObligationDto, 201) },
  // ---- reports ----
  { id: "payoutReport", method: "GET", path: "/v1/reports/payouts", summary: "Payout report (JSON or CSV). Real settlements only are summed; no fiat values.", tags: ["reports"], auth: "report:read", query: z.object({ from: z.string().optional(), to: z.string().optional(), counterparty_id: S.Uuid.optional(), state: z.string().optional(), format: z.enum(["json", "csv"]).default("json") }), success: ok(Any) },
  { id: "recipientStatement", method: "GET", path: "/v1/reports/recipients/:id", summary: "Statement for one recipient", tags: ["reports"], auth: "report:read", params: Id, success: ok(Any) },
  // ---- support, analytics, recipients, incident workbench ----
  { id: "createTicket", method: "POST", path: "/v1/support", summary: "Open a support request (safe diagnostics attached automatically)", tags: ["support"], auth: "support:create", body: z.object({ category: z.enum(["payment", "wallet", "billing", "account", "security", "other"]), subject: z.string().min(3).max(160), body: z.string().min(10).max(4000) }), success: ok(Any, 201) },
  { id: "listTickets", method: "GET", path: "/v1/support", summary: "Your organisation's support requests", tags: ["support"], auth: "support:create", success: ok(Any) },
  { id: "getTicket", method: "GET", path: "/v1/support/:ref", summary: "One of your support requests with the conversation", tags: ["support"], auth: "support:create", params: z.object({ ref: z.string().regex(/^SUP-[0-9A-F]{8}$/) }), success: ok(Any) },
  { id: "publicSupport", method: "POST", path: "/v1/public/support", summary: "Support request without an account", tags: ["public"], auth: "public", rate: "public", noCsrf: true, body: z.object({ email: z.string().email(), category: z.enum(["account", "billing", "security", "other"]), subject: z.string().min(3).max(160), body: z.string().min(10).max(4000) }), success: ok(Any, 201) },
  { id: "resolveLightningAddress", method: "POST", path: "/v1/lnurl/resolve", summary: "Resolve a Lightning Address (LUD-16) into a VERIFIED invoice for an exact amount (amount, network, expiry and description-hash binding checked)", tags: ["obligations"], auth: "obligation:create", body: z.object({ address: z.string().min(3).max(320), amount_msat: S.Msat, wallet_connection_id: S.Uuid.optional() }), success: ok(Any) },
  { id: "funnel", method: "GET", path: "/v1/analytics/funnel", summary: "Counts of your organisation's activation events (no personal data)", tags: ["reports"], auth: "audit:read", success: ok(Any) },
  { id: "recipientAction", method: "POST", path: "/v1/counterparties/:id/:action", summary: "Suspend or reactivate a recipient", tags: ["counterparties"], auth: "policy:manage", params: z.object({ id: S.Uuid, action: z.enum(["suspend", "reactivate"]) }), success: ok(S.Counterparty) },
  { id: "incidentNote", method: "POST", path: "/v1/incidents/:id/notes", summary: "Add an investigation note", tags: ["incidents"], auth: "incident:resolve", params: Id, body: z.object({ note: z.string().min(2).max(2000) }), success: ok(Any, 201) },
  { id: "incidentNotes", method: "GET", path: "/v1/incidents/:id/notes", summary: "Investigation notes", tags: ["incidents"], auth: "obligation:read", params: Id, success: ok(Any) },
  { id: "incidentAssign", method: "POST", path: "/v1/incidents/:id/assign", summary: "Assign an investigator", tags: ["incidents"], auth: "incident:resolve", params: Id, body: z.object({ user_id: S.Uuid.nullable() }), success: ok(Any) },
  { id: "incidentDetail", method: "GET", path: "/v1/incidents/:id", summary: "Incident workbench: payment truth, approvals, attempts, reconciliation runs, notes and a merged evidence timeline", tags: ["incidents"], auth: "obligation:read", params: Id, success: ok(Any) },
  { id: "incidentEvidence", method: "GET", path: "/v1/incidents/:id/evidence", summary: "Download an integrity-hashed evidence bundle for an incident", tags: ["incidents"], auth: "audit:read", params: Id, success: ok(Any) },
  { id: "getOrg", method: "GET", path: "/v1/org", summary: "Organisation profile", tags: ["team"], auth: "obligation:read", success: ok(Any) },
  { id: "updateOrg", method: "PATCH", path: "/v1/org", summary: "Update the organisation profile", tags: ["team"], auth: "member:manage", body: z.object({ name: z.string().min(1).max(120).optional(), country: z.string().regex(/^[A-Z]{2}$/).optional(), timezone: z.string().min(1).max(64).optional(), purpose: z.string().min(3).max(300).optional(), require_mfa: z.boolean().optional() }), success: ok(Any) },
  { id: "listSessions", method: "GET", path: "/v1/me/sessions", summary: "Your signed-in sessions", tags: ["auth"], auth: "obligation:read", success: ok(Any) },
  { id: "revokeSession", method: "DELETE", path: "/v1/me/sessions/:id", summary: "Sign one of your sessions out", tags: ["auth"], auth: "obligation:read", params: Id, success: ok(Any) },
  { id: "revokeOtherSessions", method: "POST", path: "/v1/me/sessions/revoke-others", summary: "Sign out everywhere except here", tags: ["auth"], auth: "obligation:read", success: ok(Any) },
  { id: "transferOwnership", method: "POST", path: "/v1/org/transfer-ownership", summary: "Hand ownership to another verified member (you become admin). Needs your password and, if enabled, an authenticator code", tags: ["team"], auth: "member:manage", body: z.object({ user_id: S.Uuid, password: z.string().max(200) }), success: ok(Any) },
  { id: "closeOrganisation", method: "POST", path: "/v1/org/close", summary: "Close the organisation (refused while any payment is unresolved). Records are retained for 90 days", tags: ["team"], auth: "member:manage", body: z.object({ confirm_name: z.string().min(1).max(120), password: z.string().max(200) }), success: ok(Any) },
  { id: "getOnboarding", method: "GET", path: "/v1/onboarding", summary: "First-customer activation checklist (every step derived from backend state)", tags: ["team"], auth: "obligation:read", success: ok(Any) },
  { id: "ackOnboardingStep", method: "POST", path: "/v1/onboarding/steps/:step/confirm", summary: "Record the explicit decision for the plan or policy step", tags: ["team"], auth: "obligation:read", params: z.object({ step: z.enum(["plan", "policy"]) }), success: ok(Any) },
  { id: "completeOnboarding", method: "POST", path: "/v1/onboarding/complete", summary: "Close onboarding (refused unless every step is done)", tags: ["team"], auth: "member:manage", success: ok(Any) },
];
export const routes: RouteSpec[] = [...coreRoutes, ...saasRoutes];
