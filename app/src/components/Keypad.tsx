import { useState } from 'react';

const ANGKA = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Keypad(props: { judul: string; pesan?: string; onSelesai: (pin: string) => void; onBatal: () => void }) {
  const [pin, setPin] = useState('');
  const tekan = (d: string) => {
    const next = (pin + d).slice(0, 6);
    if (next.length === 6) {
      setPin('');
      props.onSelesai(next);
    } else {
      setPin(next);
    }
  };
  return (
    <div className="overlay">
      <div className="keypad">
        <div className="keypad-judul">{props.judul}</div>
        <div className="keypad-titik">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={i < pin.length ? 'isi' : ''} />
          ))}
        </div>
        <div className="keypad-pesan">{props.pesan ?? ''}</div>
        <div className="keypad-grid">
          {ANGKA.map((d) => (
            <button key={d} onClick={() => tekan(d)}>{d}</button>
          ))}
          <button className="abu" onClick={props.onBatal}>✕</button>
          <button onClick={() => tekan('0')}>0</button>
          <button className="abu" onClick={() => setPin(pin.slice(0, -1))}>⌫</button>
        </div>
      </div>
    </div>
  );
}
