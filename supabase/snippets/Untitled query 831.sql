SELECT
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trusted_helpers'
  AND column_name IN (
    'accepted_invite_id',
    'approved_by',
    'approved_at'
  )
ORDER BY column_name;