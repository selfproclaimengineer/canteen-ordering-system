import { type Request, Router } from 'express';
import { isIP } from 'node:net';
import { z } from 'zod';
import { totalOrder } from '../../shared/pricing';
import { tanggalDari } from '../../shared/rules';
import { batalPelangganSchema, namaQrSchema, orderBaruSchema, qrAturSchema, qrBukaSchema, qrIpSchema, qrRentangSchema } from '../../shared/schemas';
import type { Ctx } from '../context';
import { get } from '../db';
import { HttpError, idParam, parse, requireRole } from '../http';
import { adaOrderQrAktif, ambilOrder, batalPelanggan, buatOrder } from '../order-repo';
import { type AturQr, bacaQr, buatKodeQr, entriValid, ipDiizinkan, ipPengirim, qrAktif, rentangTerkecil, samaAman } from '../qr';
import { getPengaturan, setSetting } from '../settings';

export function qrRoutes(ctx: Ctx): Router {
  const r = Router();

  const cekKode = (req: Request): AturQr => {
    const q = bacaQr(ctx.db);
    if (!qrAktif(q) || !samaAman(String(req.params.kode), q.kode)) throw new HttpError(404, 'Tidak ditemukan');
    return q;
  };
  // Hotspot requests are trusted; public ones must come from the school's network.
  // Refused IPs are remembered so the admin can see what students really use.
  const jaringanOk = (req: Request, q: AturQr) => {
    // Off by default (KANTIN_QR_HANYA_SEKOLAH): school WiFi proved unreliable (phones silently use mobile data).
    if (!ctx.hanyaSekolah || !ctx.publik(req)) return true;
    const ip = ipPengirim(req);
    if (ipDiizinkan(q.ip, ip)) return true;
    ctx.tolakQr.catat(ip, ctx.clock.now());
    return false;
  };

  r.get('/qr/:kode/info', (req, res) => {
    const q = cekKode(req);
    res.json({ buka: q.buka, jaringan_ok: jaringanOk(req, q), ip: ipPengirim(req) });
  });

  r.post('/qr/:kode/orders', (req, res) => {
    const q = cekKode(req);
    const input = parse(orderBaruSchema, req.body);
    const nama = parse(namaQrSchema, input.nama ?? '');
    const now = ctx.clock.now();
    // A retry of an existing order skips the guards and gets the original back.
    if (!get(ctx.db, 'SELECT 1 AS x FROM orders WHERE client_uuid = ?', input.client_uuid)) {
      if (!q.buka) throw new HttpError(403, 'QR tutup');
      if (!jaringanOk(req, q)) throw new HttpError(403, 'Bukan WiFi sekolah');
      if (adaOrderQrAktif(ctx.db, input.device, tanggalDari(now))) throw new HttpError(409, 'Masih ada pesanan aktif');
      if (!ctx.batasQr.boleh()) throw new HttpError(429, 'Terlalu ramai, coba lagi');
    }
    let hasil: ReturnType<typeof buatOrder>;
    try {
      hasil = buatOrder(ctx.db, input, now, getPengaturan(ctx.db).qty_max, 'qr', nama, input.catatan || null);
    } catch (err) {
      // A rejected order (sold out, bad option) must not use up a slot of the global limit.
      ctx.batasQr.kembalikan();
      throw err;
    }
    const { order, baru } = hasil;
    if (baru) ctx.emit({ type: 'orders-changed' });
    res.status(baru ? 201 : 200).json({ id: order.id, nomor: order.nomor, total: totalOrder(order.items), dibuat_at: order.dibuat_at, status: order.status });
  });

  r.get('/qr/:kode/orders/:id', (req, res) => {
    cekKode(req);
    const uuid = parse(z.uuid(), req.query.uuid);
    const o = ambilOrder(ctx.db, idParam(req.params.id));
    if (!o || o.sumber !== 'qr' || o.client_uuid !== uuid) throw new HttpError(404, 'Order tidak ditemukan');
    res.json({ id: o.id, nomor: o.nomor, status: o.status, total: totalOrder(o.items), nama: o.nama });
  });

  r.post('/qr/:kode/orders/:id/cancel', (req, res) => {
    cekKode(req);
    const { client_uuid } = parse(batalPelangganSchema, req.body);
    const id = idParam(req.params.id);
    if (ambilOrder(ctx.db, id)?.sumber !== 'qr') throw new HttpError(404, 'Order tidak ditemukan');
    const o = batalPelanggan(ctx.db, id, client_uuid, ctx.clock.now());
    ctx.emit({ type: 'orders-changed' });
    res.json({ status: o.status });
  });

  const dapur = requireRole(ctx, 'dapur');

  r.get('/dapur/qr', dapur, (_req, res) => {
    const q = bacaQr(ctx.db);
    res.json({ aktif: qrAktif(q), buka: q.buka });
  });

  r.put('/dapur/qr', dapur, (req, res) => {
    const { buka } = parse(qrBukaSchema, req.body);
    setSetting(ctx.db, 'qr_buka', buka ? '1' : '0');
    ctx.emit({ type: 'menu-changed' });
    res.json({ buka });
  });

  return r;
}

export function adminQrRoutes(ctx: Ctx): Router {
  const r = Router();

  r.get('/qr', (_req, res) => {
    res.json({ ...bacaQr(ctx.db), cek_jaringan: ctx.hanyaSekolah });
  });

  r.put('/qr', (req, res) => {
    const { alamat, buka } = parse(qrAturSchema, req.body);
    setSetting(ctx.db, 'qr_alamat', alamat.replace(/\/+$/, ''));
    if (alamat && !bacaQr(ctx.db).kode) setSetting(ctx.db, 'qr_kode', buatKodeQr());
    setSetting(ctx.db, 'qr_buka', buka ? '1' : '0');
    ctx.emit({ type: 'menu-changed' });
    res.json(bacaQr(ctx.db));
  });

  r.post('/qr/ganti-kode', (_req, res) => {
    setSetting(ctx.db, 'qr_kode', buatKodeQr());
    res.json(bacaQr(ctx.db));
  });

  r.put('/qr/ip', (req, res) => {
    const { ip } = parse(qrIpSchema, req.body);
    if (!ip.every(entriValid)) throw new HttpError(400, 'IP atau rentang tidak valid (paling lebar /16)');
    setSetting(ctx.db, 'qr_ip', JSON.stringify([...new Set(ip)]));
    res.json(bacaQr(ctx.db));
  });

  r.get('/qr/ditolak', (_req, res) => {
    res.json(ctx.tolakQr.daftar());
  });

  r.post('/qr/izinkan-rentang', (req, res) => {
    const { ip } = parse(qrRentangSchema, req.body);
    const rentang = rentangTerkecil(ip);
    if (!rentang) throw new HttpError(400, 'Rentang terlalu lebar (lebih dari /16) atau campuran IPv4 dan IPv6');
    setSetting(ctx.db, 'qr_ip', JSON.stringify([...new Set([...bacaQr(ctx.db).ip, rentang])]));
    res.json({ ...bacaQr(ctx.db), rentang });
  });

  // The server shares the school WiFi with the students, so its own public IPs are the school's.
  // Asking our own Funnel address does not work: Tailscale keeps that call inside the tailnet.
  r.post('/qr/ambil-ip', async (_req, res) => {
    const q = bacaQr(ctx.db);
    const baca = async (url: string) => {
      try {
        const jawab = await ctx.fetchFn(url, { signal: AbortSignal.timeout(8000) });
        const ip = jawab.ok ? (await jawab.text()).trim() : '';
        return isIP(ip) === 0 ? null : ip;
      } catch {
        return null;
      }
    };
    const baru = (await Promise.all([baca('https://api.ipify.org'), baca('https://api6.ipify.org')])).filter((x): x is string => x !== null);
    if (baru.length === 0) {
      throw new HttpError(502, 'IP tidak terbaca. Cek internet, atau buka QR dari HP di WiFi ini lalu isi IP yang tampil secara manual.');
    }
    setSetting(ctx.db, 'qr_ip', JSON.stringify([...new Set([...q.ip, ...baru])]));
    res.json({ ...bacaQr(ctx.db), ip_baru: baru });
  });

  return r;
}
