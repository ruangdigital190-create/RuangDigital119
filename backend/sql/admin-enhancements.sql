-- RUANGDIGITAL190 — admin enhancements
-- Run this AFTER backend/sql/schema.sql and seed-products.sql.
-- Adds product image storage and per-browser login activity monitoring.

begin;

-- Product image URL consumed by both admin dashboard and public catalog.
alter table public.products
  add column if not exists image_url text;

-- One record per user + browser installation. A recent heartbeat is treated as online.
create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_label text not null default 'Perangkat tidak dikenal',
  platform text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  signed_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_sessions_user_device_unique unique (user_id, device_id)
);

create unique index if not exists device_sessions_user_device_uidx
  on public.device_sessions(user_id, device_id);
create index if not exists device_sessions_last_seen_idx
  on public.device_sessions(last_seen_at desc);
create index if not exists device_sessions_user_last_seen_idx
  on public.device_sessions(user_id, last_seen_at desc);

alter table public.device_sessions enable row level security;

drop policy if exists device_sessions_select_owner_admin on public.device_sessions;
create policy device_sessions_select_owner_admin
  on public.device_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists device_sessions_insert_owner on public.device_sessions;
create policy device_sessions_insert_owner
  on public.device_sessions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists device_sessions_update_owner_admin on public.device_sessions;
create policy device_sessions_update_owner_admin
  on public.device_sessions for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists device_sessions_delete_admin on public.device_sessions;
create policy device_sessions_delete_admin
  on public.device_sessions for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.device_sessions to authenticated;

drop trigger if exists set_updated_at_device_sessions_rd190 on public.device_sessions;
create trigger set_updated_at_device_sessions_rd190
  before update on public.device_sessions
  for each row execute procedure public.set_updated_at();

-- Product images are public to display in the shop; only admins can upload, replace, or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rd190-product-images',
  'rd190-product-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rd190_product_images_public_read on storage.objects;
create policy rd190_product_images_public_read
  on storage.objects for select to public
  using (bucket_id = 'rd190-product-images');

drop policy if exists rd190_product_images_admin_insert on storage.objects;
create policy rd190_product_images_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rd190-product-images' and public.is_admin());

drop policy if exists rd190_product_images_admin_update on storage.objects;
create policy rd190_product_images_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'rd190-product-images' and public.is_admin())
  with check (bucket_id = 'rd190-product-images' and public.is_admin());

drop policy if exists rd190_product_images_admin_delete on storage.objects;
create policy rd190_product_images_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'rd190-product-images' and public.is_admin());

-- Keep product variant changes in the same audit history as product and order changes.
drop trigger if exists audit_product_variants_rd190 on public.product_variants;
create trigger audit_product_variants_rd190
  after insert or update or delete on public.product_variants
  for each row execute procedure public.log_audit_event();

commit;

-- Verification:
select
  (select count(*) from public.products) as total_products,
  (select count(*) from public.product_variants) as total_variants,
  (select count(*) from public.device_sessions) as tracked_devices;
