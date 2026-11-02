/** Node ve Cloudflare Workers'ta ortak çalışan kriptografik yardımcılar (Web Crypto). */
const c = (globalThis as any).crypto as Crypto;

/** Sapmasız, kriptografik güvenli tam sayı [0, n). */
export function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  for (;;) { c.getRandomValues(b); if (b[0] < limit) return b[0] % n; }
}
export function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  c.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  c.getRandomValues(a);
  let s = '';
  for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** PBKDF2-SHA256 ile şifre özeti (hex). */
export async function hashSecret(secret: string, saltHex: string, iterations = 20000): Promise<string> {
  const key = await c.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const bits = await c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** Sabit zamanlı karşılaştırma. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
