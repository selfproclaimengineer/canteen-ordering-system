#!/data/data/com.termux/files/usr/bin/sh
# Cloudflare quick tunnel for internet access, restarted when it stops, plus server/umumkan.js which
# tells the static QR page (GitHub Pages) the current tunnel address. Started by jalan.sh.
# Needs: pkg install cloudflared, and the GitHub token in ~/kantin/.github-token (see docs/deploy-termux.md).

cd "$HOME/kantin" || exit 1

pkill -f "dist/server/umumkan.js" 2>/dev/null
[ -f dist/server/umumkan.js ] && node dist/server/umumkan.js &

while true; do
  # The log is read by umumkan.js when the metrics endpoint is not available.
  cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:20241 --url http://localhost:3000 > .tunnel.log 2>&1
  echo "Tunnel berhenti ($(date '+%H:%M:%S')), mulai ulang dalam 5 detik..."
  sleep 5
done
