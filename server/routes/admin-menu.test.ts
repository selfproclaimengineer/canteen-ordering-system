import request from 'supertest';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const token = await login(t.app, 'admin');
  const auth = { Authorization: `Bearer ${token}` };
  const api = {
    get: (p: string) => request(t.app).get(`/api/admin${p}`).set(auth),
    post: (p: string, b: object) => request(t.app).post(`/api/admin${p}`).set(auth).send(b),
    put: (p: string, b: object) => request(t.app).put(`/api/admin${p}`).set(auth).send(b),
    del: (p: string) => request(t.app).delete(`/api/admin${p}`).set(auth),
  };
  const publik = async () => (await request(t.app).get('/api/menu')).body.menu as { id: number; nama: string; harga: number; tersedia: boolean; grup: { nama: string; pilihan: { label: string; harga: number }[] }[] }[];
  return { ...t, s, api, publik };
}

test('kitchen token is 403, no token is 401', async () => {
  const { app } = await setup();
  const dapur = await login(app, 'dapur');
  expect((await request(app).get('/api/admin/menu').set({ Authorization: `Bearer ${dapur}` })).status).toBe(403);
  expect((await request(app).get('/api/admin/menu')).status).toBe(401);
});

test('create, update and list a menu', async () => {
  const { api, events, publik } = await setup();
  const created = await api.post('/menu', { nama: 'Bakso', harga: 8000 });
  expect(created.status).toBe(201);
  expect(events).toContainEqual({ type: 'menu-changed' });

  expect((await api.put(`/menu/${created.body.id}`, { nama: 'Bakso Urat', harga: 9000, tersedia: true, urutan: 5 })).status).toBe(200);
  const bakso = (await publik()).find((m) => m.id === created.body.id)!;
  expect(bakso).toMatchObject({ nama: 'Bakso Urat', harga: 9000, tersedia: true });

  const list = await api.get('/menu');
  expect(list.body.menu.find((m: { id: number }) => m.id === created.body.id).grup_ids).toEqual([]);
  expect(list.body.grup.map((g: { nama: string }) => g.nama)).toEqual(['Kepedasan', 'Ukuran', 'Topping', 'Saus']);
});

test('update of unknown menu is 404', async () => {
  const { api } = await setup();
  expect((await api.put('/menu/999', { nama: 'X', harga: 1 })).status).toBe(404);
});

test('bulk sold-out toggle and bulk delete', async () => {
  const { api, s, publik } = await setup();
  await api.post('/menu/tersedia', { ids: [s.mie, s.esTeh], tersedia: false });
  expect((await publik()).filter((m) => m.tersedia).length).toBe(0);

  await api.post('/menu/hapus', { ids: [s.esTeh, s.nasi] });
  expect((await publik()).map((m) => m.nama)).toEqual(['Mie Goreng']);
  expect((await api.put(`/menu/${s.esTeh}`, { nama: 'X', harga: 1 })).status).toBe(404);
});

test('attach groups in a given order; unknown group is 400', async () => {
  const { api, s, publik } = await setup();
  expect((await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [s.grupTopping, s.grupPedas] })).status).toBe(200);
  const esTeh = (await publik()).find((m) => m.id === s.esTeh)!;
  expect(esTeh.grup.map((g) => g.nama)).toEqual(['Topping', 'Kepedasan']);

  expect((await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [999] })).status).toBe(400);
  expect((await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [] })).status).toBe(200);
  expect((await publik()).find((m) => m.id === s.esTeh)!.grup).toEqual([]);
});

test('create group and options; empty price becomes free', async () => {
  const { api, s, publik } = await setup();
  const g = await api.post('/grup', { nama: 'Es', widget: 'option' });
  expect(g.status).toBe(201);
  await api.post('/pilihan', { grup_id: g.body.id, label: 'Normal', harga: null });
  await api.post('/pilihan', { grup_id: g.body.id, label: 'Banyak', harga: 500, urutan: 1 });
  await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [g.body.id] });

  const esTeh = (await publik()).find((m) => m.id === s.esTeh)!;
  expect(esTeh.grup[0].pilihan).toEqual([
    expect.objectContaining({ label: 'Normal', harga: 0 }),
    expect.objectContaining({ label: 'Banyak', harga: 500 }),
  ]);
});

test('option for unknown group is 400', async () => {
  const { api } = await setup();
  expect((await api.post('/pilihan', { grup_id: 999, label: 'X' })).status).toBe(400);
});

test('spice level can be removed and group deleted', async () => {
  const { api, s, publik } = await setup();
  expect((await api.del(`/pilihan/${s.pedas[5]}`)).status).toBe(200);
  let mie = (await publik()).find((m) => m.id === s.mie)!;
  expect(mie.grup[0].pilihan.map((p) => p.label)).toEqual(['0', '1', '2', '3', '4']);

  expect((await api.put(`/pilihan/${s.pedas[4]}`, { label: '4!', harga: 1000, urutan: 4 })).status).toBe(200);
  mie = (await publik()).find((m) => m.id === s.mie)!;
  expect(mie.grup[0].pilihan[4]).toMatchObject({ label: '4!', harga: 1000 });

  expect((await api.del(`/grup/${s.grupPedas}`)).status).toBe(200);
  mie = (await publik()).find((m) => m.id === s.mie)!;
  expect(mie.grup.map((g) => g.nama)).toEqual(['Ukuran', 'Topping']);
  expect((await api.del(`/grup/${s.grupPedas}`)).status).toBe(404);
  expect((await api.put(`/grup/${s.grupPedas}`, { nama: 'X', widget: 'option' })).status).toBe(404);
});

test('invalid widget is 400', async () => {
  const { api } = await setup();
  expect((await api.post('/grup', { nama: 'X', widget: 'slider' })).status).toBe(400);
});
