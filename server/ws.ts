import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { Emit } from './events';
import { lewatFunnel } from './qr';

export function pasangWs(server: Server, publik: (req: IncomingMessage) => boolean = lewatFunnel): { emit: Emit; tutup(): void } {
  // Kitchen events (incl. PIN alerts) must never reach the internet.
  const wss = new WebSocketServer({ server, path: '/ws', verifyClient: (info: { req: IncomingMessage }) => !publik(info.req) });
  const hidup = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    hidup.set(ws, true);
    ws.on('pong', () => hidup.set(ws, true));
  });

  // Phones on a flaky hotspot vanish without closing; ping to find them.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!hidup.get(ws)) {
        ws.terminate();
        continue;
      }
      hidup.set(ws, false);
      ws.ping();
    }
  }, 15_000);

  return {
    emit: (event) => {
      const data = JSON.stringify(event);
      for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    tutup: () => {
      clearInterval(timer);
      wss.close();
    },
  };
}
