import {
  bolehBatalPelanggan,
  bolehUndoSiap,
  jamKeMs,
  menuBaru,
  tabUntuk,
  tanggalDari,
  waktuAmbilTersedia,
} from './rules';

const jam = { ist1: '09:30', ist2: '12:00' };
const pada = (h: number, m: number, s = 0) => new Date(2026, 8, 29, h, m, s).getTime();

test('tanggalDari returns local YYYY-MM-DD with zero padding', () => {
  expect(tanggalDari(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
});

test('jamKeMs converts HH:MM to epoch ms on the same local day', () => {
  expect(jamKeMs('09:30', pada(7, 0))).toBe(pada(9, 30));
});

describe('bolehBatalPelanggan', () => {
  const dibuat_at = pada(9, 0, 0);
  test('allowed at exactly 10 s', () => {
    expect(bolehBatalPelanggan({ status: 'baru', dibuat_at }, dibuat_at + 10_000)).toBe(true);
  });
  test('refused after 10 s', () => {
    expect(bolehBatalPelanggan({ status: 'baru', dibuat_at }, dibuat_at + 10_001)).toBe(false);
  });
  test('refused when status is not baru', () => {
    expect(bolehBatalPelanggan({ status: 'siap', dibuat_at }, dibuat_at + 1)).toBe(false);
  });
});

describe('bolehUndoSiap', () => {
  const siap_at = pada(9, 0);
  test('allowed within 30 s', () => {
    expect(bolehUndoSiap({ status: 'siap', siap_at }, siap_at + 30_000)).toBe(true);
  });
  test('refused after 30 s', () => {
    expect(bolehUndoSiap({ status: 'siap', siap_at }, siap_at + 30_001)).toBe(false);
  });
  test('refused when not siap', () => {
    expect(bolehUndoSiap({ status: 'baru', siap_at: null }, siap_at)).toBe(false);
  });
});

describe('tabUntuk', () => {
  test('sekarang orders go to sekarang', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'sekarang' }, pada(8, 0), jam)).toBe('sekarang');
  });
  test('break order is held before activation time', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'ist1' }, pada(9, 19, 59), jam)).toBe('ist1');
  });
  test('break order moves to sekarang 10 minutes before the break', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'ist1' }, pada(9, 20), jam)).toBe('sekarang');
  });
  test('ist2 is still held while ist1 is active', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'ist2' }, pada(9, 30), jam)).toBe('ist2');
  });
  test('siap and batal orders go to selesai', () => {
    expect(tabUntuk({ status: 'siap', waktu_ambil: 'ist2' }, pada(8, 0), jam)).toBe('selesai');
    expect(tabUntuk({ status: 'batal', waktu_ambil: 'sekarang' }, pada(8, 0), jam)).toBe('selesai');
  });
});

describe('waktuAmbilTersedia', () => {
  test('all options early in the morning', () => {
    expect(waktuAmbilTersedia(pada(7, 0), jam)).toEqual(['sekarang', 'ist1', 'ist2']);
  });
  test('ist1 disappears at its activation time', () => {
    expect(waktuAmbilTersedia(pada(9, 20), jam)).toEqual(['sekarang', 'ist2']);
  });
  test('only sekarang late in the day', () => {
    expect(waktuAmbilTersedia(pada(13, 0), jam)).toEqual(['sekarang']);
  });
});

test('menuBaru is true for 3 days', () => {
  const dibuat = pada(8, 0);
  expect(menuBaru(dibuat, dibuat + 3 * 24 * 3600_000)).toBe(true);
  expect(menuBaru(dibuat, dibuat + 3 * 24 * 3600_000 + 1)).toBe(false);
});
