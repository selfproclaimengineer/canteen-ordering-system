import type { JamIstirahat, StatusOrder, Tab, WaktuAmbil } from './types';

export const BATAS_BATAL_PELANGGAN_MS = 10_000;
export const BATAS_UNDO_SIAP_MS = 30_000;
export const MAJU_ISTIRAHAT_MS = 10 * 60_000;
export const SIAP_TAMPIL_MS = 5 * 60_000;
export const MENU_BARU_MS = 3 * 24 * 3600_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function tanggalDari(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function jamKeMs(jam: string, now: number): number {
  const [h, m] = jam.split(':').map(Number);
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

export function bolehBatalPelanggan(o: { status: StatusOrder; dibuat_at: number }, now: number): boolean {
  return o.status === 'baru' && now - o.dibuat_at <= BATAS_BATAL_PELANGGAN_MS;
}

export function bolehUndoSiap(o: { status: StatusOrder; siap_at: number | null }, now: number): boolean {
  return o.status === 'siap' && o.siap_at !== null && now - o.siap_at <= BATAS_UNDO_SIAP_MS;
}

function aktifSejak(waktu: 'ist1' | 'ist2', now: number, jam: JamIstirahat): number {
  return jamKeMs(jam[waktu], now) - MAJU_ISTIRAHAT_MS;
}

export function tabUntuk(
  o: { status: StatusOrder; waktu_ambil: WaktuAmbil },
  now: number,
  jam: JamIstirahat,
): Tab {
  if (o.status !== 'baru') return 'selesai';
  if (o.waktu_ambil === 'sekarang') return 'sekarang';
  return now >= aktifSejak(o.waktu_ambil, now, jam) ? 'sekarang' : o.waktu_ambil;
}

export function waktuAmbilTersedia(now: number, jam: JamIstirahat): WaktuAmbil[] {
  const istirahat = (['ist1', 'ist2'] as const).filter((w) => now < aktifSejak(w, now, jam));
  return ['sekarang', ...istirahat];
}

export function menuBaru(dibuat_at: number, now: number): boolean {
  return now - dibuat_at <= MENU_BARU_MS;
}
