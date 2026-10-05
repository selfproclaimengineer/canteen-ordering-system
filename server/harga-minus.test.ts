import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pilihanSchema } from '../shared/schemas';
import { all, get, openDb, run } from './db';
import { buatTestApp, login, PAGI, seedMenu } from './testing';

test('openDb rebuilds an old pilihan table so option prices may be negative, keeping ids and links', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'kantin-minus-')), 'lama.db');
  const lama = new DatabaseSync(file);
  lama.exec(`CREATE TABLE grup (id INTEGER PRIMARY KEY, nama TEXT NOT NULL, widget TEXT NOT NULL, urutan INTEGER NOT NULL DEFAULT 0, dihapus_at INTEGER);
    CREATE TABLE pilihan (id INTEGER PRIMARY KEY, grup_id INTEGER NOT NULL REFERENCES grup(id), label TEXT NOT NULL,
      harga INTEGER NOT NULL DEFAULT 0 CHECK (harga >= 0), urutan INTEGER NOT NULL DEFAULT 0, dihapus_at INTEGER);
    INSERT INTO grup (id, nama, widget) VALUES (1, 'Porsi', 'option');
    INSERT INTO pilihan (id, grup_id, label, harga) VALUES (7, 1, 'Jumbo', 5000);`);
  lama.close();

  const db = openDb(file);
  expect(get(db, 'SELECT id, label, harga FROM pilihan')).toEqual({ id: 7, label: 'Jumbo', harga: 5000 });
  run(db, "INSERT INTO pilihan (grup_id, label, harga) VALUES (1, '½ porsi', -2000)");
  expect(all(db, 'PRAGMA foreign_key_check')).toEqual([]);
  expect(() => run(db, "INSERT INTO pilihan (grup_id, label) VALUES (99, 'x')")).toThrow();
  db.close();
  expect(() => openDb(file).close()).not.toThrow();
});

test('schema accepts a discount option', () => {
  expect(pilihanSchema.parse({ grup_id: 1, label: '½ porsi', harga: -2000 }).harga).toBe(-2000);
});

describe('orders with a discount option', () => {
  async function setup() {
    const t = buatTestApp();
    const s = seedMenu(t.db, PAGI);
    const admin = { Authorization: `Bearer ${await login(t.app, 'admin')}` };
    const dapur = { Authorization: `Bearer ${await login(t.app, 'dapur')}` };
    const tambah = async (label: string, harga: number) =>
      (await request(t.app).post('/api/admin/pilihan').set(admin).send({ grup_id: s.grupUkuran, label, harga })).body.id as number;
    const pesan = (pilihan_ids: number[]) =>
      request(t.app).post('/api/orders').send({ client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', items: [{ menu_id: s.mie, qty: 1, pilihan_ids }] });
    return { ...t, s, admin, dapur, tambah, pesan };
  }

  test('lowers the price, and the report shows the discount so totals match', async () => {
    const { app, admin, dapur, tambah, pesan } = await setup();
    const setengah = await tambah('½ porsi', -2000);
    const res = await pesan([setengah]);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(8000);
    await request(app).post(`/api/orders/${res.body.id}/siap`).set(dapur);

    const lap = (await request(app).get('/api/admin/laporan/2026-09-29').set(admin)).body.laporan;
    expect(lap.topping).toEqual([{ nama: 'Ukuran: ½ porsi', harga: -2000, qty: 1, total: -2000 }]);
    expect(lap.pemasukan).toBe(8000);
  });

  test('an item can never cost less than zero', async () => {
    const { tambah, pesan, db } = await setup();
    const terlalu = await tambah('Gratis banget', -20000);
    const res = await pesan([terlalu]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Harga Mie Goreng jadi minus');
    expect(get(db, 'SELECT COUNT(*) AS n FROM orders')).toEqual({ n: 0 });
  });
});
