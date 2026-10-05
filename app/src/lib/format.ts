export function rupiah(n: number): string {
  const angka = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}Rp${angka}`;
}
