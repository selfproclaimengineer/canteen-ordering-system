import type { SeriTren } from '../../../shared/tren';

/** Round axis ticks from 0 up to at least `maks`, about five steps. */
export function skalaRapi(maks: number): number[] {
  if (maks <= 0) return [0, 1];
  const kasar = maks / 5;
  const pangkat = 10 ** Math.floor(Math.log10(kasar));
  const n = kasar / pangkat;
  const langkah = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pangkat);
  const atas = Math.ceil(maks / langkah);
  return Array.from({ length: atas + 1 }, (_, i) => i * langkah);
}

const ringkas = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });

export function angkaRingkas(n: number): string {
  if (n >= 1_000_000) return `${ringkas(n / 1_000_000)} jt`;
  if (n >= 1000) return `${ringkas(n / 1000)} rb`;
  return String(n);
}

export function labelTanggal(tanggal: string): string {
  const [, b, h] = tanggal.split('-');
  return `${Number(h)}/${Number(b)}`;
}

/** Keeps the top n-1 series and folds the rest into "Lainnya", so a chart never needs a generated colour. */
export function potongTeratas(seri: SeriTren[], n: number): SeriTren[] {
  if (seri.length <= n) return seri;
  const sisa = seri.slice(n - 1);
  return [
    ...seri.slice(0, n - 1),
    {
      nama: 'Lainnya',
      qty: sisa[0].qty.map((_, i) => sisa.reduce((j, s) => j + s.qty[i], 0)),
      total: sisa.reduce((j, s) => j + s.total, 0),
    },
  ];
}
