import http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { pasangWs } from './ws';

test('broadcasts events to connected clients as JSON', async () => {
  const server = http.createServer();
  const ws = pasangWs(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((r) => client.once('open', r));
  const pesan = new Promise<string>((r) => client.once('message', (d) => r(d.toString())));

  ws.emit({ type: 'orders-changed' });
  expect(JSON.parse(await pesan)).toEqual({ type: 'orders-changed' });

  client.close();
  ws.tutup();
  await new Promise((r) => server.close(r));
});

test('rejects WebSocket upgrades that come through Funnel (Review Focus 3)', async () => {
  const server = http.createServer();
  const ws = pasangWs(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { 'Tailscale-Funnel-Request': '?1' } });
  const status = await new Promise<number>((r) => client.once('unexpected-response', (_req, res) => r(res.statusCode ?? 0)));
  expect(status).toBe(401);
  client.on('error', () => {}); // terminate() on a refused handshake emits an error
  client.terminate();

  ws.tutup();
  await new Promise((r) => server.close(r));
});
