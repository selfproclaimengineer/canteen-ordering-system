import type { Peran } from '../../../shared/types';

export type Mode = 'order' | 'dapur' | 'edit' | 'laporan';

const ls = () => window.localStorage;

export const sesi = {
  mode: (): Mode => (ls().getItem('mode') as Mode | null) ?? 'order',
  setMode: (m: Mode) => ls().setItem('mode', m),
  token: () => ls().getItem('token'),
  peran: () => ls().getItem('peran') as Peran | null,
  setToken: (token: string, peran: Peran) => {
    ls().setItem('token', token);
    ls().setItem('peran', peran);
  },
  hapusToken: () => {
    ls().removeItem('token');
    ls().removeItem('peran');
  },
  device: () => {
    let d = ls().getItem('device');
    if (!d) {
      d = `HP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      ls().setItem('device', d);
    }
    return d;
  },
};
