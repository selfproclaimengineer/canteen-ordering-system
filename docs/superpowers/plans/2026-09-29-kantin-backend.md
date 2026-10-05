# Kantin Order — Plan 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete, tested backend: shared business logic, SQLite storage, REST API, WebSocket push, daily backup, and the host entrypoint. The UI is built in Plan 2 on top of this.

**Architecture:** One Node process on the host phone. `shared/` holds pure TypeScript logic and zod schemas that the server (and later the SPA) import. `server/` is Express 5 + `ws` + built-in `node:sqlite`. The server is the single source of truth; clients receive short WebSocket events and refetch via REST.

**Tech Stack:** Node 24, TypeScript 6, Express 5, ws 8, zod 4, node:sqlite, Jest 30 + ts-jest, supertest.

**Spec:** `docs/superpowers/specs/2026-09-29-kantin-order-design.md`

**Plan series:** Plan 1 = backend (this file). Plan 2 = SPA UI (React Router v7, `ssr: false`). Plan 3 = Termux deployment, manual test checklist, load test.

## Global Constraints

- Node >= 22.13 (built-in `node:sqlite` without a flag). Dev machine runs Node 24.21.0.
- No native npm dependencies. The server must run on Termux (Android ARM) without compiling.
- All money is an integer number of rupiah. Never use floats for money.
- Empty option price is stored as `0` and never as `NULL`.
- All time rules use the server clock (`Clock.now()`, epoch milliseconds). "Day" = local date of the host (`tanggalDari`).
- Customer cancel window: 10 000 ms. Undo-Siap window: 30 000 ms. Break orders move to "Sekarang" 10 minutes before the break time. "Siap diambil" list keeps a number for 5 minutes. Menu "Baru" label lasts 3 days.
- PIN: exactly 6 digits. Two PINs: `dapur` and `admin`. Stored as `scrypt$<salt hex>$<hash hex>`. 5 wrong attempts lock all PIN input for 60 s.
- Queue number starts at 1 every day and is assigned by the server inside a transaction. `UNIQUE (tanggal, nomor)`.
- `client_uuid` makes order creation idempotent.
- Error messages returned to clients are short Indonesian text in `{ "error": "..." }`.
- CSV: separator `;`, UTF-8 BOM, CRLF line endings.
- The DB table for orders is named `orders` (the spec writes `"order"`; `order` is an SQL keyword).
- TypeScript 6 requires an explicit `types` array in tsconfig (`["node", "jest"]`).
- Interpretation of spec 7.3: a break option ("Istirahat 1/2") is available on the order phone only while `now < jam_istirahat − 10 min`. After that moment the same order would already be shown in the "Sekarang" tab, so the customer picks "Sekarang".

## Review Focus

1. A stale order phone sends a `pilihan_id` from a group that the admin has detached from that menu → the server returns `400` and creates no order (test in Task 11).
2. Double-tap sends the same `pilihan_id` twice in one item → the option is charged once (test in Task 11).
3. An offline order phone retries the same `client_uuid` after midnight → the server returns the original order with its original number and does not create a new one (test in Task 11).
4. The admin deletes a menu or changes its price after orders exist → the old report still shows the snapshot name and price (test in Task 15).
5. The admin names a menu `=HYPERLINK(...)` → the CSV cell is prefixed with `'` so Excel does not execute it, while negative numbers stay numeric (test in Task 5).

---

## File Structure

```
package.json, tsconfig.json, tsconfig.build.json, jest.config.js, .gitignore
shared/
  types.ts        domain types shared by server and UI
  pricing.ts      hargaItem, totalOrder
  rules.ts        time rules, tab assignment, date helpers
  paginate.ts     paginate, urutTopping, pisahTopping
  report.ts       susunLaporan
  csv.ts          toCsv, laporanKeBaris, HEADER_CSV
  schemas.ts      zod request schemas
server/
  clock.ts        Clock interface + systemClock
  db.ts           openDb, schema, tx, all/get/run helpers
  settings.ts     getSetting, setSetting, getPengaturan
  auth.ts         hashPin, cocokPin, PinGuard, TokenStore
  events.ts       ServerEvent, Emit
  http.ts         HttpError, parse, idParam, requireRole, errorHandler
  context.ts      Ctx
  menu-repo.ts    public and admin menu queries/mutations
  order-repo.ts   order creation, status changes, kitchen lists
  laporan-repo.ts report compute/save/list, date ranges
  routes/auth.ts, routes/menu.ts, routes/orders.ts,
  routes/admin-menu.ts, routes/admin-settings.ts, routes/admin-laporan.ts
  app.ts          createApp
  ws.ts           pasangWs
  backup.ts       backupSekali
  pin-setup.ts    mintaPin, pastikanPin
  main.ts         host entrypoint
  reset-pin.ts    admin PIN reset CLI
  testing.ts      FakeClock, buatTestApp, seedMenu (test support)
```

Tests sit next to the code as `*.test.ts`.

---

### Task 1: Project scaffold and toolchain proof

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `.gitignore`
- Test: `server/toolchain.test.ts`

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, `npm run build:server` scripts used by all later tasks.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kantin-order",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.13" },
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "build:server": "tsc -p tsconfig.build.json",
    "start": "node dist/server/main.js",
    "reset-pin": "node dist/server/reset-pin.js"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm i express@5 ws@8 zod@4
npm i -D typescript jest@30 ts-jest @types/jest @types/node @types/express @types/ws supertest @types/supertest
```
Expected: installs without errors. `npm ls` shows express 5.x, ws 8.x, zod 4.x, jest 30.x.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "jest"],
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["shared", "server"]
}
```

- [ ] **Step 4: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "exclude": ["**/*.test.ts", "server/testing.ts"]
}
```

- [ ] **Step 5: Create `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/shared', '<rootDir>/server'],
};
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
data/
app/build/
*.db
*.db-wal
*.db-shm
```

- [ ] **Step 7: Write the toolchain test**

`server/toolchain.test.ts`:
```ts
import { DatabaseSync } from 'node:sqlite';

test('node:sqlite works inside Jest', () => {
  const db = new DatabaseSync(':memory:');
  const row = db.prepare('SELECT 1 AS x').get() as { x: number };
  expect(row.x).toBe(1);
});
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: `Tests: 1 passed`, typecheck prints nothing.
If `node:sqlite` fails inside Jest, stop and report. The fallback (spec section 16) is a custom Jest environment; do not continue without it.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json jest.config.js .gitignore server/toolchain.test.ts
git commit -m "chore: scaffold TypeScript, Jest and node:sqlite toolchain"
```

---

### Task 2: Domain types and pricing

**Files:**
- Create: `shared/types.ts`, `shared/pricing.ts`
- Test: `shared/pricing.test.ts`

**Interfaces:**
- Produces:
  - Types: `WaktuAmbil`, `StatusOrder`, `Widget`, `Tab`, `Peran`, `JamIstirahat`, `Pilihan`, `Grup`, `MenuPublik`, `PilihanSnapshot`, `OrderItem`, `Order`, `BarisLaporan`, `Laporan`.
  - `hargaItem(item: ItemHarga): number`
  - `totalOrder(items: (ItemHarga & { batal_at: number | null })[]): number`

- [ ] **Step 1: Create `shared/types.ts`**

```ts
export type WaktuAmbil = 'sekarang' | 'ist1' | 'ist2';
export type StatusOrder = 'baru' | 'siap' | 'batal';
export type Widget = 'stepper' | 'option' | 'checklist';
export type Tab = 'sekarang' | 'ist1' | 'ist2' | 'selesai';
export type Peran = 'dapur' | 'admin';

/** Break start times, format 'HH:MM'. */
export interface JamIstirahat {
  ist1: string;
  ist2: string;
}

export interface Pilihan {
  id: number;
  grup_id: number;
  label: string;
  harga: number;
  urutan: number;
}

export interface Grup {
  id: number;
  nama: string;
  widget: Widget;
  urutan: number;
  pilihan: Pilihan[];
}

export interface MenuPublik {
  id: number;
  nama: string;
  harga: number;
  tersedia: boolean;
  baru: boolean;
  urutan: number;
  grup: Grup[];
}

export interface PilihanSnapshot {
  pilihan_id: number;
  grup: string;
  label: string;
  harga: number;
}

export interface OrderItem {
  id: number;
  menu_id: number;
  nama: string;
  harga: number;
  qty: number;
  batal_at: number | null;
  pilihan: PilihanSnapshot[];
}

export interface Order {
  id: number;
  client_uuid: string;
  tanggal: string;
  nomor: number;
  waktu_ambil: WaktuAmbil;
  status: StatusOrder;
  device: string;
  dibuat_at: number;
  siap_at: number | null;
  batal_at: number | null;
  batal_oleh: 'pelanggan' | 'dapur' | null;
  items: OrderItem[];
}

export interface BarisLaporan {
  nama: string;
  harga: number;
  qty: number;
  total: number;
}

export interface Laporan {
  tanggal: string;
  menu: BarisLaporan[];
  topping: BarisLaporan[];
  pemasukan: number;
  batal: { qty: number; nilai: number };
  pengeluaran: number;
  keuntungan: number;
}
```

- [ ] **Step 2: Write the failing test**

`shared/pricing.test.ts`:
```ts
import { hargaItem, totalOrder } from './pricing';

describe('hargaItem', () => {
  test('menu price times qty without options', () => {
    expect(hargaItem({ harga: 10000, qty: 2, pilihan: [] })).toBe(20000);
  });

  test('adds option prices before multiplying by qty', () => {
    const item = { harga: 10000, qty: 3, pilihan: [{ harga: 2000 }, { harga: 0 }, { harga: 500 }] };
    expect(hargaItem(item)).toBe(37500);
  });
});

describe('totalOrder', () => {
  test('skips cancelled items', () => {
    const items = [
      { harga: 10000, qty: 1, pilihan: [{ harga: 2000 }], batal_at: null },
      { harga: 3000, qty: 2, pilihan: [], batal_at: 123 },
    ];
    expect(totalOrder(items)).toBe(12000);
  });

  test('empty order is 0', () => {
    expect(totalOrder([])).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest shared/pricing.test.ts`
Expected: FAIL, `Cannot find module './pricing'`.

- [ ] **Step 4: Implement `shared/pricing.ts`**

```ts
export interface ItemHarga {
  harga: number;
  qty: number;
  pilihan: { harga: number }[];
}

export function hargaItem(item: ItemHarga): number {
  const tambahan = item.pilihan.reduce((sum, p) => sum + p.harga, 0);
  return (item.harga + tambahan) * item.qty;
}

export function totalOrder(items: (ItemHarga & { batal_at: number | null })[]): number {
  return items
    .filter((item) => item.batal_at === null)
    .reduce((sum, item) => sum + hargaItem(item), 0);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest shared/pricing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/pricing.ts shared/pricing.test.ts
git commit -m "feat(shared): add domain types and price calculation"
```

---

### Task 3: Time rules

**Files:**
- Create: `shared/rules.ts`
- Test: `shared/rules.test.ts`

**Interfaces:**
- Consumes: `JamIstirahat`, `StatusOrder`, `Tab`, `WaktuAmbil` from `shared/types.ts`.
- Produces:
  - constants `BATAS_BATAL_PELANGGAN_MS = 10_000`, `BATAS_UNDO_SIAP_MS = 30_000`, `MAJU_ISTIRAHAT_MS = 600_000`, `SIAP_TAMPIL_MS = 300_000`, `MENU_BARU_MS = 259_200_000`
  - `tanggalDari(ms: number): string` → `'YYYY-MM-DD'` local date
  - `jamKeMs(jam: string, now: number): number`
  - `bolehBatalPelanggan(o: { status: StatusOrder; dibuat_at: number }, now: number): boolean`
  - `bolehUndoSiap(o: { status: StatusOrder; siap_at: number | null }, now: number): boolean`
  - `tabUntuk(o: { status: StatusOrder; waktu_ambil: WaktuAmbil }, now: number, jam: JamIstirahat): Tab`
  - `waktuAmbilTersedia(now: number, jam: JamIstirahat): WaktuAmbil[]`
  - `menuBaru(dibuat_at: number, now: number): boolean`

- [ ] **Step 1: Write the failing test**

Tests build times with the local `Date` constructor, so they pass in any timezone.

`shared/rules.test.ts`:
```ts
import {
  bolehBatalPelanggan,
  bolehUndoSiap,
  jamKeMs,
  menuBaru,
  tabUntuk,
  tanggalDari,
  waktuAmbilTersedia,
} from './rules';

const jam = { ist1: '09:30', ist2: '12:00' };
const pada = (h: number, m: number, s = 0) => new Date(2026, 8, 29, h, m, s).getTime();

test('tanggalDari returns local YYYY-MM-DD with zero padding', () => {
  expect(tanggalDari(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
});

test('jamKeMs converts HH:MM to epoch ms on the same local day', () => {
  expect(jamKeMs('09:30', pada(7, 0))).toBe(pada(9, 30));
});

describe('bolehBatalPelanggan', () => {
  const dibuat_at = pada(9, 0, 0);
  test('allowed at exactly 10 s', () => {
    expect(bolehBatalPelanggan({ status: 'baru', dibuat_at }, dibuat_at + 10_000)).toBe(true);
  });
  test('refused after 10 s', () => {
    expect(bolehBatalPelanggan({ status: 'baru', dibuat_at }, dibuat_at + 10_001)).toBe(false);
  });
  test('refused when status is not baru', () => {
    expect(bolehBatalPelanggan({ status: 'siap', dibuat_at }, dibuat_at + 1)).toBe(false);
  });
});

describe('bolehUndoSiap', () => {
  const siap_at = pada(9, 0);
  test('allowed within 30 s', () => {
    expect(bolehUndoSiap({ status: 'siap', siap_at }, siap_at + 30_000)).toBe(true);
  });
  test('refused after 30 s', () => {
    expect(bolehUndoSiap({ status: 'siap', siap_at }, siap_at + 30_001)).toBe(false);
  });
  test('refused when not siap', () => {
    expect(bolehUndoSiap({ status: 'baru', siap_at: null }, siap_at)).toBe(false);
  });
});

describe('tabUntuk', () => {
  test('sekarang orders go to sekarang', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'sekarang' }, pada(8, 0), jam)).toBe('sekarang');
  });
  test('break order is held before activation time', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'ist1' }, pada(9, 19, 59), jam)).toBe('ist1');
  });
  test('break order moves to sekarang 10 minutes before the break', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'ist1' }, pada(9, 20), jam)).toBe('sekarang');
  });
  test('ist2 is still held while ist1 is active', () => {
    expect(tabUntuk({ status: 'baru', waktu_ambil: 'ist2' }, pada(9, 30), jam)).toBe('ist2');
  });
  test('siap and batal orders go to selesai', () => {
    expect(tabUntuk({ status: 'siap', waktu_ambil: 'ist2' }, pada(8, 0), jam)).toBe('selesai');
    expect(tabUntuk({ status: 'batal', waktu_ambil: 'sekarang' }, pada(8, 0), jam)).toBe('selesai');
  });
});

describe('waktuAmbilTersedia', () => {
  test('all options early in the morning', () => {
    expect(waktuAmbilTersedia(pada(7, 0), jam)).toEqual(['sekarang', 'ist1', 'ist2']);
  });
  test('ist1 disappears at its activation time', () => {
    expect(waktuAmbilTersedia(pada(9, 20), jam)).toEqual(['sekarang', 'ist2']);
  });
  test('only sekarang late in the day', () => {
    expect(waktuAmbilTersedia(pada(13, 0), jam)).toEqual(['sekarang']);
  });
});

test('menuBaru is true for 3 days', () => {
  const dibuat = pada(8, 0);
  expect(menuBaru(dibuat, dibuat + 3 * 24 * 3600_000)).toBe(true);
  expect(menuBaru(dibuat, dibuat + 3 * 24 * 3600_000 + 1)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/rules.test.ts`
Expected: FAIL, `Cannot find module './rules'`.

- [ ] **Step 3: Implement `shared/rules.ts`**

```ts
import type { JamIstirahat, StatusOrder, Tab, WaktuAmbil } from './types';

export const BATAS_BATAL_PELANGGAN_MS = 10_000;
export const BATAS_UNDO_SIAP_MS = 30_000;
export const MAJU_ISTIRAHAT_MS = 10 * 60_000;
export const SIAP_TAMPIL_MS = 5 * 60_000;
export const MENU_BARU_MS = 3 * 24 * 3600_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function tanggalDari(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function jamKeMs(jam: string, now: number): number {
  const [h, m] = jam.split(':').map(Number);
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

export function bolehBatalPelanggan(o: { status: StatusOrder; dibuat_at: number }, now: number): boolean {
  return o.status === 'baru' && now - o.dibuat_at <= BATAS_BATAL_PELANGGAN_MS;
}

export function bolehUndoSiap(o: { status: StatusOrder; siap_at: number | null }, now: number): boolean {
  return o.status === 'siap' && o.siap_at !== null && now - o.siap_at <= BATAS_UNDO_SIAP_MS;
}

function aktifSejak(waktu: 'ist1' | 'ist2', now: number, jam: JamIstirahat): number {
  return jamKeMs(jam[waktu], now) - MAJU_ISTIRAHAT_MS;
}

export function tabUntuk(
  o: { status: StatusOrder; waktu_ambil: WaktuAmbil },
  now: number,
  jam: JamIstirahat,
): Tab {
  if (o.status !== 'baru') return 'selesai';
  if (o.waktu_ambil === 'sekarang') return 'sekarang';
  return now >= aktifSejak(o.waktu_ambil, now, jam) ? 'sekarang' : o.waktu_ambil;
}

export function waktuAmbilTersedia(now: number, jam: JamIstirahat): WaktuAmbil[] {
  const istirahat = (['ist1', 'ist2'] as const).filter((w) => now < aktifSejak(w, now, jam));
  return ['sekarang', ...istirahat];
}

export function menuBaru(dibuat_at: number, now: number): boolean {
  return now - dibuat_at <= MENU_BARU_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/rules.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add shared/rules.ts shared/rules.test.ts
git commit -m "feat(shared): add order time rules and kitchen tab assignment"
```

---

### Task 4: Pagination and topping order

**Files:**
- Create: `shared/paginate.ts`
- Test: `shared/paginate.test.ts`

**Interfaces:**
- Produces:
  - `paginate<T>(items: T[], perPage: number, page: number): { items: T[]; page: number; pageCount: number }` (pages are 0-based)
  - `urutTopping<T extends { harga: number; urutan: number }>(pilihan: T[]): T[]`
  - `pisahTopping<T extends { harga: number }>(pilihan: T[]): { gratis: T[]; berbayar: T[] }`

- [ ] **Step 1: Write the failing test**

`shared/paginate.test.ts`:
```ts
import { paginate, pisahTopping, urutTopping } from './paginate';

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  test('splits into pages', () => {
    expect(paginate(items, 3, 0)).toEqual({ items: [1, 2, 3], page: 0, pageCount: 3 });
    expect(paginate(items, 3, 2)).toEqual({ items: [7], page: 2, pageCount: 3 });
  });

  test('clamps page out of range', () => {
    expect(paginate(items, 3, 99).page).toBe(2);
    expect(paginate(items, 3, -1).page).toBe(0);
  });

  test('perPage below 1 is treated as 1', () => {
    expect(paginate(items, 0, 0)).toEqual({ items: [1], page: 0, pageCount: 7 });
  });

  test('empty list has one empty page', () => {
    expect(paginate([], 4, 0)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});

test('urutTopping puts free options first, then admin order', () => {
  const p = [
    { id: 1, harga: 2000, urutan: 0 },
    { id: 2, harga: 0, urutan: 2 },
    { id: 3, harga: 1000, urutan: 1 },
    { id: 4, harga: 0, urutan: 1 },
  ];
  expect(urutTopping(p).map((x) => x.id)).toEqual([4, 2, 1, 3]);
});

test('pisahTopping splits free and paid', () => {
  const p = [{ harga: 0 }, { harga: 500 }, { harga: 0 }];
  expect(pisahTopping(p)).toEqual({ gratis: [{ harga: 0 }, { harga: 0 }], berbayar: [{ harga: 500 }] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/paginate.test.ts`
Expected: FAIL, `Cannot find module './paginate'`.

- [ ] **Step 3: Implement `shared/paginate.ts`**

```ts
export function paginate<T>(items: T[], perPage: number, page: number) {
  const size = Math.max(1, Math.floor(perPage));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  return { items: items.slice(p * size, p * size + size), page: p, pageCount };
}

export function urutTopping<T extends { harga: number; urutan: number }>(pilihan: T[]): T[] {
  const berbayar = (x: T) => (x.harga > 0 ? 1 : 0);
  return [...pilihan].sort((a, b) => berbayar(a) - berbayar(b) || a.urutan - b.urutan);
}

export function pisahTopping<T extends { harga: number }>(pilihan: T[]) {
  return {
    gratis: pilihan.filter((p) => p.harga === 0),
    berbayar: pilihan.filter((p) => p.harga > 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/paginate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/paginate.ts shared/paginate.test.ts
git commit -m "feat(shared): add pagination and topping ordering"
```

---

### Task 5: Daily report and CSV

**Files:**
- Create: `shared/report.ts`, `shared/csv.ts`
- Test: `shared/report.test.ts`, `shared/csv.test.ts`

**Interfaces:**
- Consumes: `Order`, `Laporan`, `BarisLaporan` from `shared/types.ts`; `hargaItem` from `shared/pricing.ts`.
- Produces:
  - `susunLaporan(tanggal: string, orders: Order[], pengeluaran: number): Laporan`
  - `type Sel = string | number`
  - `toCsv(rows: Sel[][]): string`
  - `HEADER_CSV: Sel[]`
  - `laporanKeBaris(l: Laporan): Sel[][]`

Report rules:
- Only items of orders with status `siap` and `batal_at === null` count as income.
- Menu rows group by snapshot name + snapshot price. The same menu at two prices gives two rows.
- Topping rows come from snapshot options with `harga > 0`, grouped by `"<grup>: <label>"` + price, qty = item qty.
- Batal = items with `batal_at` set, or items of an order with status `batal`. `qty` sums item qty, `nilai` sums `hargaItem`.
- Orders still `baru` count nowhere.
- Rows sort by name, then price.

- [ ] **Step 1: Write the failing report test**

`shared/report.test.ts`:
```ts
import { susunLaporan } from './report';
import type { Order, OrderItem } from './types';

let nextId = 1;
function item(nama: string, harga: number, qty: number, pilihan: [string, number][] = [], batal_at: number | null = null): OrderItem {
  return {
    id: nextId++,
    menu_id: 1,
    nama,
    harga,
    qty,
    batal_at,
    pilihan: pilihan.map(([label, h], i) => ({ pilihan_id: i + 1, grup: 'Topping', label, harga: h })),
  };
}
function order(status: Order['status'], items: OrderItem[]): Order {
  return {
    id: nextId++, client_uuid: `u${nextId}`, tanggal: '2026-09-29', nomor: nextId, waktu_ambil: 'sekarang',
    status, device: 'Order 1', dibuat_at: 0, siap_at: null, batal_at: null, batal_oleh: null, items,
  };
}

test('counts only siap items and splits rows by price', () => {
  const orders = [
    order('siap', [item('Mie Goreng', 10000, 2, [['Telur', 2000], ['Bawang', 0]])]),
    order('siap', [item('Mie Goreng', 11000, 1), item('Es Teh', 3000, 1, [], 99)]),
    order('baru', [item('Mie Goreng', 10000, 5)]),
    order('batal', [item('Es Teh', 3000, 2)]),
  ];

  const l = susunLaporan('2026-09-29', orders, 15000);

  expect(l.menu).toEqual([
    { nama: 'Mie Goreng', harga: 10000, qty: 2, total: 20000 },
    { nama: 'Mie Goreng', harga: 11000, qty: 1, total: 11000 },
  ]);
  expect(l.topping).toEqual([{ nama: 'Topping: Telur', harga: 2000, qty: 2, total: 4000 }]);
  expect(l.pemasukan).toBe(35000);
  expect(l.batal).toEqual({ qty: 3, nilai: 9000 });
  expect(l.pengeluaran).toBe(15000);
  expect(l.keuntungan).toBe(20000);
});

test('empty day gives zeros and negative profit', () => {
  const l = susunLaporan('2026-09-29', [], 5000);
  expect(l.pemasukan).toBe(0);
  expect(l.keuntungan).toBe(-5000);
  expect(l.menu).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/report.test.ts`
Expected: FAIL, `Cannot find module './report'`.

- [ ] **Step 3: Implement `shared/report.ts`**

```ts
import { hargaItem } from './pricing';
import type { BarisLaporan, Laporan, Order } from './types';

function tambah(baris: Map<string, BarisLaporan>, nama: string, harga: number, qty: number) {
  const key = `${nama}\u0000${harga}`;
  const row = baris.get(key) ?? { nama, harga, qty: 0, total: 0 };
  row.qty += qty;
  row.total = row.harga * row.qty;
  baris.set(key, row);
}

function urut(baris: Map<string, BarisLaporan>): BarisLaporan[] {
  return [...baris.values()].sort((a, b) => a.nama.localeCompare(b.nama) || a.harga - b.harga);
}

export function susunLaporan(tanggal: string, orders: Order[], pengeluaran: number): Laporan {
  const menu = new Map<string, BarisLaporan>();
  const topping = new Map<string, BarisLaporan>();
  const batal = { qty: 0, nilai: 0 };

  for (const order of orders) {
    for (const item of order.items) {
      if (order.status === 'batal' || item.batal_at !== null) {
        batal.qty += item.qty;
        batal.nilai += hargaItem(item);
        continue;
      }
      if (order.status !== 'siap') continue;
      tambah(menu, item.nama, item.harga, item.qty);
      for (const p of item.pilihan) {
        if (p.harga > 0) tambah(topping, `${p.grup}: ${p.label}`, p.harga, item.qty);
      }
    }
  }

  const menuRows = urut(menu);
  const toppingRows = urut(topping);
  const pemasukan = [...menuRows, ...toppingRows].reduce((sum, r) => sum + r.total, 0);
  return {
    tanggal,
    menu: menuRows,
    topping: toppingRows,
    pemasukan,
    batal,
    pengeluaran,
    keuntungan: pemasukan - pengeluaran,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing CSV test**

`shared/csv.test.ts`:
```ts
import { HEADER_CSV, laporanKeBaris, toCsv } from './csv';
import type { Laporan } from './types';

test('toCsv adds BOM, uses ; and CRLF', () => {
  expect(toCsv([['a', 1], ['b', 2]])).toBe('﻿a;1\r\nb;2\r\n');
});

test('toCsv quotes cells with separator, quote or newline', () => {
  expect(toCsv([['a;b', 'say "hi"', 'x\ny']])).toBe('﻿"a;b";"say ""hi""";"x\ny"\r\n');
});

test('toCsv neutralises spreadsheet formulas in text but keeps numbers', () => {
  expect(toCsv([['=HYPERLINK("x")', '+1', '@a', '-b', -5000]])).toBe(
    '﻿"\'=HYPERLINK(""x"")";\'+1;\'@a;\'-b;-5000\r\n',
  );
});

test('laporanKeBaris lists detail rows then summary rows', () => {
  const l: Laporan = {
    tanggal: '2026-09-29',
    menu: [{ nama: 'Mie', harga: 10000, qty: 2, total: 20000 }],
    topping: [{ nama: 'Topping: Telur', harga: 2000, qty: 1, total: 2000 }],
    pemasukan: 22000,
    batal: { qty: 1, nilai: 3000 },
    pengeluaran: 5000,
    keuntungan: 17000,
  };
  expect(HEADER_CSV).toEqual(['tanggal', 'jenis', 'nama', 'harga', 'qty', 'total']);
  expect(laporanKeBaris(l)).toEqual([
    ['2026-09-29', 'menu', 'Mie', 10000, 2, 20000],
    ['2026-09-29', 'topping', 'Topping: Telur', 2000, 1, 2000],
    ['2026-09-29', 'batal', '', '', 1, 3000],
    ['2026-09-29', 'pemasukan', '', '', '', 22000],
    ['2026-09-29', 'pengeluaran', '', '', '', 5000],
    ['2026-09-29', 'keuntungan', '', '', '', 17000],
  ]);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest shared/csv.test.ts`
Expected: FAIL, `Cannot find module './csv'`.

- [ ] **Step 7: Implement `shared/csv.ts`**

```ts
import type { Laporan } from './types';

export type Sel = string | number;

export const HEADER_CSV: Sel[] = ['tanggal', 'jenis', 'nama', 'harga', 'qty', 'total'];

function sel(value: Sel): string {
  let s = String(value);
  // Text starting with = + - @ would run as a formula in Excel.
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Sel[][]): string {
  return '﻿' + rows.map((row) => row.map(sel).join(';')).join('\r\n') + '\r\n';
}

export function laporanKeBaris(l: Laporan): Sel[][] {
  return [
    ...l.menu.map((r): Sel[] => [l.tanggal, 'menu', r.nama, r.harga, r.qty, r.total]),
    ...l.topping.map((r): Sel[] => [l.tanggal, 'topping', r.nama, r.harga, r.qty, r.total]),
    [l.tanggal, 'batal', '', '', l.batal.qty, l.batal.nilai],
    [l.tanggal, 'pemasukan', '', '', '', l.pemasukan],
    [l.tanggal, 'pengeluaran', '', '', '', l.pengeluaran],
    [l.tanggal, 'keuntungan', '', '', '', l.keuntungan],
  ];
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest shared/report.test.ts shared/csv.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/report.ts shared/report.test.ts shared/csv.ts shared/csv.test.ts
git commit -m "feat(shared): add daily report aggregation and CSV export"
```

---

### Task 6: Request schemas

**Files:**
- Create: `shared/schemas.ts`
- Test: `shared/schemas.test.ts`

**Interfaces:**
- Produces (zod schemas; `z.infer`/`z.output` types used by the server):
  `orderBaruSchema`, `batalPelangganSchema`, `pinLoginSchema`, `menuSchema`, `grupSchema`, `pilihanSchema`, `pilihanUbahSchema`, `idsSchema`, `tersediaSchema`, `menuGrupSchema`, `pengaturanSchema`, `gantiPinSchema`, `laporanSchema`, `tanggalSchema`, `tabSchema`, and type `OrderBaru = z.output<typeof orderBaruSchema>`.

- [ ] **Step 1: Write the failing test**

`shared/schemas.test.ts`:
```ts
import { orderBaruSchema, pengaturanSchema, pilihanSchema, pinLoginSchema } from './schemas';

const uuid = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';

test('valid order passes', () => {
  const r = orderBaruSchema.safeParse({
    client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1',
    items: [{ menu_id: 1, qty: 2, pilihan_ids: [3] }],
  });
  expect(r.success).toBe(true);
});

test('order without items fails', () => {
  const r = orderBaruSchema.safeParse({ client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1', items: [] });
  expect(r.success).toBe(false);
});

test('qty 0 fails', () => {
  const r = orderBaruSchema.safeParse({
    client_uuid: uuid, waktu_ambil: 'sekarang', device: 'Order 1',
    items: [{ menu_id: 1, qty: 0, pilihan_ids: [] }],
  });
  expect(r.success).toBe(false);
});

test('PIN must be exactly 6 digits', () => {
  expect(pinLoginSchema.safeParse({ peran: 'dapur', pin: '123456', device: 'X' }).success).toBe(true);
  expect(pinLoginSchema.safeParse({ peran: 'dapur', pin: '12345', device: 'X' }).success).toBe(false);
  expect(pinLoginSchema.safeParse({ peran: 'dapur', pin: '12345a', device: 'X' }).success).toBe(false);
});

test('empty option price becomes 0', () => {
  expect(pilihanSchema.parse({ grup_id: 1, label: 'Bawang', harga: null }).harga).toBe(0);
  expect(pilihanSchema.parse({ grup_id: 1, label: 'Bawang' }).harga).toBe(0);
});

test('negative price fails', () => {
  expect(pilihanSchema.safeParse({ grup_id: 1, label: 'X', harga: -1 }).success).toBe(false);
});

test('break time must be HH:MM', () => {
  expect(pengaturanSchema.safeParse({ jam_ist1: '09:30', jam_ist2: '12:00', qty_max: 10 }).success).toBe(true);
  expect(pengaturanSchema.safeParse({ jam_ist1: '9:30', jam_ist2: '12:00', qty_max: 10 }).success).toBe(false);
  expect(pengaturanSchema.safeParse({ jam_ist1: '24:00', jam_ist2: '12:00', qty_max: 10 }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/schemas.test.ts`
Expected: FAIL, `Cannot find module './schemas'`.

- [ ] **Step 3: Implement `shared/schemas.ts`**

```ts
import { z } from 'zod';

const id = z.number().int().positive();
const harga = z.number().int().min(0).max(10_000_000);
const urutan = z.number().int().min(0).default(0);
const pin = z.string().regex(/^\d{6}$/, 'PIN harus 6 angka');
const jam = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
const device = z.string().trim().min(1).max(20);

export const waktuAmbilSchema = z.enum(['sekarang', 'ist1', 'ist2']);
export const tabSchema = z.enum(['sekarang', 'ist1', 'ist2', 'selesai']);
export const peranSchema = z.enum(['dapur', 'admin']);

export const orderBaruSchema = z.object({
  client_uuid: z.uuid(),
  waktu_ambil: waktuAmbilSchema,
  device,
  items: z
    .array(
      z.object({
        menu_id: id,
        qty: z.number().int().min(1).max(99),
        pilihan_ids: z.array(id).max(30),
      }),
    )
    .min(1, 'Keranjang kosong')
    .max(20),
});
export type OrderBaru = z.output<typeof orderBaruSchema>;

export const batalPelangganSchema = z.object({ client_uuid: z.uuid() });

export const pinLoginSchema = z.object({ peran: peranSchema, pin, device });

export const menuSchema = z.object({
  nama: z.string().trim().min(1).max(40),
  harga,
  tersedia: z.boolean().default(true),
  urutan,
});

export const grupSchema = z.object({
  nama: z.string().trim().min(1).max(30),
  widget: z.enum(['stepper', 'option', 'checklist']),
  urutan,
});

export const pilihanSchema = z.object({
  grup_id: id,
  label: z.string().trim().min(1).max(30),
  harga: harga.nullish().transform((v) => v ?? 0),
  urutan,
});
export const pilihanUbahSchema = pilihanSchema.omit({ grup_id: true });

export const idsSchema = z.object({ ids: z.array(id).min(1).max(200) });
export const tersediaSchema = idsSchema.extend({ tersedia: z.boolean() });
export const menuGrupSchema = z.object({ grup_ids: z.array(id).max(20) });

export const pengaturanSchema = z.object({
  jam_ist1: jam,
  jam_ist2: jam,
  qty_max: z.number().int().min(1).max(99),
});

export const gantiPinSchema = z.object({ peran: peranSchema, pin_baru: pin });

export const laporanSchema = z.object({ pengeluaran: z.number().int().min(0).max(1_000_000_000) });

export const tanggalSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/schemas.ts shared/schemas.test.ts
git commit -m "feat(shared): add zod request schemas"
```

---

### Task 7: Database, clock and settings

**Files:**
- Create: `server/clock.ts`, `server/db.ts`, `server/settings.ts`
- Test: `server/db.test.ts`

**Interfaces:**
- Consumes: `JamIstirahat` from `shared/types.ts`.
- Produces:
  - `interface Clock { now(): number }`, `systemClock: Clock`
  - `type Db = DatabaseSync`, `openDb(path: string): Db`, `tx<T>(db: Db, fn: () => T): T`
  - `all<T>(db: Db, sql: string, ...p: SQLInputValue[]): T[]`, `get<T>(db, sql, ...p): T | undefined`, `run(db, sql, ...p): { changes: number; lastInsertRowid: number }`
  - `getSetting(db: Db, key: string): string | undefined`, `setSetting(db: Db, key: string, value: string): void`
  - `getPengaturan(db: Db): { jam: JamIstirahat; qty_max: number }`, default jam `09:30` / `12:00`, qty_max `10`

- [ ] **Step 1: Write the failing test**

`server/db.test.ts`:
```ts
import { all, get, openDb, run, tx } from './db';
import { getPengaturan, getSetting, setSetting } from './settings';

test('openDb creates all tables', () => {
  const db = openDb(':memory:');
  const names = all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
  expect(names).toEqual(
    expect.arrayContaining(['grup', 'laporan', 'menu', 'menu_grup', 'order_item', 'order_item_pilihan', 'orders', 'pengaturan', 'pilihan']),
  );
});

test('openDb is safe to call twice on the same file schema', () => {
  const db = openDb(':memory:');
  expect(() => db.exec('CREATE TABLE IF NOT EXISTS menu (id INTEGER)')).not.toThrow();
});

test('tx rolls back on error', () => {
  const db = openDb(':memory:');
  expect(() =>
    tx(db, () => {
      run(db, 'INSERT INTO pengaturan (key, value) VALUES (?, ?)', 'a', '1');
      throw new Error('stop');
    }),
  ).toThrow('stop');
  expect(get(db, 'SELECT * FROM pengaturan WHERE key = ?', 'a')).toBeUndefined();
});

test('run returns numeric lastInsertRowid', () => {
  const db = openDb(':memory:');
  const r = run(db, 'INSERT INTO grup (nama, widget) VALUES (?, ?)', 'Topping', 'checklist');
  expect(r.lastInsertRowid).toBe(1);
  expect(typeof r.lastInsertRowid).toBe('number');
});

test('negative price is rejected by the database', () => {
  const db = openDb(':memory:');
  expect(() => run(db, 'INSERT INTO menu (nama, harga, dibuat_at) VALUES (?, ?, ?)', 'X', -1, 0)).toThrow();
});

test('settings defaults and overrides', () => {
  const db = openDb(':memory:');
  expect(getPengaturan(db)).toEqual({ jam: { ist1: '09:30', ist2: '12:00' }, qty_max: 10 });
  setSetting(db, 'jam_ist1', '10:00');
  setSetting(db, 'qty_max', '5');
  setSetting(db, 'qty_max', '6');
  expect(getSetting(db, 'jam_ist1')).toBe('10:00');
  expect(getPengaturan(db)).toEqual({ jam: { ist1: '10:00', ist2: '12:00' }, qty_max: 6 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/db.test.ts`
Expected: FAIL, `Cannot find module './db'`.

- [ ] **Step 3: Create `server/clock.ts`**

```ts
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
```

- [ ] **Step 4: Create `server/db.ts`**

```ts
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS menu (
  id INTEGER PRIMARY KEY,
  nama TEXT NOT NULL,
  harga INTEGER NOT NULL CHECK (harga >= 0),
  tersedia INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  dibuat_at INTEGER NOT NULL,
  dihapus_at INTEGER
);
CREATE TABLE IF NOT EXISTS grup (
  id INTEGER PRIMARY KEY,
  nama TEXT NOT NULL,
  widget TEXT NOT NULL CHECK (widget IN ('stepper', 'option', 'checklist')),
  urutan INTEGER NOT NULL DEFAULT 0,
  dihapus_at INTEGER
);
CREATE TABLE IF NOT EXISTS pilihan (
  id INTEGER PRIMARY KEY,
  grup_id INTEGER NOT NULL REFERENCES grup(id),
  label TEXT NOT NULL,
  harga INTEGER NOT NULL DEFAULT 0 CHECK (harga >= 0),
  urutan INTEGER NOT NULL DEFAULT 0,
  dihapus_at INTEGER
);
CREATE TABLE IF NOT EXISTS menu_grup (
  menu_id INTEGER NOT NULL REFERENCES menu(id),
  grup_id INTEGER NOT NULL REFERENCES grup(id),
  urutan INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_id, grup_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  client_uuid TEXT NOT NULL UNIQUE,
  tanggal TEXT NOT NULL,
  nomor INTEGER NOT NULL,
  waktu_ambil TEXT NOT NULL CHECK (waktu_ambil IN ('sekarang', 'ist1', 'ist2')),
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'siap', 'batal')),
  device TEXT NOT NULL,
  dibuat_at INTEGER NOT NULL,
  siap_at INTEGER,
  batal_at INTEGER,
  batal_oleh TEXT CHECK (batal_oleh IN ('pelanggan', 'dapur')),
  UNIQUE (tanggal, nomor)
);
CREATE TABLE IF NOT EXISTS order_item (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_id INTEGER NOT NULL REFERENCES menu(id),
  nama TEXT NOT NULL,
  harga INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  batal_at INTEGER
);
CREATE TABLE IF NOT EXISTS order_item_pilihan (
  item_id INTEGER NOT NULL REFERENCES order_item(id),
  pilihan_id INTEGER NOT NULL REFERENCES pilihan(id),
  grup TEXT NOT NULL,
  label TEXT NOT NULL,
  harga INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pengaturan (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS laporan (
  tanggal TEXT PRIMARY KEY,
  pengeluaran INTEGER NOT NULL,
  isi_json TEXT NOT NULL,
  disimpan_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_tanggal ON orders(tanggal);
CREATE INDEX IF NOT EXISTS idx_item_order ON order_item(order_id);
CREATE INDEX IF NOT EXISTS idx_item_pilihan ON order_item_pilihan(item_id);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function all<T>(db: Db, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T>(db: Db, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function run(db: Db, sql: string, ...params: SQLInputValue[]) {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}
```

- [ ] **Step 5: Create `server/settings.ts`**

```ts
import type { JamIstirahat } from '../shared/types';
import { get, run, type Db } from './db';

const DEFAULT: Record<string, string> = { jam_ist1: '09:30', jam_ist2: '12:00', qty_max: '10' };

export function getSetting(db: Db, key: string): string | undefined {
  return get<{ value: string }>(db, 'SELECT value FROM pengaturan WHERE key = ?', key)?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  run(db, 'INSERT INTO pengaturan (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

function baca(db: Db, key: string): string {
  return getSetting(db, key) ?? DEFAULT[key];
}

export function getPengaturan(db: Db): { jam: JamIstirahat; qty_max: number } {
  return {
    jam: { ist1: baca(db, 'jam_ist1'), ist2: baca(db, 'jam_ist2') },
    qty_max: Number(baca(db, 'qty_max')),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest server/db.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/clock.ts server/db.ts server/settings.ts server/db.test.ts
git commit -m "feat(server): add SQLite schema, query helpers and settings"
```

---

### Task 8: PIN hashing, lockout guard and tokens

**Files:**
- Create: `server/auth.ts`
- Test: `server/auth.test.ts`

**Interfaces:**
- Consumes: `Clock` from `server/clock.ts`, `Peran` from `shared/types.ts`.
- Produces:
  - `hashPin(pin: string): string`, `cocokPin(pin: string, stored: string): boolean`
  - `class PinGuard { constructor(clock: Clock, maks = 5, kunciMs = 60_000); sisaKunciMs(): number; catatGagal(): boolean; catatBerhasil(): void }` — `catatGagal` returns `true` when this failure triggers the lock.
  - `class TokenStore { constructor(clock: Clock, ttlMs = 12 * 3600_000); buat(peran: Peran): string; cek(token: string | undefined): Peran | null; cabutSemua(peran: Peran): void }`

- [ ] **Step 1: Write the failing test**

`server/auth.test.ts`:
```ts
import { cocokPin, hashPin, PinGuard, TokenStore } from './auth';

const clock = { t: 1_000_000, now() { return this.t; } };

test('hashPin and cocokPin round-trip', () => {
  const stored = hashPin('123456');
  expect(stored.startsWith('scrypt$')).toBe(true);
  expect(stored).not.toContain('123456');
  expect(cocokPin('123456', stored)).toBe(true);
  expect(cocokPin('654321', stored)).toBe(false);
});

test('same PIN hashes differently each time (salt)', () => {
  expect(hashPin('123456')).not.toBe(hashPin('123456'));
});

test('cocokPin rejects malformed stored value', () => {
  expect(cocokPin('123456', 'garbage')).toBe(false);
});

describe('PinGuard', () => {
  test('locks after 5 failures and unlocks after 60 s', () => {
    const g = new PinGuard(clock);
    for (let i = 0; i < 4; i++) expect(g.catatGagal()).toBe(false);
    expect(g.catatGagal()).toBe(true);
    expect(g.sisaKunciMs()).toBe(60_000);
    clock.t += 60_000;
    expect(g.sisaKunciMs()).toBe(0);
  });

  test('success resets the counter', () => {
    const g = new PinGuard(clock);
    for (let i = 0; i < 4; i++) g.catatGagal();
    g.catatBerhasil();
    expect(g.catatGagal()).toBe(false);
  });
});

describe('TokenStore', () => {
  test('issues, checks, expires and revokes tokens', () => {
    const s = new TokenStore(clock, 1000);
    const a = s.buat('admin');
    const d = s.buat('dapur');
    expect(s.cek(a)).toBe('admin');
    expect(s.cek(undefined)).toBeNull();
    expect(s.cek('nope')).toBeNull();
    s.cabutSemua('dapur');
    expect(s.cek(d)).toBeNull();
    clock.t += 1000;
    expect(s.cek(a)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/auth.test.ts`
Expected: FAIL, `Cannot find module './auth'`.

- [ ] **Step 3: Implement `server/auth.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Peran } from '../shared/types';
import type { Clock } from './clock';

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function cocokPin(pin: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(pin, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Global lockout: wrong PINs from any device count together. */
export class PinGuard {
  private gagal = 0;
  private kunciSampai = 0;

  constructor(private clock: Clock, private maks = 5, private kunciMs = 60_000) {}

  sisaKunciMs(): number {
    return Math.max(0, this.kunciSampai - this.clock.now());
  }

  catatGagal(): boolean {
    this.gagal++;
    if (this.gagal < this.maks) return false;
    this.gagal = 0;
    this.kunciSampai = this.clock.now() + this.kunciMs;
    return true;
  }

  catatBerhasil(): void {
    this.gagal = 0;
  }
}

export class TokenStore {
  private sesi = new Map<string, { peran: Peran; exp: number }>();

  constructor(private clock: Clock, private ttlMs = 12 * 3600_000) {}

  buat(peran: Peran): string {
    const token = randomBytes(24).toString('hex');
    this.sesi.set(token, { peran, exp: this.clock.now() + this.ttlMs });
    return token;
  }

  cek(token: string | undefined): Peran | null {
    if (!token) return null;
    const s = this.sesi.get(token);
    if (!s) return null;
    if (s.exp <= this.clock.now()) {
      this.sesi.delete(token);
      return null;
    }
    return s.peran;
  }

  cabutSemua(peran: Peran): void {
    for (const [token, s] of this.sesi) if (s.peran === peran) this.sesi.delete(token);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat(server): add PIN hashing, lockout guard and session tokens"
```

---

### Task 9: App skeleton, HTTP helpers and PIN login route

**Files:**
- Create: `server/events.ts`, `server/context.ts`, `server/http.ts`, `server/routes/auth.ts`, `server/app.ts`, `server/testing.ts`
- Test: `server/routes/auth.test.ts`

**Interfaces:**
- Consumes: Tasks 6–8.
- Produces:
  - `type ServerEvent = { type: 'orders-changed' } | { type: 'menu-changed' } | { type: 'siap-changed' } | { type: 'pin-alert'; device: string }`, `type Emit = (e: ServerEvent) => void`
  - `interface Ctx { db: Db; clock: Clock; emit: Emit; tokens: TokenStore; guard: PinGuard }`
  - `class HttpError extends Error { status: number; extra?: Record<string, unknown> }`
  - `parse<T>(schema: z.ZodType<T>, data: unknown): T` (throws `HttpError(400)`)
  - `idParam(value: string | string[] | undefined): number` (throws `HttpError(400)`)
  - `requireRole(ctx: Ctx, peran: Peran): RequestHandler` — `dapur` accepts dapur or admin tokens; `admin` accepts only admin. 401 `Perlu PIN`, 403 `Perlu PIN Admin`.
  - `errorHandler: ErrorRequestHandler`
  - `interface Deps { db: Db; clock: Clock; emit: Emit; staticDir?: string }`, `createApp(deps: Deps): express.Express`
  - Route `POST /api/auth/pin` → `200 { token, peran }`, `401 { error: 'PIN salah' }`, `429 { error: 'PIN terkunci', sisa_detik }`, `503 { error: 'PIN belum diatur' }`
  - Test support: `class FakeClock implements Clock { t: number; now(); maju(ms: number) }`, `buatTestApp(): { app, db, clock, events: ServerEvent[], ctx? }`, `PIN_DAPUR = '111111'`, `PIN_ADMIN = '999999'`, `login(app, peran): Promise<string>`

- [ ] **Step 1: Create `server/events.ts`**

```ts
export type ServerEvent =
  | { type: 'orders-changed' }
  | { type: 'menu-changed' }
  | { type: 'siap-changed' }
  | { type: 'pin-alert'; device: string };

export type Emit = (event: ServerEvent) => void;
```

- [ ] **Step 2: Create `server/context.ts`**

```ts
import type { PinGuard, TokenStore } from './auth';
import type { Clock } from './clock';
import type { Db } from './db';
import type { Emit } from './events';

export interface Ctx {
  db: Db;
  clock: Clock;
  emit: Emit;
  tokens: TokenStore;
  guard: PinGuard;
}
```

- [ ] **Step 3: Create `server/http.ts`**

```ts
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { z } from 'zod';
import type { Peran } from '../shared/types';
import type { Ctx } from './context';

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'Data tidak valid');
  return r.data;
}

export function idParam(value: string | string[] | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'ID tidak valid');
  return n;
}

export function requireRole(ctx: Ctx, peran: Peran): RequestHandler {
  return (req, _res, next) => {
    const token = req.header('authorization')?.replace(/^Bearer /, '');
    const punya = ctx.tokens.cek(token);
    if (!punya) throw new HttpError(401, 'Perlu PIN');
    if (peran === 'admin' && punya !== 'admin') throw new HttpError(403, 'Perlu PIN Admin');
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON tidak valid' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Kesalahan server' });
};
```

- [ ] **Step 4: Create `server/routes/auth.ts`**

```ts
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
```

- [ ] **Step 5: Create `server/app.ts`**

Later tasks add route modules to the `// routes` block.

```ts
import express from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PinGuard, TokenStore } from './auth';
import type { Clock } from './clock';
import type { Ctx } from './context';
import type { Db } from './db';
import type { Emit } from './events';
import { errorHandler } from './http';
import { authRoutes } from './routes/auth';

export interface Deps {
  db: Db;
  clock: Clock;
  emit: Emit;
  staticDir?: string;
}

export function createApp(deps: Deps): express.Express {
  const ctx: Ctx = { ...deps, tokens: new TokenStore(deps.clock), guard: new PinGuard(deps.clock) };
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // routes
  app.use('/api', authRoutes(ctx));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Tidak ditemukan' });
  });

  if (deps.staticDir) {
    const dir = resolve(deps.staticDir);
    const index = join(dir, 'index.html');
    if (existsSync(index)) {
      app.use(express.static(dir));
      app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(index) : next()));
    }
  }

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 6: Create `server/testing.ts`**

`seedMenu` is added in Task 10.

```ts
import request from 'supertest';
import type express from 'express';
import type { Peran } from '../shared/types';
import { createApp } from './app';
import { hashPin } from './auth';
import type { Clock } from './clock';
import { openDb } from './db';
import type { ServerEvent } from './events';
import { setSetting } from './settings';

export const PIN_DAPUR = '111111';
export const PIN_ADMIN = '999999';

export class FakeClock implements Clock {
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
  maju(ms: number): void {
    this.t += ms;
  }
}

/** 2026-09-29 08:00 local time. */
export const PAGI = new Date(2026, 8, 29, 8, 0).getTime();

export function buatTestApp(opts: { staticDir?: string } = {}) {
  const db = openDb(':memory:');
  setSetting(db, 'pin_dapur_hash', hashPin(PIN_DAPUR));
  setSetting(db, 'pin_admin_hash', hashPin(PIN_ADMIN));
  const clock = new FakeClock(PAGI);
  const events: ServerEvent[] = [];
  const app = createApp({ db, clock, emit: (e) => events.push(e), staticDir: opts.staticDir });
  return { app, db, clock, events };
}

export async function login(app: express.Express, peran: Peran): Promise<string> {
  const pin = peran === 'admin' ? PIN_ADMIN : PIN_DAPUR;
  const res = await request(app).post('/api/auth/pin').send({ peran, pin, device: 'Test' });
  if (res.status !== 200) throw new Error(`login ${peran} failed: ${res.status}`);
  return res.body.token as string;
}
```

- [ ] **Step 7: Write the failing test**

`server/routes/auth.test.ts`:
```ts
import request from 'supertest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buatTestApp, PIN_ADMIN, PIN_DAPUR } from '../testing';

const kirim = (app: Parameters<typeof request>[0], peran: string, pin: string, device = 'Order 1') =>
  request(app).post('/api/auth/pin').send({ peran, pin, device });

test('correct PIN returns a token', async () => {
  const { app } = buatTestApp();
  const res = await kirim(app, 'dapur', PIN_DAPUR);
  expect(res.status).toBe(200);
  expect(res.body.peran).toBe('dapur');
  expect(res.body.token).toMatch(/^[0-9a-f]{48}$/);
});

test('dapur PIN does not open admin', async () => {
  const { app } = buatTestApp();
  expect((await kirim(app, 'admin', PIN_DAPUR)).status).toBe(401);
  expect((await kirim(app, 'admin', PIN_ADMIN)).status).toBe(200);
});

test('malformed PIN is 400', async () => {
  const { app } = buatTestApp();
  const res = await kirim(app, 'dapur', '12');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('PIN harus 6 angka');
});

test('5 wrong PINs lock for 60 s, alert kitchens, then unlock', async () => {
  const { app, clock, events } = buatTestApp();
  for (let i = 0; i < 4; i++) expect((await kirim(app, 'dapur', '000000')).status).toBe(401);

  const kunci = await kirim(app, 'dapur', '000000', 'Order 2');
  expect(kunci.status).toBe(429);
  expect(kunci.body).toEqual({ error: 'PIN terkunci', sisa_detik: 60 });
  expect(events).toContainEqual({ type: 'pin-alert', device: 'Order 2' });

  // Correct PIN is still refused while locked.
  expect((await kirim(app, 'dapur', PIN_DAPUR)).status).toBe(429);

  clock.maju(60_000);
  expect((await kirim(app, 'dapur', PIN_DAPUR)).status).toBe(200);
});

test('invalid JSON is 400', async () => {
  const { app } = buatTestApp();
  const res = await request(app).post('/api/auth/pin').set('Content-Type', 'application/json').send('{bad');
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('JSON tidak valid');
});

test('unknown API path is 404 JSON', async () => {
  const { app } = buatTestApp();
  const res = await request(app).get('/api/nope');
  expect(res.status).toBe(404);
  expect(res.body.error).toBe('Tidak ditemukan');
});

test('SPA fallback serves index.html for non-API GET', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kantin-static-'));
  writeFileSync(join(dir, 'index.html'), '<html>kantin</html>');
  const { app } = buatTestApp({ staticDir: dir });
  const res = await request(app).get('/dapur');
  expect(res.status).toBe(200);
  expect(res.text).toContain('kantin');
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest server/routes/auth.test.ts`
Expected: PASS (7 tests). If any test fails, fix the code in this task before continuing.

- [ ] **Step 9: Typecheck and commit**

Run: `npm run typecheck`
Expected: no output.

```bash
git add server/events.ts server/context.ts server/http.ts server/routes/auth.ts server/app.ts server/testing.ts server/routes/auth.test.ts
git commit -m "feat(server): add app skeleton, error handling and PIN login"
```

---

### Task 10: Public menu

**Files:**
- Create: `server/menu-repo.ts`, `server/routes/menu.ts`
- Modify: `server/app.ts` (register route), `server/testing.ts` (add `seedMenu`)
- Test: `server/routes/menu.test.ts`

**Interfaces:**
- Consumes: `MenuPublik`, `Grup`, `Pilihan` from `shared/types.ts`; `menuBaru` from `shared/rules.ts`; `all`, `Db` from `server/db.ts`.
- Produces:
  - `grupAktif(db: Db): Map<number, Grup>` — groups without `dihapus_at`, each with active `pilihan` sorted by `urutan, id`
  - `grupUntukMenu(db: Db, menuId: number, grup: Map<number, Grup>): Grup[]` — attached active groups in `menu_grup.urutan, grup.urutan` order
  - `daftarMenuPublik(db: Db, now: number): MenuPublik[]`
  - Route `GET /api/menu` → `{ server_now, jam: JamIstirahat, qty_max, waktu_tersedia: WaktuAmbil[], menu: MenuPublik[] }`
  - Test support `seedMenu(db, dibuat_at = 0)` → `{ mie, esTeh, nasi, pedas: number[] (pilihan ids for levels 0–5), ukuran: { kecil, besar }, telur, bawang, keju, grupPedas, grupUkuran, grupTopping, grupLepas, lepas }`

- [ ] **Step 1: Add `seedMenu` to `server/testing.ts`**

Append:
```ts
import { run, type Db } from './db';

/**
 * Mie Goreng 10000 with Kepedasan (stepper 0-5), Ukuran (option Kecil 0 / Besar 3000)
 * and Topping (checklist Telur 2000, Bawang 0, Keju 3000).
 * Es Teh 3000 with no groups. Nasi Goreng 12000 is sold out.
 * Grup "Saus" (option Tomat) exists but is not attached to any menu.
 */
export function seedMenu(db: Db, dibuat_at = 0) {
  const menu = (nama: string, harga: number, tersedia = 1, urutan = 0) =>
    run(db, 'INSERT INTO menu (nama, harga, tersedia, urutan, dibuat_at) VALUES (?, ?, ?, ?, ?)', nama, harga, tersedia, urutan, dibuat_at).lastInsertRowid;
  const grup = (nama: string, widget: string, urutan: number) =>
    run(db, 'INSERT INTO grup (nama, widget, urutan) VALUES (?, ?, ?)', nama, widget, urutan).lastInsertRowid;
  const pilihan = (grup_id: number, label: string, harga: number, urutan: number) =>
    run(db, 'INSERT INTO pilihan (grup_id, label, harga, urutan) VALUES (?, ?, ?, ?)', grup_id, label, harga, urutan).lastInsertRowid;
  const tempel = (menu_id: number, grup_id: number, urutan: number) =>
    run(db, 'INSERT INTO menu_grup (menu_id, grup_id, urutan) VALUES (?, ?, ?)', menu_id, grup_id, urutan);

  const mie = menu('Mie Goreng', 10000, 1, 0);
  const esTeh = menu('Es Teh', 3000, 1, 1);
  const nasi = menu('Nasi Goreng', 12000, 0, 2);

  const grupPedas = grup('Kepedasan', 'stepper', 0);
  const pedas = [0, 1, 2, 3, 4, 5].map((lvl) => pilihan(grupPedas, String(lvl), 0, lvl));
  const grupUkuran = grup('Ukuran', 'option', 1);
  const ukuran = { kecil: pilihan(grupUkuran, 'Kecil', 0, 0), besar: pilihan(grupUkuran, 'Besar', 3000, 1) };
  const grupTopping = grup('Topping', 'checklist', 2);
  const telur = pilihan(grupTopping, 'Telur', 2000, 0);
  const bawang = pilihan(grupTopping, 'Bawang', 0, 1);
  const keju = pilihan(grupTopping, 'Keju', 3000, 2);
  const grupLepas = grup('Saus', 'option', 3);
  const lepas = pilihan(grupLepas, 'Tomat', 0, 0);

  tempel(mie, grupPedas, 0);
  tempel(mie, grupUkuran, 1);
  tempel(mie, grupTopping, 2);

  return { mie, esTeh, nasi, pedas, ukuran, telur, bawang, keju, grupPedas, grupUkuran, grupTopping, grupLepas, lepas };
}
```

Move the new `import { run, type Db } from './db';` line up to join the existing `import { openDb } from './db';` as `import { openDb, run, type Db } from './db';`.

- [ ] **Step 2: Write the failing test**

`server/routes/menu.test.ts`:
```ts
import request from 'supertest';
import { run } from '../db';
import { buatTestApp, PAGI, seedMenu } from '../testing';

test('GET /api/menu returns menu, groups, options and settings', async () => {
  const { app, db } = buatTestApp();
  const s = seedMenu(db, PAGI);

  const res = await request(app).get('/api/menu');

  expect(res.status).toBe(200);
  expect(res.body.server_now).toBe(PAGI);
  expect(res.body.jam).toEqual({ ist1: '09:30', ist2: '12:00' });
  expect(res.body.qty_max).toBe(10);
  expect(res.body.waktu_tersedia).toEqual(['sekarang', 'ist1', 'ist2']);
  expect(res.body.menu.map((m: { nama: string }) => m.nama)).toEqual(['Mie Goreng', 'Es Teh', 'Nasi Goreng']);

  const mie = res.body.menu[0];
  expect(mie).toMatchObject({ id: s.mie, harga: 10000, tersedia: true, baru: true });
  expect(mie.grup.map((g: { nama: string }) => g.nama)).toEqual(['Kepedasan', 'Ukuran', 'Topping']);
  expect(mie.grup[0].pilihan.map((p: { label: string }) => p.label)).toEqual(['0', '1', '2', '3', '4', '5']);
  expect(res.body.menu[1].grup).toEqual([]);
  expect(res.body.menu[2].tersedia).toBe(false);
});

test('deleted menu, group and option are hidden', async () => {
  const { app, db } = buatTestApp();
  const s = seedMenu(db, PAGI);
  run(db, 'UPDATE menu SET dihapus_at = 1 WHERE id = ?', s.esTeh);
  run(db, 'UPDATE grup SET dihapus_at = 1 WHERE id = ?', s.grupUkuran);
  run(db, 'UPDATE pilihan SET dihapus_at = 1 WHERE id = ?', s.keju);

  const res = await request(app).get('/api/menu');
  const nama = res.body.menu.map((m: { nama: string }) => m.nama);
  expect(nama).not.toContain('Es Teh');
  const mie = res.body.menu[0];
  expect(mie.grup.map((g: { nama: string }) => g.nama)).toEqual(['Kepedasan', 'Topping']);
  expect(mie.grup[1].pilihan.map((p: { label: string }) => p.label)).toEqual(['Telur', 'Bawang']);
});

test('menu older than 3 days is not baru', async () => {
  const { app, db } = buatTestApp();
  seedMenu(db, PAGI - 4 * 24 * 3600_000);
  const res = await request(app).get('/api/menu');
  expect(res.body.menu[0].baru).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest server/routes/menu.test.ts`
Expected: FAIL (`Cannot find module` or 404 on `/api/menu`).

- [ ] **Step 4: Create `server/menu-repo.ts`**

```ts
import { menuBaru } from '../shared/rules';
import type { Grup, MenuPublik, Pilihan, Widget } from '../shared/types';
import { all, type Db } from './db';

export function grupAktif(db: Db): Map<number, Grup> {
  const grup = new Map<number, Grup>();
  for (const g of all<{ id: number; nama: string; widget: Widget; urutan: number }>(
    db,
    'SELECT id, nama, widget, urutan FROM grup WHERE dihapus_at IS NULL ORDER BY urutan, id',
  )) {
    grup.set(g.id, { ...g, pilihan: [] });
  }
  for (const p of all<Pilihan>(
    db,
    'SELECT id, grup_id, label, harga, urutan FROM pilihan WHERE dihapus_at IS NULL ORDER BY urutan, id',
  )) {
    grup.get(p.grup_id)?.pilihan.push({ ...p });
  }
  return grup;
}

export function grupUntukMenu(db: Db, menuId: number, grup: Map<number, Grup>): Grup[] {
  return all<{ grup_id: number }>(
    db,
    `SELECT mg.grup_id FROM menu_grup mg JOIN grup g ON g.id = mg.grup_id
     WHERE mg.menu_id = ? ORDER BY mg.urutan, g.urutan, g.id`,
    menuId,
  )
    .map((r) => grup.get(r.grup_id))
    .filter((g): g is Grup => g !== undefined);
}

export function daftarMenuPublik(db: Db, now: number): MenuPublik[] {
  const grup = grupAktif(db);
  return all<{ id: number; nama: string; harga: number; tersedia: number; urutan: number; dibuat_at: number }>(
    db,
    'SELECT id, nama, harga, tersedia, urutan, dibuat_at FROM menu WHERE dihapus_at IS NULL ORDER BY urutan, id',
  ).map((m) => ({
    id: m.id,
    nama: m.nama,
    harga: m.harga,
    tersedia: m.tersedia === 1,
    baru: menuBaru(m.dibuat_at, now),
    urutan: m.urutan,
    grup: grupUntukMenu(db, m.id, grup),
  }));
}
```

- [ ] **Step 5: Create `server/routes/menu.ts`**

```ts
import { Router } from 'express';
import { waktuAmbilTersedia } from '../../shared/rules';
import type { Ctx } from '../context';
import { daftarMenuPublik } from '../menu-repo';
import { getPengaturan } from '../settings';

export function menuRoutes(ctx: Ctx): Router {
  const r = Router();

  r.get('/menu', (_req, res) => {
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
```

- [ ] **Step 6: Register the route in `server/app.ts`**

Add the import `import { menuRoutes } from './routes/menu';` and, below `app.use('/api', authRoutes(ctx));`, add:
```ts
  app.use('/api', menuRoutes(ctx));
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest server/routes/menu.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/menu-repo.ts server/routes/menu.ts server/app.ts server/testing.ts server/routes/menu.test.ts
git commit -m "feat(server): add public menu endpoint"
```

---

### Task 11: Order creation

**Files:**
- Create: `server/order-repo.ts`, `server/routes/orders.ts`
- Modify: `server/app.ts` (register route)
- Test: `server/routes/orders-create.test.ts`

**Interfaces:**
- Consumes: `OrderBaru`, `orderBaruSchema` (Task 6); `grupAktif`, `grupUntukMenu` (Task 10); `tanggalDari` (Task 3); `totalOrder` (Task 2); `HttpError`, `parse` (Task 9); `tx`, `get`, `all`, `run` (Task 7).
- Produces:
  - `ambilOrder(db: Db, id: number): Order | undefined`
  - `ordersHari(db: Db, tanggal: string): Order[]` (sorted by `nomor`)
  - `buatOrder(db: Db, input: OrderBaru, now: number, qtyMax: number): { order: Order; baru: boolean }`
  - Route `POST /api/orders` → `201` (new) or `200` (same `client_uuid`) with `{ id, nomor, total, dibuat_at }`; `409 { error: 'Menu habis', habis: { menu_id, nama }[] }`; `400` for invalid options or qty above `qty_max`.
  - `ordersRoutes(ctx: Ctx): Router` (Task 12 adds more routes to this file)

Validation rules inside `buatOrder`:
- Menu missing, deleted, or `tersedia = 0` → collected into `habis`. If `habis` is not empty, throw `409` after checking all items.
- `qty > qtyMax` → `400 'Maksimal <qtyMax> per menu'`.
- Every `pilihan_id` must belong to an active group attached to that menu → else `400 'Pilihan tidak valid'`.
- Duplicate `pilihan_ids` in one item count once.
- `stepper`/`option` group: more than one choice → `400 'Pilih satu <nama grup>'`; no choice → server uses the first option (the default) if the group has options.
- Snapshot options are stored in group order, then option order.

- [ ] **Step 1: Write the failing test**

`server/routes/orders-create.test.ts`:
```ts
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { get, run } from '../db';
import { ambilOrder } from '../order-repo';
import { buatTestApp, PAGI, seedMenu } from '../testing';

type Item = { menu_id: number; qty: number; pilihan_ids: number[] };
const body = (items: Item[], extra: Record<string, unknown> = {}) => ({
  client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', items, ...extra,
});

function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const kirim = (b: object) => request(t.app).post('/api/orders').send(b);
  return { ...t, s, kirim };
}

test('creates order with number 1, default options and server-side total', async () => {
  const { kirim, s, db, events } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 2, pilihan_ids: [s.pedas[3], s.telur] }]));

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ nomor: 1, total: 24000, dibuat_at: PAGI });
  expect(events).toContainEqual({ type: 'orders-changed' });

  const order = ambilOrder(db, res.body.id)!;
  expect(order.status).toBe('baru');
  expect(order.items[0].pilihan.map((p) => `${p.grup}:${p.label}:${p.harga}`)).toEqual([
    'Kepedasan:3:0',
    'Ukuran:Kecil:0',
    'Topping:Telur:2000',
  ]);
});

test('numbers increase and reset the next day', async () => {
  const { kirim, s, clock } = setup();
  const item = [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }];
  expect((await kirim(body(item))).body.nomor).toBe(1);
  expect((await kirim(body(item))).body.nomor).toBe(2);
  clock.maju(24 * 3600_000);
  expect((await kirim(body(item))).body.nomor).toBe(1);
});

test('20 parallel orders get unique numbers 1..20', async () => {
  const { kirim, s } = setup();
  const res = await Promise.all(
    Array.from({ length: 20 }, () => kirim(body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]))),
  );
  expect(res.every((r) => r.status === 201)).toBe(true);
  expect(res.map((r) => r.body.nomor).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
});

test('same client_uuid returns the original order, even the next day', async () => {
  const { kirim, s, clock } = setup();
  const b = body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]);
  const first = await kirim(b);
  clock.maju(24 * 3600_000);
  const again = await kirim(b);
  expect(again.status).toBe(200);
  expect(again.body).toEqual(first.body);
});

test('sold out menu returns 409 with the list and creates nothing', async () => {
  const { kirim, s, db } = setup();
  run(db, 'UPDATE menu SET tersedia = 0 WHERE id = ?', s.esTeh);
  const res = await kirim(body([
    { menu_id: s.mie, qty: 1, pilihan_ids: [] },
    { menu_id: s.esTeh, qty: 1, pilihan_ids: [] },
    { menu_id: s.nasi, qty: 1, pilihan_ids: [] },
  ]));
  expect(res.status).toBe(409);
  expect(res.body.error).toBe('Menu habis');
  expect(res.body.habis).toEqual([
    { menu_id: s.esTeh, nama: 'Es Teh' },
    { menu_id: s.nasi, nama: 'Nasi Goreng' },
  ]);
  expect(get(db, 'SELECT COUNT(*) AS n FROM orders')).toEqual({ n: 0 });
});

test('deleted menu counts as sold out', async () => {
  const { kirim, s, db } = setup();
  run(db, 'UPDATE menu SET dihapus_at = 1 WHERE id = ?', s.esTeh);
  const res = await kirim(body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]));
  expect(res.status).toBe(409);
});

test('qty above qty_max is 400', async () => {
  const { kirim, s } = setup();
  const res = await kirim(body([{ menu_id: s.esTeh, qty: 11, pilihan_ids: [] }]));
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Maksimal 10 per menu');
});

test('option from a group not attached to the menu is 400 (Review Focus 1)', async () => {
  const { kirim, s } = setup();
  expect((await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.lepas] }]))).status).toBe(400);
  expect((await kirim(body([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [s.telur] }]))).status).toBe(400);
});

test('two choices in a stepper group is 400', async () => {
  const { kirim, s } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.pedas[1], s.pedas[2]] }]));
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Pilih satu Kepedasan');
});

test('duplicate option id is charged once (Review Focus 2)', async () => {
  const { kirim, s } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.telur, s.telur] }]));
  expect(res.status).toBe(201);
  expect(res.body.total).toBe(12000);
});

test('price uses snapshot: later price change does not change the order', async () => {
  const { kirim, s, db } = setup();
  const res = await kirim(body([{ menu_id: s.mie, qty: 1, pilihan_ids: [s.ukuran.besar] }]));
  run(db, 'UPDATE menu SET harga = 99999 WHERE id = ?', s.mie);
  run(db, 'UPDATE pilihan SET harga = 99999 WHERE id = ?', s.ukuran.besar);
  const order = ambilOrder(db, res.body.id)!;
  expect(order.items[0].harga).toBe(10000);
  expect(order.items[0].pilihan.find((p) => p.label === 'Besar')!.harga).toBe(3000);
});

test('invalid body is 400', async () => {
  const { kirim } = setup();
  expect((await kirim({ client_uuid: 'x', items: [] })).status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/orders-create.test.ts`
Expected: FAIL, `Cannot find module '../order-repo'`.

- [ ] **Step 3: Create `server/order-repo.ts`**

```ts
import { tanggalDari } from '../shared/rules';
import type { OrderBaru } from '../shared/schemas';
import type { Grup, Order, OrderItem, PilihanSnapshot } from '../shared/types';
import { all, get, run, tx, type Db } from './db';
import { HttpError } from './http';
import { grupAktif, grupUntukMenu } from './menu-repo';

type OrderRow = Omit<Order, 'items'>;
type ItemRow = Omit<OrderItem, 'pilihan'> & { order_id: number };

function lengkapi(db: Db, row: OrderRow): Order {
  const items = all<ItemRow>(
    db,
    'SELECT id, order_id, menu_id, nama, harga, qty, batal_at FROM order_item WHERE order_id = ? ORDER BY id',
    row.id,
  ).map(({ order_id: _o, ...item }) => ({
    ...item,
    pilihan: all<PilihanSnapshot>(
      db,
      'SELECT pilihan_id, grup, label, harga FROM order_item_pilihan WHERE item_id = ? ORDER BY rowid',
      item.id,
    ).map((p) => ({ ...p })),
  }));
  return { ...row, items };
}

const KOLOM = 'id, client_uuid, tanggal, nomor, waktu_ambil, status, device, dibuat_at, siap_at, batal_at, batal_oleh';

export function ambilOrder(db: Db, id: number): Order | undefined {
  const row = get<OrderRow>(db, `SELECT ${KOLOM} FROM orders WHERE id = ?`, id);
  return row && lengkapi(db, { ...row });
}

export function ordersHari(db: Db, tanggal: string): Order[] {
  return all<OrderRow>(db, `SELECT ${KOLOM} FROM orders WHERE tanggal = ? ORDER BY nomor`, tanggal).map((row) =>
    lengkapi(db, { ...row }),
  );
}

interface ItemSiap {
  menu_id: number;
  nama: string;
  harga: number;
  qty: number;
  pilihan: PilihanSnapshot[];
}

function pilihOpsi(grupMenu: Grup[], pilihanIds: number[]): PilihanSnapshot[] {
  const dipilih = new Set(pilihanIds);
  const dikenal = new Set(grupMenu.flatMap((g) => g.pilihan.map((p) => p.id)));
  for (const id of dipilih) if (!dikenal.has(id)) throw new HttpError(400, 'Pilihan tidak valid');

  const hasil: PilihanSnapshot[] = [];
  for (const g of grupMenu) {
    let opsi = g.pilihan.filter((p) => dipilih.has(p.id));
    if (g.widget !== 'checklist') {
      if (opsi.length > 1) throw new HttpError(400, `Pilih satu ${g.nama}`);
      if (opsi.length === 0 && g.pilihan.length > 0) opsi = [g.pilihan[0]];
    }
    for (const p of opsi) hasil.push({ pilihan_id: p.id, grup: g.nama, label: p.label, harga: p.harga });
  }
  return hasil;
}

export function buatOrder(db: Db, input: OrderBaru, now: number, qtyMax: number): { order: Order; baru: boolean } {
  return tx(db, () => {
    const ada = get<{ id: number }>(db, 'SELECT id FROM orders WHERE client_uuid = ?', input.client_uuid);
    if (ada) return { order: ambilOrder(db, ada.id)!, baru: false };

    const grup = grupAktif(db);
    const habis: { menu_id: number; nama: string }[] = [];
    const siap: ItemSiap[] = [];

    for (const item of input.items) {
      const menu = get<{ nama: string; harga: number; tersedia: number; dihapus_at: number | null }>(
        db,
        'SELECT nama, harga, tersedia, dihapus_at FROM menu WHERE id = ?',
        item.menu_id,
      );
      if (!menu || menu.dihapus_at !== null || menu.tersedia !== 1) {
        habis.push({ menu_id: item.menu_id, nama: menu?.nama ?? 'Menu' });
        continue;
      }
      if (item.qty > qtyMax) throw new HttpError(400, `Maksimal ${qtyMax} per menu`);
      const pilihan = pilihOpsi(grupUntukMenu(db, item.menu_id, grup), item.pilihan_ids);
      siap.push({ menu_id: item.menu_id, nama: menu.nama, harga: menu.harga, qty: item.qty, pilihan });
    }
    if (habis.length > 0) throw new HttpError(409, 'Menu habis', { habis });

    const tanggal = tanggalDari(now);
    const nomor =
      (get<{ n: number | null }>(db, 'SELECT MAX(nomor) AS n FROM orders WHERE tanggal = ?', tanggal)?.n ?? 0) + 1;
    const orderId = run(
      db,
      `INSERT INTO orders (client_uuid, tanggal, nomor, waktu_ambil, device, dibuat_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.client_uuid, tanggal, nomor, input.waktu_ambil, input.device, now,
    ).lastInsertRowid;

    for (const item of siap) {
      const itemId = run(
        db,
        'INSERT INTO order_item (order_id, menu_id, nama, harga, qty) VALUES (?, ?, ?, ?, ?)',
        orderId, item.menu_id, item.nama, item.harga, item.qty,
      ).lastInsertRowid;
      for (const p of item.pilihan) {
        run(
          db,
          'INSERT INTO order_item_pilihan (item_id, pilihan_id, grup, label, harga) VALUES (?, ?, ?, ?, ?)',
          itemId, p.pilihan_id, p.grup, p.label, p.harga,
        );
      }
    }
    return { order: ambilOrder(db, orderId)!, baru: true };
  });
}
```

- [ ] **Step 4: Create `server/routes/orders.ts`**

```ts
import { Router } from 'express';
import { totalOrder } from '../../shared/pricing';
import { orderBaruSchema } from '../../shared/schemas';
import type { Ctx } from '../context';
import { parse } from '../http';
import { buatOrder } from '../order-repo';
import { getPengaturan } from '../settings';

export function ordersRoutes(ctx: Ctx): Router {
  const r = Router();

  r.post('/orders', (req, res) => {
    const input = parse(orderBaruSchema, req.body);
    const { qty_max } = getPengaturan(ctx.db);
    const { order, baru } = buatOrder(ctx.db, input, ctx.clock.now(), qty_max);
    if (baru) ctx.emit({ type: 'orders-changed' });
    res.status(baru ? 201 : 200).json({
      id: order.id,
      nomor: order.nomor,
      total: totalOrder(order.items),
      dibuat_at: order.dibuat_at,
    });
  });

  return r;
}
```

- [ ] **Step 5: Register the route in `server/app.ts`**

Add the import `import { ordersRoutes } from './routes/orders';` and, below the menu route, add:
```ts
  app.use('/api', ordersRoutes(ctx));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest server/routes/orders-create.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 7: Commit**

```bash
git add server/order-repo.ts server/routes/orders.ts server/app.ts server/routes/orders-create.test.ts
git commit -m "feat(server): add idempotent order creation with server-side pricing"
```

---

### Task 12: Customer cancel and kitchen actions

**Files:**
- Modify: `server/order-repo.ts`, `server/routes/orders.ts`
- Test: `server/routes/orders-dapur.test.ts`

**Interfaces:**
- Consumes: `bolehBatalPelanggan`, `bolehUndoSiap`, `tabUntuk`, `SIAP_TAMPIL_MS`, `tanggalDari` (Task 3); `requireRole`, `idParam` (Task 9); `batalPelangganSchema`, `tabSchema` (Task 6).
- Produces:
  - `batalPelanggan(db, id: number, clientUuid: string, now: number): Order`
  - `tandaiSiap(db, id: number, now: number): Order`
  - `undoSiap(db, id: number, now: number): Order`
  - `batalDapur(db, id: number, now: number): Order`
  - `batalItem(db, itemId: number, now: number): Order`
  - `daftarDapur(db, tab: Tab, now: number, jam: JamIstirahat): { orders: (Order & { tab: Tab; total: number })[]; jumlah: { sekarang: number; ist1: number; ist2: number } }`
  - `siapTerbaru(db, now: number): number[]`
  - Routes:
    - `POST /api/orders/:id/cancel` (public, body `{ client_uuid }`) → `200 Order`; `404 'Order tidak ditemukan'`; `409 'Batas waktu batal lewat'`
    - `GET /api/orders?tab=` [Dapur] → `daftarDapur` result
    - `POST /api/orders/:id/siap` [Dapur] → `200 Order`; `409 'Order bukan baru'`
    - `POST /api/orders/:id/undo-siap` [Dapur] → `200 Order`; `409 'Batas waktu urungkan lewat'`
    - `POST /api/orders/:id/batal` [Dapur] → `200 Order`; `409 'Order sudah batal'`
    - `POST /api/items/:id/batal` [Dapur] → `200 Order`; `404 'Item tidak ditemukan'`; `409 'Item sudah batal'`
    - `GET /api/siap` (public) → `{ nomor: number[] }`
  - Events: every successful status change emits `orders-changed`; `siap`, `undo-siap`, `batal`, and item `batal` also emit `siap-changed`.

Kitchen list rules:
- Only orders of today (`tanggalDari(now)`).
- `jumlah` counts orders per waiting tab (`sekarang`, `ist1`, `ist2`) using `tabUntuk`.
- Waiting tabs sort by `dibuat_at` ascending. `selesai` sorts by `siap_at ?? batal_at` descending.

- [ ] **Step 1: Write the failing test**

`server/routes/orders-dapur.test.ts`:
```ts
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const dapur = await login(t.app, 'dapur');
  const auth = { Authorization: `Bearer ${dapur}` };
  const pesan = async (waktu_ambil = 'sekarang', items = [{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] as number[] }]) => {
    const client_uuid = randomUUID();
    const res = await request(t.app).post('/api/orders').send({ client_uuid, waktu_ambil, device: 'Order 1', items });
    return { id: res.body.id as number, nomor: res.body.nomor as number, client_uuid };
  };
  const post = (path: string, body: object = {}) => request(t.app).post(path).set(auth).send(body);
  const list = (tab: string) => request(t.app).get(`/api/orders?tab=${tab}`).set(auth);
  return { ...t, s, auth, pesan, post, list };
}

describe('customer cancel', () => {
  test('allowed within 10 s with matching client_uuid', async () => {
    const { app, pesan, clock } = await setup();
    const o = await pesan();
    clock.maju(10_000);
    const res = await request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: o.client_uuid });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'batal', batal_oleh: 'pelanggan' });
  });

  test('refused after 10 s', async () => {
    const { app, pesan, clock } = await setup();
    const o = await pesan();
    clock.maju(10_001);
    const res = await request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: o.client_uuid });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Batas waktu batal lewat');
  });

  test('wrong client_uuid is 404', async () => {
    const { app, pesan } = await setup();
    const o = await pesan();
    const res = await request(app).post(`/api/orders/${o.id}/cancel`).send({ client_uuid: randomUUID() });
    expect(res.status).toBe(404);
  });
});

describe('kitchen auth', () => {
  test('no token is 401', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/orders?tab=sekarang')).status).toBe(401);
  });

  test('admin token also works', async () => {
    const { app } = await setup();
    const admin = await login(app, 'admin');
    expect((await request(app).get('/api/orders?tab=sekarang').set({ Authorization: `Bearer ${admin}` })).status).toBe(200);
  });

  test('invalid tab is 400', async () => {
    const { list } = await setup();
    expect((await list('besok')).status).toBe(400);
  });
});

describe('kitchen flow', () => {
  test('siap, undo within 30 s, undo refused after 30 s', async () => {
    const { pesan, post, clock, events } = await setup();
    const o = await pesan();
    events.length = 0;

    const siap = await post(`/api/orders/${o.id}/siap`);
    expect(siap.status).toBe(200);
    expect(siap.body).toMatchObject({ status: 'siap', siap_at: clock.t });
    expect(events).toEqual([{ type: 'orders-changed' }, { type: 'siap-changed' }]);
    expect((await post(`/api/orders/${o.id}/siap`)).status).toBe(409);

    clock.maju(30_000);
    const undo = await post(`/api/orders/${o.id}/undo-siap`);
    expect(undo.body).toMatchObject({ status: 'baru', siap_at: null });

    await post(`/api/orders/${o.id}/siap`);
    clock.maju(30_001);
    const late = await post(`/api/orders/${o.id}/undo-siap`);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('Batas waktu urungkan lewat');
  });

  test('kitchen can cancel a siap order; cancelling twice is 409', async () => {
    const { pesan, post } = await setup();
    const o = await pesan();
    await post(`/api/orders/${o.id}/siap`);
    const batal = await post(`/api/orders/${o.id}/batal`);
    expect(batal.body).toMatchObject({ status: 'batal', batal_oleh: 'dapur' });
    expect((await post(`/api/orders/${o.id}/batal`)).status).toBe(409);
  });

  test('cancelling the last active item cancels the order', async () => {
    const { pesan, post, s } = await setup();
    const o = await pesan('sekarang', [
      { menu_id: s.esTeh, qty: 1, pilihan_ids: [] },
      { menu_id: s.mie, qty: 1, pilihan_ids: [] },
    ]);
    const first = await post(`/api/orders/${o.id}/siap`);
    const [a, b] = first.body.items;

    const r1 = await post(`/api/items/${a.id}/batal`);
    expect(r1.body.status).toBe('siap');
    expect(r1.body.items[0].batal_at).not.toBeNull();
    expect((await post(`/api/items/${a.id}/batal`)).status).toBe(409);

    const r2 = await post(`/api/items/${b.id}/batal`);
    expect(r2.body).toMatchObject({ status: 'batal', batal_oleh: 'dapur' });
  });

  test('unknown order and item are 404', async () => {
    const { post } = await setup();
    expect((await post('/api/orders/999/siap')).status).toBe(404);
    expect((await post('/api/items/999/batal')).status).toBe(404);
  });
});

describe('kitchen tabs', () => {
  test('break orders are held, then move to sekarang 10 minutes before the break', async () => {
    const { pesan, list, clock } = await setup();
    const a = await pesan('sekarang');
    clock.maju(1000);
    const b = await pesan('ist1');
    const c = await pesan('ist2');

    const now = await list('sekarang');
    expect(now.body.orders.map((o: { id: number }) => o.id)).toEqual([a.id]);
    expect(now.body.jumlah).toEqual({ sekarang: 1, ist1: 1, ist2: 1 });
    expect(now.body.orders[0].total).toBe(3000);
    expect((await list('ist1')).body.orders.map((o: { id: number }) => o.id)).toEqual([b.id]);

    clock.t = new Date(2026, 8, 29, 9, 20).getTime();
    const later = await list('sekarang');
    expect(later.body.orders.map((o: { id: number }) => o.id)).toEqual([a.id, b.id]);
    expect(later.body.jumlah).toEqual({ sekarang: 2, ist1: 0, ist2: 1 });
    expect((await list('ist2')).body.orders[0].id).toBe(c.id);
  });

  test('selesai lists siap and batal, newest first', async () => {
    const { pesan, post, list, clock } = await setup();
    const a = await pesan();
    const b = await pesan();
    await post(`/api/orders/${a.id}/siap`);
    clock.maju(1000);
    await post(`/api/orders/${b.id}/batal`);
    const res = await list('selesai');
    expect(res.body.orders.map((o: { id: number }) => o.id)).toEqual([b.id, a.id]);
    expect(res.body.jumlah).toEqual({ sekarang: 0, ist1: 0, ist2: 0 });
  });

  test('yesterday orders are not listed', async () => {
    const { pesan, list, clock } = await setup();
    await pesan();
    clock.maju(24 * 3600_000);
    expect((await list('sekarang')).body.orders).toEqual([]);
  });
});

test('GET /api/siap lists siap numbers for 5 minutes', async () => {
  const { app, pesan, post, clock } = await setup();
  const a = await pesan();
  const b = await pesan();
  const c = await pesan();
  await post(`/api/orders/${b.id}/siap`);
  await post(`/api/orders/${a.id}/siap`);
  clock.maju(60_000);
  await post(`/api/orders/${c.id}/siap`);

  expect((await request(app).get('/api/siap')).body).toEqual({ nomor: [a.nomor, b.nomor, c.nomor] });
  clock.maju(4 * 60_000 + 1);
  expect((await request(app).get('/api/siap')).body).toEqual({ nomor: [c.nomor] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/orders-dapur.test.ts`
Expected: FAIL (404 responses / missing exports).

- [ ] **Step 3: Add kitchen functions to `server/order-repo.ts`**

Extend the imports at the top:
```ts
import { totalOrder } from '../shared/pricing';
import { bolehBatalPelanggan, bolehUndoSiap, SIAP_TAMPIL_MS, tabUntuk, tanggalDari } from '../shared/rules';
import type { Grup, JamIstirahat, Order, OrderItem, PilihanSnapshot, Tab } from '../shared/types';
```
(Replace the existing `rules` and `types` import lines with these.)

Append:
```ts
function wajibOrder(db: Db, id: number): Order {
  const order = ambilOrder(db, id);
  if (!order) throw new HttpError(404, 'Order tidak ditemukan');
  return order;
}

export function batalPelanggan(db: Db, id: number, clientUuid: string, now: number): Order {
  const order = ambilOrder(db, id);
  if (!order || order.client_uuid !== clientUuid) throw new HttpError(404, 'Order tidak ditemukan');
  if (!bolehBatalPelanggan(order, now)) throw new HttpError(409, 'Batas waktu batal lewat');
  run(db, "UPDATE orders SET status = 'batal', batal_at = ?, batal_oleh = 'pelanggan' WHERE id = ?", now, id);
  return wajibOrder(db, id);
}

export function tandaiSiap(db: Db, id: number, now: number): Order {
  if (wajibOrder(db, id).status !== 'baru') throw new HttpError(409, 'Order bukan baru');
  run(db, "UPDATE orders SET status = 'siap', siap_at = ? WHERE id = ?", now, id);
  return wajibOrder(db, id);
}

export function undoSiap(db: Db, id: number, now: number): Order {
  if (!bolehUndoSiap(wajibOrder(db, id), now)) throw new HttpError(409, 'Batas waktu urungkan lewat');
  run(db, "UPDATE orders SET status = 'baru', siap_at = NULL WHERE id = ?", id);
  return wajibOrder(db, id);
}

export function batalDapur(db: Db, id: number, now: number): Order {
  if (wajibOrder(db, id).status === 'batal') throw new HttpError(409, 'Order sudah batal');
  run(db, "UPDATE orders SET status = 'batal', batal_at = ?, batal_oleh = 'dapur' WHERE id = ?", now, id);
  return wajibOrder(db, id);
}

export function batalItem(db: Db, itemId: number, now: number): Order {
  return tx(db, () => {
    const item = get<{ order_id: number; batal_at: number | null }>(
      db,
      'SELECT order_id, batal_at FROM order_item WHERE id = ?',
      itemId,
    );
    if (!item) throw new HttpError(404, 'Item tidak ditemukan');
    const order = wajibOrder(db, item.order_id);
    if (item.batal_at !== null || order.status === 'batal') throw new HttpError(409, 'Item sudah batal');

    run(db, 'UPDATE order_item SET batal_at = ? WHERE id = ?', now, itemId);
    const sisa = get<{ n: number }>(
      db,
      'SELECT COUNT(*) AS n FROM order_item WHERE order_id = ? AND batal_at IS NULL',
      item.order_id,
    )!.n;
    if (sisa === 0) {
      run(db, "UPDATE orders SET status = 'batal', batal_at = ?, batal_oleh = 'dapur' WHERE id = ?", now, item.order_id);
    }
    return wajibOrder(db, item.order_id);
  });
}

export function daftarDapur(db: Db, tab: Tab, now: number, jam: JamIstirahat) {
  const semua = ordersHari(db, tanggalDari(now)).map((o) => ({
    ...o,
    tab: tabUntuk(o, now, jam),
    total: totalOrder(o.items),
  }));
  const jumlah = { sekarang: 0, ist1: 0, ist2: 0 };
  for (const o of semua) if (o.tab !== 'selesai') jumlah[o.tab]++;

  const orders = semua.filter((o) => o.tab === tab);
  if (tab === 'selesai') {
    orders.sort((a, b) => (b.siap_at ?? b.batal_at ?? 0) - (a.siap_at ?? a.batal_at ?? 0));
  } else {
    orders.sort((a, b) => a.dibuat_at - b.dibuat_at);
  }
  return { orders, jumlah };
}

export function siapTerbaru(db: Db, now: number): number[] {
  return all<{ nomor: number }>(
    db,
    "SELECT nomor FROM orders WHERE tanggal = ? AND status = 'siap' AND siap_at >= ? ORDER BY nomor",
    tanggalDari(now),
    now - SIAP_TAMPIL_MS,
  ).map((r) => r.nomor);
}
```

- [ ] **Step 4: Add routes to `server/routes/orders.ts`**

Replace the file with:
```ts
import { Router } from 'express';
import { totalOrder } from '../../shared/pricing';
import { batalPelangganSchema, orderBaruSchema, tabSchema } from '../../shared/schemas';
import type { Ctx } from '../context';
import { idParam, parse, requireRole } from '../http';
import {
  batalDapur,
  batalItem,
  batalPelanggan,
  buatOrder,
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
    const { qty_max } = getPengaturan(ctx.db);
    const { order, baru } = buatOrder(ctx.db, input, ctx.clock.now(), qty_max);
    if (baru) berubah(false);
    res.status(baru ? 201 : 200).json({
      id: order.id,
      nomor: order.nomor,
      total: totalOrder(order.items),
      dibuat_at: order.dibuat_at,
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
    const order = tandaiSiap(ctx.db, idParam(req.params.id), ctx.clock.now());
    berubah(true);
    res.json(order);
  });

  r.post('/orders/:id/undo-siap', dapur, (req, res) => {
    const order = undoSiap(ctx.db, idParam(req.params.id), ctx.clock.now());
    berubah(true);
    res.json(order);
  });

  r.post('/orders/:id/batal', dapur, (req, res) => {
    const order = batalDapur(ctx.db, idParam(req.params.id), ctx.clock.now());
    berubah(true);
    res.json(order);
  });

  r.post('/items/:id/batal', dapur, (req, res) => {
    const order = batalItem(ctx.db, idParam(req.params.id), ctx.clock.now());
    berubah(true);
    res.json(order);
  });

  return r;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest server/routes`
Expected: PASS for `auth`, `menu`, `orders-create`, and `orders-dapur` suites.

- [ ] **Step 6: Commit**

```bash
git add server/order-repo.ts server/routes/orders.ts server/routes/orders-dapur.test.ts
git commit -m "feat(server): add customer cancel, kitchen actions and kitchen tabs"
```

---

### Task 13: Admin menu, group and option management

**Files:**
- Modify: `server/menu-repo.ts`, `server/app.ts`
- Create: `server/routes/admin-menu.ts`
- Test: `server/routes/admin-menu.test.ts`

**Interfaces:**
- Consumes: `menuSchema`, `grupSchema`, `pilihanSchema`, `pilihanUbahSchema`, `idsSchema`, `tersediaSchema`, `menuGrupSchema` (Task 6); `grupAktif` (Task 10); `requireRole`, `idParam`, `parse`, `HttpError` (Task 9).
- Produces:
  - `daftarMenuAdmin(db: Db): { menu: { id, nama, harga, tersedia: boolean, urutan, dibuat_at, grup_ids: number[] }[]; grup: Grup[] }`
  - Routes under `/api/admin` (all [Admin]; every successful mutation emits `menu-changed`):
    - `GET /menu` → `daftarMenuAdmin`
    - `POST /menu` → `201 { id }`
    - `PUT /menu/:id` → `200 { ok: true }`; `404 'Menu tidak ditemukan'`
    - `POST /menu/hapus` `{ ids }` → soft delete
    - `POST /menu/tersedia` `{ ids, tersedia }`
    - `PUT /menu/:id/grup` `{ grup_ids }` → replace attached groups in the given order; unknown or deleted group → `400 'Grup tidak valid'`
    - `POST /grup` → `201 { id }`, `PUT /grup/:id`, `DELETE /grup/:id` (soft)
    - `POST /pilihan` → `201 { id }` (unknown/deleted group → `400 'Grup tidak valid'`), `PUT /pilihan/:id`, `DELETE /pilihan/:id` (soft)
    - Missing/deleted `grup` or `pilihan` id on PUT/DELETE → `404`

- [ ] **Step 1: Write the failing test**

`server/routes/admin-menu.test.ts`:
```ts
import request from 'supertest';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const token = await login(t.app, 'admin');
  const auth = { Authorization: `Bearer ${token}` };
  const api = {
    get: (p: string) => request(t.app).get(`/api/admin${p}`).set(auth),
    post: (p: string, b: object) => request(t.app).post(`/api/admin${p}`).set(auth).send(b),
    put: (p: string, b: object) => request(t.app).put(`/api/admin${p}`).set(auth).send(b),
    del: (p: string) => request(t.app).delete(`/api/admin${p}`).set(auth),
  };
  const publik = async () => (await request(t.app).get('/api/menu')).body.menu as { id: number; nama: string; harga: number; tersedia: boolean; grup: { nama: string; pilihan: { label: string; harga: number }[] }[] }[];
  return { ...t, s, api, publik };
}

test('kitchen token is 403, no token is 401', async () => {
  const { app } = await setup();
  const dapur = await login(app, 'dapur');
  expect((await request(app).get('/api/admin/menu').set({ Authorization: `Bearer ${dapur}` })).status).toBe(403);
  expect((await request(app).get('/api/admin/menu')).status).toBe(401);
});

test('create, update and list a menu', async () => {
  const { api, events, publik } = await setup();
  const created = await api.post('/menu', { nama: 'Bakso', harga: 8000 });
  expect(created.status).toBe(201);
  expect(events).toContainEqual({ type: 'menu-changed' });

  expect((await api.put(`/menu/${created.body.id}`, { nama: 'Bakso Urat', harga: 9000, tersedia: true, urutan: 5 })).status).toBe(200);
  const bakso = (await publik()).find((m) => m.id === created.body.id)!;
  expect(bakso).toMatchObject({ nama: 'Bakso Urat', harga: 9000, tersedia: true });

  const list = await api.get('/menu');
  expect(list.body.menu.find((m: { id: number }) => m.id === created.body.id).grup_ids).toEqual([]);
  expect(list.body.grup.map((g: { nama: string }) => g.nama)).toEqual(['Kepedasan', 'Ukuran', 'Topping', 'Saus']);
});

test('update of unknown menu is 404', async () => {
  const { api } = await setup();
  expect((await api.put('/menu/999', { nama: 'X', harga: 1 })).status).toBe(404);
});

test('bulk sold-out toggle and bulk delete', async () => {
  const { api, s, publik } = await setup();
  await api.post('/menu/tersedia', { ids: [s.mie, s.esTeh], tersedia: false });
  expect((await publik()).filter((m) => m.tersedia).length).toBe(0);

  await api.post('/menu/hapus', { ids: [s.esTeh, s.nasi] });
  expect((await publik()).map((m) => m.nama)).toEqual(['Mie Goreng']);
  expect((await api.put(`/menu/${s.esTeh}`, { nama: 'X', harga: 1 })).status).toBe(404);
});

test('attach groups in a given order; unknown group is 400', async () => {
  const { api, s, publik } = await setup();
  expect((await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [s.grupTopping, s.grupPedas] })).status).toBe(200);
  const esTeh = (await publik()).find((m) => m.id === s.esTeh)!;
  expect(esTeh.grup.map((g) => g.nama)).toEqual(['Topping', 'Kepedasan']);

  expect((await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [999] })).status).toBe(400);
  expect((await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [] })).status).toBe(200);
  expect((await publik()).find((m) => m.id === s.esTeh)!.grup).toEqual([]);
});

test('create group and options; empty price becomes free', async () => {
  const { api, s, publik } = await setup();
  const g = await api.post('/grup', { nama: 'Es', widget: 'option' });
  expect(g.status).toBe(201);
  await api.post('/pilihan', { grup_id: g.body.id, label: 'Normal', harga: null });
  await api.post('/pilihan', { grup_id: g.body.id, label: 'Banyak', harga: 500, urutan: 1 });
  await api.put(`/menu/${s.esTeh}/grup`, { grup_ids: [g.body.id] });

  const esTeh = (await publik()).find((m) => m.id === s.esTeh)!;
  expect(esTeh.grup[0].pilihan).toEqual([
    expect.objectContaining({ label: 'Normal', harga: 0 }),
    expect.objectContaining({ label: 'Banyak', harga: 500 }),
  ]);
});

test('option for unknown group is 400', async () => {
  const { api } = await setup();
  expect((await api.post('/pilihan', { grup_id: 999, label: 'X' })).status).toBe(400);
});

test('spice level can be removed and group deleted', async () => {
  const { api, s, publik } = await setup();
  expect((await api.del(`/pilihan/${s.pedas[5]}`)).status).toBe(200);
  let mie = (await publik()).find((m) => m.id === s.mie)!;
  expect(mie.grup[0].pilihan.map((p) => p.label)).toEqual(['0', '1', '2', '3', '4']);

  expect((await api.put(`/pilihan/${s.pedas[4]}`, { label: '4!', harga: 1000, urutan: 4 })).status).toBe(200);
  mie = (await publik()).find((m) => m.id === s.mie)!;
  expect(mie.grup[0].pilihan[4]).toMatchObject({ label: '4!', harga: 1000 });

  expect((await api.del(`/grup/${s.grupPedas}`)).status).toBe(200);
  mie = (await publik()).find((m) => m.id === s.mie)!;
  expect(mie.grup.map((g) => g.nama)).toEqual(['Ukuran', 'Topping']);
  expect((await api.del(`/grup/${s.grupPedas}`)).status).toBe(404);
  expect((await api.put(`/grup/${s.grupPedas}`, { nama: 'X', widget: 'option' })).status).toBe(404);
});

test('invalid widget is 400', async () => {
  const { api } = await setup();
  expect((await api.post('/grup', { nama: 'X', widget: 'slider' })).status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/admin-menu.test.ts`
Expected: FAIL (404 responses).

- [ ] **Step 3: Add `daftarMenuAdmin` to `server/menu-repo.ts`**

Append:
```ts
export function daftarMenuAdmin(db: Db) {
  const grup = grupAktif(db);
  const menu = all<{ id: number; nama: string; harga: number; tersedia: number; urutan: number; dibuat_at: number }>(
    db,
    'SELECT id, nama, harga, tersedia, urutan, dibuat_at FROM menu WHERE dihapus_at IS NULL ORDER BY urutan, id',
  ).map((m) => ({
    ...m,
    tersedia: m.tersedia === 1,
    grup_ids: grupUntukMenu(db, m.id, grup).map((g) => g.id),
  }));
  return { menu, grup: [...grup.values()] };
}
```

- [ ] **Step 4: Create `server/routes/admin-menu.ts`**

```ts
import { Router } from 'express';
import {
  grupSchema,
  idsSchema,
  menuGrupSchema,
  menuSchema,
  pilihanSchema,
  pilihanUbahSchema,
  tersediaSchema,
} from '../../shared/schemas';
import type { Ctx } from '../context';
import { get, run, tx, type Db } from '../db';
import { HttpError, idParam, parse } from '../http';
import { daftarMenuAdmin } from '../menu-repo';

function aktif(db: Db, tabel: 'menu' | 'grup' | 'pilihan', id: number): boolean {
  return get(db, `SELECT 1 AS x FROM ${tabel} WHERE id = ? AND dihapus_at IS NULL`, id) !== undefined;
}

function wajibAktif(db: Db, tabel: 'menu' | 'grup' | 'pilihan', id: number): void {
  const nama = { menu: 'Menu', grup: 'Grup', pilihan: 'Pilihan' }[tabel];
  if (!aktif(db, tabel, id)) throw new HttpError(404, `${nama} tidak ditemukan`);
}

export function adminMenuRoutes(ctx: Ctx): Router {
  const r = Router();
  const { db } = ctx;
  const berubah = () => ctx.emit({ type: 'menu-changed' });

  r.get('/menu', (_req, res) => {
    res.json(daftarMenuAdmin(db));
  });

  r.post('/menu', (req, res) => {
    const m = parse(menuSchema, req.body);
    const id = run(
      db,
      'INSERT INTO menu (nama, harga, tersedia, urutan, dibuat_at) VALUES (?, ?, ?, ?, ?)',
      m.nama, m.harga, m.tersedia ? 1 : 0, m.urutan, ctx.clock.now(),
    ).lastInsertRowid;
    berubah();
    res.status(201).json({ id });
  });

  r.put('/menu/:id', (req, res) => {
    const id = idParam(req.params.id);
    const m = parse(menuSchema, req.body);
    wajibAktif(db, 'menu', id);
    run(db, 'UPDATE menu SET nama = ?, harga = ?, tersedia = ?, urutan = ? WHERE id = ?', m.nama, m.harga, m.tersedia ? 1 : 0, m.urutan, id);
    berubah();
    res.json({ ok: true });
  });

  r.post('/menu/hapus', (req, res) => {
    const { ids } = parse(idsSchema, req.body);
    const now = ctx.clock.now();
    tx(db, () => {
      for (const id of ids) run(db, 'UPDATE menu SET dihapus_at = ? WHERE id = ? AND dihapus_at IS NULL', now, id);
    });
    berubah();
    res.json({ ok: true });
  });

  r.post('/menu/tersedia', (req, res) => {
    const { ids, tersedia } = parse(tersediaSchema, req.body);
    tx(db, () => {
      for (const id of ids) run(db, 'UPDATE menu SET tersedia = ? WHERE id = ?', tersedia ? 1 : 0, id);
    });
    berubah();
    res.json({ ok: true });
  });

  r.put('/menu/:id/grup', (req, res) => {
    const id = idParam(req.params.id);
    const { grup_ids } = parse(menuGrupSchema, req.body);
    wajibAktif(db, 'menu', id);
    const unik = [...new Set(grup_ids)];
    if (!unik.every((g) => aktif(db, 'grup', g))) throw new HttpError(400, 'Grup tidak valid');
    tx(db, () => {
      run(db, 'DELETE FROM menu_grup WHERE menu_id = ?', id);
      unik.forEach((g, i) => run(db, 'INSERT INTO menu_grup (menu_id, grup_id, urutan) VALUES (?, ?, ?)', id, g, i));
    });
    berubah();
    res.json({ ok: true });
  });

  r.post('/grup', (req, res) => {
    const g = parse(grupSchema, req.body);
    const id = run(db, 'INSERT INTO grup (nama, widget, urutan) VALUES (?, ?, ?)', g.nama, g.widget, g.urutan).lastInsertRowid;
    berubah();
    res.status(201).json({ id });
  });

  r.put('/grup/:id', (req, res) => {
    const id = idParam(req.params.id);
    const g = parse(grupSchema, req.body);
    wajibAktif(db, 'grup', id);
    run(db, 'UPDATE grup SET nama = ?, widget = ?, urutan = ? WHERE id = ?', g.nama, g.widget, g.urutan, id);
    berubah();
    res.json({ ok: true });
  });

  r.delete('/grup/:id', (req, res) => {
    const id = idParam(req.params.id);
    wajibAktif(db, 'grup', id);
    run(db, 'UPDATE grup SET dihapus_at = ? WHERE id = ?', ctx.clock.now(), id);
    berubah();
    res.json({ ok: true });
  });

  r.post('/pilihan', (req, res) => {
    const p = parse(pilihanSchema, req.body);
    if (!aktif(db, 'grup', p.grup_id)) throw new HttpError(400, 'Grup tidak valid');
    const id = run(
      db,
      'INSERT INTO pilihan (grup_id, label, harga, urutan) VALUES (?, ?, ?, ?)',
      p.grup_id, p.label, p.harga, p.urutan,
    ).lastInsertRowid;
    berubah();
    res.status(201).json({ id });
  });

  r.put('/pilihan/:id', (req, res) => {
    const id = idParam(req.params.id);
    const p = parse(pilihanUbahSchema, req.body);
    wajibAktif(db, 'pilihan', id);
    run(db, 'UPDATE pilihan SET label = ?, harga = ?, urutan = ? WHERE id = ?', p.label, p.harga, p.urutan, id);
    berubah();
    res.json({ ok: true });
  });

  r.delete('/pilihan/:id', (req, res) => {
    const id = idParam(req.params.id);
    wajibAktif(db, 'pilihan', id);
    run(db, 'UPDATE pilihan SET dihapus_at = ? WHERE id = ?', ctx.clock.now(), id);
    berubah();
    res.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 5: Register admin routes in `server/app.ts`**

Add the imports:
```ts
import { requireRole } from './http';
import { adminMenuRoutes } from './routes/admin-menu';
```
(Merge `requireRole` into the existing `import { errorHandler } from './http';` line.)

Below the orders route, add:
```ts
  app.use('/api/admin', requireRole(ctx, 'admin'));
  app.use('/api/admin', adminMenuRoutes(ctx));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest server/routes`
Expected: PASS for all route suites.

- [ ] **Step 7: Commit**

```bash
git add server/menu-repo.ts server/routes/admin-menu.ts server/app.ts server/routes/admin-menu.test.ts
git commit -m "feat(server): add admin management for menu, groups and options"
```

---

### Task 14: Admin settings and PIN change

**Files:**
- Create: `server/routes/admin-settings.ts`
- Modify: `server/app.ts`
- Test: `server/routes/admin-settings.test.ts`

**Interfaces:**
- Consumes: `pengaturanSchema`, `gantiPinSchema` (Task 6); `getPengaturan`, `setSetting` (Task 7); `hashPin` (Task 8).
- Produces (all [Admin] under `/api/admin`):
  - `GET /pengaturan` → `{ jam_ist1, jam_ist2, qty_max }`
  - `PUT /pengaturan` → `{ ok: true }`, emits `menu-changed` (the public menu response carries these values)
  - `PUT /pin` `{ peran, pin_baru }` → `{ ok: true }`; revokes all existing tokens of that role

- [ ] **Step 1: Write the failing test**

`server/routes/admin-settings.test.ts`:
```ts
import request from 'supertest';
import { buatTestApp, login } from '../testing';

async function setup() {
  const t = buatTestApp();
  const admin = await login(t.app, 'admin');
  const auth = { Authorization: `Bearer ${admin}` };
  return { ...t, auth };
}

test('read and change break times and qty_max', async () => {
  const { app, auth, events } = await setup();
  expect((await request(app).get('/api/admin/pengaturan').set(auth)).body).toEqual({ jam_ist1: '09:30', jam_ist2: '12:00', qty_max: 10 });

  const res = await request(app).put('/api/admin/pengaturan').set(auth).send({ jam_ist1: '10:00', jam_ist2: '12:30', qty_max: 5 });
  expect(res.status).toBe(200);
  expect(events).toContainEqual({ type: 'menu-changed' });

  const menu = await request(app).get('/api/menu');
  expect(menu.body.jam).toEqual({ ist1: '10:00', ist2: '12:30' });
  expect(menu.body.qty_max).toBe(5);
});

test('invalid settings are 400', async () => {
  const { app, auth } = await setup();
  expect((await request(app).put('/api/admin/pengaturan').set(auth).send({ jam_ist1: '25:00', jam_ist2: '12:00', qty_max: 5 })).status).toBe(400);
});

test('changing the kitchen PIN revokes kitchen tokens and the old PIN stops working', async () => {
  const { app, auth } = await setup();
  const dapurLama = await login(app, 'dapur');

  expect((await request(app).put('/api/admin/pin').set(auth).send({ peran: 'dapur', pin_baru: '222222' })).status).toBe(200);

  expect((await request(app).get('/api/orders?tab=sekarang').set({ Authorization: `Bearer ${dapurLama}` })).status).toBe(401);
  expect((await request(app).post('/api/auth/pin').send({ peran: 'dapur', pin: '111111', device: 'X' })).status).toBe(401);
  expect((await request(app).post('/api/auth/pin').send({ peran: 'dapur', pin: '222222', device: 'X' })).status).toBe(200);
});

test('kitchen cannot change PINs', async () => {
  const { app } = await setup();
  const dapur = await login(app, 'dapur');
  const res = await request(app).put('/api/admin/pin').set({ Authorization: `Bearer ${dapur}` }).send({ peran: 'admin', pin_baru: '000000' });
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/admin-settings.test.ts`
Expected: FAIL (404 responses).

- [ ] **Step 3: Create `server/routes/admin-settings.ts`**

```ts
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

  r.put('/pin', (req, res) => {
    const { peran, pin_baru } = parse(gantiPinSchema, req.body);
    setSetting(ctx.db, `pin_${peran}_hash`, hashPin(pin_baru));
    ctx.tokens.cabutSemua(peran);
    res.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Register in `server/app.ts`**

Add `import { adminSettingsRoutes } from './routes/admin-settings';` and below `adminMenuRoutes`:
```ts
  app.use('/api/admin', adminSettingsRoutes(ctx));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest server/routes/admin-settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin-settings.ts server/app.ts server/routes/admin-settings.test.ts
git commit -m "feat(server): add admin settings and PIN change"
```

---

### Task 15: Daily reports and CSV export

**Files:**
- Create: `server/laporan-repo.ts`, `server/routes/admin-laporan.ts`
- Modify: `server/app.ts`
- Test: `server/routes/admin-laporan.test.ts`

**Interfaces:**
- Consumes: `susunLaporan` (Task 5), `toCsv`, `HEADER_CSV`, `laporanKeBaris` (Task 5), `ordersHari` (Task 11), `laporanSchema`, `tanggalSchema` (Task 6).
- Produces:
  - `hitungLaporan(db: Db, tanggal: string, pengeluaran: number): Laporan`
  - `ambilLaporan(db: Db, tanggal: string): { laporan: Laporan; disimpan_at: number | null }` — saved snapshot if present, else live with `pengeluaran = 0`
  - `simpanLaporan(db: Db, tanggal: string, pengeluaran: number, now: number): Laporan`
  - `daftarLaporan(db: Db): { tanggal, pemasukan, pengeluaran, keuntungan, disimpan_at }[]` (newest first)
  - `rentangTanggal(dari: string, sampai: string): string[]` — inclusive; `400` if `dari > sampai` or more than 366 days
  - Routes (all [Admin] under `/api/admin`):
    - `GET /laporan` → `daftarLaporan`
    - `GET /laporan/:tanggal` → `ambilLaporan`
    - `PUT /laporan/:tanggal` `{ pengeluaran }` → `{ laporan, disimpan_at }`
    - `GET /laporan.csv?dari=&sampai=` → `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="laporan_<dari>_<sampai>.csv"`

- [ ] **Step 1: Write the failing test**

`server/routes/admin-laporan.test.ts`:
```ts
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { rentangTanggal } from '../laporan-repo';
import { buatTestApp, login, PAGI, seedMenu } from '../testing';

async function setup() {
  const t = buatTestApp();
  const s = seedMenu(t.db, PAGI);
  const admin = { Authorization: `Bearer ${await login(t.app, 'admin')}` };
  const dapur = { Authorization: `Bearer ${await login(t.app, 'dapur')}` };
  const pesan = async (items: { menu_id: number; qty: number; pilihan_ids: number[] }[]) =>
    (await request(t.app).post('/api/orders').send({ client_uuid: randomUUID(), waktu_ambil: 'sekarang', device: 'Order 1', items })).body.id as number;
  const siap = (id: number) => request(t.app).post(`/api/orders/${id}/siap`).set(dapur);
  return { ...t, s, admin, dapur, pesan, siap };
}

test('live report counts siap orders only', async () => {
  const { app, s, admin, pesan, siap } = await setup();
  const a = await pesan([{ menu_id: s.mie, qty: 2, pilihan_ids: [s.telur] }]);
  await pesan([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]);
  await siap(a);

  const res = await request(app).get('/api/admin/laporan/2026-09-29').set(admin);
  expect(res.status).toBe(200);
  expect(res.body.disimpan_at).toBeNull();
  expect(res.body.laporan).toMatchObject({
    menu: [{ nama: 'Mie Goreng', harga: 10000, qty: 2, total: 20000 }],
    topping: [{ nama: 'Topping: Telur', harga: 2000, qty: 2, total: 4000 }],
    pemasukan: 24000,
    pengeluaran: 0,
    keuntungan: 24000,
  });
});

test('save freezes the report with expenses and appears in the list', async () => {
  const { app, s, admin, pesan, siap, clock } = await setup();
  await siap(await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }]));

  const saved = await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: 2500 });
  expect(saved.body.laporan).toMatchObject({ pemasukan: 6000, pengeluaran: 2500, keuntungan: 3500 });
  expect(saved.body.disimpan_at).toBe(clock.t);

  // A later order does not change the frozen report until the admin saves again.
  await siap(await pesan([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]));
  expect((await request(app).get('/api/admin/laporan/2026-09-29').set(admin)).body.laporan.pemasukan).toBe(6000);

  const list = await request(app).get('/api/admin/laporan').set(admin);
  expect(list.body).toEqual([{ tanggal: '2026-09-29', pemasukan: 6000, pengeluaran: 2500, keuntungan: 3500, disimpan_at: clock.t }]);
});

test('deleted menu and price change keep old report values (Review Focus 4)', async () => {
  const { app, s, admin, pesan, siap } = await setup();
  await siap(await pesan([{ menu_id: s.mie, qty: 1, pilihan_ids: [] }]));
  await request(app).put(`/api/admin/menu/${s.mie}`).set(admin).send({ nama: 'Mie Baru', harga: 50000 });
  await request(app).post('/api/admin/menu/hapus').set(admin).send({ ids: [s.mie] });

  const res = await request(app).get('/api/admin/laporan/2026-09-29').set(admin);
  expect(res.body.laporan.menu).toEqual([{ nama: 'Mie Goreng', harga: 10000, qty: 1, total: 10000 }]);
});

test('invalid date and negative expenses are 400', async () => {
  const { app, admin } = await setup();
  expect((await request(app).get('/api/admin/laporan/29-09-2026').set(admin)).status).toBe(400);
  expect((await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: -1 })).status).toBe(400);
});

test('CSV export covers the range with BOM and ; separator', async () => {
  const { app, s, admin, pesan, siap, clock } = await setup();
  await siap(await pesan([{ menu_id: s.esTeh, qty: 1, pilihan_ids: [] }]));
  await request(app).put('/api/admin/laporan/2026-09-29').set(admin).send({ pengeluaran: 1000 });
  clock.maju(24 * 3600_000);
  await siap(await pesan([{ menu_id: s.esTeh, qty: 2, pilihan_ids: [] }]));

  const res = await request(app).get('/api/admin/laporan.csv?dari=2026-09-29&sampai=2026-09-30').set(admin);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
  expect(res.headers['content-disposition']).toBe('attachment; filename="laporan_2026-09-29_2026-09-30.csv"');
  const lines = res.text.split('\r\n');
  expect(lines[0]).toBe('﻿tanggal;jenis;nama;harga;qty;total');
  expect(lines).toContain('2026-09-29;menu;Es Teh;3000;1;3000');
  expect(lines).toContain('2026-09-29;keuntungan;;;;2000');
  expect(lines).toContain('2026-09-30;menu;Es Teh;3000;2;6000');
});

test('rentangTanggal is inclusive and bounded', () => {
  expect(rentangTanggal('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  expect(() => rentangTanggal('2026-03-02', '2026-03-01')).toThrow('Rentang tanggal tidak valid');
  expect(() => rentangTanggal('2025-01-01', '2026-03-01')).toThrow('Maksimal 366 hari');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/routes/admin-laporan.test.ts`
Expected: FAIL, `Cannot find module '../laporan-repo'`.

- [ ] **Step 3: Create `server/laporan-repo.ts`**

```ts
import { susunLaporan } from '../shared/report';
import type { Laporan } from '../shared/types';
import { all, get, run, type Db } from './db';
import { HttpError } from './http';
import { ordersHari } from './order-repo';

export function hitungLaporan(db: Db, tanggal: string, pengeluaran: number): Laporan {
  return susunLaporan(tanggal, ordersHari(db, tanggal), pengeluaran);
}

export function ambilLaporan(db: Db, tanggal: string): { laporan: Laporan; disimpan_at: number | null } {
  const row = get<{ isi_json: string; disimpan_at: number }>(
    db,
    'SELECT isi_json, disimpan_at FROM laporan WHERE tanggal = ?',
    tanggal,
  );
  if (row) return { laporan: JSON.parse(row.isi_json) as Laporan, disimpan_at: row.disimpan_at };
  return { laporan: hitungLaporan(db, tanggal, 0), disimpan_at: null };
}

export function simpanLaporan(db: Db, tanggal: string, pengeluaran: number, now: number): Laporan {
  const laporan = hitungLaporan(db, tanggal, pengeluaran);
  run(
    db,
    `INSERT INTO laporan (tanggal, pengeluaran, isi_json, disimpan_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tanggal) DO UPDATE SET pengeluaran = excluded.pengeluaran,
       isi_json = excluded.isi_json, disimpan_at = excluded.disimpan_at`,
    tanggal, pengeluaran, JSON.stringify(laporan), now,
  );
  return laporan;
}

export function daftarLaporan(db: Db) {
  return all<{ tanggal: string; isi_json: string; disimpan_at: number }>(
    db,
    'SELECT tanggal, isi_json, disimpan_at FROM laporan ORDER BY tanggal DESC',
  ).map((row) => {
    const l = JSON.parse(row.isi_json) as Laporan;
    return {
      tanggal: row.tanggal,
      pemasukan: l.pemasukan,
      pengeluaran: l.pengeluaran,
      keuntungan: l.keuntungan,
      disimpan_at: row.disimpan_at,
    };
  });
}

const HARI_MS = 24 * 3600_000;
const keUtc = (t: string) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));

export function rentangTanggal(dari: string, sampai: string): string[] {
  const a = keUtc(dari);
  const b = keUtc(sampai);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) throw new HttpError(400, 'Rentang tanggal tidak valid');
  if ((b - a) / HARI_MS >= 366) throw new HttpError(400, 'Maksimal 366 hari');
  const hasil: string[] = [];
  for (let t = a; t <= b; t += HARI_MS) hasil.push(new Date(t).toISOString().slice(0, 10));
  return hasil;
}
```

- [ ] **Step 4: Create `server/routes/admin-laporan.ts`**

```ts
import { Router } from 'express';
import { HEADER_CSV, laporanKeBaris, toCsv } from '../../shared/csv';
import { laporanSchema, tanggalSchema } from '../../shared/schemas';
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
    const rows = rentangTanggal(dari, sampai).flatMap((t) => laporanKeBaris(ambilLaporan(ctx.db, t).laporan));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan_${dari}_${sampai}.csv"`);
    res.send(toCsv([HEADER_CSV, ...rows]));
  });

  r.get('/laporan/:tanggal', (req, res) => {
    res.json(ambilLaporan(ctx.db, parse(tanggalSchema, req.params.tanggal)));
  });

  r.put('/laporan/:tanggal', (req, res) => {
    const tanggal = parse(tanggalSchema, req.params.tanggal);
    const { pengeluaran } = parse(laporanSchema, req.body);
    const now = ctx.clock.now();
    res.json({ laporan: simpanLaporan(ctx.db, tanggal, pengeluaran, now), disimpan_at: now });
  });

  return r;
}
```

- [ ] **Step 5: Register in `server/app.ts`**

Add `import { adminLaporanRoutes } from './routes/admin-laporan';` and below `adminSettingsRoutes`:
```ts
  app.use('/api/admin', adminLaporanRoutes(ctx));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest server/routes/admin-laporan.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/laporan-repo.ts server/routes/admin-laporan.ts server/app.ts server/routes/admin-laporan.test.ts
git commit -m "feat(server): add daily reports, saved snapshots and CSV export"
```

---

### Task 16: WebSocket, backup and host entrypoint

**Files:**
- Create: `server/ws.ts`, `server/backup.ts`, `server/pin-setup.ts`, `server/main.ts`, `server/reset-pin.ts`
- Test: `server/ws.test.ts`, `server/backup.test.ts`

**Interfaces:**
- Consumes: `createApp` (Task 9), `openDb` (Task 7), `hashPin` (Task 8), `getSetting`, `setSetting` (Task 7), `tanggalDari` (Task 3), `Emit` (Task 9).
- Produces:
  - `pasangWs(server: http.Server): { emit: Emit; tutup(): void }` — WebSocket on path `/ws`, sends each event as JSON text, pings every 15 s and drops dead clients
  - `backupSekali(db: Db, dir: string, now: number, simpan = 7): string | null` — writes `kantin-YYYY-MM-DD.db` with `VACUUM INTO` once per day, keeps the newest `simpan` files
  - `mintaPin(label: string): Promise<string>`, `pastikanPin(db: Db): Promise<void>`
  - `npm start` runs `dist/server/main.js`. Environment: `PORT` (default 3000), `KANTIN_DATA` (default `./data`), `KANTIN_STATIC` (default `./app/build/client`), `KANTIN_PIN_DAPUR` / `KANTIN_PIN_ADMIN` (first run without a terminal).
  - `npm run reset-pin` sets a new admin PIN.

- [ ] **Step 1: Write the failing WebSocket test**

`server/ws.test.ts`:
```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { pasangWs } from './ws';

test('broadcasts events to connected clients as JSON', async () => {
  const server = http.createServer();
  const ws = pasangWs(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((r) => client.once('open', r));
  const pesan = new Promise<string>((r) => client.once('message', (d) => r(d.toString())));

  ws.emit({ type: 'orders-changed' });
  expect(JSON.parse(await pesan)).toEqual({ type: 'orders-changed' });

  client.close();
  ws.tutup();
  await new Promise((r) => server.close(r));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/ws.test.ts`
Expected: FAIL, `Cannot find module './ws'`.

- [ ] **Step 3: Create `server/ws.ts`**

```ts
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { Emit } from './events';

export function pasangWs(server: Server): { emit: Emit; tutup(): void } {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const hidup = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    hidup.set(ws, true);
    ws.on('pong', () => hidup.set(ws, true));
  });

  // Phones on a flaky hotspot vanish without closing; ping to find them.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!hidup.get(ws)) {
        ws.terminate();
        continue;
      }
      hidup.set(ws, false);
      ws.ping();
    }
  }, 15_000);

  return {
    emit: (event) => {
      const data = JSON.stringify(event);
      for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    tutup: () => {
      clearInterval(timer);
      wss.close();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/ws.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing backup test**

`server/backup.test.ts`:
```ts
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupSekali } from './backup';
import { openDb, run } from './db';

const hari = (d: number) => new Date(2026, 8, d, 10, 0).getTime();

test('writes one readable backup per day and keeps the newest 7', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kantin-backup-'));
  const db = openDb(':memory:');
  run(db, "INSERT INTO pengaturan (key, value) VALUES ('x', '1')");

  const file = backupSekali(db, dir, hari(20));
  expect(file).toBe(join(dir, 'kantin-2026-09-20.db'));
  const copy = new DatabaseSync(file!);
  expect(copy.prepare("SELECT value FROM pengaturan WHERE key = 'x'").get()).toEqual({ value: '1' });
  copy.close();

  expect(backupSekali(db, dir, hari(20))).toBeNull();

  writeFileSync(join(dir, 'catatan.txt'), 'keep me');
  for (let d = 21; d <= 28; d++) backupSekali(db, dir, hari(d));

  const files = readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
  expect(files).toEqual([22, 23, 24, 25, 26, 27, 28].map((d) => `kantin-2026-09-${d}.db`));
  expect(existsSync(join(dir, 'catatan.txt'))).toBe(true);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx jest server/backup.test.ts`
Expected: FAIL, `Cannot find module './backup'`.

- [ ] **Step 7: Create `server/backup.ts`**

```ts
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tanggalDari } from '../shared/rules';
import type { Db } from './db';

const POLA = /^kantin-\d{4}-\d{2}-\d{2}\.db$/;

export function backupSekali(db: Db, dir: string, now: number, simpan = 7): string | null {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `kantin-${tanggalDari(now)}.db`);
  if (existsSync(file)) return null;

  // VACUUM INTO makes a consistent copy while the database stays in use.
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  const lama = readdirSync(dir).filter((f) => POLA.test(f)).sort();
  for (const f of lama.slice(0, Math.max(0, lama.length - simpan))) unlinkSync(join(dir, f));
  return file;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest server/backup.test.ts`
Expected: PASS.

- [ ] **Step 9: Create `server/pin-setup.ts`**

```ts
import { createInterface } from 'node:readline/promises';
import type { Peran } from '../shared/types';
import { hashPin } from './auth';
import type { Db } from './db';
import { getSetting, setSetting } from './settings';

const VALID = /^\d{6}$/;

export async function mintaPin(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const pin = (await rl.question(`${label} (6 angka): `)).trim();
      if (VALID.test(pin)) return pin;
      console.log('PIN harus 6 angka.');
    }
  } finally {
    rl.close();
  }
}

/** First run: take PINs from env, else ask in the terminal. */
export async function pastikanPin(db: Db): Promise<void> {
  const sumber: Record<Peran, { env: string; label: string }> = {
    dapur: { env: 'KANTIN_PIN_DAPUR', label: 'PIN Dapur baru' },
    admin: { env: 'KANTIN_PIN_ADMIN', label: 'PIN Admin baru' },
  };
  for (const peran of ['dapur', 'admin'] as const) {
    const key = `pin_${peran}_hash`;
    if (getSetting(db, key)) continue;

    const dariEnv = process.env[sumber[peran].env];
    let pin: string;
    if (dariEnv !== undefined) {
      if (!VALID.test(dariEnv)) throw new Error(`${sumber[peran].env} harus 6 angka`);
      pin = dariEnv;
    } else if (process.stdin.isTTY) {
      pin = await mintaPin(sumber[peran].label);
    } else {
      throw new Error(`PIN ${peran} belum diatur. Jalankan server sekali di terminal atau isi ${sumber[peran].env}.`);
    }
    setSetting(db, key, hashPin(pin));
  }
}
```

- [ ] **Step 10: Create `server/main.ts`**

```ts
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app';
import { backupSekali } from './backup';
import { systemClock } from './clock';
import { openDb } from './db';
import type { Emit } from './events';
import { pastikanPin } from './pin-setup';
import { pasangWs } from './ws';

async function main() {
  const dataDir = process.env.KANTIN_DATA ?? join(process.cwd(), 'data');
  const port = Number(process.env.PORT ?? 3000);
  mkdirSync(dataDir, { recursive: true });

  const db = openDb(join(dataDir, 'kantin.db'));
  await pastikanPin(db);

  // The app needs emit before the WebSocket server exists; forward through a variable.
  let kirim: Emit = () => {};
  const app = createApp({
    db,
    clock: systemClock,
    emit: (e) => kirim(e),
    staticDir: process.env.KANTIN_STATIC ?? join(process.cwd(), 'app', 'build', 'client'),
  });
  const server = http.createServer(app);
  kirim = pasangWs(server).emit;

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
```

- [ ] **Step 11: Create `server/reset-pin.ts`**

```ts
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
```

- [ ] **Step 12: Run the full suite, typecheck and build**

Run: `npm test && npm run typecheck && npm run build:server`
Expected: all suites PASS, typecheck prints nothing, `dist/server/main.js` exists.

- [ ] **Step 13: Smoke-test the built server**

Run (Git Bash, from the project root; a relative data path avoids Windows vs. Git Bash `/tmp` mismatches):
```bash
rm -rf smoke-data
KANTIN_DATA=smoke-data KANTIN_PIN_DAPUR=111111 KANTIN_PIN_ADMIN=999999 PORT=3999 node dist/server/main.js &
SERVER=$!
sleep 2
curl -s http://127.0.0.1:3999/api/menu
curl -s -X POST http://127.0.0.1:3999/api/auth/pin -H 'Content-Type: application/json' -d '{"peran":"admin","pin":"999999","device":"cli"}'
ls smoke-data smoke-data/backup
kill $SERVER
rm -rf smoke-data
```
Expected:
- the server prints `Kantin siap di port 3999` and `Backup: ...kantin-<today>.db`
- `/api/menu` returns JSON with `"menu":[]`
- the PIN call returns `{"token":"...","peran":"admin"}`
- `kantin.db` and `backup/kantin-<today>.db` exist

- [ ] **Step 14: Commit**

```bash
git add server/ws.ts server/ws.test.ts server/backup.ts server/backup.test.ts server/pin-setup.ts server/main.ts server/reset-pin.ts
git commit -m "feat(server): add WebSocket push, daily backup and host entrypoint"
```

---

## Spec coverage (Plan 1)

| Spec section | Task |
|---|---|
| 4 Architecture, WAL, integer money, server clock | 1, 7 |
| 5 PINs, hashing, tokens, lockout, pin-alert, reset | 8, 9, 14, 16 |
| 6 Menu, groups, widgets, defaults, empty price = 0, snapshot | 6, 10, 11, 13 |
| 7.3 Pickup time availability | 3, 10 |
| 7.4 Customer cancel ≤ 10 s | 3, 12 |
| 7.6 Idempotent retry, 409 sold out | 11 |
| 7.7 Siap list 5 minutes | 12 |
| 8 Kitchen tabs, undo 30 s, item cancel, Selesai | 3, 12 |
| 9 Status rules and income | 5, 12 |
| 10 Admin edit | 13, 14 |
| 11 Reports, saved snapshot, CSV | 5, 15 |
| 12 Schema, queue numbers, backup | 7, 11, 16 |
| 13 API and WebSocket events | 9–16 |
| 14 UI guide, 7.1–7.2 layout, 7.5 idle timeout, 7.6 offline queue on the phone | Plan 2 |
| 3 Termux setup, 15 manual checklist and load test | Plan 3 |
