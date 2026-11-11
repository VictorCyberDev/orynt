import { randomBytes } from "node:crypto";
import { OryntError, hashCanonical, policyDigestInput, type PolicyRules } from "@orynt/core";
import { withTx } from "../db/pool";
import { seal } from "../lib/box";
import { vetWebhookTarget } from "../lib/ssrf";
import { appendAudit } from "./audit";
import { actorTag, iso, isoMs, type Ctx, type Deps } from "./context";
import { providerFor, simulatorFor, type ConnectionRow } from "./providers";
import { newSigningSecret, sealSecret } from "./webhooks";
import { resolveIncidents } from "./incidents";
import { lockObligation } from "./state";
import { checkEntitlement } from "./entitlements";
import { track } from "./analytics";
import { requireVerifiedEmail } from "./gates";

// ---- connections --------------------------------------------------------------------------------------------------------
export async function connectionDto(d: Deps, row: Record<string, any>) {
  const cap = (await d.pool.query("SELECT * FROM provider_capabilities WHERE wallet_connection_id=$1 ORDER BY discovered_at DESC LIMIT 1", [row.id])).rows[0];
  let summary: Record<string, string> = {};
  if (row.provider_kind === "lnd" && row.config_ciphertext) {
    try { const { open } = await import("../lib/box"); const c = JSON.parse(open(d.config.secretKey, row.config_ciphertext, row.id)); summary = { rest_host: new URL(c.rest_url).host, macaroon: "stored encrypted — never shown", tls: c.tls_cert_pem ? "certificate pinned" : "system trust" }; } catch { summary = { error: "credentials unreadable" }; }
  } else if (row.provider_kind === "simulator") summary = { note: "Simulator: no real value moves. Receipts are labelled SIMULATED." };
  return {
    id: row.id, label: row.label, kind: row.provider_kind, network: row.network, node_pubkey: row.node_pubkey, is_simulator: row.provider_kind === "simulator", status: row.status,
    health: { ok: row.last_health_ok, checked_at: row.last_health_at ? isoMs(row.last_health_at) : null, error: row.last_error },
    capabilities: { can_send: cap?.can_send ?? "unknown", can_lookup: cap?.can_lookup ?? "unknown", can_read_info: cap?.can_read_info ?? "unknown", notes: cap?.notes ?? [], discovered_at: cap ? isoMs(cap.discovered_at) : null },
    config_summary: summary, created_at: isoMs(row.created_at),
  };
}

async function probe(d: Deps, row: ConnectionRow) {
  const p = providerFor(d, row);
  const info = await p.getInfo();
  const caps = await p.discoverCapabilities();
  return { info, caps };
}

export async function createConnection(d: Deps, ctx: Ctx, input: { label: string; kind: "lnd" | "simulator"; lnd?: { rest_url: string; macaroon_hex: string; tls_cert_pem?: string } }) {
  await checkEntitlement(d, ctx.orgId, "wallets");
  if (input.kind === "lnd") await requireVerifiedEmail(d, ctx); // the practice wallet needs no verification; a real wallet does
  if (input.kind === "simulator" && d.config.env === "production") throw new OryntError("validation_failed", 422, "The simulator is not available in production.");
  if (input.kind === "lnd" && !input.lnd) throw new OryntError("validation_failed", 422, "LND connection details are required.");
  if (input.kind === "lnd") {
    // vet the wallet URL like a webhook target: https required and private/metadata addresses refused outside development (macaroons must not cross cleartext or reach internal services)
    try { await vetWebhookTarget(input.lnd!.rest_url, d.config.allowPrivateWebhookTargets); } catch (e) { throw new OryntError("validation_failed", 422, `Wallet address rejected: ${(e as Error).message}.`); }
  }
  const id = (await d.pool.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
  const userId = ctx.actor.userId ?? (await d.pool.query("SELECT created_by FROM api_keys WHERE id=$1", [ctx.actor.id])).rows[0]?.created_by;
  const blob = input.kind === "lnd" ? seal(d.config.secretKey, JSON.stringify(input.lnd), id) : null;
  const tmp: ConnectionRow = { id, org_id: ctx.orgId, provider_kind: input.kind, network: "regtest", config_ciphertext: blob };
  let info, caps;
  try { ({ info, caps } = await probe(d, tmp)); } catch (e) { throw new OryntError("wallet_unavailable", 422, d.config.env === "production" ? "Orynt could not connect to that wallet or its credential was rejected. Nothing was saved." : `Orynt could not connect to that wallet: ${(e as Error).message}. Nothing was saved.`); }
  // network and node identity come from the NODE, never from the user's claim
  if (info.network === "mainnet" && !d.config.allowMainnet) throw new OryntError("mainnet_disabled", 422, "This wallet is on mainnet, which is disabled on this server. Use a regtest or signet wallet.");
  await withTx(d.pool, async (tx) => {
    await tx.query("INSERT INTO wallet_connections(id,org_id,label,provider_kind,network,node_pubkey,config_ciphertext,status,last_health_at,last_health_ok,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',now(),true,$8)", [id, ctx.orgId, input.label, input.kind, info.network, info.nodePubkey, blob, userId]);
    await tx.query("INSERT INTO provider_capabilities(wallet_connection_id,can_send,can_lookup,can_read_info,notes) VALUES ($1,$2,$3,$4,$5)", [id, String(caps.canSendPayments), String(caps.canLookupPayments), String(caps.canReadInfo), JSON.stringify(caps.notes)]);
    await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "connection.created", `connection:${id}`, { kind: input.kind, network: info.network, node_pubkey: info.nodePubkey, can_send: caps.canSendPayments, can_lookup: caps.canLookupPayments });
  });
  if (input.kind === "simulator") simulatorFor(id, info.network);
  await track(d, "wallet_connected", ctx.orgId);
  return connectionDto(d, (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [id])).rows[0]);
}
export async function listConnections(d: Deps, orgId: string) {
  const rows = (await d.pool.query("SELECT * FROM wallet_connections WHERE org_id=$1 ORDER BY created_at", [orgId])).rows;
  return { data: await Promise.all(rows.map((r) => connectionDto(d, r))) };
}
export async function checkConnection(d: Deps, ctx: Ctx, id: string) {
  const row = (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1 AND org_id=$2", [id, ctx.orgId])).rows[0];
  if (!row) throw new OryntError("not_found", 404, "Connection not found.");
  try {
    const { info, caps } = await probe(d, row);
    await d.pool.query("INSERT INTO provider_capabilities(wallet_connection_id,can_send,can_lookup,can_read_info,notes) VALUES ($1,$2,$3,$4,$5)", [id, String(caps.canSendPayments), String(caps.canLookupPayments), String(caps.canReadInfo), JSON.stringify(caps.notes)]);
    const netChanged = info.network !== row.network;
    await d.pool.query("UPDATE wallet_connections SET last_health_at=now(), last_health_ok=$2, last_error=$3, status=$4 WHERE id=$1", [id, !netChanged, netChanged ? `Wallet now reports ${info.network}, expected ${row.network}` : null, netChanged ? "error" : row.status === "error" ? "active" : row.status]);
  } catch (e) { await d.pool.query("UPDATE wallet_connections SET last_health_at=now(), last_health_ok=false, last_error=$2 WHERE id=$1", [id, (e as Error).message.slice(0, 300)]); }
  return connectionDto(d, (await d.pool.query("SELECT * FROM wallet_connections WHERE id=$1", [id])).rows[0]);
}
export async function disableConnection(d: Deps, ctx: Ctx, id: string) {
  const busy = (await d.pool.query("SELECT count(*)::int AS n FROM payout_obligations WHERE wallet_connection_id=$1 AND state IN ('EXECUTION_RESERVED','DISPATCHING','PENDING','UNKNOWN','RECONCILING')", [id])).rows[0].n;
  if (busy) throw new OryntError("conflict", 409, "This wallet has unresolved payments. Resolve them before disconnecting.");
  const r = await d.pool.query("UPDATE wallet_connections SET status='disabled' WHERE id=$1 AND org_id=$2 RETURNING *", [id, ctx.orgId]);
  if (!r.rowCount) throw new OryntError("not_found", 404, "Connection not found.");
  await withTx(d.pool, (tx) => appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "connection.disabled", `connection:${id}`, {}));
  return connectionDto(d, r.rows[0]);
}

// ---- policies / counterparties -------------------------------------------------------------------------------------------------
const polDto = (r: Record<string, any>) => ({ id: r.id, name: r.name, revision: r.revision, active: r.active, rules: r.rules, digest: r.digest, created_at: isoMs(r.created_at) });
export async function listPolicies(d: Deps, orgId: string) { return { data: (await d.pool.query("SELECT * FROM approval_policies WHERE org_id=$1 ORDER BY name, revision DESC", [orgId])).rows.map(polDto) }; }
export async function createPolicy(d: Deps, ctx: Ctx, name: string, rules: PolicyRules) {
  return withTx(d.pool, async (tx) => {
    const rev = ((await tx.query("SELECT COALESCE(max(revision),0)+1 AS r FROM approval_policies WHERE org_id=$1 AND name=$2", [ctx.orgId, name])).rows[0].r) as number;
    await tx.query("UPDATE approval_policies SET active=false WHERE org_id=$1 AND active", [ctx.orgId]);
    const digest = hashCanonical(policyDigestInput(rules));
    const r = (await tx.query("INSERT INTO approval_policies(org_id,name,revision,rules,digest,active,created_by) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *", [ctx.orgId, name, rev, JSON.stringify(rules), digest, ctx.actor.userId])).rows[0];
    await tx.query("UPDATE organizations SET policy_reviewed_at=COALESCE(policy_reviewed_at, now()) WHERE id=$1", [ctx.orgId]);
    await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "policy.published", `policy:${r.id}`, { name, revision: rev, digest, note: "Payouts approved under an earlier policy must be re-approved before sending." });
    return polDto(r);
  });
}
const cpDto = (r: Record<string, any>) => ({ id: r.id, name: r.name, bound_payee_pubkey: r.bound_payee_pubkey, verified: !!r.verified_at, notes: r.notes, created_at: isoMs(r.created_at) });
export async function listCounterparties(d: Deps, orgId: string, limit: number) { return { data: (await d.pool.query("SELECT * FROM counterparties WHERE org_id=$1 ORDER BY name LIMIT $2", [orgId, limit])).rows.map(cpDto), next_cursor: null }; }
export async function createCounterparty(d: Deps, ctx: Ctx, i: { name: string; bound_payee_pubkey?: string; notes: string }) {
  try {
    return await withTx(d.pool, async (tx) => {
      const r = (await tx.query("INSERT INTO counterparties(org_id,name,bound_payee_pubkey,notes) VALUES ($1,$2,$3,$4) RETURNING *", [ctx.orgId, i.name.trim(), i.bound_payee_pubkey ?? null, i.notes])).rows[0];
      await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "counterparty.created", `counterparty:${r.id}`, { name: i.name, bound_payee_pubkey: i.bound_payee_pubkey ?? null });
      return cpDto(r);
    });
  } catch (e) { if ((e as { code?: string }).code === "23505") throw new OryntError("conflict", 409, "A recipient with that name already exists."); throw e; }
}
export async function updateCounterparty(d: Deps, ctx: Ctx, id: string, i: { bound_payee_pubkey?: string; verified?: boolean; notes?: string }) {
  return withTx(d.pool, async (tx) => {
    const cur = (await tx.query("SELECT * FROM counterparties WHERE id=$1 AND org_id=$2 FOR UPDATE", [id, ctx.orgId])).rows[0];
    if (!cur) throw new OryntError("not_found", 404, "Recipient not found.");
    const r = (await tx.query("UPDATE counterparties SET bound_payee_pubkey=COALESCE($3,bound_payee_pubkey), notes=COALESCE($4,notes), verified_at = CASE WHEN $5::boolean IS TRUE THEN now() WHEN $5::boolean IS FALSE THEN NULL ELSE verified_at END, verified_by = CASE WHEN $5::boolean IS TRUE THEN $6::uuid ELSE verified_by END WHERE id=$1 AND org_id=$2 RETURNING *",
      [id, ctx.orgId, i.bound_payee_pubkey ?? null, i.notes ?? null, i.verified ?? null, ctx.actor.userId ?? null])).rows[0];
    await appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "counterparty.updated", `counterparty:${id}`, { bound_payee_pubkey: r.bound_payee_pubkey, verified: !!r.verified_at, previous_bound: cur.bound_payee_pubkey });
    return cpDto(r);
  });
}

// ---- incidents / audit / keys / webhooks / leads -------------------------------------------------------------------------------------
const incDto = (r: Record<string, any>) => ({ id: r.id, obligation_id: r.obligation_id, kind: r.kind, severity: r.severity, status: r.status, summary: r.summary, detail: r.detail, opened_at: isoMs(r.opened_at), resolved_at: r.resolved_at ? isoMs(r.resolved_at) : null, resolution: r.resolution });
export async function listIncidents(d: Deps, orgId: string, status: string | undefined, limit: number) {
  const rows = (await d.pool.query("SELECT * FROM incidents WHERE org_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY opened_at DESC LIMIT $3", [orgId, status ?? null, limit])).rows;
  return { data: rows.map(incDto), next_cursor: null };
}
export async function resolveIncident(d: Deps, ctx: Ctx, id: string, note: string) {
  return withTx(d.pool, async (tx) => {
    const inc = (await tx.query("SELECT * FROM incidents WHERE id=$1 AND org_id=$2 FOR UPDATE", [id, ctx.orgId])).rows[0];
    if (!inc) throw new OryntError("not_found", 404, "Incident not found.");
    if (inc.obligation_id) {
      const o = await lockObligation(tx, ctx.orgId, inc.obligation_id);
      if (["DISPATCHING", "PENDING", "UNKNOWN", "RECONCILING"].includes(o.state)) throw new OryntError("send_blocked_unresolved", 409, "The underlying payment is still unresolved. An incident can be closed only after the wallet's record settles it, or after you confirm it was never sent.");
    }
    await resolveIncidents(tx, ctx.orgId, inc.obligation_id ?? "00000000-0000-0000-0000-000000000000", note, actorTag(ctx.actor));
    return incDto((await tx.query("SELECT * FROM incidents WHERE id=$1", [id])).rows[0]);
  });
}
export async function listAudit(d: Deps, orgId: string, stream: string | undefined, cursor: string | undefined, limit: number) {
  const rows = (await d.pool.query("SELECT * FROM audit_events WHERE org_id=$1 AND ($2::text IS NULL OR stream=$2) AND ($3::bigint IS NULL OR id < $3) ORDER BY id DESC LIMIT $4", [orgId, stream ?? null, cursor ?? null, limit + 1])).rows;
  const page = rows.slice(0, limit);
  return { data: page.map((r) => ({ seq: Number(r.seq), stream: r.stream, at: iso(r.at), actor: r.actor, type: r.type, subject: r.subject, data: r.data, hash: r.hash, prev_hash: r.prev_hash })), next_cursor: rows.length > limit ? String(page[page.length - 1].id) : null };
}
export async function listApiKeys(d: Deps, orgId: string) {
  const { apiKeyDto } = await import("./auth");
  return { data: (await d.pool.query("SELECT * FROM api_keys WHERE org_id=$1 ORDER BY created_at DESC", [orgId])).rows.map(apiKeyDto) };
}
export async function revokeApiKey(d: Deps, ctx: Ctx, id: string) {
  const { apiKeyDto } = await import("./auth");
  const r = await d.pool.query("UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND org_id=$2 RETURNING *", [id, ctx.orgId]);
  if (!r.rowCount) throw new OryntError("not_found", 404, "API key not found.");
  await withTx(d.pool, (tx) => appendAudit(tx, ctx.orgId, "org", actorTag(ctx.actor), "apikey.revoked", `apikey:${id}`, {}));
  return apiKeyDto(r.rows[0]);
}
const whDto = (r: Record<string, any>) => ({ id: r.id, url: r.url, events: r.events, status: r.status, created_at: isoMs(r.created_at) });
export async function listWebhooks(d: Deps, orgId: string) { return { data: (await d.pool.query("SELECT * FROM webhook_endpoints WHERE org_id=$1 ORDER BY created_at DESC", [orgId])).rows.map(whDto) }; }
export async function createWebhook(d: Deps, ctx: Ctx, i: { url: string; events: string[] }) {
  await checkEntitlement(d, ctx.orgId, "webhooks");
  try { await vetWebhookTarget(i.url, d.config.allowPrivateWebhookTargets); } catch (e) { throw new OryntError("validation_failed", 422, `Webhook URL rejected: ${(e as Error).message}`); }
  const id = (await d.pool.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
  const secret = newSigningSecret();
  const userId = ctx.actor.userId ?? (await d.pool.query("SELECT created_by FROM api_keys WHERE id=$1", [ctx.actor.id])).rows[0]?.created_by;
  const r = (await d.pool.query("INSERT INTO webhook_endpoints(id,org_id,url,secret_ciphertext,events,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [id, ctx.orgId, i.url, sealSecret(d, id, secret), i.events, userId])).rows[0];
  return { ...whDto(r), signing_secret: secret };
}
export async function deleteWebhook(d: Deps, ctx: Ctx, id: string) {
  const r = await d.pool.query("UPDATE webhook_endpoints SET status='disabled' WHERE id=$1 AND org_id=$2 RETURNING *", [id, ctx.orgId]);
  if (!r.rowCount) throw new OryntError("not_found", 404, "Webhook not found.");
  return whDto(r.rows[0]);
}
export async function listDeliveries(d: Deps, ctx: Ctx, id: string) {
  const own = (await d.pool.query("SELECT 1 FROM webhook_endpoints WHERE id=$1 AND org_id=$2", [id, ctx.orgId])).rowCount;
  if (!own) throw new OryntError("not_found", 404, "Webhook not found.");
  return { data: (await d.pool.query("SELECT * FROM webhook_deliveries WHERE endpoint_id=$1 ORDER BY created_at DESC LIMIT 50", [id])).rows.map((r) => ({ id: r.id, event_id: r.event_id, event_type: r.event_type, status: r.status, attempt: r.attempt, last_status_code: r.last_status_code, last_error: r.last_error, created_at: isoMs(r.created_at), delivered_at: r.delivered_at ? isoMs(r.delivered_at) : null })) };
}
export async function createLead(d: Deps, i: { email: string; name: string; organization: string; message: string; source: string }) {
  await d.pool.query("INSERT INTO leads(email,name,organization,message,source,consent) VALUES ($1,$2,$3,$4,$5,true)", [i.email, i.name, i.organization, i.message, i.source]);
}
void randomBytes;
