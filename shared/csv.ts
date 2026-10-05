import type { Laporan } from './types';

export type Sel = string | number;

export const HEADER_CSV: Sel[] = ['tanggal', 'jenis', 'nama', 'harga', 'qty', 'total'];

function sel(value: Sel): string {
  let s = String(value);
  // Text starting with = + - @ would run as a formula in Excel.
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Sel[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(sel).join(';')).join('\r\n') + '\r\n';
}

export function laporanKeBaris(l: Laporan): Sel[][] {
  const s = l.sumber ?? { kasir: 0, qr: 0 };
  return [
    ...l.menu.map((r): Sel[] => [l.tanggal, 'menu', r.nama, r.harga, r.qty, r.total]),
    ...l.topping.map((r): Sel[] => [l.tanggal, 'topping', r.nama, r.harga, r.qty, r.total]),
    [l.tanggal, 'batal', '', '', l.batal.qty, l.batal.nilai],
    [l.tanggal, 'order_kasir', '', '', s.kasir, ''],
    [l.tanggal, 'order_qr', '', '', s.qr, ''],
    [l.tanggal, 'pemasukan', '', '', '', l.pemasukan],
    [l.tanggal, 'pengeluaran', '', '', '', l.pengeluaran],
    [l.tanggal, 'keuntungan', '', '', '', l.keuntungan],
  ];
}
