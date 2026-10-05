/**
 * RFC 4122 v4 UUID from getRandomValues.
 * crypto.randomUUID only exists in secure contexts; the phones use plain http on the hotspot.
 */
export function uuidV4(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
