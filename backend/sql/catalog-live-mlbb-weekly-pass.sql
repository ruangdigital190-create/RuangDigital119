-- RUANGDIGITAL190: live catalog + MLBB Weekly Diamond Pass
-- Jalankan setelah schema.sql, seed-products.sql, dan admin-enhancements.sql.
-- Aman dijalankan ulang: varian pass tidak akan dibuat ganda.

begin;

alter table public.products
  add column if not exists image_url text;

do $$
declare
  v_base_order integer;
begin
  if exists (select 1 from public.products where id = 'mlbb') then
    select coalesce(max(sort_order), 0)
      into v_base_order
      from public.product_variants
      where product_id = 'mlbb';

    with pass_items(ordinal, name, price) as (
      values
        (1, 'Weekly Diamond Pass', 33000::bigint),
        (2, 'Weekly Diamond Pass 2x', 65000::bigint),
        (3, 'Weekly Diamond Pass 3x', 95000::bigint),
        (4, 'Weekly Diamond Pass 4x', 130000::bigint),
        (5, 'Weekly Diamond Pass 5x', 161000::bigint)
    ),
    missing_items as (
      select p.*
      from pass_items p
      where not exists (
        select 1
        from public.product_variants existing
        where existing.product_id = 'mlbb'
          and lower(trim(existing.name)) = lower(trim(p.name))
      )
    )
    insert into public.product_variants
      (product_id, name, price, original_price, discount_enabled,
       stock_status, note, sort_order, is_active)
    select
      'mlbb',
      missing_items.name,
      missing_items.price,
      null,
      false,
      'confirm',
      'Konfirmasi stok sebelum pembayaran.',
      v_base_order + row_number() over (order by missing_items.ordinal)::integer,
      true
    from missing_items;

    -- The supplied MLBB poster lists 790 Diamond at Rp258.000.
    update public.product_variants
       set price = 258000,
           updated_at = now()
     where product_id = 'mlbb'
       and lower(trim(name)) = '790 diamond';

    update public.products
       set tag = '25 Diamond + 5 Weekly Pass',
           short_description = 'Top up MLBB dengan 25 pilihan nominal Diamond dan 5 pilihan Weekly Diamond Pass.',
           description = 'Pilih nominal Diamond Mobile Legends: Bang Bang atau Weekly Diamond Pass 1x–5x. Masukkan User ID dan Zone ID dengan benar saat pemesanan.',
           updated_at = now()
     where id = 'mlbb';
  else
    raise notice 'Produk mlbb belum ada. Jalankan seed-products.sql terlebih dahulu.';
  end if;
end $$;

-- Supabase Realtime requires the catalog tables to be members of supabase_realtime.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_variants'
  ) then
    execute 'alter publication supabase_realtime add table public.product_variants';
  end if;
end $$;

alter table public.products replica identity full;
alter table public.product_variants replica identity full;

commit;

-- Verifikasi hasil:
select
  (select count(*) from public.products where id = 'mlbb') as mlbb_product,
  (select count(*) from public.product_variants where product_id = 'mlbb') as mlbb_total_variants,
  (select count(*) from public.product_variants where product_id = 'mlbb' and name ilike 'Weekly Diamond Pass%') as weekly_pass_variants,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('products','product_variants')) as realtime_tables;
