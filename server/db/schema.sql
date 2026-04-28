CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('professional', 'recruiter', 'administrator', 'admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended')),
  reporting_restricted_until TIMESTAMPTZ,
  reporting_restriction_reason TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('professional', 'recruiter', 'administrator', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

INSERT INTO user_roles (user_id, role, created_at)
SELECT id, role, COALESCE(created_at, NOW())
FROM users
WHERE role IN ('professional', 'recruiter', 'administrator', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles (role, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'verification')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verification_codes_email_created_at_idx
  ON verification_codes (email, created_at DESC);

UPDATE verification_codes
SET consumed = true
WHERE consumed = false;

CREATE TABLE IF NOT EXISTS auth_code_challenges (
  id SERIAL PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login')),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_code_challenges_email_idx
  ON auth_code_challenges (email, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_code_challenges_user_id_idx
  ON auth_code_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_code_challenges_active_idx
  ON auth_code_challenges (challenge_id, expires_at DESC, invalidated_at, consumed_at);

CREATE TABLE IF NOT EXISTS profile_contact_email_challenges (
  id SERIAL PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  account_email TEXT NOT NULL,
  next_contact_email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_contact_email_challenges_user_id_idx
  ON profile_contact_email_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_contact_email_challenges_session_id_idx
  ON profile_contact_email_challenges (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_contact_email_challenges_account_email_idx
  ON profile_contact_email_challenges (account_email, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_contact_email_challenges_active_idx
  ON profile_contact_email_challenges (challenge_id, expires_at DESC, invalidated_at, consumed_at, verified_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  active_role TEXT CHECK (active_role IN ('professional', 'recruiter', 'administrator', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_ip TEXT,
  created_user_agent TEXT
);

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS active_role TEXT;

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
  ON auth_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
  ON auth_sessions (token_hash, revoked_at, idle_expires_at, absolute_expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, subject, window_key)
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_scope_subject_idx
  ON auth_rate_limits (scope, subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS auth_rate_limits_blocked_idx
  ON auth_rate_limits (scope, subject, blocked_until DESC);

CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  public_slug TEXT,
  published_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  moderation_blocked_at TIMESTAMPTZ,
  moderation_block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS public_slug TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_restricted_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_restriction_reason TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS moderation_blocked_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS moderation_block_reason TEXT;

CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles (user_id);
CREATE INDEX IF NOT EXISTS user_profiles_profile_data_gin_idx ON user_profiles USING GIN (profile_data);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_public_slug_idx ON user_profiles (public_slug);
CREATE INDEX IF NOT EXISTS user_profiles_is_published_idx ON user_profiles (is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS user_profiles_expired_idx ON user_profiles (expired_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS users_account_status_idx ON users (account_status, created_at DESC);
CREATE INDEX IF NOT EXISTS users_reporting_restricted_idx ON users (reporting_restricted_until DESC);
CREATE INDEX IF NOT EXISTS user_profiles_moderation_blocked_idx ON user_profiles (moderation_blocked_at DESC);

UPDATE user_profiles
SET profile_data = profile_data - 'phone'
WHERE profile_data->>'phone' IS NOT NULL;

CREATE TABLE IF NOT EXISTS profile_contact_access_logs (
  id SERIAL PRIMARY KEY,
  recruiter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  professional_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_public_slug TEXT,
  recruiter_name_snapshot TEXT NOT NULL,
  recruiter_email_hint TEXT NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_contact_access_logs_professional_idx
  ON profile_contact_access_logs (professional_user_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS profile_contact_access_logs_recruiter_idx
  ON profile_contact_access_logs (recruiter_user_id, accessed_at DESC);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id SERIAL PRIMARY KEY,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('professional_public_profile', 'recruiter_contact_access')),
  category TEXT NOT NULL CHECK (
    category IN (
      'false_identity',
      'third_party_data',
      'sensitive_data_exposure',
      'harassment_or_abuse',
      'fraud_or_misleading',
      'discrimination',
      'spam_or_scraping',
      'other'
    )
  ),
  description TEXT NOT NULL,
  target_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_code TEXT CHECK (
    resolution_code IS NULL OR resolution_code IN (
      'dismiss_good_faith',
      'dismiss_false_report',
      'hide_professional_profile',
      'suspend_target_account',
      'permanent_ban_target_account'
    )
  ),
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_reports_reporter_idx
  ON moderation_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_target_idx
  ON moderation_reports (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_status_idx
  ON moderation_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id SERIAL PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'dismiss_good_faith',
      'dismiss_false_report',
      'hide_professional_profile',
      'restore_professional_profile',
      'suspend_target_account',
      'permanent_ban_target_account',
      'restore_target_account',
      'lift_reporting_restriction'
    )
  ),
  subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  related_report_id INTEGER REFERENCES moderation_reports(id) ON DELETE SET NULL,
  created_by_admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_role_actions (
  id SERIAL PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'grant_administrator',
      'revoke_administrator'
    )
  ),
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_actions_subject_idx
  ON moderation_actions (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_actions_report_idx
  ON moderation_actions (related_report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_role_actions_target_idx
  ON admin_role_actions (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_role_actions_created_by_idx
  ON admin_role_actions (created_by_admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_banned_email_hashes (
  id SERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  source_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  related_report_id INTEGER REFERENCES moderation_reports(id) ON DELETE SET NULL,
  created_by_admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moderation_banned_email_hashes_created_at_idx
  ON moderation_banned_email_hashes (created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_banned_email_hashes_report_idx
  ON moderation_banned_email_hashes (related_report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recruiter_favorites (
  id SERIAL PRIMARY KEY,
  recruiter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recruiter_user_id, professional_user_id)
);

CREATE INDEX IF NOT EXISTS recruiter_favorites_recruiter_idx
  ON recruiter_favorites (recruiter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recruiter_policy_acceptances (
  id SERIAL PRIMARY KEY,
  recruiter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_hash TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_policy_acceptances_recruiter_idx
  ON recruiter_policy_acceptances (recruiter_user_id, policy_key, accepted_at DESC);

CREATE TABLE IF NOT EXISTS user_policy_acceptances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_hash TEXT,
  acceptance_source TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, policy_key, policy_version)
);

CREATE INDEX IF NOT EXISTS user_policy_acceptances_user_idx
  ON user_policy_acceptances (user_id, policy_key, accepted_at DESC);

ALTER TABLE recruiter_policy_acceptances ADD COLUMN IF NOT EXISTS policy_hash TEXT;
ALTER TABLE user_policy_acceptances ADD COLUMN IF NOT EXISTS policy_hash TEXT;

CREATE TABLE IF NOT EXISTS legal_audit_ledger (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('policy_acceptance', 'account_deletion', 'moderation_account_purge')),
  actor_hash TEXT NOT NULL,
  account_role TEXT,
  policy_key TEXT,
  policy_version TEXT,
  policy_hash TEXT,
  source TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS legal_audit_ledger_actor_idx
  ON legal_audit_ledger (actor_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS legal_audit_ledger_event_idx
  ON legal_audit_ledger (event_type, occurred_at DESC);

ALTER TABLE moderation_reports
  DROP CONSTRAINT IF EXISTS moderation_reports_resolution_code_check;
ALTER TABLE moderation_reports
  ADD CONSTRAINT moderation_reports_resolution_code_check
  CHECK (
    resolution_code IS NULL OR resolution_code IN (
      'dismiss_good_faith',
      'dismiss_false_report',
      'hide_professional_profile',
      'suspend_target_account',
      'permanent_ban_target_account'
    )
  );

ALTER TABLE moderation_actions
  DROP CONSTRAINT IF EXISTS moderation_actions_action_type_check;
ALTER TABLE moderation_actions
  ADD CONSTRAINT moderation_actions_action_type_check
  CHECK (
    action_type IN (
      'dismiss_good_faith',
      'dismiss_false_report',
      'hide_professional_profile',
      'restore_professional_profile',
      'suspend_target_account',
      'permanent_ban_target_account',
      'restore_target_account',
      'lift_reporting_restriction'
    )
  );

ALTER TABLE legal_audit_ledger
  DROP CONSTRAINT IF EXISTS legal_audit_ledger_event_type_check;
ALTER TABLE legal_audit_ledger
  ADD CONSTRAINT legal_audit_ledger_event_type_check
  CHECK (event_type IN ('policy_acceptance', 'account_deletion', 'moderation_account_purge'));

CREATE TABLE IF NOT EXISTS affirmative_search_audit_logs (
  id SERIAL PRIMARY KEY,
  recruiter_user_id INTEGER,
  actor_hash TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  use_case TEXT NOT NULL CHECK (use_case IN ('vaga_afirmativa', 'vaga_inclusiva')),
  vacancy_reference TEXT NOT NULL,
  criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS affirmative_search_audit_actor_idx
  ON affirmative_search_audit_logs (actor_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS affirmative_search_audit_recruiter_idx
  ON affirmative_search_audit_logs (recruiter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_searches (
  id SERIAL PRIMARY KEY,
  recruiter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (alert_frequency IN ('disabled', 'daily', 'weekly', 'biweekly', 'monthly')),
  last_digest_sent_at TIMESTAMPTZ,
  last_alert_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_searches_recruiter_idx
  ON saved_searches (recruiter_user_id, created_at DESC);

ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS alert_frequency TEXT;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ;

UPDATE saved_searches
SET alert_frequency = CASE WHEN alerts_enabled = false THEN 'disabled' ELSE 'daily' END
WHERE alert_frequency IS NULL;

UPDATE saved_searches
SET alert_frequency = 'daily'
WHERE alert_frequency NOT IN ('disabled', 'daily', 'weekly', 'biweekly', 'monthly');

UPDATE saved_searches
SET last_alert_sent_at = last_digest_sent_at
WHERE last_alert_sent_at IS NULL
  AND last_digest_sent_at IS NOT NULL;

ALTER TABLE saved_searches ALTER COLUMN alert_frequency SET DEFAULT 'daily';
UPDATE saved_searches SET alert_frequency = 'daily' WHERE alert_frequency IS NULL;
ALTER TABLE saved_searches ALTER COLUMN alert_frequency SET NOT NULL;

CREATE TABLE IF NOT EXISTS saved_search_notified_profiles (
  id SERIAL PRIMARY KEY,
  saved_search_id INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  professional_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (saved_search_id, professional_user_id)
);

CREATE INDEX IF NOT EXISTS saved_search_notified_profiles_search_idx
  ON saved_search_notified_profiles (saved_search_id, first_notified_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  template_key TEXT NOT NULL,
  to_email TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  provider_message_id TEXT,
  source_type TEXT,
  source_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS email_outbox_status_available_idx
  ON email_outbox (status, available_at, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS email_outbox_source_idx
  ON email_outbox (source_type, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_outbox_dedupe_idx
  ON email_outbox (dedupe_key, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_search_alert_batches (
  id SERIAL PRIMARY KEY,
  saved_search_id INTEGER NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  recruiter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recruiter_name_snapshot TEXT NOT NULL,
  recruiter_email TEXT NOT NULL,
  search_name TEXT NOT NULL,
  criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dead')),
  email_outbox_id INTEGER UNIQUE REFERENCES email_outbox(id) ON DELETE SET NULL,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_search_alert_batches_search_idx
  ON saved_search_alert_batches (saved_search_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_search_alert_batches_status_idx
  ON saved_search_alert_batches (status, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_search_alert_batch_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES saved_search_alert_batches(id) ON DELETE CASCADE,
  professional_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professional_public_slug TEXT,
  profile_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, professional_user_id)
);

CREATE INDEX IF NOT EXISTS saved_search_alert_batch_items_batch_idx
  ON saved_search_alert_batch_items (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_search_alert_batch_items_professional_idx
  ON saved_search_alert_batch_items (professional_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_profile_freshness_notifications (
  id SERIAL PRIMARY KEY,
  user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  profile_updated_at TIMESTAMPTZ NOT NULL,
  stage_days INTEGER NOT NULL CHECK (stage_days IN (60, 120, 180)),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_profile_id, profile_updated_at, stage_days)
);

CREATE INDEX IF NOT EXISTS user_profile_freshness_notifications_profile_idx
  ON user_profile_freshness_notifications (user_profile_id, stage_days, sent_at DESC);

ALTER TABLE user_profile_freshness_notifications
  ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE user_profile_freshness_notifications
  ADD COLUMN IF NOT EXISTS email_outbox_id INTEGER REFERENCES email_outbox(id) ON DELETE SET NULL;
ALTER TABLE user_profile_freshness_notifications
  ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE user_profile_freshness_notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE user_profile_freshness_notifications
SET status = 'sent'
WHERE status IS NULL;

ALTER TABLE user_profile_freshness_notifications
  ALTER COLUMN status SET DEFAULT 'sent';
ALTER TABLE user_profile_freshness_notifications
  ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE user_profile_freshness_notifications
  ALTER COLUMN sent_at DROP DEFAULT;

ALTER TABLE user_profile_freshness_notifications
  DROP CONSTRAINT IF EXISTS user_profile_freshness_notifications_status_check;
ALTER TABLE user_profile_freshness_notifications
  ADD CONSTRAINT user_profile_freshness_notifications_status_check
  CHECK (status IN ('pending', 'sent', 'dead'));

UPDATE user_profile_freshness_notifications
SET status = 'sent'
WHERE status IS NULL;

ALTER TABLE user_profile_freshness_notifications
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS user_profile_freshness_notifications_status_idx
  ON user_profile_freshness_notifications (status, created_at DESC);
