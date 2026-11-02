import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KartSocket } from './kartsocket';
import { isNative, prefs } from './platform';

export interface PublicUser { id: string; username: string; avatar: string; guest: boolean }
export interface RoomInfo {
  code: string; gameId: string; engineId: string; options: Record<string, unknown>; hostId: string; hasPassword: boolean;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned'; botOnLeave: boolean; clockMinutes: number; clock: { ms: number[]; seat: number | null } | null; allowSpectators: boolean; turnSeconds: number; turnDeadline: number | null;
  seats: { userId: string | null; name: string; avatar: string; bot: boolean; takenOver: boolean; difficulty: string; ready: boolean; connected: boolean }[];
  spectators: string[]; chat: { from: string; name: string; text: string; at: number }[];
  result: { winners: number[]; scores: number[]; summary: string } | null; quick: string[];
}
export interface Invite { from: PublicUser; code: string; gameName: string }
type Status = 'yok' | 'bağlanıyor' | 'bağlı' | 'koptu' | 'hata';

/** Cloudflare Workers'taki ücretsiz Kart Arenası sunucusu (Ayarlar'dan değiştirilebilir). */
export const DEFAULT_SERVER_URL = 'https://kart-arenasi.salihtasdemir35.workers.dev';

/** Sunucu adresi: ayarlardan, derleme değişkeninden, (tarayıcıda) sitenin kendisinden ya da varsayılan sunucudan. */
export function defaultServerUrl(): string {
  const saved = prefs.get<string>('serverUrl', '');
  if (saved) return saved;
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (!isNative() && /^https?:/.test(location.protocol) && location.port !== '5173') return location.origin;
  if (!isNative() && location.port === '5173') return location.origin; // geliştirme: vite proxy
  return DEFAULT_SERVER_URL;
}

export const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, '');

interface Ctx {
  serverUrl: string;
  setServerUrl(u: string): void;
  status: Status;
  error: string | null;
  user: PublicUser | null;
  room: RoomInfo | null;
  game: { seat: number | null; view: any } | null;
  invites: Invite[];
  dismissInvite(code: string): void;
  login(mode: 'login' | 'register' | 'guest', username?: string, password?: string): Promise<void>;
  logout(): void;
  call<T = any>(ev: string, payload?: unknown): Promise<T>;
  friendsVersion: number;
  clearRoom(): void;
}

const OnlineContext = createContext<Ctx | null>(null);
export const useOnline = () => useContext(OnlineContext)!;

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setUrlState] = useState(defaultServerUrl);
  const [session, setSession] = useState<{ token: string; user: PublicUser } | null>(() => prefs.get('session:' + defaultServerUrl(), null));
  const [status, setStatus] = useState<Status>('yok');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [game, setGame] = useState<{ seat: number | null; view: any } | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [friendsVersion, setFV] = useState(0);
  const sockRef = useRef<KartSocket | null>(null);

  const setServerUrl = useCallback((u: string) => {
    const n = normalizeUrl(u);
    prefs.set('serverUrl', n);
    setUrlState(n);
    setSession(prefs.get('session:' + n, null));
  }, []);

  useEffect(() => {
    sockRef.current?.close();
    sockRef.current = null;
    setRoom(null);
    setGame(null);
    if (!serverUrl || !session) { setStatus('yok'); return; }
    setStatus('bağlanıyor');
    const s = new KartSocket(serverUrl, session.token);
    sockRef.current = s;
    s.on('connect', () => {
      setStatus('bağlı');
      setError(null);
      s.emit('room:sync', {}, (r: any) => { if (r?.ok && !r.code) { setRoom(null); setGame(null); } });
    });
    s.on('disconnect', () => setStatus('koptu'));
    s.on('connect_error', (e: Error) => {
      setStatus('hata');
      setError(e.message === 'Oturum geçersiz' ? 'Oturumunuzun süresi doldu, tekrar giriş yapın.' : `Sunucuya ulaşılamıyor (${serverUrl}).`);
      if (e.message === 'Oturum geçersiz') { prefs.set('session:' + serverUrl, null); setSession(null); }
    });
    s.on('room:update', (r: RoomInfo) => setRoom(r));
    s.on('game:state', (m: { seat: number | null; view: any }) => setGame({ seat: m.seat, view: m.view }));
    s.on('invite', (inv: Invite) => setInvites((xs) => [inv, ...xs.filter((x) => x.code !== inv.code)].slice(0, 5)));
    s.on('friends:changed', () => setFV((v) => v + 1));
    return () => { s.close(); };
  }, [serverUrl, session]);

  const login = useCallback(async (mode: 'login' | 'register' | 'guest', username?: string, password?: string) => {
    if (!serverUrl) throw new Error('Önce sunucu adresini girin');
    let res: Response;
    try {
      res = await fetch(serverUrl + '/api/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    } catch {
      throw new Error('Sunucuya ulaşılamıyor. Adresi ve internet bağlantınızı kontrol edin.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Giriş yapılamadı');
    prefs.set('session:' + serverUrl, body);
    setSession(body);
  }, [serverUrl]);

  const logout = useCallback(() => {
    prefs.set('session:' + serverUrl, null);
    setSession(null);
  }, [serverUrl]);

  const call = useCallback(<T,>(ev: string, payload: unknown = {}) => new Promise<T>((resolve, reject) => {
    const s = sockRef.current;
    if (!s || !s.connected) return reject(new Error('Sunucuya bağlı değilsiniz'));
    const t = setTimeout(() => reject(new Error('Sunucu yanıt vermedi')), 8000);
    s.emit(ev, payload, (r: any) => {
      clearTimeout(t);
      if (r?.ok) resolve(r as T);
      else reject(new Error(r?.error ?? 'İşlem başarısız'));
    });
  }), []);

  useEffect(() => { if (!room) setGame(null); }, [room]);

  const value = useMemo<Ctx>(() => ({
    serverUrl, setServerUrl, status, error, user: session?.user ?? null, room, game, invites,
    dismissInvite: (code) => setInvites((xs) => xs.filter((x) => x.code !== code)),
    login, logout, call: call as Ctx['call'], friendsVersion, clearRoom: () => { setRoom(null); setGame(null); },
  }), [serverUrl, setServerUrl, status, error, session, room, game, invites, login, logout, call, friendsVersion]);

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

/** Bir masa için paylaşılabilir bağlantı. */
export function shareLink(serverUrl: string, code: string) {
  return `${serverUrl}/?masa=${code}`;
}
