import { susunTren } from './tren';
import type { Laporan } from './types';

const hari = (tanggal: string, menu: [string, number, number][], topping: [string, number][] = [], pemasukan = 0): Laporan => ({
  tanggal,
  menu: menu.map(([nama, harga, qty]) => ({ nama, harga, qty, total: harga * qty })),
  topping: topping.map(([nama, qty]) => ({ nama, harga: 2000, qty, total: 2000 * qty })),
  pemasukan, batal: { qty: 0, nilai: 0 }, pengeluaran: 0, keuntungan: pemasukan,
});

test('susunTren lines up each name across days, merges price variants and ranks by total', () => {
  const t = susunTren([
    hari('2026-09-29', [['Mie', 10000, 2], ['Mie', 11000, 1], ['Es Teh', 3000, 5]], [['Topping: Telur', 1]], 38000),
    hari('2026-09-30', [], [], 0),
    hari('2026-10-01', [['Es Teh', 3000, 1], ['Bakso', 10000, 4]], [['Topping: Telur', 2], ['Topping: Keju', 3]], 43000),
  ]);
  expect(t.tanggal).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  expect(t.pemasukan).toEqual([38000, 0, 43000]);
  expect(t.menu).toEqual([
    { nama: 'Es Teh', qty: [5, 0, 1], total: 6 },
    { nama: 'Bakso', qty: [0, 0, 4], total: 4 },
    { nama: 'Mie', qty: [3, 0, 0], total: 3 },
  ]);
  expect(t.topping.map((s) => [s.nama, s.total])).toEqual([['Topping: Keju', 3], ['Topping: Telur', 3]]);
});
