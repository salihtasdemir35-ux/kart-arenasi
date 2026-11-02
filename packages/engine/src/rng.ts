import type { Rng } from './types';

/** Testler için tekrarlanabilir rastgelelik (mulberry32). Oyunda KULLANILMAZ. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (n) => Math.floor(next() * n) };
}

/** Tarayıcı / Android WebView için kriptografik güvenli kaynak (reddetmeli örnekleme, sapmasız). */
export function cryptoRng(): Rng {
  const c: Crypto = (globalThis as any).crypto;
  return {
    int(n: number) {
      if (n <= 0) throw new Error('n > 0 olmalı');
      const limit = Math.floor(0x100000000 / n) * n;
      const buf = new Uint32Array(1);
      for (;;) {
        c.getRandomValues(buf);
        if (buf[0] < limit) return buf[0] % n;
      }
    },
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
