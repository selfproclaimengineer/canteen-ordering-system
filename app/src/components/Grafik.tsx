import { type ReactNode, useState } from 'react';
import type { SeriTren } from '../../../shared/tren';
import { angkaRingkas, labelTanggal, skalaRapi } from '../lib/grafik';

/** Categorical slots in fixed order (validated palette); slot 1 doubles as the single-series colour. */
export const WARNA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

const L = 360; // viewBox width; text stays readable when a phone shrinks the chart
const T = 200;
const KIRI = 40;
const ATAS = 10;
const BAWAH = 22;
const KANAN = 8;
const lebarPlot = L - KIRI - KANAN;
const tinggiPlot = T - ATAS - BAWAH;

/** Bar with a 4px rounded data end; `arah` says which end is the data end. */
function batang(x: number, y: number, w: number, h: number, arah: 'atas' | 'kanan') {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0 || h <= 0) return '';
  return arah === 'atas'
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

/** Shows at most ~6 date labels, counted back from the latest day so they never collide. */
const tampilLabel = (i: number, n: number) => (n - 1 - i) % Math.ceil(n / 6) === 0;

function SumbuY(props: { ticks: number[]; format: (n: number) => string }) {
  const atas = props.ticks[props.ticks.length - 1];
  return (
    <>
      {props.ticks.map((t) => {
        const y = ATAS + tinggiPlot - (t / atas) * tinggiPlot;
        return (
          <g key={t}>
            <line x1={KIRI} x2={L - KANAN} y1={y} y2={y} className="grid" />
            <text x={KIRI - 4} y={y + 4} textAnchor="end">{props.format(t)}</text>
          </g>
        );
      })}
    </>
  );
}

/** Card with a chart/table toggle and a readout line that works for both hover and tap. */
export function KartuGrafik(props: { judul: string; keterangan: string; grafik: ReactNode; tabel: ReactNode; legenda?: SeriTren[] }) {
  const [tabel, setTabel] = useState(false);
  return (
    <div className="bagian grafik">
      <div className="judul-grafik">
        <h3>{props.judul}</h3>
        <button onClick={() => setTabel((t) => !t)}>{tabel ? 'Grafik' : 'Tabel'}</button>
      </div>
      {tabel ? (
        <div className="tabel-gulir">{props.tabel}</div>
      ) : (
        <>
          {props.legenda && (
            <div className="legenda">
              {props.legenda.map((s, i) => (
                <span key={s.nama}><i style={{ background: WARNA[i] }} />{s.nama}</span>
              ))}
            </div>
          )}
          {props.grafik}
          <div className="keterangan">{props.keterangan}</div>
        </>
      )}
    </div>
  );
}

/** One value per day as vertical bars. */
export function BatangWaktu(props: { judul: string; tanggal: string[]; nilai: number[]; format: (n: number) => string }) {
  const [aktif, setAktif] = useState<number | null>(null);
  const ticks = skalaRapi(Math.max(...props.nilai));
  const atas = ticks[ticks.length - 1];
  const n = props.tanggal.length;
  const slot = lebarPlot / n;
  const w = Math.max(1, slot - 2); // 2px surface gap between bars
  return (
    <KartuGrafik
      judul={props.judul}
      keterangan={aktif === null ? 'Sentuh batang untuk melihat nilai' : `${labelTanggal(props.tanggal[aktif])}: ${props.format(props.nilai[aktif])}`}
      grafik={
        <svg viewBox={`0 0 ${L} ${T}`} role="img" aria-label={props.judul} onPointerLeave={() => setAktif(null)}>
          <SumbuY ticks={ticks} format={angkaRingkas} />
          {props.nilai.map((v, i) => {
            const h = (v / atas) * tinggiPlot;
            const x = KIRI + i * slot + 1;
            return (
              <g key={props.tanggal[i]}>
                <path d={batang(x, ATAS + tinggiPlot - h, w, h, 'atas')} fill={WARNA[0]} opacity={aktif === null || aktif === i ? 1 : 0.5} />
                {tampilLabel(i, n) && <text x={x + w / 2} y={T - 6} textAnchor="middle">{labelTanggal(props.tanggal[i])}</text>}
                <rect x={KIRI + i * slot} y={ATAS} width={slot} height={tinggiPlot} fill="transparent" onPointerEnter={() => setAktif(i)} onClick={() => setAktif(i)} />
              </g>
            );
          })}
        </svg>
      }
      tabel={
        <table>
          <thead><tr><th>Tanggal</th><th className="angka">Nilai</th></tr></thead>
          <tbody>
            {props.tanggal.map((t, i) => (
              <tr key={t}><td>{t}</td><td className="angka">{props.format(props.nilai[i])}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

/** Ranking as horizontal bars, labelled directly with name and total. */
export function BatangPeringkat(props: { judul: string; seri: SeriTren[] }) {
  const TB = 26;
  const maks = Math.max(...props.seri.map((s) => s.total));
  const tinggi = props.seri.length * TB;
  const tabel = (
    <table>
      <thead><tr><th>Nama</th><th className="angka">Qty</th></tr></thead>
      <tbody>
        {props.seri.map((s) => (
          <tr key={s.nama}><td>{s.nama}</td><td className="angka">{s.total}</td></tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <KartuGrafik
      judul={props.judul}
      keterangan="Jumlah terjual dalam rentang"
      grafik={
        <svg viewBox={`0 0 ${L} ${tinggi}`} role="img" aria-label={props.judul}>
          {props.seri.map((s, i) => {
            const y = i * TB;
            return (
              <g key={s.nama}>
                <title>{`${s.nama}: ${s.total}`}</title>
                <text x={0} y={y + 10}>{s.nama.length > 28 ? `${s.nama.slice(0, 27)}…` : s.nama}</text>
                <path d={batang(0, y + 13, Math.max(2, (s.total / maks) * (L - 40)), 10, 'kanan')} fill={WARNA[0]} />
                <text x={L} y={y + 22} textAnchor="end" className="nilai">{s.total}</text>
              </g>
            );
          })}
        </svg>
      }
      tabel={tabel}
    />
  );
}

/** Daily quantity of a few series as lines; the readout lists every series for the touched day. */
export function GarisTren(props: { judul: string; tanggal: string[]; seri: SeriTren[] }) {
  const [aktif, setAktif] = useState<number | null>(null);
  const ticks = skalaRapi(Math.max(...props.seri.flatMap((s) => s.qty)));
  const atas = ticks[ticks.length - 1];
  const n = props.tanggal.length;
  const slot = lebarPlot / n;
  const xDi = (i: number) => KIRI + slot * (i + 0.5);
  const yDi = (v: number) => ATAS + tinggiPlot - (v / atas) * tinggiPlot;
  return (
    <KartuGrafik
      judul={props.judul}
      legenda={props.seri}
      keterangan={
        aktif === null
          ? 'Sentuh grafik untuk melihat nilai'
          : `${labelTanggal(props.tanggal[aktif])}: ${props.seri.map((s) => `${s.nama} ${s.qty[aktif]}`).join(' · ')}`
      }
      grafik={
        <svg viewBox={`0 0 ${L} ${T}`} role="img" aria-label={props.judul} onPointerLeave={() => setAktif(null)}>
          <SumbuY ticks={ticks} format={angkaRingkas} />
          {props.tanggal.map((t, i) => tampilLabel(i, n) && <text key={t} x={xDi(i)} y={T - 6} textAnchor="middle">{labelTanggal(t)}</text>)}
          {aktif !== null && <line x1={xDi(aktif)} x2={xDi(aktif)} y1={ATAS} y2={ATAS + tinggiPlot} className="silang-x" />}
          {props.seri.map((s, k) => (
            <g key={s.nama}>
              <polyline points={s.qty.map((v, i) => `${xDi(i)},${yDi(v)}`).join(' ')} fill="none" stroke={WARNA[k]} strokeWidth={2} strokeLinejoin="round" />
              {(n === 1 || aktif !== null) &&
                s.qty.map((v, i) => (n === 1 || i === aktif) && <circle key={i} cx={xDi(i)} cy={yDi(v)} r={4} fill={WARNA[k]} stroke="#fff" strokeWidth={2} />)}
            </g>
          ))}
          {props.tanggal.map((t, i) => (
            <rect key={t} x={KIRI + i * slot} y={ATAS} width={slot} height={tinggiPlot} fill="transparent" onPointerEnter={() => setAktif(i)} onClick={() => setAktif(i)} />
          ))}
        </svg>
      }
      tabel={
        <table>
          <thead>
            <tr><th>Tanggal</th>{props.seri.map((s) => <th key={s.nama} className="angka">{s.nama}</th>)}</tr>
          </thead>
          <tbody>
            {props.tanggal.map((t, i) => (
              <tr key={t}><td>{t}</td>{props.seri.map((s) => <td key={s.nama} className="angka">{s.qty[i]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}
