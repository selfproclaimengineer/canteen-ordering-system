import { type FormEvent, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router';
import type { Grup, Widget } from '../../../shared/types';
import { AturSuara } from '../components/AturSuara';
import { Perbarui } from '../components/Perbarui';
import { adminLoader, NavAdmin } from '../components/NavAdmin';
import { ApiError, api } from '../lib/api';
import { rupiah } from '../lib/format';
import { sesi } from '../lib/sesi';

interface MenuAdmin {
  id: number;
  nama: string;
  harga: number;
  tersedia: boolean;
  urutan: number;
  grup_ids: number[];
}
interface DataAdmin {
  menu: MenuAdmin[];
  grup: Grup[];
}
interface Pengaturan {
  jam_ist1: string;
  jam_ist2: string;
  qty_max: number;
}
interface AturQr {
  alamat: string;
  kode: string;
  buka: boolean;
  ip: string[];
  /** Server started with KANTIN_QR_HANYA_SEKOLAH=1; kantin staff never see these tools otherwise. */
  cek_jaringan?: boolean;
}

const WIDGET: { id: Widget; label: string }[] = [
  { id: 'stepper', label: 'Stepper (− / +)' },
  { id: 'option', label: 'Option (tombol)' },
  { id: 'checklist', label: 'Checklist' },
];

export function clientLoader() {
  return adminLoader('edit');
}

function baca(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const form = e.currentTarget;
  const f = new FormData(form);
  const teks = (k: string) => String(f.get(k) ?? '').trim();
  return { f, form, teks, angka: (k: string) => Number(f.get(k)), hargaAtauNull: (k: string) => (teks(k) === '' ? null : Number(teks(k))) };
}

export default function Edit() {
  const navigate = useNavigate();
  const [bagian, setBagian] = useState<'menu' | 'opsi' | 'atur' | 'qr'>('menu');
  const [data, setData] = useState<DataAdmin | null>(null);
  const [atur, setAtur] = useState<Pengaturan | null>(null);
  const [pilih, setPilih] = useState<number[]>([]);
  const [ubah, setUbah] = useState<number | null>(null);
  const [pesan, setPesan] = useState<{ teks: string; nada: 'merah' | 'hijau' } | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [qr, setQr] = useState<AturQr | null>(null);
  const [gambarQr, setGambarQr] = useState('');
  const [yakinGanti, setYakinGanti] = useState(false);
  const [ditolak, setDitolak] = useState<{ ip: string; waktu: number }[]>([]);
  const [pilihTolak, setPilihTolak] = useState<string[]>([]);
  const urlQr = qr && qr.alamat && qr.kode ? `${qr.alamat}/pesan/${qr.kode}` : '';

  const muat = useCallback(async () => {
    const [d, a, q, t] = await Promise.all([
      api<DataAdmin>('/admin/menu'),
      api<Pengaturan>('/admin/pengaturan'),
      api<AturQr>('/admin/qr'),
      api<{ ip: string; waktu: number }[]>('/admin/qr/ditolak'),
    ]);
    setData(d);
    setAtur(a);
    setQr(q);
    setDitolak(t);
    setPilihTolak((p) => p.filter((ip) => t.some((x) => x.ip === ip)));
  }, []);

  const jalan = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      try {
        await fn();
        if (ok) setPesan({ teks: ok, nada: 'hijau' });
        await muat();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          sesi.hapusToken();
          sesi.setMode('order');
          navigate('/order');
          return;
        }
        setPesan({ teks: e instanceof Error ? e.message : 'Gagal', nada: 'merah' });
      }
    },
    [muat, navigate],
  );

  useEffect(() => {
    void jalan(async () => {});
  }, [jalan]);

  useEffect(() => {
    if (!urlQr) {
      setGambarQr('');
      return;
    }
    QRCode.toDataURL(urlQr, { width: 512, margin: 2 }).then(setGambarQr).catch(() => setGambarQr(''));
  }, [urlQr]);

  const tandai = (id: number) => setPilih((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const massal = (path: string, body: object, ok: string) =>
    void jalan(async () => {
      await api(path, { method: 'POST', body });
      setPilih([]);
    }, ok);

  const hapusMassal = () => {
    if (!yakinHapus) {
      setYakinHapus(true);
      window.setTimeout(() => setYakinHapus(false), 3000);
      return;
    }
    setYakinHapus(false);
    massal('/admin/menu/hapus', { ids: pilih }, 'Dihapus');
  };

  const gantiPin = (peran: 'dapur' | 'admin', pin: string) =>
    void jalan(async () => {
      await api('/admin/pin', { method: 'PUT', body: { peran, pin_baru: pin } });
      if (peran === 'admin') throw new ApiError(401, 'PIN Admin diganti', {});
    }, 'PIN diganti');

  if (!data || !atur) {
    return (
      <div className="halaman">
        <NavAdmin aktif="edit" />
        {pesan && <div className="badan"><div className={`info ${pesan.nada}`}>{pesan.teks}</div></div>}
      </div>
    );
  }

  return (
    <div className="halaman">
      <NavAdmin aktif="edit" />
      <div className="badan">
        <div className="form-baris">
          <button className={bagian === 'menu' ? 'utama' : ''} onClick={() => setBagian('menu')}>Menu</button>
          <button className={bagian === 'opsi' ? 'utama' : ''} onClick={() => setBagian('opsi')}>Opsi</button>
          <button className={bagian === 'atur' ? 'utama' : ''} onClick={() => setBagian('atur')}>Pengaturan</button>
          <button className={bagian === 'qr' ? 'utama' : ''} onClick={() => setBagian('qr')}>QR</button>
        </div>
        {pesan && <div className={`info ${pesan.nada}`}>{pesan.teks}</div>}

        {bagian === 'menu' && (
          <>
            <form
              className="bagian"
              onSubmit={(e) => {
                const { form, teks, angka } = baca(e);
                void jalan(async () => {
                  await api('/admin/menu', { method: 'POST', body: { nama: teks('nama'), harga: angka('harga'), urutan: data.menu.length } });
                  form.reset();
                }, 'Menu ditambah');
              }}
            >
              <h3>Tambah menu</h3>
              <div className="form-baris">
                <input name="nama" placeholder="Nama" required maxLength={40} />
                <input name="harga" type="number" min={0} step={500} placeholder="Harga" required />
                <button className="utama" type="submit">Tambah</button>
              </div>
            </form>

            <div className="bagian">
              <div className="form-baris">
                <h3 style={{ marginRight: 'auto' }}>Menu ({pilih.length} dipilih)</h3>
                <button className="kecil" disabled={!pilih.length} onClick={() => massal('/admin/menu/tersedia', { ids: pilih, tersedia: false }, 'Ditandai habis')}>Habis</button>
                <button className="kecil" disabled={!pilih.length} onClick={() => massal('/admin/menu/tersedia', { ids: pilih, tersedia: true }, 'Tersedia lagi')}>Tersedia</button>
                <button className="kecil merah" disabled={!pilih.length} onClick={hapusMassal}>{yakinHapus ? 'Yakin?' : 'Hapus'}</button>
              </div>
              {data.menu.map((m) => (
                <div key={m.id} className="bagian">
                  <div className="form-baris">
                    <input type="checkbox" checked={pilih.includes(m.id)} onChange={() => tandai(m.id)} style={{ width: 24, height: 24 }} />
                    <b style={{ flex: 1 }}>{m.nama}</b>
                    <span>{rupiah(m.harga)}</span>
                    <span className={`tag${m.tersedia ? '' : ' habis'}`}>{m.tersedia ? 'Tersedia' : 'Habis'}</span>
                    <button className="kecil" onClick={() => setUbah(ubah === m.id ? null : m.id)}>{ubah === m.id ? 'Tutup' : 'Ubah'}</button>
                  </div>
                  {ubah === m.id && (
                    <form
                      onSubmit={(e) => {
                        const { f, teks, angka } = baca(e);
                        const grup_ids = data.grup.filter((g) => f.get(`g${g.id}`) === 'on').map((g) => g.id);
                        void jalan(async () => {
                          await api(`/admin/menu/${m.id}`, {
                            method: 'PUT',
                            body: { nama: teks('nama'), harga: angka('harga'), tersedia: m.tersedia, urutan: angka('urutan') },
                          });
                          await api(`/admin/menu/${m.id}/grup`, { method: 'PUT', body: { grup_ids } });
                          setUbah(null);
                        }, 'Disimpan');
                      }}
                    >
                      <div className="form-baris">
                        <input name="nama" defaultValue={m.nama} required maxLength={40} />
                        <input name="harga" type="number" min={0} step={500} defaultValue={m.harga} required />
                        <input name="urutan" type="number" min={0} defaultValue={m.urutan} title="Urutan" />
                      </div>
                      <div className="form-baris">
                        {data.grup.map((g) => (
                          <label key={g.id} className="tag">
                            <input type="checkbox" name={`g${g.id}`} defaultChecked={m.grup_ids.includes(g.id)} /> {g.nama}
                          </label>
                        ))}
                      </div>
                      <div className="form-baris">
                        <button className="utama" type="submit">Simpan</button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {bagian === 'opsi' && (
          <>
            <form
              className="bagian"
              onSubmit={(e) => {
                const { form, teks } = baca(e);
                void jalan(async () => {
                  await api('/admin/grup', { method: 'POST', body: { nama: teks('nama'), widget: teks('widget'), urutan: data.grup.length } });
                  form.reset();
                }, 'Grup ditambah');
              }}
            >
              <h3>Tambah grup opsi</h3>
              <div className="form-baris">
                <input name="nama" placeholder="Nama grup, mis. Kepedasan" required maxLength={30} />
                <select name="widget">
                  {WIDGET.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
                <button className="utama" type="submit">Tambah</button>
              </div>
            </form>

            {data.grup.map((g) => (
              <div key={g.id} className="bagian">
                <form
                  className="form-baris"
                  onSubmit={(e) => {
                    const { teks } = baca(e);
                    void jalan(() => api(`/admin/grup/${g.id}`, { method: 'PUT', body: { nama: teks('nama'), widget: teks('widget'), urutan: g.urutan } }), 'Disimpan');
                  }}
                >
                  <input name="nama" defaultValue={g.nama} required maxLength={30} />
                  <select name="widget" defaultValue={g.widget}>
                    {WIDGET.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                  <button className="kecil" type="submit">Simpan</button>
                  <button className="kecil merah" type="button" onClick={() => void jalan(() => api(`/admin/grup/${g.id}`, { method: 'DELETE' }), 'Grup dihapus')}>Hapus grup</button>
                </form>
                {g.pilihan.map((p, i) => (
                  <form
                    key={p.id}
                    className="form-baris"
                    onSubmit={(e) => {
                      const { teks, hargaAtauNull } = baca(e);
                      void jalan(() => api(`/admin/pilihan/${p.id}`, { method: 'PUT', body: { label: teks('label'), harga: hargaAtauNull('harga'), urutan: i } }), 'Disimpan');
                    }}
                  >
                    <input name="label" defaultValue={p.label} required maxLength={30} />
                    <input name="harga" type="number" step={500} defaultValue={p.harga || ''} placeholder="Gratis" title="Minus = potongan, mis. -2000" />
                    <button className="kecil" type="submit">Simpan</button>
                    <button className="kecil merah" type="button" onClick={() => void jalan(() => api(`/admin/pilihan/${p.id}`, { method: 'DELETE' }), 'Pilihan dihapus')}>✕</button>
                  </form>
                ))}
                <form
                  className="form-baris"
                  onSubmit={(e) => {
                    const { form, teks, hargaAtauNull } = baca(e);
                    void jalan(async () => {
                      await api('/admin/pilihan', { method: 'POST', body: { grup_id: g.id, label: teks('label'), harga: hargaAtauNull('harga'), urutan: g.pilihan.length } });
                      form.reset();
                    }, 'Pilihan ditambah');
                  }}
                >
                  <input name="label" placeholder={g.widget === 'stepper' ? 'Level, mis. 6' : 'Label pilihan'} required maxLength={30} />
                  <input name="harga" type="number" step={500} placeholder="Gratis" title="Minus = potongan, mis. -2000" />
                  <button className="kecil utama" type="submit">+ Pilihan</button>
                </form>
              </div>
            ))}
          </>
        )}

        {bagian === 'atur' && (
          <>
            <form
              className="bagian"
              onSubmit={(e) => {
                const { teks, angka } = baca(e);
                void jalan(() => api('/admin/pengaturan', { method: 'PUT', body: { jam_ist1: teks('jam_ist1'), jam_ist2: teks('jam_ist2'), qty_max: angka('qty_max') } }), 'Disimpan');
              }}
            >
              <h3>Istirahat dan jumlah</h3>
              <div className="form-baris">
                <label>Istirahat 1 <input name="jam_ist1" type="time" defaultValue={atur.jam_ist1} required /></label>
                <label>Istirahat 2 <input name="jam_ist2" type="time" defaultValue={atur.jam_ist2} required /></label>
                <label>Maks per menu <input name="qty_max" type="number" min={1} max={99} defaultValue={atur.qty_max} required /></label>
                <button className="utama" type="submit">Simpan</button>
              </div>
            </form>
            {(['dapur', 'admin'] as const).map((peran) => (
              <form
                key={peran}
                className="bagian"
                onSubmit={(e) => {
                  const { form, teks } = baca(e);
                  gantiPin(peran, teks('pin'));
                  form.reset();
                }}
              >
                <h3>Ganti PIN {peran === 'dapur' ? 'Dapur' : 'Admin'}</h3>
                <div className="form-baris">
                  <input name="pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="6 angka" required />
                  <button className="utama" type="submit">Ganti</button>
                </div>
              </form>
            ))}
            <AturSuara onPesan={(teks, nada) => setPesan({ teks, nada })} />
            <Perbarui onPesan={(teks, nada) => setPesan({ teks, nada })} />
          </>
        )}
        {bagian === 'qr' && qr && (
          <>
            <form
              className="bagian"
              onSubmit={(e) => {
                const { teks } = baca(e);
                void jalan(() => api('/admin/qr', { method: 'PUT', body: { alamat: teks('alamat'), buka: qr.buka } }), 'Disimpan');
              }}
            >
              <h3>Alamat publik (URL tunnel)</h3>
              <div className="form-baris">
                <input name="alamat" defaultValue={qr.alamat} placeholder="https://kantin.xxx.ts.net" />
                <button className="utama" type="submit">Simpan</button>
              </div>
              <small>Kosongkan untuk mematikan fitur QR.</small>
            </form>
            {urlQr && (
              <>
                <div className="bagian qr-cetak">
                  {gambarQr && <img src={gambarQr} alt="QR pesan" width={260} height={260} />}
                  <div className="qr-teks">Scan untuk pesan · khusus WiFi sekolah</div>
                  <div className="form-baris qr-tombol">
                    <button onClick={() => window.print()}>Cetak</button>
                    <button
                      className={qr.buka ? 'hijau' : ''}
                      onClick={() => void jalan(() => api('/admin/qr', { method: 'PUT', body: { alamat: qr.alamat, buka: !qr.buka } }))}
                    >
                      QR: {qr.buka ? 'Buka' : 'Tutup'}
                    </button>
                    <button
                      className="merah"
                      onClick={() => {
                        if (!yakinGanti) {
                          setYakinGanti(true);
                          window.setTimeout(() => setYakinGanti(false), 3000);
                          return;
                        }
                        setYakinGanti(false);
                        void jalan(() => api('/admin/qr/ganti-kode', { method: 'POST' }), 'Kode diganti. Cetak ulang QR.');
                      }}
                    >
                      {yakinGanti ? 'Yakin? QR lama mati' : 'Ganti kode'}
                    </button>
                  </div>
                </div>
                {qr.cek_jaringan && (
                <>
                <div className="bagian">
                  <h3>Jaringan sekolah</h3>
                  <button className="utama" onClick={() => void jalan(() => api('/admin/qr/ambil-ip', { method: 'POST' }), 'IP sekolah ditambahkan')}>
                    Ambil IP sekolah
                  </button>
                  {qr.ip.length === 0 && <div className="kosong-teks">Belum ada. Order QR dari internet akan ditolak.</div>}
                  {qr.ip.map((ip) => (
                    <div className="form-baris" key={ip}>
                      <span style={{ flex: 1 }}>{ip}</span>
                      <button className="kecil merah" onClick={() => void jalan(() => api('/admin/qr/ip', { method: 'PUT', body: { ip: qr.ip.filter((x) => x !== ip) } }))}>✕</button>
                    </div>
                  ))}
                  <form
                    className="form-baris"
                    onSubmit={(e) => {
                      const { form, teks } = baca(e);
                      void jalan(async () => {
                        await api('/admin/qr/ip', { method: 'PUT', body: { ip: [...qr.ip, teks('ip')] } });
                        form.reset();
                      }, 'IP ditambahkan');
                    }}
                  >
                    <input name="ip" placeholder="IP atau rentang, mis. 114.10.1.1 atau 100.88.112.0/20" required />
                    <button className="kecil" type="submit">+ IP</button>
                  </form>
                </div>
                <div className="bagian">
                  <h3>IP yang ditolak</h3>
                  <small>Buka QR dari 2–3 HP di WiFi sekolah, lalu muat ulang. IP sama semua: izinkan IP. Berbeda-beda: izinkan rentang.</small>
                  {ditolak.length === 0 && <div className="kosong-teks">Belum ada.</div>}
                  {ditolak.map((d) => (
                    <label className="form-baris" key={d.ip}>
                      <input
                        type="checkbox"
                        checked={pilihTolak.includes(d.ip)}
                        onChange={() => setPilihTolak((p) => (p.includes(d.ip) ? p.filter((x) => x !== d.ip) : [...p, d.ip]))}
                        style={{ width: 24, height: 24 }}
                      />
                      <span style={{ flex: 1 }}>{d.ip}</span>
                      <small>{new Date(d.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small>
                    </label>
                  ))}
                  <div className="form-baris">
                    <button className="kecil" onClick={() => void jalan(async () => {})}>Muat ulang</button>
                    <button
                      disabled={pilihTolak.length === 0}
                      onClick={() => void jalan(() => api('/admin/qr/ip', { method: 'PUT', body: { ip: [...qr.ip, ...pilihTolak] } }), 'IP diizinkan')}
                    >
                      Izinkan IP
                    </button>
                    <button
                      className="utama"
                      disabled={pilihTolak.length < 2}
                      onClick={() => void jalan(() => api('/admin/qr/izinkan-rentang', { method: 'POST', body: { ip: pilihTolak } }), 'Rentang diizinkan')}
                    >
                      Izinkan rentang
                    </button>
                  </div>
                </div>
                </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
