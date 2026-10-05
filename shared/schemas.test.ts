import { menuSchema, orderBaruSchema, pengaturanSchema, pilihanSchema, pinLoginSchema } from './schemas';

const uuid = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

test('valid order passes', () => {
  const r = orderBaruSchema.safeParse({
    client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1',
    items: [{ menu_id: 1, qty: 2, pilihan_ids: [3] }],
  });
  expect(r.success).toBe(true);
});

test('order without items fails', () => {
  const r = orderBaruSchema.safeParse({ client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1', items: [] });
  expect(r.success).toBe(false);
});

test('qty 0 fails', () => {
  const r = orderBaruSchema.safeParse({
    client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1',
    items: [{ menu_id: 1, qty: 0, pilihan_ids: [] }],
  });
  expect(r.success).toBe(false);
});

test('PIN must be exactly 6 digits', () => {
  expect(pinLoginSchema.safeParse({ peran: 'dapur', pin: '123456', device: 'X' }).success).toBe(true);
  expect(pinLoginSchema.safeParse({ peran: 'dapur', pin: '12345', device: 'X' }).success).toBe(false);
  expect(pinLoginSchema.safeParse({ peran: 'dapur', pin: '12345a', device: 'X' }).success).toBe(false);
});

test('empty option price becomes 0', () => {
  expect(pilihanSchema.parse({ grup_id: 1, label: 'Bawang', harga: null }).harga).toBe(0);
  expect(pilihanSchema.parse({ grup_id: 1, label: 'Bawang' }).harga).toBe(0);
});

test('menu price cannot be negative; an option may be a discount', () => {
  expect(menuSchema.safeParse({ nama: 'X', harga: -1 }).success).toBe(false);
  expect(pilihanSchema.safeParse({ grup_id: 1, label: 'X', harga: -1 }).success).toBe(true);
});

test('break time must be HH:MM', () => {
  expect(pengaturanSchema.safeParse({ jam_ist1: '09:30', jam_ist2: '12:00', qty_max: 10 }).success).toBe(true);
  expect(pengaturanSchema.safeParse({ jam_ist1: '9:30', jam_ist2: '12:00', qty_max: 10 }).success).toBe(false);
  expect(pengaturanSchema.safeParse({ jam_ist1: '24:00', jam_ist2: '12:00', qty_max: 10 }).success).toBe(false);
});
