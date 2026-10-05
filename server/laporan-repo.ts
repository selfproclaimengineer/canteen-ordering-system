import { susunLaporan } from '../shared/report';
import { tanggalDari } from '../shared/rules';
import type { Laporan } from '../shared/types';
import { all, get, run, type Db } from './db';
import { HttpError } from './http';
import { ordersHari } from './order-repo';

export function hitungLaporan(db: Db, tanggal: string, pengeluaran: number): Laporan {
  return susunLaporan(tanggal, ordersHari(db, tanggal), pengeluaran);
}

export function ambilLaporan(db: Db, tanggal: string, now: number): { laporan: Laporan; disimpan_at: number | null } {
  const row = get<{ pengeluaran: number; isi_json: string; disimpan_at: number }>(
    db,
    'SELECT pengeluaran, isi_json, disimpan_at FROM laporan WHERE tanggal = ?',
    tanggal,
  );
  if (!row) return { laporan: hitungLaporan(db, tanggal, 0), disimpan_at: null };
  // Today stays live (spec 11); past days keep the saved snapshot.
  if (tanggal === tanggalDari(now)) return { laporan: hitungLaporan(db, tanggal, row.pengeluaran), disimpan_at: row.disimpan_at };
  return { laporan: JSON.parse(row.isi_json) as Laporan, disimpan_at: row.disimpan_at };
}

export function simpanLaporan(db: Db, tanggal: string, pengeluaran: number, now: number): Laporan {
  const laporan = hitungLaporan(db, tanggal, pengeluaran);
  run(
    db,
    `INSERT INTO laporan (tanggal, pengeluaran, isi_json, disimpan_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tanggal) DO UPDATE SET pengeluaran = excluded.pengeluaran,
       isi_json = excluded.isi_json, disimpan_at = excluded.disimpan_at`,
    tanggal, pengeluaran, JSON.stringify(laporan), now,
  );
  return laporan;
}

export function daftarLaporan(db: Db) {
  return all<{ tanggal: string; isi_json: string; disimpan_at: number }>(
    db,
    'SELECT tanggal, isi_json, disimpan_at FROM laporan ORDER BY tanggal DESC',
  ).map((row) => {
    const l = JSON.parse(row.isi_json) as Laporan;
    return {
      tanggal: row.tanggal,
      pemasukan: l.pemasukan,
      pengeluaran: l.pengeluaran,
      keuntungan: l.keuntungan,
      disimpan_at: row.disimpan_at,
    };
  });
}

const HARI_MS = 24 * 3600_000;
const keUtc = (t: string) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));

export function rentangTanggal(dari: string, sampai: string): string[] {
  const a = keUtc(dari);
  const b = keUtc(sampai);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) throw new HttpError(400, 'Rentang tanggal tidak valid');
  if ((b - a) / HARI_MS >= 366) throw new HttpError(400, 'Maksimal 366 hari');
  const hasil: string[] = [];
  for (let t = a; t <= b; t += HARI_MS) hasil.push(new Date(t).toISOString().slice(0, 10));
  return hasil;
}
