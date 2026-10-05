export function Koneksi(props: { online: boolean }) {
  return props.online ? null : <div className="terputus">● Terputus</div>;
}
