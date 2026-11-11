-- R3 organisation administration: closure with retention window. A closed organisation has no live sessions, keys, wallet connections or schedules;
-- its records are RETAINED (audit, receipts, payouts) until retention_until so a customer can still receive an export on request and obligations to keep records are met.
ALTER TABLE organizations
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES users(id),
  ADD COLUMN retention_until timestamptz;
