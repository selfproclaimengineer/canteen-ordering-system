import { menuBaru } from '../shared/rules';
import type { Grup, MenuPublik, Pilihan, Widget } from '../shared/types';
import { all, type Db } from './db';

export function grupAktif(db: Db): Map<number, Grup> {
  const grup = new Map<number, Grup>();
  for (const g of all<{ id: number; nama: string; widget: Widget; urutan: number }>(
    db,
    'SELECT id, nama, widget, urutan FROM grup WHERE dihapus_at IS NULL ORDER BY urutan, id',
  )) {
    grup.set(g.id, { ...g, pilihan: [] });
  }
  for (const p of all<Pilihan>(
    db,
    'SELECT id, grup_id, label, harga, urutan FROM pilihan WHERE dihapus_at IS NULL ORDER BY urutan, id',
  )) {
    grup.get(p.grup_id)?.pilihan.push({ ...p });
  }
  return grup;
}

export function grupUntukMenu(db: Db, menuId: number, grup: Map<number, Grup>): Grup[] {
  return all<{ grup_id: number }>(
    db,
    `SELECT mg.grup_id FROM menu_grup mg JOIN grup g ON g.id = mg.grup_id
     WHERE mg.menu_id = ? ORDER BY mg.urutan, g.urutan, g.id`,
    menuId,
  )
    .map((r) => grup.get(r.grup_id))
    .filter((g): g is Grup => g !== undefined);
}

export function daftarMenuPublik(db: Db, now: number): MenuPublik[] {
  const grup = grupAktif(db);
  return all<{ id: number; nama: string; harga: number; tersedia: number; urutan: number; dibuat_at: number }>(
    db,
    'SELECT id, nama, harga, tersedia, urutan, dibuat_at FROM menu WHERE dihapus_at IS NULL ORDER BY urutan, id',
  ).map((m) => ({
    id: m.id,
    nama: m.nama,
    harga: m.harga,
    tersedia: m.tersedia === 1,
    baru: menuBaru(m.dibuat_at, now),
    urutan: m.urutan,
    grup: grupUntukMenu(db, m.id, grup),
  }));
}

export function daftarMenuAdmin(db: Db) {
  const grup = grupAktif(db);
  const menu = all<{ id: number; nama: string; harga: number; tersedia: number; urutan: number; dibuat_at: number }>(
    db,
    'SELECT id, nama, harga, tersedia, urutan, dibuat_at FROM menu WHERE dihapus_at IS NULL ORDER BY urutan, id',
  ).map((m) => ({
    ...m,
    tersedia: m.tersedia === 1,
    grup_ids: grupUntukMenu(db, m.id, grup).map((g) => g.id),
  }));
  return { menu, grup: [...grup.values()] };
}
