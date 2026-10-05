import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { rentangTanggal } from '../laporan-repo';
import { buatOrder } from '../order-repo';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const admin = { Authorization: `Bearer ${await login(t.app, 'admin')}` };
  const dapur = { Authorization: `Bearer ${await login(t.app, 'dapur')}` };
  // Reports do not care how an order came in; QR orders may hold several portions.
  const pesan = async (items: { menu_id: number; qty: number; pilihan_ids: number[] }[]) =>
    buatOrder(t.db, { client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'QR', items }, t.clock.now(), 10, 'qr', 'Budi').order.id;
  const siap = (id: number) => request(t.app).post(`/api/orders/${id}/siap`).set(dapur);
  return { ...t, s, admin, dapur, pesan, siap };
}

test('live report counts siap orders only', async () => {
  const { app, s, admin, pesan, siap } = await setup();
  const a = await pesan([{ menu_id: s.mie, qty: 2, pilihan_ids: [s.telur] }]);
  await pesan([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]);
  await siap(a);

  const res = await request(app).get('/api/admin/laporan/2026-09-29').set(admin);
  expect(res.status).toBe(200);
  expect(res.body.disimpan_at).toBeNull();
  expect(res.body.laporan).toMatchObject({
    menu: [{ nama: 'Mie Goreng', harga: 10000, qty: 2, total: 20000 }],
    topping: [{ nama: 'Topping: Telur', harga: 2000, qty: 2, total: 4000 }],
    pemasukan: 24000,
    pengeluaran: 0,
    keuntungan: 24000,
  });
});

test('save freezes the report with expenses and appears in the list', async () => {
  const { app, s, admin, pesan, siap, clock } = await setup();
  await siap(await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }]));

  const saved = await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: 2500 });
  expect(saved.body.laporan).toMatchObject({ pemasukan: 6000, pengeluaran: 2500, keuntungan: 3500 });
  expect(saved.body.disimpan_at).toBe(clock.t);

  const list = await request(app).get('/api/admin/laporan').set(admin);
  expect(list.body).toEqual([{ tanggal: '2026-09-29', pemasukan: 6000, pengeluaran: 2500, keuntungan: 3500, disimpan_at: clock.t }]);
});

test("today's saved report stays live and keeps the saved expenses (spec 11)", async () => {
  const { app, s, admin, pesan, siap } = await setup();
  await siap(await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }]));
  await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: 2500 });

  await siap(await pesan([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]));
  const res = await request(app).get('/api/admin/laporan/2026-09-29').set(admin);
  expect(res.body.laporan).toMatchObject({ pemasukan: 9000, pengeluaran: 2500, keuntungan: 6500 });
  expect(res.body.disimpan_at).not.toBeNull();
});

test('a past day keeps its saved snapshot', async () => {
  const { app, s, admin, dapur, pesan, siap, clock } = await setup();
  const id = await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }]);
  await siap(id);
  await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: 1000 });
  clock.maju(24 * 3600_000);
  const dapur2 = { Authorization: `Bearer ${await login(app, 'dapur')}` };
  const admin2 = { Authorization: `Bearer ${await login(app, 'admin')}` };
  await request(app).post(`/api/orders/${id}/batal`).set(dapur2);
  const res = await request(app).get('/api/admin/laporan/2026-09-29').set(admin2);
  expect(res.body.laporan).toMatchObject({ pemasukan: 6000, pengeluaran: 1000 });
});

test('deleted menu and price change keep old report values (Review Focus 4)', async () => {
  const { app, s, admin, pesan, siap } = await setup();
  await siap(await pesan([{ menu_id: s.mie, qty: 1, pilihan_ids: [] }]));
  await request(app).put(`/api/admin/menu/${s.mie}`).set(admin).send({ nama: 'Mie Baru', harga: 50000 });
  await request(app).post('/api/admin/menu/hapus').set(admin).send({ ids: [s.mie] });

  const res = await request(app).get('/api/admin/laporan/2026-09-29').set(admin);
  expect(res.body.laporan.menu).toEqual([{ nama: 'Mie Goreng', harga: 10000, qty: 1, total: 10000 }]);
});

test('invalid date and negative expenses are 400', async () => {
  const { app, admin } = await setup();
  expect((await request(app).get('/api/admin/laporan/29-09-2026').set(admin)).status).toBe(400);
  expect((await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: -1 })).status).toBe(400);
});

test('CSV export covers the range with BOM and ; separator', async () => {
  const { app, s, admin, dapur, pesan, clock } = await setup();
  const siap = (id: number) => request(app).post(`/api/orders/${id}/siap`).set(dapur);
  await siap(await pesan([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]));
  await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: 1000 });
  clock.maju(24 * 3600_000);
  // Tokens from setup expired after 24 h; log in again.
  const admin2 = { Authorization: `Bearer ${await login(app, 'admin')}` };
  const dapur2 = { Authorization: `Bearer ${await login(app, 'dapur')}` };
  await request(app).post(`/api/orders/${await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }])}/siap`).set(dapur2);

  const res = await request(app).get('/api/admin/laporan.csv?dari=2026-09-29&sampai=2026-09-30').set(admin2);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
  expect(res.headers['content-disposition']).toBe('attachment; filename="laporan_2026-09-29_2026-09-30.csv"');
  const lines = res.text.split('\r\n');
  expect(lines[0]).toBe('﻿tanggal;jenis;nama;harga;qty;total');
  expect(lines).toContain('2026-09-29;menu;Es Teh;3000;1;3000');
  expect(lines).toContain('2026-09-29;keuntungan;;;;2000');
  expect(lines).toContain('2026-09-30;menu;Es Teh;3000;2;6000');
});

test('rentangTanggal is inclusive and bounded', () => {
  expect(rentangTanggal('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  expect(() => rentangTanggal('2026-03-02', '2026-03-01')).toThrow('Rentang tanggal tidak valid');
  expect(() => rentangTanggal('2025-01-01', '2026-03-01')).toThrow('Maksimal 366 hari');
});

test('trend endpoint returns per-day series for the range', async () => {
  const { app, s, admin, pesan, siap, clock } = await setup();
  await siap(await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }]));
  clock.maju(24 * 3600_000);
  const dapur2 = { Authorization: `Bearer ${await login(app, 'dapur')}` };
  const admin2 = { Authorization: `Bearer ${await login(app, 'admin')}` };
  const id = await pesan([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.telur] }]);
  await request(app).post(`/api/orders/${id}/siap`).set(dapur2);
  void admin;

  const res = await request(app).get('/api/admin/tren?dari=2026-09-29&sampai=2026-09-30').set(admin2);
  expect(res.status).toBe(200);
  expect(res.body.tanggal).toEqual(['2026-09-29', '2026-09-30']);
  expect(res.body.pemasukan).toEqual([6000, 12000]);
  expect(res.body.menu).toEqual([
    { nama: 'Es Teh', qty: [2, 0], total: 2 },
    { nama: 'Mie Goreng', qty: [0, 1], total: 1 },
  ]);
  expect(res.body.topping).toEqual([{ nama: 'Topping: Telur', qty: [0, 1], total: 1 }]);
  expect((await request(app).get('/api/admin/tren?dari=2026-09-30&sampai=2026-09-29').set(admin2)).status).toBe(400);
});
