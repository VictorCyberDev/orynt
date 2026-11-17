-- R3 internal support console. Staff are a SEPARATE identity from customer users: own table, own sessions, mandatory MFA, no membership in any organisation.
-- Staff can read non-sensitive metadata and answer tickets. There is deliberately no table, column or route through which staff could hold wallet secrets,
-- impersonate a customer, approve or send a payment.
CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('support','support_lead')),
  password_hash text NOT NULL,
  mfa_secret_ciphertext bytea NOT NULL,
  mfa_last_step bigint,
  mfa_failures int NOT NULL DEFAULT 0,
  mfa_locked_until timestamptz,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_users_email_uq ON staff_users (lower(email));
CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
-- Every staff action, including every READ of customer metadata, with the stated reason. Append-only.
CREATE TABLE staff_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  staff_id uuid REFERENCES staff_users(id),
  staff_email text NOT NULL,
  action text NOT NULL,
  org_id uuid REFERENCES organizations(id),
  target text,
  reason text,
  detail jsonb NOT NULL DEFAULT '{}'
);
CREATE FUNCTION staff_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'staff_audit is append-only'; END $$;
CREATE TRIGGER staff_audit_no_update BEFORE UPDATE OR DELETE ON staff_audit FOR EACH ROW EXECUTE FUNCTION staff_audit_immutable();
CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id),
  author text NOT NULL CHECK (author IN ('customer','staff')),
  staff_id uuid REFERENCES staff_users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_idx ON support_messages (ticket_id, created_at);
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_status_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK (status IN ('open','acknowledged','pending_customer','resolved'));
