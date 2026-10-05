import { Router } from 'express';
import { HEADER_CSV, laporanKeBaris, toCsv } from '../../shared/csv';
import { laporanSchema, tanggalSchema } from '../../shared/schemas';
import { susunTren } from '../../shared/tren';
import type { Ctx } from '../context';
import { parse } from '../http';
import { ambilLaporan, daftarLaporan, rentangTanggal, simpanLaporan } from '../laporan-repo';

export function adminLaporanRoutes(ctx: Ctx): Router {
  const r = Router();

  r.get('/laporan', (_req, res) => {
    res.json(daftarLaporan(ctx.db));
  });

  r.get('/laporan.csv', (req, res) => {
    const dari = parse(tanggalSchema, req.query.dari);
    const sampai = parse(tanggalSchema, req.query.sampai);
    const rows = rentangTanggal(dari, sampai).flatMap((t) => laporanKeBaris(ambilLaporan(ctx.db, t, ctx.clock.now()).laporan));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan_${dari}_${sampai}.csv"`);
    res.send(toCsv([HEADER_CSV, ...rows]));
  });

  r.get('/tren', (req, res) => {
    const dari = parse(tanggalSchema, req.query.dari);
    const sampai = parse(tanggalSchema, req.query.sampai);
    const now = ctx.clock.now();
    res.json(susunTren(rentangTanggal(dari, sampai).map((t) => ambilLaporan(ctx.db, t, now).laporan)));
  });

  r.get('/laporan/:tanggal', (req, res) => {
    res.json(ambilLaporan(ctx.db, parse(tanggalSchema, req.params.tanggal), ctx.clock.now()));
  });

  r.put('/laporan/:tanggal', (req, res) => {
    const tanggal = parse(tanggalSchema, req.params.tanggal);
    const { pengeluaran } = parse(laporanSchema, req.body);
    const now = ctx.clock.now();
    res.json({ laporan: simpanLaporan(ctx.db, tanggal, pengeluaran, now), disimpan_at: now });
  });

  return r;
}
