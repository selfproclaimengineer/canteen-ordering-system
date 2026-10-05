import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Installed version and a restart button; on the Termux phone, jalan.sh installs a newer release during the restart. */
export function Perbarui(props: { onPesan: (teks: string, nada: 'merah' | 'hijau') => void }) {
  const [versi, setVersi] = useState('');
  const [yakin, setYakin] = useState(false);
  useEffect(() => {
    api<{ versi: string }>('/admin/versi').then((v) => setVersi(v.versi), () => setVersi('?'));
  }, []);

  const perbarui = async () => {
    if (!yakin) {
      setYakin(true);
      window.setTimeout(() => setYakin(false), 3000);
      return;
    }
    setYakin(false);
    try {
      await api('/admin/perbarui', { method: 'POST' });
      props.onPesan('Server mulai ulang dan cek update. Muat ulang halaman ini setelah ±1 menit.', 'hijau');
    } catch (e) {
      props.onPesan(e instanceof Error ? e.message : 'Gagal', 'merah');
    }
  };

  return (
    <div className="bagian">
      <h3>Versi aplikasi</h3>
      <div className="form-baris">
        <span className="tag">{versi || '…'}</span>
        <button className="utama" onClick={() => void perbarui()}>{yakin ? 'Yakin? Server mati sebentar' : 'Perbarui sekarang'}</button>
      </div>
    </div>
  );
}
