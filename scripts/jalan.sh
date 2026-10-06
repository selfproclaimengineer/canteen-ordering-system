#!/data/data/com.termux/files/usr/bin/sh
# Starts the kantin server on the Termux host phone and restarts it if it stops.
# Before every start it installs a newer release from GitHub, if there is one (scripts/perbarui.sh).
# Run once by hand the first time (it asks for the Dapur and Admin PINs).
# To skip update checks: touch ~/kantin/.tanpa-update

cd "$HOME/kantin" || exit 1

# Keep the CPU awake while the screen is off.
termux-wake-lock

# Hotspot subnet of this phone, only needed when QR ordering is on.
# Find it with: ip -4 addr show | grep inet   (look for the wlan/ap interface)
# export KANTIN_LOKAL="127.0.0.0/8,::1/128,192.168.43.0/24"

# Internet access with a static QR (scripts/tunnel.sh). Skip with: touch ~/kantin/.tanpa-tunnel
if command -v cloudflared >/dev/null && [ ! -f .tanpa-tunnel ]; then
  pkill -f "scripts/tunnel.sh" 2>/dev/null
  pkill -f "cloudflared tunnel" 2>/dev/null
  sh scripts/tunnel.sh &
fi

gagal=0
while true; do
  [ -f .tanpa-update ] || sh scripts/perbarui.sh
  mulai=$(date +%s)
  node dist/server/main.js
  if [ $(( $(date +%s) - mulai )) -lt 30 ]; then
    gagal=$((gagal + 1))
  else
    # It ran fine, so the previous version is no longer needed as a fallback.
    gagal=0
    rm -rf .lama
  fi
  # Three quick stops in a row right after an update: go back to the previous version.
  if [ "$gagal" -ge 3 ] && [ -d .lama ]; then
    sh scripts/perbarui.sh --kembalikan
    gagal=0
  fi
  echo "Server berhenti ($(date '+%H:%M:%S')), mulai ulang dalam 2 detik..."
  sleep 2
done
