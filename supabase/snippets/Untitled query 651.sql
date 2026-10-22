select
    grantee,
    privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'list_my_joined_circles'
order by grantee;