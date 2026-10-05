import { cocokPin, hashPin, PinGuard, TokenStore } from './auth';

const clock = { t: 1_000_000, now() { return this.t; } };

test('hashPin and cocokPin round-trip', () => {
  const stored = hashPin('123456');
  expect(stored.startsWith('scrypt$')).toBe(true);
  expect(stored).not.toContain('123456');
  expect(cocokPin('123456', stored)).toBe(true);
  expect(cocokPin('654321', stored)).toBe(false);
});

test('same PIN hashes differently each time (salt)', () => {
  expect(hashPin('123456')).not.toBe(hashPin('123456'));
});

test('cocokPin rejects malformed stored value', () => {
  expect(cocokPin('123456', 'garbage')).toBe(false);
});

describe('PinGuard', () => {
  test('locks after 5 failures and unlocks after 60 s', () => {
    const g = new PinGuard(clock);
    for (let i = 0; i < 4; i++) expect(g.catatGagal()).toBe(false);
    expect(g.catatGagal()).toBe(true);
    expect(g.sisaKunciMs()).toBe(60_000);
    clock.t += 60_000;
    expect(g.sisaKunciMs()).toBe(0);
  });

  test('success resets the counter', () => {
    const g = new PinGuard(clock);
    for (let i = 0; i < 4; i++) g.catatGagal();
    g.catatBerhasil();
    expect(g.catatGagal()).toBe(false);
  });
});

describe('TokenStore', () => {
  test('issues, checks, expires and revokes tokens', () => {
    const s = new TokenStore(clock, 1000);
    const a = s.buat('admin');
    const d = s.buat('dapur');
    expect(s.cek(a)).toBe('admin');
    expect(s.cek(undefined)).toBeNull();
    expect(s.cek('nope')).toBeNull();
    s.cabutSemua('dapur');
    expect(s.cek(d)).toBeNull();
    clock.t += 1000;
    expect(s.cek(a)).toBeNull();
  });
});
