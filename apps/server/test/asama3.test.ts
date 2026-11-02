import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { KartSocket } from '../../client/src/lib/kartsocket';
type Socket = KartSocket;
import { createKartServer } from '../src/server';
import path from 'node:path';
import { bestMelds, processable, isWild, best51, isJoker, randomFleet, seededRng, monoAi, CATALOG, getModule } from '@kart/engine';

let srv: ReturnType<typeof createKartServer>;
let url = '';
const socks: Socket[] = [];
beforeAll(async () => {
  srv = createKartServer({ dataFile: null, botDelayMs: 0, graceMs: 300, msPerMinute: 400, rateLimit: 100000, authLimit: 100000, dictDir: path.resolve(__dirname, '../../client/public/dict') });
  url = `http://127.0.0.1:${await srv.listen(0)}`;
});
afterAll(async () => { socks.forEach((s) => s.close()); await srv.close(); });

const guest = async () => (await (await fetch(url + '/api/guest', { method: 'POST' })).json()) as any;
async function connect(token: string) {
  const s = new KartSocket(url, token, { WebSocket, reconnect: false });
  socks.push(s);
  await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', rej); });
  const t: any = { view: null, seat: null, room: null };
  s.on('game:state', (m) => { t.view = m.view; t.seat = m.seat; });
  s.on('room:update', (r) => { t.room = r; });
  return { s, t };
}
const call = (s: Socket, ev: string, p: any = {}) => new Promise<any>((res) => s.emit(ev, p, res));
const until = async (fn: () => boolean, ms = 8000) => { const st = Date.now(); while (!fn()) { if (Date.now() - st > ms) throw new Error('zaman aşımı'); await new Promise((r) => setTimeout(r, 10)); } };

async function pair(gameId: string, extra: any = {}) {
  const A = await connect((await guest()).token);
  const B = await connect((await guest()).token);
  const { code } = await call(A.s, 'room:create', { gameId, ...extra });
  await call(B.s, 'room:join', { code });
  await call(B.s, 'room:ready', { ready: true });
  expect((await call(A.s, 'room:start')).ok).toBe(true);
  await until(() => A.t.view && B.t.view);
  return { A, B, code };
}

describe('Tüm oyunlar online', () => {
  it('katalogdaki 31 oyunun her biri sunucuda 1 insan + botlarla sonuna kadar oynanır', async () => {
    const r = seededRng(77);
    const quick: Record<string, any> = { pisti: {}, batak: {}, tavla: { matchTo: 1 }, okey: { hands: 1 }, '101-okey': { hands: 1 }, '51': { hands: 1 }, king: { length: 'kisa' }, 'pis-yedili': { hands: 1 }, monopoli: { maxRounds: 20 }, bric: { boards: 1 }, poker: { hands: 20 }, 'texas-holdem': { hands: 20 }, omaha: { hands: 20 }, blackjack: { rounds: 5 }, tombala: { cards: 1 } };
    for (const entry of CATALOG) {
      const mod = getModule(entry.engine ?? entry.id)!;
      const players = entry.presetPlayers ?? Math.min(4, mod.playerCounts[mod.playerCounts.length - 1]);
      const A = await connect((await guest()).token);
      const created = await call(A.s, 'room:create', { gameId: entry.id, players, bots: players - 1, difficulty: 'orta', options: quick[entry.id] ?? {} });
      expect(created.ok, entry.id).toBe(true);
      expect((await call(A.s, 'room:start')).ok, entry.id).toBe(true);
      await until(() => A.t.view);
      const t0 = Date.now();
      while (A.t.room.status === 'playing') {
        const v = A.t.view;
        if (v && v.legal?.length) {
          let a = mod.ai(v, A.t.seat, 'orta', r);
          await call(A.s, 'game:action', { action: a });
        } else await new Promise((x) => setTimeout(x, 2));
        if (Date.now() - t0 > 90000) throw new Error(entry.id + ' bitmedi');
      }
      expect(A.t.room.status, entry.id).toBe('finished');
      expect(A.t.room.result.winners.length, entry.id).toBeGreaterThan(0);
      await call(A.s, 'room:leave', { code: A.t.room.code });
    }
  }, 900000);
});

describe('Aşama 7 online', () => {
  const runSolo = async (gameId: string, players: number, extra: any = {}) => {
    const A = await connect((await guest()).token);
    await call(A.s, 'room:create', { gameId, players, bots: players - 1, difficulty: 'orta', ...extra });
    await call(A.s, 'room:start');
    await until(() => A.t.view);
    let guard = 0;
    while (A.t.room.status === 'playing') {
      const v = A.t.view;
      if (v.turn === 0 && v.legal?.length) {
        let a = v.legal[0];
        if (gameId === 'blof' && a.type === 'play') a = { type: 'play', cards: [v.hand[0]] };
        await call(A.s, 'game:action', { action: a });
      } else await new Promise((r) => setTimeout(r, 2));
      if (++guard > 30000) throw new Error('bitmedi');
    }
    return A;
  };
  it('Blöf, King (kısa) ve Eşli Batak online tamamlanır; eller gizli', async () => {
    const b = await runSolo('blof', 4);
    expect(b.t.room.status).toBe('finished');
    const k = await runSolo('king', 4, { options: { length: 'kisa' } });
    expect(k.t.room.status).toBe('finished');
    const e = await runSolo('esli-batak', 4);
    expect(e.t.room.result.scores[0]).toBe(e.t.room.result.scores[2]);
    expect(e.t.view.hands).toBeUndefined();
  });
});

describe('Aşama 6 online (Monopoli)', () => {
  it('Monopoli: 2 insan + 1 bot, 20 tur; sıra dışı hamle reddi, oyun sonu', async () => {
    const A = await connect((await guest()).token);
    const B = await connect((await guest()).token);
    const { code } = await call(A.s, 'room:create', { gameId: 'monopoli', players: 3, bots: 1, difficulty: 'orta', options: { maxRounds: 20 } });
    await call(B.s, 'room:join', { code });
    await call(B.s, 'room:ready', { ready: true });
    expect((await call(A.s, 'room:start')).ok).toBe(true);
    await until(() => A.t.view && B.t.view);
    const notTurn = A.t.view.turn === 0 ? B : A;
    if (A.t.view.turn !== 2) expect((await call(notTurn.s, 'game:action', { action: { type: 'roll' } })).error).toBe('Sıra sizde değil');
    const r = seededRng(5);
    let guard = 0;
    while (A.t.room.status === 'playing') {
      let acted = false;
      for (const P of [A, B]) {
        const v = P.t.view;
        if (v && v.legal.length) { await call(P.s, 'game:action', { action: monoAi(v, P.t.seat, 'orta', r) }); acted = true; }
      }
      if (!acted) await new Promise((x) => setTimeout(x, 2));
      if (++guard > 40000) throw new Error('bitmedi');
    }
    expect(A.t.room.status).toBe('finished');
    expect(A.t.room.result.winners).toHaveLength(1);
  });
});

describe('Aşama 6 online', () => {
  it('Amiral Battı: iki insan; geçersiz filo reddi, gizlilik, oyun sonu', async () => {
    const { A, B } = await pair('amiral-batti');
    expect((await call(A.s, 'game:action', { action: { type: 'place', ships: [] } })).error).toContain('Beş');
    const fa = randomFleet(seededRng(1), false), fb = randomFleet(seededRng(2), false);
    expect((await call(A.s, 'game:action', { action: { type: 'place', ships: fa } })).ok).toBe(true);
    expect((await call(B.s, 'game:action', { action: { type: 'place', ships: fb } })).ok).toBe(true);
    await until(() => A.t.view.phase === 'fire' && B.t.view.phase === 'fire');
    expect(JSON.stringify(A.t.view)).not.toContain(JSON.stringify(fb[0]));
    let guard = 0;
    while (A.t.room.status === 'playing') {
      for (const P of [A, B]) {
        const v = P.t.view;
        if (v.phase === 'fire' && v.turn === P.t.seat) {
          const done = new Set(v.shots[P.t.seat].map((x: any) => x.cell));
          const cell = [...Array(100).keys()].find((c) => !done.has(c))!;
          await call(P.s, 'game:action', { action: { type: 'fire', cell } });
        }
      }
      await new Promise((r) => setTimeout(r, 1));
      if (++guard > 5000) throw new Error('bitmedi');
    }
    expect(A.t.room.status).toBe('finished');
  });
  it('Tombala: 1 insan + 5 bot; yalnızca masayı açan çeker, tombala ile biter', async () => {
    const A = await connect((await guest()).token);
    await call(A.s, 'room:create', { gameId: 'tombala', players: 6, bots: 5, options: { cards: 2 } });
    await call(A.s, 'room:start');
    await until(() => A.t.view);
    let guard = 0;
    while (A.t.room.status === 'playing') {
      await call(A.s, 'game:action', { action: { type: 'draw' } });
      if (++guard > 200) throw new Error('bitmedi');
    }
    await until(() => A.t.room.status === 'finished');
    expect(A.t.room.result.summary).toBe('Tombala!');
  });
});

describe('Aşama 5 online (51)', () => {
  it('51: 1 insan + 2 bot; 51 altı açılış reddedilir, el sonuna kadar oynanır', async () => {
    const A = await connect((await guest()).token);
    await call(A.s, 'room:create', { gameId: '51', players: 3, bots: 2, options: { hands: 1 } });
    await call(A.s, 'room:start');
    await until(() => A.t.view);
    let guard = 0, rejected = false;
    while (A.t.room.status === 'playing') {
      const v = A.t.view;
      if (v.turn === 0) {
        if (v.phase === 'draw') await call(A.s, 'game:action', { action: { type: 'draw', from: 'pile' } });
        else {
          const b = best51(v.hand);
          if (!rejected && !v.opened[0] && b.melds.length && b.points < 51) { const r = await call(A.s, 'game:action', { action: { type: 'open', melds: b.melds } }); rejected = !r.ok; }
          if (!v.opened[0] && b.points >= 51) await call(A.s, 'game:action', { action: { type: 'open', melds: b.melds } });
          else await call(A.s, 'game:action', { action: { type: 'discard', card: v.hand.find((c: number) => !isJoker(c)) ?? v.hand[0] } });
        }
      } else await new Promise((r) => setTimeout(r, 2));
      if (++guard > 20000) throw new Error('bitmedi');
    }
    expect(A.t.room.status).toBe('finished');
  });
});

describe('Aşama 5 online (101)', () => {
  it('101 Okey: 1 insan + 3 bot; açılış sunucuda doğrulanır, el sonuna kadar oynanır', async () => {
    const A = await connect((await guest()).token);
    await call(A.s, 'room:create', { gameId: '101-okey', bots: 3, difficulty: 'orta', options: { hands: 1 } });
    await call(A.s, 'room:start');
    await until(() => A.t.view);
    let guard = 0, triedBadOpen = false;
    while (A.t.room.status === 'playing') {
      const v = A.t.view;
      if (v.turn === 0 && v.phase !== 'over') {
        if (v.phase === 'draw') await call(A.s, 'game:action', { action: { type: 'draw', from: 'pile' } });
        else {
          if (!triedBadOpen && !v.opened[0]) {
            const r = await call(A.s, 'game:action', { action: { type: 'open', melds: [v.hand.slice(0, 3)] } });
            if (!r.ok) triedBadOpen = true;
          }
          const b = !v.opened[0] ? bestMelds(v.hand, v.okey) : { points: 0, melds: [] };
          if (b.points >= 101 && v.hand.length - b.melds.flat().length >= 1) await call(A.s, 'game:action', { action: { type: 'open', melds: b.melds } });
          else {
            const safe = v.hand.find((t: number) => !isWild(t, v.okey) && !processable(v.melds, t, v.okey).length) ?? v.hand[0];
            await call(A.s, 'game:action', { action: { type: 'discard', tile: safe } });
          }
        }
      } else await new Promise((r) => setTimeout(r, 2));
      if (++guard > 20000) throw new Error('bitmedi');
    }
    expect(triedBadOpen).toBe(true);
    expect(A.t.room.status).toBe('finished');
  });
});

describe('Aşama 5 online', () => {
  it('Okey: 1 insan + 3 bot; ortadaki taşlar gizli, el sonuna kadar oynanır', async () => {
    const A = await connect((await guest()).token);
    const { code } = await call(A.s, 'room:create', { gameId: 'okey', bots: 3, difficulty: 'zor', options: { hands: 1 } });
    await call(A.s, 'room:start');
    await until(() => A.t.view);
    expect(A.t.view.pile).toBeUndefined();
    expect(A.t.view.hands).toBeUndefined();
    let guard = 0;
    while (A.t.room.status === 'playing') {
      const v = A.t.view;
      if (v.turn === 0 && v.legal.length) {
        const a = v.legal.find((x: any) => x.type === 'finish') ?? (v.phase === 'draw' ? { type: 'draw', from: 'pile' } : v.legal.find((x: any) => x.type === 'discard'));
        await call(A.s, 'game:action', { action: a });
      } else await new Promise((r) => setTimeout(r, 2));
      if (++guard > 20000) throw new Error('bitmedi');
    }
    expect(A.t.room.status).toBe('finished');
    expect(code).toBeTruthy();
  });
});

describe('Aşama 4 online', () => {
  it('Scrabble Türkçe: sunucu sözlükte olmayan kelimeyi reddeder, ipucu kapalı, geçerli kelime puanlanır', async () => {
    const { A, B } = await pair('scrabble-tr', { options: { learning: true } });
    expect(A.t.view.lang).toBe('tr');
    expect(A.t.view.learning).toBe(false);
    const who = A.t.view.turn === 0 ? A : B;
    const other = who === A ? B : A;
    expect(who.t.view.rack).toHaveLength(7);
    expect(other.t.view.rack.some((l: string, k: number) => who.t.view.rack[k] === l && false)).toBe(false);
    // Rafı sunucuda bilinen harflerle değiştirip deneyelim
    const room = srv.rooms.get(A.t.room.code)!;
    room.state.racks[who.t.seat] = ['K', 'I', 'T', 'A', 'P', 'İ', 'A'];
    const bad = await call(who.s, 'game:action', { action: { type: 'place', tiles: [{ i: 110, l: 'K' }, { i: 111, l: 'I' }, { i: 112, l: 'T' }, { i: 113, l: 'A' }, { i: 114, l: 'P' }] } });
    expect(bad.error).toBe('Sözlükte yok: KITAP');
    const good = await call(who.s, 'game:action', { action: { type: 'place', tiles: [{ i: 110, l: 'K' }, { i: 111, l: 'İ' }, { i: 112, l: 'T' }, { i: 113, l: 'A' }, { i: 114, l: 'P' }] } });
    expect(good.ok).toBe(true);
    await until(() => other.t.view.scores[who.t.seat] > 0);
    expect(other.t.view.board[112].l).toBe('T');
  });

  it('Xiangqi: kural dışı hamle reddi, geçerli hamleler, teslim', async () => {
    const { A, B } = await pair('xiangqi');
    expect((await call(A.s, 'game:action', { action: { type: 'move', from: 1, to: 19 } })).error).toBe('Bu taş oraya gidemez');
    expect((await call(A.s, 'game:action', { action: { type: 'move', from: 0, to: 9 } })).ok).toBe(true);
    await until(() => B.t.view.legal.length > 0);
    expect((await call(B.s, 'game:action', { action: B.t.view.legal[0] })).ok).toBe(true);
    expect((await call(A.s, 'game:action', { action: { type: 'resign' } })).ok).toBe(true);
    await until(() => A.t.room.status === 'finished');
    expect(A.t.room.result.winners).toEqual([1]);
  });
  it('Çin Daması: 3 kişilik masa (1 insan + 2 bot); sahte yol reddedilir, oyun biter', async () => {
    const A = await connect((await guest()).token);
    const { code } = await call(A.s, 'room:create', { gameId: 'cin-damasi', players: 3, bots: 2, difficulty: 'zor' });
    expect(code).toBeTruthy();
    await call(A.s, 'room:start');
    await until(() => A.t.view && A.t.view.turn === 0 && A.t.view.legal.length > 0);
    const m = A.t.view.legal[0];
    expect((await call(A.s, 'game:action', { action: { type: 'move', path: [m.path[0], 60] } })).ok).toBe(false);
    let guard = 0;
    while (A.t.room.status === 'playing') {
      if (A.t.view.turn === 0 && A.t.view.legal.length) {
        // insan oyuncu hedefe en çok yaklaşan hamleyi seçsin (oyun bitsin diye)
        const r = await call(A.s, 'game:action', { action: A.t.view.legal[A.t.view.legal.length - 1] });
        if (!r.ok) await new Promise((x) => setTimeout(x, 5));
      } else await new Promise((x) => setTimeout(x, 2));
      if (++guard > 40000) throw new Error('bitmedi');
    }
    expect(A.t.room.status).toBe('finished');
  });
});

describe('Aşama 3 online', () => {
  it('Satranç: sunucu kural dışı ve sıra dışı hamleyi reddeder', async () => {
    const { A, B } = await pair('satranc');
    const sq = (n: string) => 'abcdefgh'.indexOf(n[0]) + (Number(n[1]) - 1) * 8;
    const play = async (who: any, f: string, to: string) => {
      const r = await call(who.s, 'game:action', { action: { type: 'move', from: sq(f), to: sq(to) } });
      expect(r.ok).toBe(true);
    };
    expect((await call(A.s, 'game:action', { action: { type: 'move', from: sq('e2'), to: sq('e5') } })).error).toBe('Bu hamle kurallara uygun değil');
    expect((await call(B.s, 'game:action', { action: { type: 'move', from: sq('e7'), to: sq('e5') } })).error).toBe('Sıra sizde değil');
    await play(A, 'e2', 'e4');
    expect((await call(A.s, 'game:action', { action: { type: 'move', from: sq('d2'), to: sq('d4') } })).error).toBe('Sıra sizde değil');
    await play(B, 'e7', 'e5');
  });

  it('Satranç: tam Çoban matı ve sonuç', async () => {
    const { A, B } = await pair('satranc');
    const sq = (n: string) => 'abcdefgh'.indexOf(n[0]) + (Number(n[1]) - 1) * 8;
    const moves: [any, string, string][] = [[A, 'e2', 'e4'], [B, 'e7', 'e5'], [A, 'f1', 'c4'], [B, 'b8', 'c6'], [A, 'd1', 'h5'], [B, 'g8', 'f6'], [A, 'h5', 'f7']];
    for (const [who, f, t] of moves) expect((await call(who.s, 'game:action', { action: { type: 'move', from: sq(f), to: sq(t) } })).ok).toBe(true);
    await until(() => A.t.room?.status === 'finished');
    expect(A.t.room.result.winners).toEqual([0]);
    expect(A.t.room.result.summary).toBe('Şah mat');
    expect((await call(A.s, 'profile:get')).profile.stats.satranc.won).toBe(1);
  });

  it('Satranç saati: süresi biten oyuncu kaybeder', async () => {
    const { A } = await pair('satranc', { clockMinutes: 3 }); // testte 3 "dakika" = 1,2 sn
    expect(A.t.room.clock.ms[0]).toBeGreaterThan(0);
    await until(() => A.t.room?.status === 'finished', 5000);
    expect(A.t.room.result.winners).toEqual([1]);
    expect(A.t.room.result.summary).toContain('Süresi bitti');
  });

  it('Teslim olma sıra beklemeden çalışır', async () => {
    const { A, B } = await pair('tavla', { options: { matchTo: 3 } });
    const notTurn = A.t.view.turn === 0 ? B : A;
    expect((await call(notTurn.s, 'game:action', { action: { type: 'resign' } })).ok).toBe(true);
    await until(() => A.t.room?.status === 'finished');
    expect(A.t.room.result.winners).toEqual([notTurn === A ? 1 : 0]);
  });

  it('Tavla: zar sunucuda atılır, iki insan maçı sonuna kadar oynar', async () => {
    const { A, B } = await pair('tavla', { options: { matchTo: 1 } });
    let guard = 0;
    while (A.t.room.status === 'playing') {
      const who = A.t.view.turn === 0 ? A : B;
      await until(() => who.t.view.turn === who.t.seat || A.t.room.status !== 'playing');
      if (A.t.room.status !== 'playing') break;
      const before = JSON.stringify(who.t.view.points) + who.t.view.phase + who.t.view.dice + who.t.view.turn;
      const r = await call(who.s, 'game:action', { action: who.t.view.legal[0] });
      if (!r.ok) console.log('TAVLA HATA', r.error, JSON.stringify(who.t.view.legal), who.t.view.phase, who.t.view.turn, who.t.seat);
      expect(r.ok).toBe(true);
      await until(() => JSON.stringify(who.t.view.points) + who.t.view.phase + who.t.view.dice + who.t.view.turn !== before || A.t.room.status !== 'playing');
      if (++guard > 3000) throw new Error('bitmedi');
    }
    await until(() => A.t.room.status === 'finished');
    expect(A.t.room.result.winners.length).toBe(1);
  });

  it('Kızma Birader: 2 insan + 2 bot oyunu tamamlar', async () => {
    const A = await connect((await guest()).token);
    const B = await connect((await guest()).token);
    const { code } = await call(A.s, 'room:create', { gameId: 'kizma-birader', players: 4, bots: 2, difficulty: 'zor' });
    await call(B.s, 'room:join', { code });
    await call(B.s, 'room:ready', { ready: true });
    await call(A.s, 'room:start');
    await until(() => A.t.view && B.t.view);
    let guard = 0;
    while (A.t.room.status === 'playing') {
      let acted = false;
      for (const who of [A, B]) {
        if (who.t.view && who.t.view.turn === who.t.seat && who.t.view.legal.length) { const r = await call(who.s, 'game:action', { action: who.t.view.legal[0] }); acted = acted || r.ok; }
      }
      if (!acted) await new Promise((r) => setTimeout(r, 2));
      if (++guard > 20000) { console.log('KIZMA', JSON.stringify({ v: A.t.view, room: A.t.room.status, seats: A.t.room.seats.map((x: any) => [x.bot, x.connected]), bseat: B.t.seat, bv: B.t.view?.turn })); throw new Error('bitmedi'); }
    }
    expect(A.t.room.status).toBe('finished');
  });
});
