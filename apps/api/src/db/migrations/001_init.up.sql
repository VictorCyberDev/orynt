-- Orynt schema v1. All timestamps UTC (timestamptz). Money is bigint msat (max 2.1e18 < 9.22e18).
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'developer',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  disabled_at timestamptz,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','admin','approver','operator','developer','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  approval_public_key text CHECK (approval_public_key ~ '^[0-9a-f]{64}$'),
  approval_key_registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (org_id, user_id)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  org_id uuid NOT NULL REFERENCES organizations(id),
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text
);
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('operator','developer','viewer')), -- API keys can never approve
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE wallet_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  label text NOT NULL,
  provider_kind text NOT NULL CHECK (provider_kind IN ('lnd','nwc','simulator')),
  network text NOT NULL CHECK (network IN ('mainnet','testnet','signet','regtest')),
  node_pubkey text,
  config_ciphertext bytea,           -- AES-256-GCM(JSON config); never returned by the API
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','error')),
  last_health_at timestamptz,
  last_health_ok boolean,
  last_error text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, label)
);
CREATE TABLE provider_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_connection_id uuid NOT NULL REFERENCES wallet_connections(id),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  can_send text NOT NULL, can_lookup text NOT NULL, can_read_info text NOT NULL,
  notes jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX provider_capabilities_conn_idx ON provider_capabilities (wallet_connection_id, discovered_at DESC);
CREATE TABLE counterparties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  bound_payee_pubkey text CHECK (bound_payee_pubkey ~ '^0[23][0-9a-f]{64}$'),
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX counterparties_name_uq ON counterparties (org_id, lower(name));
CREATE TABLE approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  revision int NOT NULL,
  rules jsonb NOT NULL,
  digest text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name, revision)
);
CREATE UNIQUE INDEX approval_policies_one_active ON approval_policies (org_id) WHERE active;
CREATE TABLE org_counters (org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, value bigint NOT NULL DEFAULT 0, PRIMARY KEY (org_id, name));
CREATE TABLE payout_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  seq bigint NOT NULL,
  state text NOT NULL CHECK (state IN ('DRAFT','AWAITING_APPROVAL','APPROVED','EXECUTION_RESERVED','DISPATCHING','PENDING','UNKNOWN','RECONCILING','SETTLED','SIMULATED_SETTLED','DEFINITIVELY_FAILED','REJECTED','CANCELLED')),
  current_revision int NOT NULL DEFAULT 1,
  policy_id uuid REFERENCES approval_policies(id),
  required_approvals int,
  intent_digest text,
  wallet_connection_id uuid REFERENCES wallet_connections(id),
  version int NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  -- durable reconciliation job fields
  next_reconcile_at timestamptz,
  reconcile_attempts int NOT NULL DEFAULT 0,
  reconcile_lease_until timestamptz,
  UNIQUE (org_id, seq)
);
CREATE INDEX obligations_org_state_idx ON payout_obligations (org_id, state, updated_at DESC);
CREATE INDEX obligations_reconcile_idx ON payout_obligations (next_reconcile_at) WHERE state IN ('DISPATCHING','PENDING','UNKNOWN','RECONCILING','EXECUTION_RESERVED');
CREATE TABLE obligation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES payout_obligations(id),
  revision int NOT NULL,
  counterparty_id uuid NOT NULL REFERENCES counterparties(id),
  bound_payee_pubkey text NOT NULL DEFAULT '',
  amount_msat bigint NOT NULL CHECK (amount_msat > 0),
  memo text NOT NULL DEFAULT '',
  external_ref text NOT NULL DEFAULT '',
  invoice text NOT NULL,
  payment_hash text NOT NULL CHECK (payment_hash ~ '^[0-9a-f]{64}$'),
  payee_pubkey text NOT NULL CHECK (payee_pubkey ~ '^0[23][0-9a-f]{64}$'),
  network text NOT NULL CHECK (network IN ('mainnet','testnet','signet','regtest')),
  invoice_expires_at timestamptz NOT NULL,
  revision_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, revision)
);
-- Revisions are immutable: no UPDATE or DELETE, ever.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% on % is forbidden (append-only)', TG_OP, TG_TABLE_NAME; END $$;
CREATE TRIGGER obligation_revisions_immutable BEFORE UPDATE OR DELETE ON obligation_revisions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
-- One live obligation per invoice per workspace: prevents the same invoice backing two payouts.
CREATE TABLE invoice_claims (
  org_id uuid NOT NULL REFERENCES organizations(id),
  payment_hash text NOT NULL,
  obligation_id uuid NOT NULL REFERENCES payout_obligations(id),
  PRIMARY KEY (org_id, payment_hash)
);
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  obligation_id uuid NOT NULL REFERENCES payout_obligations(id),
  revision int NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES users(id),
  approver_role text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  public_key text,
  intent_digest text,
  payload jsonb,
  signature text,
  signed_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  UNIQUE (obligation_id, revision, approver_user_id)  -- duplicate approval protection
);
CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  obligation_id uuid NOT NULL REFERENCES payout_obligations(id),   -- single-use per (obligation, revision)
  revision int NOT NULL,
  intent_digest text NOT NULL,
  binding jsonb NOT NULL,
  policy_id uuid NOT NULL REFERENCES approval_policies(id),
  wallet_connection_id uuid NOT NULL REFERENCES wallet_connections(id),
  payment_hash text NOT NULL,
  amount_msat bigint NOT NULL,
  network text NOT NULL,
  fee_limit_msat bigint NOT NULL,
  reserved_by text NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, payment_hash),
  UNIQUE (obligation_id, revision)
);
CREATE TABLE execution_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES payment_intents(id),
  attempt_no int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN ('RESERVED','DISPATCHING','PENDING','UNKNOWN','SUCCEEDED','FAILED','NOT_SENT','RELEASED')),
  provider_status text,
  failure_reason text,
  preimage text,
  amount_msat bigint,
  fee_msat bigint,
  provider_ref text,
  settled_at timestamptz,
  finished_at timestamptz,
  note text NOT NULL DEFAULT '',
  UNIQUE (intent_id, attempt_no)
);
-- Concurrency guard in the database itself: at most ONE open attempt per intent.
CREATE UNIQUE INDEX one_open_attempt ON execution_attempts (intent_id) WHERE outcome IN ('RESERVED','DISPATCHING','PENDING','UNKNOWN');
CREATE TABLE provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  wallet_connection_id uuid NOT NULL REFERENCES wallet_connections(id),
  event_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result text,
  UNIQUE (wallet_connection_id, event_id)    -- duplicate deliveries are ignored
);
CREATE TABLE reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  obligation_id uuid NOT NULL REFERENCES payout_obligations(id),
  trigger text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  provider_status text,
  result text,
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX reconciliation_runs_obl_idx ON reconciliation_runs (obligation_id, started_at DESC);
CREATE TABLE audit_heads (org_id uuid NOT NULL REFERENCES organizations(id), stream text NOT NULL, seq bigint NOT NULL, head_hash text NOT NULL, PRIMARY KEY (org_id, stream));
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  stream text NOT NULL,
  seq bigint NOT NULL,
  at timestamptz NOT NULL,
  actor text NOT NULL,
  type text NOT NULL,
  subject text NOT NULL,
  data jsonb NOT NULL,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  UNIQUE (org_id, stream, seq)
);
CREATE INDEX audit_events_org_id_idx ON audit_events (org_id, id DESC);
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TABLE receipt_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  intent_id uuid NOT NULL UNIQUE REFERENCES payment_intents(id),
  receipt_id uuid NOT NULL UNIQUE,
  receipt jsonb NOT NULL,
  sha256 text NOT NULL,
  issued_by text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  obligation_id uuid REFERENCES payout_obligations(id),
  kind text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution text
);
CREATE UNIQUE INDEX incidents_one_open_per_kind ON incidents (obligation_id, kind) WHERE status = 'open' AND obligation_id IS NOT NULL;
CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  url text NOT NULL,
  secret_ciphertext bytea NOT NULL,
  events text[] NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id),
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  attempt int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','dead')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status_code int,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (endpoint_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE TABLE idempotency_keys (
  org_id uuid NOT NULL REFERENCES organizations(id),
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  response_status int,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, scope, key)
);
CREATE TABLE blocked_attempts (  -- evidence of "duplicates blocked", for the dashboard and the demo
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  obligation_id uuid REFERENCES payout_obligations(id),
  reason text NOT NULL,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE feature_flags (key text NOT NULL, org_id uuid REFERENCES organizations(id), enabled boolean NOT NULL, note text NOT NULL DEFAULT '', PRIMARY KEY (key, org_id));
CREATE TABLE pricing_plans (id text PRIMARY KEY, name text NOT NULL, is_hypothesis boolean NOT NULL DEFAULT true, details jsonb NOT NULL);
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL, name text NOT NULL, organization text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '',
  source text NOT NULL, consent boolean NOT NULL CHECK (consent), created_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'new'
);
CREATE TABLE issuer_keys (key_id text PRIMARY KEY, public_key text NOT NULL, valid_from timestamptz NOT NULL DEFAULT now());
