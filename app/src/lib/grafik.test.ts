import { angkaRingkas, labelTanggal, potongTeratas, skalaRapi } from './grafik';

test('skalaRapi gives round ticks from 0 up to at least the maximum', () => {
  expect(skalaRapi(37)).toEqual([0, 10, 20, 30, 40]);
  expect(skalaRapi(43000)).toEqual([0, 10000, 20000, 30000, 40000, 50000]);
  expect(skalaRapi(0)).toEqual([0, 1]);
  expect(skalaRapi(4)).toEqual([0, 1, 2, 3, 4]);
});

test('angkaRingkas shortens big numbers in Indonesian style', () => {
  expect(angkaRingkas(950)).toBe('950');
  expect(angkaRingkas(12000)).toBe('12 rb');
  expect(angkaRingkas(1500000)).toBe('1,5 jt');
});

test('labelTanggal shows day/month', () => {
  expect(labelTanggal('2026-10-01')).toBe('1/10');
});

test('potongTeratas folds the tail into Lainnya', () => {
  const s = [5, 4, 3, 2, 1].map((n, i) => ({ nama: `M${i}`, qty: [n, 1], total: n + 1 }));
  expect(potongTeratas(s, 5)).toBe(s);
  expect(potongTeratas(s, 3)).toEqual([s[0], s[1], { nama: 'Lainnya', qty: [6, 3], total: 9 }]);
});
