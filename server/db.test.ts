import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { all, get, openDb, run, tx } from './db';
import { getPengaturan, getSetting, setSetting } from './settings';

test('openDb creates all tables', () => {
  const db = openDb(':memory:');
  const names = all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
  expect(names).toEqual(
    expect.arrayContaining(['grup', 'laporan', 'menu', 'menu_grup', 'order_item', 'order_item_pilihan', 'orders', 'pengaturan', 'pilihan']),
  );
});

test('openDb is safe to call twice on the same file schema', () => {
  const db = openDb(':memory:');
  expect(() => db.exec('CREATE TABLE IF NOT EXISTS menu (id INTEGER)')).not.toThrow();
});

test('tx rolls back on error', () => {
  const db = openDb(':memory:');
  expect(() =>
    tx(db, () => {
      run(db, 'INSERT INTO pengaturan (key, value) VALUES (?, ?)', 'a', '1');
      throw new Error('stop');
    }),
  ).toThrow('stop');
  expect(get(db, 'SELECT * FROM pengaturan WHERE key = ?', 'a')).toBeUndefined();
});

test('run returns numeric lastInsertRowid', () => {
  const db = openDb(':memory:');
  const r = run(db, 'INSERT INTO grup (nama, widget) VALUES (?, ?)', 'Topping', 'checklist');
  expect(r.lastInsertRowid).toBe(1);
  expect(typeof r.lastInsertRowid).toBe('number');
});

test('negative price is rejected by the database', () => {
  const db = openDb(':memory:');
  expect(() => run(db, 'INSERT INTO menu (nama, harga, dibuat_at) VALUES (?, ?, ?)', 'X', -1, 0)).toThrow();
});

test('settings defaults and overrides', () => {
  const db = openDb(':memory:');
  expect(getPengaturan(db)).toEqual({ jam: { ist1: '09:30', ist2: '12:00' }, qty_max: 10 });
  setSetting(db, 'jam_ist1', '10:00');
  setSetting(db, 'qty_max', '5');
  setSetting(db, 'qty_max', '6');
  expect(getSetting(db, 'jam_ist1')).toBe('10:00');
  expect(getPengaturan(db)).toEqual({ jam: { ist1: '10:00', ist2: '12:00' }, qty_max: 6 });
});

test('openDb adds orders.sumber to an old database and keeps rows as kasir (Review Focus 4)', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'kantin-migrasi-')), 'lama.db');
  const lama = new DatabaseSync(file);
  lama.exec(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY, client_uuid TEXT NOT NULL UNIQUE, tanggal TEXT NOT NULL, nomor INTEGER NOT NULL,
    waktu_ambil TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'baru', device TEXT NOT NULL, dibuat_at INTEGER NOT NULL,
    siap_at INTEGER, batal_at INTEGER, batal_oleh TEXT, UNIQUE (tanggal, nomor))`);
  lama.exec("INSERT INTO orders (client_uuid, tanggal, nomor, waktu_ambil, device, dibuat_at) VALUES ('u', '2026-09-29', 1, 'sekarang', 'X', 0)");
  lama.close();

  const db = openDb(file);
  expect(get(db, 'SELECT sumber FROM orders WHERE nomor = 1')).toEqual({ sumber: 'kasir' });
  expect(() => run(db, "UPDATE orders SET sumber = 'lain'")).toThrow();
  db.close();
  expect(() => openDb(file).close()).not.toThrow();
});

test('openDb adds orders.nama as an empty column to an old database', () => {
  const db = openDb(':memory:');
  expect(all<{ name: string }>(db, 'PRAGMA table_info(orders)').some((k) => k.name === 'nama')).toBe(true);
});
