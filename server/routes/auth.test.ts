import request from 'supertest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buatTestApp, PIN_ADMIN, PIN_DAPUR } from '../testing';

const kirim = (app: Parameters<typeof request>[0], peran: string, pin: string, device = 'Order 1') =>
  request(app).post('/api/auth/pin').send({ peran, pin, device });

test('correct PIN returns a token', async () => {
  const { app } = buatTestApp();
  const res = await kirim(app, 'dapur', PIN_DAPUR);
  expect(res.status).toBe(200);
  expect(res.body.peran).toBe('dapur');
  expect(res.body.token).toMatch(/^[0-9a-f]{48}$/);
});

test('dapur PIN does not open admin', async () => {
  const { app } = buatTestApp();
  expect((await kirim(app, 'admin', PIN_DAPUR)).status).toBe(401);
  expect((await kirim(app, 'admin', PIN_ADMIN)).status).toBe(200);
});

test('malformed PIN is 400', async () => {
  const { app } = buatTestApp();
  const res = await kirim(app, 'dapur', '12');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('PIN harus 6 angka');
});

test('5 wrong PINs lock for 60 s, alert kitchens, then unlock', async () => {
  const { app, clock, events } = buatTestApp();
  for (let i = 0; i < 4; i++) expect((await kirim(app, 'dapur', '000000')).status).toBe(401);

  const kunci = await kirim(app, 'dapur', '000000', 'Order 2');
  expect(kunci.status).toBe(429);
  expect(kunci.body).toEqual({ error: 'PIN terkunci', sisa_detik: 60 });
  expect(events).toContainEqual({ type: 'pin-alert', device: 'Order 2' });

  // Correct PIN is still refused while locked.
  expect((await kirim(app, 'dapur', PIN_DAPUR)).status).toBe(429);

  clock.maju(60_000);
  expect((await kirim(app, 'dapur', PIN_DAPUR)).status).toBe(200);
});

test('invalid JSON is 400', async () => {
  const { app } = buatTestApp();
  const res = await request(app).post('/api/auth/pin').set('Content-Type', 'application/json').send('{bad');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('JSON tidak valid');
});

test('unknown API path is 404 JSON', async () => {
  const { app } = buatTestApp();
  const res = await request(app).get('/api/nope');
  expect(res.status).toBe(404);
  expect(res.body.error).toBe('Tidak ditemukan');
});

test('SPA fallback serves index.html for non-API GET', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kantin-static-'));
  writeFileSync(join(dir, 'index.html'), '<html>kantin</html>');
  const { app } = buatTestApp({ staticDir: dir });
  const res = await request(app).get('/dapur');
  expect(res.status).toBe(200);
  expect(res.text).toContain('kantin');
});
