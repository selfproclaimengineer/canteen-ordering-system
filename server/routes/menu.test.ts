import request from 'supertest';
import { run } from '../db';
import { buatTestApp, PAGI, seedMenu } from '../testing';

test('GET /api/menu returns menu, groups, options and settings', async () => {
  const { app, db } = buatTestApp();
  const s = seedMenu(db, PAGI);

  const res = await request(app).get('/api/menu');

  expect(res.status).toBe(200);
  expect(res.body.server_now).toBe(PAGI);
  expect(res.body.jam).toEqual({ ist1: '09:30', ist2: '12:00' });
  expect(res.body.qty_max).toBe(10);
  expect(res.body.waktu_tersedia).toEqual(['sekarang', 'ist1', 'ist2']);
  expect(res.body.menu.map((m: { nama: string }) => m.nama)).toEqual(['Mie Goreng', 'Es Teh', 'Nasi Goreng']);

  const mie = res.body.menu[0];
  expect(mie).toMatchObject({ id: s.mie, harga: 10000, tersedia: true, baru: true });
  expect(mie.grup.map((g: { nama: string }) => g.nama)).toEqual(['Kepedasan', 'Ukuran', 'Topping']);
  expect(mie.grup[0].pilihan.map((p: { label: string }) => p.label)).toEqual(['0', '1', '2', '3', '4', '5']);
  expect(res.body.menu[1].grup).toEqual([]);
  expect(res.body.menu[2].tersedia).toBe(false);
});

test('deleted menu, group and option are hidden', async () => {
  const { app, db } = buatTestApp();
  const s = seedMenu(db, PAGI);
  run(db, 'UPDATE menu SET dihapus_at = 1 WHERE id = ?', s.esTeh);
  run(db, 'UPDATE grup SET dihapus_at = 1 WHERE id = ?', s.grupUkuran);
  run(db, 'UPDATE pilihan SET dihapus_at = 1 WHERE id = ?', s.keju);

  const res = await request(app).get('/api/menu');
  const nama = res.body.menu.map((m: { nama: string }) => m.nama);
  expect(nama).not.toContain('Es Teh');
  const mie = res.body.menu[0];
  expect(mie.grup.map((g: { nama: string }) => g.nama)).toEqual(['Kepedasan', 'Topping']);
  expect(mie.grup[1].pilihan.map((p: { label: string }) => p.label)).toEqual(['Telur', 'Bawang']);
});

test('menu older than 3 days is not baru', async () => {
  const { app, db } = buatTestApp();
  seedMenu(db, PAGI - 4 * 24 * 3600_000);
  const res = await request(app).get('/api/menu');
  expect(res.body.menu[0].baru).toBe(false);
});
