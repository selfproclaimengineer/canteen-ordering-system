import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { buatOrder } from '../order-repo';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const dapur = await login(t.app, 'dapur');
  const auth = { Authorization: `Bearer ${dapur}` };
  const pesan = async (waktu_ambil = 'sekarang', items = [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] as number[] }]) => {
    const client_uuid = randomUUID();
    const res = await request(t.app).post('/api/orders').send({ client_uuid, waktu_ambil, device: 'Order 1', items });
    return { id: res.body.id as number, nomor: res.body.nomor as number, client_uuid };
  };
  const post = (path: string, body: object = {}) => request(t.app).post(path).set(auth).send(body);
  const list = (tab: string) => request(t.app).get(`/api/orders?tab=${tab}`).set(auth);
  return { ...t, s, auth, pesan, post, list };
}

describe('customer cancel', () => {
  test('allowed within 10 s with matching client_uuid', async () => {
    const { app, pesan, clock } = await setup();
    const o = await pesan();
    clock.maju(10_000);
    const res = await request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: o.client_uuid });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'batal', batal_oleh: 'pelanggan' });
  });

  test('refused after 10 s', async () => {
    const { app, pesan, clock } = await setup();
    const o = await pesan();
    clock.maju(10_001);
    const res = await request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: o.client_uuid });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Batas waktu batal lewat');
  });

  test('wrong client_uuid is 404', async () => {
    const { app, pesan } = await setup();
    const o = await pesan();
    const res = await request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: randomUUID() });
    expect(res.status).toBe(404);
  });
});

describe('kitchen auth', () => {
  test('no token is 401', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/orders?tab=sekarang')).status).toBe(401);
  });

  test('admin token also works', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin');
    expect((await request(app).get('/api/orders?tab=sekarang').set({ Authorization: `Bearer ${admin}` })).status).toBe(200);
  });

  test('invalid tab is 400', async () => {
    const { list } = await setup();
    expect((await list('besok')).status).toBe(400);
  });
});

describe('kitchen flow', () => {
  test('siap, undo within 30 s, undo refused after 30 s', async () => {
    const { pesan, post, clock, events } = await setup();
    const o = await pesan();
    events.length = 0;

    const siap = await post(`/api/orders/${o.id}/siap`);
    expect(siap.status).toBe(200);
    expect(siap.body).toMatchObject({ status: 'siap', siap_at: clock.t });
    expect(events).toEqual([{ type: 'orders-changed' }, { type: 'siap-changed' }]);
    // A double tap on Siap is harmless: same order back, no second event.
    events.length = 0;
    const lagi = await post(`/api/orders/${o.id}/siap`);
    expect(lagi.status).toBe(200);
    expect(lagi.body).toMatchObject({ status: 'siap', siap_at: siap.body.siap_at });
    expect(events).toEqual([]);

    clock.maju(30_000);
    const undo = await post(`/api/orders/${o.id}/undo-siap`);
    expect(undo.body).toMatchObject({ status: 'baru', siap_at: null });

    await post(`/api/orders/${o.id}/siap`);
    clock.maju(30_001);
    const late = await post(`/api/orders/${o.id}/undo-siap`);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('Batas waktu urungkan lewat');
  });

  test('kitchen can cancel a siap order; a double tap on Batal is harmless; Siap on a cancelled order is 409', async () => {
    const { pesan, post } = await setup();
    const o = await pesan();
    await post(`/api/orders/${o.id}/siap`);
    const batal = await post(`/api/orders/${o.id}/batal`);
    expect(batal.body).toMatchObject({ status: 'batal', batal_oleh: 'dapur' });
    const lagi = await post(`/api/orders/${o.id}/batal`);
    expect(lagi.status).toBe(200);
    expect(lagi.body.batal_at).toBe(batal.body.batal_at);
    expect((await post(`/api/orders/${o.id}/siap`)).status).toBe(409);
  });

  test('cancelling the last active item cancels the order', async () => {
    const { post, s, db, clock } = await setup();
    // Several items in one order only come from QR now; the counter takes one portion.
    const items = [
      { menu_id: s.esTeh, qty: 1, pilihan_ids: [] },
      { menu_id: s.mie, qty: 1, pilihan_ids: [] },
    ];
    const o = buatOrder(db, { client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'QR', items }, clock.now(), 10, 'qr', 'Budi').order;
    const first = await post(`/api/orders/${o.id}/siap`);
    const [a, b] = first.body.items;

    const r1 = await post(`/api/items/${a.id}/batal`);
    expect(r1.body.status).toBe('siap');
    expect(r1.body.items[0].batal_at).not.toBeNull();
    expect((await post(`/api/items/${a.id}/batal`)).status).toBe(409);

    const r2 = await post(`/api/items/${b.id}/batal`);
    expect(r2.body).toMatchObject({ status: 'batal', batal_oleh: 'dapur' });
  });

  test('unknown order and item are 404', async () => {
    const { post } = await setup();
    expect((await post('/api/orders/999/siap')).status).toBe(404);
    expect((await post('/api/items/999/batal')).status).toBe(404);
  });
});

describe('kitchen tabs', () => {
  test('break orders are held, then move to sekarang 10 minutes before the break', async () => {
    const { pesan, list, clock } = await setup();
    const a = await pesan('sekarang');
    clock.maju(1000);
    const b = await pesan('ist1');
    const c = await pesan('ist2');

    const now = await list('sekarang');
    expect(now.body.orders.map((o: { id: number }) => o.id)).toEqual([a.id]);
    expect(now.body.jumlah).toEqual({ sekarang: 1, ist1: 1, ist2: 1 });
    expect(now.body.orders[0].total).toBe(3000);
    expect((await list('ist1')).body.orders.map((o: { id: number }) => o.id)).toEqual([b.id]);

    clock.t = new Date(2026, 8, 29, 9, 20).getTime();
    const later = await list('sekarang');
    expect(later.body.orders.map((o: { id: number }) => o.id)).toEqual([a.id, b.id]);
    expect(later.body.jumlah).toEqual({ sekarang: 2, ist1: 0, ist2: 1 });
    expect((await list('ist2')).body.orders[0].id).toBe(c.id);
  });

  test('selesai lists siap and batal, newest first', async () => {
    const { pesan, post, list, clock } = await setup();
    const a = await pesan();
    const b = await pesan();
    await post(`/api/orders/${a.id}/siap`);
    clock.maju(1000);
    await post(`/api/orders/${b.id}/batal`);
    const res = await list('selesai');
    expect(res.body.orders.map((o: { id: number }) => o.id)).toEqual([b.id, a.id]);
    expect(res.body.jumlah).toEqual({ sekarang: 0, ist1: 0, ist2: 0 });
  });

  test('yesterday orders are not listed', async () => {
    const { app, pesan, clock } = await setup();
    await pesan();
    clock.maju(24 * 3600_000);
    // The 12 h kitchen token from setup has expired by now; log in again.
    const token = await login(app, 'dapur');
    const res = await request(app).get('/api/orders?tab=sekarang').set({ Authorization: `Bearer ${token}` });
    expect(res.body.orders).toEqual([]);
  });
});

test('GET /api/siap lists siap numbers for 5 minutes', async () => {
  const { app, pesan, post, clock } = await setup();
  const a = await pesan();
  const b = await pesan();
  const c = await pesan();
  await post(`/api/orders/${b.id}/siap`);
  await post(`/api/orders/${a.id}/siap`);
  clock.maju(60_000);
  await post(`/api/orders/${c.id}/siap`);

  expect((await request(app).get('/api/siap')).body).toEqual({ nomor: [a.nomor, b.nomor, c.nomor] });
  clock.maju(4 * 60_000 + 1);
  expect((await request(app).get('/api/siap')).body).toEqual({ nomor: [c.nomor] });
});

test('customer cancel retried after success returns 200 (lost response on flaky WiFi)', async () => {
  const { app, pesan, clock } = await setup();
  const o = await pesan();
  const batal = () => request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: o.client_uuid });
  expect((await batal()).status).toBe(200);
  clock.maju(30_000);
  const again = await batal();
  expect(again.status).toBe(200);
  expect(again.body).toMatchObject({ status: 'batal', batal_oleh: 'pelanggan' });
});
