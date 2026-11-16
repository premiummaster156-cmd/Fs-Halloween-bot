-- Move CoopFT recruitment to the official operational staff hierarchy.
-- Keep legacy role keys valid for historical, already-reviewed application rows;
-- outstanding applications for retired specialist positions are withdrawn.
ALTER TABLE coopft_applications
  DROP CONSTRAINT IF EXISTS coopft_applications_role_key_check;

UPDATE coopft_applications
SET status = 'withdrawn',
    review_note = COALESCE(review_note, 'This position is no longer available. Please submit a new application for an available staff rank.')
WHERE status = 'pending'
  AND role_key IN ('war_manager', 'referee', 'observer', 'helper', 'ticket_staff');

ALTER TABLE coopft_applications
  ADD CONSTRAINT coopft_applications_role_key_check
  CHECK (role_key IN (
    'staff_supervisor', 'supreme_council', 'senate', 'head_moderator',
    'council', 'senior_moderator', 'moderator', 'junior_moderator',
    'war_manager', 'referee', 'observer', 'helper', 'ticket_staff'
  ));

DROP TABLE IF EXISTS coopft_application_subscriptions;
