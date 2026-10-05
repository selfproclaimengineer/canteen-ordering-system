# Checklist Uji Manual (4 HP)

Centang setiap langkah yang sudah dicoba. Catat HP, waktu, dan hasil untuk setiap langkah yang gagal.

Susunan: HP A adalah host (Dapur 1). HP B adalah Dapur 2. HP C dan D adalah Order 1 dan Order 2.

## Persiapan

- [ ] Hotspot HP A menyala dengan password WPA2. HP B, C, dan D sudah tersambung.
- [ ] Semua HP membuka `http://<IP host>:3000` dan menampilkan mode Order.
- [ ] HP C dan D dikunci dengan Sematkan layar.
- [ ] HP B masuk mode Dapur: tahan pojok kiri atas selama 3 detik, lalu masukkan PIN Dapur.

## Order dasar

- [ ] HP C memesan 1 menu dengan pedas dan topping. Nomor muncul di layar hijau.
- [ ] Order yang sama muncul di HP A dan HP B dengan bunyi beep dan sorotan.
- [ ] HP C membatalkan order dalam 10 detik. Kartunya pindah ke tab Selesai dengan status Batal.
- [ ] HP C memesan lagi dan menunggu lebih dari 10 detik. Tombol batal tidak ada lagi.
- [ ] Dapur menekan Siap. Nomornya muncul di baris "Siap" di HP C dan HP D.
- [ ] Dapur menekan Urungkan dalam 30 detik. Order kembali ke tab Sekarang.
- [ ] Dapur membatalkan 1 item dari order yang berisi 2 item. Item itu dicoret dan totalnya berkurang.

## Keramaian

- [ ] HP C dan HP D menekan Pesan pada waktu yang sama. Nomor antreannya berbeda dan tidak ada yang dobel.
- [ ] Ada 10 order yang masuk berturut-turut. Kedua HP Dapur menampilkan daftar yang sama.

## Jaringan dan server

- [ ] Matikan WiFi di HP C, lalu tekan Pesan. Layar menampilkan "Menunggu koneksi…".
- [ ] Nyalakan WiFi HP C lagi. Order terkirim satu kali saja.
- [ ] Hentikan server di tengah pemakaian (Ctrl+C sekali). Server mulai ulang sendiri, dan semua HP kembali tersambung tanpa di-refresh.
- [ ] Restart HP host. Server berjalan sendiri lewat Termux:Boot.
- [ ] Layar HP host mati selama 10 menit. Server tetap melayani order.

## Keamanan dan admin

- [ ] Masukkan PIN salah 5 kali. Keypad terkunci selama 60 detik, beeper berbunyi, dan HP Dapur menampilkan peringatan.
- [ ] Dari Dapur, buka Edit dengan PIN Admin. Tambah menu, lalu tandai menu itu Habis. Di HP Order, menu itu tampil abu-abu.
- [ ] Ubah harga sebuah menu. Order lama di laporan tetap memakai harga lama.
- [ ] Buka Laporan. Isi pengeluaran, simpan, lalu unduh CSV dan buka di Excel.

## Fitur QR (hanya jika memakai laptop dan WiFi sekolah)

- [ ] Nyalakan Funnel, lalu di Edit → QR isi alamat publik dan cetak QR-nya.
- [ ] Buka QR dari 2–3 HP Android di WiFi sekolah. Di Edit → QR → IP yang ditolak, izinkan IP atau rentangnya.
- [ ] HP siswa memesan, lalu Dapur menekan Siap. HP siswa bergetar dan menampilkan "SIAP, ambil!".
- [ ] HP siswa memesan lagi saat pesanan sebelumnya belum siap. Pesanan kedua ditolak dengan pesan "Masih ada pesanan aktif".
- [ ] Buka QR dengan data seluler. Muncul pesan "Sambungkan HP ke WiFi sekolah".
- [ ] Buka `http://<IP laptop>:3000/dapur` dari HP di WiFi sekolah (bukan hotspot). Hasilnya "Tidak ditemukan".
- [ ] Matikan Funnel setelah uji: `tailscale funnel --https=443 off`.

## Uji beban

- [ ] `npm run uji-beban` dengan 60 order dalam 120 detik ke server uji di HP host. Hasil: LULUS.
- [ ] Ulangi dengan `--detik 0` (60 order sekaligus). Hasil: LULUS.
