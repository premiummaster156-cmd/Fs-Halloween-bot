-- Restrict new CoopFT applications to Junior Moderator, Moderator and Developer.
-- Existing historical application rows remain valid for audit/history purposes.
ALTER TABLE coopft_applications
  DROP CONSTRAINT IF EXISTS coopft_applications_role_key_check;

UPDATE coopft_applications
SET status = 'withdrawn',
    review_note = COALESCE(review_note, 'This position is no longer accepting applications. Please apply for Junior Moderator, Moderator or Developer.')
WHERE status = 'pending'
  AND role_key NOT IN ('junior_moderator', 'moderator', 'developer');

ALTER TABLE coopft_applications
  ADD CONSTRAINT coopft_applications_role_key_check
  CHECK (role_key IN (
    'junior_moderator', 'moderator', 'developer',
    'staff_supervisor', 'supreme_council', 'senate', 'head_moderator',
    'council', 'senior_moderator',
    'war_manager', 'referee', 'observer', 'helper', 'ticket_staff'
  ));
