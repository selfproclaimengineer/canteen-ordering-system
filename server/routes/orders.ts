import { Router } from 'express';
import { totalOrder } from '../../shared/pricing';
import { batalPelangganSchema, centangSchema, orderBaruSchema, tabSchema } from '../../shared/schemas';
import type { Ctx } from '../context';
import { HttpError, idParam, parse, requireRole } from '../http';
import {
  ambilOrder,
  batalDapur,
  batalItem,
  batalPelanggan,
  buatOrder,
  centangItem,
  daftarDapur,
  siapTerbaru,
  tandaiSiap,
  undoSiap,
} from '../order-repo';
import { getPengaturan } from '../settings';

export function ordersRoutes(ctx: Ctx): Router {
  const r = Router();
  const dapur = requireRole(ctx, 'dapur');
  const berubah = (siap: boolean) => {
    ctx.emit({ type: 'orders-changed' });
    if (siap) ctx.emit({ type: 'siap-changed' });
  };

  r.post('/orders', (req, res) => {
    const input = parse(orderBaruSchema, req.body);
    // Business rule: the counter phones serve one portion per customer. QR orders may carry several (ordering for friends).
    if (input.items.length !== 1 || input.items[0].qty !== 1) throw new HttpError(400, 'Meja depan hanya 1 porsi per order');
    const { qty_max } = getPengaturan(ctx.db);
    const { order, baru } = buatOrder(ctx.db, input, ctx.clock.now(), qty_max);
    if (baru) berubah(false);
    res.status(baru ? 201 : 200).json({
      id: order.id,
      nomor: order.nomor,
      total: totalOrder(order.items),
      dibuat_at: order.dibuat_at,
      status: order.status,
    });
  });

  r.post('/orders/:id/cancel', (req, res) => {
    const { client_uuid } = parse(batalPelangganSchema, req.body);
    const order = batalPelanggan(ctx.db, idParam(req.params.id), client_uuid, ctx.clock.now());
    berubah(false);
    res.json(order);
  });

  r.get('/siap', (_req, res) => {
    res.json({ nomor: siapTerbaru(ctx.db, ctx.clock.now()) });
  });

  r.get('/orders', dapur, (req, res) => {
    const tab = parse(tabSchema, req.query.tab);
    res.json(daftarDapur(ctx.db, tab, ctx.clock.now(), getPengaturan(ctx.db).jam));
  });

  r.post('/orders/:id/siap', dapur, (req, res) => {
    const id = idParam(req.params.id);
    const sudah = ambilOrder(ctx.db, id)?.status === 'siap';
    const order = tandaiSiap(ctx.db, id, ctx.clock.now());
    if (!sudah) berubah(true);
    res.json(order);
  });

  r.post('/orders/:id/undo-siap', dapur, (req, res) => {
    const order = undoSiap(ctx.db, idParam(req.params.id), ctx.clock.now());
    berubah(true);
    res.json(order);
  });

  r.post('/orders/:id/batal', dapur, (req, res) => {
    const id = idParam(req.params.id);
    const sudah = ambilOrder(ctx.db, id)?.status === 'batal';
    const order = batalDapur(ctx.db, id, ctx.clock.now());
    if (!sudah) berubah(true);
    res.json(order);
  });

  r.post('/items/:id/centang', dapur, (req, res) => {
    const { siap } = parse(centangSchema, req.body);
    const order = centangItem(ctx.db, idParam(req.params.id), siap, ctx.clock.now());
    berubah(order.status === 'siap');
    res.json(order);
  });

  r.post('/items/:id/batal', dapur, (req, res) => {
    const order = batalItem(ctx.db, idParam(req.params.id), ctx.clock.now());
    berubah(true);
    res.json(order);
  });

  return r;
}
