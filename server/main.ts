import { pastikanTz } from './tz';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app';
import { backupSekali } from './backup';
import { systemClock } from './clock';
import { openDb } from './db';
import type { Emit } from './events';
import { pastikanPin } from './pin-setup';
import { buatCekPublik } from './qr';
import { pasangWs } from './ws';

async function main() {
  console.log(`Zona waktu: ${pastikanTz()}`);
  const dataDir = process.env.KANTIN_DATA ?? join(process.cwd(), 'data');
  const port = Number(process.env.PORT ?? 3000);
  mkdirSync(dataDir, { recursive: true });

  const db = openDb(join(dataDir, 'kantin.db'));
  const lokal = process.env.KANTIN_LOKAL?.split(',').filter(Boolean);
  await pastikanPin(db);

  // The app needs emit before the WebSocket server exists; forward through a variable.
  let kirim: Emit = () => {};
  const app = createApp({
    db,
    clock: systemClock,
    emit: (e) => kirim(e),
    staticDir: process.env.KANTIN_STATIC ?? join(process.cwd(), 'app', 'build', 'client'),
    lokal,
    hanyaSekolah: process.env.KANTIN_QR_HANYA_SEKOLAH === '1',
    // Written by the release workflow into the package; absent when run from source.
    versi: existsSync('versi.txt') ? readFileSync('versi.txt', 'utf8').trim() : 'dev',
  });
  const server = http.createServer(app);
  kirim = pasangWs(server, buatCekPublik(db, lokal)).emit;

  const backup = () => {
    try {
      const file = backupSekali(db, join(dataDir, 'backup'), systemClock.now());
      if (file) console.log(`Backup: ${file}`);
    } catch (err) {
      console.error('Backup gagal', err);
    }
  };
  backup();
  setInterval(backup, 3600_000);

  server.listen(port, '0.0.0.0', () => console.log(`Kantin siap di port ${port}`));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
