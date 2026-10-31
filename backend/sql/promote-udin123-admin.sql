-- Promote the existing RUANGDIGITAL190 account @udin123 to administrator.
-- First create/register this account through the public website and verify its email.
-- This script does NOT set or store the password; Supabase Auth manages passwords securely.

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where lower(username) = lower('udin123')
  limit 1;

  if v_user_id is null then
    raise exception 'Akun @udin123 belum terdaftar. Daftarkan akun terlebih dahulu melalui website.';
  end if;

  update public.profiles
  set role = 'admin', updated_at = now()
  where id = v_user_id;
end $$;

select username, role, created_at
from public.profiles
where lower(username) = lower('udin123');
