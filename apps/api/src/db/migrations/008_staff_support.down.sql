ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_status_check;
UPDATE support_tickets SET status='acknowledged' WHERE status='pending_customer';
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK (status IN ('open','acknowledged','resolved'));
DROP TABLE IF EXISTS support_messages;
DROP TRIGGER IF EXISTS staff_audit_no_update ON staff_audit;
DROP TABLE IF EXISTS staff_audit;
DROP FUNCTION IF EXISTS staff_audit_immutable();
DROP TABLE IF EXISTS staff_sessions;
DROP TABLE IF EXISTS staff_users;
