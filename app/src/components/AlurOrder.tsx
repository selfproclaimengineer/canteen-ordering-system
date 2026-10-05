import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { paginate, pisahTopping, urutTopping } from '../../../shared/paginate';
import type { Grup, JamIstirahat, MenuPublik, Pilihan, StatusOrder, WaktuAmbil } from '../../../shared/types';
import { type Draft, draftBaru, draftDariItem, geserStepper, hargaDraft, pilihOption, toggleChecklist, ubahQty } from '../lib/draft';
import { rupiah } from '../lib/format';
import { usePerPage } from '../lib/hooks';
import { bodyOrder, buangHabis, dariDraft, hapusItem, type ItemKeranjang, totalKeranjang } from '../lib/keranjang';
import { kirimOrder } from '../lib/kirim';
import { uuidV4 } from '../lib/uuid';
import { Pager } from './Pager';

export interface DataMenu {
  jam: JamIstirahat;
  qty_max: number;
  waktu_tersedia: WaktuAmbil[];
  menu: MenuPublik[];
}
export interface Info {
  teks: string;
  nada: 'merah' | 'hijau';
}
export interface Diterima {
  id: number;
  nomor: number;
  total: number;
  uuid: string;
  status: StatusOrder;
  /** false when the server already had this order (a retry); its cancel window may be over. */
  baru: boolean;
}
type Langkah = 'menu' | 'detail' | 'selesai';
interface Opsi {
  g: Grup;
  p: Pilihan;
  harga: number;
}

const LABEL_WAKTU: Record<WaktuAmbil, string> = { sekarang: 'Sekarang', ist1: 'Ist 1', ist2: 'Ist 2' };
const SEMUA_WAKTU: WaktuAmbil[] = ['sekarang', 'ist1', 'ist2'];
const PRATINJAU = 'pratinjau';

/** Checklist options of the draft's menu, free first, split by price. */
function toppingDraft(d: Draft): { gratis: Opsi[]; berbayar: Opsi[] } {
  const semua = d.menu.grup
    .filter((g) => g.widget === 'checklist')
    .flatMap((g) => urutTopping(g.pilihan).map((p) => ({ g, p, harga: p.harga })));
  return pisahTopping(semua);
}

/** The item being edited, shown in the summary but not yet in the cart. */
function pratinjau(d: Draft): ItemKeranjang {
  return { ...dariDraft(d), key: PRATINJAU };
}

function hargaTambah(p: Pilihan) {
  if (p.harga < 0) return `−${rupiah(-p.harga)}`;
  return p.harga > 0 ? `+${rupiah(p.harga)}` : '';
}

/** Steps, cart and sending for one ordering screen. Used by the counter phones and the QR page. */
export function useAlurOrder(opts: {
  url: string;
  device: () => string;
  /** Name sent with the order (QR page only). */
  nama?: () => string;
  data: DataMenu | null;
  /** QR page: the student may add a short note for the kitchen. */
  catatan?: boolean;
  /** Counter phones: one portion per order (server enforces it too). */
  satuPorsi?: boolean;
  onDiterima: (d: Diterima) => void;
  onHabis: () => void;
}) {
  const o = useRef(opts);
  o.current = opts;
  const [langkah, setLangkah] = useState<Langkah>('menu');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [keranjang, setKeranjang] = useState<ItemKeranjang[]>([]);
  const [waktu, setWaktu] = useState<WaktuAmbil>('sekarang');
  const [mengirim, setMengirim] = useState(false);
  const [menunggu, setMenunggu] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [halamanMenu, setHalamanMenu] = useState(0);
  // The cart line being edited, so cancelling the edit puts it back unchanged.
  const [cadangan, setCadangan] = useState<ItemKeranjang | null>(null);
  const [catatan, setCatatan] = useState('');

  // Messages disappear on their own so the next customer does not see them.
  useEffect(() => {
    if (!info) return;
    const t = window.setTimeout(() => setInfo(null), 6000);
    return () => clearTimeout(t);
  }, [info]);

  useEffect(() => {
    if (opts.data && !opts.data.waktu_tersedia.includes(waktu)) setWaktu('sekarang');
  }, [opts.data, waktu]);

  const reset = () => {
    setHalamanMenu(0);
    setLangkah('menu');
    setDraft(null);
    setCadangan(null);
    setKeranjang([]);
    setWaktu('sekarang');
    setCatatan('');
    setInfo(null);
  };

  const pilihMenu = (m: MenuPublik) => {
    if (!m.tersedia) return;
    // Going back to the menu never loses the item being set up: it joins the cart first.
    // With one portion per order, picking another menu replaces it instead.
    if (o.current.satuPorsi) setKeranjang([]);
    else if (draft) setKeranjang((k) => [...k, dariDraft(draft)]);
    setCadangan(null);
    setDraft(draftBaru(m));
    setLangkah('detail');
    setInfo(null);
  };

  const tambahMenu = () => {
    if (draft) setKeranjang((k) => [...k, dariDraft(draft)]);
    setCadangan(null);
    setDraft(null);
    setLangkah('menu');
  };

  const batalkan = () => {
    if (cadangan) {
      // Cancelling an edit restores the original line instead of deleting it.
      setKeranjang((k) => [...k, cadangan]);
      setCadangan(null);
      setDraft(null);
      setLangkah('selesai');
      return;
    }
    setDraft(null);
    setLangkah('menu');
  };

  /** Re-open a cart line in the Detail step. */
  const ubahItem = (key: string) => {
    if (key === PRATINJAU) {
      setLangkah('detail');
      return;
    }
    const item = keranjang.find((i) => i.key === key);
    if (!item) return;
    const menu = o.current.data?.menu.find((m) => m.id === item.menu_id);
    if (!menu || !menu.tersedia) {
      setInfo({ teks: `${item.nama} habis`, nada: 'merah' });
      return;
    }
    setKeranjang((k) => [...k.filter((i) => i.key !== key), ...(draft ? [dariDraft(draft)] : [])]);
    setCadangan(item);
    setDraft(draftDariItem(item, menu));
    setLangkah('detail');
  };

  const bisaKe = (l: Langkah) => l === 'menu' || (l === 'detail' ? draft !== null : draft !== null || keranjang.length > 0);
  const keLangkah = (l: Langkah) => {
    if (bisaKe(l)) setLangkah(l);
  };

  const pesan = async () => {
    const items = draft ? [...keranjang, dariDraft(draft)] : keranjang;
    if (items.length === 0 || mengirim) return;
    setKeranjang(items);
    setDraft(null);
    setCadangan(null);
    setMengirim(true);
    setInfo(null);
    const uuid = uuidV4();
    const hasil = await kirimOrder(
      {
        ...bodyOrder(items, waktu, o.current.device(), uuid),
        ...(o.current.nama ? { nama: o.current.nama() } : {}),
        ...(o.current.catatan && catatan.trim() ? { catatan: catatan.trim() } : {}),
      },
      // A half-dead network can hang fetch; abort and retry (same client_uuid, so no duplicate).
      (b) => fetch(o.current.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(5000) }),
      (ms) => new Promise((r) => window.setTimeout(r, ms)),
      () => setMenunggu(true),
    );
    setMengirim(false);
    setMenunggu(false);
    if (hasil.ok) {
      reset();
      o.current.onDiterima({ id: hasil.id, nomor: hasil.nomor, total: hasil.total, uuid, status: hasil.status, baru: hasil.baru });
      return;
    }
    if ('habis' in hasil) {
      const sisa = buangHabis(items, hasil.habis.map((h) => h.menu_id));
      setKeranjang(sisa);
      setLangkah(sisa.length > 0 ? 'selesai' : 'menu');
      setInfo({ teks: `${hasil.habis.map((h) => h.nama).join(', ')} habis`, nada: 'merah' });
      o.current.onHabis();
      return;
    }
    setLangkah('selesai');
    setInfo({ teks: hasil.error, nada: 'merah' });
  };

  return {
    langkah, setLangkah, draft, setDraft, keranjang, setKeranjang, waktu, setWaktu,
    mengirim, menunggu, info, setInfo, reset, pilihMenu, tambahMenu, batalkan, pesan, halamanMenu, setHalamanMenu,
    ubahItem, bisaKe, keLangkah,
    satuPorsi: opts.satuPorsi ?? false,
    pakaiCatatan: opts.catatan ?? false,
    catatan,
    setCatatan,
    aktif: draft !== null || keranjang.length > 0,
  };
}

export type Alur = ReturnType<typeof useAlurOrder>;

export function AlurOrder({ alur, data }: { alur: Alur; data: DataMenu }) {
  const semuaItem = alur.draft ? [...alur.keranjang, pratinjau(alur.draft)] : alur.keranjang;
  return (
    <>
      <div className="langkah">
        {(['menu', 'detail', 'selesai'] as const).map((l, i) => (
          <button key={l} className={l === alur.langkah ? 'aktif' : ''} disabled={alur.mengirim || !alur.bisaKe(l)} onClick={() => alur.keLangkah(l)}>
            {i + 1}. {['Menu', 'Detail', 'Pesan'][i]}
          </button>
        ))}
      </div>
      {alur.info && <div className={`info ${alur.info.nada}`}>{alur.info.teks}</div>}
      {alur.menunggu && <div className="info">Menunggu koneksi…</div>}
      <div className="isi">
        {alur.langkah === 'menu' && (
          <LangkahMenu
            menu={data.menu}
            page={alur.halamanMenu}
            onPage={alur.setHalamanMenu}
            onPilih={alur.pilihMenu}
            keranjang={semuaItem}
            onCheckout={() => alur.setLangkah('selesai')}
          />
        )}
        {alur.langkah === 'detail' && alur.draft && (
          <LangkahDetail draft={alur.draft} qtyMax={alur.satuPorsi ? 1 : data.qty_max} onUbah={alur.setDraft} onBatal={alur.batalkan} onLanjut={() => alur.setLangkah('selesai')} />
        )}
        {alur.langkah === 'selesai' && (
          <LangkahSelesai
            items={semuaItem}
            onHapus={(key) => (key === PRATINJAU ? alur.batalkan() : alur.setKeranjang((k) => hapusItem(k, key)))}
            onPilihItem={alur.ubahItem}
            onKosongkan={alur.reset}
            waktu={alur.waktu}
            tersedia={data.waktu_tersedia}
            onWaktu={alur.setWaktu}
            mengirim={alur.mengirim}
            onBatal={alur.batalkan}
            onTambah={alur.satuPorsi ? undefined : alur.tambahMenu}
            catatan={alur.pakaiCatatan ? alur.catatan : undefined}
            onCatatan={alur.setCatatan}
            onPesan={() => void alur.pesan()}
          />
        )}
      </div>
    </>
  );
}

function LangkahMenu(props: {
  menu: MenuPublik[];
  page: number;
  onPage: (p: number) => void;
  onPilih: (m: MenuPublik) => void;
  keranjang: ItemKeranjang[];
  onCheckout: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const per = usePerPage(ref, 100, 3, 10);
  const p = paginate(props.menu, per, props.page);
  return (
    <>
      <div className="grid-menu" ref={ref}>
        {p.items.map((m) => (
          <button key={m.id} className={`kartu-menu${m.tersedia ? '' : ' habis'}`} disabled={!m.tersedia} onClick={() => props.onPilih(m)}>
            <span className="nama">{m.nama}</span>
            <span className="harga">{m.tersedia ? rupiah(m.harga) : 'Habis'}</span>
            {m.baru && m.tersedia && <span className="label-baru">Baru</span>}
          </button>
        ))}
      </div>
      <Pager page={p.page} pageCount={p.pageCount} onPage={props.onPage} />
      {props.keranjang.length > 0 && (
        <div className="aksi">
          <button className="utama" onClick={props.onCheckout}>
            Keranjang ({props.keranjang.length}) · {rupiah(totalKeranjang(props.keranjang))} ▶
          </button>
        </div>
      )}
    </>
  );
}

function Stepper(props: { label: string; nilai: string; onKurang: () => void; onTambah: () => void }) {
  return (
    <div className="baris">
      <span className="label">{props.label}</span>
      <div className="stepper">
        <button onClick={props.onKurang}>−</button>
        <span className="nilai">{props.nilai}</span>
        <button onClick={props.onTambah}>+</button>
      </div>
    </div>
  );
}

/** Every Detail row has the same height, so the step can be paged when a menu has many options. */
const TINGGI_BARIS = 56;

function LangkahDetail(props: { draft: Draft; qtyMax: number; onUbah: (d: Draft) => void; onBatal: () => void; onLanjut: () => void }) {
  const d = props.draft;
  const { gratis, berbayar } = toppingDraft(d);
  const centang = [...gratis, ...berbayar];
  const kotak = ({ g, p: o }: Opsi) => {
    const pilih = d.pilih[g.id]?.includes(o.id) ?? false;
    return (
      <button key={o.id} className={`centang${pilih ? ' pilih' : ''}`} onClick={() => props.onUbah(toggleChecklist(d, g.id, o.id))}>
        <span>{pilih ? '☑' : '☐'} {o.label}</span>
        <span>{hargaTambah(o)}</span>
      </button>
    );
  };

  const baris: { key: string; isi: ReactNode }[] = [
    // A quantity stepper that can only show 1 is noise.
    ...(props.qtyMax > 1
      ? [{
          key: 'qty',
          isi: <Stepper label="Jumlah" nilai={String(d.qty)} onKurang={() => props.onUbah(ubahQty(d, -1, props.qtyMax))} onTambah={() => props.onUbah(ubahQty(d, 1, props.qtyMax))} />,
        }]
      : []),
    ...d.menu.grup
      .filter((g) => g.widget === 'stepper' && g.pilihan.length > 0)
      .map((g) => {
        const pilih = g.pilihan.find((p) => p.id === d.pilih[g.id]?.[0]) ?? g.pilihan[0];
        return {
          key: `s${g.id}`,
          isi: (
            <Stepper
              label={g.nama}
              nilai={`${pilih.label}${pilih.harga !== 0 ? ` ${hargaTambah(pilih)}` : ''}`}
              onKurang={() => props.onUbah(geserStepper(d, g, -1))}
              onTambah={() => props.onUbah(geserStepper(d, g, 1))}
            />
          ),
        };
      }),
    ...d.menu.grup
      .filter((g) => g.widget === 'option' && g.pilihan.length > 0)
      .map((g) => ({
        key: `o${g.id}`,
        isi: (
          <div className="baris">
            <span className="label">{g.nama}</span>
            <div className="opsi">
              {g.pilihan.map((p) => (
                <button key={p.id} className={d.pilih[g.id]?.includes(p.id) ? 'pilih' : ''} onClick={() => props.onUbah(pilihOption(d, g.id, p.id))}>
                  {p.label} {hargaTambah(p)}
                </button>
              ))}
            </div>
          </div>
        ),
      })),
    // Checklist options two per row: free ones first, then paid ones.
    ...Array.from({ length: Math.ceil(centang.length / 2) }, (_, i) => ({
      key: `c${i}`,
      isi: <div className="pasang-centang">{centang.slice(i * 2, i * 2 + 2).map(kotak)}</div>,
    })),
  ];

  const ref = useRef<HTMLDivElement>(null);
  const per = usePerPage(ref, TINGGI_BARIS, 1, 8);
  const [page, setPage] = useState(0);
  const p = paginate(baris, per, page);
  return (
    <>
      <div className="judul-item">
        <span>{d.menu.nama}</span>
        <span className="harga">{rupiah(hargaDraft(d))}</span>
      </div>
      <div className="detail-baris" ref={ref}>
        {p.items.map((b) => (
          <Fragment key={b.key}>{b.isi}</Fragment>
        ))}
      </div>
      <Pager page={p.page} pageCount={p.pageCount} onPage={setPage} />
      <div className="aksi">
        <button className="merah silang" aria-label="Batalkan" onClick={props.onBatal}>✕</button>
        <button className="utama besar" onClick={props.onLanjut}>Lanjut ▶</button>
      </div>
    </>
  );
}

function LangkahSelesai(props: {
  items: ItemKeranjang[];
  onHapus: (key: string) => void;
  onPilihItem: (key: string) => void;
  onKosongkan: () => void;
  waktu: WaktuAmbil;
  tersedia: WaktuAmbil[];
  onWaktu: (w: WaktuAmbil) => void;
  mengirim: boolean;
  onBatal: () => void;
  onTambah?: () => void;
  /** Shown only when defined (QR page). */
  catatan?: string;
  onCatatan: (s: string) => void;
  onPesan: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const per = usePerPage(ref, 48, 1, 6);
  const [page, setPage] = useState(0);
  const [yakin, setYakin] = useState(false);
  const p = paginate(props.items, per, page);

  const kosongkan = () => {
    if (yakin) {
      props.onKosongkan();
      return;
    }
    setYakin(true);
    window.setTimeout(() => setYakin(false), 3000);
  };

  return (
    <>
      <div className="baris">
        <span className="label">Ambil</span>
        <div className="opsi">
          {SEMUA_WAKTU.map((w) => (
            <button key={w} disabled={!props.tersedia.includes(w)} className={props.waktu === w ? 'pilih' : ''} onClick={() => props.onWaktu(w)}>
              {LABEL_WAKTU[w]}
            </button>
          ))}
        </div>
      </div>
      {props.catatan !== undefined && (
        <input
          className="input-catatan"
          value={props.catatan}
          maxLength={60}
          placeholder="Catatan untuk dapur (boleh kosong)"
          disabled={props.mengirim}
          onChange={(e) => props.onCatatan(e.target.value)}
        />
      )}
      <div className="ringkas" ref={ref}>
        {p.items.map((i) => (
          <div className="ringkas-item" key={i.key}>
            <button className="teks" disabled={props.mengirim} onClick={() => props.onPilihItem(i.key)}>
              ✎ {i.qty}× {i.nama}
              {i.pilihan.length > 0 && <small> · {i.pilihan.map((o) => o.label).join(', ')}</small>}
            </button>
            <b>{rupiah(totalKeranjang([i]))}</b>
            <button className="kecil" disabled={props.mengirim} onClick={() => props.onHapus(i.key)}>✕</button>
          </div>
        ))}
      </div>
      <Pager page={p.page} pageCount={p.pageCount} onPage={setPage} />
      <div className="total">
        <span>Total</span>
        <span>{rupiah(totalKeranjang(props.items))}</span>
      </div>
      <div className="aksi">
        <button className="merah silang" aria-label="Batalkan" disabled={props.mengirim} onClick={props.onBatal}>✕</button>
        {props.onTambah && <button className="kecil" disabled={props.mengirim} onClick={props.onTambah}>+ Menu</button>}
        <button className="kecil" disabled={props.mengirim} onClick={kosongkan}>{yakin ? 'Yakin?' : 'Kosongkan'}</button>
        <button className="hijau besar" disabled={props.mengirim || props.items.length === 0} onClick={props.onPesan}>
          {props.mengirim ? 'Mengirim…' : 'Pesan'}
        </button>
      </div>
    </>
  );
}
