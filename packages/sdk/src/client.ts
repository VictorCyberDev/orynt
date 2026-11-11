import type { z } from "zod";
import type {
  ObligationDto,
  PaymentDto,
  IncidentDto,
  Overview,
  Connection,
  Counterparty,
  Policy,
  MemberDto,
  WebhookDto,
  ApiKeyDto,
  DeliveryDto,
  AuditEntryDto,
  Me,
} from "@orynt/contract";
import { hmacSha256Hex, timingSafeEqualStr, type Problem, type Receipt } from "@orynt/core";

export type Obligation = z.infer<typeof ObligationDto>;
export type Payment = z.infer<typeof PaymentDto>;
export type Incident = z.infer<typeof IncidentDto>;
export type OverviewT = z.infer<typeof Overview>;
export type ConnectionT = z.infer<typeof Connection>;
export type CounterpartyT = z.infer<typeof Counterparty>;
export type PolicyT = z.infer<typeof Policy>;
export type Member = z.infer<typeof MemberDto>;
export type Webhook = z.infer<typeof WebhookDto>;
export type ApiKey = z.infer<typeof ApiKeyDto>;
export type Delivery = z.infer<typeof DeliveryDto>;
export type AuditEntryT = z.infer<typeof AuditEntryDto>;
export type MeT = z.infer<typeof Me>;
export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/** Thrown for every non-2xx response. `code` is stable; switch on it, not on `message`. */
export class OryntApiError extends Error {
  constructor(
    public readonly problem: Problem,
    public readonly httpStatus: number,
  ) {
    super(problem.detail ?? problem.title);
    this.name = "OryntApiError";
  }
  get code() {
    return this.problem.code;
  }
  get requestId() {
    return this.problem.request_id;
  }
}

export interface ClientOptions {
  baseUrl: string;
  /** API key (`orynt_…`). API keys can create, submit, execute and read; they can never approve. */
  apiKey?: string;
  fetch?: typeof fetch;
  /** Called for each request to add a CSRF token and cookie (browser/session use). */
  headers?: () => Record<string, string>;
  credentials?: "omit" | "same-origin" | "include";
}

export const newIdempotencyKey = () => "idem_" + crypto.randomUUID().replace(/-/g, "");

export class OryntClient {
  constructor(private readonly o: ClientOptions) {}

  async request<T>(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      idempotencyKey?: string;
    } = {},
  ): Promise<{ data: T; status: number }> {
    const url = new URL(path, this.o.baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { accept: "application/json", ...(this.o.headers?.() ?? {}) };
    if (this.o.apiKey) headers["authorization"] = `Bearer ${this.o.apiKey}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    const res = await (this.o.fetch ?? fetch)(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: this.o.credentials,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* leave null */
    }
    if (!res.ok)
      throw new OryntApiError(
        (json as Problem) ?? {
          type: "about:blank",
          title: res.statusText,
          status: res.status,
          code: "internal",
        },
        res.status,
      );
    return { data: json as T, status: res.status };
  }
  private get = <T>(p: string, query?: Record<string, string | number | undefined>) =>
    this.request<T>("GET", p, { query }).then((r) => r.data);
  private post = <T>(p: string, body?: unknown, idem?: string) =>
    this.request<T>("POST", p, { body, idempotencyKey: idem }).then((r) => r.data);

  me = () => this.get<MeT>("/v1/me");
  overview = () => this.get<OverviewT>("/v1/overview");
  connections = {
    list: () => this.get<{ data: ConnectionT[] }>("/v1/connections"),
    check: (id: string) => this.post<ConnectionT>(`/v1/connections/${id}/check`),
  };
  counterparties = {
    list: () => this.get<Page<CounterpartyT>>("/v1/counterparties"),
    create: (b: { name: string; bound_payee_pubkey?: string; notes?: string }) =>
      this.post<CounterpartyT>("/v1/counterparties", b),
  };

  obligations = {
    create: (
      b: {
        counterparty_id?: string;
        counterparty_name?: string;
        amount_msat: string;
        invoice: string;
        memo?: string;
        external_ref?: string;
        wallet_connection_id?: string;
      },
      idempotencyKey?: string,
    ) => this.post<Obligation>("/v1/obligations", b, idempotencyKey),
    list: (q: { state?: string; q?: string; cursor?: string; limit?: number } = {}) =>
      this.get<Page<Obligation>>("/v1/obligations", q),
    get: (id: string) => this.get<Obligation>(`/v1/obligations/${id}`),
    submit: (id: string) => this.post<Obligation>(`/v1/obligations/${id}/submit`),
    reject: (id: string, reason: string) => this.post<Obligation>(`/v1/obligations/${id}/reject`, { reason }),
    cancel: (id: string, reason: string) => this.post<Obligation>(`/v1/obligations/${id}/cancel`, { reason }),
    approve: (id: string, b: { intent_digest: string; signed_at: string; signature: string }) =>
      this.post<Obligation>(`/v1/obligations/${id}/approve`, b),
    /**
     * Executes an approved obligation exactly once. `status === 202` means the outcome is NOT yet certain (state UNKNOWN/RECONCILING):
     * do not call execute again — poll `get` or call `payments.reconcile`.
     */
    execute: (id: string, idempotencyKey: string = newIdempotencyKey()) =>
      this.request<Obligation>("POST", `/v1/obligations/${id}/execute`, { idempotencyKey }).then((r) => ({
        obligation: r.data,
        certain: r.status === 200,
        idempotencyKey,
      })),
    /** Polls until the payout reaches a state where money can no longer be in motion. */
    waitUntilResolved: async (id: string, o: { timeoutMs?: number; intervalMs?: number } = {}) => {
      const end = Date.now() + (o.timeoutMs ?? 120_000);
      for (;;) {
        const ob = await this.obligations.get(id);
        if (
          ["SETTLED", "SIMULATED_SETTLED", "DEFINITIVELY_FAILED", "REJECTED", "CANCELLED"].includes(ob.state)
        )
          return ob;
        if (Date.now() > end) return ob;
        await new Promise((r) => setTimeout(r, o.intervalMs ?? 1500));
      }
    },
  };
  payments = {
    get: (id: string) => this.get<Payment>(`/v1/payments/${id}`),
    reconcile: (id: string) => this.post<Obligation>(`/v1/payments/${id}/reconcile`),
    retry: (id: string, idempotencyKey: string = newIdempotencyKey()) =>
      this.post<Obligation>(`/v1/payments/${id}/retry`, undefined, idempotencyKey),
    receipt: (id: string) => this.get<Receipt>(`/v1/payments/${id}/receipt`),
  };
  incidents = {
    list: (status?: "open" | "resolved") => this.get<Page<Incident>>("/v1/incidents", { status }),
  };
  audit = {
    list: (q: { stream?: string; cursor?: string; limit?: number } = {}) =>
      this.get<Page<AuditEntryT>>("/v1/audit", q),
    verify: () =>
      this.get<{ ok: boolean; entries: number; streams: number; broken: unknown[]; note: string }>(
        "/v1/audit/verify",
      ),
  };
  webhooks = {
    list: () => this.get<{ data: Webhook[] }>("/v1/webhooks"),
    create: (b: { url: string; events: string[] }) =>
      this.post<Webhook & { signing_secret: string }>("/v1/webhooks", b),
    deliveries: (id: string) => this.get<{ data: Delivery[] }>(`/v1/webhooks/${id}/deliveries`),
  };
}

// ---- webhook verification -------------------------------------------------------------------------------------------------
export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  created_at: string;
  data: T;
}
export class WebhookSignatureError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verify an Orynt webhook. `rawBody` MUST be the exact bytes received (do not re-serialise parsed JSON).
 * Rejects bad signatures and timestamps outside `toleranceSeconds`. Deduplicate on `event.id` — delivery is at-least-once.
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): WebhookEvent {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signatureHeader);
  if (!m) throw new WebhookSignatureError("malformed Orynt-Signature header");
  const t = Number(m[1]);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? 300))
    throw new WebhookSignatureError("timestamp outside tolerance (possible replay)");
  if (!timingSafeEqualStr(hmacSha256Hex(secret, `${t}.${rawBody}`), m[2]!))
    throw new WebhookSignatureError("signature mismatch");
  return JSON.parse(rawBody) as WebhookEvent;
}
