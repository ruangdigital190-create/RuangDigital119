-- RUANGDIGITAL190 — Supabase PostgreSQL schema
-- Jalankan satu kali di Supabase SQL Editor sebelum deploy website.
-- Seluruh role pelanggan dibuat otomatis sebagai 'customer'. Admin ditetapkan manual oleh pemilik project.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- PROFILES & ROLES
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null default 'Pelanggan',
  email text not null,
  whatsapp text,
  role text not null default 'customer' check (role in ('customer','admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(username));
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_name text;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if v_username = '' then v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12); end if;
  v_name := trim(coalesce(new.raw_user_meta_data->>'display_name', 'Pelanggan'));
  insert into public.profiles (id, username, display_name, email, whatsapp, role)
  values (new.id, v_username, coalesce(nullif(v_name,''),'Pelanggan'), lower(new.email), nullif(trim(new.raw_user_meta_data->>'whatsapp'),''), 'customer');
  insert into public.wallet_accounts (user_id, balance) values (new.id, 0) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rd190 on auth.users;
create trigger on_auth_user_created_rd190 after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_email_changed_rd190 on auth.users;
create trigger on_auth_user_email_changed_rd190 after update of email on auth.users
for each row execute procedure public.sync_auth_user_email();

-- -----------------------------------------------------------------------------
-- PRODUCTS & VARIANTS
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id text primary key,
  brand text not null,
  title text not null,
  group_name text not null check (group_name in ('apps','games')),
  category text not null,
  tag text,
  short_description text,
  description text,
  info text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_active_sort_idx on public.products (is_active, sort_order);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  name text not null,
  price bigint check (price is null or price >= 0),
  original_price bigint check (original_price is null or original_price >= 0),
  discount_enabled boolean not null default false,
  stock_status text not null default 'confirm' check (stock_status in ('available','limited','out_of_stock','confirm')),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  note text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, sort_order)
);
create index if not exists variants_product_sort_idx on public.product_variants (product_id, is_active, sort_order);

-- -----------------------------------------------------------------------------
-- ORDERS, ITEMS & PAYMENTS
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null,
  whatsapp text not null,
  email text,
  note text,
  total_amount bigint not null default 0 check (total_amount >= 0),
  requires_quote boolean not null default false,
  status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation','awaiting_payment','processing','completed','cancelled','failed','refunded')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','expired','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_title text not null,
  variant_name text not null,
  unit_price bigint check (unit_price is null or unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  subtotal bigint check (subtotal is null or subtotal >= 0),
  game_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'midtrans',
  provider_order_id text not null unique,
  provider_transaction_id text,
  payment_type text not null default 'qris',
  amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','cancelled','refunded')),
  qr_code_url text,
  expires_at timestamptz,
  raw_response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payments_order_unique_idx on public.payments(order_id);
create index if not exists payments_status_idx on public.payments(status, created_at desc);

-- -----------------------------------------------------------------------------
-- WALLET / SALDO (tidak dapat diubah langsung dari browser)
-- -----------------------------------------------------------------------------
create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('deposit','purchase','refund','adjustment')),
  direction text not null check (direction in ('credit','debit')),
  amount bigint not null check (amount > 0),
  reference text,
  description text,
  status text not null default 'pending' check (status in ('pending','completed','failed','reversed')),
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_user_idx on public.wallet_transactions(user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- REFUND, WARRANTY, REVIEWS, NOTIFICATIONS, FAQ & STORE SETTINGS
-- -----------------------------------------------------------------------------
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  order_number text not null,
  customer_contact text not null,
  product_details text,
  reason text not null,
  requested_amount bigint check (requested_amount is null or requested_amount >= 0),
  status text not null default 'waiting_review' check (status in ('waiting_review','processing','approved','rejected','completed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refund_requests_created_idx on public.refund_requests(created_at desc);

create table if not exists public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  order_number text not null,
  customer_contact text not null,
  product_details text,
  issue_description text not null,
  evidence_url text,
  status text not null default 'waiting_review' check (status in ('waiting_review','processing','approved','rejected','completed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists warranty_claims_created_idx on public.warranty_claims(created_at desc);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  review_text text not null check (char_length(review_text) between 5 and 1500),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, order_id, product_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists faqs_category_question_uidx on public.faqs(category, question);

create table if not exists public.store_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- Hashed key only; used by the username-login Edge Function to limit repeated attempts.
create table if not exists public.auth_login_attempts (
  id bigserial primary key,
  attempt_key text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists auth_login_attempts_key_time_idx on public.auth_login_attempts(attempt_key, attempted_at desc);

-- -----------------------------------------------------------------------------
-- BUSINESS FUNCTIONS
-- -----------------------------------------------------------------------------
create or replace function public.create_store_order(
  p_customer_name text,
  p_whatsapp text,
  p_email text,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_product_id text;
  v_variant_id uuid;
  v_quantity integer;
  v_product_title text;
  v_variant_name text;
  v_price bigint;
  v_stock text;
  v_total bigint := 0;
  v_requires_quote boolean := false;
  v_order_id uuid;
  v_order_number text;
  v_line_subtotal bigint;
  v_line jsonb;
begin
  if v_user_id is null then raise exception 'LOGIN_REQUIRED'; end if;
  if coalesce(length(trim(p_customer_name)),0) < 2 then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if coalesce(length(regexp_replace(p_whatsapp, '[^0-9]', '', 'g')),0) < 9 then raise exception 'WHATSAPP_INVALID'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'INVALID_ORDER_ITEMS'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := v_item->>'product_id';
    v_variant_id := nullif(v_item->>'variant_id','')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::integer, 1);
    if v_quantity < 1 or v_quantity > 99 then raise exception 'INVALID_QUANTITY'; end if;
    if v_variant_id is null then raise exception 'VARIANT_NOT_SYNCED'; end if;

    select p.title, v.name, v.price, v.stock_status
      into v_product_title, v_variant_name, v_price, v_stock
      from public.products p
      join public.product_variants v on v.product_id = p.id
      where p.id = v_product_id and p.is_active = true and v.id = v_variant_id and v.is_active = true;
    if not found then raise exception 'PRODUCT_OR_VARIANT_NOT_FOUND'; end if;
    if v_stock = 'out_of_stock' then raise exception 'PRODUCT_OUT_OF_STOCK'; end if;

    if v_price is null then
      v_requires_quote := true;
      v_line_subtotal := null;
    else
      v_line_subtotal := v_price * v_quantity;
      v_total := v_total + v_line_subtotal;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'variant_id', v_variant_id, 'product_title', v_product_title,
      'variant_name', v_variant_name, 'unit_price', v_price, 'quantity', v_quantity,
      'subtotal', v_line_subtotal, 'game_data', coalesce(v_item->'game_data','{}'::jsonb)
    ));
  end loop;

  v_order_number := 'RD' || to_char(now() at time zone 'Asia/Jakarta','YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
  insert into public.orders (order_number,user_id,customer_name,whatsapp,email,note,total_amount,requires_quote,status,payment_status)
  values (v_order_number,v_user_id,trim(p_customer_name),trim(p_whatsapp),nullif(trim(p_email),''),nullif(trim(p_note),''),v_total,v_requires_quote,'awaiting_confirmation','unpaid')
  returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items (order_id,product_id,variant_id,product_title,variant_name,unit_price,quantity,subtotal,game_data)
    values (v_order_id,v_line->>'product_id',(v_line->>'variant_id')::uuid,v_line->>'product_title',v_line->>'variant_name',
      nullif(v_line->>'unit_price','')::bigint,(v_line->>'quantity')::integer,nullif(v_line->>'subtotal','')::bigint,coalesce(v_line->'game_data','{}'::jsonb));
  end loop;

  insert into public.notifications(user_id,title,body,link)
  values (v_user_id,'Pesanan diterima','Pesanan ' || v_order_number || ' tersimpan dan menunggu konfirmasi admin.','orders');

  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'total_amount',v_total,'requires_quote',v_requires_quote,'status','awaiting_confirmation');
end;
$$;
revoke all on function public.create_store_order(text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_store_order(text,text,text,text,jsonb) to authenticated;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'users_count', (select count(*) from public.profiles),
    'orders_count', (select count(*) from public.orders),
    'pending_orders_count', (select count(*) from public.orders where status not in ('completed','cancelled','refunded')),
    'paid_sales_total', (select coalesce(sum(total_amount),0) from public.orders where payment_status = 'paid'),
    'refund_count', (select count(*) from public.refund_requests),
    'warranty_count', (select count(*) from public.warranty_claims)
  );
end;
$$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op = 'INSERT' then v_new := to_jsonb(new); v_id := coalesce(v_new->>'id',v_new->>'order_number',v_new->>'setting_key');
  elsif tg_op = 'UPDATE' then v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := coalesce(v_new->>'id',v_new->>'order_number',v_new->>'setting_key');
  else v_old := to_jsonb(old); v_id := coalesce(v_old->>'id',v_old->>'order_number',v_old->>'setting_key'); end if;
  insert into public.audit_logs(actor_id,action,table_name,record_id,old_data,new_data)
  values (auth.uid(),tg_op,tg_table_name,v_id,v_old,v_new);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_products_rd190 on public.products;
create trigger audit_products_rd190 after insert or update or delete on public.products for each row execute procedure public.log_audit_event();
drop trigger if exists audit_orders_rd190 on public.orders;
create trigger audit_orders_rd190 after update on public.orders for each row execute procedure public.log_audit_event();

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','products','product_variants','orders','payments','refund_requests','warranty_claims','faqs'] LOOP
    EXECUTE format('drop trigger if exists set_updated_at_rd190 on public.%I', t);
    EXECUTE format('create trigger set_updated_at_rd190 before update on public.%I for each row execute procedure public.set_updated_at()', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

-- Profiles: customer can read own profile. Admin can read all. Role/email cannot be changed by customer.
DROP POLICY IF EXISTS profiles_select_self_admin ON public.profiles;
CREATE POLICY profiles_select_self_admin ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND (role = 'customer' OR public.is_admin()));
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, whatsapp, avatar_url) ON public.profiles TO authenticated;

-- Products: public can read active catalog; admins can manage.
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products FOR SELECT TO anon, authenticated USING (is_active = true OR public.is_admin());
DROP POLICY IF EXISTS products_admin_manage ON public.products;
CREATE POLICY products_admin_manage ON public.products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

DROP POLICY IF EXISTS variants_public_read ON public.product_variants;
CREATE POLICY variants_public_read ON public.product_variants FOR SELECT TO anon, authenticated USING (is_active = true AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active = true) OR public.is_admin());
DROP POLICY IF EXISTS variants_admin_manage ON public.product_variants;
CREATE POLICY variants_admin_manage ON public.product_variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;

-- Orders and order items: only owner/admin can read; customer inserts only via create_store_order RPC.
DROP POLICY IF EXISTS orders_select_owner_admin ON public.orders;
CREATE POLICY orders_select_owner_admin ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS orders_admin_update ON public.orders;
CREATE POLICY orders_admin_update ON public.orders FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.orders TO authenticated;
GRANT UPDATE ON public.orders TO authenticated;
DROP POLICY IF EXISTS order_items_select_owner_admin ON public.order_items;
CREATE POLICY order_items_select_owner_admin ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin())));
GRANT SELECT ON public.order_items TO authenticated;

DROP POLICY IF EXISTS payments_select_owner_admin ON public.payments;
CREATE POLICY payments_select_owner_admin ON public.payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin())));
GRANT SELECT ON public.payments TO authenticated;

DROP POLICY IF EXISTS wallet_accounts_select_owner_admin ON public.wallet_accounts;
CREATE POLICY wallet_accounts_select_owner_admin ON public.wallet_accounts FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.wallet_accounts TO authenticated;
DROP POLICY IF EXISTS wallet_transactions_select_owner_admin ON public.wallet_transactions;
CREATE POLICY wallet_transactions_select_owner_admin ON public.wallet_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.wallet_transactions TO authenticated;

DROP POLICY IF EXISTS refund_select_owner_admin ON public.refund_requests;
CREATE POLICY refund_select_owner_admin ON public.refund_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS refund_insert_owner ON public.refund_requests;
CREATE POLICY refund_insert_owner ON public.refund_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.order_number = refund_requests.order_number AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS refund_admin_update ON public.refund_requests;
CREATE POLICY refund_admin_update ON public.refund_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.refund_requests TO authenticated;

DROP POLICY IF EXISTS warranty_select_owner_admin ON public.warranty_claims;
CREATE POLICY warranty_select_owner_admin ON public.warranty_claims FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS warranty_insert_owner ON public.warranty_claims;
CREATE POLICY warranty_insert_owner ON public.warranty_claims FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.order_number = warranty_claims.order_number AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS warranty_admin_update ON public.warranty_claims;
CREATE POLICY warranty_admin_update ON public.warranty_claims FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.warranty_claims TO authenticated;

DROP POLICY IF EXISTS reviews_read_public_approved ON public.reviews;
CREATE POLICY reviews_read_public_approved ON public.reviews FOR SELECT TO anon, authenticated USING (is_approved = true OR user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS reviews_insert_verified_buyer ON public.reviews;
CREATE POLICY reviews_insert_verified_buyer ON public.reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid() AND o.status = 'completed'));
DROP POLICY IF EXISTS reviews_admin_manage ON public.reviews;
CREATE POLICY reviews_admin_manage ON public.reviews FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE ON public.reviews TO anon, authenticated;

DROP POLICY IF EXISTS notifications_owner_read ON public.notifications;
CREATE POLICY notifications_owner_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
CREATE POLICY notifications_owner_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS faqs_public_read ON public.faqs;
CREATE POLICY faqs_public_read ON public.faqs FOR SELECT TO anon, authenticated USING (is_published = true OR public.is_admin());
DROP POLICY IF EXISTS faqs_admin_manage ON public.faqs;
CREATE POLICY faqs_admin_manage ON public.faqs FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faqs TO authenticated;

DROP POLICY IF EXISTS store_settings_public_read ON public.store_settings;
CREATE POLICY store_settings_public_read ON public.store_settings FOR SELECT TO anon, authenticated USING (is_public = true OR public.is_admin());
DROP POLICY IF EXISTS store_settings_admin_manage ON public.store_settings;
CREATE POLICY store_settings_admin_manage ON public.store_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;

DROP POLICY IF EXISTS audit_admin_read ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.audit_logs TO authenticated;

-- No direct browser access to rate-limit records; Edge Functions use service_role.
REVOKE ALL ON public.auth_login_attempts FROM anon, authenticated;
REVOKE ALL ON public.payments FROM anon, authenticated;
REVOKE ALL ON public.wallet_accounts FROM anon, authenticated;
REVOKE ALL ON public.wallet_transactions FROM anon, authenticated;

-- Safe public store defaults (no secret keys in this table).
INSERT INTO public.store_settings(setting_key,setting_value,is_public) VALUES
('store_status','{"status":"open","message":"Toko aktif. Konfirmasi stok melalui WhatsApp."}'::jsonb,true),
('support_whatsapp','{"number":"6285725423328"}'::jsonb,true),
('minimum_topup','{"amount":10000}'::jsonb,true)
ON CONFLICT (setting_key) DO NOTHING;

-- Seed a small starter FAQ set; admin may edit these after installation.
INSERT INTO public.faqs(category,question,answer,sort_order,is_published) VALUES
('Akun','Bagaimana cara login?','Login menggunakan username dan password. Email hanya diperlukan saat pendaftaran untuk verifikasi dan pemulihan password.',1,true),
('Akun','Bagaimana jika lupa password?','Masukkan username pada menu Lupa Password. Jika username terdaftar, tautan pemulihan akan dikirim ke email akun.',2,true),
('Pesanan','Di mana melihat riwayat pesanan?','Masuk ke akun pelanggan untuk melihat pesanan yang tersimpan online. Checkout tamu hanya tersimpan di perangkat yang digunakan.',3,true),
('Pembayaran','Apakah QRIS otomatis tersedia?','QRIS otomatis hanya tersedia setelah pemilik toko menghubungkan payment gateway dan mengaktifkan webhook.',4,true),
('Bantuan','Bagaimana menghubungi admin?','Gunakan tombol WhatsApp di website. Pesan dapat menyertakan nomor pesanan agar admin lebih mudah membantu.',5,true)
ON CONFLICT (category,question) DO NOTHING;

-- -----------------------------------------------------------------------------
-- SETUP ADMIN PERTAMA
-- Setelah pemilik mendaftar lewat website dan memverifikasi email, jalankan:
-- update public.profiles set role = 'admin' where username = lower('USERNAME_ANDA');
-- Jangan pernah memberi pelanggan biasa hak admin.
-- -----------------------------------------------------------------------------

-- Ensure trusted Edge Functions using the service_role key can write backend records.
-- The service_role key must remain server-side as a Supabase Function secret only.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
