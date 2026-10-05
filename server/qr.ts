import { randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import type { RequestHandler } from 'express';
import type { Clock } from './clock';
import type { Db } from './db';
import { getSetting } from './settings';

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function buatKodeQr(): string {
  return Array.from({ length: 22 }, () => ALFABET[randomInt(ALFABET.length)]).join('');
}

export function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tailscale Funnel adds this header to every request that comes from the internet. */
export function lewatFunnel(req: IncomingMessage): boolean {
  return req.headers['tailscale-funnel-request'] !== undefined;
}

/** '::ffff:1.2.3.4' (IPv4 on a dual-stack socket) becomes '1.2.3.4'. */
function polos(ip: string): string {
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** The last X-Forwarded-For entry is the one the proxy added; earlier ones come from the client. */
export function ipPengirim(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const akhir = (Array.isArray(xff) ? xff.join(',') : xff)?.split(',').pop()?.trim();
  return polos(akhir || req.socket.remoteAddress || '');
}

function blok(cidr: string[]): BlockList {
  const b = new BlockList();
  for (const c of cidr) {
    const [alamat, panjang] = c.trim().split('/');
    const versi = isIP(alamat);
    if (versi === 0) continue;
    b.addSubnet(alamat, panjang ? Number(panjang) : versi === 4 ? 32 : 128, versi === 4 ? 'ipv4' : 'ipv6');
  }
  return b;
}

function cocok(b: BlockList, ip: string): boolean {
  const versi = isIP(ip);
  return versi !== 0 && b.check(ip, versi === 4 ? 'ipv4' : 'ipv6');
}

/**
 * School network entries: a range as written, a single IPv4 exactly, a single IPv6 by /64
 * (phones use temporary addresses inside the school prefix).
 */
export function ipDiizinkan(daftar: string[], ip: string): boolean {
  return cocok(blok(daftar.map((x) => (x.includes('/') || isIP(x) !== 6 ? x : `${x}/64`))), ip);
}

const LEBAR_MAKS = { 4: 16, 6: 48 } as const;

/** A single IP, or a range no wider than /16 (IPv4) or /48 (IPv6). */
export function entriValid(x: string): boolean {
  const [alamat, panjang, ...lebih] = x.split('/');
  const versi = isIP(alamat);
  if (versi === 0 || lebih.length > 0) return false;
  if (panjang === undefined) return true;
  if (!/^\d+$/.test(panjang)) return false;
  const n = Number(panjang);
  return n >= LEBAR_MAKS[versi as 4 | 6] && n <= (versi === 4 ? 32 : 128);
}

function keAngka(ip: string): { nilai: bigint; bit: 32 | 128 } | null {
  const versi = isIP(ip);
  if (versi === 4) return { nilai: ip.split('.').reduce((a, o) => (a << 8n) + BigInt(Number(o)), 0n), bit: 32 };
  if (versi !== 6 || ip.includes('.')) return null;
  const [kiri, kanan] = ip.split('::');
  const depan = kiri ? kiri.split(':') : [];
  const belakang = kanan ? kanan.split(':') : [];
  const isi = ip.includes('::') ? [...depan, ...Array<string>(8 - depan.length - belakang.length).fill('0'), ...belakang] : depan;
  return { nilai: isi.reduce((a, h) => (a << 16n) + BigInt(parseInt(h, 16)), 0n), bit: 128 };
}

function dariAngka(n: bigint, bit: 32 | 128): string {
  if (bit === 32) return [24n, 16n, 8n, 0n].map((s) => String((n >> s) & 255n)).join('.');
  return Array.from({ length: 8 }, (_, i) => ((n >> BigInt(112 - 16 * i)) & 0xffffn).toString(16)).join(':');
}

/**
 * Smallest range that holds all the given IPs, e.g. the CGNAT pool a school ISP rotates through.
 * Returns null for mixed IPv4/IPv6, invalid input, or anything wider than /16 or /48.
 */
export function rentangTerkecil(ips: string[]): string | null {
  const angka = ips.map(keAngka);
  if (angka.length === 0 || angka.some((a) => a === null)) return null;
  const [pertama, ...sisa] = angka as { nilai: bigint; bit: 32 | 128 }[];
  if (sisa.some((a) => a.bit !== pertama.bit)) return null;
  const bit = pertama.bit;
  let p = bit;
  for (const a of sisa) while (p > 0 && a.nilai >> BigInt(bit - p) !== pertama.nilai >> BigInt(bit - p)) p--;
  if (p < LEBAR_MAKS[bit === 32 ? 4 : 6]) return null;
  const mask = ((1n << BigInt(p)) - 1n) << BigInt(bit - p);
  return `${dariAngka(pertama.nilai & mask, bit)}/${p}`;
}

/** Recent public IPs refused by the school-network check, so the admin can see what students really use. */
export class CatatanTolak {
  private isi: { ip: string; waktu: number }[] = [];

  constructor(private maks = 20) {}

  catat(ip: string, waktu: number): void {
    this.isi = [{ ip, waktu }, ...this.isi.filter((x) => x.ip !== ip)].slice(0, this.maks);
  }

  daftar(): { ip: string; waktu: number }[] {
    return [...this.isi];
  }
}

/** Loopback, Windows Mobile Hotspot, classic Android hotspot. Override with KANTIN_LOKAL. */
export const LOKAL_BAWAAN = ['127.0.0.0/8', '::1/128', '192.168.137.0/24', '192.168.43.0/24'];

/**
 * A request is public when it came through Funnel, or when QR is on (the server then sits on the
 * school WiFi) and it does not come from the kantin hotspot. Public requests get the QR surface only.
 */
export function buatCekPublik(db: Db, lokal: string[] = LOKAL_BAWAAN): (req: IncomingMessage) => boolean {
  const hotspot = blok(lokal);
  return (req) => lewatFunnel(req) || (qrAktif(bacaQr(db)) && !cocok(hotspot, polos(req.socket.remoteAddress ?? '')));
}

export interface AturQr {
  alamat: string;
  kode: string;
  buka: boolean;
  ip: string[];
}

export function bacaQr(db: Db): AturQr {
  return {
    alamat: getSetting(db, 'qr_alamat') ?? '',
    kode: getSetting(db, 'qr_kode') ?? '',
    buka: getSetting(db, 'qr_buka') === '1',
    ip: JSON.parse(getSetting(db, 'qr_ip') ?? '[]') as string[],
  };
}

export const qrAktif = (q: AturQr) => q.alamat !== '' && q.kode !== '';

const PUBLIK: [string, RegExp][] = [
  ['GET', /^\/pesan(\/[^/]*)?$/],
  ['GET', /^\/assets\//],
  ['GET', /^\/manifest\.webmanifest$/],
  ['GET', /^\/api\/menu$/],
  ['GET', /^\/api\/qr\/[A-Za-z0-9]+\/info$/],
  ['GET', /^\/api\/qr\/[A-Za-z0-9]+\/orders\/\d+$/],
  ['POST', /^\/api\/qr\/[A-Za-z0-9]+\/orders$/],
  ['GET', /^\/api\/suara(\/(masuk|jadi))?$/],
  ['POST', /^\/api\/qr\/[A-Za-z0-9]+\/orders\/\d+\/cancel$/],
];

/** Public requests may only use the QR ordering surface; the staff surface stays on the hotspot. */
export function pagarPublik(publik: (req: IncomingMessage) => boolean): RequestHandler {
  return (req, res, next) => {
    if (!publik(req)) return next();
    const metode = req.method === 'HEAD' ? 'GET' : req.method;
    // Traversal tricks would otherwise let express.static serve any file in the build folder.
    const aman = !/\.\.|%2e|%2f|%5c/i.test(req.path);
    if (aman && PUBLIK.some(([m, pola]) => m === metode && pola.test(req.path))) return next();
    res.status(404).json({ error: 'Tidak ditemukan' });
  };
}

/** Sliding-window limit shared by all QR orders. Per-IP limits would block the whole school NAT. */
export class BatasLaju {
  private waktu: number[] = [];

  constructor(private clock: Clock, private maks = 50, private jendelaMs = 60_000) {}

  boleh(): boolean {
    const now = this.clock.now();
    this.waktu = this.waktu.filter((t) => now - t < this.jendelaMs);
    if (this.waktu.length >= this.maks) return false;
    this.waktu.push(now);
    return true;
  }

  /** Give back the most recent slot, for an order that failed after passing the check. */
  kembalikan(): void {
    this.waktu.pop();
  }
}
