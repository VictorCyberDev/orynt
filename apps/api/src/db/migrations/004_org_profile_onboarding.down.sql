ALTER TABLE organizations
  DROP COLUMN onboarding_completed_at, DROP COLUMN policy_reviewed_at, DROP COLUMN plan_confirmed_at,
  DROP COLUMN profile_completed_at, DROP COLUMN purpose, DROP COLUMN timezone, DROP COLUMN country;
