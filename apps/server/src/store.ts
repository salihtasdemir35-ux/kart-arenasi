import { randomInt, randomHex, randomToken, hashSecret, safeEqual } from './portable';

/** Verinin nereye kaydedileceği: Node'da dosya, Cloudflare'de Durable Object deposu. */
export interface Persister { load(): any | null; save(data: any): void; flush?(data: any): void }

export interface MatchRecord { gameId: string; won: boolean; at: number; summary: string }

export interface User {
  id: string;
  username: string;
  guest: boolean;
  avatar: string;
  salt?: string;
  passHash?: string;
  createdAt: number;
  friends: string[];
  incoming: string[];
  stats: Record<string, { played: number; won: number }>;
  recent: MatchRecord[];
}

export interface PublicUser { id: string; username: string; avatar: string; guest: boolean }

export const AVATARS = ['🦊', '🐻', '🦉', '🐢', '🦁', '🐺', '🐙', '🦅', '🐝', '🐬', '🦄', '🐯'];
const NAME_RE = /^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$/;

/**
 * Basit, kalıcı JSON deposu. Tüm erişim bu sınıftan geçer; ileride PostgreSQL
 * bağdaştırıcısı aynı arayüzle değiştirilebilir.
 */
export class Store {
  users = new Map<string, User>();
  sessions = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private persister: Persister | null) {
    const data = persister?.load();
    if (data) {
      for (const u of data.users ?? []) this.users.set(u.id, u);
      for (const [t, id] of Object.entries<string>(data.sessions ?? {})) this.sessions.set(t, id);
    }
  }

  private snapshot() { return { users: [...this.users.values()], sessions: Object.fromEntries(this.sessions) }; }

  save() {
    if (!this.persister || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.persister!.save(this.snapshot()); }, 300);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.persister) return;
    (this.persister.flush ?? this.persister.save)(this.snapshot());
  }

  byName(name: string): User | undefined {
    const n = name.toLocaleLowerCase('tr');
    for (const u of this.users.values()) if (u.username.toLocaleLowerCase('tr') === n) return u;
  }

  private newUser(username: string, guest: boolean): User {
    const u: User = {
      id: randomHex(8), username, guest, avatar: AVATARS[randomInt(AVATARS.length)],
      createdAt: Date.now(), friends: [], incoming: [], stats: {}, recent: [],
    };
    this.users.set(u.id, u);
    return u;
  }

  private session(u: User) {
    const token = randomToken(24);
    this.sessions.set(token, u.id);
    this.save();
    return { token, user: publicUser(u) };
  }

  async register(username: string, password: string) {
    username = String(username ?? '').trim();
    if (!NAME_RE.test(username)) throw new Error('Kullanıcı adı 3–20 karakter olmalı (harf, rakam, _ . -)');
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) throw new Error('Şifre en az 6 karakter olmalı');
    if (this.byName(username)) throw new Error('Bu kullanıcı adı alınmış');
    const salt = randomHex(16);
    const hash = await hashSecret(password, salt);
    // Özet hesaplanırken aynı adla başka kayıt yapılmış olabilir
    if (this.byName(username)) throw new Error('Bu kullanıcı adı alınmış');
    const u = this.newUser(username, false);
    u.salt = salt;
    u.passHash = hash;
    return this.session(u);
  }

  async login(username: string, password: string) {
    const u = this.byName(String(username ?? '').trim());
    if (!u || u.guest || !u.salt || !u.passHash) throw new Error('Kullanıcı adı veya şifre hatalı');
    const h = await hashSecret(String(password ?? ''), u.salt);
    if (!safeEqual(h, u.passHash)) throw new Error('Kullanıcı adı veya şifre hatalı');
    return this.session(u);
  }

  guest() {
    let name = '';
    do name = 'Misafir' + (1000 + randomInt(99000)); while (this.byName(name));
    return this.session(this.newUser(name, true));
  }

  userByToken(token: unknown): User | undefined {
    if (typeof token !== 'string') return;
    const id = this.sessions.get(token);
    return id ? this.users.get(id) : undefined;
  }

  recordMatch(userId: string, gameId: string, won: boolean, summary: string) {
    const u = this.users.get(userId);
    if (!u) return;
    const st = (u.stats[gameId] ??= { played: 0, won: 0 });
    st.played += 1;
    if (won) st.won += 1;
    u.recent.unshift({ gameId, won, at: Date.now(), summary });
    u.recent = u.recent.slice(0, 20);
    this.save();
  }
}

export const publicUser = (u: User): PublicUser => ({ id: u.id, username: u.username, avatar: u.avatar, guest: u.guest });

export function profileOf(u: User) {
  const played = Object.values(u.stats).reduce((t, s) => t + s.played, 0);
  const won = Object.values(u.stats).reduce((t, s) => t + s.won, 0);
  const fav = Object.entries(u.stats).sort((a, b) => b[1].played - a[1].played)[0]?.[0] ?? null;
  const xp = played * 10 + won * 25;
  const level = 1 + Math.floor(Math.sqrt(xp / 50));
  const badges: string[] = [];
  if (played >= 1) badges.push('İlk maç');
  if (won >= 1) badges.push('İlk galibiyet');
  if (won >= 10) badges.push('10 galibiyet');
  if (played >= 50) badges.push('Masanın demirbaşı');
  if (Object.keys(u.stats).length >= 3) badges.push('Çok yönlü');
  const league = level >= 10 ? 'Altın' : level >= 5 ? 'Gümüş' : 'Bronz';
  return {
    ...publicUser(u), createdAt: u.createdAt, stats: u.stats, recent: u.recent, played, won,
    winRate: played ? Math.round((won / played) * 100) : 0, favorite: fav, level, league, badges, friendCount: u.friends.length,
  };
}
