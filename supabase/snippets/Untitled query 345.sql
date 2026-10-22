select
    routine_name,
    routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'list_my_joined_circles';