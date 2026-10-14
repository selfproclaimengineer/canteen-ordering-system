import { Router } from 'express';
import { waktuAmbilTersedia } from '../../shared/rules';
import type { Ctx } from '../context';
import { daftarMenuPublik } from '../menu-repo';
import { getPengaturan } from '../settings';

export function menuRoutes(ctx: Ctx): Router {
  const r = Router();

  r.get('/menu', (_req, res) => {
    // The static staff link page on GitHub Pages checks the server answers before redirecting (pages/404.html).
    res.setHeader('Access-Control-Allow-Origin', '*');
    const now = ctx.clock.now();
    const { jam, qty_max } = getPengaturan(ctx.db);
    res.json({
      server_now: now,
      jam,
      qty_max,
      waktu_tersedia: waktuAmbilTersedia(now, jam),
      menu: daftarMenuPublik(ctx.db, now),
    });
  });

  return r;
}
