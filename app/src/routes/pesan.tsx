import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import type { StatusOrder } from '../../../shared/types';
import { AlurOrder, type DataMenu, useAlurOrder } from '../components/AlurOrder';
import { ApiError, api } from '../lib/api';
import { rupiah } from '../lib/format';
import { useNow } from '../lib/hooks';
import { uuidV4 } from '../lib/uuid';
import { BAWAAN } from '../components/AturSuara';
import { bunyikan, muatSuara, siapkanAudio } from '../lib/beep';

interface Lacak {
  id: number;
  uuid: string;
  nomor: number;
  total: number;
  dibuat: number;
  nama: string;
}

const NAMA_VALID = /^[\p{L}\p{N} .\-]{1,10}$/u;

const KUNCI_LACAK = 'qr-lacak';

/** Random per-phone id, used by the server for "one active order per phone". */
function deviceQr(): string {
  let d = window.localStorage.getItem('qr-device');
  if (!d) {
    d = `QR-${uuidV4().slice(0, 8)}`;
    window.localStorage.setItem('qr-device', d);
  }
  return d;
}

function bacaLacak(): Lacak | null {
  try {
    return JSON.parse(window.localStorage.getItem(KUNCI_LACAK) ?? 'null') as Lacak | null;
  } catch {
    return null;
  }
}

const LABEL_STATUS: Record<StatusOrder, string> = { baru: 'Menunggu', siap: 'SIAP, ambil!', batal: 'Batal' };

export default function Pesan() {
  const { kode = '' } = useParams();
  const [data, setData] = useState<DataMenu | null>(null);
  const [infoQr, setInfoQr] = useState<{ buka: boolean; jaringan_ok: boolean; ip: string } | null>(null);
  const [galat, setGalat] = useState('');
  const [lacak, setLacak] = useState<Lacak | null>(() => bacaLacak());
  const [status, setStatus] = useState<StatusOrder | null>(null);
  const [lacakHilang, setLacakHilang] = useState(false);
  const [putus, setPutus] = useState(false);
  const [nama, setNama] = useState(() => window.localStorage.getItem('qr-nama') ?? '');
  const [isianNama, setIsianNama] = useState(nama);
  const sudahGetar = useRef(false);
  const now = useNow(1000);

  const simpanLacak = useCallback((l: Lacak | null) => {
    if (l) window.localStorage.setItem(KUNCI_LACAK, JSON.stringify(l));
    else window.localStorage.removeItem(KUNCI_LACAK);
    setLacak(l);
    setStatus(null);
    setLacakHilang(false);
    sudahGetar.current = false;
  }, []);

  const muat = useCallback(async () => {
    try {
      const [menu, info] = await Promise.all([
        api<DataMenu>('/menu'),
        api<{ buka: boolean; jaringan_ok: boolean; ip: string }>(`/qr/${kode}/info`),
      ]);
      setData(menu);
      setInfoQr(info);
      setGalat('');
      setPutus(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGalat('QR tidak berlaku');
      else setPutus(true);
    }
  }, [kode]);

  useEffect(() => {
    void muat();
    const t = window.setInterval(() => void muat(), 30_000);
    return () => clearInterval(t);
  }, [muat]);

  useEffect(() => {
    siapkanAudio();
    void muatSuara();
  }, []);

  // Poll the student's own order until it is final; vibrate once when the kitchen marks it ready.
  useEffect(() => {
    if (!lacak) return;
    let hidup = true;
    let t = 0;
    const cek = async () => {
      try {
        const s = await api<{ status: StatusOrder }>(`/qr/${kode}/orders/${lacak.id}?uuid=${lacak.uuid}`);
        if (!hidup) return;
        setStatus(s.status);
        if (s.status === 'siap' && !sudahGetar.current) {
          sudahGetar.current = true;
          navigator.vibrate?.([300, 150, 300, 150, 300]);
          void bunyikan('jadi', BAWAAN.jadi);
        }
        if (s.status !== 'baru') clearInterval(t);
      } catch (e) {
        // 404: the QR code was replaced or QR was switched off. Keep the number on screen.
        if (hidup && e instanceof ApiError && e.status === 404) {
          setLacakHilang(true);
          clearInterval(t);
        }
      }
    };
    void cek();
    t = window.setInterval(() => void cek(), 5000);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, [lacak, kode]);

  const alur = useAlurOrder({
    url: `/api/qr/${kode}/orders`,
    device: deviceQr,
    nama: () => nama,
    data,
    catatan: true,
    // A retried order (baru = false) may be past its 10 s cancel window, so offer no cancel.
    onDiterima: (d) => simpanLacak({ id: d.id, uuid: d.uuid, nomor: d.nomor, total: d.total, dibuat: d.baru ? Date.now() : 0, nama }),
    onHabis: () => void muat(),
  });

  const batal = async () => {
    if (!lacak) return;
    try {
      await api(`/qr/${kode}/orders/${lacak.id}/cancel`, { method: 'POST', body: { client_uuid: lacak.uuid } });
      setStatus('batal');
    } catch (e) {
      alur.setInfo({ teks: e instanceof Error ? e.message : 'Gagal', nada: 'merah' });
    }
  };

  if (lacak) {
    const s = status ?? 'baru';
    const sisa = Math.max(0, 10 - Math.floor((now - lacak.dibuat) / 1000));
    return (
      <div className={`layar konfirmasi status-${s}`}>
        <div className="konfirmasi-label">Nomor</div>
        <div className="konfirmasi-nomor">{lacak.nomor}</div>
        {lacak.nama && <div className="nama-besar">{lacak.nama}</div>}
        <div className="status-teks">{lacakHilang ? 'Tunjukkan nomor ini di kantin' : LABEL_STATUS[s]}</div>
        <div className="konfirmasi-total">{rupiah(lacak.total)} · bayar saat ambil</div>
        {alur.info && <div className={`info ${alur.info.nada}`}>{alur.info.teks}</div>}
        <div className="aksi">
          {!lacakHilang && s === 'baru' && sisa > 0 && <button className="merah" onClick={() => void batal()}>Batalkan ({sisa})</button>}
          {(s !== 'baru' || lacakHilang) && <button className="utama" onClick={() => simpanLacak(null)}>Pesan lagi</button>}
        </div>
      </div>
    );
  }

  if (galat) return <div className="layar"><div className="memuat">{galat}</div></div>;
  if (!data || !infoQr) return <div className="layar"><div className="memuat">{putus ? 'Tidak terhubung, mencoba lagi…' : 'Memuat…'}</div></div>;
  if (!infoQr.buka) return <div className="layar"><div className="memuat">Pemesanan QR sedang tutup</div></div>;
  if (!infoQr.jaringan_ok) {
    return (
      <div className="layar">
        <div className="memuat">
          Sambungkan HP ke WiFi sekolah
          <small className="ip-kecil">IP: {infoQr.ip}</small>
        </div>
      </div>
    );
  }

  if (!nama) {
    const isi = isianNama.trim();
    return (
      <form
        className="layar isi-nama"
        onSubmit={(e) => {
          e.preventDefault();
          if (!NAMA_VALID.test(isi)) return;
          window.localStorage.setItem('qr-nama', isi);
          setNama(isi);
        }}
      >
        <div className="konfirmasi-label">Nama kamu</div>
        <input value={isianNama} onChange={(e) => setIsianNama(e.target.value)} maxLength={10} autoFocus placeholder="maks 10 huruf" />
        <small>Dipanggil saat pesanan siap.</small>
        <div className="aksi">
          <button className="hijau besar" type="submit" disabled={!NAMA_VALID.test(isi)}>Lanjut</button>
        </div>
      </form>
    );
  }

  return (
    <div className="layar">
      <button className="kecil nama-ubah" onClick={() => setNama('')}>✎ {nama}</button>
      <AlurOrder alur={alur} data={data} />
    </div>
  );
}
