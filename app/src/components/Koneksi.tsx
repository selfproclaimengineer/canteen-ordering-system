import { useEffect } from 'react';

const KUNCI = 'link-tetap';
// Only our own static staff links on GitHub Pages, never an arbitrary address from the URL.
const LINK_TETAP = /^https:\/\/[a-z0-9-]+\.github\.io\/[A-Za-z0-9._-]+\/staf\/[A-Za-z0-9]+\/(order|dapur)\/?$/;

// Runs when the route module loads, before its loader may redirect and drop the query string.
if (typeof window !== 'undefined') {
  const k = new URLSearchParams(window.location.search).get('kembali');
  if (k && LINK_TETAP.test(k)) window.sessionStorage.setItem(KUNCI, k);
}

/**
 * Offline marker. Opened from a static staff link, the page returns to it when the server stops answering
 * plain requests for about 30 s (the tunnel address may have changed). A dropped WebSocket alone is not enough:
 * on a slow WiFi it drops while the server still answers.
 */
export function Koneksi(props: { online: boolean }) {
  useEffect(() => {
    if (props.online) return;
    const k = window.sessionStorage.getItem(KUNCI);
    if (!k) return;
    let gagal = 0;
    const cek = async () => {
      const hidup = await fetch('/api/menu', { cache: 'no-store', signal: AbortSignal.timeout(10_000) }).then((r) => r.ok, () => false);
      gagal = hidup ? 0 : gagal + 1;
      if (gagal >= 2) window.location.replace(k);
    };
    const t = window.setInterval(() => void cek(), 15_000);
    return () => clearInterval(t);
  }, [props.online]);
  return props.online ? null : <div className="terputus">● Terputus</div>;
}
