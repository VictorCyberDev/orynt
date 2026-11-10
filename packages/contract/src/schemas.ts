import { z } from "zod";
import { PROBLEM_CODES, ROLES, STATES, PolicyRulesSchema } from "@orynt/core";

export const Msat = z.string().regex(/^(0|[1-9][0-9]{0,30})$/).describe("Integer millisatoshis as a decimal string. Never a float.");
export const Uuid = z.string().uuid();
export const Iso = z.string().describe("ISO-8601 UTC timestamp");
export const Hex = (n?: number) => z.string().regex(n ? new RegExp(`^[0-9a-f]{${n * 2}}$`) : /^[0-9a-f]+$/);
export const NetworkEnum = z.enum(["mainnet", "testnet", "signet", "regtest"]);
export const StateEnum = z.enum(STATES);
export const RoleEnum = z.enum(ROLES);

export const Problem = z.object({
  type: z.string(), title: z.string(), status: z.number().int(), code: z.enum(PROBLEM_CODES),
  detail: z.string().optional(), instance: z.string().optional(), request_id: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export const Page = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item), next_cursor: z.string().nullable() });
export const PageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });

export const User = z.object({ id: Uuid, email: z.string(), name: z.string() });
export const Workspace = z.object({ id: Uuid, name: z.string(), slug: z.string() });
export const Me = z.object({
  user: User, workspace: Workspace, role: RoleEnum, permissions: z.array(z.string()), csrf_token: z.string().optional(),
  approval_key: z.object({ registered: z.boolean(), public_key: z.string().nullable() }),
  workspaces: z.array(Workspace.extend({ role: RoleEnum })),
  auth: z.enum(["session", "api_key"]),
});

export const Counterparty = z.object({
  id: Uuid, name: z.string(), bound_payee_pubkey: z.string().nullable(), verified: z.boolean(), notes: z.string(), created_at: Iso,
});

export const ConnectionKind = z.enum(["lnd", "simulator"]);
export const Connection = z.object({
  id: Uuid, label: z.string(), kind: z.enum(["lnd", "nwc", "simulator"]), network: NetworkEnum, node_pubkey: z.string().nullable(),
  is_simulator: z.boolean(), status: z.enum(["active", "disabled", "error"]),
  health: z.object({ ok: z.boolean().nullable(), checked_at: Iso.nullable(), error: z.string().nullable() }),
  capabilities: z.object({ can_send: z.string(), can_lookup: z.string(), can_read_info: z.string(), notes: z.array(z.string()), discovered_at: Iso.nullable() }),
  config_summary: z.record(z.string(), z.string()).describe("Redacted. Secrets are never returned."),
  created_at: Iso,
});

export const Policy = z.object({ id: Uuid, name: z.string(), revision: z.number().int(), active: z.boolean(), rules: PolicyRulesSchema, digest: z.string(), created_at: Iso });

export const Actions = z.array(z.object({ action: z.string(), allowed: z.boolean(), reason: z.string().optional() }));

export const ApprovalDto = z.object({
  id: Uuid, approver: z.object({ user_id: Uuid, name: z.string(), role: z.string() }), decision: z.enum(["approved", "rejected"]),
  public_key: z.string(), intent_digest: z.string(), signed_at: Iso, reason: z.string().nullable(), valid: z.boolean(), revoked_reason: z.string().nullable(),
});

export const AttemptDto = z.object({
  attempt_no: z.number().int(), started_at: Iso, dispatched_at: Iso.nullable(), outcome: z.string(), provider_status: z.string().nullable(),
  failure_reason: z.string().nullable(), fee_msat: Msat.nullable(), finished_at: Iso.nullable(), note: z.string(),
});

export const PaymentDto = z.object({
  id: Uuid, obligation_id: Uuid, payment_hash: Hex(32), amount_msat: Msat, network: NetworkEnum, intent_digest: Hex(32),
  wallet_connection_id: Uuid, provider_kind: z.string(), is_simulator: z.boolean(), attempts: z.array(AttemptDto),
  settlement: z.object({ preimage: Hex(32), settled_at: Iso, fee_msat: Msat, amount_msat: Msat, reconciled_after_uncertainty: z.boolean() }).nullable(),
  reconciliation: z.object({ runs: z.number().int(), last_run_at: Iso.nullable(), last_result: z.string().nullable(), next_run_at: Iso.nullable() }),
});

export const IncidentDto = z.object({
  id: Uuid, obligation_id: Uuid.nullable(), kind: z.string(), severity: z.enum(["info", "warning", "critical"]), status: z.enum(["open", "resolved"]),
  summary: z.string(), detail: z.record(z.string(), z.unknown()), opened_at: Iso, resolved_at: Iso.nullable(), resolution: z.string().nullable(),
});

export const ObligationDto = z.object({
  id: Uuid, ref: z.string(), state: StateEnum, current_revision: z.number().int(),
  counterparty: Counterparty.pick({ id: true, name: true, bound_payee_pubkey: true, verified: true }),
  amount_msat: Msat, memo: z.string(), external_ref: z.string(), network: NetworkEnum, invoice: z.string(), payment_hash: Hex(32),
  payee_pubkey: Hex(33), invoice_expires_at: Iso, wallet_connection_id: Uuid.nullable(),
  policy: z.object({ id: Uuid, revision: z.number().int(), required_approvals: z.number().int() }).nullable(),
  intent_digest: Hex(32).nullable(), revision_hash: Hex(32),
  approvals: z.array(ApprovalDto), created_by: z.object({ id: Uuid, name: z.string() }), created_at: Iso, updated_at: Iso,
  actions: Actions, payment: PaymentDto.nullable(), open_incident: IncidentDto.nullable(),
  environment: z.enum(["REAL_PROVIDER", "SIMULATOR", "UNASSIGNED"]),
  explanation: z.object({ headline: z.string(), known: z.array(z.string()), unknown: z.array(z.string()), next: z.string() }),
});

export const ObligationCreate = z.object({
  counterparty_id: Uuid.optional(), counterparty_name: z.string().min(1).max(120).optional(),
  amount_msat: Msat, memo: z.string().max(500).default(""), external_ref: z.string().max(120).default(""),
  invoice: z.string().min(20).max(4000), wallet_connection_id: Uuid.optional(),
}).refine((v) => !!v.counterparty_id !== !!v.counterparty_name, { message: "provide exactly one of counterparty_id or counterparty_name" });
export const ObligationRevise = z.object({
  amount_msat: Msat.optional(), memo: z.string().max(500).optional(), external_ref: z.string().max(120).optional(),
  invoice: z.string().min(20).max(4000).optional(), counterparty_id: Uuid.optional(), wallet_connection_id: Uuid.optional(),
});
export const ObligationListQuery = PageQuery.extend({ state: z.string().optional(), q: z.string().max(100).optional(), needs: z.enum(["my_approval", "attention"]).optional() });

export const ApproveBody = z.object({ intent_digest: Hex(32), signed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/, "must be an ISO-8601 UTC timestamp like 2026-11-09T12:00:00Z"), signature: Hex(64), mfa_code: z.string().regex(/^\d{6}$/).optional() });
export const ReasonBody = z.object({ reason: z.string().min(1).max(500) });

export const Receipt = z.record(z.string(), z.unknown()).describe("orynt.receipt/1 — see @orynt/core ReceiptSchema");

export const Overview = z.object({
  generated_at: Iso,
  attention: z.array(z.object({ kind: z.enum(["approval_needed", "unresolved_payment", "failed_payment", "invoice_expiring", "wallet_problem", "ready_to_send"]), obligation_id: Uuid.nullable(), ref: z.string().nullable(), title: z.string(), detail: z.string(), since: Iso })),
  counts: z.record(z.string(), z.number().int()),
  settled_last_7d: z.object({ count: z.number().int(), total_msat: Msat }),
  wallet: z.object({ connected: z.boolean(), healthy: z.boolean().nullable(), simulator_only: z.boolean() }),
  duplicates_blocked: z.number().int(),
});

export const AuditEntryDto = z.object({ seq: z.number().int(), stream: z.string(), at: Iso, actor: z.string(), type: z.string(), subject: z.string(), data: z.record(z.string(), z.unknown()), hash: z.string(), prev_hash: z.string() });
export const ApiKeyDto = z.object({ id: Uuid, name: z.string(), prefix: z.string(), role: RoleEnum, created_at: Iso, last_used_at: Iso.nullable(), revoked_at: Iso.nullable() });
export const WebhookDto = z.object({ id: Uuid, url: z.string(), events: z.array(z.string()), status: z.string(), created_at: Iso });
export const MemberDto = z.object({ id: Uuid, user: User, role: RoleEnum, status: z.string(), approval_key_registered: z.boolean(), created_at: Iso });
export const DeliveryDto = z.object({ id: Uuid, event_id: Uuid, event_type: z.string(), status: z.string(), attempt: z.number().int(), last_status_code: z.number().int().nullable(), last_error: z.string().nullable(), created_at: Iso, delivered_at: Iso.nullable() });
