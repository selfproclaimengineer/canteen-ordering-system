import request from 'supertest';
import { buatTestApp, login } from '../testing';

test('admin sees the installed version and can restart the server to pull an update', async () => {
  let keluar = 0;
  const { app } = buatTestApp({ versi: 'v12', keluar: () => keluar++ });
  expect((await request(app).post('/api/admin/perbarui')).status).toBe(401);
  const admin = { Authorization: `Bearer ${await login(app, 'admin')}` };
  expect((await request(app).get('/api/admin/versi').set(admin)).body).toEqual({ versi: 'v12' });
  const res = await request(app).post('/api/admin/perbarui').set(admin);
  expect(res.status).toBe(200);
  expect(keluar).toBe(1);
});
