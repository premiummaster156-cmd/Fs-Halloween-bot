ALTER TABLE coopft_tickets
  DROP CONSTRAINT IF EXISTS coopft_tickets_ticket_type_check;

ALTER TABLE coopft_tickets
  ADD CONSTRAINT coopft_tickets_ticket_type_check
  CHECK (ticket_type IN (
    'support', 'bug', 'custom_bot', 'suggestion',
    'bot_bug', 'bot_suggestion', 'bot_gameplay', 'bot_account', 'bot_exploit',
    'server_support', 'server_bug', 'server_suggestion', 'member_report', 'staff_report', 'partnership'
  ));

ALTER TABLE coopft_tickets
  ADD COLUMN IF NOT EXISTS ticket_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE coopft_tickets
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE coopft_tickets
  DROP CONSTRAINT IF EXISTS coopft_tickets_priority_check;

ALTER TABLE coopft_tickets
  ADD CONSTRAINT coopft_tickets_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

CREATE TABLE IF NOT EXISTS coopft_mod_cases (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('warn', 'timeout', 'kick', 'ban', 'unban')),
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coopft_mod_cases_target_idx
  ON coopft_mod_cases (guild_id, target_id, action, active, created_at DESC);

CREATE TABLE IF NOT EXISTS coopft_staff_notes (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS coopft_staff_notes_member_idx
  ON coopft_staff_notes (guild_id, member_id, deleted_at, created_at DESC);

CREATE TABLE IF NOT EXISTS coopft_suggestions (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'accepted', 'planned', 'implemented', 'declined')),
  channel_id TEXT,
  message_id TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coopft_suggestions_status_idx
  ON coopft_suggestions (guild_id, status, created_at DESC);
