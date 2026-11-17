-- one approval key per person per workspace (a key shared by two accounts would let one human supply two 'distinct' approvals)
CREATE UNIQUE INDEX memberships_approval_key_uq ON memberships (org_id, approval_public_key) WHERE approval_public_key IS NOT NULL;
