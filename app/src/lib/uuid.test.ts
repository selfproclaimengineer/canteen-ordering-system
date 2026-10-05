import { orderBaruSchema } from '../../../shared/schemas';
import { uuidV4 } from './uuid';

test('sets version and variant bits', () => {
  expect(uuidV4(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  expect(uuidV4(new Uint8Array(16).fill(255))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('random UUIDs differ and pass the server schema (Review Focus 5)', () => {
  const a = uuidV4();
  expect(a).not.toBe(uuidV4());
  const r = orderBaruSchema.safeParse({
    client_uuid: a, waktu_ambil: 'sekarang', device: 'HP-1', items: [{ menu_id: 1, qty: 1, pilihan_ids: [] }],
  });
  expect(r.success).toBe(true);
});
