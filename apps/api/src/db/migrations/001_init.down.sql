DROP TABLE IF EXISTS issuer_keys, leads, pricing_plans, feature_flags, blocked_attempts, idempotency_keys, webhook_deliveries, webhook_endpoints,
  incidents, receipt_exports, audit_events, audit_heads, reconciliation_runs, provider_events, execution_attempts, payment_intents, approvals,
  invoice_claims, obligation_revisions, payout_obligations, org_counters, approval_policies, counterparties, provider_capabilities,
  wallet_connections, api_keys, sessions, memberships, users, organizations CASCADE;
DROP FUNCTION IF EXISTS forbid_mutation();
