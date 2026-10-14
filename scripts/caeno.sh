#!/data/data/com.termux/files/usr/bin/sh
# Home-screen button "Caeno" (Termux:Widget): starts the kantin server, same as cd ~/kantin && ./scripts/jalan.sh.
# Installed into ~/.shortcuts/Caeno by scripts/pasang-tombol.sh.

if pgrep -f "dist/server/main.js" >/dev/null 2>&1; then
  echo "Server kantin SUDAH berjalan di jendela Termux lain."
  echo "Tidak perlu menekan Caeno lagi. Jendela ini boleh ditutup."
  sleep 8
  exit 0
fi
cd "$HOME/kantin" || { echo "Folder ~/kantin tidak ada. Pasang aplikasi dulu (lihat panduan)."; sleep 15; exit 1; }
echo "Menyalakan server kantin... Jangan tutup jendela ini."
exec sh ./scripts/jalan.sh
