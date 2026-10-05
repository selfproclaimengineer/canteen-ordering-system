import { Router } from 'express';
import {
  grupSchema,
  idsSchema,
  menuGrupSchema,
  menuSchema,
  pilihanSchema,
  pilihanUbahSchema,
  tersediaSchema,
} from '../../shared/schemas';
import type { Ctx } from '../context';
import { get, run, tx, type Db } from '../db';
import { HttpError, idParam, parse } from '../http';
import { daftarMenuAdmin } from '../menu-repo';

function aktif(db: Db, tabel: 'menu' | 'grup' | 'pilihan', id: number): boolean {
  return get(db, `SELECT 1 AS x FROM ${tabel} WHERE id = ? AND dihapus_at IS NULL`, id) !== undefined;
}

function wajibAktif(db: Db, tabel: 'menu' | 'grup' | 'pilihan', id: number): void {
  const nama = { menu: 'Menu', grup: 'Grup', pilihan: 'Pilihan' }[tabel];
  if (!aktif(db, tabel, id)) throw new HttpError(404, `${nama} tidak ditemukan`);
}

export function adminMenuRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  const berubah = () => ctx.emit({ type: 'menu-changed' });

  r.get('/menu', (_req, res) => {
    res.json(daftarMenuAdmin(db));
  });

  r.post('/menu', (req, res) => {
    const m = parse(menuSchema, req.body);
    const id = run(
      db,
      'INSERT INTO menu (nama, harga, tersedia, urutan, dibuat_at) VALUES (?, ?, ?, ?, ?)',
      m.nama, m.harga, m.tersedia ? 1 : 0, m.urutan, ctx.clock.now(),
    ).lastInsertRowid;
    berubah();
    res.status(201).json({ id });
  });

  r.put('/menu/:id', (req, res) => {
    const id = idParam(req.params.id);
    const m = parse(menuSchema, req.body);
    wajibAktif(db, 'menu', id);
    run(db, 'UPDATE menu SET nama = ?, harga = ?, tersedia = ?, urutan = ? WHERE id = ?', m.nama, m.harga, m.tersedia ? 1 : 0, m.urutan, id);
    berubah();
    res.json({ ok: true });
  });

  r.post('/menu/hapus', (req, res) => {
    const { ids } = parse(idsSchema, req.body);
    const now = ctx.clock.now();
    tx(db, () => {
      for (const id of ids) run(db, 'UPDATE menu SET dihapus_at = ? WHERE id = ? AND dihapus_at IS NULL', now, id);
    });
    berubah();
    res.json({ ok: true });
  });

  r.post('/menu/tersedia', (req, res) => {
    const { ids, tersedia } = parse(tersediaSchema, req.body);
    tx(db, () => {
      for (const id of ids) run(db, 'UPDATE menu SET tersedia = ? WHERE id = ?', tersedia ? 1 : 0, id);
    });
    berubah();
    res.json({ ok: true });
  });

  r.put('/menu/:id/grup', (req, res) => {
    const id = idParam(req.params.id);
    const { grup_ids } = parse(menuGrupSchema, req.body);
    wajibAktif(db, 'menu', id);
    const unik = [...new Set(grup_ids)];
    if (!unik.every((g) => aktif(db, 'grup', g))) throw new HttpError(400, 'Grup tidak valid');
    tx(db, () => {
      run(db, 'DELETE FROM menu_grup WHERE menu_id = ?', id);
      unik.forEach((g, i) => run(db, 'INSERT INTO menu_grup (menu_id, grup_id, urutan) VALUES (?, ?, ?)', id, g, i));
    });
    berubah();
    res.json({ ok: true });
  });

  r.post('/grup', (req, res) => {
    const g = parse(grupSchema, req.body);
    const id = run(db, 'INSERT INTO grup (nama, widget, urutan) VALUES (?, ?, ?)', g.nama, g.widget, g.urutan).lastInsertRowid;
    berubah();
    res.status(201).json({ id });
  });

  r.put('/grup/:id', (req, res) => {
    const id = idParam(req.params.id);
    const g = parse(grupSchema, req.body);
    wajibAktif(db, 'grup', id);
    run(db, 'UPDATE grup SET nama = ?, widget = ?, urutan = ? WHERE id = ?', g.nama, g.widget, g.urutan, id);
    berubah();
    res.json({ ok: true });
  });

  r.delete('/grup/:id', (req, res) => {
    const id = idParam(req.params.id);
    wajibAktif(db, 'grup', id);
    run(db, 'UPDATE grup SET dihapus_at = ? WHERE id = ?', ctx.clock.now(), id);
    berubah();
    res.json({ ok: true });
  });

  r.post('/pilihan', (req, res) => {
    const p = parse(pilihanSchema, req.body);
    if (!aktif(db, 'grup', p.grup_id)) throw new HttpError(400, 'Grup tidak valid');
    const id = run(
      db,
      'INSERT INTO pilihan (grup_id, label, harga, urutan) VALUES (?, ?, ?, ?)',
      p.grup_id, p.label, p.harga, p.urutan,
    ).lastInsertRowid;
    berubah();
    res.status(201).json({ id });
  });

  r.put('/pilihan/:id', (req, res) => {
    const id = idParam(req.params.id);
    const p = parse(pilihanUbahSchema, req.body);
    wajibAktif(db, 'pilihan', id);
    run(db, 'UPDATE pilihan SET label = ?, harga = ?, urutan = ? WHERE id = ?', p.label, p.harga, p.urutan, id);
    berubah();
    res.json({ ok: true });
  });

  r.delete('/pilihan/:id', (req, res) => {
    const id = idParam(req.params.id);
    wajibAktif(db, 'pilihan', id);
    run(db, 'UPDATE pilihan SET dihapus_at = ? WHERE id = ?', ctx.clock.now(), id);
    berubah();
    res.json({ ok: true });
  });

  return r;
}
