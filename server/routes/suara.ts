import express, { Router } from 'express';
import type { Ctx } from '../context';
import { get, run } from '../db';
import { HttpError } from '../http';

const JENIS = ['masuk', 'jadi'] as const;
type Jenis = (typeof JENIS)[number];

function jenis(v: string): Jenis {
  if (!(JENIS as readonly string[]).includes(v)) throw new HttpError(400, 'Jenis suara tidak dikenal');
  return v as Jenis;
}

/** Notification sounds: 'masuk' rings on kitchen phones for a new order, 'jadi' on the QR page when it is ready. */
export function suaraRoutes(ctx: Ctx): Router {
  const r = Router();

  // Version per slot (null = built-in beep), so clients reload the file only when it changes.
  r.get('/suara', (_req, res) => {
    const versi = (j: Jenis) => get<{ t: number }>(ctx.db, 'SELECT diubah_at AS t FROM suara WHERE jenis = ?', j)?.t ?? null;
    res.json({ masuk: versi('masuk'), jadi: versi('jadi') });
  });

  r.get('/suara/:jenis', (req, res) => {
    const s = get<{ mime: string; data: Uint8Array }>(ctx.db, 'SELECT mime, data FROM suara WHERE jenis = ?', jenis(req.params.jenis));
    if (!s) throw new HttpError(404, 'Belum ada suara');
    res.setHeader('Content-Type', s.mime);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(Buffer.from(s.data));
  });

  return r;
}

export function adminSuaraRoutes(ctx: Ctx): Router {
  const r = Router();

  r.put('/suara/:jenis', express.raw({ type: () => true, limit: '1mb' }), (req, res) => {
    const j = jenis(req.params.jenis);
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!/^audio\/[a-z0-9.+-]+$/.test(mime)) throw new HttpError(415, 'Harus file suara');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'File kosong');
    run(
      ctx.db,
      `INSERT INTO suara (jenis, mime, data, diubah_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(jenis) DO UPDATE SET mime = excluded.mime, data = excluded.data, diubah_at = excluded.diubah_at`,
      j, mime, req.body, ctx.clock.now(),
    );
    ctx.emit({ type: 'menu-changed' });
    res.json({ ok: true });
  });

  r.delete('/suara/:jenis', (req, res) => {
    run(ctx.db, 'DELETE FROM suara WHERE jenis = ?', jenis(req.params.jenis));
    ctx.emit({ type: 'menu-changed' });
    res.json({ ok: true });
  });

  return r;
}
