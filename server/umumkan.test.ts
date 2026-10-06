import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bukaAlamat, hostTunnel, kunciAlamat, terbitkan } from './umumkan';

const jawab = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

test('the tunnel address is encrypted with the QR code and only that code opens it', async () => {
  const k = await kunciAlamat('https://a-b.trycloudflare.com', 'KodeQr123');
  expect(JSON.stringify(k)).not.toContain('trycloudflare');
  expect(await bukaAlamat(k, 'KodeQr123')).toBe('https://a-b.trycloudflare.com');
  await expect(bukaAlamat(k, 'KodeLain')).rejects.toThrow();
});

test('hostTunnel asks cloudflared metrics, and falls back to the last address in the log', async () => {
  const metrik = (async () => jawab(200, { hostname: 'satu-dua.trycloudflare.com' })) as typeof fetch;
  expect(await hostTunnel(metrik, 'http://m/quicktunnel', 'tidak-ada.log')).toBe('https://satu-dua.trycloudflare.com');

  const log = join(mkdtempSync(join(tmpdir(), 'tunnel-')), 't.log');
  writeFileSync(log, 'INF |  https://lama-x.trycloudflare.com  |\nINF |  https://baru-y.trycloudflare.com  |\n');
  const mati = (async () => { throw new TypeError('refused'); }) as typeof fetch;
  expect(await hostTunnel(mati, 'http://m/quicktunnel', log)).toBe('https://baru-y.trycloudflare.com');
  expect(await hostTunnel(mati, 'http://m/quicktunnel', 'tidak-ada.log')).toBeNull();
});

test('terbitkan updates alamat.json on gh-pages, sending the sha of the old file', async () => {
  const panggil: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    panggil.push({ url, init });
    return init?.method === 'PUT' ? jawab(200, {}) : jawab(200, { sha: 'abc' });
  }) as unknown as typeof fetch;
  await terbitkan(fetchFn, 'o/r', 'TOKEN', '{"v":1}');
  expect(panggil[0].url).toBe('https://api.github.com/repos/o/r/contents/alamat.json?ref=gh-pages');
  const put = panggil[1];
  expect(put.init?.method).toBe('PUT');
  expect((put.init?.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
  const body = JSON.parse(String(put.init?.body));
  expect(body).toMatchObject({ branch: 'gh-pages', sha: 'abc' });
  expect(Buffer.from(body.content, 'base64').toString()).toBe('{"v":1}');
});

test('terbitkan creates the file when missing and reports a bad token', async () => {
  const pertama = (async (_u: string, init?: RequestInit) => (init?.method === 'PUT' ? jawab(201, {}) : jawab(404, {}))) as unknown as typeof fetch;
  await expect(terbitkan(pertama, 'o/r', 'T', '{}')).resolves.toBeUndefined();
  const ditolak = (async () => jawab(401, { message: 'Bad credentials' })) as unknown as typeof fetch;
  await expect(terbitkan(ditolak, 'o/r', 'T', '{}')).rejects.toThrow('401');
});
