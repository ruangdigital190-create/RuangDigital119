-- RUANGDIGITAL190: promote the already-registered sholeh123 account to admin.
-- First create the account on the public site:
-- username: sholeh123
-- password: sholeh123
-- Use an email address you control and complete email verification if enabled.
-- Then run this SQL in Supabase SQL Editor.

update public.profiles
set role = 'admin',
    updated_at = now()
where lower(username) = 'sholeh123'
returning username, display_name, role, created_at;

-- If the query returns 0 rows, the account has not been registered yet,
-- the username is different, or registration/verification is incomplete.
-- Do not store the password in SQL, HTML, JavaScript, GitHub, or this file.
