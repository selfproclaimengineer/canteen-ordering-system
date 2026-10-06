#!/bin/sh
# Installs the newest release package from GitHub in place, keeping data/ and node_modules/.
#   sh scripts/perbarui.sh               check and install if a newer release exists
#   sh scripts/perbarui.sh --kembalikan  put back the previous version (jalan.sh does this when the new one keeps crashing)
# Always exits 0: no internet or a broken package must never stop the kantin from starting.

REPO="${KANTIN_REPO:-selfproclaimengineer/canteen-ordering-system}"
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

if [ -n "$KANTIN_RILIS_API" ]; then
  tag=$(curl -fsSL --max-time 15 "$KANTIN_RILIS_API" 2>/dev/null | grep -o '"tag_name": *"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
else
  # /releases/latest redirects to /releases/tag/<tag>. Unlike api.github.com it has no 60-per-hour limit,
  # which a shared school or mobile-data IP uses up quickly.
  tag=$(curl -fsIL -o /dev/null -w '%{url_effective}' --max-time 20 "https://github.com/$REPO/releases/latest" 2>/dev/null | sed -n 's#.*/releases/tag/##p')
fi
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
