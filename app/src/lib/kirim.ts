import type { StatusOrder } from '../../../shared/types';

export interface Respons {
  status: number;
  json(): Promise<any>;
}

export type HasilKirim =
  | { ok: true; id: number; nomor: number; total: number; dibuat_at: number; status: StatusOrder; baru: boolean }
  | { ok: false; habis: { menu_id: number; nama: string }[] }
  | { ok: false; error: string };

const JEDA_MS = 1500;

/**
 * Sends an order and keeps retrying while the network or the server is down.
 * The body carries a fixed client_uuid, so a retry never creates a second order.
 */
export async function kirimOrder(
  body: unknown,
  post: (body: unknown) => Promise<Respons>,
  tunggu: (ms: number) => Promise<void>,
  onMenunggu: () => void = () => {},
): Promise<HasilKirim> {
  for (;;) {
    let res: Respons;
    try {
      res = await post(body);
    } catch {
      onMenunggu();
      await tunggu(JEDA_MS);
      continue;
    }
    if (res.status >= 500) {
      onMenunggu();
      await tunggu(JEDA_MS);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) {
      // 200 = the server already had this order (a retry); its cancel window may be over.
      return { ok: true, id: data.id, nomor: data.nomor, total: data.total, dibuat_at: data.dibuat_at, status: data.status ?? 'baru', baru: res.status === 201 };
    }
    if (res.status === 409 && Array.isArray(data.habis)) return { ok: false, habis: data.habis };
    return { ok: false, error: data.error ?? 'Gagal' };
  }
}
