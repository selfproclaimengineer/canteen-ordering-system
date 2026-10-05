import { kirimOrder, type Respons } from './kirim';

const respons = (status: number, body: object): Respons => ({ status, json: async () => body });

test('retries network errors and 5xx with the same body, then succeeds (Review Focus 1)', async () => {
  const bodies: unknown[] = [];
  const hasil = [
    () => { throw new TypeError('Failed to fetch'); },
    () => respons(503, {}),
    () => respons(201, { id: 5, nomor: 12, total: 13000, dibuat_at: 1, status: 'baru' }),
  ];
  let menunggu = 0;
  const tunggu: number[] = [];
  const out = await kirimOrder(
    { client_uuid: 'x' },
    async (b) => { bodies.push(b); return hasil[bodies.length - 1](); },
    async (ms) => { tunggu.push(ms); },
    () => { menunggu++; },
  );
  expect(out).toEqual({ ok: true, id: 5, nomor: 12, total: 13000, dibuat_at: 1, status: 'baru', baru: true });
  expect(bodies).toEqual([{ client_uuid: 'x' }, { client_uuid: 'x' }, { client_uuid: 'x' }]);
  expect(menunggu).toBe(2);
  expect(tunggu).toEqual([1500, 1500]);
});

test('200 from an idempotent retry counts as success', async () => {
  const out = await kirimOrder({}, async () => respons(200, { id: 1, nomor: 3, total: 3000, dibuat_at: 2, status: 'batal' }), async () => {});
  expect(out).toMatchObject({ ok: true, nomor: 3, status: 'batal', baru: false });
});

test('409 with sold-out list is returned without retry', async () => {
  let calls = 0;
  const out = await kirimOrder({}, async () => { calls++; return respons(409, { error: 'Menu habis', habis: [{ menu_id: 2, nama: 'Es Teh' }] }); }, async () => {});
  expect(out).toEqual({ ok: false, habis: [{ menu_id: 2, nama: 'Es Teh' }] });
  expect(calls).toBe(1);
});

test('other 4xx returns the server message', async () => {
  const out = await kirimOrder({}, async () => respons(400, { error: 'Pilihan tidak valid' }), async () => {});
  expect(out).toEqual({ ok: false, error: 'Pilihan tidak valid' });
});
