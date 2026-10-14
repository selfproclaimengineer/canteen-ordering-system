import { useEffect } from 'react';

const KUNCI = 'link-tetap';
// Only our own static staff links on GitHub Pages, never an arbitrary address from the URL.
const LINK_TETAP = /^https:\/\/[a-z0-9-]+\.github\.io\/[A-Za-z0-9._-]+\/staf\/[A-Za-z0-9]+\/(order|dapur)\/?$/;

// Runs when the route module loads, before its loader may redirect and drop the query string.
if (typeof window !== 'undefined') {
  const k = new URLSearchParams(window.location.search).get('kembali');
  if (k && LINK_TETAP.test(k)) window.sessionStorage.setItem(KUNCI, k);
}

/** Offline marker. Opened from a static staff link, the page returns to it after 30 s offline: the tunnel address may have changed. */
export function Koneksi(props: { online: boolean }) {
  useEffect(() => {
    if (props.online) return;
    const k = window.sessionStorage.getItem(KUNCI);
    if (!k) return;
    const t = window.setTimeout(() => window.location.replace(k), 30_000);
    return () => clearTimeout(t);
  }, [props.online]);
  return props.online ? null : <div className="terputus">● Terputus</div>;
}
