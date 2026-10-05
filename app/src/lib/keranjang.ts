import { hargaItem } from '../../../shared/pricing';
import type { WaktuAmbil } from '../../../shared/types';
import { type Draft, type OpsiTerpilih, opsiTerpilih } from './draft';

export interface ItemKeranjang {
  key: string;
  menu_id: number;
  nama: string;
  harga: number;
  qty: number;
  pilihan: OpsiTerpilih[];
}

let urut = 0;

export function dariDraft(d: Draft): ItemKeranjang {
  urut += 1;
  return { key: `k${urut}`, menu_id: d.menu.id, nama: d.menu.nama, harga: d.menu.harga, qty: d.qty, pilihan: opsiTerpilih(d) };
}

export function totalKeranjang(items: ItemKeranjang[]): number {
  return items.reduce((sum, i) => sum + hargaItem(i), 0);
}

export function hapusItem(items: ItemKeranjang[], key: string): ItemKeranjang[] {
  return items.filter((i) => i.key !== key);
}

export function buangHabis(items: ItemKeranjang[], menuIds: number[]): ItemKeranjang[] {
  const habis = new Set(menuIds);
  return items.filter((i) => !habis.has(i.menu_id));
}

export function bodyOrder(items: ItemKeranjang[], waktu: WaktuAmbil, device: string, clientUuid: string) {
  return {
    client_uuid: clientUuid,
    waktu_ambil: waktu,
    device,
    items: items.map((i) => ({ menu_id: i.menu_id, qty: i.qty, pilihan_ids: i.pilihan.map((p) => p.id) })),
  };
}
