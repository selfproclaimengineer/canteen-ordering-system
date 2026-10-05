import { totalOrder } from '../shared/pricing';
import { bolehBatalPelanggan, bolehUndoSiap, SIAP_TAMPIL_MS, tabUntuk, tanggalDari } from '../shared/rules';
import type { OrderBaru } from '../shared/schemas';
import type { Grup, JamIstirahat, Order, OrderItem, PilihanSnapshot, Sumber, Tab } from '../shared/types';
import { all, get, run, tx, type Db } from './db';
import { HttpError } from './http';
import { grupAktif, grupUntukMenu } from './menu-repo';

type OrderRow = Omit<Order, 'items'>;
type ItemRow = Omit<OrderItem, 'pilihan'> & { order_id: number };

function lengkapi(db: Db, row: OrderRow): Order {
  const items = all<ItemRow>(
    db,
    'SELECT id, order_id, menu_id, nama, harga, qty, batal_at, siap_at FROM order_item WHERE order_id = ? ORDER BY id',
    row.id,
  ).map(({ order_id: _o, ...item }) => ({
    ...item,
    pilihan: all<PilihanSnapshot>(
      db,
      'SELECT pilihan_id, grup, label, harga FROM order_item_pilihan WHERE item_id = ? ORDER BY rowid',
      item.id,
    ).map((p) => ({ ...p })),
  }));
  return { ...row, items };
}

const KOLOM = 'id, client_uuid, tanggal, nomor, waktu_ambil, status, device, dibuat_at, siap_at, batal_at, batal_oleh, sumber, nama, catatan';

export function ambilOrder(db: Db, id: number): Order | undefined {
  const row = get<OrderRow>(db, `SELECT ${KOLOM} FROM orders WHERE id = ?`, id);
  return row && lengkapi(db, { ...row });
}

export function ordersHari(db: Db, tanggal: string): Order[] {
  return all<OrderRow>(db, `SELECT ${KOLOM} FROM orders WHERE tanggal = ? ORDER BY nomor`, tanggal).map((row) =>
    lengkapi(db, { ...row }),
  );
}

interface ItemSiap {
  menu_id: number;
  nama: string;
  harga: number;
  qty: number;
  pilihan: PilihanSnapshot[];
}

function pilihOpsi(grupMenu: Grup[], pilihanIds: number[]): PilihanSnapshot[] {
  const dipilih = new Set(pilihanIds);
  const dikenal = new Set(grupMenu.flatMap((g) => g.pilihan.map((p) => p.id)));
  for (const id of dipilih) if (!dikenal.has(id)) throw new HttpError(400, 'Pilihan tidak valid');

  const hasil: PilihanSnapshot[] = [];
  for (const g of grupMenu) {
    let opsi = g.pilihan.filter((p) => dipilih.has(p.id));
    if (g.widget !== 'checklist') {
      if (opsi.length > 1) throw new HttpError(400, `Pilih satu ${g.nama}`);
      if (opsi.length === 0 && g.pilihan.length > 0) opsi = [g.pilihan[0]];
    }
    for (const p of opsi) hasil.push({ pilihan_id: p.id, grup: g.nama, label: p.label, harga: p.harga });
  }
  return hasil;
}

export function buatOrder(
  db: Db,
  input: OrderBaru,
  now: number,
  qtyMax: number,
  sumber: Sumber = 'kasir',
  nama: string | null = null,
  catatan: string | null = null,
): { order: Order; baru: boolean } {
  return tx(db, () => {
    const ada = get<{ id: number }>(db, 'SELECT id FROM orders WHERE client_uuid = ?', input.client_uuid);
    if (ada) return { order: ambilOrder(db, ada.id)!, baru: false };

    const grup = grupAktif(db);
    const habis: { menu_id: number; nama: string }[] = [];
    const siap: ItemSiap[] = [];

    for (const item of input.items) {
      const menu = get<{ nama: string; harga: number; tersedia: number; dihapus_at: number | null }>(
        db,
        'SELECT nama, harga, tersedia, dihapus_at FROM menu WHERE id = ?',
        item.menu_id,
      );
      if (!menu || menu.dihapus_at !== null || menu.tersedia !== 1) {
        habis.push({ menu_id: item.menu_id, nama: menu?.nama ?? 'Menu' });
        continue;
      }
      if (item.qty > qtyMax) throw new HttpError(400, `Maksimal ${qtyMax} per menu`);
      const pilihan = pilihOpsi(grupUntukMenu(db, item.menu_id, grup), item.pilihan_ids);
      if (menu.harga + pilihan.reduce((j, p) => j + p.harga, 0) < 0) throw new HttpError(400, `Harga ${menu.nama} jadi minus`);
      siap.push({ menu_id: item.menu_id, nama: menu.nama, harga: menu.harga, qty: item.qty, pilihan });
    }
    if (habis.length > 0) throw new HttpError(409, 'Menu habis', { habis });

    const tanggal = tanggalDari(now);
    const nomor =
      (get<{ n: number | null }>(db, 'SELECT MAX(nomor) AS n FROM orders WHERE tanggal = ?', tanggal)?.n ?? 0) + 1;
    const orderId = run(
      db,
      `INSERT INTO orders (client_uuid, tanggal, nomor, waktu_ambil, device, dibuat_at, sumber, nama, catatan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.client_uuid, tanggal, nomor, input.waktu_ambil, input.device, now, sumber, nama, catatan,
    ).lastInsertRowid;

    for (const item of siap) {
      const itemId = run(
        db,
        'INSERT INTO order_item (order_id, menu_id, nama, harga, qty) VALUES (?, ?, ?, ?, ?)',
        orderId, item.menu_id, item.nama, item.harga, item.qty,
      ).lastInsertRowid;
      for (const p of item.pilihan) {
        run(
          db,
          'INSERT INTO order_item_pilihan (item_id, pilihan_id, grup, label, harga) VALUES (?, ?, ?, ?, ?)',
          itemId, p.pilihan_id, p.grup, p.label, p.harga,
        );
      }
    }
    return { order: ambilOrder(db, orderId)!, baru: true };
  });
}

function wajibOrder(db: Db, id: number): Order {
  const order = ambilOrder(db, id);
  if (!order) throw new HttpError(404, 'Order tidak ditemukan');
  return order;
}

export function batalPelanggan(db: Db, id: number, clientUuid: string, now: number): Order {
  const order = ambilOrder(db, id);
  if (!order || order.client_uuid !== clientUuid) throw new HttpError(404, 'Order tidak ditemukan');
  // A retry after a lost response must not look like a failure.
  if (order.status === 'batal' && order.batal_oleh === 'pelanggan') return order;
  if (!bolehBatalPelanggan(order, now)) throw new HttpError(409, 'Batas waktu batal lewat');
  run(db, "UPDATE orders SET status = 'batal', batal_at = ?, batal_oleh = 'pelanggan' WHERE id = ?", now, id);
  return wajibOrder(db, id);
}

/** A second tap on an order that is already siap returns it unchanged. */
export function tandaiSiap(db: Db, id: number, now: number): Order {
  const order = wajibOrder(db, id);
  if (order.status === 'siap') return order;
  if (order.status !== 'baru') throw new HttpError(409, 'Order bukan baru');
  run(db, "UPDATE orders SET status = 'siap', siap_at = ? WHERE id = ?", now, id);
  return wajibOrder(db, id);
}

export function undoSiap(db: Db, id: number, now: number): Order {
  if (!bolehUndoSiap(wajibOrder(db, id), now)) throw new HttpError(409, 'Batas waktu urungkan lewat');
  run(db, "UPDATE orders SET status = 'baru', siap_at = NULL WHERE id = ?", id);
  return wajibOrder(db, id);
}

/** A second tap on an order that is already cancelled returns it unchanged. */
export function batalDapur(db: Db, id: number, now: number): Order {
  const order = wajibOrder(db, id);
  if (order.status === 'batal') return order;
  run(db, "UPDATE orders SET status = 'batal', batal_at = ?, batal_oleh = 'dapur' WHERE id = ?", now, id);
  return wajibOrder(db, id);
}

export function batalItem(db: Db, itemId: number, now: number): Order {
  return tx(db, () => {
    const item = get<{ order_id: number; batal_at: number | null }>(
      db,
      'SELECT order_id, batal_at FROM order_item WHERE id = ?',
      itemId,
    );
    if (!item) throw new HttpError(404, 'Item tidak ditemukan');
    const order = wajibOrder(db, item.order_id);
    if (item.batal_at !== null || order.status === 'batal') throw new HttpError(409, 'Item sudah batal');

    run(db, 'UPDATE order_item SET batal_at = ? WHERE id = ?', now, itemId);
    const sisa = get<{ n: number }>(
      db,
      'SELECT COUNT(*) AS n FROM order_item WHERE order_id = ? AND batal_at IS NULL',
      item.order_id,
    )!.n;
    if (sisa === 0) {
      run(db, "UPDATE orders SET status = 'batal', batal_at = ?, batal_oleh = 'dapur' WHERE id = ?", now, item.order_id);
    } else {
      siapJikaLengkap(db, item.order_id, now);
    }
    return wajibOrder(db, item.order_id);
  });
}

/** A new order turns siap once every active item is ticked. */
function siapJikaLengkap(db: Db, orderId: number, now: number) {
  const belum = get<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM order_item WHERE order_id = ? AND batal_at IS NULL AND siap_at IS NULL',
    orderId,
  )!.n;
  if (belum === 0) run(db, "UPDATE orders SET status = 'siap', siap_at = ? WHERE id = ? AND status = 'baru'", now, orderId);
}

/** Kitchen ticks (or unticks) one item while the order is still new. */
export function centangItem(db: Db, itemId: number, siap: boolean, now: number): Order {
  return tx(db, () => {
    const item = get<{ order_id: number; batal_at: number | null }>(db, 'SELECT order_id, batal_at FROM order_item WHERE id = ?', itemId);
    if (!item) throw new HttpError(404, 'Item tidak ditemukan');
    if (item.batal_at !== null) throw new HttpError(409, 'Item sudah batal');
    if (wajibOrder(db, item.order_id).status !== 'baru') throw new HttpError(409, 'Order bukan baru');
    run(db, 'UPDATE order_item SET siap_at = ? WHERE id = ?', siap ? now : null, itemId);
    if (siap) siapJikaLengkap(db, item.order_id, now);
    return wajibOrder(db, item.order_id);
  });
}

export function daftarDapur(db: Db, tab: Tab, now: number, jam: JamIstirahat) {
  const semua = ordersHari(db, tanggalDari(now)).map((o) => ({
    ...o,
    tab: tabUntuk(o, now, jam),
    total: totalOrder(o.items),
  }));
  const jumlah = { sekarang: 0, ist1: 0, ist2: 0 };
  for (const o of semua) if (o.tab !== 'selesai') jumlah[o.tab]++;

  const orders = semua.filter((o) => o.tab === tab);
  if (tab === 'selesai') {
    orders.sort((a, b) => (b.siap_at ?? b.batal_at ?? 0) - (a.siap_at ?? a.batal_at ?? 0));
  } else {
    orders.sort((a, b) => a.dibuat_at - b.dibuat_at);
  }
  return { orders, jumlah };
}

export function siapTerbaru(db: Db, now: number): number[] {
  return all<{ nomor: number }>(
    db,
    "SELECT nomor FROM orders WHERE tanggal = ? AND status = 'siap' AND siap_at >= ? ORDER BY nomor",
    tanggalDari(now),
    now - SIAP_TAMPIL_MS,
  ).map((r) => r.nomor);
}

export function adaOrderQrAktif(db: Db, device: string, tanggal: string): boolean {
  return (
    get(db, "SELECT 1 AS x FROM orders WHERE sumber = 'qr' AND device = ? AND tanggal = ? AND status = 'baru'", device, tanggal) !==
    undefined
  );
}
