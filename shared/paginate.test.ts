import { paginate, pisahTopping, urutTopping } from './paginate';

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  test('splits into pages', () => {
    expect(paginate(items, 3, 0)).toEqual({ items: [1, 2, 3], page: 0, pageCount: 3 });
    expect(paginate(items, 3, 2)).toEqual({ items: [7], page: 2, pageCount: 3 });
  });

  test('clamps page out of range', () => {
    expect(paginate(items, 3, 99).page).toBe(2);
    expect(paginate(items, 3, -1).page).toBe(0);
  });

  test('perPage below 1 is treated as 1', () => {
    expect(paginate(items, 0, 0)).toEqual({ items: [1], page: 0, pageCount: 7 });
  });

  test('empty list has one empty page', () => {
    expect(paginate([], 4, 0)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});

test('urutTopping puts free options first, then admin order', () => {
  const p = [
    { id: 1, harga: 2000, urutan: 0 },
    { id: 2, harga: 0, urutan: 2 },
    { id: 3, harga: 1000, urutan: 1 },
    { id: 4, harga: 0, urutan: 1 },
  ];
  expect(urutTopping(p).map((x) => x.id)).toEqual([4, 2, 1, 3]);
});

test('pisahTopping splits free and paid', () => {
  const p = [{ harga: 0 }, { harga: 500 }, { harga: 0 }];
  expect(pisahTopping(p)).toEqual({ gratis: [{ harga: 0 }, { harga: 0 }], berbayar: [{ harga: 500 }] });
});
