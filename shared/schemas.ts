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
  /** Only used for QR orders; validated with namaQrSchema there. */
  nama: z.string().max(50).optional(),
  /** Only kept for QR orders. */
  catatan: z.string().trim().max(60, 'Catatan maks 60 huruf').optional(),
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

export const centangSchema = z.object({ siap: z.boolean() });

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
  // Options may be a discount (negative), e.g. "½ porsi -2000".
  harga: z.number().int().min(-10_000_000).max(10_000_000).nullish().transform((v) => v ?? 0),
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

export const qrAturSchema = z.object({
  alamat: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]),
  buka: z.boolean(),
});
export const qrBukaSchema = z.object({ buka: z.boolean() });
export const qrIpSchema = z.object({ ip: z.array(z.string().trim().max(50)).max(20) });
export const qrRentangSchema = z.object({ ip: z.array(z.string().trim().max(45)).min(1).max(50) });
export const namaQrSchema = z.string().trim().regex(/^[\p{L}\p{N} .\-]{1,10}$/u, 'Isi nama (maks 10 huruf)');
