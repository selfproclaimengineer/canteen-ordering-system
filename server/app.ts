import express from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PinGuard, TokenStore } from './auth';
import type { Clock } from './clock';
import type { Ctx } from './context';
import type { Db } from './db';
import type { Emit } from './events';
import { errorHandler, requireRole } from './http';
import { BatasLaju, buatCekPublik, CatatanTolak, pagarPublik } from './qr';
import { adminLaporanRoutes } from './routes/admin-laporan';
import { adminMenuRoutes } from './routes/admin-menu';
import { adminSettingsRoutes } from './routes/admin-settings';
import { authRoutes } from './routes/auth';
import { menuRoutes } from './routes/menu';
import { ordersRoutes } from './routes/orders';
import { adminQrRoutes, qrRoutes } from './routes/qr';
import { adminSuaraRoutes, suaraRoutes } from './routes/suara';

export interface Deps {
  db: Db;
  clock: Clock;
  emit: Emit;
  staticDir?: string;
  fetchFn?: typeof fetch;
  /** CIDR list of the kantin hotspot; see LOKAL_BAWAAN. */
  lokal?: string[];
  hanyaSekolah?: boolean;
  /** Installed release tag from versi.txt ('dev' when run from source). */
  versi?: string;
  /** Stops the process; scripts/jalan.sh then checks for an update and starts it again. */
  keluar?: () => void;
}

export function createApp(deps: Deps): express.Express {
  const ctx: Ctx = {
    ...deps,
    tokens: new TokenStore(deps.clock),
    guard: new PinGuard(deps.clock),
    batasQr: new BatasLaju(deps.clock),
    tolakQr: new CatatanTolak(),
    fetchFn: deps.fetchFn ?? fetch,
    publik: buatCekPublik(deps.db, deps.lokal),
    hanyaSekolah: deps.hanyaSekolah ?? false,
    versi: deps.versi ?? 'dev',
    keluar: deps.keluar ?? (() => setTimeout(() => process.exit(0), 300)),
  };
  const app = express();
  app.disable('x-powered-by');
  app.use(pagarPublik(ctx.publik));
  app.use(express.json({ limit: '100kb' }));

  // routes
  app.use('/api', authRoutes(ctx));
  app.use('/api', menuRoutes(ctx));
  app.use('/api', ordersRoutes(ctx));
  app.use('/api', qrRoutes(ctx));
  app.use('/api', suaraRoutes(ctx));
  app.use('/api/admin', requireRole(ctx, 'admin'));
  app.use('/api/admin', adminMenuRoutes(ctx));
  app.use('/api/admin', adminSettingsRoutes(ctx));
  app.use('/api/admin', adminLaporanRoutes(ctx));
  app.use('/api/admin', adminQrRoutes(ctx));
  app.use('/api/admin', adminSuaraRoutes(ctx));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Tidak ditemukan' });
  });

  if (deps.staticDir) {
    const dir = resolve(deps.staticDir);
    const index = join(dir, 'index.html');
    if (existsSync(index)) {
      app.use(express.static(dir));
      app.use((req, res, next) => (req.method === 'GET' || req.method === 'HEAD' ? res.sendFile(index) : next()));
    }
  }

  app.use(errorHandler);
  return app;
}
