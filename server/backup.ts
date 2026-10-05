import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tanggalDari } from '../shared/rules';
import type { Db } from './db';

const POLA = /^kantin-\d{4}-\d{2}-\d{2}\.db$/;

export function backupSekali(db: Db, dir: string, now: number, simpan = 7): string | null {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `kantin-${tanggalDari(now)}.db`);
  if (existsSync(file)) return null;

  // VACUUM INTO makes a consistent copy while the database stays in use.
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  const lama = readdirSync(dir).filter((f) => POLA.test(f)).sort();
  for (const f of lama.slice(0, Math.max(0, lama.length - simpan))) unlinkSync(join(dir, f));
  return file;
}
