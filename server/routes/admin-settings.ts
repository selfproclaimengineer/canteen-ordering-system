import { Router } from 'express';
import { gantiPinSchema, pengaturanSchema } from '../../shared/schemas';
import { hashPin } from '../auth';
import type { Ctx } from '../context';
import { tx } from '../db';
import { parse } from '../http';
import { getPengaturan, setSetting } from '../settings';

export function adminSettingsRoutes(ctx: Ctx): Router {
  const r = Router();

  r.get('/pengaturan', (_req, res) => {
    const { jam, qty_max } = getPengaturan(ctx.db);
    res.json({ jam_ist1: jam.ist1, jam_ist2: jam.ist2, qty_max });
  });

  r.put('/pengaturan', (req, res) => {
    const p = parse(pengaturanSchema, req.body);
    tx(ctx.db, () => {
      setSetting(ctx.db, 'jam_ist1', p.jam_ist1);
      setSetting(ctx.db, 'jam_ist2', p.jam_ist2);
      setSetting(ctx.db, 'qty_max', String(p.qty_max));
    });
    ctx.emit({ type: 'menu-changed' });
    res.json({ ok: true });
  });

  r.get('/versi', (_req, res) => {
    res.json({ versi: ctx.versi });
  });

  // Only useful under scripts/jalan.sh, which restarts the server and installs a newer release first.
  r.post('/perbarui', (_req, res) => {
    res.json({ ok: true });
    ctx.keluar();
  });

  r.put('/pin', (req, res) => {
    const { peran, pin_baru } = parse(gantiPinSchema, req.body);
    setSetting(ctx.db, `pin_${peran}_hash`, hashPin(pin_baru));
    ctx.tokens.cabutSemua(peran);
    res.json({ ok: true });
  });

  return r;
}
