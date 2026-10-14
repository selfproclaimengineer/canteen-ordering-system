/**
 * Simulates a busy break: many phones active at once against a TEST server (creates real orders).
 *   - 2 counter phones and 2 kitchen phones: WebSocket open, polling like the real screens.
 *   - the rest are QR customers: open menu, order, poll their status every 5 s until ready.
 *   - one kitchen bot marks orders ready a few seconds after they arrive.
 * Optional --lag starts a TCP proxy that adds 200-1500 ms per chunk and stalls 2% of chunks for 6 s,
 * like a busy school WiFi that stays connected but is slow.
 *
 *   npm run uji-pengguna -- --url http://127.0.0.1:3000 --kode <kode QR> --pengguna 50 --yakin [--lag]
 */
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { persentil } from './uji-beban';

const arg = (nama: string) => {
  const i = process.argv.indexOf(nama);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** TCP proxy that delays every chunk and sometimes stalls, in both directions. */
function proxyLemot(target: URL, port: number) {
  const berat = process.argv.includes('--lag-berat');
  const tunda = () => (Math.random() < (berat ? 0.1 : 0.02) ? 6000 : 200 + Math.random() * (berat ? 2500 : 1300));
  const salur = (dari: net.Socket, ke: net.Socket) => {
    let antre = Promise.resolve();
    dari.on('data', (d) => {
      antre = antre.then(() => new Promise((r) => setTimeout(r, tunda()))).then(() => void (ke.writable && ke.write(d)));
    });
    dari.on('close', () => void antre.then(() => ke.destroy()));
    dari.on('error', () => ke.destroy());
  };
  const srv = net.createServer((klien) => {
    const hulu = net.connect(Number(target.port || 80), target.hostname);
    salur(klien, hulu);
    salur(hulu, klien);
  });
  srv.listen(port);
  return srv;
}

async function main() {
  if (!process.argv.includes('--yakin')) {
    console.log('Uji ini membuat order sungguhan. Jalankan ke server uji (KANTIN_DATA terpisah), lalu tambahkan --yakin.');
    process.exit(2);
  }
  const asli = new URL(arg('--url') ?? 'http://127.0.0.1:3000');
  const kode = arg('--kode') ?? '';
  const jumlah = Number(arg('--pengguna') ?? 50);
  const detik = Number(arg('--detik') ?? 60);
  const lemot = process.argv.includes('--lag') || process.argv.includes('--lag-berat');
  const proxy = lemot ? proxyLemot(asli, 3999) : null;
  const url = lemot ? 'http://127.0.0.1:3999' : asli.origin;
  console.log(`${jumlah} pengguna, ${detik} detik, ${lemot ? 'jaringan LEMOT (200-1500 ms, 2% macet 6 s)' : 'jaringan normal'}`);

  const ukur: Record<string, number[]> = {};
  const gagal: Record<string, number> = {};
  const catat = (jenis: string, ms: number) => (ukur[jenis] ??= []).push(ms);
  const salah = (jenis: string) => (gagal[jenis] = (gagal[jenis] ?? 0) + 1);
  const panggil = async (jenis: string, path: string, init: RequestInit = {}, batasMs = 20000) => {
    const t = performance.now();
    try {
      const r = await fetch(url + path, { ...init, signal: AbortSignal.timeout(batasMs) });
      const body = await r.json().catch(() => ({}));
      catat(jenis, performance.now() - t);
      if (!r.ok) salah(`${jenis} ${r.status}`);
      return { r, body };
    } catch {
      salah(`${jenis} timeout/putus`);
      return null;
    }
  };
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const selesai = Date.now() + detik * 1000;
  // --batas-tetap: old app rule (always 5 s). Default: the app's growing limit 5 s, 10 s, then 20 s.
  const batasKirim = (coba: number) => (process.argv.includes('--batas-tetap') ? 5000 : Math.min(20000, 5000 * 2 ** coba));
  const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const token = (await panggil('login', '/api/auth/pin', json({ peran: 'dapur', pin: arg('--pin') ?? '111111', device: 'uji' })))?.body.token as string;
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const menu = ((await panggil('menu', '/api/menu'))?.body.menu ?? []).filter((m: { tersedia: boolean }) => m.tersedia);
  if (!menu.length || !token) throw new Error('Server uji belum siap (menu kosong atau PIN salah)');

  // WebSocket events reaching the kitchen phones.
  let event = 0;
  const sockets = [0, 1].map(() => {
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    ws.onmessage = () => event++;
    ws.onerror = () => salah('websocket error');
    return ws;
  });

  const staf = async (layar: 'order' | 'dapur') => {
    while (Date.now() < selesai) {
      if (layar === 'dapur') await panggil('dapur: daftar pesanan', '/api/orders?tab=sekarang', auth);
      else await Promise.all([panggil('order: menu', '/api/menu'), panggil('order: nomor siap', '/api/siap')]);
      await tidur(layar === 'dapur' ? 3000 : 5000);
    }
  };
  const tungguSiap: number[] = [];
  const pelanggan = async (i: number) => {
    await tidur(Math.random() * detik * 500);
    await panggil('qr: buka menu', '/api/menu');
    const m = menu[i % menu.length];
    const b = { client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: `QR-uji${i}`, nama: `Uji${i}`, items: [{ menu_id: m.id, qty: 1, pilihan_ids: [] }] };
    // Same retry rule as the app: abort after the per-try limit, retry with the same client_uuid.
    let o = null;
    const t0 = performance.now();
    for (let coba = 0; coba < 10 && !o?.r.ok; coba++) {
      if (coba > 0) await tidur(1500);
      o = await panggil('qr: kirim pesanan (per coba)', `/api/qr/${kode}/orders`, json(b), batasKirim(coba));
    }
    if (!o?.r.ok) return void salah('qr: pesanan tidak terkirim setelah 10 coba');
    catat('qr: pesanan sampai (total)', performance.now() - t0);
    const dibuat = performance.now();
    while (Date.now() < selesai + 60000) {
      await tidur(5000);
      const s = await panggil('qr: cek status', `/api/qr/${kode}/orders/${o.body.id}?uuid=${b.client_uuid}`);
      if (s?.body.status === 'siap') return void tungguSiap.push(performance.now() - dibuat);
    }
    salah('qr: tidak pernah siap');
  };
  const dapurBot = async () => {
    while (Date.now() < selesai + 55000) {
      const d = await panggil('dapur: daftar pesanan', '/api/orders?tab=sekarang', auth);
      // Two kitchen phones tap Siap at the same time.
      const baru = (d?.body.orders ?? []).filter((x: { status: string; dibuat_at: number }) => x.status === 'baru' && Date.now() - x.dibuat_at > 3000);
      await Promise.all(baru.map((o: { id: number }) => panggil('dapur: tandai siap', `/api/orders/${o.id}/siap`, { method: 'POST', ...auth })));
      await tidur(2000);
    }
  };

  await Promise.all([staf('order'), staf('order'), staf('dapur'), staf('dapur'), dapurBot(), ...Array.from({ length: jumlah - 4 }, (_, i) => pelanggan(i))]);
  sockets.forEach((s) => s.close());
  proxy?.close();

  console.log('\nLatensi per jenis permintaan (ms):');
  for (const [jenis, n] of Object.entries(ukur).sort()) {
    console.log(`  ${jenis.padEnd(26)} n=${String(n.length).padStart(4)}  p50 ${persentil(n, 50).toFixed(0).padStart(5)}  p95 ${persentil(n, 95).toFixed(0).padStart(5)}  maks ${Math.max(...n).toFixed(0).padStart(5)}`);
  }
  console.log(`Pesanan QR siap: ${tungguSiap.length}/${jumlah - 4}, waktu sampai pelanggan tahu siap p50 ${(persentil(tungguSiap, 50) / 1000).toFixed(1)} s`);
  console.log(`Event WebSocket diterima HP dapur: ${event}`);
  console.log('Gagal:', Object.keys(gagal).length ? gagal : 'tidak ada');
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
