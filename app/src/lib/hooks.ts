import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hitungPerHalaman } from './halaman';

/** How many fixed-height rows (times columns) fit in the element right now. `celah` is the CSS gap. */
export function usePerPage(ref: RefObject<HTMLElement | null>, tinggiBaris: number, kolom = 1, celah = 0): number {
  const [n, setN] = useState(kolom);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ukur = () => setN(hitungPerHalaman(el.clientHeight, tinggiBaris, celah, kolom));
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, tinggiBaris, kolom, celah]);
  return n;
}

export function useIdle(ms: number, onIdle: () => void, aktif: boolean): void {
  const handler = useRef(onIdle);
  handler.current = onIdle;
  useEffect(() => {
    if (!aktif) return;
    let t = window.setTimeout(() => handler.current(), ms);
    const reset = () => {
      clearTimeout(t);
      t = window.setTimeout(() => handler.current(), ms);
    };
    window.addEventListener('pointerdown', reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', reset);
    };
  }, [ms, aktif]);
}

export function useNow(ms = 1000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}
