import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlurOrder, type DataMenu, useAlurOrder } from '../components/AlurOrder';
import { Keypad } from '../components/Keypad';
import { Koneksi } from '../components/Koneksi';
import { api } from '../lib/api';
import { rupiah } from '../lib/format';
import { useIdle } from '../lib/hooks';
import { useLive } from '../lib/live';
import { masuk } from '../lib/masuk';
import { sesi } from '../lib/sesi';

interface Konfirmasi {
  id: number;
  nomor: number;
  total: number;
  uuid: string;
  sisa: number;
  bisaBatal: boolean;
}

export function clientLoader() {
  sesi.setMode('order');
  sesi.hapusToken();
  return null;
}

export default function Order() {
  const navigate = useNavigate();
  const [data, setData] = useState<DataMenu | null>(null);
  const [siap, setSiap] = useState<number[]>([]);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi | null>(null);
  const [pinBuka, setPinBuka] = useState(false);
  const [pinPesan, setPinPesan] = useState('');
  const tahan = useRef(0);

  const muat = useCallback(async () => {
    try {
      const [menu, s] = await Promise.all([api<DataMenu>('/menu'), api<{ nomor: number[] }>('/siap')]);
      setData(menu);
      setSiap(s.nomor);
    } catch {
      // Offline: keep the last menu so the customer can keep choosing.
    }
  }, []);

  const alur = useAlurOrder({
    url: '/api/orders',
    device: sesi.device,
    data,
    satuPorsi: true,
    onDiterima: (d) => {
      if (d.status === 'batal') {
        alur.setInfo({ teks: `Nomor ${d.nomor} sudah dibatalkan dapur`, nada: 'merah' });
        return;
      }
      setKonfirmasi({ id: d.id, nomor: d.nomor, total: d.total, uuid: d.uuid, sisa: 10, bisaBatal: d.baru });
    },
    onHabis: () => void muat(),
  });

  const online = useLive((e) => {
    if (e.type !== 'orders-changed' && e.type !== 'pin-alert') void muat();
  });

  useEffect(() => {
    void muat();
    const t = window.setInterval(() => void muat(), 30_000);
    return () => clearInterval(t);
  }, [muat]);

  useEffect(() => {
    const layarPenuh = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('pointerdown', layarPenuh, { once: true });
    return () => window.removeEventListener('pointerdown', layarPenuh);
  }, []);

  useEffect(() => {
    if (!konfirmasi) return;
    if (konfirmasi.sisa <= 0) {
      setKonfirmasi(null);
      return;
    }
    const t = window.setTimeout(() => setKonfirmasi((k) => k && { ...k, sisa: k.sisa - 1 }), 1000);
    return () => clearTimeout(t);
  }, [konfirmasi]);

  useIdle(60_000, alur.reset, !alur.mengirim && !konfirmasi && alur.aktif);
  useIdle(60_000, () => {
    setPinBuka(false);
    setPinPesan('');
  }, pinBuka);

  // A kitchen session that ended (PIN changed, token expired) leaves a note for this screen.
  useEffect(() => {
    const catatan = window.sessionStorage.getItem('catatan-sesi');
    if (!catatan) return;
    window.sessionStorage.removeItem('catatan-sesi');
    alur.setInfo({ teks: catatan, nada: 'merah' });
  }, []);

  const batalPesanan = async () => {
    const k = konfirmasi;
    if (!k) return;
    setKonfirmasi(null);
    try {
      await api(`/orders/${k.id}/cancel`, { method: 'POST', body: { client_uuid: k.uuid } });
      alur.setInfo({ teks: `Nomor ${k.nomor} batal`, nada: 'merah' });
    } catch (e) {
      alur.setInfo({ teks: e instanceof Error ? e.message : 'Gagal', nada: 'merah' });
    }
  };

  const mulaiTahan = () => {
    tahan.current = window.setTimeout(() => setPinBuka(true), 3000);
  };
  const lepasTahan = () => clearTimeout(tahan.current);

  const masukDapur = async (pin: string) => {
    const err = await masuk('dapur', pin);
    if (err) {
      setPinPesan(err);
      return;
    }
    setPinBuka(false);
    sesi.setMode('dapur');
    navigate('/dapur');
  };

  const sudut = (
    // Android long-press opens the context menu (vibrates) and cancels the pointer; block it so the 3 s hold completes.
    <div className="sudut" onPointerDown={mulaiTahan} onPointerUp={lepasTahan} onPointerLeave={lepasTahan} onContextMenu={(e) => e.preventDefault()} />
  );
  const keypad = pinBuka && (
    <Keypad
      judul="PIN Dapur"
      pesan={pinPesan}
      onSelesai={(pin) => void masukDapur(pin)}
      onBatal={() => {
        setPinBuka(false);
        setPinPesan('');
      }}
    />
  );

  if (konfirmasi) {
    return (
      <div className="layar konfirmasi">
        <Koneksi online={online} />
        <div className="konfirmasi-label">Nomor</div>
        <div className="konfirmasi-nomor">{konfirmasi.nomor}</div>
        <div className="konfirmasi-total">{rupiah(konfirmasi.total)} · bayar di depan</div>
        <div className="aksi">
          {konfirmasi.bisaBatal && <button className="merah" onClick={() => void batalPesanan()}>Batalkan ({konfirmasi.sisa})</button>}
          <button onClick={() => setKonfirmasi(null)}>Selesai</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="layar">
        {sudut}
        <Koneksi online={online} />
        <div className="memuat">Memuat…</div>
        {keypad}
      </div>
    );
  }

  return (
    <div className="layar">
      {sudut}
      <Koneksi online={online} />
      <div className={`strip-siap${siap.length ? '' : ' kosong'}`}>{siap.length ? `Siap: ${siap.join(' · ')}` : ''}</div>
      <AlurOrder alur={alur} data={data} />
      {keypad}
    </div>
  );
}
