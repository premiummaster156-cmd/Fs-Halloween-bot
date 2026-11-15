CREATE TABLE IF NOT EXISTS coopft_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  role_key TEXT NOT NULL CHECK (role_key IN (
    'war_manager', 'referee', 'observer', 'helper', 'ticket_staff'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'declined', 'withdrawn'
  )),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_message_id TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coopft_applications_queue_idx
  ON coopft_applications (guild_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS coopft_applications_member_idx
  ON coopft_applications (guild_id, applicant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS coopft_applications_one_pending_per_position_idx
  ON coopft_applications (guild_id, applicant_id, role_key)
  WHERE status = 'pending';
