CREATE TABLE IF NOT EXISTS coopft_application_subscriptions (
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  role_key TEXT NOT NULL CHECK (role_key IN (
    'war_manager', 'referee', 'observer', 'helper', 'ticket_staff'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, member_id, role_key)
);

CREATE INDEX IF NOT EXISTS coopft_application_subscriptions_role_idx
  ON coopft_application_subscriptions (guild_id, role_key, created_at DESC);
