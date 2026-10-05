import { createInterface } from 'node:readline/promises';
import type { Peran } from '../shared/types';
import { hashPin } from './auth';
import type { Db } from './db';
import { getSetting, setSetting } from './settings';

const VALID = /^\d{6}$/;

export async function mintaPin(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const pin = (await rl.question(`${label} (6 angka): `)).trim();
      if (VALID.test(pin)) return pin;
      console.log('PIN harus 6 angka.');
    }
  } finally {
    rl.close();
  }
}

/** First run: take PINs from env, else ask in the terminal. */
export async function pastikanPin(db: Db): Promise<void> {
  const sumber: Record<Peran, { env: string; label: string }> = {
    dapur: { env: 'KANTIN_PIN_DAPUR', label: 'PIN Dapur baru' },
    admin: { env: 'KANTIN_PIN_ADMIN', label: 'PIN Admin baru' },
  };
  for (const peran of ['dapur', 'admin'] as const) {
    const key = `pin_${peran}_hash`;
    if (getSetting(db, key)) continue;

    const dariEnv = process.env[sumber[peran].env];
    let pin: string;
    if (dariEnv !== undefined) {
      if (!VALID.test(dariEnv)) throw new Error(`${sumber[peran].env} harus 6 angka`);
      pin = dariEnv;
    } else if (process.stdin.isTTY) {
      pin = await mintaPin(sumber[peran].label);
    } else {
      throw new Error(`PIN ${peran} belum diatur. Jalankan server sekali di terminal atau isi ${sumber[peran].env}.`);
    }
    setSetting(db, key, hashPin(pin));
  }
}
