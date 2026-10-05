import request from 'supertest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setSetting } from '../settings';
import { buatTestApp, PIN_DAPUR } from '../testing';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'kantin-funnel-'));
  writeFileSync(join(dir, 'index.html'), '<html>kantin</html>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'a.js'), 'x');
  return buatTestApp({ staticDir: dir });
}
const FUNNEL = { 'Tailscale-Funnel-Request': '?1', 'X-Forwarded-For': '114.10.1.1' };

test.each([
  ['POST', '/api/orders'],
  ['POST', '/api/auth/pin'],
  ['GET', '/api/orders?tab=sekarang'],
  ['GET', '/api/siap'],
  ['GET', '/api/admin/menu'],
  ['GET', '/api/dapur/qr'],
  ['GET', '/'],
  ['GET', '/dapur'],
  ['GET', '/.git/HEAD'],
  ['GET', '/api/qr/ip-saya'],
])('Funnel request to %s %s is 404', async (method, path) => {
  const { app } = setup();
  const r = method === 'GET' ? request(app).get(path) : request(app).post(path).send({});
  const res = await r.set(FUNNEL);
  expect(res.status).toBe(404);
});

test('Funnel request may load the QR page, its assets and the menu', async () => {
  const { app } = setup();
  expect((await request(app).get('/pesan/abc').set(FUNNEL)).text).toContain('kantin');
  expect((await request(app).get('/assets/a.js').set(FUNNEL)).status).toBe(200);
  expect((await request(app).get('/api/menu').set(FUNNEL)).status).toBe(200);
});

test('local request without the header still reaches the staff surface', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/auth/pin').send({ peran: 'dapur', pin: PIN_DAPUR, device: 'X' });
  expect(res.status).toBe(200);
  expect((await request(app).get('/dapur')).status).toBe(200);
});

test('responses do not advertise Express', async () => {
  const { app } = setup();
  expect((await request(app).get('/api/menu')).headers['x-powered-by']).toBeUndefined();
});

test('with QR on, a LAN request from outside the hotspot is treated as public (review Critical 1)', async () => {
  // supertest connects from 127.0.0.1, which is outside this trusted list.
  const t = buatTestApp({ lokal: ['10.99.0.0/16'] });
  setSetting(t.db, 'qr_alamat', 'https://x.ts.net');
  setSetting(t.db, 'qr_kode', 'K'.repeat(22));
  expect((await request(t.app).post('/api/auth/pin').send({ peran: 'dapur', pin: PIN_DAPUR, device: 'X' })).status).toBe(404);
  expect((await request(t.app).get('/api/menu')).status).toBe(200);
});

test('with QR off, the same LAN request is trusted (offline hotspot variant)', async () => {
  const t = buatTestApp({ lokal: ['10.99.0.0/16'] });
  expect((await request(t.app).post('/api/auth/pin').send({ peran: 'dapur', pin: PIN_DAPUR, device: 'X' })).status).toBe(200);
});

test.each(['/assets/../index.html', '/pesan/..%2fx', '/assets/%2e%2e/a.js', '/assets/a%5c..%5cx'])(
  'public request with traversal path %s is 404',
  async (path) => {
    const { app } = setup();
    expect((await request(app).get(path).set(FUNNEL)).status).toBe(404);
  },
);

test('HEAD on the QR page answers like GET (link previews)', async () => {
  const { app } = setup();
  expect((await request(app).head('/pesan/abc').set(FUNNEL)).status).toBe(200);
});
