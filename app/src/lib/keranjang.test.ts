import type { MenuPublik } from '../../../shared/types';
import { draftBaru, toggleChecklist, ubahQty } from './draft';
import { bodyOrder, buangHabis, dariDraft, hapusItem, totalKeranjang } from './keranjang';

const mie: MenuPublik = {
  id: 1, nama: 'Mie', harga: 10000, tersedia: true, baru: false, urutan: 0,
  grup: [{ id: 3, nama: 'Topping', widget: 'checklist', urutan: 0, pilihan: [{ id: 9, grup_id: 3, label: 'Telur', harga: 2000, urutan: 0 }] }],
};
const teh: MenuPublik = { id: 2, nama: 'Es Teh', harga: 3000, tersedia: true, baru: false, urutan: 1, grup: [] };

test('draft becomes a cart item with a unique key and snapshot options', () => {
  const a = dariDraft(ubahQty(toggleChecklist(draftBaru(mie), 3, 9), 1, 10));
  const b = dariDraft(draftBaru(teh));
  expect(a).toMatchObject({ menu_id: 1, nama: 'Mie', harga: 10000, qty: 2, pilihan: [{ id: 9, label: 'Telur', harga: 2000 }] });
  expect(a.key).not.toBe(b.key);
  expect(totalKeranjang([a, b])).toBe(27000);
});

test('remove by key and drop sold-out menus (Review Focus 2)', () => {
  const a = dariDraft(draftBaru(mie));
  const b = dariDraft(draftBaru(teh));
  const c = dariDraft(draftBaru(teh));
  expect(hapusItem([a, b, c], b.key)).toEqual([a, c]);
  expect(buangHabis([a, b, c], [2])).toEqual([a]);
});

test('bodyOrder sends ids and qty only, never prices', () => {
  const a = dariDraft(toggleChecklist(draftBaru(mie), 3, 9));
  expect(bodyOrder([a], 'ist1', 'HP-1', 'u-1')).toEqual({
    client_uuid: 'u-1', waktu_ambil: 'ist1', device: 'HP-1',
    items: [{ menu_id: 1, qty: 1, pilihan_ids: [9] }],
  });
});
