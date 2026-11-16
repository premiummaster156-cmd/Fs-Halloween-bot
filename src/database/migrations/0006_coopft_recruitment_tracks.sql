-- CoopFT recruitment is limited to Junior Moderator, Moderator and Developer.
-- Keep historical reviewed records readable, but withdraw pending applications
-- for positions that are no longer offered.
ALTER TABLE coopft_applications
  DROP CONSTRAINT IF EXISTS coopft_applications_role_key_check;

UPDATE coopft_applications
SET status = 'withdrawn',
    reviewed_at = COALESCE(reviewed_at, NOW()),
    review_note = COALESCE(
      review_note,
      'This recruitment track is no longer offered. Please submit a new application for Junior Moderator, Moderator or Developer.'
    )
WHERE status = 'pending'
  AND role_key NOT IN ('junior_moderator', 'moderator', 'developer');

ALTER TABLE coopft_applications
  ADD CONSTRAINT coopft_applications_role_key_check
  CHECK (role_key IN (
    'junior_moderator',
    'moderator',
    'developer',
    -- Historical keys remain valid so reviewed application records are preserved.
    'staff_supervisor', 'supreme_council', 'senate', 'head_moderator',
    'council', 'senior_moderator',
    'war_manager', 'referee', 'observer', 'helper', 'ticket_staff'
  ));
