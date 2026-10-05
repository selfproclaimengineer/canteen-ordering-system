import { useCallback, useEffect, useRef, useState } from 'react';
import { redirect, useNavigate } from 'react-router';
import { paginate } from '../../../shared/paginate';
import { BATAS_UNDO_SIAP_MS } from '../../../shared/rules';
import type { Order, Tab, WaktuAmbil } from '../../../shared/types';
import { Keypad } from '../components/Keypad';
import { Koneksi } from '../components/Koneksi';
import { Pager } from '../components/Pager';
import { ApiError, api } from '../lib/api';
import { BAWAAN } from '../components/AturSuara';
import { beep, bunyikan, muatSuara, siapkanAudio } from '../lib/beep';
import { rupiah } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useLive } from '../lib/live';
import { masuk } from '../lib/masuk';
import { sesi } from '../lib/sesi';

type Kartu = Order & { tab: Tab; total: number };
interface DataDapur {
  orders: Kartu[];
  jumlah: { sekarang: number; ist1: number; ist2: number };
}

const TAB: { id: Tab; label: string }[] = [
  { id: 'sekarang', label: 'Sekarang' },
  { id: 'ist1', label: 'Istirahat 1' },
  { id: 'ist2', label: 'Istirahat 2' },
  { id: 'selesai', label: 'Selesai' },
];
const LABEL_WAKTU: Record<WaktuAmbil, string> = { sekarang: 'Sekarang', ist1: 'Ist 1', ist2: 'Ist 2' };

export function clientLoader() {
  if (!sesi.token()) {
    sesi.setMode('order');
    return redirect('/order');
  }
  sesi.setMode('dapur');
  return null;
}

function umur(ms: number): string {
  const menit = Math.max(0, Math.floor(ms / 60_000));
  return menit === 0 ? 'baru' : `${menit} mnt`;
}

export default function Dapur() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('sekarang');
  const [data, setData] = useState<DataDapur | null>(null);
  const [peringatan, setPeringatan] = useState('');
  const [pesan, setPesan] = useState('');
  const [yakin, setYakin] = useState<string | null>(null);
  const [tujuanPin, setTujuanPin] = useState<'edit' | 'laporan' | null>(null);
  const [pinPesan, setPinPesan] = useState('');
  const [page, setPage] = useState(0);
  const [qr, setQr] = useState<{ aktif: boolean; buka: boolean } | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const jumlahLalu = useRef<number | null>(null);
  const terlihat = useRef<Set<number> | null>(null);
  const [sorot, setSorot] = useState<Set<number>>(new Set());
  const now = useNow(1000);

  const keOrder = useCallback((catatan?: string) => {
    if (catatan) window.sessionStorage.setItem('catatan-sesi', catatan);
    sesi.hapusToken();
    sesi.setMode('order');
    navigate('/order');
  }, [navigate]);

  const muat = useCallback(async () => {
    const tabIni = tabRef.current;
    // The QR switch is optional; its failure must not blank the order list.
    api<{ aktif: boolean; buka: boolean }>('/dapur/qr').then(setQr).catch(() => setQr(null));
    try {
      const d = await api<DataDapur>(`/orders?tab=${tabIni}`);
      // Ignore a slow answer for a tab the cook already left.
      if (tabRef.current === tabIni) setData(d);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) keOrder('Sesi dapur berakhir. Masuk lagi dengan PIN.');
    }
  }, [keOrder]);

  const online = useLive((e) => {
    if (e.type === 'pin-alert') {
      setPeringatan(`PIN salah 5× di ${e.device}`);
      beep(440, 300, 3);
      window.setTimeout(() => setPeringatan(''), 15_000);
      return;
    }
    if (e.type === 'menu-changed') void muatSuara();
    void muat();
  });

  useEffect(() => {
    setPage(0);
    void muat();
  }, [tab, muat]);

  useEffect(() => {
    const t = window.setInterval(() => void muat(), 20_000);
    return () => clearInterval(t);
  }, [muat]);

  useEffect(() => {
    siapkanAudio();
    void muatSuara();
  }, []);

  // Highlight orders this phone has not seen yet, for 8 s.
  useEffect(() => {
    if (!data) return;
    const ids = data.orders.filter((o) => o.status === 'baru').map((o) => o.id);
    const lama = terlihat.current;
    terlihat.current = new Set([...(lama ?? []), ...ids]);
    if (!lama) return;
    const baru = ids.filter((id) => !lama.has(id));
    if (baru.length === 0) return;
    setSorot((s) => new Set([...s, ...baru]));
    window.setTimeout(() => setSorot((s) => new Set([...s].filter((id) => !baru.includes(id)))), 8000);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const n = data.jumlah.sekarang + data.jumlah.ist1 + data.jumlah.ist2;
    if (jumlahLalu.current !== null && n > jumlahLalu.current) void bunyikan('masuk', BAWAAN.masuk);
    jumlahLalu.current = n;
  }, [data]);

  const aksi = async (path: string, body?: unknown) => {
    try {
      await api(path, { method: 'POST', body });
      setYakin(null);
      await muat();
    } catch (e) {
      setPesan(e instanceof Error ? e.message : 'Gagal');
      window.setTimeout(() => setPesan(''), 4000);
    }
  };

  const denganYakin = (key: string, path: string) => {
    if (yakin === key) {
      void aksi(path);
      return;
    }
    setYakin(key);
    window.setTimeout(() => setYakin((y) => (y === key ? null : y)), 3000);
  };

  const masukAdmin = async (pin: string) => {
    const tujuan = tujuanPin;
    const err = await masuk('admin', pin);
    if (err) {
      setPinPesan(err);
      return;
    }
    setTujuanPin(null);
    if (tujuan) {
      sesi.setMode(tujuan);
      navigate(`/${tujuan}`);
    }
  };

  const daftar = data?.orders ?? [];
  const halaman = tab === 'selesai' ? paginate(daftar, 8, page) : { items: daftar, page: 0, pageCount: 1 };

  return (
    <div className="halaman">
      <Koneksi online={online} />
      <div className="kepala">
        {TAB.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? ' aktif' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id !== 'selesai' && data ? ` (${data.jumlah[t.id]})` : ''}
          </button>
        ))}
        <div className="isi-kanan">
          {qr?.aktif && (
            <button className={`kecil ${qr.buka ? 'hijau' : ''}`} onClick={() => void api('/dapur/qr', { method: 'PUT', body: { buka: !qr.buka } }).then(muat, muat)}>
              QR: {qr.buka ? 'Buka' : 'Tutup'}
            </button>
          )}
          <button className="kecil" onClick={() => keOrder()}>Order</button>
          <button className="kecil" onClick={() => setTujuanPin('edit')}>Edit</button>
          <button className="kecil" onClick={() => setTujuanPin('laporan')}>Laporan</button>
        </div>
      </div>
      <div className="badan">
        {peringatan && <div className="peringatan">{peringatan}</div>}
        {pesan && <div className="info merah">{pesan}</div>}
        {data && halaman.items.length === 0 && <div className="kosong-teks">Kosong</div>}
        {halaman.items.map((o) => (
          <div key={o.id} className={`kartu-order ${o.status}${sorot.has(o.id) ? ' sorot' : ''}`}>
            <div className="atas">
              <span className="nomor">{o.nomor}</span>
              {o.sumber === 'qr' && <span className="tag">QR</span>}
              {o.nama && <b className="nama-qr">{o.nama}</b>}
              <span className="meta">{LABEL_WAKTU[o.waktu_ambil]} · {umur(now - o.dibuat_at)}</span>
              {o.status !== 'baru' && <span className={`status ${o.status}`}>{o.status === 'siap' ? 'Siap' : 'Batal'}</span>}
            </div>
            {o.catatan && <div className="catatan-qr">Catatan: {o.catatan}</div>}
            <ul>
              {o.items.map((i) => (
                <li key={i.id} className={i.batal_at ? 'coret' : i.siap_at ? 'dicentang' : ''}>
                  {/* Orders with several items are ticked one by one; the last tick makes the order siap. */}
                  {o.status === 'baru' && !i.batal_at && o.items.filter((x) => !x.batal_at).length > 1 && (
                    <button className={`kotak-item${i.siap_at ? ' pilih' : ''}`} aria-label="Tandai item siap" onClick={() => void aksi(`/items/${i.id}/centang`, { siap: !i.siap_at })}>
                      {i.siap_at ? '✓' : ''}
                    </button>
                  )}
                  <span className="teks">
                    <b>{i.qty}×</b> {i.nama}
                    {i.pilihan.length > 0 && <small> · {i.pilihan.map((p) => `${p.grup} ${p.label}`).join(' · ')}</small>}
                  </span>
                  {o.status !== 'batal' && !i.batal_at && (
                    <button className="kecil" onClick={() => denganYakin(`i${i.id}`, `/items/${i.id}/batal`)}>
                      {yakin === `i${i.id}` ? 'Yakin?' : '✕'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="bawah">
              <span className="jumlah">{rupiah(o.total)}</span>
              {o.status === 'siap' && o.siap_at !== null && now - o.siap_at <= BATAS_UNDO_SIAP_MS && (
                <button onClick={() => void aksi(`/orders/${o.id}/undo-siap`)}>Urungkan</button>
              )}
              {o.status !== 'batal' && (
                <button className="merah" onClick={() => denganYakin(`o${o.id}`, `/orders/${o.id}/batal`)}>
                  {yakin === `o${o.id}` ? 'Yakin?' : 'Batal'}
                </button>
              )}
              {o.status === 'baru' && (
                <button className="hijau" onClick={() => void aksi(`/orders/${o.id}/siap`)}>Siap</button>
              )}
            </div>
          </div>
        ))}
        {tab === 'selesai' && <Pager page={halaman.page} pageCount={halaman.pageCount} onPage={setPage} />}
      </div>
      {tujuanPin && (
        <Keypad
          judul="PIN Admin"
          pesan={pinPesan}
          onSelesai={(pin) => void masukAdmin(pin)}
          onBatal={() => {
            setTujuanPin(null);
            setPinPesan('');
          }}
        />
      )}
    </div>
  );
}
