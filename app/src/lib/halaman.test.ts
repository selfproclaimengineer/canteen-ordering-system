import { hitungPerHalaman } from './halaman';

test('counts the last row, which has no gap after it', () => {
  // 3 rows of 100 px with 10 px gaps need exactly 320 px.
  expect(hitungPerHalaman(320, 100, 10, 3)).toBe(9);
  expect(hitungPerHalaman(319, 100, 10, 3)).toBe(6);
});

test('never returns less than one row', () => {
  expect(hitungPerHalaman(0, 100, 10, 2)).toBe(2);
});
