import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { setSetting } from '../settings';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

const KODE = 'KodeRahasia1234567890a';
const publik = { 'Tailscale-Funnel-Request': '?1', 'X-Forwarded-For': '114.10.1.1' };

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  setSetting(t.db, 'qr_alamat', 'https://kantin.test.ts.net');
  setSetting(t.db, 'qr_kode', KODE);
  setSetting(t.db, 'qr_buka', '1');
  const dapur = { Authorization: `Bearer ${await login(t.app, 'dapur')}` };
  const admin = { Authorization: `Bearer ${await login(t.app, 'admin')}` };
  const pesanQr = async (extra: Record<string, unknown> = {}) =>
    request(t.app)
      .post(`/api/qr/${KODE}/orders`)
      .send({
        client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: `QR-${randomUUID().slice(0, 8)}`, nama: 'Budi',
        items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }, { menu_id: s.mie, qty: 1, pilihan_ids: [] }],
        ...extra,
      });
  const daftar = async () => (await request(t.app).get('/api/orders?tab=sekarang').set(dapur)).body.orders;
  return { ...t, s, dapur, admin, pesanQr, daftar };
}

describe('per-item checklist', () => {
  test('ticking every active item makes the order siap; unticking is allowed before that', async () => {
    const { app, dapur, pesanQr, events } = await setup();
    const id = (await pesanQr()).body.id as number;
    const centang = (itemId: number, siap: boolean) => request(app).post(`/api/items/${itemId}/centang`).set(dapur).send({ siap });
    const ambil = async () => (await request(app).get('/api/orders?tab=sekarang').set(dapur)).body.orders.find((o: { id: number }) => o.id === id);
    const [a, b] = (await ambil()).items;

    const r1 = await centang(a.id, true);
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('baru');
    expect(r1.body.items[0].siap_at).not.toBeNull();
    expect((await centang(a.id, false)).body.items[0].siap_at).toBeNull();

    await centang(a.id, true);
    events.length = 0;
    const r2 = await centang(b.id, true);
    expect(r2.body.status).toBe('siap');
    expect(events).toContainEqual({ type: 'siap-changed' });
    expect((await centang(a.id, false)).status).toBe(409);
  });

  test('cancelling the last unticked item makes the order siap; cancelled items cannot be ticked', async () => {
    const { app, dapur, pesanQr } = await setup();
    const id = (await pesanQr()).body.id as number;
    const order = (await request(app).post(`/api/items/9999/centang`).set(dapur).send({ siap: true }));
    expect(order.status).toBe(404);
    const list = (await request(app).get('/api/orders?tab=sekarang').set(dapur)).body.orders;
    const [a, b] = list.find((o: { id: number }) => o.id === id).items;
    await request(app).post(`/api/items/${a.id}/centang`).set(dapur).send({ siap: true });
    const r = await request(app).post(`/api/items/${b.id}/batal`).set(dapur);
    expect(r.body.status).toBe('siap');
    expect((await request(app).post(`/api/items/${b.id}/centang`).set(dapur).send({ siap: true })).status).toBe(409);
  });

  test('needs the kitchen PIN and is hidden from QR customers', async () => {
    const { app, pesanQr } = await setup();
    const o = await pesanQr();
    expect((await request(app).post('/api/items/1/centang').send({ siap: true })).status).toBe(401);
    expect((await request(app).post('/api/items/1/centang').set(publik).send({ siap: true })).status).toBe(404);
    const status = await request(app).get(`/api/qr/${KODE}/orders/${o.body.id}?uuid=${randomUUID()}`);
    expect(status.body.items).toBeUndefined();
  });
});

describe('QR note', () => {
  test('is stored with a QR order and shown to the kitchen', async () => {
    const { pesanQr, daftar } = await setup();
    expect((await pesanQr({ catatan: '  sambal dipisah ' })).status).toBe(201);
    expect((await daftar())[0].catatan).toBe('sambal dipisah');
    expect((await pesanQr({ catatan: 'x'.repeat(61) })).status).toBe(400);
  });

  test('is dropped from counter orders', async () => {
    const { app, s, daftar } = await setup();
    await request(app).post('/api/orders').send({
      client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', catatan: 'halo',
      items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }],
    });
    expect((await daftar())[0].catatan).toBeNull();
  });
});

describe('notification sounds', () => {
  const MP3 = Buffer.from([0x49, 0x44, 0x33, 1, 2, 3, 4, 5]);

  test('admin uploads, everyone (also QR over the public URL) can play, admin resets', async () => {
    const { app, admin, events } = await setup();
    expect((await request(app).get('/api/suara')).body).toEqual({ masuk: null, jadi: null });

    const up = await request(app).put('/api/admin/suara/jadi').set(admin).set('Content-Type', 'audio/mpeg').send(MP3);
    expect(up.status).toBe(200);
    expect(events).toContainEqual({ type: 'menu-changed' });
    const meta = (await request(app).get('/api/suara').set(publik)).body;
    expect(meta.masuk).toBeNull();
    expect(typeof meta.jadi).toBe('number');

    const file = await request(app).get('/api/suara/jadi').set(publik);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('audio/mpeg');
    expect(Buffer.from(file.body)).toEqual(MP3);
    expect((await request(app).get('/api/suara/masuk')).status).toBe(404);

    expect((await request(app).delete('/api/admin/suara/jadi').set(admin)).status).toBe(200);
    expect((await request(app).get('/api/suara')).body.jadi).toBeNull();
  });

  test('rejects non-audio, big files, unknown slots and non-admins', async () => {
    const { app, admin } = await setup();
    const put = (jenis: string, type: string, body: Buffer) => request(app).put(`/api/admin/suara/${jenis}`).set(admin).set('Content-Type', type).send(body);
    expect((await put('jadi', 'text/html', MP3)).status).toBe(415);
    expect((await put('jadi', 'audio/mpeg', Buffer.alloc(1024 * 1024 + 1))).status).toBe(413);
    expect((await put('lain', 'audio/mpeg', MP3)).status).toBe(400);
    expect((await request(app).put('/api/admin/suara/jadi').set('Content-Type', 'audio/mpeg').send(MP3)).status).toBe(401);
  });
});
