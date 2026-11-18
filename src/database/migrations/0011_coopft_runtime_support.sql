-- CoopFT stores its own member lifecycle configuration and audit history.
-- Fukishōkai keeps these tables in its schema, but CoopFT now uses an isolated database.
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_guild_time_idx
  ON audit_logs (guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, setting_key)
);
