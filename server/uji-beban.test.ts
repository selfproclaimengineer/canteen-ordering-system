import { bacaArgumen, jadwal, persentil } from './uji-beban';

test('persentil uses nearest rank', () => {
  const v = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
  expect(persentil(v, 50)).toBe(5);
  expect(persentil(v, 95)).toBe(10);
  expect(persentil(v, 100)).toBe(10);
  expect(persentil([], 95)).toBe(0);
});

test('jadwal spreads orders evenly; 0 seconds sends all at once', () => {
  expect(jadwal(4, 2)).toEqual([0, 500, 1000, 1500]);
  expect(jadwal(3, 0)).toEqual([0, 0, 0]);
});

test('bacaArgumen has safe defaults and requires --yakin', () => {
  expect(bacaArgumen([])).toEqual({ url: 'http://127.0.0.1:3000', jumlah: 60, detik: 120, yakin: false });
  expect(bacaArgumen(['--url', 'http://192.168.43.1:3000/', '--jumlah', '10', '--detik', '0', '--yakin'])).toEqual({
    url: 'http://192.168.43.1:3000', jumlah: 10, detik: 0, yakin: true,
  });
  expect(() => bacaArgumen(['--jumlah', 'x'])).toThrow('--jumlah');
  expect(() => bacaArgumen(['--detik', '-1'])).toThrow('--detik');
});
