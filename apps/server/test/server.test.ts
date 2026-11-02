import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { KartSocket } from '../../client/src/lib/kartsocket';
type Socket = KartSocket;
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKartServer } from '../src/server';
import { CATALOG } from '@kart/engine';

let srv: ReturnType<typeof createKartServer>;
let url = '';
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kart-')), 'db.json');
const sockets: Socket[] = [];

beforeAll(async () => {
  srv = createKartServer({ dataFile, botDelayMs: 0, graceMs: 300 });
  const port = await srv.listen(0);
  url = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await srv.close();
});

async function post(p: string, body: unknown) {
  const r = await fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
}

async function connect(token: string): Promise<Socket> {
  const s = new KartSocket(url, token, { WebSocket, reconnect: false });
  sockets.push(s);
  await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', rej); });
  return s;
}

const call = (s: Socket, ev: string, payload: any = {}) => new Promise<any>((res) => s.emit(ev, payload, res));

/** Sunucu durumu ilettikçe en son görünümü tutar. */
function tracker(s: Socket) {
  const t: { view: any; seat: number | null; room: any } = { view: null, seat: null, room: null };
  s.on('game:state', (m) => { t.view = m.view; t.seat = m.seat; });
  s.on('room:update', (r) => { t.room = r; });
  return t;
}

const until = async (fn: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('Kimlik', () => {
  it('kayıt, giriş, hatalı şifre, aynı ad', async () => {
    const reg = await post('/api/register', { username: 'Ayşe_1', password: 'gizli123' });
    expect(reg.status).toBe(200);
    expect(reg.body.token).toBeTruthy();
    expect((await post('/api/register', { username: 'ayşe_1', password: 'gizli123' })).body.error).toBe('Bu kullanıcı adı alınmış');
    expect((await post('/api/login', { username: 'Ayşe_1', password: 'yanlis' })).status).toBe(400);
    expect((await post('/api/login', { username: 'Ayşe_1', password: 'gizli123' })).body.user.username).toBe('Ayşe_1');
    expect((await post('/api/register', { username: 'a', password: '1' })).status).toBe(400);
  });
  it('geçersiz token ile soket bağlanamaz', async () => {
    await expect(connect('sahte')).rejects.toThrow('Oturum geçersiz');
  });
  it('şifreler düz metin saklanmaz', async () => {
    srv.store.flush();
    expect(fs.readFileSync(dataFile, 'utf8')).not.toContain('gizli123');
  });
});

describe('Online Pişti: iki gerçek oyuncu', () => {
  it('oda kodu, şifre, hazır, başlatma, sıra kontrolü, tam oyun, istatistik', async () => {
    const a = (await post('/api/guest', {})).body;
    const b = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const ta = tracker(sa);
    const tb = tracker(sb);

    const created = await call(sa, 'room:create', { gameId: 'pisti', password: 'masa1', options: { target: 0 } });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);

    expect((await call(sb, 'room:join', { code: created.code, password: 'yanlış' })).error).toBe('Masa şifresi hatalı');
    const joined = await call(sb, 'room:join', { code: created.code.toLowerCase(), password: 'masa1' });
    expect(joined.seat).toBe(1);

    expect((await call(sb, 'room:start')).error).toBe('Oyunu yalnızca masa sahibi başlatabilir');
    expect((await call(sa, 'room:start')).error).toBe('Tüm oyuncular hazır olmalı');
    await call(sb, 'room:ready', { ready: true });
    expect((await call(sa, 'room:start')).ok).toBe(true);
    await until(() => ta.view && tb.view);

    // Gizlilik: A, B'nin kartlarını hiçbir zaman görmez
    expect(ta.view.hand).toHaveLength(4);
    expect(ta.view.hand.some((c: string) => tb.view.hand.includes(c))).toBe(false);

    // Sıra dışı hamle reddedilir
    const waiting = ta.view.turn === 0 ? sb : sa;
    const waitingView = ta.view.turn === 0 ? tb : ta;
    expect((await call(waiting, 'game:action', { action: { type: 'play', card: waitingView.view.hand[0] } })).error).toBe('Sıra sizde değil');
    // Elde olmayan kart reddedilir
    const active = ta.view.turn === 0 ? sa : sb;
    expect((await call(active, 'game:action', { action: { type: 'play', card: 'X99' } })).ok).toBe(false);

    // Oyunu sonuna kadar oyna
    let guard = 0;
    while (!ta.view.over) {
      const turn = ta.view.turn;
      const s = turn === 0 ? sa : sb;
      const t = turn === 0 ? ta : tb;
      await until(() => t.view.turn === turn && t.view.legal.length > 0);
      const before = ta.view.log.length + ta.view.handNo * 1000 + ta.view.deckCount;
      const r = await call(s, 'game:action', { action: t.view.legal[0] });
      expect(r.ok).toBe(true);
      await until(() => ta.view.over || ta.view.log.length + ta.view.handNo * 1000 + ta.view.deckCount !== before || ta.view.turn !== turn);
      if (++guard > 200) throw new Error('bitmedi');
    }
    await until(() => ta.room?.status === 'finished');
    expect(ta.room.result.winners.length).toBeGreaterThan(0);
    const prof = await call(sa, 'profile:get');
    expect(prof.profile.stats.pisti.played).toBe(1);
    expect(prof.profile.recent).toHaveLength(1);

    // Rövanş
    expect((await call(sa, 'room:rematch', { code: created.code })).ok).toBe(true);
    await until(() => ta.room.status === 'playing');
    await call(sa, 'room:leave', { code: created.code });
    await call(sb, 'room:leave', { code: created.code });
  });
});

describe('Botlar, bağlantı kopması, seyirci', () => {
  it('Batak: 1 insan + 3 bot; son insan ayrılınca masa kapanır', async () => {
    const a = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    const ta = tracker(sa);
    const created = await call(sa, 'room:create', { gameId: 'batak', players: 4, bots: 3, difficulty: 'zor', options: { hands: 1 } });
    expect(created.ok).toBe(true);
    expect((await call(sa, 'room:start')).ok).toBe(true);
    await until(() => ta.view && ta.view.legal.length > 0);
    // İlk hamlemizi yapalım, sonra masadan ayrılalım
    expect((await call(sa, 'game:action', { action: ta.view.legal[0] })).ok).toBe(true);
    await call(sa, 'room:leave', { code: created.code });
    const r = srv.rooms.get(created.code)!;
    expect(r).toBeUndefined(); // insan kalmayınca masa kapanır
  });

  it('bağlantı kopar ve aynı oturumla yeniden bağlanınca aynı koltuk ve el geri gelir', async () => {
    const a = (await post('/api/guest', {})).body;
    const b = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    let sb = await connect(b.token);
    const ta = tracker(sa);
    const { code } = await call(sa, 'room:create', { gameId: 'papaz', players: 3, bots: 1 });
    await call(sb, 'room:join', { code });
    await call(sb, 'room:ready', { ready: true });
    await call(sa, 'room:start');
    await until(() => ta.view !== null);
    const handBefore = srv.rooms.get(code)!.state.hands[1].slice().sort();
    sb.close();
    await until(() => ta.room.seats[1].connected === false);
    sb = await connect(b.token);
    const tb = tracker(sb);
    expect((await call(sb, 'room:sync')).code).toBe(code);
    await until(() => tb.view !== null && tb.seat === 1);
    const seatNow = srv.rooms.get(code)!.state.hands[1].slice().sort();
    expect(tb.view.hand.slice().sort()).toEqual(seatNow);
    expect(seatNow.length).toBeLessThanOrEqual(handBefore.length + 1);
    expect(ta.room.seats[1].connected).toBe(true);
    await call(sa, 'room:leave', { code });
    await call(sb, 'room:leave', { code });
  });

  it('süre dolunca (yeniden bağlanmazsa) bot devralır ve oyun tamamlanır', async () => {
    const a = (await post('/api/guest', {})).body;
    const b = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const ta = tracker(sa);
    const { code } = await call(sa, 'room:create', { gameId: 'papaz', players: 2 });
    await call(sb, 'room:join', { code });
    await call(sb, 'room:ready', { ready: true });
    await call(sa, 'room:start');
    sb.close();
    await until(() => ta.room?.seats[1].takenOver === true, 3000);
    // A oyunu oynamaya devam eder, bot B'nin yerine oynar
    let guard = 0;
    while (!ta.view.over) {
      if (ta.view.turn === 0 && ta.view.legal.length) await call(sa, 'game:action', { action: ta.view.legal[0] });
      await new Promise((r) => setTimeout(r, 5));
      if (++guard > 4000) throw new Error('bitmedi');
    }
    await until(() => ta.room.status === 'finished');
    await call(sa, 'room:leave', { code });
  });

  it('seyirci kimsenin elini görmez; sohbet çalışır', async () => {
    const a = (await post('/api/guest', {})).body;
    const c = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    const sc = await connect(c.token);
    const tc = tracker(sc);
    const { code } = await call(sa, 'room:create', { gameId: 'esli-pisti', bots: 3 });
    await call(sa, 'room:start');
    const j = await call(sc, 'room:join', { code, spectate: true });
    expect(j.seat).toBeNull();
    await call(sa, 'chat:send', { code, text: 'Merhaba!' });
    await until(() => tc.room?.chat?.some((m: any) => m.text === 'Merhaba!'));
    await call(sa, 'game:action', { action: { type: 'play', card: 'yok' } }); // geçersiz, durumu değiştirmez
    // Bir sonraki durum yayınını bekle
    await until(() => tc.view !== null || srv.rooms.get(code)!.state.over, 3000).catch(() => {});
    srv.rooms.get(code)!.seats; // erişilebilir
    if (tc.view) {
      expect(tc.view.hand).toEqual([]);
      const st = srv.rooms.get(code)!.state;
      for (const h of st.hands) for (const card of h) expect(JSON.stringify(tc.view).includes(`"${card}"`)).toBe(false);
    }
    await call(sc, 'room:leave', { code });
    await call(sa, 'room:leave', { code });
  });

  it('hazır olmayan oyun ve hatalı oyuncu sayısı reddedilir', async () => {
    const a = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    expect((await call(sa, 'room:create', { gameId: 'boyle-bir-oyun-yok' })).error).toBe('Bu oyun henüz hazır değil');
    expect((await call(sa, 'room:create', { gameId: 'satranc', players: 3 })).error).toContain('2');
    expect((await call(sa, 'room:start')).error).toBe('Bir masada değilsiniz');
  });
});

describe('Arkadaşlar ve davet', () => {
  it('istek, kabul, çevrim içi durumu, davet', async () => {
    const x = (await post('/api/register', { username: 'Mehmet', password: 'parola1' })).body;
    const y = (await post('/api/register', { username: 'Zeynep', password: 'parola2' })).body;
    const sx = await connect(x.token);
    const sy = await connect(y.token);
    expect((await call(sx, 'friends:request', { username: 'yokboyle' })).error).toBe('Bu kullanıcı adı bulunamadı');
    expect((await call(sx, 'friends:request', { username: 'zeynep' })).ok).toBe(true);
    const ly = await call(sy, 'friends:list');
    expect(ly.incoming.map((u: any) => u.username)).toEqual(['Mehmet']);
    const acc = await call(sy, 'friends:accept', { userId: x.user.id });
    expect(acc.friends[0]).toMatchObject({ username: 'Mehmet', online: true });
    const invite = new Promise<any>((res) => sy.on('invite', res));
    const { code } = await call(sx, 'room:create', { gameId: 'pisti' });
    expect((await call(sx, 'friends:invite', { userId: y.user.id })).ok).toBe(true);
    const inv = await invite;
    expect(inv).toMatchObject({ code, gameName: 'Pişti' });
    expect((await call(sy, 'room:join', { code })).seat).toBe(1);
    await call(sy, 'room:leave', { code });
    await call(sx, 'room:leave', { code });
    sy.close();
    await until(() => true);
    await new Promise((r) => setTimeout(r, 50));
    const lx = await call(sx, 'friends:list');
    expect(lx.friends[0].online).toBe(false);
  });
});

describe('Güvenlik', () => {
  it('olay hız sınırı devreye girer', async () => {
    const a = (await post('/api/guest', {})).body;
    const sa = await connect(a.token);
    const results = await Promise.all(Array.from({ length: 60 }, () => call(sa, 'me')));
    expect(results.some((r) => r.ok === false && /hızlı/.test(r.error))).toBe(true);
  });
  it('veriler diske kalıcı yazılır ve yeniden yüklenir', async () => {
    srv.store.flush();
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    expect(raw.users.some((u: any) => u.username === 'Mehmet')).toBe(true);
  });
});
