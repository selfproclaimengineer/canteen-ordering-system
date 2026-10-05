import { Router } from 'express';
import { pinLoginSchema } from '../../shared/schemas';
import { cocokPin } from '../auth';
import type { Ctx } from '../context';
import { HttpError, parse } from '../http';
import { getSetting } from '../settings';

export function authRoutes(ctx: Ctx): Router {
  const r = Router();

  r.post('/auth/pin', (req, res) => {
    const body = parse(pinLoginSchema, req.body);
    const sisa = ctx.guard.sisaKunciMs();
    if (sisa > 0) throw new HttpError(429, 'PIN terkunci', { sisa_detik: Math.ceil(sisa / 1000) });

    const stored = getSetting(ctx.db, `pin_${body.peran}_hash`);
    if (!stored) throw new HttpError(503, 'PIN belum diatur');

    if (cocokPin(body.pin, stored)) {
      ctx.guard.catatBerhasil();
      res.json({ token: ctx.tokens.buat(body.peran), peran: body.peran });
      return;
    }

    if (ctx.guard.catatGagal()) {
      ctx.emit({ type: 'pin-alert', device: body.device });
      throw new HttpError(429, 'PIN terkunci', { sisa_detik: Math.ceil(ctx.guard.sisaKunciMs() / 1000) });
    }
    throw new HttpError(401, 'PIN salah');
  });

  return r;
}
