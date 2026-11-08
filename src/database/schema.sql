CREATE TABLE IF NOT EXISTS players (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wallet BIGINT NOT NULL DEFAULT 5000 CHECK (wallet >= 0),
  bank BIGINT NOT NULL DEFAULT 0 CHECK (bank >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  prestige INTEGER NOT NULL DEFAULT 0 CHECK (prestige >= 0),
  last_rebirth_at TIMESTAMPTZ,
  job_id TEXT,
  job_level INTEGER NOT NULL DEFAULT 1 CHECK (job_level >= 1),
  job_xp BIGINT NOT NULL DEFAULT 0 CHECK (job_xp >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  reputation INTEGER NOT NULL DEFAULT 0,
  work_count BIGINT NOT NULL DEFAULT 0,
  rebirth_work_count BIGINT NOT NULL DEFAULT 0 CHECK (rebirth_work_count >= 0),
  crime_successes BIGINT NOT NULL DEFAULT 0,
  heists_completed BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_rebirth_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS rebirth_work_count BIGINT NOT NULL DEFAULT 0 CHECK (rebirth_work_count >= 0);
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
-- Backfill current-run work shifts for players from the previous counter rollout.
UPDATE players p
SET rebirth_work_count = (
  SELECT COUNT(*)::bigint
  FROM economy_ledger l
  WHERE l.guild_id = p.guild_id
    AND l.user_id = p.user_id
    AND l.reason = 'job_work'
    AND (p.last_rebirth_at IS NULL OR l.created_at > p.last_rebirth_at)
)
WHERE p.rebirth_work_count = 0 AND p.work_count > 0;

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
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS upgrade_level INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_level BETWEEN 0 AND 5);

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
CREATE TABLE IF NOT EXISTS custom_commands (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  definition JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  deployed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (jsonb_typeof(definition) = 'object')
);
ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS source_code TEXT;
ALTER TABLE custom_commands DROP CONSTRAINT IF EXISTS custom_commands_guild_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS custom_commands_guild_name_active_idx
  ON custom_commands (guild_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS custom_commands_guild_active_idx
  ON custom_commands (guild_id, is_active, name)
  WHERE deleted_at IS NULL;

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

CREATE TABLE IF NOT EXISTS weekly_quest_progress (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  quest_id TEXT NOT NULL,
  progress BIGINT NOT NULL DEFAULT 0 CHECK (progress >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, week_start, quest_id)
);
CREATE INDEX IF NOT EXISTS weekly_quest_progress_user_idx
  ON weekly_quest_progress (guild_id, user_id, week_start);

CREATE TABLE IF NOT EXISTS weekly_quest_claims (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  quest_id TEXT NOT NULL,
  candy BIGINT NOT NULL CHECK (candy >= 0),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, week_start, quest_id)
);

CREATE TABLE IF NOT EXISTS daily_chat_rewards (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reward_day DATE NOT NULL,
  earned BIGINT NOT NULL DEFAULT 0 CHECK (earned >= 0),
  xp_earned BIGINT NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, reward_day)
);
ALTER TABLE daily_chat_rewards ADD COLUMN IF NOT EXISTS xp_earned BIGINT NOT NULL DEFAULT 0 CHECK (xp_earned >= 0);


CREATE TABLE IF NOT EXISTS equipped_items (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_id TEXT NOT NULL,
  equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, slot),
  UNIQUE (guild_id, user_id, item_id)
);
CREATE INDEX IF NOT EXISTS equipped_items_user_idx ON equipped_items (guild_id, user_id);


CREATE TABLE IF NOT EXISTS leaderboard_exclusions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  excluded_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS leaderboard_exclusions_guild_idx
  ON leaderboard_exclusions (guild_id, user_id);


-- Security incidents are auditable and can be reviewed from the log-channel alert.
CREATE TABLE IF NOT EXISTS security_incidents (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_incidents_guild_time_idx
  ON security_incidents (guild_id, created_at DESC);

-- Restrictions apply only to this bot, not to the member's Discord server permissions.
-- expires_at NULL means the bot restriction remains until an owner removes it.
CREATE TABLE IF NOT EXISTS bot_user_restrictions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS bot_user_restrictions_expiry_idx
  ON bot_user_restrictions (expires_at);


-- Persistent public crew board for visible heist recruiting and final results.
ALTER TABLE heists ADD COLUMN IF NOT EXISTS announcement_channel_id TEXT;
ALTER TABLE heists ADD COLUMN IF NOT EXISTS announcement_message_id TEXT;


-- Non-spendable points and records for public party mini-games.
CREATE TABLE IF NOT EXISTS party_game_stats (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  games BIGINT NOT NULL DEFAULT 0 CHECK (games >= 0),
  wins BIGINT NOT NULL DEFAULT 0 CHECK (wins >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS party_game_stats_leaderboard_idx
  ON party_game_stats (guild_id, points DESC, wins DESC, best_streak DESC);


-- Retire the weekly boss while preserving its old records for historical reference.
DO $$
BEGIN
  IF to_regclass('public.guild_boss_claims') IS NOT NULL
     AND to_regclass('public.archived_guild_boss_claims') IS NULL THEN
    ALTER TABLE public.guild_boss_claims RENAME TO archived_guild_boss_claims;
  END IF;
  IF to_regclass('public.guild_boss_contributions') IS NOT NULL
     AND to_regclass('public.archived_guild_boss_contributions') IS NULL THEN
    ALTER TABLE public.guild_boss_contributions RENAME TO archived_guild_boss_contributions;
  END IF;
  IF to_regclass('public.guild_bosses') IS NOT NULL
     AND to_regclass('public.archived_guild_bosses') IS NULL THEN
    ALTER TABLE public.guild_bosses RENAME TO archived_guild_bosses;
  END IF;
END $$;

-- Permanent achievement claims are unique per member and milestone.
CREATE TABLE IF NOT EXISTS achievement_claims (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS achievement_claims_member_idx
  ON achievement_claims (guild_id, user_id, claimed_at DESC);


-- One-time repair: lifetime totals count real game income and outflows, not moving money
-- between wallet/bank or receiving a player transfer.
CREATE TABLE IF NOT EXISTS application_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM application_migrations
    WHERE migration_id = '2026-11-05-lifetime-economy-accounting-v1'
  ) THEN
    UPDATE players p
    SET lifetime_earned = COALESCE((
      SELECT SUM(l.delta) FROM economy_ledger l
      WHERE l.guild_id = p.guild_id AND l.user_id = p.user_id
        AND l.reason IN (
          'daily_reward', 'job_work', 'crime_success', 'heist_reward',
          'casino_payout', 'chat_activity_reward', 'achievement_reward'
        )
    ), 0),
    lifetime_spent = COALESCE((
      SELECT SUM(-l.delta) FROM economy_ledger l
      WHERE l.guild_id = p.guild_id AND l.user_id = p.user_id
        AND l.reason IN (
          'shop_purchase', 'item_upgrade', 'casino_bet',
          'crime_failed_fine', 'heist_failed_fine', 'member_transfer_out'
        )
    ), 0);

    INSERT INTO application_migrations (migration_id)
    VALUES ('2026-11-05-lifetime-economy-accounting-v1');
  END IF;
END $$;
 
-- Live booster status is separate from a member's lifetime personal boost-event count.
CREATE TABLE IF NOT EXISTS server_booster_status (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  server_boost_count INTEGER NOT NULL DEFAULT 0 CHECK (server_boost_count >= 0),
  personal_boost_count INTEGER NOT NULL DEFAULT 0 CHECK (personal_boost_count >= 0),
  boost_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
ALTER TABLE server_booster_status
  ADD COLUMN IF NOT EXISTS personal_boost_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS server_booster_status_active_idx
  ON server_booster_status (guild_id, is_active, server_boost_count);

-- Each Discord GUILD_BOOST system message is one idempotent personal boost reward event.
CREATE TABLE IF NOT EXISTS server_boost_events (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  boost_number INTEGER CHECK (boost_number IS NULL OR boost_number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, message_id),
  UNIQUE (guild_id, user_id, boost_number)
);
CREATE INDEX IF NOT EXISTS server_boost_events_member_idx
  ON server_boost_events (guild_id, user_id, created_at DESC);


-- Persistent solo boss encounters for the Rift Arena.
CREATE TABLE IF NOT EXISTS boss_battles (
  id UUID PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  boss_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'won', 'lost', 'escaped')),
  player_hp INTEGER NOT NULL CHECK (player_hp >= 0),
  player_max_hp INTEGER NOT NULL CHECK (player_max_hp > 0),
  boss_hp INTEGER NOT NULL CHECK (boss_hp >= 0),
  boss_max_hp INTEGER NOT NULL CHECK (boss_max_hp > 0),
  turn INTEGER NOT NULL DEFAULT 0 CHECK (turn >= 0),
  shield INTEGER NOT NULL DEFAULT 0 CHECK (shield >= 0),
  weakened_turns INTEGER NOT NULL DEFAULT 0 CHECK (weakened_turns >= 0),
  hex_turns INTEGER NOT NULL DEFAULT 0 CHECK (hex_turns >= 0),
  used_abilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(used_abilities) = 'array'),
  last_event TEXT NOT NULL DEFAULT 'The encounter begins.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS boss_battles_one_active_per_player_idx
  ON boss_battles (guild_id, user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS boss_battles_history_idx
  ON boss_battles (guild_id, user_id, created_at DESC);

-- Secure, two-sided player trading with independent confirmations.
CREATE TABLE IF NOT EXISTS player_trades (
 id UUID PRIMARY KEY,
 guild_id TEXT NOT NULL,
 initiator_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 offers JSONB NOT NULL DEFAULT '{"initiator":{"fc":0,"items":[]},"target":{"fc":0,"items":[]}}'::jsonb,
 confirmations JSONB NOT NULL DEFAULT '{"initiator":false,"target":false}'::jsonb,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled','expired')),
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 CHECK(initiator_id<>target_id)
);
CREATE INDEX IF NOT EXISTS player_trades_active_idx ON player_trades(guild_id,status,expires_at);

CREATE TABLE IF NOT EXISTS economy_events (
 id UUID PRIMARY KEY,
 guild_id TEXT NOT NULL,
 name TEXT NOT NULL,
 multiplier NUMERIC(4,2) NOT NULL CHECK(multiplier BETWEEN 2 AND 10),
 starts_at TIMESTAMPTZ NOT NULL,
 ends_at TIMESTAMPTZ NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS economy_events_active_idx ON economy_events(guild_id,enabled,ends_at DESC);
