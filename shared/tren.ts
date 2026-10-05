import type { BarisLaporan, Laporan } from './types';

/** One item's quantity per day, plus its total over the range. */
export interface SeriTren {
  nama: string;
  qty: number[];
  total: number;
}

export interface Tren {
  tanggal: string[];
  pemasukan: number[];
  menu: SeriTren[];
  topping: SeriTren[];
}

/** Lines items up by name across days (price variants merge) and ranks them by total qty. */
function seri(hari: BarisLaporan[][]): SeriTren[] {
  const peta = new Map<string, SeriTren>();
  hari.forEach((baris, i) => {
    for (const b of baris) {
      let s = peta.get(b.nama);
      if (!s) peta.set(b.nama, (s = { nama: b.nama, qty: hari.map(() => 0), total: 0 }));
      s.qty[i] += b.qty;
      s.total += b.qty;
    }
  });
  return [...peta.values()].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
}

export function susunTren(laporan: Laporan[]): Tren {
  return {
    tanggal: laporan.map((l) => l.tanggal),
    pemasukan: laporan.map((l) => l.pemasukan),
    menu: seri(laporan.map((l) => l.menu)),
    topping: seri(laporan.map((l) => l.topping)),
  };
}
