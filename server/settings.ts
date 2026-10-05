import type { JamIstirahat } from '../shared/types';
import { get, run, type Db } from './db';

const DEFAULT: Record<string, string> = { jam_ist1: '09:30', jam_ist2: '12:00', qty_max: '10' };

export function getSetting(db: Db, key: string): string | undefined {
  return get<{ value: string }>(db, 'SELECT value FROM pengaturan WHERE key = ?', key)?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  run(db, 'INSERT INTO pengaturan (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

function baca(db: Db, key: string): string {
  return getSetting(db, key) ?? DEFAULT[key];
}

export function getPengaturan(db: Db): { jam: JamIstirahat; qty_max: number } {
  return {
    jam: { ist1: baca(db, 'jam_ist1'), ist2: baca(db, 'jam_ist2') },
    qty_max: Number(baca(db, 'qty_max')),
  };
}
