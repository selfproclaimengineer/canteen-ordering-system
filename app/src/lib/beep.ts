let ctx: AudioContext | null = null;

export function beep(freq = 880, ms = 150, kali = 1): void {
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    // Created by a WebSocket event after a reload, the context starts suspended.
    if (c.state === 'suspended') void c.resume();
    for (let i = 0; i < kali; i++) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(c.destination);
      const mulai = c.currentTime + (i * 2 * ms) / 1000;
      osc.start(mulai);
      osc.stop(mulai + ms / 1000);
    }
  } catch {
    // No audio on this device.
  }
}

/** Chrome only unlocks audio after a tap; call once on screens that beep from events. */
export function siapkanAudio(): void {
  const buka = () => {
    ctx ??= new AudioContext();
    void ctx.resume();
  };
  window.addEventListener('pointerdown', buka, { once: true });
}

/** Loud warning for 5 wrong PINs, about 6 s. */
export const alarm = () => beep(1200, 250, 12);

export type JenisSuara = 'masuk' | 'jadi';

/** Version of the admin's uploaded sound per slot; null means the built-in beep. */
const versi: Record<JenisSuara, number | null> = { masuk: null, jadi: null };
const cache: Partial<Record<JenisSuara, { v: number; b: AudioBuffer }>> = {};

/** Call on screens that ring, and again after a menu-changed event (the admin may have changed a sound). */
export async function muatSuara(): Promise<void> {
  try {
    const r = await fetch('/api/suara');
    if (r.ok) Object.assign(versi, await r.json());
  } catch {
    // Offline: keep the last known sounds.
  }
}

/** Plays the uploaded sound for this slot, or `cadangan` (a beep) when none is set or it cannot play. */
export async function bunyikan(jenis: JenisSuara, cadangan: () => void): Promise<void> {
  const v = versi[jenis];
  if (v === null) return cadangan();
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    if (c.state === 'suspended') void c.resume();
    let b = cache[jenis]?.v === v ? cache[jenis]!.b : null;
    if (!b) {
      const r = await fetch(`/api/suara/${jenis}?v=${v}`);
      if (!r.ok) throw new Error('suara');
      b = await c.decodeAudioData(await r.arrayBuffer());
      cache[jenis] = { v, b };
    }
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(c.destination);
    src.start();
  } catch {
    cadangan();
  }
}
