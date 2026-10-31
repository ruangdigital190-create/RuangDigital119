(function () {
  "use strict";
  /* Penjelasan ini mengikuti katalog RUANGDIGITAL190. Detail akun, durasi,
     hak akses, dan garansi akhir selalu mengikuti varian yang dipilih dan
     konfirmasi admin; jangan menganggap semua varian memiliki fitur sama. */
  window.RDProductGuides = {
    netflix: {
      includes: ["Akses layanan streaming Netflix sesuai varian 2U1P, 1U1P, atau semiprivat.", "Pilihan film, serial, dan dokumenter pada katalog Netflix.", "Masa aktif, profil/slot, dan cara masuk mengikuti paket yang dikonfirmasi admin."],
      how: "Gunakan petunjuk login dan profil yang diberikan admin. Buka Netflix pada perangkat yang didukung, lalu ikuti ketentuan profil/slot pada paket. Jangan mengubah data akun bersama tanpa izin.",
      prepare: ["Pilih tipe paket dan durasi.", "Pastikan perangkat mendukung Netflix.", "Tanyakan batas perangkat dan aturan penggunaan sebelum membayar."],
      note: "Nama varian menunjukkan jenis akses yang ditawarkan. Jumlah perangkat, profil, detail login, masa aktif, dan garansi harus dipastikan melalui admin sebelum pembayaran."
    },
    spotify: {
      includes: ["Akses musik dan podcast Spotify sesuai paket.", "Fitur Premium seperti pemutaran sesuai permintaan, pengalaman minim iklan, dan unduhan offline jika didukung paket.", "Panduan aktivasi dan masa aktif sesuai konfirmasi admin."],
      how: "Ikuti instruksi aktivasi yang diberikan admin. Periksa akun yang digunakan dan status Premium setelah aktivasi.",
      prepare: ["Tanyakan apakah aktivasi menggunakan akun sendiri atau akun yang disediakan.", "Pastikan email/akun yang akan digunakan benar."],
      note: "Durasi, jenis akun, metode aktivasi, dan ketentuan perpanjangan belum ditentukan pada katalog awal; konfirmasi admin sebelum transaksi."
    },
    youtube: {
      includes: ["Akses YouTube Premium sesuai varian yang tersedia.", "Fitur seperti menonton tanpa iklan, pemutaran latar, dan unduhan offline jika tersedia pada paket/akun.", "Panduan aktivasi dari admin."],
      how: "Aktivasi mengikuti metode paket yang dipilih. Setelah admin menyelesaikan aktivasi, periksa status keanggotaan di akun YouTube.",
      prepare: ["Siapkan akun Google bila aktivasi membutuhkan akun pribadi.", "Pastikan email yang diberikan benar dan dapat diakses."],
      note: "Durasi dan jenis akses belum ditetapkan di katalog awal. Jangan membagikan password Google melalui chat; tanyakan metode aktivasi yang aman kepada admin."
    },
    capcut: {
      includes: ["Paket CapCut Premium sesuai varian (Privat 7 hari atau 1 bulan).", "Akses fitur editing premium seperti efek, template, transisi, dan aset kreatif yang termasuk pada plan.", "Petunjuk aktivasi sesuai metode yang dikonfirmasi admin."],
      how: "Ikuti langkah aktivasi dari admin, kemudian buka CapCut dan periksa status langganan pada akun/perangkat yang digunakan.",
      prepare: ["Pilih durasi paket yang tepat.", "Tanyakan metode aktivasi dan perangkat yang didukung."],
      note: "Katalog memiliki dua varian bernama Privat 7 Hari dan satu varian Privat 1 Bulan. Harga serta ketersediaan mengikuti konfirmasi admin."
    },
    alightmotion: {
      includes: ["Paket Alight Motion Premium 1 tahun sesuai pilihan Email Seller atau Email Buyer.", "Akses alat motion graphic, animasi, efek visual, dan fitur ekspor yang termasuk pada plan.", "Panduan aktivasi sesuai varian."],
      how: "Ikuti instruksi aktivasi berdasarkan jenis email yang dipilih. Periksa status Premium pada aplikasi setelah proses selesai.",
      prepare: ["Pahami perbedaan Email Seller dan Email Buyer.", "Tanyakan email mana yang akan menerima aktivasi dan bagaimana prosesnya."],
      note: "Varian menentukan alur aktivasi. Pastikan kepemilikan email, masa aktif, dan ketentuan penggunaan dipahami sebelum memesan."
    },
    canva: {
      includes: ["Paket Canva Pro Member, Canva Head, atau Lifetime sesuai varian.", "Fitur desain Pro seperti template premium, elemen/aset premium, dan alat bantu desain yang tersedia pada plan.", "Undangan atau petunjuk aktivasi sesuai metode paket."],
      how: "Untuk paket invite, gunakan email penerima undangan yang benar. Ikuti instruksi admin dan periksa status keanggotaan di Canva.",
      prepare: ["Pastikan email yang akan menerima undangan aktif.", "Baca apakah varian berupa Member, Head, atau Lifetime.", "Tanyakan batasan dan kebijakan perpanjangan."],
      note: "Varian Canva memiliki metode dan durasi berbeda. Istilah Lifetime atau Head harus dijelaskan admin secara tertulis sebelum pembayaran."
    },
    chatgpt: {
      includes: ["Akses ChatGPT sesuai paket GO atau Plus Sharing.", "Fitur AI dan alat bantu yang tersedia pada plan; model, kuota, dan fitur dapat berbeda antara GO dan Plus.", "Masa aktif dan instruksi akses mengikuti varian."],
      how: "Gunakan akses sesuai instruksi admin dan ketentuan paket. Jangan mengirimkan password akun pribadi melalui WhatsApp.",
      prepare: ["Pahami perbedaan GO Sharing dan Plus Sharing.", "Tanyakan batas penggunaan, perangkat, dan apakah akun bersifat bersama."],
      note: "Katalog menampilkan paket sharing. Fitur yang tersedia mengikuti paket dan kebijakan layanan yang berlaku; jangan menganggap semua paket memiliki fitur yang sama."
    },
    gemini: {
      includes: ["Paket yang mencantumkan Gemini AI.", "Google Drive 2 TB dan Veo sesuai varian yang dipilih.", "Durasi 18 bulan atau 1 tahun mengikuti nama varian."],
      how: "Ikuti metode invite atau Head/Owner yang dikonfirmasi admin. Periksa akses Gemini, kapasitas Drive, dan ketersediaan Veo pada akun setelah aktivasi.",
      prepare: ["Baca apakah varian Invite atau Head/Owner.", "Siapkan email Google jika diperlukan.", "Tanyakan batas penggunaan dan kebijakan data."],
      note: "Katalog memiliki paket Invite 18 bulan dan Head/Owner 1 tahun. Ketersediaan tiap layanan dan masa aktif harus dikonfirmasi sebelum transaksi."
    },
    grammarly: {
      includes: ["Grammarly Premium sesuai varian Sharing atau Privat.", "Bantuan tata bahasa, ejaan, kejelasan, dan saran penulisan sesuai fitur plan.", "Petunjuk akses dari admin."],
      how: "Aktifkan akses mengikuti instruksi admin. Uji pemeriksaan tata bahasa pada dokumen atau teks setelah akun aktif.",
      prepare: ["Tentukan varian Sharing atau Privat.", "Tanyakan apakah menggunakan akun sendiri atau akses yang disediakan."],
      note: "Tipe akses berbeda. Jangan menganggap paket Sharing setara dengan akun Privat; pastikan batasan akses dan masa aktif sebelum membeli."
    },
    quillbot: {
      includes: ["QuillBot Premium sesuai paket Sharing.", "Alat parafrase, pemeriksaan tata bahasa, dan alat bantu menulis lain sesuai plan.", "Petunjuk akses dari admin."],
      how: "Masuk atau aktifkan akses sesuai panduan admin, kemudian periksa status Premium dan fitur yang tersedia.",
      prepare: ["Tanyakan metode login dan masa aktif.", "Pastikan aturan penggunaan akun bersama dipahami."],
      note: "Katalog awal hanya mencantumkan varian Sharing 1 bulan. Harga dan stok perlu dikonfirmasi admin."
    },
    mlbb: {
      includes: ["Diamond Mobile Legends sesuai nominal yang dipilih.", "Pengisian ke akun game berdasarkan User ID dan Zone ID.", "Konfirmasi pesanan melalui WhatsApp."],
      how: "Masukkan User ID dan Zone ID dengan benar, pilih nominal Diamond, lalu kirim pesanan. Periksa jumlah Diamond setelah pengisian dikonfirmasi selesai.",
      prepare: ["User ID Mobile Legends.", "Zone ID.", "Pastikan nama akun dan ID cocok sebelum pembayaran."],
      note: "Tidak perlu memberikan password akun game. Kesalahan User ID/Zone ID dapat menyebabkan pengisian masuk ke akun yang salah."
    },
    freefire: {
      includes: ["Diamond, Membership Mingguan, BP Card, atau Membership Bulanan sesuai pilihan.", "Pengisian berdasarkan Player ID.", "Konfirmasi pesanan melalui WhatsApp."],
      how: "Masukkan Player ID yang benar, pilih nominal Diamond atau membership, lalu kirim pesanan. Periksa item yang diterima setelah admin mengonfirmasi pengisian.",
      prepare: ["Player ID Free Fire.", "Nickname untuk membantu pengecekan jika diminta.", "Pastikan item dan nominal yang dipilih benar."],
      note: "Tidak perlu memberikan password akun game. Katalog memiliki 20 pilihan Diamond dan 3 pilihan membership/BP Card."
    }
  };
})();
