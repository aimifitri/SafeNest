begin;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select count(*) as joined_circle_count
from public.list_my_joined_circles();

rollback;