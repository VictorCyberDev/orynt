-- R3: organisation profile and explicit onboarding decisions. Onboarding step state is DERIVED from real tables;
-- these columns only record decisions that have no other footprint (profile filled in, plan consciously confirmed, policy reviewed, onboarding closed).
ALTER TABLE organizations
  ADD COLUMN country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  ADD COLUMN timezone text CHECK (timezone IS NULL OR length(timezone) BETWEEN 1 AND 64),
  ADD COLUMN purpose text CHECK (purpose IS NULL OR length(purpose) <= 300),
  ADD COLUMN profile_completed_at timestamptz,
  ADD COLUMN plan_confirmed_at timestamptz,
  ADD COLUMN policy_reviewed_at timestamptz,
  ADD COLUMN onboarding_completed_at timestamptz;
