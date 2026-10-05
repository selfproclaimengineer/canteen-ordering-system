# Desain Sistem Order Kantin SMA

Tanggal: 2026-09-29
Status: draft, menunggu review

## 1. Latar belakang

Kantin SMA melayani 50–60 pelanggan sekaligus saat istirahat 1 dan 2. Di luar jam itu kantin sepi.

Masalah:

1. Pembeli tidak antre. Order diingat staf, bukan dicatat, sehingga ada order terlewat dan rebutan antrean.
2. Total penjualan tidak tercatat. Keuntungan hanya diperkirakan dari uang masuk dikurangi uang keluar.
3. Loss/fraud mudah terjadi, misalnya siswa tidak membayar.

Tujuan prototipe:

- Setiap order tercatat dan punya nomor antrean.
- Dapur melihat semua order secara realtime dan tidak ada order terlewat.
- Laporan harian (pemasukan, pengeluaran, keuntungan, rincian per menu) tersimpan dan bisa diekspor ke CSV.
- Tanpa biaya server cloud dan tanpa perangkat berbayar tambahan.

Konteks proyek: latihan software engineering. Stack dipilih untuk belajar (TypeScript, Express, React Router v7/Remix, Jest).

## 2. Di luar lingkup (prototipe)

- Order lewat QR dari HP siswa. Butuh access point untuk 50–60 klien (berbayar). Dibahas setelah prototipe.
- Pembayaran di dalam sistem. Pembayaran tunai dan QRIS tetap manual di depan kantin.
- Status "siapa yang memasak" antar-HP dapur. Ditambah jika uji coba menunjukkan masalah.
- Rincian pengeluaran per baris. Pengeluaran berupa satu angka total.
- E2E test otomatis untuk UI.

## 3. Perangkat dan jaringan

- 4 HP Android: 2 HP Order (meja depan), 2 HP Dapur.
- Satu HP Dapur adalah **host**:
  - menyalakan hotspot WPA2 (tanpa kuota internet),
  - menjalankan server Node.js di Termux (install dari F-Droid),
  - menyimpan database SQLite.
- Tiga HP lain membuka web app dari host lewat browser (`http://<ip-host>:3000`). Tidak ada instalasi di HP klien.
- IP hotspot bisa berubah di Android baru. Host menampilkan QR berisi alamatnya untuk setup awal klien.
- HP Order dijalankan sebagai PWA fullscreen dengan Android screen pinning.
- Host harus selalu dicas. Battery optimization untuk Termux dimatikan, `termux-wake-lock` aktif, dan Termux:Boot menjalankan server saat HP menyala.
- Upgrade nanti: server dipindah ke laptop yang join ke hotspot HP. Kode sama, cukup copy folder dan `npm start`.

## 4. Arsitektur

```
SoftengProject/
  shared/   tipe, skema zod, logika bisnis murni
  server/   Express + ws + node:sqlite
  app/      React Router v7, mode SPA (ssr: false)
  docs/
```

- Satu proses Node menyajikan SPA, REST API (`/api/*`), dan WebSocket (`/ws`) di satu port.
- Server adalah satu-satunya sumber kebenaran. Semua perubahan disimpan di SQLite, lalu server mengirim event ke semua klien.
- Klien menerima event pendek dan mengambil data terbaru lewat REST.
- Logika bisnis (hitung harga, aturan waktu, paginasi, laporan, CSV) berada di `shared/` sebagai fungsi murni. Server dan UI memakai fungsi yang sama.
- Tidak ada dependency native. SQLite memakai `node:sqlite` bawaan Node supaya jalan di Termux (ARM) dan laptop tanpa compile.
- SQLite memakai mode WAL.
- Semua uang disimpan sebagai integer rupiah.
- "Hari" ditentukan oleh jam HP host. Semua aturan waktu memakai jam server. Countdown di HP klien hanya tampilan.

## 5. Mode perangkat dan akses

Mode: `Order`, `Dapur`, `Edit`, `Laporan`. Mode tersimpan di `localStorage` HP.

Transisi:

```
Order          --(tahan pojok kiri atas 3 detik + PIN Dapur)--> Dapur
Dapur          --(tanpa PIN)-->                                 Order
Dapur          --(PIN Admin)-->                                 Edit / Laporan
Edit / Laporan --(tanpa PIN)-->                                 Order / Dapur
Edit          <-->                                              Laporan
```

- Dua PIN terpisah, masing-masing 6 digit:
  - **PIN Dapur** untuk staf.
  - **PIN Admin** untuk pemilik. PIN Admin bisa mengganti kedua PIN dari mode Edit.
- PIN diketik lewat keypad tombol di layar.
- PIN disimpan sebagai hash `crypto.scrypt` dengan salt.
- PIN awal diminta saat server pertama kali dijalankan. Jika PIN Admin lupa, reset dengan `npm run reset-pin` di host (butuh akses fisik).
- Login PIN menghasilkan token acak (`crypto.randomBytes`), disimpan di memori server, berlaku 12 jam, dan dikirim lewat header `Authorization`. Token Admin juga berlaku untuk endpoint Dapur.
- Salah PIN 5 kali:
  - input dikunci 1 menit (hitungan dan kunci disimpan di memori server, bukan di HP),
  - HP tempat PIN diketik membunyikan beeper (Web Audio API oscillator),
  - semua HP Dapur menampilkan peringatan, misalnya "PIN salah di HP Order 1".

## 6. Model data menu

### 6.1 Menu

- Atribut: nama, harga, tersedia, urutan.
- `tersedia = false` berarti habis atau dinonaktifkan sementara. Pelanggan melihat tombol abu-abu berlabel "Habis" yang tidak bisa ditap.
- Menu yang dibuat ≤ 3 hari lalu diberi label "Baru".
- Hapus = soft delete (`dihapus_at`). Menu yang dihapus tidak terlihat oleh pelanggan, tetapi tetap ada di laporan lama.

### 6.2 Grup opsi

Admin bisa membuat, mengubah, dan menghapus grup opsi, lalu menempelkannya ke menu tertentu.

| Widget      | Pilih        | Contoh                  | UI pelanggan    |
|-------------|--------------|-------------------------|-----------------|
| `stepper`   | tepat 1      | Kepedasan 0–5           | tombol − / +    |
| `option`    | tepat 1      | Ukuran: Kecil / Besar   | deretan tombol  |
| `checklist` | 0 atau lebih | Topping: Telur, Keju    | centang         |

- Setiap grup berisi daftar **pilihan** berurutan. Stepper "Kepedasan 0–5" berisi 6 pilihan berlabel `0`–`5`. Admin menambah atau mengurangi level dengan menambah atau menghapus pilihan.
- Setiap pilihan punya harga tambahan. Admin boleh mengosongkan harga. Nilai kosong disimpan sebagai `0` dan ditampilkan sebagai "Gratis".
- Default `stepper` dan `option` adalah pilihan urutan pertama (paling kiri). Default `checklist` kosong.
- Pelanggan tidak wajib mengubah apa pun. Tombol Pesan tidak pernah terkunci karena pilihan.
- Hapus grup atau pilihan = soft delete.

### 6.3 Qty

- Stepper − / +, default 1, minimum 1, maksimum `qty_max` (default 10, diatur admin). Berlaku untuk order QR saja.
- Aturan 2026-10-01: HP order meja depan hanya menerima 1 porsi per order (1 item, qty 1). Stepper jumlah dan tombol "+ Menu" disembunyikan; memilih menu lain mengganti item. Server menolak order meja depan lain dengan 400 "Meja depan hanya 1 porsi per order". Order QR tetap boleh banyak (menitip teman).

### 6.4 Harga

- Harga satu item = `(harga menu + Σ harga pilihan) × qty`.
- Harga tampil dan diperbarui langsung saat pelanggan mengubah pilihan.
- Server selalu menghitung ulang harga. Harga dari klien tidak dipercaya.
- Nama, label, dan harga disalin (snapshot) ke order saat order dibuat. Perubahan menu tidak mengubah order atau laporan lama.

## 7. Mode Order (HP depan)

Tidak ada input teks. Semua interaksi lewat tombol. Tidak pernah scroll.

### 7.1 Tiga langkah

1. **Tab 1 – Menu:** grid tombol menu (nama, harga, label Baru/Habis).
2. **Tab 2 – Detail:** qty, grup `stepper`, grup `option`, dan pilihan `checklist` yang gratis.
3. **Tab 3 – Selesai:**
   - pilihan `checklist` yang berbayar,
   - waktu ambil: `Sekarang` / `Istirahat 1` / `Istirahat 2`,
   - ringkasan keranjang dengan total, ✕ per item, dan tombol kecil "Kosongkan" (dengan konfirmasi),
   - tombol **Pesan** (besar), **Batalkan** (membuang item yang sedang diedit), **Tambah Menu** (kecil; menyimpan item ke keranjang lalu kembali ke Tab 1).

### 7.2 Paginasi adaptif

- Jumlah item per halaman dihitung dari tinggi layar (`ResizeObserver`).
- Jika item tidak muat, muncul tombol ◀ ▶. Tombol hanya tampil jika ada halaman lain.
- Berlaku untuk grid menu (Tab 1) dan daftar topping (Tab 2 dan 3).
- Urutan topping: gratis dulu, lalu berbayar. Di dalam tiap kelompok, ikut urutan admin.

### 7.3 Waktu ambil

- Berlaku untuk seluruh order, bukan per item.
- Admin mengatur jam istirahat 1 dan 2.
- Tombol istirahat yang sudah lewat tampil abu-abu dan tidak bisa dipilih.
- Order dengan pilihan istirahat yang sedang berlangsung langsung dianggap `Sekarang`.

### 7.4 Setelah Pesan

- Layar menampilkan nomor antrean besar dengan latar hijau cerah.
- Hitung mundur 10 detik dengan tombol "Batalkan Pesanan". Hitungan mulai setelah server menerima order.
- Setelah 10 detik, layar kembali ke Tab 1 untuk pembeli berikutnya.
- Pelanggan tidak bisa membatalkan setelah 10 detik. Server menolak dengan jam server.

### 7.5 Timeout idle

- Jika tidak ada sentuhan selama 60 detik, keranjang dikosongkan dan layar kembali ke Tab 1.
- Timeout tidak berlaku selama order sedang menunggu dikirim.

### 7.6 Koneksi terputus

- Indikator kecil `● Terputus` di kiri atas. Tidak ada overlay yang menutupi layar.
- Pelanggan tetap bisa memilih menu dan mengisi keranjang dari data menu terakhir.
- Tap Pesan saat terputus menampilkan "Menunggu koneksi…". Saat tersambung, order dikirim otomatis dengan `client_uuid` yang sama.
- Jika ada item yang sudah habis, server menolak dengan `409`. Layar menampilkan nama item yang habis, item itu dibuang dari keranjang, dan sisanya tetap ada.

### 7.7 Baris "Siap diambil"

- Bagian atas layar Order menampilkan nomor yang berstatus Siap, misalnya `Siap diambil: 12 · 15 · 18`.
- Nomor hilang otomatis 5 menit setelah Siap.

## 8. Mode Dapur

Tab:

```
[ Sekarang (n) ] [ Istirahat 1 (n) ] [ Istirahat 2 (n) ] [ Selesai ]
```

- Angka di tab = jumlah order yang menunggu.
- Order Istirahat 1/2 ditahan di tab masing-masing. Order pindah otomatis ke tab Sekarang 10 menit sebelum jam istirahat.
- Urutan kartu di tiap tab: order terlama di atas.
- Kartu order: nomor antrean besar, item + qty + pilihan, total, umur order ("3 mnt").
- Tombol per kartu: **Siap** dan **Batal** (dengan konfirmasi). Batal per item juga tersedia.
- Order baru: bunyi beep singkat dan kartu disorot.
- Siap tidak sengaja: tombol "Urungkan" selama 30 detik, lalu order kembali ke `baru`.
- Tab **Selesai**: riwayat order hari ini yang Siap atau Batal, terbaru di atas, dengan paginasi ◀ ▶. Dipakai untuk konfirmasi ke siswa. Dapur tetap bisa membatalkan dari tab ini.
- Kedua HP Dapur melihat antrean yang sama. Tidak ada pembagian tugas di sistem.

## 9. Status order

```
baru --(Dapur: Siap)--> siap
siap --(Dapur: Urungkan, ≤ 30 detik)--> baru
baru | siap --(Dapur: Batal, kapan saja)--> batal
baru --(Pelanggan: Batal, ≤ 10 detik)--> batal
```

- Batal per item mengisi `order_item.batal_at`. Jika semua item batal, order otomatis `batal`.
- Pemasukan = Σ harga item yang tidak batal dari order berstatus `siap`.
- Status dihitung dari keadaan terakhir. Batal setelah Siap otomatis mengurangi pemasukan hari itu.
- Pembayaran tidak dicatat di sistem.

## 10. Mode Edit (Admin)

- Menu: tambah, ubah nama/harga, atur urutan, tandai tersedia/habis, hapus (satu atau banyak).
- Grup opsi: tambah, ubah, hapus. Atur widget (`stepper`/`option`/`checklist`), pilihan, harga, dan urutan.
- Tempel atau lepas grup dari menu.
- Pengaturan: jam istirahat 1 dan 2, `qty_max`, ganti PIN Dapur dan PIN Admin.
- Input teks dan angka diizinkan di mode ini. Aturan "hanya tombol" berlaku di mode Order.

## 11. Mode Laporan (Admin)

Laporan per hari:

- Rincian per menu: nama, jumlah terjual, harga jual, total. Jika harga berubah di tengah hari, setiap harga tampil sebagai baris terpisah.
- Rincian topping berbayar dengan format yang sama.
- Pemasukan.
- Batal: jumlah dan nilai (informasi loss).
- Pengeluaran: satu angka total, diisi admin.
- Keuntungan = Pemasukan − Pengeluaran.

Perilaku:

- Laporan hari berjalan dihitung langsung dari data order.
- Tombol Simpan membekukan hasil ke tabel `laporan` bersama angka pengeluaran. Admin bisa membuka dan menyimpan ulang.
- Riwayat laporan per tanggal.
- Ekspor CSV per hari atau rentang tanggal. Pemisah `;` dan BOM UTF-8 supaya rapi di Excel berbahasa Indonesia.

## 12. Skema database (SQLite)

```
menu        id, nama, harga, tersedia, urutan, dibuat_at, dihapus_at
grup        id, nama, widget, urutan, dihapus_at
pilihan     id, grup_id, label, harga (default 0), urutan, dihapus_at
menu_grup   menu_id, grup_id, urutan

"order"     id, client_uuid UNIQUE, tanggal ('YYYY-MM-DD'), nomor,
            waktu_ambil (sekarang|ist1|ist2), status (baru|siap|batal),
            device, dibuat_at, siap_at, batal_at, batal_oleh
            UNIQUE (tanggal, nomor)
order_item  id, order_id, menu_id, nama, harga, qty, batal_at
order_item_pilihan
            item_id, pilihan_id, grup, label, harga

pengaturan  key, value
laporan     tanggal PK, pengeluaran, isi_json, disimpan_at
```

- Nomor antrean = `MAX(nomor) + 1` untuk tanggal hari ini, dihitung di dalam satu transaksi. Mulai dari 1 setiap hari.
- `client_uuid` dibuat oleh HP Order (`crypto.randomUUID()`). Request dengan `client_uuid` yang sama mengembalikan order yang sudah ada.
- Backup: file database disalin otomatis sekali sehari. Tujuh salinan terakhir disimpan.

## 13. API

Semua body divalidasi dengan skema `zod` dari `shared/`.

```
GET  /api/menu                              publik
POST /api/orders                            publik  {client_uuid, waktu_ambil, items[]}
POST /api/orders/:id/cancel                 publik, ditolak jika > 10 detik
GET  /api/orders?tab=sekarang|ist1|ist2|selesai     [Dapur]
POST /api/orders/:id/siap                   [Dapur]
POST /api/orders/:id/undo-siap              [Dapur], ditolak jika > 30 detik
POST /api/orders/:id/batal                  [Dapur]
POST /api/items/:id/batal                   [Dapur]
GET  /api/siap                              publik, nomor Siap ≤ 5 menit
POST /api/auth/pin                          {peran, pin} -> token
CRUD /api/admin/menu | grup | pilihan       [Admin]
PUT  /api/admin/pengaturan                  [Admin]
GET  /api/admin/laporan/:tanggal            [Admin]
PUT  /api/admin/laporan/:tanggal            [Admin] {pengeluaran}
GET  /api/admin/laporan.csv?dari=&sampai=   [Admin]
```

WebSocket `/ws` mengirim event: `orders-changed`, `menu-changed`, `siap-changed`, `pin-alert`.

Error:

| Kode  | Kasus                                            |
|-------|--------------------------------------------------|
| `400` | Validasi gagal. Pesan singkat berbahasa Indonesia. |
| `401` | Token tidak ada, salah, atau PIN salah.          |
| `409` | Menu habis atau dihapus. Body berisi daftar item. |
| `409` | Batas waktu batal/undo sudah lewat.              |
| `429` | PIN terkunci. Body berisi sisa detik.            |

Server crash: dijalankan ulang oleh skrip loop (`until node server; do sleep 1; done`) yang dipanggil Termux:Boot.

## 14. Panduan UI

- Warna utama: oranye kemerahan (usulan `#E4572E`).
- Konfirmasi order terkirim dan status Siap: hijau cerah mencolok (usulan `#22C55E`).
- Batal: merah pekat (usulan `#B91C1C`).
- Warna tidak boleh jadi satu-satunya penanda. Setiap status juga punya teks ("Siap", "Batal").
- Kontras teks memenuhi WCAG AA. Teks di atas oranye dan hijau memakai warna yang lolos cek kontras.
- Font: sans-serif sistem (`system-ui, Roboto, "Segoe UI", sans-serif`). Tidak memakai web font karena jaringan tidak punya internet.
- Target sentuh minimal 48 × 48 px.
- Animasi halus, durasi maksimal 100 ms per transisi. Hormati `prefers-reduced-motion`.
- Teks sesingkat mungkin. Contoh: "Pesan", "Siap", "Batal", "Habis", "Terputus".

## 15. Testing

Unit test Jest di `shared/`:

- `hitungTotal`: harga menu + pilihan × qty, harga kosong = 0, item batal tidak dihitung.
- `paginate` dan urutan topping (gratis dulu, lalu berbayar).
- Aturan waktu: batal pelanggan ≤ 10 detik, undo Siap ≤ 30 detik, `tabUntuk(order, sekarang, jamIstirahat)`, tombol istirahat yang sudah lewat.
- `susunLaporan`: baris terpisah per harga, topping berbayar, batal per item, keuntungan.
- `toCsv`: pemisah `;`, BOM, escape tanda kutip.

Integration test Jest di `server/` (Express + `supertest` + SQLite `:memory:`):

- `client_uuid` sama dikirim 2 kali menghasilkan 1 order.
- 20 order paralel menghasilkan nomor 1–20 tanpa dobel.
- Menu habis menghasilkan `409`.
- Endpoint tanpa token menghasilkan `401`. PIN salah 5 kali menghasilkan `429`.
- Batal pelanggan setelah 10 detik ditolak (jam di-mock).

Uji manual di 4 HP asli (checklist di `docs/`):

- Hotspot dan setup alamat host.
- Dua HP Order menekan Pesan bersamaan.
- Putus-sambung WiFi saat mengisi keranjang dan saat Pesan.
- Host restart di tengah istirahat.
- PIN salah 5 kali.

Uji beban: skrip Node mengirim 60 order dalam 2 menit ke HP host. Target: tidak ada error, respons < 500 ms.

## 16. Risiko

| Risiko | Mitigasi |
|--------|----------|
| Android mematikan proses Termux | Wake-lock, battery optimization mati, Termux:Boot, skrip restart, indikator Terputus di semua klien. |
| Jest + TypeScript ESM + `node:sqlite` tidak kompatibel | Task pertama di rencana implementasi adalah spike untuk membuktikan kombinasi ini. Fallback: environment Jest custom, atau akses database lewat adapter tipis. |
| HP host panas atau baterai menggembung | Host di tempat sejuk. Upgrade ke laptop jika prototipe disetujui. |
| IP hotspot berubah | Host menampilkan QR alamat untuk setup ulang klien. |
| Siswa keluar dari app di HP Order | PWA fullscreen dan Android screen pinning. |
| Data hilang | SQLite WAL, backup harian 7 salinan, ekspor CSV. |

## Tambahan 2026-10-05

- Dapur bisa mencentang item satu per satu pada order yang berisi lebih dari 1 item aktif (`POST /api/items/:id/centang {siap}`). Begitu semua item aktif tercentang, order otomatis siap. Membatalkan item terakhir yang belum dicentang juga membuat order siap. Centang hanya terlihat di Dapur; status QR pelanggan tidak berubah.
- Suara notifikasi diatur Admin di Edit > Atur: "Pesanan masuk" (HP dapur) dan "Pesanan jadi" (HP QR). Admin bisa upload file audio (maks 1 MB, disimpan di tabel `suara`), mencoba, atau kembali ke bunyi bawaan. HP memuat ulang daftar suara saat ada event `menu-changed`.
- Order QR boleh membawa catatan opsional, maks 60 huruf, yang tampil di kartu Dapur. Catatan dari HP meja depan diabaikan.
- Teks panjang di tombol opsi, stepper, dan checklist pindah baris di antara kata dengan huruf sedikit lebih kecil; tinggi baris Detail tetap 56 px.
- Harga opsi boleh minus sebagai potongan, misalnya grup "Porsi": Biasa 0, Jumbo +5000, ½ porsi −2000. Harga satu item (menu + opsi) tidak boleh di bawah 0; order seperti itu ditolak 400. Potongan muncul di tabel "Topping berbayar & potongan" di Laporan supaya jumlah baris sama dengan pemasukan. Database lama dimigrasi dengan membangun ulang tabel `pilihan` (id tetap).
