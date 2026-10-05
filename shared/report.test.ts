import { susunLaporan } from './report';
import type { Order, OrderItem } from './types';

let nextId = 1;
function item(nama: string, harga: number, qty: number, pilihan: [string, number][] = [], batal_at: number | null = null): OrderItem {
  return {
    id: nextId++,
    menu_id: 1,
    nama,
    harga,
    qty,
    batal_at,
    siap_at: null,
    pilihan: pilihan.map(([label, h], i) => ({ pilihan_id: i + 1, grup: 'Topping', label, harga: h })),
  };
}
function order(status: Order['status'], items: OrderItem[], sumber: Order['sumber'] = 'kasir'): Order {
  return {
    id: nextId++, client_uuid: `u${nextId}`, tanggal: '2026-09-29', nomor: nextId, waktu_ambil: 'sekarang',
    status, device: 'Order 1', dibuat_at: 0, siap_at: null, batal_at: null, batal_oleh: null, sumber, nama: null, catatan: null, items,
  };
}

test('counts only siap items and splits rows by price', () => {
  const orders = [
    order('siap', [item('Mie Goreng', 10000, 2, [['Telur', 2000], ['Bawang', 0]])]),
    order('siap', [item('Mie Goreng', 11000, 1), item('Es Teh', 3000, 1, [], 99)]),
    order('baru', [item('Mie Goreng', 10000, 5)]),
    order('batal', [item('Es Teh', 3000, 2)]),
  ];

  const l = susunLaporan('2026-09-29', orders, 15000);

  expect(l.menu).toEqual([
    { nama: 'Mie Goreng', harga: 10000, qty: 2, total: 20000 },
    { nama: 'Mie Goreng', harga: 11000, qty: 1, total: 11000 },
  ]);
  expect(l.topping).toEqual([{ nama: 'Topping: Telur', harga: 2000, qty: 2, total: 4000 }]);
  expect(l.pemasukan).toBe(35000);
  expect(l.batal).toEqual({ qty: 3, nilai: 9000 });
  expect(l.pengeluaran).toBe(15000);
  expect(l.keuntungan).toBe(20000);
});

test('empty day gives zeros and negative profit', () => {
  const l = susunLaporan('2026-09-29', [], 5000);
  expect(l.pemasukan).toBe(0);
  expect(l.keuntungan).toBe(-5000);
  expect(l.menu).toEqual([]);
});

test('counts siap orders per source', () => {
  const orders = [
    order('siap', [item('Es Teh', 3000, 1)]),
    order('siap', [item('Es Teh', 3000, 1)], 'qr'),
    order('siap', [item('Es Teh', 3000, 1)], 'qr'),
    order('baru', [item('Es Teh', 3000, 1)], 'qr'),
    order('batal', [item('Es Teh', 3000, 1)], 'qr'),
  ];
  expect(susunLaporan('2026-09-29', orders, 0).sumber).toEqual({ kasir: 1, qr: 2 });
});
