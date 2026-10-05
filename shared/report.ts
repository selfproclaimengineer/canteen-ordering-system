import { hargaItem } from './pricing';
import type { BarisLaporan, Laporan, Order } from './types';

function tambah(baris: Map<string, BarisLaporan>, nama: string, harga: number, qty: number) {
  const key = `${nama}\u0000${harga}`;
  const row = baris.get(key) ?? { nama, harga, qty: 0, total: 0 };
  row.qty += qty;
  row.total = row.harga * row.qty;
  baris.set(key, row);
}

function urut(baris: Map<string, BarisLaporan>): BarisLaporan[] {
  return [...baris.values()].sort((a, b) => a.nama.localeCompare(b.nama) || a.harga - b.harga);
}

export function susunLaporan(tanggal: string, orders: Order[], pengeluaran: number): Laporan {
  const menu = new Map<string, BarisLaporan>();
  const topping = new Map<string, BarisLaporan>();
  const batal = { qty: 0, nilai: 0 };
  const sumber = { kasir: 0, qr: 0 };

  for (const order of orders) {
    if (order.status === 'siap') sumber[order.sumber]++;
    for (const item of order.items) {
      if (order.status === 'batal' || item.batal_at !== null) {
        batal.qty += item.qty;
        batal.nilai += hargaItem(item);
        continue;
      }
      if (order.status !== 'siap') continue;
      tambah(menu, item.nama, item.harga, item.qty);
      for (const p of item.pilihan) {
        // Paid options and discounts both get a row, so the rows add up to the income.
        if (p.harga !== 0) tambah(topping, `${p.grup}: ${p.label}`, p.harga, item.qty);
      }
    }
  }

  const menuRows = urut(menu);
  const toppingRows = urut(topping);
  const pemasukan = [...menuRows, ...toppingRows].reduce((sum, r) => sum + r.total, 0);
  return {
    tanggal,
    menu: menuRows,
    topping: toppingRows,
    pemasukan,
    batal,
    pengeluaran,
    keuntungan: pemasukan - pengeluaran,
    sumber,
  };
}
