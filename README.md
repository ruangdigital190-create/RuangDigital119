# RUANGDIGITAL190 — Online Store + Admin Dashboard

Project ini adalah pengembangan dari website RUANGDIGITAL190. Katalog dan identitas visual dari versi sebelumnya dipertahankan, kemudian ditambahkan fondasi akun online, database produk, penyimpanan pesanan, dashboard admin, pusat bantuan, pengajuan refund/garansi, dan integrasi QRIS opsional.

## Isi project

```text
RUANGDIGITAL190-ONLINE/
├── index.html                         # Website pelanggan; logo utama & logo produk tertanam
├── admin.html                         # Dashboard administrator terpisah
├── README.md
├── .nojekyll
├── .gitignore
├── assets/brand/ruangdigital-logo.jpg  # Logo untuk halaman admin
└── backend/
    ├── config.json                      # URL Supabase + anon key (wajib diisi)
    ├── js/
    │   ├── supabase-client.js          # Koneksi Supabase + remember me
    │   ├── auth.js                     # Daftar, login username, reset password, logout
    │   ├── product-guides.js           # Penjelasan produk per katalog RUANGDIGITAL190
    │   ├── store-sync.js               # Sinkron katalog, pesanan, tiket, QRIS
    │   └── admin.js                    # Logika dashboard admin
    └── supabase/
        ├── config.toml
        ├── sql/
        │   ├── schema.sql              # Tabel, fungsi, trigger, RLS, kebijakan keamanan
        │   └── seed-products.sql       # 12 produk dan 71 varian asli
        └── functions/
            ├── username-login/         # Login menggunakan username + password
            ├── username-password-reset/ # Reset password berdasarkan username
            ├── create-qris-payment/    # Membuat QRIS Midtrans dinamis
            └── midtrans-webhook/       # Verifikasi status pembayaran Midtrans
```

## Fitur yang disiapkan

### Website pelanggan
- Login hanya menggunakan username dan password.
- Pendaftaran dengan username, nama, email pemulihan, password, dan WhatsApp opsional.
- Remember me: sesi dapat disimpan di perangkat atau hanya selama sesi browser.
- Lupa password: pelanggan memasukkan username; sistem mengirim tautan pemulihan ke email terdaftar.
- Detail produk dengan bagian **Apa yang kamu dapat?**, **Cara penggunaan**, **Yang perlu disiapkan**, dan **Catatan paket**.
- Sinkronisasi produk dan varian dari Supabase jika backend aktif.
- Pesanan pelanggan yang login disimpan di database melalui RPC `create_store_order`.
- Riwayat pesanan online; pesanan tamu tetap dapat dikirim melalui WhatsApp dan tersimpan lokal.
- QRIS dinamis tersedia setelah Midtrans dikonfigurasi dan order memenuhi syarat.
- Form refund dan garansi dapat disimpan ke database untuk order milik akun yang sedang login.
- Tombol WhatsApp tetap tersedia untuk pertanyaan produk, stok, aktivasi, pembayaran, dan bantuan.

### Dashboard admin (`/admin.html`)
- Login username + password.
- Hak akses diperiksa melalui `profiles.role`; pelanggan biasa tidak dapat masuk.
- Total jumlah pengguna terdaftar dari tabel `profiles` dengan exact count.
- Daftar username, nama, email pemulihan, WhatsApp, role, dan waktu pendaftaran.
- Daftar pesanan, konfirmasi harga final untuk pesanan yang masih perlu penawaran, dan perubahan status pemenuhan pesanan.
- Manajemen deskripsi produk, status aktif, harga varian, harga normal, diskon, stok, dan catatan varian.
- Daftar pengajuan refund dan garansi serta pembaruan status.
- Audit log perubahan data produk dan status pesanan.
- Ekspor daftar pengguna ke CSV.

## Penting: akun pelanggan login tanpa email, tetapi pendaftaran tetap meminta email

Pelanggan **tidak perlu mengetik email saat login**. Username dan password sudah cukup. Email diminta saat pendaftaran hanya untuk verifikasi dan pemulihan password. Ketika lupa password, pelanggan cukup memasukkan username; Edge Function mencari email yang tersimpan di database dan mengirim tautan reset tanpa mengungkap alamat email kepada publik.

Aktifkan Email provider pada Supabase Auth. Untuk penggunaan publik, disarankan mengaktifkan verifikasi email dan mengatur SMTP khusus agar email verifikasi/reset dapat terkirim secara konsisten.

## LANGKAH WAJIB SEBELUM WEBSITE ONLINE

> File project sudah disiapkan, tetapi belum dapat terhubung ke database milik Anda sebelum URL dan key Supabase dimasukkan. Saya tidak membuat database cloud atas nama Anda dan tidak mengarang kredensial. Setelah konfigurasi berikut dilakukan, website dan dashboard akan menggunakan database yang sama.

### 1. Buat project Supabase

1. Buka https://supabase.com dan buat project baru.
2. Simpan database password di tempat aman.
3. Buka **Project Settings → API**.
4. Salin **Project URL** dan **anon/public key**. Jangan salin `service_role` ke website.

### 2. Jalankan database SQL

Di Supabase, buka **SQL Editor → New query**.

1. Buka `backend/sql/schema.sql`, salin seluruh isinya, lalu jalankan.
2. Buka `backend/sql/seed-products.sql`, salin seluruh isinya, lalu jalankan.
3. Jalankan query verifikasi di akhir seed. Hasil awal yang diharapkan: **12 produk dan 71 varian**.

Schema membuat tabel profil, produk, varian, pesanan, item pesanan, pembayaran, wallet, transaksi wallet, refund, garansi, ulasan, notifikasi, FAQ, pengaturan toko, audit log, dan rate-limit login. Row Level Security (RLS) diaktifkan agar pelanggan hanya dapat membaca data miliknya.

### 3. Isi konfigurasi website

Buka `backend/config.json` menggunakan Notepad, lalu ubah:

```json
{
  "supabaseUrl": "https://YOUR-PROJECT-REF.supabase.co",
  "supabaseAnonKey": "YOUR_SUPABASE_ANON_PUBLIC_KEY",
  "siteUrl": "https://ruangdigital190-create.github.io/RuangDigital19",
  "whatsappNumber": "6285725423328",
  "storeName": "RUANGDIGITAL190"
}
```

Ganti `supabaseUrl` dan `supabaseAnonKey` dengan nilai project Anda. Nomor WhatsApp sudah mengikuti nomor yang ada pada kode toko sebelumnya; ubah hanya jika nomor admin memang berubah.

`anon/public key` memang digunakan di frontend, tetapi keamanan database bergantung pada RLS. **Jangan pernah memasukkan `service_role key`, Midtrans Server Key, atau password database ke `config.json`, HTML, JavaScript publik, atau repository GitHub. File `config.json` adalah data teks dan tidak perlu dijalankan.**

### 4. Atur Supabase Auth

Di **Authentication → URL Configuration**:

- Site URL: `https://ruangdigital190-create.github.io/RuangDigital19`
- Redirect URL: `https://ruangdigital190-create.github.io/RuangDigital19/index.html`
- Tambahkan URL localhost untuk pengujian jika diperlukan.

Di **Authentication → Providers**, aktifkan Email. Atur kebijakan password minimal 8 karakter. Untuk publik, aktifkan email confirmation dan konfigurasi SMTP sendiri pada **Authentication → SMTP Settings**.

Pastikan template email reset mengarah ke redirect URL website. Pelanggan perlu membuka tautan reset dari email, kemudian memasukkan password baru pada modal akun.

### 5. Deploy Supabase Edge Functions

Install Supabase CLI, lalu buka terminal di folder `backend/supabase`:

```bash
npx supabase login
npx supabase link --project-ref PROJECT_REF_ANDA
```

Isi `project_id` pada `backend/supabase/config.toml` dengan project ref Anda. Lalu simpan secret di Supabase, bukan di repository:

```bash
npx supabase secrets set \
  SUPABASE_URL="https://PROJECT_REF_ANDA.supabase.co" \
  SUPABASE_ANON_KEY="ANON_PUBLIC_KEY_ANDA" \
  SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY_ANDA" \
  SITE_URL="https://ruangdigital190-create.github.io/RuangDigital19" \
  SITE_ORIGIN="https://ruangdigital190-create.github.io"
```

Deploy fungsi:

```bash
npx supabase functions deploy username-login --use-api
npx supabase functions deploy username-password-reset --use-api
npx supabase functions deploy create-qris-payment --use-api
npx supabase functions deploy midtrans-webhook --use-api
```

`username-login` dan `username-password-reset` memang disetel sebagai endpoint publik karena pelanggan belum memiliki session saat login/reset. Login dibatasi percobaan berulang melalui tabel `auth_login_attempts`; Supabase Auth juga tetap menerapkan rate limit. Jangan menghapus validasi dan jangan mengubah CORS menjadi wildcard tanpa alasan.

### 6. Buat administrator pertama

1. Buka website pelanggan.
2. Klik ikon akun → Daftar.
3. Buat akun menggunakan username dan email milik Anda.
4. Verifikasi email jika verifikasi diaktifkan.
5. Di Supabase SQL Editor, jalankan perintah berikut dengan username Anda:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE username = lower('USERNAME_ADMIN_ANDA');
```

6. Buka `https://ruangdigital190-create.github.io/RuangDigital19/admin.html`.
7. Login menggunakan username dan password akun tersebut.

Semua akun yang mendaftar otomatis ber-role `customer`. Role admin **tidak dapat dipilih saat registrasi** dan tidak dapat diubah oleh pelanggan melalui frontend. Jangan membagikan akun admin.

### 7. Aktifkan QRIS Midtrans (opsional)

QRIS dinamis belum aktif sampai Anda memiliki akun Midtrans dan kredensial server.

1. Uji lebih dulu dengan akun/sandbox Midtrans.
2. Simpan Server Key sebagai secret Edge Function:

```bash
npx supabase secrets set MIDTRANS_SERVER_KEY="MIDTRANS_SERVER_KEY_ANDA" MIDTRANS_IS_PRODUCTION="false"
```

3. Pada dashboard Midtrans, atur Payment Notification URL ke:

`https://PROJECT_REF_ANDA.supabase.co/functions/v1/midtrans-webhook`

4. Uji pembayaran sandbox sampai webhook mengubah status menjadi `paid`.
5. Baru setelah akun live disetujui dan diuji, ubah `MIDTRANS_IS_PRODUCTION` menjadi `true` dan gunakan Server Key live.

Status pembayaran tidak boleh diubah oleh tombol pelanggan atau JavaScript. Hanya webhook yang tanda tangannya valid yang dapat mengubah status menjadi `paid`. Pesanan dengan harga yang belum ditentukan akan tetap meminta konfirmasi admin dan tidak dapat membuat QRIS sampai harga final tersedia.

### 8. Upload ke GitHub Pages

1. Simpan versi repository lama sebagai backup.
2. Upload **seluruh isi folder** project ini ke root repository `RuangDigital19`, bukan folder pembungkus `RUANGDIGITAL190-ONLINE`.
3. Pastikan `index.html`, `admin.html`, `backend/`, dan `assets/` berada di root repository.
4. Commit ke branch `main`.
5. Buka **Settings → Pages**, pilih deploy from branch `main` dan folder `/ (root)`.
6. Setelah deployment selesai, buka website utama dan `/admin.html`.

## Cara kerja pelanggan

1. Pelanggan membuka katalog dan membaca detail produk.
2. Pelanggan dapat mendaftar/login untuk menyimpan riwayat online. Login cukup username + password.
3. Pelanggan memilih varian, mengisi data game jika membeli top up, dan memasukkan kontak.
4. Jika login dan database aktif, website membuat pesanan online serta nomor invoice dari database.
5. Pesan ringkasan otomatis disiapkan ke WhatsApp admin agar stok, detail paket, dan nominal dapat dikonfirmasi.
6. Jika QRIS Midtrans aktif dan harga sudah final, pelanggan dapat membuat QRIS dari riwayat pesanan.
7. Webhook memverifikasi pembayaran. Setelah berhasil, status pesanan berubah ke diproses dan notifikasi masuk ke akun.
8. Pelanggan dapat mengajukan refund/garansi melalui form. Jika order tercatat pada akun, tiket disimpan ke database dan tetap disiapkan untuk komunikasi WhatsApp.

## Penjelasan produk yang ditambahkan

Detail setiap produk kini memiliki empat bagian:

- **Apa yang kamu dapat?** Ringkasan akses, paket, nominal, atau layanan sesuai katalog.
- **Cara penggunaan** Gambaran langkah setelah aktivasi/pengisian.
- **Yang perlu disiapkan** Email atau ID game yang diperlukan.
- **Catatan paket** Hal yang wajib ditanyakan sebelum membayar.

Penjelasan tidak menjanjikan masa aktif, jumlah perangkat, jenis akun, garansi, atau fitur yang tidak tertulis pada katalog. Untuk produk sharing, invite, seller/buyer, head/owner, atau lifetime, pelanggan tetap perlu meminta ketentuan rinci kepada admin sebelum pembayaran.

## Catatan keamanan & operasional

- Admin dashboard bukan sistem untuk menyimpan password pelanggan; password dikelola Supabase Auth.
- Email dan nomor WhatsApp pelanggan hanya dapat dibaca pemilik akun dan admin sesuai RLS.
- Database ini menyimpan data pelanggan dan transaksi. Tambahkan kebijakan privasi dan syarat layanan toko sebelum mengiklankan website secara luas.
- Lakukan backup database secara berkala.
- Aktifkan MFA untuk akun pemilik Supabase dan batasi akses dashboard Supabase.
- QRIS otomatis bergantung pada akun Midtrans yang disetujui, secret server-side, dan konfigurasi webhook.
- Saldo/wallet sudah memiliki struktur tabel, tetapi top-up saldo dan debit saldo belum diaktifkan sebagai fitur pembayaran pelanggan. Jangan mengiklankan saldo sebagai fitur aktif sebelum RPC deposit/ledger dan gateway khusus selesai diimplementasikan.
- Pengiriman akun digital tetap memerlukan proses pemenuhan/admin; status `paid` tidak otomatis berarti produk sudah dikirim.

## Pemeriksaan sebelum publikasi

- [ ] URL dan anon key Supabase sudah benar.
- [ ] `schema.sql` dan `seed-products.sql` berhasil dijalankan.
- [ ] Query menghasilkan 12 produk dan 71 varian.
- [ ] Email confirmation/reset diuji.
- [ ] Login username/password diuji.
- [ ] Remember me dan logout diuji.
- [ ] Reset password diuji dari email.
- [ ] Akun admin pertama berhasil masuk ke `/admin.html`.
- [ ] Admin melihat total pengguna dan daftar pengguna.
- [ ] Pelanggan biasa tidak bisa membuka data admin.
- [ ] Pesanan online masuk ke database dan hanya terlihat oleh pemilik/admin.
- [ ] Perubahan harga/stok di dashboard terlihat pada katalog publik.
- [ ] WhatsApp mengarah ke nomor admin yang benar.
- [ ] Jika QRIS diaktifkan, uji sandbox dan webhook terlebih dahulu.
- [ ] Ganti Midtrans ke live hanya setelah seluruh pengujian berhasil.

---

**Status paket saat diserahkan:** source frontend, schema database, seed katalog, Edge Functions, dan dashboard admin telah disiapkan. Koneksi ke project Supabase dan akun Midtrans Anda belum dapat dinyalakan dari sini karena kredensial milik Anda belum tersedia. Setelah langkah konfigurasi di atas dilakukan, barulah fitur online berjalan pada domain publik.
