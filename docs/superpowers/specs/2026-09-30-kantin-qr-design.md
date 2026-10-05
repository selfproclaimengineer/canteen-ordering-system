# Desain Tambahan: Order lewat QR dari HP Siswa

Tanggal: 2026-09-30
Status: draft, menunggu review
Dasar: `2026-09-29-kantin-order-design.md` (spec utama). Dokumen ini hanya mencatat tambahan dan perubahan.

## 1. Tujuan

Siswa bisa memesan dari HP sendiri dengan memindai QR yang ditempel di meja. Mereka juga bisa melihat status pesanannya sendiri ("Siap, ambil!"), sehingga staf tidak perlu memanggil nomor.

Tetap tanpa biaya: server tetap laptop atau HP kantin, dan akses dari internet memakai Tailscale Funnel (gratis).

## 2. Keputusan

| Hal | Keputusan |
|-----|-----------|
| Jalur akses siswa | Tailscale Funnel memberi alamat HTTPS publik. Hanya server yang perlu Tailscale; HP siswa cukup memakai browser biasa. |
| Jaringan siswa | Order QR hanya diterima dari IP publik WiFi sekolah. Jalur kuota tidak dibuat sekarang. |
| iPhone | Tidak didukung, karena tidak bisa masuk WiFi sekolah. Siswa pengguna iPhone memesan di meja depan atau menitip ke teman. |
| QR | Statis, ditempel di meja. Berisi alamat publik dan kode rahasia. |
| Varian | Satu kode. Fitur QR mati kalau alamat publik belum diisi. Varian HP-only tanpa QR tidak berubah. |
| HP Order meja depan | Tidak kena batasan QR. Bisa memesan terus. |

Hasil percobaan (2026-09-30):

- Setiap request lewat Funnel membawa header `Tailscale-Funnel-Request: ?1`.
- IP asli pengunjung ada di `X-Forwarded-For`.
- HP tanpa Tailscale bisa membuka alamat Funnel lewat kuota.
- Bot dan pemindai dari berbagai negara datang dalam hitungan menit. Salah satunya mencoba membuka `/.git/HEAD`.
- Belum terbukti: HP Android yang tersambung ke WiFi sekolah bisa membuka Funnel. Hal ini wajib diuji sebelum fitur dipakai di kantin.

## 3. Pagar internet

Sebuah request dianggap **publik** jika membawa header `Tailscale-Funnel-Request`. Request dari hotspot lokal tidak membawa header itu. Request internet tidak bisa melepas header ini, karena Funnel yang menambahkannya.

Request publik hanya boleh mengakses daftar berikut. Semua yang lain dijawab `404`.

```
GET  /pesan/*                       halaman SPA order QR
GET  /assets/*, /manifest.webmanifest
GET  /api/menu
GET  /api/qr/:kode/info             status buka/tutup, apakah jaringan diizinkan
POST /api/qr/:kode/orders
GET  /api/qr/:kode/orders/:id       status order milik sendiri (butuh client_uuid)
POST /api/qr/:kode/orders/:id/cancel
GET  /api/qr/ip-saya                IP publik si pengirim (untuk mendeteksi IP sekolah)
```

Akibatnya, semua fitur berikut hanya bisa dipakai dari hotspot lokal: order kasir, Dapur, Edit, Laporan, login PIN, dan WebSocket `/ws`.

**IP pengirim** diambil dari **entri terakhir** `X-Forwarded-For`, yaitu entri yang ditambahkan oleh proxy. Entri yang dikirim klien tidak dipercaya.

## 4. Pengaman order QR

Semua pengaman di bawah berlaku hanya untuk order dengan `sumber = qr`.

1. **Kode QR**: 22 karakter acak (huruf dan angka, sekitar 131 bit). Dibandingkan secara timing-safe. Kode salah menghasilkan `404`.
2. **Saklar buka/tutup**: pengaturan `qr_buka`. Diubah dari Dapur (PIN Dapur) atau Edit. Saat tutup, server menjawab `403 { error: "QR tutup" }`.
3. **Jaringan sekolah**: untuk request publik, IP pengirim harus ada di daftar `qr_ip`. Jika tidak, server menjawab `403 { error: "Bukan WiFi sekolah" }`. Request dari hotspot lokal lolos, supaya fitur bisa diuji tanpa Funnel.
4. **1 order aktif per HP**: HP siswa menyimpan ID perangkat acak (`QR-` + 8 karakter) di `localStorage`, lalu mengirimnya sebagai `device`. Jika ada order `qr` hari ini dari device itu yang masih berstatus `baru`, server menjawab `409 { error: "Masih ada pesanan aktif" }`.
5. **Batas laju global QR**: maksimal 50 order QR baru per menit untuk seluruh sistem. Jika terlampaui, server menjawab `429`.
   - Batas per IP **tidak dipakai**. Semua siswa di WiFi sekolah keluar lewat IP publik yang sama, sehingga batas per IP akan memblokir siswa yang sah.
   - Ini perubahan dari usulan awal "batas laju per IP".
6. **Label QR**: kartu Dapur menampilkan tanda `QR` untuk order dengan `sumber = qr`.
7. **Ganti kode**: tombol di Edit membuat kode baru. QR lama langsung tidak berlaku, dan QR baru harus dicetak ulang.

Pembayaran tetap di depan, dan dapur tetap bisa membatalkan order kapan saja.

## 5. Model data

- `orders.sumber TEXT NOT NULL DEFAULT 'kasir' CHECK (sumber IN ('kasir','qr'))`.
  - Migrasi otomatis saat `openDb`: jika kolom belum ada, jalankan `ALTER TABLE ... ADD COLUMN`. Data lama menjadi `kasir`.
- Pengaturan baru di tabel `pengaturan`:
  - `qr_alamat`: alamat publik, misalnya `https://kantin.xxx.ts.net`. Kosong berarti fitur QR mati.
  - `qr_kode`: dibuat otomatis saat alamat pertama kali diisi.
  - `qr_buka`: `'0'` atau `'1'`. Default `'0'`.
  - `qr_ip`: JSON array berisi IP yang diizinkan.
- `Order` di `shared/types.ts` mendapat field `sumber`.

## 6. Mendeteksi IP sekolah

Tombol **"Ambil IP sekolah"** di Edit (dibuka dari hotspot lokal):

1. Server memanggil alamat publiknya sendiri: `GET <qr_alamat>/api/qr/ip-saya`.
2. Karena server tersambung ke WiFi sekolah, request itu keluar lewat IP publik sekolah. Request itu masuk kembali lewat Funnel, dan Funnel mencatat IP tersebut.
3. IP hasilnya ditambahkan ke `qr_ip`. Langkah ini sekaligus membuktikan Funnel aktif.
4. Jika gagal (Funnel mati, atau server tidak tersambung internet), tampilkan pesan singkat.

Admin juga bisa menambah atau menghapus IP secara manual, untuk sekolah yang punya lebih dari satu IP keluar.

## 7. Halaman QR `/pesan/:kode` (HP siswa)

- Memakai tiga langkah yang sama dengan mode Order: Menu, Detail, Pesan. Komponen langkah dipindah ke berkas bersama supaya tidak ada duplikasi.
- Tidak ada pojok tersembunyi, tidak ada PIN, dan tidak ada idle reset.
- Saat dibuka, halaman memanggil `info`:
  - Jika QR tutup, tampil "Pemesanan QR sedang tutup".
  - Jika bukan WiFi sekolah, tampil "Sambungkan ke WiFi sekolah".
- Setelah pesan, tampil **layar status**: nomor besar dan status.
  - Status berganti dari "Menunggu" menjadi **"SIAP, ambil!"** (hijau, HP bergetar `navigator.vibrate`), atau menjadi "Batal" (merah).
  - Status diambil ulang setiap 5 detik. Tidak memakai WebSocket.
  - Tombol "Batalkan" tersedia selama 10 detik pertama, lalu tombol "Pesan lagi" setelah status Siap atau Batal.
- Order terakhir (`id`, `client_uuid`, `nomor`) disimpan di `localStorage`, sehingga status tetap tampil setelah halaman di-refresh.

## 8. Perubahan layar staf

- **Dapur**: label `QR` di kartu. Di kepala layar ada tombol **QR: Buka / Tutup** (tanpa PIN tambahan). Tombol ini hanya muncul jika fitur QR aktif.
- **Edit → bagian QR**:
  - Isian alamat publik.
  - Tampilan QR siap cetak (library `qrcode`, dirender di browser).
  - Tombol cetak, tombol "Ganti kode", tombol "Ambil IP sekolah", daftar IP, dan tombol untuk menambah atau menghapus IP.
- **Laporan**: jumlah order Siap per sumber (kasir dan QR). CSV mendapat baris `order_kasir` dan `order_qr`.

## 9. Deploy

**Laptop (utama):**

1. Laptop tersambung ke WiFi sekolah dan menyalakan hotspot untuk HP kantin.
2. Jalankan `npm start`.
3. Jalankan `tailscale funnel --bg 3000`.
4. Di Edit, isi alamat publik dan tekan "Ambil IP sekolah".
5. Cetak QR.

**HP host (eksperimen):** langkahnya sama, tetapi memakai `tailscale-termux-cli` di Termux. HP host harus mendukung WiFi dan hotspot menyala bersamaan. Jika Funnel tidak jalan di HP, varian HP tetap bisa dipakai tanpa QR.

**Tanpa QR:** tidak ada perubahan. Selama `qr_alamat` kosong, semua endpoint `/api/qr/*` menjawab `404`.

## 10. Testing

Integration test Jest:

- **Pagar Funnel**: dengan header, `/api/orders`, `/api/auth/pin`, `/api/admin/*`, `/api/orders?tab=`, dan `/dapur` menghasilkan `404`. Jalur QR, `/api/menu`, dan aset lolos. Tanpa header, semua jalur berperilaku seperti biasa.
- **Order QR**: kode salah menghasilkan `404`. QR tutup menghasilkan `403`. IP di luar daftar (lewat Funnel) menghasilkan `403`. IP diambil dari entri terakhir `X-Forwarded-For`, dan entri palsu di depannya diabaikan. Order dari hotspot lokal lolos tanpa cek IP. Order kedua dari device yang sama saat order pertama masih `baru` menghasilkan `409`, dan lolos lagi setelah order pertama Siap. Order ke-51 dalam satu menit menghasilkan `429`. Order kasir tidak terkena batas-batas ini.
- **Status**: `client_uuid` salah menghasilkan `404`. Jawaban berisi `nomor`, `status`, dan `total`.
- **Ambil IP sekolah**: fungsi `fetch` diganti tiruan. Hasilnya tersimpan tanpa duplikat. Kegagalan fetch menghasilkan pesan error.
- **Migrasi**: database versi lama tanpa kolom `sumber` dibuka dan mendapat kolom itu dengan nilai `kasir`.
- **Laporan**: jumlah per sumber benar.

Uji manual sebelum dipakai: HP Android di WiFi sekolah memindai QR, memesan, lalu melihat status "SIAP" setelah dapur menekan Siap.

## 11. Perubahan 2026-10-01 (setelah uji di sekolah)

- Cek jaringan sekolah **dimatikan secara default**. Uji di sekolah menunjukkan HP sering diam-diam memakai data seluler (Wi-Fi Assist, adaptive Wi-Fi), sehingga IP yang terlihat adalah IP CGNAT operator yang acak, bukan IP sekolah. Cek ini hanya bisa dinyalakan oleh pengembang lewat `KANTIN_QR_HANYA_SEKOLAH=1`, dan alat jaringan di Edit hanya muncul jika cek menyala.
- Order QR **wajib nama** 1–10 karakter (huruf, angka, spasi, titik, tanda hubung). Nama tampil di layar status siswa dan di kartu Dapur. Order meja depan tetap tanpa nama.
- Pembayaran QRIS di depan **tidak** dibuat: gateway berbiaya dan perlu registrasi merchant, sedangkan QRIS statis harus dicocokkan manual saat ramai. Pembayaran tetap saat mengambil.
