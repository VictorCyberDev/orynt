-- Account lifecycle ---------------------------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN email_verified_at timestamptz, ADD COLUMN mfa_secret_ciphertext bytea, ADD COLUMN mfa_enabled_at timestamptz;
CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('email_verify','password_reset','invite')),
  token_hash text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id),
  org_id uuid REFERENCES organizations(id),
  email text NOT NULL,
  role text CHECK (role IN ('owner','admin','approver','operator','developer','viewer')),
  created_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, kind);
CREATE TABLE mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  to_email text NOT NULL,
  template text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (created_at) WHERE status = 'pending';
-- Plans, subscriptions, billing events ---------------------------------------------------------------------------------
-- pricing_plans (001) holds the *hypothesis* table; plan_definitions is the configurable, server-enforced entitlement source.
CREATE TABLE plan_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_usd_cents int,                 -- NULL = custom / contact sales. HYPOTHESIS until validated.
  entitlements jsonb NOT NULL,         -- {members, wallets, payouts_per_month, webhooks, api_keys, batch, recurring, history_days}; -1 = unlimited
  public boolean NOT NULL DEFAULT true,
  is_hypothesis boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);
INSERT INTO plan_definitions(id,name,price_usd_cents,entitlements,sort) VALUES
 ('developer','Developer',0,'{"members":3,"wallets":1,"payouts_per_month":25,"webhooks":1,"api_keys":2,"batch":false,"recurring":false,"history_days":30}',0),
 ('startup','Startup',2900,'{"members":5,"wallets":2,"payouts_per_month":250,"webhooks":3,"api_keys":5,"batch":true,"recurring":false,"history_days":365}',1),
 ('growth','Growth',9900,'{"members":15,"wallets":5,"payouts_per_month":2000,"webhooks":10,"api_keys":20,"batch":true,"recurring":true,"history_days":-1}',2),
 ('business','Business',29900,'{"members":50,"wallets":15,"payouts_per_month":10000,"webhooks":50,"api_keys":100,"batch":true,"recurring":true,"history_days":-1}',3),
 ('enterprise','Enterprise',NULL,'{"members":-1,"wallets":-1,"payouts_per_month":-1,"webhooks":-1,"api_keys":-1,"batch":true,"recurring":true,"history_days":-1}',4);
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
  plan_id text NOT NULL REFERENCES plan_definitions(id),
  status text NOT NULL CHECK (status IN ('active','trialing','past_due','canceled','incomplete')),
  provider text NOT NULL,              -- 'none' (free) | 'sandbox' | 'stripe' | 'paystack'
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_provider_sub_uq ON subscriptions (provider, provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result text,
  UNIQUE (provider, event_id)          -- a repeated webhook can never grant an entitlement twice
);
INSERT INTO subscriptions(org_id, plan_id, status, provider) SELECT id, 'developer', 'active', 'none' FROM organizations;
-- Support, analytics ------------------------------------------------------------------------------------------------------
CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  org_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES users(id),
  email text NOT NULL,
  category text NOT NULL CHECK (category IN ('payment','wallet','billing','account','security','other')),
  subject text NOT NULL,
  body text NOT NULL,
  diagnostics jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analytics_events (
  id bigserial PRIMARY KEY,
  org_id uuid,
  name text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()    -- deliberately no user id, no payload: counts only
);
CREATE INDEX analytics_events_name_idx ON analytics_events (name, at);
-- Batches and recurring schedules -------------------------------------------------------------------------------------------
CREATE TABLE payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  label text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payout_obligations ADD COLUMN batch_id uuid REFERENCES payout_batches(id);
CREATE INDEX payout_obligations_batch_idx ON payout_obligations (batch_id) WHERE batch_id IS NOT NULL;
CREATE TABLE recurring_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  counterparty_id uuid NOT NULL REFERENCES counterparties(id),
  amount_msat bigint NOT NULL CHECK (amount_msat > 0),
  memo text NOT NULL DEFAULT '',
  cadence text NOT NULL CHECK (cadence IN ('weekly','monthly')),
  next_due_on date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  wallet_connection_id uuid REFERENCES wallet_connections(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- A Lightning invoice is single-use and expires, so a recurring schedule cannot pay by itself: each cycle becomes an
-- "invoice needed" task. Turning it into a payout goes through the normal create → approve → execute path.
CREATE TABLE schedule_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES recurring_schedules(id),
  org_id uuid NOT NULL REFERENCES organizations(id),
  cycle text NOT NULL,                 -- e.g. 2026-11 or 2026-W46
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_invoice' CHECK (status IN ('awaiting_invoice','drafted','skipped')),
  obligation_id uuid REFERENCES payout_obligations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, cycle)          -- duplicate-cycle prevention
);
-- Recipient controls
ALTER TABLE counterparties ADD COLUMN suspended_at timestamptz, ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
-- Obligation assignment for the exception workbench
CREATE TABLE incident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  org_id uuid NOT NULL REFERENCES organizations(id),
  author text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE incidents ADD COLUMN assigned_to uuid REFERENCES users(id);
