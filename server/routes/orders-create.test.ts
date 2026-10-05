import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { get, run } from '../db';
import { setSetting } from '../settings';
import { ambilOrder } from '../order-repo';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

type Item = { menu_id: number; qty: number; pilihan_ids: number[] };
const body = (items: Item[], extra: Record<string, unknown> = {}) => ({
  client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', items, ...extra,
});

function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const kirim = (b: object) => request(t.app).post('/api/orders').send(b);
  // Multi-portion orders only come in through QR, so rules about several items are checked there.
  setSetting(t.db, 'qr_alamat', 'https://kantin.test.ts.net');
  setSetting(t.db, 'qr_kode', 'kode-uji-1234');
  setSetting(t.db, 'qr_buka', '1');
  const kirimQr = (b: object) => request(t.app).post('/api/qr/kode-uji-1234/orders').send({ nama: 'Budi', ...b });
  return { ...t, s, kirim, kirimQr };
}

test('creates order with number 1, default options and server-side total', async () => {
  const { kirim, s, db, events } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.pedas[3], s.telur] }]));

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ nomor: 1, total: 12000, dibuat_at: PAGI });
  expect(events).toContainEqual({ type: 'orders-changed' });

  const order = ambilOrder(db, res.body.id)!;
  expect(order.status).toBe('baru');
  expect(order.items[0].pilihan.map((p) => `${p.grup}:${p.label}:${p.harga}`)).toEqual([
    'Kepedasan:3:0',
    'Ukuran:Kecil:0',
    'Topping:Telur:2000',
  ]);
});

test('numbers increase and reset the next day', async () => {
  const { kirim, s, clock } = setup();
  const item = [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }];
  expect((await kirim(body(item))).body.nomor).toBe(1);
  expect((await kirim(body(item))).body.nomor).toBe(2);
  clock.maju(24 * 3600_000);
  expect((await kirim(body(item))).body.nomor).toBe(1);
});

test('20 parallel orders get unique numbers 1..20', async () => {
  const { kirim, s } = setup();
  const res = await Promise.all(
    Array.from({ length: 20 }, () => kirim(body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]))),
  );
  expect(res.every((r) => r.status === 201)).toBe(true);
  expect(res.map((r) => r.body.nomor).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
});

test('same client_uuid returns the original order, even the next day', async () => {
  const { kirim, s, clock } = setup();
  const b = body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]);
  const first = await kirim(b);
  clock.maju(24 * 3600_000);
  const again = await kirim(b);
  expect(again.status).toBe(200);
  expect(again.body).toEqual(first.body);
});

test('sold out menu returns 409 with the list and creates nothing', async () => {
  const { kirimQr, s, db } = setup();
  run(db, 'UPDATE menu SET tersedia = 0 WHERE id = ?', s.esTeh);
  const res = await kirimQr(body([
    { menu_id: s.mie, qty: 1, pilihan_ids: [] },
    { menu_id: s.esTeh, qty: 1, pilihan_ids: [] },
    { menu_id: s.nasi, qty: 1, pilihan_ids: [] },
  ]));
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('Menu habis');
  expect(res.body.habis).toEqual([
    { menu_id: s.esTeh, nama: 'Es Teh' },
    { menu_id: s.nasi, nama: 'Nasi Goreng' },
  ]);
  expect(get(db, 'SELECT COUNT(*) AS n FROM orders')).toEqual({ n: 0 });
});

test('deleted menu counts as sold out', async () => {
  const { kirim, s, db } = setup();
  run(db, 'UPDATE menu SET dihapus_at = 1 WHERE id = ?', s.esTeh);
  const res = await kirim(body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]));
  expect(res.status).toBe(409);
});

test('qty above qty_max is 400', async () => {
  const { kirimQr, s } = setup();
  const res = await kirimQr(body([{ menu_id: s.esTeh, qty: 11, pilihan_ids: [] }]));
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Maksimal 10 per menu');
});

test('option from a group not attached to the menu is 400 (Review Focus 1)', async () => {
  const { kirim, s } = setup();
  expect((await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.lepas] }]))).status).toBe(400);
  expect((await kirim(body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [s.telur] }]))).status).toBe(400);
});

test('two choices in a stepper group is 400', async () => {
  const { kirim, s } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.pedas[1], s.pedas[2]] }]));
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Pilih satu Kepedasan');
});

test('duplicate option id is charged once (Review Focus 2)', async () => {
  const { kirim, s } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.telur, s.telur] }]));
  expect(res.status).toBe(201);
  expect(res.body.total).toBe(12000);
});

test('price uses snapshot: later price change does not change the order', async () => {
  const { kirim, s, db } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.ukuran.besar] }]));
  run(db, 'UPDATE menu SET harga = 99999 WHERE id = ?', s.mie);
  run(db, 'UPDATE pilihan SET harga = 99999 WHERE id = ?', s.ukuran.besar);
  const order = ambilOrder(db, res.body.id)!;
  expect(order.items[0].harga).toBe(10000);
  expect(order.items[0].pilihan.find((p) => p.label === 'Besar')!.harga).toBe(3000);
});

test('invalid body is 400', async () => {
  const { kirim } = setup();
  expect((await kirim({ client_uuid: 'x', items: [] })).status).toBe(400);
});

test('response carries the status, so a retry of an order the kitchen cancelled says so', async () => {
  const { kirim, s, app } = setup();
  const b = body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]);
  const first = await kirim(b);
  expect(first.body.status).toBe('baru');
  const dapur = await login(app, 'dapur');
  await request(app).post(`/api/orders/${first.body.id}/batal`).set({ Authorization: `Bearer ${dapur}` });
  const again = await kirim(b);
  expect(again.status).toBe(200);
  expect(again.body.status).toBe('batal');
});

test('counter phones take exactly one portion per order; QR orders are not limited', async () => {
  const { kirim, kirimQr, s, db } = setup();
  const satu = { menu_id: s.esTeh, qty: 1, pilihan_ids: [] };
  for (const items of [[{ ...satu, qty: 2 }], [satu, satu], [satu, { menu_id: s.mie, qty: 1, pilihan_ids: [] }]]) {
    const res = await kirim(body(items));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Meja depan hanya 1 porsi per order');
  }
  expect((await kirim(body([satu]))).status).toBe(201);
  expect(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM orders')!.n).toBe(1);

  const qr = await kirimQr(body([{ ...satu, qty: 2 }, { menu_id: s.mie, qty: 1, pilihan_ids: [] }]));
  expect(qr.status).toBe(201);
});
