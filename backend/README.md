# Backend RUANGDIGITAL190

Backend menggunakan Supabase Auth + PostgreSQL + RLS + Edge Functions. Ikuti `../README.md` untuk urutan instalasi.

## Rahasia server-side

Simpan `SUPABASE_SERVICE_ROLE_KEY`, `MIDTRANS_SERVER_KEY`, dan konfigurasi produksi hanya sebagai Supabase Edge Function secrets. Jangan memasukkannya ke `config.json` atau file publik.

## File penting

- `config.json`: Project URL dan anon/public key dalam format JSON; edit dengan Notepad dan jangan jalankan file ini.
- `supabase/sql/schema.sql`: tabel, trigger, function, dan RLS.
- `supabase/sql/seed-products.sql`: katalog awal dari website.
- `supabase/functions/username-login`: username/password login.
- `supabase/functions/username-password-reset`: pemulihan password melalui email terdaftar.
- `supabase/functions/create-qris-payment`: membuat QRIS dinamis Midtrans.
- `supabase/functions/midtrans-webhook`: memvalidasi signature dan status pembayaran.

Jangan aktifkan fitur pembayaran live sebelum menguji sandbox dan webhook.
