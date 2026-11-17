-- R3 security hardening.
-- TOTP replay + attempt limiting; org-level MFA policy; server-side pending checkout (activation only for a plan the org actually started to buy).
ALTER TABLE users
  ADD COLUMN mfa_last_step bigint,
  ADD COLUMN mfa_failures int NOT NULL DEFAULT 0,
  ADD COLUMN mfa_locked_until timestamptz;
ALTER TABLE organizations ADD COLUMN require_mfa boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN pending_plan_id text, ADD COLUMN pending_at timestamptz;
