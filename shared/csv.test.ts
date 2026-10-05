import { HEADER_CSV, laporanKeBaris, toCsv } from './csv';
import type { Laporan } from './types';

test('toCsv adds BOM, uses ; and CRLF', () => {
  expect(toCsv([['a', 1], ['b', 2]])).toBe('\uFEFFa;1\r\nb;2\r\n');
});

test('toCsv quotes cells with separator, quote or newline', () => {
  expect(toCsv([['a;b', 'say "hi"', 'x\ny']])).toBe('\uFEFF"a;b";"say ""hi""";"x\ny"\r\n');
});

test('toCsv neutralises spreadsheet formulas in text but keeps numbers', () => {
  expect(toCsv([['=HYPERLINK("x")', '+1', '@a', '-b', -5000]])).toBe(
    '\uFEFF"\'=HYPERLINK(""x"")";\'+1;\'@a;\'-b;-5000\r\n',
  );
});

test('laporanKeBaris lists detail rows then summary rows', () => {
  const l: Laporan = {
    tanggal: '2026-09-29',
    menu: [{ nama: 'Mie', harga: 10000, qty: 2, total: 20000 }],
    topping: [{ nama: 'Topping: Telur', harga: 2000, qty: 1, total: 2000 }],
    pemasukan: 22000,
    batal: { qty: 1, nilai: 3000 },
    pengeluaran: 5000,
    keuntungan: 17000,
    sumber: { kasir: 4, qr: 2 },
  };
  expect(HEADER_CSV).toEqual(['tanggal', 'jenis', 'nama', 'harga', 'qty', 'total']);
  expect(laporanKeBaris(l)).toEqual([
    ['2026-09-29', 'menu', 'Mie', 10000, 2, 20000],
    ['2026-09-29', 'topping', 'Topping: Telur', 2000, 1, 2000],
    ['2026-09-29', 'batal', '', '', 1, 3000],
    ['2026-09-29', 'order_kasir', '', '', 4, ''],
    ['2026-09-29', 'order_qr', '', '', 2, ''],
    ['2026-09-29', 'pemasukan', '', '', '', 22000],
    ['2026-09-29', 'pengeluaran', '', '', '', 5000],
    ['2026-09-29', 'keuntungan', '', '', '', 17000],
  ]);
});

test('laporanKeBaris treats a snapshot without sumber as zero', () => {
  const l: Laporan = { tanggal: 't', menu: [], topping: [], pemasukan: 0, batal: { qty: 0, nilai: 0 }, pengeluaran: 0, keuntungan: 0 };
  expect(laporanKeBaris(l)).toContainEqual(['t', 'order_qr', '', '', 0, '']);
});
