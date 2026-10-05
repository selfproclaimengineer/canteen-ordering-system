import { redirect, useNavigate } from 'react-router';
import { type Mode, sesi } from '../lib/sesi';

export function adminLoader(mode: Mode) {
  if (sesi.peran() !== 'admin') {
    const ke = sesi.token() ? 'dapur' : 'order';
    sesi.setMode(ke);
    return redirect(`/${ke}`);
  }
  sesi.setMode(mode);
  return null;
}

export function NavAdmin(props: { aktif: 'edit' | 'laporan' }) {
  const navigate = useNavigate();
  const ke = (mode: Mode) => {
    if (mode === 'order') sesi.hapusToken();
    sesi.setMode(mode);
    navigate(`/${mode}`);
  };
  return (
    <div className="kepala">
      <button className={`tab${props.aktif === 'edit' ? ' aktif' : ''}`} onClick={() => ke('edit')}>Edit</button>
      <button className={`tab${props.aktif === 'laporan' ? ' aktif' : ''}`} onClick={() => ke('laporan')}>Laporan</button>
      <div className="isi-kanan">
        <button className="kecil" onClick={() => ke('dapur')}>Dapur</button>
        <button className="kecil" onClick={() => ke('order')}>Order</button>
      </div>
    </div>
  );
}
