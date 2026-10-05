import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/index.tsx'),
  route('order', 'routes/order.tsx'),
  route('dapur', 'routes/dapur.tsx'),
  route('edit', 'routes/edit.tsx'),
  route('laporan', 'routes/laporan.tsx'),
  route('pesan/:kode', 'routes/pesan.tsx'),
] satisfies RouteConfig;
