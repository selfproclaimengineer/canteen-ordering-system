export type WaktuAmbil = 'sekarang' | 'ist1' | 'ist2';
export type StatusOrder = 'baru' | 'siap' | 'batal';
export type Widget = 'stepper' | 'option' | 'checklist';
export type Tab = 'sekarang' | 'ist1' | 'ist2' | 'selesai';
export type Peran = 'dapur' | 'admin';
export type Sumber = 'kasir' | 'qr';

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
  /** Ticked by the kitchen; the order turns siap when every active item is ticked. Kitchen-only. */
  siap_at: number | null;
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
  sumber: Sumber;
  /** Name typed by the student on the QR page; null for counter orders. */
  nama: string | null;
  /** Optional note from the QR page; null for counter orders. */
  catatan: string | null;
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
  /** Count of siap orders per source. Missing in snapshots saved before the QR feature. */
  sumber?: { kasir: number; qr: number };
}
