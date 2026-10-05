import type { PinGuard, TokenStore } from './auth';
import type { Clock } from './clock';
import type { Db } from './db';
import type { IncomingMessage } from 'node:http';
import type { Emit } from './events';
import type { BatasLaju, CatatanTolak } from './qr';

export interface Ctx {
  db: Db;
  clock: Clock;
  emit: Emit;
  tokens: TokenStore;
  guard: PinGuard;
  batasQr: BatasLaju;
  tolakQr: CatatanTolak;
  fetchFn: typeof fetch;
  publik: (req: IncomingMessage) => boolean;
  /** QR orders only from allowed school IPs (KANTIN_QR_HANYA_SEKOLAH=1). */
  hanyaSekolah: boolean;
  versi: string;
  keluar: () => void;
}
