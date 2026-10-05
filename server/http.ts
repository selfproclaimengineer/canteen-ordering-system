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
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'File terlalu besar' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON tidak valid' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Kesalahan server' });
};
