# Memasang Server di HP Host (Termux)

Panduan ini untuk varian **tanpa laptop**: satu HP Dapur menjadi server sekaligus menyalakan hotspot untuk tiga HP lain.

Build dilakukan di laptop. HP hanya menerima hasil build lalu menjalankannya. Membuild aplikasi di HP butuh waktu lama dan ruang penyimpanan yang besar.

## 1. Siapkan HP host (sekali saja)

1. Pasang **Termux** dan **Termux:Boot** dari **F-Droid**. Jangan pakai versi Play Store, karena versi itu sudah usang.
2. Buka Termux, lalu jalankan:
   ```sh
   pkg update && pkg upgrade -y
   pkg install -y nodejs termux-api
   termux-setup-storage
   node --version
   ```
   `node --version` harus menunjukkan **22.13 atau lebih baru**.
3. Matikan penghematan baterai untuk Termux: Pengaturan → Aplikasi → Termux → Baterai → **Tidak dibatasi**. Di HP Xiaomi, Oppo, dan Vivo, nyalakan juga **Autostart** untuk Termux dan Termux:Boot.
4. Buka Termux:Boot satu kali. Langkah ini mendaftarkan Termux:Boot supaya bisa berjalan saat HP menyala.

## 2. Buat paket di laptop

Di folder project di laptop, jalankan:

```sh
npm run paket
```

Hasilnya file `kantin-paket.tgz`. File ini berisi server hasil build, aplikasi hasil build, `package.json`, dan skrip start.

Salin file itu ke folder **Download** di HP host, lewat kabel USB atau aplikasi berbagi file.

## 3. Pasang di HP host

Di Termux:

```sh
mkdir -p ~/kantin && cd ~/kantin
tar -xzf ~/storage/downloads/kantin-paket.tgz
npm ci --omit=dev
chmod +x scripts/jalan.sh
```

Jalankan server sekali secara manual untuk mengisi PIN:

```sh
./scripts/jalan.sh
```

Masukkan PIN Dapur dan PIN Admin, masing-masing 6 angka. Tunggu sampai muncul `Kantin siap di port 3000`, lalu tekan Ctrl+C.

## 4. Nyalakan otomatis saat HP menyala

```sh
mkdir -p ~/.termux/boot
printf '#!/data/data/com.termux/files/usr/bin/sh\nexec ~/kantin/scripts/jalan.sh\n' > ~/.termux/boot/kantin
chmod +x ~/.termux/boot/kantin
```

Restart HP. Setelah HP menyala, server berjalan sendiri. Jika server berhenti, skrip menjalankannya lagi dalam 2 detik.

## 5. Sambungkan HP lain

1. Nyalakan hotspot di HP host dengan password WPA2.
2. Cari IP HP host di Termux: `ip -4 addr show | grep inet`. Pilih IP dari antarmuka hotspot, misalnya `192.168.43.1`.
3. Sambungkan tiga HP lain ke hotspot, lalu buka `http://<IP host>:3000` di masing-masing HP.
4. Kunci HP Order dengan fitur **Sematkan layar** (screen pinning) Android.

IP hotspot di Android baru bisa berubah setelah restart. Jika HP lain tidak bisa tersambung, cek IP host lagi.

## 6. Cadangan data

- Server menyimpan backup harian otomatis di `~/kantin/data/backup/`.
- Untuk menyalin backup ke folder Download, jalankan `cp ~/kantin/data/backup/* ~/storage/downloads/`.
- Laporan juga bisa diekspor ke CSV dari mode Laporan.

## 7. Memperbarui aplikasi

1. Buat paket baru di laptop (langkah 2).
2. Di HP host, hentikan server: buka sesi Termux yang menjalankan server, tekan Ctrl+C, lalu Ctrl+C lagi untuk menghentikan perulangannya.
3. Ekstrak paket di tempat yang sama, lalu jalankan `npm ci --omit=dev`.
4. Folder `data/` tidak ikut tertimpa. Menu, laporan, dan PIN tetap tersimpan.
5. Jalankan lagi `./scripts/jalan.sh`, atau restart HP.

## 8. Pesan lewat QR dari HP host (eksperimen)

Fitur QR butuh Tailscale Funnel. Aplikasi Tailscale resmi di Android tidak mendukung Funnel. Satu-satunya jalan adalah proyek komunitas **tailscale-termux-cli**, yang belum pernah kita uji.

Syarat:

- HP host harus bisa tersambung ke **WiFi sekolah** dan menyalakan **hotspot** pada waktu yang sama. Tidak semua HP Android mendukung ini.
- Isi `KANTIN_LOKAL` di `scripts/jalan.sh` dengan subnet hotspot HP host (lihat langkah 5). Tanpa pengaturan ini, HP Dapur akan ditolak ketika QR aktif.

Jika Funnel tidak berjalan di HP, pakai laptop sebagai server untuk fitur QR. Varian HP tetap bisa dipakai tanpa QR.

## 9. Uji beban

Jalankan uji beban **hanya ke server uji**, jangan ke server kantin, karena uji beban membuat order sungguhan. Server uji bisa dijalankan di port lain dengan folder data terpisah:

```sh
KANTIN_DATA=uji-data PORT=3999 node dist/server/main.js
```

Isi beberapa menu lewat mode Edit, lalu jalankan dari laptop:

```sh
npm run uji-beban -- --url http://<IP host>:3999 --jumlah 60 --detik 120 --yakin
npm run uji-beban -- --url http://<IP host>:3999 --jumlah 60 --detik 0 --yakin
```

Perintah pertama mengirim 60 order dalam 2 menit. Perintah kedua mengirim 60 order sekaligus, seperti awal jam istirahat. Target lulus: tidak ada error dan p95 di bawah 500 ms.

Setelah selesai, hentikan server uji lalu hapus folder `uji-data`.

## Update otomatis dari GitHub

Setiap `git push` ke `main` membuat rilis baru di GitHub (berisi `kantin-paket.tgz` yang sudah di-build). HP host tidak perlu laptop lagi:

- Setiap kali server mau start, `scripts/jalan.sh` menjalankan `scripts/perbarui.sh`. Script itu mengecek rilis terbaru dan memasangnya kalau lebih baru. Folder `data/` (database dan backup) tidak disentuh.
- Dari HP mana pun: Edit › Atur › **Perbarui sekarang**. Server mati sebentar, memasang update, lalu menyala lagi.
- Kalau versi baru berhenti 3× berturut-turut dalam 30 detik, `jalan.sh` otomatis kembali ke versi sebelumnya dan versi gagal itu tidak dipasang lagi.
- Tanpa internet, server tetap jalan dengan versi yang ada.
- Untuk mematikan update otomatis: `touch ~/kantin/.tanpa-update`.

Pasang pertama kali langsung dari GitHub (ganti langkah 2 dan 3 di atas):

```sh
pkg install -y curl
mkdir -p ~/kantin && cd ~/kantin
curl -fL https://github.com/selfproclaimengineer/canteen-ordering-system/releases/latest/download/kantin-paket.tgz | tar -xz
npm ci --omit=dev
chmod +x scripts/*.sh
./scripts/jalan.sh
```

HP yang sudah terpasang versi lama cukup mengambil script barunya sekali:

```sh
cd ~/kantin
curl -fL https://github.com/selfproclaimengineer/canteen-ordering-system/releases/latest/download/kantin-paket.tgz | tar -xz scripts
chmod +x scripts/*.sh
```

Lalu restart server (Ctrl+C di Termux, jalankan `./scripts/jalan.sh` lagi, atau restart HP).

## QR statis lewat internet (cloudflared + GitHub Pages)

Quick tunnel Cloudflare memberi alamat `xxxx.trycloudflare.com` baru setiap kali menyala. Supaya QR di meja tidak perlu dicetak ulang, QR menunjuk ke halaman tetap di GitHub Pages:

`https://selfproclaimengineer.github.io/canteen-ordering-system/pesan/<kode>`

Halaman itu mencari alamat tunnel terbaru, menunggu sampai server menjawab, lalu meneruskan pelanggan ke halaman pesan. Alamat tunnel disimpan di branch `gh-pages` dalam bentuk terenkripsi dengan kode QR, jadi tidak terbaca dari repo publik.

Setup sekali di HP host:

1. Pasang cloudflared:
   ```sh
   pkg install -y cloudflared
   ```
   Kalau cloudflared selama ini dijalankan sendiri di sesi Termux lain, hentikan. `jalan.sh` sekarang menjalankannya.
2. Buat token GitHub di github.com: Settings › Developer settings › Personal access tokens › **Fine-grained tokens** › Generate new token.
   - Repository access: **Only select repositories** › `canteen-ordering-system`.
   - Permissions › Repository › **Contents: Read and write**. Izin lain biarkan.
   - Salin token (diawali `github_pat_`).
3. Simpan token di HP. Perintah ini tidak menampilkan token di layar dan tidak menyimpannya di riwayat:
   ```sh
   cd ~/kantin
   read -rsp "Tempel token: " T && printf '%s' "$T" > .github-token && chmod 600 .github-token && unset T && echo " tersimpan"
   ```
   Tempel token dengan tekan lama › Paste, lalu Enter.
4. Restart server (Ctrl+C lalu `./scripts/jalan.sh`, atau restart HP). Dalam ±1 menit Termux menulis `QR statis: alamat diumumkan (...)`.
5. Di Edit › QR, isi alamat publik dengan `https://selfproclaimengineer.github.io/canteen-ordering-system`, Simpan, lalu cetak QR-nya. QR ini tetap selama tombol "Ganti kode" tidak ditekan.

Catatan:
- Setelah HP menyala ulang, QR siap lagi dalam ±1–3 menit. Selama itu halaman QR menampilkan "Server kantin sedang dinyalakan" dan mencoba lagi sendiri.
- Token bisa menulis ke repo. Kalau HP hilang, hapus token di GitHub (Settings › Fine-grained tokens › Delete). Token kedaluwarsa sesuai tanggal yang dipilih; buat yang baru dan ulangi langkah 3.
- Untuk mematikan tunnel: `touch ~/kantin/.tanpa-tunnel`.
