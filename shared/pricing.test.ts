import { hargaItem, totalOrder } from './pricing';

describe('hargaItem', () => {
  test('menu price times qty without options', () => {
    expect(hargaItem({ harga: 10000, qty: 2, pilihan: [] })).toBe(20000);
  });

  test('adds option prices before multiplying by qty', () => {
    const item = { harga: 10000, qty: 3, pilihan: [{ harga: 2000 }, { harga: 0 }, { harga: 500 }] };
    expect(hargaItem(item)).toBe(37500);
  });
});

describe('totalOrder', () => {
  test('skips cancelled items', () => {
    const items = [
      { harga: 10000, qty: 1, pilihan: [{ harga: 2000 }], batal_at: null },
      { harga: 3000, qty: 2, pilihan: [], batal_at: 123 },
    ];
    expect(totalOrder(items)).toBe(12000);
  });

  test('empty order is 0', () => {
    expect(totalOrder([])).toBe(0);
  });
});
