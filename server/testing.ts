import request from 'supertest';
import type express from 'express';
import type { Peran } from '../shared/types';
import { createApp } from './app';
import { hashPin } from './auth';
import type { Clock } from './clock';
import { openDb, run, type Db } from './db';
import type { ServerEvent } from './events';
import { setSetting } from './settings';

export const PIN_DAPUR = '111111';
export const PIN_ADMIN = '999999';

export class FakeClock implements Clock {
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
  maju(ms: number): void {
    this.t += ms;
  }
}

/** 2026-09-29 08:00 local time. */
export const PAGI = new Date(2026, 8, 29, 8, 0).getTime();

export function buatTestApp(
  opts: { staticDir?: string; fetchFn?: typeof fetch; lokal?: string[]; hanyaSekolah?: boolean; versi?: string; keluar?: () => void } = {},
) {
  const db = openDb(':memory:');
  setSetting(db, 'pin_dapur_hash', hashPin(PIN_DAPUR));
  setSetting(db, 'pin_admin_hash', hashPin(PIN_ADMIN));
  const clock = new FakeClock(PAGI);
  const events: ServerEvent[] = [];
  const app = createApp({ db, clock, emit: (e) => events.push(e), staticDir: opts.staticDir, fetchFn: opts.fetchFn, lokal: opts.lokal, hanyaSekolah: opts.hanyaSekolah, versi: opts.versi, keluar: opts.keluar ?? (() => undefined) });
  return { app, db, clock, events };
}

export async function login(app: express.Express, peran: Peran): Promise<string> {
  const pin = peran === 'admin' ? PIN_ADMIN : PIN_DAPUR;
  const res = await request(app).post('/api/auth/pin').send({ peran, pin, device: 'Test' });
  if (res.status !== 200) throw new Error(`login ${peran} failed: ${res.status}`);
  return res.body.token as string;
}

/**
 * Mie Goreng 10000 with Kepedasan (stepper 0-5), Ukuran (option Kecil 0 / Besar 3000)
 * and Topping (checklist Telur 2000, Bawang 0, Keju 3000).
 * Es Teh 3000 with no groups. Nasi Goreng 12000 is sold out.
 * Grup "Saus" (option Tomat) exists but is not attached to any menu.
 */
export function seedMenu(db: Db, dibuat_at = 0) {
  const menu = (nama: string, harga: number, tersedia = 1, urutan = 0) =>
    run(db, 'INSERT INTO menu (nama, harga, tersedia, urutan, dibuat_at) VALUES (?, ?, ?, ?, ?)', nama, harga, tersedia, urutan, dibuat_at).lastInsertRowid;
  const grup = (nama: string, widget: string, urutan: number) =>
    run(db, 'INSERT INTO grup (nama, widget, urutan) VALUES (?, ?, ?)', nama, widget, urutan).lastInsertRowid;
  const pilihan = (grup_id: number, label: string, harga: number, urutan: number) =>
    run(db, 'INSERT INTO pilihan (grup_id, label, harga, urutan) VALUES (?, ?, ?, ?)', grup_id, label, harga, urutan).lastInsertRowid;
  const tempel = (menu_id: number, grup_id: number, urutan: number) =>
    run(db, 'INSERT INTO menu_grup (menu_id, grup_id, urutan) VALUES (?, ?, ?)', menu_id, grup_id, urutan);

  const mie = menu('Mie Goreng', 10000, 1, 0);
  const esTeh = menu('Es Teh', 3000, 1, 1);
  const nasi = menu('Nasi Goreng', 12000, 0, 2);

  const grupPedas = grup('Kepedasan', 'stepper', 0);
  const pedas = [0, 1, 2, 3, 4, 5].map((lvl) => pilihan(grupPedas, String(lvl), 0, lvl));
  const grupUkuran = grup('Ukuran', 'option', 1);
  const ukuran = { kecil: pilihan(grupUkuran, 'Kecil', 0, 0), besar: pilihan(grupUkuran, 'Besar', 3000, 1) };
  const grupTopping = grup('Topping', 'checklist', 2);
  const telur = pilihan(grupTopping, 'Telur', 2000, 0);
  const bawang = pilihan(grupTopping, 'Bawang', 0, 1);
  const keju = pilihan(grupTopping, 'Keju', 3000, 2);
  const grupLepas = grup('Saus', 'option', 3);
  const lepas = pilihan(grupLepas, 'Tomat', 0, 0);

  tempel(mie, grupPedas, 0);
  tempel(mie, grupUkuran, 1);
  tempel(mie, grupTopping, 2);

  return { mie, esTeh, nasi, pedas, ukuran, telur, bawang, keju, grupPedas, grupUkuran, grupTopping, grupLepas, lepas };
}
