export type ServerEvent =
  | { type: 'orders-changed' }
  | { type: 'menu-changed' }
  | { type: 'siap-changed' }
  | { type: 'pin-alert'; device: string };

export type Emit = (event: ServerEvent) => void;
