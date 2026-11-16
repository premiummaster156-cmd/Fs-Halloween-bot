-- Staff-issued ticket cooldowns are scoped to a member and request type.
-- They are never assigned automatically; ordinary support ticket types are excluded by command policy.
CREATE TABLE IF NOT EXISTS coopft_ticket_cooldowns (
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  set_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, member_id, ticket_type)
);
CREATE INDEX IF NOT EXISTS coopft_ticket_cooldowns_expiry_idx
  ON coopft_ticket_cooldowns (guild_id, member_id, expires_at);
