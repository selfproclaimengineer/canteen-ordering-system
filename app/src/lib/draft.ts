import { hargaItem } from '../../../shared/pricing';
import type { Grup, MenuPublik } from '../../../shared/types';

export interface Draft {
  menu: MenuPublik;
  qty: number;
  /** grup id -> chosen pilihan ids */
  pilih: Record<number, number[]>;
}

export interface OpsiTerpilih {
  id: number;
  grup: string;
  label: string;
  harga: number;
}

export function draftBaru(menu: MenuPublik): Draft {
  const pilih: Record<number, number[]> = {};
  for (const g of menu.grup) {
    pilih[g.id] = g.widget !== 'checklist' && g.pilihan.length > 0 ? [g.pilihan[0].id] : [];
  }
  return { menu, qty: 1, pilih };
}

export function ubahQty(d: Draft, delta: number, qtyMax: number): Draft {
  return { ...d, qty: Math.min(qtyMax, Math.max(1, d.qty + delta)) };
}

export function geserStepper(d: Draft, grup: Grup, delta: number): Draft {
  if (grup.pilihan.length === 0) return d;
  const sekarang = Math.max(0, grup.pilihan.findIndex((p) => p.id === d.pilih[grup.id]?.[0]));
  const next = Math.min(grup.pilihan.length - 1, Math.max(0, sekarang + delta));
  return { ...d, pilih: { ...d.pilih, [grup.id]: [grup.pilihan[next].id] } };
}

export function pilihOption(d: Draft, grupId: number, pilihanId: number): Draft {
  return { ...d, pilih: { ...d.pilih, [grupId]: [pilihanId] } };
}

export function toggleChecklist(d: Draft, grupId: number, pilihanId: number): Draft {
  const ada = d.pilih[grupId] ?? [];
  const next = ada.includes(pilihanId) ? ada.filter((id) => id !== pilihanId) : [...ada, pilihanId];
  return { ...d, pilih: { ...d.pilih, [grupId]: next } };
}

export function opsiTerpilih(d: Draft): OpsiTerpilih[] {
  return d.menu.grup.flatMap((g) =>
    g.pilihan
      .filter((p) => d.pilih[g.id]?.includes(p.id))
      .map((p) => ({ id: p.id, grup: g.nama, label: p.label, harga: p.harga })),
  );
}

export function hargaDraft(d: Draft): number {
  return hargaItem({ harga: d.menu.harga, qty: d.qty, pilihan: opsiTerpilih(d) });
}

/** Turns a cart line back into a draft so the customer can change it. Missing single choices fall back to the default. */
export function draftDariItem(item: { qty: number; pilihan: { id: number }[] }, menu: MenuPublik): Draft {
  const dipilih = new Set(item.pilihan.map((p) => p.id));
  const d = draftBaru(menu);
  const pilih: Record<number, number[]> = {};
  for (const g of menu.grup) {
    const ada = g.pilihan.filter((p) => dipilih.has(p.id)).map((p) => p.id);
    pilih[g.id] = ada.length > 0 ? (g.widget === 'checklist' ? ada : [ada[0]]) : d.pilih[g.id];
  }
  return { menu, qty: item.qty, pilih };
}
