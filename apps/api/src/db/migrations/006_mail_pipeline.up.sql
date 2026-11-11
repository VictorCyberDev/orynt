-- R3 durable mail pipeline: lease-based claiming (no double send), exponential backoff, delivery status from provider webhooks, token redaction.
ALTER TABLE mail_outbox
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN claimed_until timestamptz,
  ADD COLUMN provider text,
  ADD COLUMN provider_message_id text,
  ADD COLUMN delivery_status text CHECK (delivery_status IN ('delivered','delayed','bounced','complained')),
  ADD COLUMN delivery_status_at timestamptz,
  ADD COLUMN redacted_at timestamptz;
DROP INDEX mail_outbox_pending_idx;
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (next_attempt_at) WHERE status = 'pending';
CREATE UNIQUE INDEX mail_outbox_provider_msg_uq ON mail_outbox (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX mail_outbox_recipient_idx ON mail_outbox (lower(to_email), template, created_at);
