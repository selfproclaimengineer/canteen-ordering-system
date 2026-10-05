import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { beep, bunyikan, type JenisSuara, muatSuara } from '../lib/beep';
import { sesi } from '../lib/sesi';

const JUDUL: Record<JenisSuara, string> = { masuk: 'Pesanan masuk (HP dapur)', jadi: 'Pesanan jadi (HP QR)' };
/** Built-in sounds used when no file is uploaded; same as the dapur and QR pages. */
export const BAWAAN: Record<JenisSuara, () => void> = { masuk: () => beep(), jadi: () => beep(660, 200, 3) };

export function AturSuara(props: { onPesan: (teks: string, nada: 'merah' | 'hijau') => void }) {
  const [versi, setVersi] = useState<Record<JenisSuara, number | null> | null>(null);
  const muat = () => api<Record<JenisSuara, number | null>>('/suara').then(setVersi, () => setVersi(null));
  useEffect(() => void muat(), []);

  const unggah = async (jenis: JenisSuara, file: File) => {
    if (file.size > 1024 * 1024) return props.onPesan('File maks 1 MB', 'merah');
    const res = await fetch(`/api/admin/suara/${jenis}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'audio/mpeg', Authorization: `Bearer ${sesi.token() ?? ''}` },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    props.onPesan(res.ok ? 'Suara disimpan' : (data.error ?? 'Gagal'), res.ok ? 'hijau' : 'merah');
    await muat();
  };

  const bawaan = async (jenis: JenisSuara) => {
    await api(`/admin/suara/${jenis}`, { method: 'DELETE' }).catch(() => undefined);
    props.onPesan('Kembali ke suara bawaan', 'hijau');
    await muat();
  };

  return (
    <div className="bagian">
      <h3>Suara notifikasi</h3>
      {(['masuk', 'jadi'] as const).map((jenis) => (
        <div key={jenis} className="form-baris">
          <b className="judul-suara">{JUDUL[jenis]}</b>
          <span className="tag">{versi?.[jenis] ? 'File sendiri' : 'Bawaan'}</span>
          <button onClick={() => void muatSuara().then(() => bunyikan(jenis, BAWAAN[jenis]))}>▶ Coba</button>
          <label className="tombol-file">
            Ganti…
            <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void unggah(jenis, f); }} />
          </label>
          {versi?.[jenis] && <button onClick={() => void bawaan(jenis)}>Bawaan</button>}
        </div>
      ))}
    </div>
  );
}
