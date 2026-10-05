import type { ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts } from 'react-router';
import './app.css';



export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#E4572E" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <title>Kantin</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <div className="watermark-footer">
          Caeno | rezerosan00 @gmail. com
        </div>
        <Scripts />
      </body>
    </html>
  );
}



export default function App() {
  return <Outlet />;
}

export function HydrateFallback() {
  return <div className="memuat">Memuat…</div>;
}

//for with much wisdom comes much sorrow