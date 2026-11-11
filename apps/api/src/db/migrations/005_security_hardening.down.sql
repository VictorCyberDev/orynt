ALTER TABLE subscriptions DROP COLUMN pending_at, DROP COLUMN pending_plan_id;
ALTER TABLE organizations DROP COLUMN require_mfa;
ALTER TABLE users DROP COLUMN mfa_locked_until, DROP COLUMN mfa_failures, DROP COLUMN mfa_last_step;
