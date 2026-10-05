import { rupiah } from './format';

test('formats rupiah with dot separators', () => {
  expect(rupiah(0)).toBe('Rp0');
  expect(rupiah(12000)).toBe('Rp12.000');
  expect(rupiah(1250000)).toBe('Rp1.250.000');
  expect(rupiah(-5000)).toBe('-Rp5.000');
});
