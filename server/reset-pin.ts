import { join } from 'node:path';
import { hashPin } from './auth';
import { openDb } from './db';
import { mintaPin } from './pin-setup';
import { setSetting } from './settings';

async function main() {
  const db = openDb(join(process.env.KANTIN_DATA ?? join(process.cwd(), 'data'), 'kantin.db'));
  const pin = await mintaPin('PIN Admin baru');
  setSetting(db, 'pin_admin_hash', hashPin(pin));
  console.log('PIN Admin diganti. Restart server supaya sesi lama keluar.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
