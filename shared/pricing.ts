export interface ItemHarga {
  harga: number;
  qty: number;
  pilihan: { harga: number }[];
}

export function hargaItem(item: ItemHarga): number {
  const tambahan = item.pilihan.reduce((sum, p) => sum + p.harga, 0);
  return (item.harga + tambahan) * item.qty;
}

export function totalOrder(items: (ItemHarga & { batal_at: number | null })[]): number {
  return items
    .filter((item) => item.batal_at === null)
    .reduce((sum, item) => sum + hargaItem(item), 0);
}
