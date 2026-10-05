import request from 'supertest';
import { buatTestApp, login } from '../testing';

async function setup() {
  const t = buatTestApp();
  const admin = await login(t.app, 'admin');
  const auth = { Authorization: `Bearer ${admin}` };
  return { ...t, auth };
}

test('read and change break times and qty_max', async () => {
  const { app, auth, events } = await setup();
  expect((await request(app).get('/api/admin/pengaturan').set(auth)).body).toEqual({ jam_ist1: '09:30', jam_ist2: '12:00', qty_max: 10 });

  const res = await request(app).put('/api/admin/pengaturan').set(auth).send({ jam_ist1: '10:00', jam_ist2: '12:30', qty_max: 5 });
  expect(res.status).toBe(200);
  expect(events).toContainEqual({ type: 'menu-changed' });

  const menu = await request(app).get('/api/menu');
  expect(menu.body.jam).toEqual({ ist1: '10:00', ist2: '12:30' });
  expect(menu.body.qty_max).toBe(5);
});

test('invalid settings are 400', async () => {
  const { app, auth } = await setup();
  expect((await request(app).put('/api/admin/pengaturan').set(auth).send({ jam_ist1: '25:00', jam_ist2: '12:00', qty_max: 5 })).status).toBe(400);
});

test('changing the kitchen PIN revokes kitchen tokens and the old PIN stops working', async () => {
  const { app, auth } = await setup();
  const dapurLama = await login(app, 'dapur');

  expect((await request(app).put('/api/admin/pin').set(auth).send({ peran: 'dapur', pin_baru: '222222' })).status).toBe(200);

  expect((await request(app).get('/api/orders?tab=sekarang').set({ Authorization: `Bearer ${dapurLama}` })).status).toBe(401);
  expect((await request(app).post('/api/auth/pin').send({ peran: 'dapur', pin: '111111', device: 'X' })).status).toBe(401);
  expect((await request(app).post('/api/auth/pin').send({ peran: 'dapur', pin: '222222', device: 'X' })).status).toBe(200);
});

test('kitchen cannot change PINs', async () => {
  const { app } = await setup();
  const dapur = await login(app, 'dapur');
  const res = await request(app).put('/api/admin/pin').set({ Authorization: `Bearer ${dapur}` }).send({ peran: 'admin', pin_baru: '000000' });
  expect(res.status).toBe(403);
});
