-- Server-owner managed automatic join roles and welcome-channel settings.
CREATE TABLE IF NOT EXISTS guild_autoroles (
  guild_id TEXT PRIMARY KEY,
  role_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_welcome_settings (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
