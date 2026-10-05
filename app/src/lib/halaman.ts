/** Items that fit in `tinggi` px: rows of `tinggiBaris` px separated by `celah` px, times `kolom`. */
export function hitungPerHalaman(tinggi: number, tinggiBaris: number, celah: number, kolom: number): number {
  return Math.max(1, Math.floor((tinggi + celah) / (tinggiBaris + celah))) * kolom;
}
