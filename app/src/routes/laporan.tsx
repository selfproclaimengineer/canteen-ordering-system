import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { tanggalDari } from '../../../shared/rules';
import type { Tren } from '../../../shared/tren';
import type { BarisLaporan, Laporan as DataLaporan } from '../../../shared/types';
import { BatangPeringkat, BatangWaktu, GarisTren } from '../components/Grafik';
import { adminLoader, NavAdmin } from '../components/NavAdmin';
import { ApiError, api, unduh } from '../lib/api';
import { rupiah } from '../lib/format';
import { potongTeratas } from '../lib/grafik';
import { sesi } from '../lib/sesi';

interface Riwayat {
  tanggal: string;
  pemasukan: number;
  pengeluaran: number;
  keuntungan: number;
}

export function clientLoader() {
  return adminLoader('laporan');
}

function Tabel(props: { judul: string; baris: BarisLaporan[] }) {
  if (props.baris.length === 0) return null;
  return (
    <div className="bagian">
      <h3>{props.judul}</h3>
      <table>
        <thead>
          <tr><th>Nama</th><th className="angka">Harga</th><th className="angka">Qty</th><th className="angka">Total</th></tr>
        </thead>
        <tbody>
          {props.baris.map((r) => (
            <tr key={`${r.nama}-${r.harga}`}>
              <td>{r.nama}</td>
              <td className="angka">{rupiah(r.harga)}</td>
              <td className="angka">{r.qty}</td>
              <td className="angka">{rupiah(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HARI_MS = 24 * 3600_000;

function BagianTren(props: { hariIni: string; onGagal: (e: unknown) => void }) {
  const [dari, setDari] = useState(() => tanggalDari(Date.now() - 6 * HARI_MS));
  const [sampai, setSampai] = useState(props.hariIni);
  const [tren, setTren] = useState<Tren | null>(null);
  const { onGagal } = props;

  useEffect(() => {
    if (!dari || !sampai || dari > sampai) return;
    let aktif = true;
    api<Tren>(`/admin/tren?dari=${dari}&sampai=${sampai}`)
      .then((t) => aktif && setTren(t))
      .catch(onGagal);
    return () => {
      aktif = false;
    };
  }, [dari, sampai, onGagal]);

  const preset = (hari: number) => {
    setDari(tanggalDari(Date.now() - (hari - 1) * HARI_MS));
    setSampai(props.hariIni);
  };
  const kosong = tren !== null && tren.menu.length === 0;

  return (
    <div className="bagian">
      <h3>Tren</h3>
      <div className="form-baris">
        <button onClick={() => preset(7)}>7 hari</button>
        <button onClick={() => preset(30)}>30 hari</button>
        <label>Dari <input type="date" value={dari} max={sampai} onChange={(e) => setDari(e.target.value)} /></label>
        <label>Sampai <input type="date" value={sampai} max={props.hariIni} onChange={(e) => setSampai(e.target.value)} /></label>
      </div>
      {kosong && <div className="kosong-teks">Belum ada penjualan di rentang ini</div>}
      {tren && !kosong && (
        <>
          <BatangWaktu judul="Pemasukan per hari" tanggal={tren.tanggal} nilai={tren.pemasukan} format={rupiah} />
          <BatangPeringkat judul="Menu terlaris" seri={potongTeratas(tren.menu, 10)} />
          <GarisTren judul="5 menu teratas per hari" tanggal={tren.tanggal} seri={potongTeratas(tren.menu, 5)} />
          {tren.topping.length > 0 && <BatangPeringkat judul="Topping terlaris" seri={potongTeratas(tren.topping, 10)} />}
        </>
      )}
    </div>
  );
}

export default function Laporan() {
  const navigate = useNavigate();
  const hariIni = tanggalDari(Date.now());
  const [tanggal, setTanggal] = useState(hariIni);
  const [data, setData] = useState<{ laporan: DataLaporan; disimpan_at: number | null } | null>(null);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [dari, setDari] = useState(hariIni);
  const [sampai, setSampai] = useState(hariIni);
  const [pesan, setPesan] = useState<{ teks: string; nada: 'merah' | 'hijau' } | null>(null);

  const gagal = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        sesi.hapusToken();
        sesi.setMode('order');
        navigate('/order');
        return;
      }
      setPesan({ teks: e instanceof Error ? e.message : 'Gagal', nada: 'merah' });
    },
    [navigate],
  );

  const muat = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        api<{ laporan: DataLaporan; disimpan_at: number | null }>(`/admin/laporan/${tanggal}`),
        api<Riwayat[]>('/admin/laporan'),
      ]);
      setData(d);
      setRiwayat(r);
    } catch (e) {
      gagal(e);
    }
  }, [tanggal, gagal]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const l = data?.laporan;

  return (
    <div className="halaman">
      <NavAdmin aktif="laporan" />
      <div className="badan">
        <div className="form-baris">
          <label>Tanggal <input type="date" value={tanggal} max={hariIni} onChange={(e) => e.target.value && setTanggal(e.target.value)} /></label>
          {data && <span className="tag">{data.disimpan_at ? 'Tersimpan' : 'Belum disimpan'}</span>}
        </div>
        {pesan && <div className={`info ${pesan.nada}`}>{pesan.teks}</div>}

        {l && (
          <>
            <div className="ringkasan">
              <div>Pemasukan<b>{rupiah(l.pemasukan)}</b></div>
              <div>Pengeluaran<b>{rupiah(l.pengeluaran)}</b></div>
              <div>Keuntungan<b className={l.keuntungan >= 0 ? 'untung' : 'rugi'}>{rupiah(l.keuntungan)}</b></div>
            </div>
            <form
              className="bagian"
              onSubmit={(e) => {
                e.preventDefault();
                const pengeluaran = Number(new FormData(e.currentTarget).get('pengeluaran'));
                api(`/admin/laporan/${tanggal}`, { method: 'PUT', body: { pengeluaran } })
                  .then(() => {
                    setPesan({ teks: 'Laporan disimpan', nada: 'hijau' });
                    return muat();
                  })
                  .catch(gagal);
              }}
            >
              <h3>Pengeluaran</h3>
              <div className="form-baris">
                <input key={`${tanggal}-${l.pengeluaran}`} name="pengeluaran" type="number" min={0} step={1000} defaultValue={l.pengeluaran} required />
                <button className="utama" type="submit">Simpan</button>
              </div>
            </form>
            <Tabel judul="Menu" baris={l.menu} />
            <Tabel judul="Topping berbayar & potongan" baris={l.topping} />
            <div className="bagian">
              <h3>Batal</h3>
              <div>{l.batal.qty} item · {rupiah(l.batal.nilai)}</div>
            </div>
            {l.sumber && (
              <div className="bagian">
                <h3>Sumber order</h3>
                <div>Meja depan {l.sumber.kasir} · QR {l.sumber.qr}</div>
              </div>
            )}
          </>
        )}

        <BagianTren hariIni={hariIni} onGagal={gagal} />

        <div className="bagian">
          <h3>Ekspor CSV</h3>
          <div className="form-baris">
            <label>Dari <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></label>
            <label>Sampai <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
            <button className="utama" onClick={() => unduh(`/admin/laporan.csv?dari=${dari}&sampai=${sampai}`, `laporan_${dari}_${sampai}.csv`).catch(gagal)}>Unduh</button>
          </div>
        </div>

        <div className="bagian">
          <h3>Riwayat tersimpan</h3>
          {riwayat.length === 0 && <div className="kosong-teks">Belum ada</div>}
          {riwayat.length > 0 && (
            <table>
              <thead>
                <tr><th>Tanggal</th><th className="angka">Masuk</th><th className="angka">Keluar</th><th className="angka">Untung</th></tr>
              </thead>
              <tbody>
                {riwayat.map((r) => (
                  <tr key={r.tanggal} onClick={() => setTanggal(r.tanggal)} style={{ cursor: 'pointer' }}>
                    <td>{r.tanggal}</td>
                    <td className="angka">{rupiah(r.pemasukan)}</td>
                    <td className="angka">{rupiah(r.pengeluaran)}</td>
                    <td className={`angka ${r.keuntungan >= 0 ? 'untung' : 'rugi'}`}>{rupiah(r.keuntungan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
