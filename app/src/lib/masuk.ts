import type { Peran } from '../../../shared/types';
import { ApiError, api } from './api';
import { alarm } from './beep';
import { sesi } from './sesi';

/** Logs in with a PIN. Returns null on success, else a short message for the keypad. */
export async function masuk(peran: Peran, pin: string): Promise<string | null> {
  try {
    const r = await api<{ token: string; peran: Peran }>('/auth/pin', {
      method: 'POST',
      body: { peran, pin, device: sesi.device() },
    });
    sesi.setToken(r.token, r.peran);
    return null;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 429) {
        alarm();
        return `Terkunci ${String(e.body.sisa_detik ?? 60)} detik`;
      }
      return e.message;
    }
    return 'Terputus';
  }
}
