CREATE TABLE IF NOT EXISTS players (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wallet BIGINT NOT NULL DEFAULT 5000 CHECK (wallet >= 0),
  bank BIGINT NOT NULL DEFAULT 0 CHECK (bank >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  prestige INTEGER NOT NULL DEFAULT 0 CHECK (prestige >= 0),
  job_id TEXT,
  job_level INTEGER NOT NULL DEFAULT 1 CHECK (job_level >= 1),
  job_xp BIGINT NOT NULL DEFAULT 0 CHECK (job_xp >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  reputation INTEGER NOT NULL DEFAULT 0,
  work_count BIGINT NOT NULL DEFAULT 0,
  crime_successes BIGINT NOT NULL DEFAULT 0,
  heists_completed BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS players_balance_idx ON players (guild_id, (wallet + bank) DESC);
CREATE INDEX IF NOT EXISTS players_level_idx ON players (guild_id, level DESC, xp DESC);
CREATE INDEX IF NOT EXISTS players_earned_idx ON players (guild_id, lifetime_earned DESC);

CREATE TABLE IF NOT EXISTS economy_ledger (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delta BIGINT NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, user_id, reference)
);
CREATE INDEX IF NOT EXISTS economy_ledger_user_time_idx ON economy_ledger (guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  cooldown_key TEXT NOT NULL,
  next_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, cooldown_key)
);
CREATE INDEX IF NOT EXISTS cooldowns_next_at_idx ON cooldowns (next_at);

CREATE TABLE IF NOT EXISTS inventory (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS heists (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  leader_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recruiting' CHECK (status IN ('recruiting', 'running', 'success', 'failed', 'cancelled')),
  success_chance INTEGER,
  roll INTEGER,
  total_payout BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS heists_guild_status_idx ON heists (guild_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS heist_participants (
  heist_id UUID NOT NULL REFERENCES heists(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (heist_id, user_id)
);
CREATE INDEX IF NOT EXISTS heist_participants_user_idx ON heist_participants (guild_id, user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS halloween_events (
  guild_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  role_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, event_id),
  CHECK (ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS event_quest_progress (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  progress BIGINT NOT NULL DEFAULT 0 CHECK (progress >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, event_id, quest_id)
);
CREATE INDEX IF NOT EXISTS event_quest_progress_user_idx ON event_quest_progress (guild_id, user_id, event_id);
CREATE TABLE IF NOT EXISTS event_claims (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  candy BIGINT NOT NULL,
  points BIGINT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, event_id, quest_id)
);
CREATE TABLE IF NOT EXISTS event_wallets (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  candy BIGINT NOT NULL DEFAULT 0 CHECK (candy >= 0),
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, event_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_guild_time_idx ON audit_logs (guild_id, created_at DESC);
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, setting_key)
);


CREATE TABLE IF NOT EXISTS weekly_activity (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0 CHECK (messages >= 0),
  last_counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chat_earned BIGINT NOT NULL DEFAULT 0 CHECK (chat_earned >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, week_start)
);
CREATE INDEX IF NOT EXISTS weekly_activity_leaderboard_idx
  ON weekly_activity (guild_id, week_start, messages DESC, user_id);

CREATE TABLE IF NOT EXISTS daily_chat_rewards (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reward_day DATE NOT NULL,
  earned BIGINT NOT NULL DEFAULT 0 CHECK (earned >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, reward_day)
);
