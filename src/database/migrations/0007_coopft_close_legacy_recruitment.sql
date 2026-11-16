-- Close pending legacy recruitment tracks so only the three public positions remain active.
-- Historical application rows remain intact for audit purposes.
UPDATE coopft_applications
SET status = 'withdrawn',
    reviewed_at = COALESCE(reviewed_at, NOW()),
    review_note = COALESCE(
      review_note,
      'This recruitment track is no longer offered. Current applications are limited to Junior Moderator, Moderator and Developer.'
    )
WHERE status = 'pending'
  AND role_key NOT IN ('junior_moderator', 'moderator', 'developer');

