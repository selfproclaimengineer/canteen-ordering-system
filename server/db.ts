import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS menu (
  id INTEGER PRIMARY KEY,
  nama TEXT NOT NULL,
  harga INTEGER NOT NULL CHECK (harga >= 0),
  tersedia INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  dibuat_at INTEGER NOT NULL,
  dihapus_at INTEGER
);
CREATE TABLE IF NOT EXISTS grup (
  id INTEGER PRIMARY KEY,
  nama TEXT NOT NULL,
  widget TEXT NOT NULL CHECK (widget IN ('stepper', 'option', 'checklist')),
  urutan INTEGER NOT NULL DEFAULT 0,
  dihapus_at INTEGER
);
CREATE TABLE IF NOT EXISTS pilihan (
  id INTEGER PRIMARY KEY,
  grup_id INTEGER NOT NULL REFERENCES grup(id),
  label TEXT NOT NULL,
  -- Negative = discount, e.g. "½ porsi -2000". Orders still never go below zero per item.
  harga INTEGER NOT NULL DEFAULT 0,
  urutan INTEGER NOT NULL DEFAULT 0,
  dihapus_at INTEGER
);
CREATE TABLE IF NOT EXISTS menu_grup (
  menu_id INTEGER NOT NULL REFERENCES menu(id),
  grup_id INTEGER NOT NULL REFERENCES grup(id),
  urutan INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_id, grup_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  client_uuid TEXT NOT NULL UNIQUE,
  tanggal TEXT NOT NULL,
  nomor INTEGER NOT NULL,
  waktu_ambil TEXT NOT NULL CHECK (waktu_ambil IN ('sekarang', 'ist1', 'ist2')),
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'siap', 'batal')),
  device TEXT NOT NULL,
  dibuat_at INTEGER NOT NULL,
  siap_at INTEGER,
  batal_at INTEGER,
  batal_oleh TEXT CHECK (batal_oleh IN ('pelanggan', 'dapur')),
  UNIQUE (tanggal, nomor)
);
CREATE TABLE IF NOT EXISTS order_item (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_id INTEGER NOT NULL REFERENCES menu(id),
  nama TEXT NOT NULL,
  harga INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  batal_at INTEGER
);
CREATE TABLE IF NOT EXISTS order_item_pilihan (
  item_id INTEGER NOT NULL REFERENCES order_item(id),
  pilihan_id INTEGER NOT NULL REFERENCES pilihan(id),
  grup TEXT NOT NULL,
  label TEXT NOT NULL,
  harga INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pengaturan (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS laporan (
  tanggal TEXT PRIMARY KEY,
  pengeluaran INTEGER NOT NULL,
  isi_json TEXT NOT NULL,
  disimpan_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS suara (
  jenis TEXT PRIMARY KEY CHECK (jenis IN ('masuk', 'jadi')),
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  diubah_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_tanggal ON orders(tanggal);
CREATE INDEX IF NOT EXISTS idx_item_order ON order_item(order_id);
CREATE INDEX IF NOT EXISTS idx_item_pilihan ON order_item_pilihan(item_id);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  // Migration: older databases forbid negative option prices. SQLite cannot drop a CHECK, so rebuild the table
  // (same ids, so order snapshots and menu links stay valid).
  if (get<{ sql: string }>(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pilihan'")?.sql.includes('harga >= 0')) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      tx(db, () => {
        db.exec(`CREATE TABLE pilihan_baru (
          id INTEGER PRIMARY KEY,
          grup_id INTEGER NOT NULL REFERENCES grup(id),
          label TEXT NOT NULL,
          harga INTEGER NOT NULL DEFAULT 0,
          urutan INTEGER NOT NULL DEFAULT 0,
          dihapus_at INTEGER
        );
        INSERT INTO pilihan_baru (id, grup_id, label, harga, urutan, dihapus_at) SELECT id, grup_id, label, harga, urutan, dihapus_at FROM pilihan;
        DROP TABLE pilihan;
        ALTER TABLE pilihan_baru RENAME TO pilihan;`);
        if (all(db, 'PRAGMA foreign_key_check').length > 0) throw new Error('Migrasi pilihan gagal: relasi rusak');
      });
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
  // Migration: databases created before QR ordering have no orders.sumber.
  if (!all<{ name: string }>(db, 'PRAGMA table_info(orders)').some((k) => k.name === 'sumber')) {
    db.exec("ALTER TABLE orders ADD COLUMN sumber TEXT NOT NULL DEFAULT 'kasir' CHECK (sumber IN ('kasir', 'qr'))");
  }
  // Migration: student name for QR orders.
  if (!all<{ name: string }>(db, 'PRAGMA table_info(orders)').some((k) => k.name === 'nama')) {
    db.exec('ALTER TABLE orders ADD COLUMN nama TEXT');
  }
  // Migration: optional note typed on the QR page.
  if (!all<{ name: string }>(db, 'PRAGMA table_info(orders)').some((k) => k.name === 'catatan')) {
    db.exec('ALTER TABLE orders ADD COLUMN catatan TEXT');
  }
  // Migration: the kitchen ticks items of a multi-item order one by one.
  if (!all<{ name: string }>(db, 'PRAGMA table_info(order_item)').some((k) => k.name === 'siap_at')) {
    db.exec('ALTER TABLE order_item ADD COLUMN siap_at INTEGER');
  }
  return db;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function all<T>(db: Db, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T>(db: Db, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function run(db: Db, sql: string, ...params: SQLInputValue[]) {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}
