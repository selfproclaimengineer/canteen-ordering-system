/**
 * Load test: sends N counter orders spread over D seconds and reports latency.
 * It creates REAL orders, so run it against a test server with its own data folder
 * (KANTIN_DATA=uji-data), never against the kantin's live database.
 *
 *   npm run uji-beban -- --url http://127.0.0.1:3000 --jumlah 60 --detik 120 --yakin
 *   (--detik 0 sends every order at once: the worst case at the start of a break)
 */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { MenuPublik } from '../shared/types';

export function persentil(nilai: number[], p: number): number {
  if (nilai.length === 0) return 0;
  const urut = [...nilai].sort((a, b) => a - b);
  return urut[Math.min(urut.length - 1, Math.max(0, Math.ceil((p / 100) * urut.length) - 1))];
}

/** Start offsets in ms that spread `jumlah` orders evenly over `detik` seconds. */
export function jadwal(jumlah: number, detik: number): number[] {
  return Array.from({ length: jumlah }, (_, i) => Math.round((i * detik * 1000) / jumlah));
}

export function bacaArgumen(argv: string[]) {
  const nilai = (nama: string) => {
    const i = argv.indexOf(nama);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const angka = (nama: string, bawaan: number, min: number) => {
    const teks = nilai(nama);
    if (teks === undefined) return bawaan;
    const n = Number(teks);
    if (!Number.isInteger(n) || n < min) throw new Error(`${nama} harus bilangan bulat >= ${min}`);
    return n;
  };
  return {
    url: (nilai('--url') ?? 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    jumlah: angka('--jumlah', 60, 1),
    detik: angka('--detik', 120, 0),
    yakin: argv.includes('--yakin'),
  };
}

async function main() {
  const arg = bacaArgumen(process.argv.slice(2));
  if (!arg.yakin) {
    console.log('Uji beban membuat order sungguhan. Jalankan ke server uji (KANTIN_DATA terpisah), lalu tambahkan --yakin.');
    process.exit(2);
  }

  const menu = (await (await fetch(`${arg.url}/api/menu`)).json()) as { menu: MenuPublik[] };
  const tersedia = menu.menu.filter((m) => m.tersedia);
  if (tersedia.length === 0) throw new Error('Tidak ada menu tersedia di server uji');

  console.log(`Kirim ${arg.jumlah} order dalam ${arg.detik} detik ke ${arg.url} …`);
  const waktu: number[] = [];
  const gagal = new Map<string, number>();
  const kirim = async (i: number) => {
    const m = tersedia[i % tersedia.length];
    const body = {
      client_uuid: randomUUID(),
      waktu_ambil: 'sekarang',
      device: 'UJI-BEBAN',
      items: [{ menu_id: m.id, qty: 1 + (i % 2), pilihan_ids: [] }],
    };
    const mulai = performance.now();
    try {
      const res = await fetch(`${arg.url}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      waktu.push(performance.now() - mulai);
      if (res.status !== 201) gagal.set(String(res.status), (gagal.get(String(res.status)) ?? 0) + 1);
    } catch (err) {
      const nama = err instanceof Error ? err.message : 'error';
      gagal.set(nama, (gagal.get(nama) ?? 0) + 1);
    }
  };

  await Promise.all(jadwal(arg.jumlah, arg.detik).map((t, i) => new Promise((r) => setTimeout(r, t)).then(() => kirim(i))));

  const totalGagal = [...gagal.values()].reduce((a, b) => a + b, 0);
  const p95 = persentil(waktu, 95);
  console.log(`Berhasil ${arg.jumlah - totalGagal}/${arg.jumlah}`);
  console.log(`Latensi p50 ${persentil(waktu, 50).toFixed(0)} ms · p95 ${p95.toFixed(0)} ms · maks ${Math.max(0, ...waktu).toFixed(0)} ms`);
  if (totalGagal > 0) console.log('Gagal:', Object.fromEntries(gagal));
  const lulus = totalGagal === 0 && p95 < 500;
  console.log(lulus ? 'LULUS (target: tanpa error, p95 < 500 ms)' : 'TIDAK LULUS (target: tanpa error, p95 < 500 ms)');
  process.exit(lulus ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
