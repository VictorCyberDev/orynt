DROP INDEX IF EXISTS mail_outbox_recipient_idx;
DROP INDEX IF EXISTS mail_outbox_provider_msg_uq;
DROP INDEX IF EXISTS mail_outbox_pending_idx;
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (created_at) WHERE status = 'pending';
ALTER TABLE mail_outbox DROP COLUMN redacted_at, DROP COLUMN delivery_status_at, DROP COLUMN delivery_status, DROP COLUMN provider_message_id, DROP COLUMN provider, DROP COLUMN claimed_until, DROP COLUMN next_attempt_at;
