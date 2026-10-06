/**
 * Static QR for a quick tunnel: the printed QR points at a fixed GitHub Pages page, and this script keeps
 * that page told where the server currently is. Runs on the host phone next to cloudflared (scripts/tunnel.sh).
 * Every 30 s it reads the trycloudflare address and the QR code; when either changed it writes alamat.json
 * to the gh-pages branch. The address is encrypted with the QR code, so the public repo does not reveal it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface AlamatTerkunci {
  v: 1;
  iv: string;
  data: string;
}

async function kunci(kode: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kantin-qr:${kode}`));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function kunciAlamat(alamat: string, kode: string): Promise<AlamatTerkunci> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kunci(kode), new TextEncoder().encode(JSON.stringify({ alamat })));
  return { v: 1, iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64') };
}

/** Same steps as pages/404.html; used by the tests to prove the page can read what this script writes. */
export async function bukaAlamat(k: AlamatTerkunci, kode: string): Promise<string> {
  const isi = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(k.iv, 'base64') }, await kunci(kode), Buffer.from(k.data, 'base64'));
  return JSON.parse(new TextDecoder().decode(isi)).alamat;
}

/** Quick-tunnel address from cloudflared's metrics server, or the last one printed in its log. */
export async function hostTunnel(fetchFn: typeof fetch, metrikUrl: string, logFile: string): Promise<string | null> {
  try {
    const r = await fetchFn(metrikUrl, { signal: AbortSignal.timeout(3000) });
    const host = r.ok ? ((await r.json()) as { hostname?: string }).hostname : undefined;
    if (host) return `https://${host}`;
  } catch {
    // Metrics not up yet or not supported: try the log.
  }
  if (!existsSync(logFile)) return null;
  const semua = readFileSync(logFile, 'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  return semua ? semua[semua.length - 1] : null;
}

export async function terbitkan(fetchFn: typeof fetch, repo: string, token: string, isi: string): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/contents/alamat.json`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kantin-umumkan' };
  const lama = await fetchFn(`${url}?ref=gh-pages`, { headers, signal: AbortSignal.timeout(15000) });
  const sha = lama.ok ? ((await lama.json()) as { sha?: string }).sha : undefined;
  const res = await fetchFn(url, {
    method: 'PUT',
    headers,
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ message: 'alamat server', branch: 'gh-pages', content: Buffer.from(isi).toString('base64'), ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}${res.status === 401 ? ' (token salah atau kedaluwarsa)' : ''}`);
}

function bacaKode(dbFile: string): string {
  if (!existsSync(dbFile)) return '';
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    return (db.prepare("SELECT value FROM pengaturan WHERE key = 'qr_kode'").get() as { value?: string } | undefined)?.value ?? '';
  } finally {
    db.close();
  }
}

async function main() {
  const fileToken = '.github-token';
  const token = (process.env.KANTIN_GITHUB_TOKEN ?? (existsSync(fileToken) ? readFileSync(fileToken, 'utf8') : '')).trim();
  if (!token) {
    console.log('QR statis: belum ada ~/kantin/.github-token, alamat tidak diumumkan');
    return;
  }
  const repo = process.env.KANTIN_REPO ?? 'selfproclaimengineer/canteen-ordering-system';
  const dbFile = join(process.env.KANTIN_DATA ?? 'data', 'kantin.db');
  let terakhir = '';
  for (;;) {
    try {
      const host = await hostTunnel(fetch, 'http://127.0.0.1:20241/quicktunnel', '.tunnel.log');
      const kode = bacaKode(dbFile);
      if (host && kode && `${host}|${kode}` !== terakhir) {
        await terbitkan(fetch, repo, token, JSON.stringify(await kunciAlamat(host, kode)));
        terakhir = `${host}|${kode}`;
        console.log(`QR statis: alamat diumumkan (${host})`);
      }
    } catch (e) {
      console.log(`QR statis: gagal mengumumkan, coba lagi 30 detik: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

if (require.main === module) void main();
