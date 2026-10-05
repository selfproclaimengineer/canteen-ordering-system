export function paginate<T>(items: T[], perPage: number, page: number) {
  const size = Math.max(1, Math.floor(perPage));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  return { items: items.slice(p * size, p * size + size), page: p, pageCount };
}

export function urutTopping<T extends { harga: number; urutan: number }>(pilihan: T[]): T[] {
  const berbayar = (x: T) => (x.harga > 0 ? 1 : 0);
  return [...pilihan].sort((a, b) => berbayar(a) - berbayar(b) || a.urutan - b.urutan);
}

export function pisahTopping<T extends { harga: number }>(pilihan: T[]) {
  return {
    gratis: pilihan.filter((p) => p.harga === 0),
    berbayar: pilihan.filter((p) => p.harga > 0),
  };
}
