-- Add the dedicated Developer recruitment track while retaining historical application keys.
ALTER TABLE coopft_applications
  DROP CONSTRAINT IF EXISTS coopft_applications_role_key_check;

ALTER TABLE coopft_applications
  ADD CONSTRAINT coopft_applications_role_key_check
  CHECK (role_key IN (
    'junior_moderator', 'moderator', 'developer',
    'staff_supervisor', 'supreme_council', 'senate', 'head_moderator',
    'council', 'senior_moderator',
    'war_manager', 'referee', 'observer', 'helper', 'ticket_staff'
  ));
