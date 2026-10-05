import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupSekali } from './backup';
import { openDb, run } from './db';

const hari = (d: number) => new Date(2026, 8, d, 10, 0).getTime();

test('writes one readable backup per day and keeps the newest 7', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kantin-backup-'));
  const db = openDb(':memory:');
  run(db, "INSERT INTO pengaturan (key, value) VALUES ('x', '1')");

  const file = backupSekali(db, dir, hari(20));
  expect(file).toBe(join(dir, 'kantin-2026-09-20.db'));
  const copy = new DatabaseSync(file!);
  expect(copy.prepare("SELECT value FROM pengaturan WHERE key = 'x'").get()).toEqual({ value: '1' });
  copy.close();

  expect(backupSekali(db, dir, hari(20))).toBeNull();

  writeFileSync(join(dir, 'catatan.txt'), 'keep me');
  for (let d = 21; d <= 28; d++) backupSekali(db, dir, hari(d));

  const files = readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
  expect(files).toEqual([22, 23, 24, 25, 26, 27, 28].map((d) => `kantin-2026-09-${d}.db`));
  expect(existsSync(join(dir, 'catatan.txt'))).toBe(true);
});
