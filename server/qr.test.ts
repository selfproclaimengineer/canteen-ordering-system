import type { IncomingMessage } from 'node:http';
import { BatasLaju, buatKodeQr, CatatanTolak, entriValid, ipDiizinkan, ipPengirim, rentangTerkecil, samaAman } from './qr';

const req = (headers: Record<string, string>, remote = '127.0.0.1') =>
  ({ headers, socket: { remoteAddress: remote } }) as unknown as IncomingMessage;

test('QR code is 22 random letters or digits', () => {
  const a = buatKodeQr();
  expect(a).toMatch(/^[A-Za-z0-9]{22}$/);
  expect(a).not.toBe(buatKodeQr());
});

test('samaAman compares exactly', () => {
  expect(samaAman('abc', 'abc')).toBe(true);
  expect(samaAman('abc', 'abd')).toBe(false);
  expect(samaAman('abc', 'abcd')).toBe(false);
});

test('ipPengirim trusts only the last X-Forwarded-For entry', () => {
  expect(ipPengirim(req({ 'x-forwarded-for': '114.10.1.1, 8.8.8.8' }))).toBe('8.8.8.8');
  expect(ipPengirim(req({ 'x-forwarded-for': '114.10.1.1' }))).toBe('114.10.1.1');
  expect(ipPengirim(req({}, '192.168.137.5'))).toBe('192.168.137.5');
  expect(ipPengirim(req({}, '::ffff:192.168.137.5'))).toBe('192.168.137.5');
});

test('BatasLaju allows 50 per minute, then frees up', () => {
  const clock = { t: 0, now() { return this.t; } };
  const b = new BatasLaju(clock);
  for (let i = 0; i < 50; i++) expect(b.boleh()).toBe(true);
  expect(b.boleh()).toBe(false);
  clock.t = 60_000;
  expect(b.boleh()).toBe(true);
});

test('rentangTerkecil covers a CGNAT pool and refuses anything wider than /16 or /48', () => {
  expect(rentangTerkecil(['100.88.121.3', '100.88.125.249', '100.88.126.26'])).toBe('100.88.120.0/21');
  expect(rentangTerkecil(['1.2.3.4'])).toBe('1.2.3.4/32');
  expect(rentangTerkecil(['1.0.0.1', '200.0.0.1'])).toBeNull();
  expect(rentangTerkecil(['2001:db8:1:2::5', '2001:db8:1:2:abcd::9'])).toBe('2001:db8:1:2:0:0:0:0/64');
  expect(rentangTerkecil(['2001:db8::1', '2001:db9::1'])).toBeNull();
  expect(rentangTerkecil(['1.2.3.4', '2001:db8::1'])).toBeNull();
  expect(rentangTerkecil(['bukan-ip'])).toBeNull();
  expect(rentangTerkecil([])).toBeNull();
});

test('entriValid accepts IPs and ranges no wider than /16 (IPv4) or /48 (IPv6)', () => {
  expect(entriValid('100.88.1.1')).toBe(true);
  expect(entriValid('100.88.112.0/20')).toBe(true);
  expect(entriValid('10.0.0.0/8')).toBe(false);
  expect(entriValid('0.0.0.0/0')).toBe(false);
  expect(entriValid('2001:db8::/48')).toBe(true);
  expect(entriValid('2001:db8::/32')).toBe(false);
  expect(entriValid('1.2.3.4/33')).toBe(false);
  expect(entriValid('1.2.3.4/x')).toBe(false);
  expect(entriValid('bukan-ip')).toBe(false);
});

test('ipDiizinkan matches ranges, exact IPv4 and IPv6 by /64', () => {
  const daftar = ['100.88.120.0/21', '114.10.1.1', '2001:db8:1:2::5'];
  expect(ipDiizinkan(daftar, '100.88.126.26')).toBe(true);
  expect(ipDiizinkan(daftar, '100.88.128.1')).toBe(false);
  expect(ipDiizinkan(daftar, '114.10.1.1')).toBe(true);
  expect(ipDiizinkan(daftar, '114.10.1.2')).toBe(false);
  expect(ipDiizinkan(daftar, '2001:db8:1:2:ffff::1')).toBe(true);
});

test('CatatanTolak keeps the newest 20 distinct IPs, newest first', () => {
  const c = new CatatanTolak();
  for (let i = 0; i < 25; i++) c.catat(`10.0.0.${i}`, i);
  c.catat('10.0.0.10', 100);
  const d = c.daftar();
  expect(d).toHaveLength(20);
  expect(d[0]).toEqual({ ip: '10.0.0.10', waktu: 100 });
  expect(d.filter((x) => x.ip === '10.0.0.10')).toHaveLength(1);
});
