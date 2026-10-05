import { sesi } from './sesi';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

function header(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const token = sesi.token();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers: header(opts.body !== undefined),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data.error as string) ?? 'Gagal', data);
  return data as T;
}

export async function unduh(path: string, namaFile: string): Promise<void> {
  const res = await fetch(`/api${path}`, { headers: header(false) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data.error as string) ?? 'Gagal', data);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
