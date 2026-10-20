SELECT
  has_table_privilege(
    'authenticated',
    'public.trusted_helpers',
    'INSERT'
  ) AS can_insert_helpers,

  has_table_privilege(
    'authenticated',
    'public.trusted_helpers',
    'UPDATE'
  ) AS can_update_helpers,

  has_table_privilege(
    'authenticated',
    'public.helper_invites',
    'INSERT'
  ) AS can_insert_invites,

  has_function_privilege(
    'authenticated',
    'public.create_helper_with_invite(uuid,text,text)',
    'EXECUTE'
  ) AS can_create_invite_rpc,

  has_function_privilege(
    'authenticated',
    'public.approve_helper(uuid)',
    'EXECUTE'
  ) AS can_approve_rpc;