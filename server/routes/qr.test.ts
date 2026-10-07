import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { run } from '../db';
import { ambilOrder } from '../order-repo';
import { setSetting } from '../settings';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

const KODE = 'KodeRahasia1234567890a';
const SEKOLAH = '114.10.1.1';
const lewat = (ip = SEKOLAH) => ({ 'Tailscale-Funnel-Request': '?1', 'X-Forwarded-For': ip });

// Most tests here exercise the school-network check, so it is switched on unless a test says otherwise.
function setup(opts: { fetchFn?: typeof fetch; hanyaSekolah?: boolean } = {}) {
  const t = buatTestApp({ hanyaSekolah: true, ...opts });
  const s = seedMenu(t.db, PAGI);
  setSetting(t.db, 'qr_alamat', 'https://kantin.test.ts.net');
  setSetting(t.db, 'qr_kode', KODE);
  setSetting(t.db, 'qr_buka', '1');
  setSetting(t.db, 'qr_ip', JSON.stringify([SEKOLAH]));
  const body = (device = 'QR-aaaa1111', client_uuid = randomUUID()) => ({
    client_uuid, waktu_ambil: 'sekarang', device, items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }],
  });
  const pesan = (b: object, headers: Record<string, string> = lewat(), kode = KODE) =>
    request(t.app).post(`/api/qr/${kode}/orders`).set(headers).send({ nama: 'Budi', ...b });
  return { ...t, s, body, pesan };
}

test('QR order from the school WiFi is created with source qr', async () => {
  const { pesan, body, db } = setup();
  const res = await pesan(body());
  expect(res.status).toBe(201);
  expect(ambilOrder(db, res.body.id)!.sumber).toBe('qr');
});

test('wrong code and disabled feature are 404 (Review Focus 5)', async () => {
  const { pesan, body, db, app } = setup();
  expect((await pesan(body(), lewat(), 'SalahKode1234567890abc')).status).toBe(404);
  setSetting(db, 'qr_alamat', '');
  expect((await pesan(body())).status).toBe(404);
  expect((await request(app).get(`/api/qr/${KODE}/info`).set(lewat())).status).toBe(404);
});

test('closed QR is 403', async () => {
  const { pesan, body, db } = setup();
  setSetting(db, 'qr_buka', '0');
  const res = await pesan(body());
  expect(res.status).toBe(403);
  expect(res.body.error).toBe('QR tutup');
});

test('Funnel request from outside the school is 403, even with a forged first XFF entry (Review Focus 1)', async () => {
  const { pesan, body } = setup();
  const luar = await pesan(body(), lewat('8.8.8.8'));
  expect(luar.status).toBe(403);
  expect(luar.body.error).toBe('Bukan WiFi sekolah');
  expect((await pesan(body(), lewat(`${SEKOLAH}, 8.8.8.8`))).status).toBe(403);
});

test('local request (hotspot, no Funnel header) skips the IP check', async () => {
  const { pesan, body } = setup();
  expect((await pesan(body(), {})).status).toBe(201);
});

test('one active QR order per device; retry of the same order is not blocked (Review Focus 2)', async () => {
  const { pesan, body, app } = setup();
  const pertama = body();
  const a = await pesan(pertama);
  expect(a.status).toBe(201);

  const ulang = await pesan(pertama);
  expect(ulang.status).toBe(200);
  expect(ulang.body.nomor).toBe(a.body.nomor);

  const kedua = await pesan(body());
  expect(kedua.status).toBe(409);
  expect(kedua.body.error).toBe('Masih ada pesanan aktif');
  expect((await pesan(body('QR-bbbb2222'))).status).toBe(201);

  const dapur = await login(app, 'dapur');
  await request(app).post(`/api/orders/${a.body.id}/siap`).set({ Authorization: `Bearer ${dapur}` });
  expect((await pesan(body())).status).toBe(201);
});

test('global limit: 51st QR order within a minute is 429; counter orders are not limited', async () => {
  const { pesan, body, app, s, clock } = setup();
  for (let i = 0; i < 50; i++) expect((await pesan(body(`QR-${String(i).padStart(8, '0')}`))).status).toBe(201);
  const lebih = await pesan(body('QR-zzzzzzzz'));
  expect(lebih.status).toBe(429);

  const kasir = await request(app).post('/api/orders').send({
    client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }],
  });
  expect(kasir.status).toBe(201);

  clock.maju(60_000);
  expect((await pesan(body('QR-zzzzzzzz'))).status).toBe(201);
});

test('status needs the matching client_uuid and only shows QR orders', async () => {
  const { pesan, body, app } = setup();
  const b = body();
  const o = await pesan(b);
  const status = (id: number, uuid: string) => request(app).get(`/api/qr/${KODE}/orders/${id}?uuid=${uuid}`).set(lewat());

  expect((await status(o.body.id, b.client_uuid)).body).toEqual({
    id: o.body.id, nomor: o.body.nomor, status: 'baru', total: 3000, nama: 'Budi', catatan: null,
    items: [{ nama: 'Es Teh', qty: 1, pilihan: [], batal: false }],
  });
  expect((await status(o.body.id, randomUUID())).status).toBe(404);

  const kasirUuid = randomUUID();
  const kasir = await request(app).post('/api/orders').send({
    client_uuid: kasirUuid, waktu_ambil: 'sekarang', device: 'Order 1', items: [{ menu_id: 2, qty: 1, pilihan_ids: [] }],
  });
  expect((await status(kasir.body.id, kasirUuid)).status).toBe(404);
});

test('student can cancel within 10 s through the QR route', async () => {
  const { pesan, body, app } = setup();
  const b = body();
  const o = await pesan(b);
  const res = await request(app).post(`/api/qr/${KODE}/orders/${o.body.id}/cancel`).set(lewat()).send({ client_uuid: b.client_uuid });
  expect(res.body).toEqual({ status: 'batal' });
});

test('info reports open state and network check', async () => {
  const { app } = setup();
  expect((await request(app).get(`/api/qr/${KODE}/info`).set(lewat())).body).toEqual({ buka: true, jaringan_ok: true, ip: SEKOLAH });
  expect((await request(app).get(`/api/qr/${KODE}/info`).set(lewat('8.8.8.8'))).body).toEqual({ buka: true, jaringan_ok: false, ip: '8.8.8.8' });
});

test('kitchen switch needs the kitchen PIN and closes QR ordering', async () => {
  const { app, pesan, body } = setup();
  expect((await request(app).put('/api/dapur/qr').send({ buka: false })).status).toBe(401);
  const auth = { Authorization: `Bearer ${await login(app, 'dapur')}` };
  expect((await request(app).get('/api/dapur/qr').set(auth)).body).toEqual({ aktif: true, buka: true });
  expect((await request(app).put('/api/dapur/qr').set(auth).send({ buka: false })).body).toEqual({ buka: false });
  expect((await pesan(body())).status).toBe(403);
});

test('admin sets the address, gets a code, replaces the code and edits IPs', async () => {
  const { app, db, pesan, body } = setup();
  setSetting(db, 'qr_kode', '');
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };

  const atur = await request(app).put('/api/admin/qr').set(auth).send({ alamat: 'https://kantin.x.ts.net/', buka: true });
  expect(atur.body.alamat).toBe('https://kantin.x.ts.net');
  expect(atur.body.kode).toMatch(/^[A-Za-z0-9]{22}$/);
  expect((await request(app).put('/api/admin/qr').set(auth).send({ alamat: 'ftp://x', buka: true })).status).toBe(400);

  const lama = atur.body.kode as string;
  const baru = (await request(app).post('/api/admin/qr/ganti-kode').set(auth)).body.kode as string;
  expect(baru).not.toBe(lama);
  expect((await pesan(body(), lewat(), lama)).status).toBe(404);

  expect((await request(app).put('/api/admin/qr/ip').set(auth).send({ ip: ['bukan-ip'] })).status).toBe(400);
  const ip = await request(app).put('/api/admin/qr/ip').set(auth).send({ ip: ['114.10.1.1', '114.10.1.1', '2001:db8::1'] });
  expect(ip.body.ip).toEqual(['114.10.1.1', '2001:db8::1']);
});

test('kitchen list carries the source', async () => {
  const { pesan, body, app } = setup();
  await pesan(body());
  const auth = { Authorization: `Bearer ${await login(app, 'dapur')}` };
  expect((await request(app).get('/api/orders?tab=sekarang').set(auth)).body.orders[0].sumber).toBe('qr');
});

test('IPv6 school address matches the whole /64 (review Important 3)', async () => {
  const { pesan, body, db } = setup();
  setSetting(db, 'qr_ip', JSON.stringify(['2001:db8:1:2::5']));
  expect((await pesan(body(), lewat('2001:db8:1:2:abcd::9'))).status).toBe(201);
  expect((await pesan(body('QR-cccc3333'), lewat('2001:db8:1:3::1'))).status).toBe(403);
});

test('QR cancel route refuses counter orders', async () => {
  const { app, s } = setup();
  const uuid = randomUUID();
  const kasir = await request(app).post('/api/orders').send({
    client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1', items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }],
  });
  const res = await request(app).post(`/api/qr/${KODE}/orders/${kasir.body.id}/cancel`).set(lewat()).send({ client_uuid: uuid });
  expect(res.status).toBe(404);
});

const echo = (hasil: Record<string, string | Error>) =>
  (async (url: string | URL | Request) => {
    const r = hasil[String(url)];
    if (r === undefined || r instanceof Error) throw r ?? new TypeError('fetch failed');
    return new Response(r, { status: 200 });
  }) as typeof fetch;

test('ambil-ip asks the IP echo services for the server public IPv4 and IPv6', async () => {
  const fetchFn = echo({ 'https://api.ipify.org': '114.10.7.7', 'https://api6.ipify.org': '2001:db8:1:2::9' });
  const { app } = setup({ fetchFn });
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };

  const res = await request(app).post('/api/admin/qr/ambil-ip').set(auth);
  expect(res.body.ip_baru).toEqual(['114.10.7.7', '2001:db8:1:2::9']);
  expect(res.body.ip).toEqual([SEKOLAH, '114.10.7.7', '2001:db8:1:2::9']);
  await request(app).post('/api/admin/qr/ambil-ip').set(auth);
  expect((await request(app).get('/api/admin/qr').set(auth)).body.ip).toEqual([SEKOLAH, '114.10.7.7', '2001:db8:1:2::9']);
});

test('ambil-ip keeps IPv4 when the network has no IPv6', async () => {
  const fetchFn = echo({ 'https://api.ipify.org': '114.10.7.7', 'https://api6.ipify.org': new TypeError('no route') });
  const { app } = setup({ fetchFn });
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };
  expect((await request(app).post('/api/admin/qr/ambil-ip').set(auth)).body.ip_baru).toEqual(['114.10.7.7']);
});

test('ambil-ip reports a clear error with the manual fallback when no answer is an IP', async () => {
  const fetchFn = echo({ 'https://api.ipify.org': '<html>captive portal</html>' });
  const { app } = setup({ fetchFn });
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };
  const res = await request(app).post('/api/admin/qr/ambil-ip').set(auth);
  expect(res.status).toBe(502);
  expect(res.body.error).toContain('manual');
  expect((await request(app).get('/api/admin/qr').set(auth)).body.ip).toEqual([SEKOLAH]);
});

test('rejected network IPs are listed for the admin, and a range lets them in', async () => {
  const { app, pesan, body } = setup();
  await request(app).get(`/api/qr/${KODE}/info`).set(lewat('100.88.121.3'));
  expect((await pesan(body(), lewat('100.88.126.26'))).status).toBe(403);

  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };
  const ditolak = await request(app).get('/api/admin/qr/ditolak').set(auth);
  expect(ditolak.body.map((d: { ip: string }) => d.ip)).toEqual(['100.88.126.26', '100.88.121.3']);

  const res = await request(app).post('/api/admin/qr/izinkan-rentang').set(auth).send({ ip: ['100.88.121.3', '100.88.126.26'] });
  expect(res.body.rentang).toBe('100.88.120.0/21');
  expect(res.body.ip).toEqual([SEKOLAH, '100.88.120.0/21']);
  expect((await pesan(body(), lewat('100.88.123.9'))).status).toBe(201);
});

test('too-wide ranges are refused, manual ranges are accepted', async () => {
  const { app } = setup();
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };
  const lebar = await request(app).post('/api/admin/qr/izinkan-rentang').set(auth).send({ ip: ['1.0.0.1', '200.0.0.1'] });
  expect(lebar.status).toBe(400);
  expect((await request(app).put('/api/admin/qr/ip').set(auth).send({ ip: ['10.0.0.0/8'] })).status).toBe(400);
  expect((await request(app).put('/api/admin/qr/ip').set(auth).send({ ip: ['100.88.112.0/20'] })).body.ip).toEqual(['100.88.112.0/20']);
});

test('the rejected list is admin-only and not public', async () => {
  const { app } = setup();
  expect((await request(app).get('/api/admin/qr/ditolak')).status).toBe(401);
  expect((await request(app).get('/api/admin/qr/ditolak').set(lewat())).status).toBe(404);
});

test('orders rejected after the rate check (sold out) give their slot back', async () => {
  const { pesan, app, s, db } = setup();
  run(db, 'UPDATE menu SET tersedia = 0 WHERE id = ?', s.mie);
  const habis = (i: number) => ({
    client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: `QR-h${String(i).padStart(7, '0')}`,
    items: [{ menu_id: s.mie, qty: 1, pilihan_ids: [] }],
  });
  for (let i = 0; i < 10; i++) expect((await pesan(habis(i))).status).toBe(409);
  const ok = (i: number) => ({
    client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: `QR-o${String(i).padStart(7, '0')}`,
    items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }],
  });
  for (let i = 0; i < 50; i++) expect((await pesan(ok(i))).status).toBe(201);
  void app;
});

test('QR order response carries the status', async () => {
  const { pesan, body } = setup();
  expect((await pesan(body())).body.status).toBe('baru');
});

test('QR orders need a name of at most 10 letters; it reaches the kitchen and the status', async () => {
  const { app, pesan, body, db } = setup();
  const tanpa = await request(app).post(`/api/qr/${KODE}/orders`).set(lewat()).send(body());
  expect(tanpa.status).toBe(400);
  expect(tanpa.body.error).toBe('Isi nama (maks 10 huruf)');
  expect((await pesan({ ...body('QR-n1'), nama: '   ' })).status).toBe(400);
  expect((await pesan({ ...body('QR-n2'), nama: 'Bartholomew' })).status).toBe(400);
  expect((await pesan({ ...body('QR-n3'), nama: '<b>x</b>' })).status).toBe(400);

  const b = body('QR-n4');
  const ok = await pesan({ ...b, nama: '  Siti A.  ' });
  expect(ok.status).toBe(201);
  expect(ambilOrder(db, ok.body.id)!.nama).toBe('Siti A.');
  const status = await request(app).get(`/api/qr/${KODE}/orders/${ok.body.id}?uuid=${b.client_uuid}`).set(lewat());
  expect(status.body.nama).toBe('Siti A.');
  const auth = { Authorization: `Bearer ${await login(app, 'dapur')}` };
  expect((await request(app).get('/api/orders?tab=sekarang').set(auth)).body.orders[0].nama).toBe('Siti A.');
});

test('counter orders keep no name even if one is sent', async () => {
  const { app, s, db } = setup();
  const res = await request(app).post('/api/orders').send({
    client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', nama: 'Budi', items: [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }],
  });
  expect(ambilOrder(db, res.body.id)!.nama).toBeNull();
});

test('with the school-network check off (the default), QR orders come from any network', async () => {
  const { app, pesan, body } = setup({ hanyaSekolah: false });
  expect((await pesan(body(), lewat('8.8.8.8'))).status).toBe(201);
  expect((await request(app).get(`/api/qr/${KODE}/info`).set(lewat('8.8.8.8'))).body.jaringan_ok).toBe(true);
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };
  expect((await request(app).get('/api/admin/qr').set(auth)).body.cek_jaringan).toBe(false);
});

test('admin settings say when the school-network check is on', async () => {
  const { app } = setup();
  const auth = { Authorization: `Bearer ${await login(app, 'admin')}` };
  expect((await request(app).get('/api/admin/qr').set(auth)).body.cek_jaringan).toBe(true);
});

test('QR info may be read by the static GitHub Pages QR page (CORS)', async () => {
  const { app } = setup({ hanyaSekolah: false });
  const res = await request(app).get(`/api/qr/${KODE}/info`);
  expect(res.headers['access-control-allow-origin']).toBe('*');
});

test('the student sees what they ordered, with options and note, but not the kitchen ticks', async () => {
  const { pesan, body, app, s } = setup({ hanyaSekolah: false });
  const b = { ...body(), catatan: 'sambal dipisah', items: [{ menu_id: s.mie, qty: 2, pilihan_ids: [s.pedas[3], s.telur] }, { menu_id: s.esTeh, qty: 1, pilihan_ids: [] }] };
  const o = await pesan(b);
  const res = await request(app).get(`/api/qr/${KODE}/orders/${o.body.id}?uuid=${b.client_uuid}`);
  expect(res.body.catatan).toBe('sambal dipisah');
  expect(res.body.items).toEqual([
    { nama: 'Mie Goreng', qty: 2, pilihan: ['Kepedasan 3', 'Ukuran Kecil', 'Topping Telur'], batal: false },
    { nama: 'Es Teh', qty: 1, pilihan: [], batal: false },
  ]);
  expect(JSON.stringify(res.body)).not.toContain('siap_at');
});
