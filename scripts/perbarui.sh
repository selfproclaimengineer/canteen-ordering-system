#!/bin/sh
# Installs the newest release package from GitHub in place, keeping data/ and node_modules/.
#   sh scripts/perbarui.sh               check and install if a newer release exists
#   sh scripts/perbarui.sh --kembalikan  put back the previous version (jalan.sh does this when the new one keeps crashing)
# Always exits 0: no internet or a broken package must never stop the kantin from starting.

REPO="${KANTIN_REPO:-selfproclaimengineer/canteen-ordering-system}"
API="${KANTIN_RILIS_API:-https://api.github.com/repos/$REPO/releases/latest}"
DIR="${KANTIN_DIR:-$HOME/kantin}"
DIGANTI="dist app package.json package-lock.json versi.txt"

cd "$DIR" || exit 0

if [ "$1" = "--kembalikan" ]; then
  [ -d .lama ] || exit 0
  gagal=$(cat versi.txt 2>/dev/null)
  for f in $DIGANTI; do rm -rf "$f"; [ -e ".lama/$f" ] && mv ".lama/$f" "$f"; done
  rm -rf .lama
  # Remember the bad release so the next start does not install it again.
  [ -n "$gagal" ] && echo "$gagal" >> .tolak
  echo "Update: $gagal terus berhenti, kembali ke $(cat versi.txt 2>/dev/null)"
  exit 0
fi

tag=$(curl -fsSL --max-time 15 "$API" 2>/dev/null | grep -o '"tag_name": *"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
if [ -z "$tag" ]; then echo "Update: tidak bisa cek (offline?), pakai versi sekarang"; exit 0; fi
if [ "$tag" = "$(cat versi.txt 2>/dev/null)" ]; then echo "Update: sudah versi terbaru ($tag)"; exit 0; fi
if grep -qx "$tag" .tolak 2>/dev/null; then echo "Update: $tag pernah gagal, dilewati"; exit 0; fi

URL="${KANTIN_PAKET_URL:-https://github.com/$REPO/releases/download/$tag/kantin-paket.tgz}"
echo "Update: memasang $tag ..."
rm -rf .baru && mkdir .baru
if ! curl -fsSL --max-time 600 "$URL" -o .baru/paket.tgz || ! tar -xzf .baru/paket.tgz -C .baru || [ ! -f .baru/dist/server/main.js ]; then
  echo "Update: unduh atau ekstrak gagal, pakai versi sekarang"
  rm -rf .baru
  exit 0
fi

rm -rf .lama && mkdir .lama
for f in $DIGANTI; do [ -e "$f" ] && mv "$f" ".lama/$f"; done
for f in $DIGANTI; do [ -e ".baru/$f" ] && mv ".baru/$f" "$f"; done
# mv gives the scripts new files, so the copy of jalan.sh that is running now is not disturbed.
mkdir -p scripts docs
for f in .baru/scripts/*.sh; do [ -e "$f" ] && mv "$f" scripts/ && chmod +x "scripts/$(basename "$f")"; done
[ -e .baru/README.md ] && mv .baru/README.md README.md
[ -e .baru/docs/deploy-termux.md ] && mv .baru/docs/deploy-termux.md docs/deploy-termux.md
rm -rf .baru

if ! cmp -s package-lock.json .lama/package-lock.json; then
  echo "Update: memasang dependensi ..."
  if ! npm ci --omit=dev --no-audit --no-fund; then
    sh "$0" --kembalikan
    exit 0
  fi
fi
echo "Update: $tag terpasang"
exit 0
