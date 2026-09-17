-- Run this in the Supabase SQL Editor after signing in once with Google.
-- Replace the email value before executing.

update public.profiles p
set role = 'admin'::public.user_role
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('your-google-email@example.com');

select
  u.id,
  u.email,
  p.role
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('your-google-email@example.com');
