import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Peran } from '../shared/types';
import type { Clock } from './clock';

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function cocokPin(pin: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(pin, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Global lockout: wrong PINs from any device count together. */
export class PinGuard {
  private gagal = 0;
  private kunciSampai = 0;

  constructor(private clock: Clock, private maks = 5, private kunciMs = 60_000) {}

  sisaKunciMs(): number {
    return Math.max(0, this.kunciSampai - this.clock.now());
  }

  catatGagal(): boolean {
    this.gagal++;
    if (this.gagal < this.maks) return false;
    this.gagal = 0;
    this.kunciSampai = this.clock.now() + this.kunciMs;
    return true;
  }

  catatBerhasil(): void {
    this.gagal = 0;
  }
}

export class TokenStore {
  private sesi = new Map<string, { peran: Peran; exp: number }>();

  constructor(private clock: Clock, private ttlMs = 12 * 3600_000) {}

  buat(peran: Peran): string {
    const token = randomBytes(24).toString('hex');
    this.sesi.set(token, { peran, exp: this.clock.now() + this.ttlMs });
    return token;
  }

  cek(token: string | undefined): Peran | null {
    if (!token) return null;
    const s = this.sesi.get(token);
    if (!s) return null;
    if (s.exp <= this.clock.now()) {
      this.sesi.delete(token);
      return null;
    }
    return s.peran;
  }

  cabutSemua(peran: Peran): void {
    for (const [token, s] of this.sesi) if (s.peran === peran) this.sesi.delete(token);
  }
}
