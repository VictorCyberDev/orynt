ALTER TABLE incidents DROP COLUMN IF EXISTS assigned_to;
DROP TABLE IF EXISTS incident_notes, schedule_cycles, recurring_schedules;
ALTER TABLE payout_obligations DROP COLUMN IF EXISTS batch_id;
DROP TABLE IF EXISTS payout_batches, analytics_events, support_tickets, billing_events, subscriptions, plan_definitions, mail_outbox, auth_tokens;
ALTER TABLE counterparties DROP COLUMN IF EXISTS suspended_at, DROP COLUMN IF EXISTS tags;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at, DROP COLUMN IF EXISTS mfa_secret_ciphertext, DROP COLUMN IF EXISTS mfa_enabled_at;
