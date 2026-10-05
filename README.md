# Canteen Ordering System

Order system for a school canteen. A few Android phones on the same WiFi or hotspot; the server runs on one of the phones (Termux) or on a laptop. No cloud server and no paid service.

The UI and docs are in Indonesian.

- **Order** (2 phones at the counter): students order by tapping buttons only.
- **Dapur** (2 phones in the kitchen): the kitchen sees every order live.
- **Edit / Laporan** (admin): menu, options, settings, daily report and CSV export.

Design: `docs/superpowers/specs/2026-09-29-kantin-order-design.md`.

## Try it on a laptop

    git clone https://github.com/selfproclaimengineer/canteen-ordering-system.git
    cd canteen-ordering-system
    npm install && npm --prefix app install
    npm run build
    npm start           # asks for two 6-digit PINs, then open http://localhost:3000

Open `/order` on one browser tab and `/dapur` on another (Dapur needs the Dapur PIN). Menus are added in Edit (Admin PIN).

## Requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite`).

## Development

    npm install
    npm --prefix app install
    npm test            # unit and API tests
    npm run build       # server -> dist/, app -> app/build/client
    npm start           # http://localhost:3000

The first `npm start` asks for the Dapur PIN and the Admin PIN (6 digits each). To set them without a terminal, use the `KANTIN_PIN_DAPUR` and `KANTIN_PIN_ADMIN` environment variables.

For UI work, run `npm start` in one terminal and `npm run dev:app` in another. The Vite dev server forwards `/api` and `/ws` to port 3000.

## Deploying and testing

- Phone host (Termux): see [docs/deploy-termux.md](docs/deploy-termux.md). Every push to `main` builds a release package on GitHub Actions; the phone installs the newest release on each start, or when the admin taps **Perbarui sekarang** in Edit.
- `npm run paket` still builds `kantin-paket.tgz` locally for a manual install.
- Manual test checklist for the 4 phones: [docs/uji-manual.md](docs/uji-manual.md).
- Load test (creates real orders; use a test server with its own `KANTIN_DATA`): `npm run uji-beban -- --url http://<host>:3000 --jumlah 60 --detik 120 --yakin`. `--detik 0` sends everything at once.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `KANTIN_DATA` | `./data` | Database and daily backups |
| `KANTIN_STATIC` | `./app/build/client` | Built app |
| `TZ` | `Asia/Jakarta` | Local time for days and break times |
| `KANTIN_LOKAL` | `127.0.0.0/8,::1/128,192.168.137.0/24,192.168.43.0/24` | Kantin hotspot subnets. With QR on, only these may use Dapur, Edit, Laporan and counter orders |

## Using the phones

1. The host phone turns on its hotspot (WPA2 password) and runs the server.
2. The other phones join the hotspot and open `http://<host-ip>:3000`.
3. Every phone starts in **Order** mode. To switch a phone to **Dapur**, hold the top-left corner for 3 seconds and enter the Dapur PIN.
4. From **Dapur**, the **Edit** and **Laporan** buttons ask for the Admin PIN.
5. Pin the Order phones with Android screen pinning so students cannot leave the app.

Forgot the Admin PIN? On the host, run `npm run reset-pin`, then restart the server.

## QR ordering (optional, laptop recommended)

Students scan a QR on the table and order from their own phone (any network). They type a name of at most 10 letters; it shows on their status screen and on the kitchen card. Only the server needs Tailscale; student phones use a normal browser.

1. The server (laptop, or a host phone that supports WiFi + hotspot at the same time) joins the school WiFi and shares a hotspot with the kantin phones.
2. Run `npm start`, then `tailscale funnel --bg 3000`. Tailscale prints the public address, e.g. `https://kantin.xxx.ts.net`.
3. On a kantin phone: Dapur → Edit → **QR**. Paste the address, save, then **Cetak**.
4. Open or close QR ordering with the **QR: Buka/Tutup** button in Dapur.

Safety:

- Requests from the internet can only reach the QR ordering page. Dapur, Edit, Laporan and PIN login work only on the kantin hotspot.
- With QR on, the server also sits on the school WiFi. Only devices in the hotspot subnets (`KANTIN_LOKAL`) are trusted; every other device on the school network gets the same limits as the internet. If the kantin phones cannot open Dapur, check the hotspot subnet (`ipconfig` / Android hotspot settings) and set `KANTIN_LOKAL`.
- **Choosing the school network.** Some ISPs (CGNAT) send each phone out through a different public IP of one pool, so one IP is not enough. Open the QR from 2–3 Android phones on the school WiFi, then in Edit → QR → **IP yang ditolak** tick them: all the same → **Izinkan IP**; different → **Izinkan rentang** (smallest common range, never wider than /16 IPv4 or /48 IPv6). A range also admits other customers of that ISP pool; the QR code, one active order per phone, 50/min and the open switch still apply.
- **Ambil IP sekolah** is a shortcut for schools with one fixed public IP: it asks api.ipify.org / api6.ipify.org for the server's public IPs (only when pressed). On CGNAT networks the server may get a different IP than the phones; use the list above instead.
- Last resort if the school range is too wide: a GPS radius check (not built).
- At most one active QR order per phone and at most 50 QR orders per minute. The secret code in the QR keeps scanners and bots out; if a photo of the QR is abused, press **Ganti kode** or close QR from Dapur.
- **Developer-only switch:** start the server with `KANTIN_QR_HANYA_SEKOLAH=1` to accept QR orders only from allowed school IPs. Only then do the network tools (Ambil IP, IP yang ditolak, ranges) appear in Edit → QR. It is off by default because phones on the school WiFi often fall back to mobile data and get rejected.
- If a QR photo leaks, press **Ganti kode** and print the new QR.
- To switch the feature off, clear the address in Edit → QR, or run `tailscale funnel --https=443 off`.

iPhones cannot join the school WiFi, so they are not supported for QR ordering; they can order at the counter.

On a host phone, Funnel needs the community `tailscale-termux-cli` in Termux. It is experimental: test it before relying on it.

## License

[CC BY 4.0](LICENSE). You may use and change it, but keep the credit, including the footer watermark in the app.
