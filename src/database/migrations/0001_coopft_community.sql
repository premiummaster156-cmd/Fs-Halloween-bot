CREATE TABLE IF NOT EXISTS coopft_community_settings (
  guild_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, setting_key)
);

CREATE TABLE IF NOT EXISTS coopft_staff_members (
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  rank_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  hired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL,
  PRIMARY KEY (guild_id, member_id)
);
CREATE INDEX IF NOT EXISTS coopft_staff_active_idx
  ON coopft_staff_members (guild_id, active, rank_key);

CREATE TABLE IF NOT EXISTS coopft_staff_audit (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  member_id TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coopft_staff_audit_time_idx
  ON coopft_staff_audit (guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS coopft_tickets (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  opener_id TEXT NOT NULL,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('support', 'bug', 'custom_bot', 'suggestion')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  claimed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS coopft_tickets_member_idx
  ON coopft_tickets (guild_id, opener_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS coopft_tickets_one_open_per_member_idx
  ON coopft_tickets (guild_id, opener_id) WHERE status='open';
