import type { MenuPublik } from '../../../shared/types';
import { draftBaru, geserStepper, hargaDraft, opsiTerpilih, pilihOption, toggleChecklist, ubahQty } from './draft';

const menu: MenuPublik = {
  id: 1, nama: 'Mie Goreng', harga: 10000, tersedia: true, baru: false, urutan: 0,
  grup: [
    { id: 1, nama: 'Kepedasan', widget: 'stepper', urutan: 0,
      pilihan: [0, 1, 2, 3, 4, 5].map((l) => ({ id: l + 1, grup_id: 1, label: String(l), harga: 0, urutan: l })) },
    { id: 2, nama: 'Ukuran', widget: 'option', urutan: 1,
      pilihan: [{ id: 7, grup_id: 2, label: 'Kecil', harga: 0, urutan: 0 }, { id: 8, grup_id: 2, label: 'Besar', harga: 3000, urutan: 1 }] },
    { id: 3, nama: 'Topping', widget: 'checklist', urutan: 2,
      pilihan: [{ id: 9, grup_id: 3, label: 'Telur', harga: 2000, urutan: 0 }, { id: 10, grup_id: 3, label: 'Bawang', harga: 0, urutan: 1 }] },
  ],
};
const pedas = menu.grup[0];

test('new draft picks the first option of stepper and option groups', () => {
  const d = draftBaru(menu);
  expect(d.qty).toBe(1);
  expect(d.pilih).toEqual({ 1: [1], 2: [7], 3: [] });
  expect(hargaDraft(d)).toBe(10000);
});

test('qty stays between 1 and qty_max (Review Focus 4)', () => {
  let d = draftBaru(menu);
  d = ubahQty(d, -1, 10);
  expect(d.qty).toBe(1);
  for (let i = 0; i < 15; i++) d = ubahQty(d, 1, 10);
  expect(d.qty).toBe(10);
});

test('stepper moves by level and stops at both ends (Review Focus 3)', () => {
  let d = geserStepper(draftBaru(menu), pedas, 3);
  expect(d.pilih[1]).toEqual([4]);
  d = geserStepper(d, pedas, -10);
  expect(d.pilih[1]).toEqual([1]);
  d = geserStepper(d, pedas, 99);
  expect(d.pilih[1]).toEqual([6]);
});

test('option replaces the choice; checklist toggles', () => {
  let d = pilihOption(draftBaru(menu), 2, 8);
  expect(hargaDraft(d)).toBe(13000);
  d = toggleChecklist(d, 3, 9);
  d = toggleChecklist(d, 3, 10);
  d = ubahQty(d, 1, 10);
  expect(hargaDraft(d)).toBe(30000);
  d = toggleChecklist(d, 3, 9);
  expect(d.pilih[3]).toEqual([10]);
});

test('opsiTerpilih lists choices in group order with snapshot fields', () => {
  const d = toggleChecklist(pilihOption(draftBaru(menu), 2, 8), 3, 9);
  expect(opsiTerpilih(d)).toEqual([
    { id: 1, grup: 'Kepedasan', label: '0', harga: 0 },
    { id: 8, grup: 'Ukuran', label: 'Besar', harga: 3000 },
    { id: 9, grup: 'Topping', label: 'Telur', harga: 2000 },
  ]);
});

test('draftDariItem rebuilds a cart line for editing, with defaults for missing single choices', async () => {
  const { dariDraft } = await import('./keranjang');
  const { draftDariItem } = await import('./draft');
  let d = pilihOption(draftBaru(menu), 2, 8);
  d = geserStepper(d, pedas, 3);
  d = toggleChecklist(ubahQty(d, 2, 10), 3, 9);
  const item = dariDraft(d);

  const ulang = draftDariItem(item, menu);
  expect(ulang.qty).toBe(3);
  expect(ulang.pilih).toEqual({ 1: [4], 2: [8], 3: [9] });
  expect(hargaDraft(ulang)).toBe(hargaDraft(d));

  const kosong = draftDariItem({ ...item, pilihan: [] }, menu);
  expect(kosong.pilih).toEqual({ 1: [1], 2: [7], 3: [] });
});
