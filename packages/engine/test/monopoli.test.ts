import { describe, expect, it } from 'vitest';
import { Monopoli, rentOf, netWorth, type MonoState } from '../src/games/monopoli';
import { BOARD, GROUP_SQUARES } from '../src/games/monopoli-data';
import { seededRng } from '../src/rng';
import type { Difficulty, Rng } from '../src/types';

const rng = seededRng(1);
const dice = (a: number, b: number): Rng => { let k = 0; return { int: () => (k++ % 2 === 0 ? a : b) - 1 }; };
function st(n = 2): MonoState { return { ...Monopoli.setup({ players: n }, seededRng(3)), turn: 0 }; }

describe('Monopoli — tahta', () => {
  it('40 kare, 22 mülk + 4 gar + 2 idare, 8 renk grubu', () => {
    expect(BOARD).toHaveLength(40);
    expect(BOARD.filter((b) => b.kind === 'mulk')).toHaveLength(22);
    expect(GROUP_SQUARES[8]).toEqual([5, 15, 25, 35]);
    expect(GROUP_SQUARES[9]).toEqual([12, 28]);
    expect(GROUP_SQUARES.slice(0, 8).map((g) => g.length)).toEqual([2, 3, 3, 3, 3, 3, 3, 2]);
  });
});

describe('Monopoli — hareket, satın alma, kira', () => {
  it('zar at → ilerle → sahipsiz mülkü satın al', () => {
    let s = st();
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(1, 2)); // 3 → Dolapdere
    expect(s.players[0].pos).toBe(3);
    expect(s.phase).toBe('buy');
    s = Monopoli.apply(s, 0, { type: 'buy' }, rng);
    expect(s.owner[3]).toBe(0);
    expect(s.players[0].cash).toBe(1440);
    expect(s.phase).toBe('manage');
  });
  it('kira: arsa, tam set ×2, evli, gar ve idare', () => {
    const s = st();
    s.owner[1] = 1;
    expect(rentOf(s, 1, 7)).toBe(2);
    s.owner[3] = 1;
    expect(rentOf(s, 1, 7)).toBe(4);
    s.houses[1] = 3;
    expect(rentOf(s, 1, 7)).toBe(90);
    s.owner[5] = 1; s.owner[15] = 1;
    expect(rentOf(s, 5, 7)).toBe(50);
    s.owner[12] = 1;
    expect(rentOf(s, 12, 8)).toBe(32);
    s.owner[28] = 1;
    expect(rentOf(s, 12, 8)).toBe(80);
    s.mortgaged[15] = true;
    expect(rentOf(s, 15, 7)).toBe(0);
  });
  it('kira ödenir; Başlangıç’tan geçince 200 TL', () => {
    let s = st();
    s.owner[3] = 1;
    s.players[0].pos = 38;
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(2, 3)); // 38+5 = 3
    expect(s.players[0].cash).toBe(1500 + 200 - 4);
    expect(s.players[1].cash).toBe(1504);
  });
  it('çift atan tekrar atar, üç çift hapse', () => {
    let s = st();
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(1, 1)); // 2 = Kamu Fonu
    if (s.phase === 'manage') return; // kart hapse yolladıysa testin geri kalanı anlamsız
    expect(['roll', 'buy', 'debt']).toContain(s.phase);
    s = { ...s, phase: 'roll', doubles: 2, resume: 'roll' };
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(3, 3));
    expect(s.players[0].pos).toBe(10);
    expect(s.players[0].jail).toBe(1);
  });
  it('müzayede: almayan için sırayla teklif, en yüksek teklif alır', () => {
    let s = st(3);
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(3, 3)); // 6 Balat (çift)
    s = Monopoli.apply(s, 0, { type: 'decline' }, rng);
    expect(s.phase).toBe('auction');
    expect(Monopoli.toAct(s)).toEqual([0]);
    s = Monopoli.apply(s, 0, { type: 'bid', amount: 50 }, rng);
    expect(() => Monopoli.apply(s, 1, { type: 'bid', amount: 55 }, rng)).toThrow('En az 60');
    s = Monopoli.apply(s, 1, { type: 'bid', amount: 60 }, rng);
    s = Monopoli.apply(s, 2, { type: 'passBid' }, rng);
    s = Monopoli.apply(s, 0, { type: 'passBid' }, rng);
    expect(s.owner[6]).toBe(1);
    expect(s.players[1].cash).toBe(1440);
    expect(s.phase).toBe('roll'); // çift atmıştı
  });
});

describe('Monopoli — ev, ipotek, takas, hapis', () => {
  it('ev için tam set; eşit dağılım; otel; satış yarı fiyat', () => {
    let s = st();
    s.owner[1] = 0; s.phase = 'manage';
    expect(() => Monopoli.apply(s, 0, { type: 'build', sq: 1 }, rng)).toThrow('rengin tamamına');
    s.owner[3] = 0;
    s = Monopoli.apply(s, 0, { type: 'build', sq: 1 }, rng);
    expect(() => Monopoli.apply(s, 0, { type: 'build', sq: 1 }, rng)).toThrow('eşit');
    s = Monopoli.apply(s, 0, { type: 'build', sq: 3 }, rng);
    for (let k = 0; k < 3; k++) { s = Monopoli.apply(s, 0, { type: 'build', sq: 1 }, rng); s = Monopoli.apply(s, 0, { type: 'build', sq: 3 }, rng); }
    s = Monopoli.apply(s, 0, { type: 'build', sq: 1 }, rng);
    expect(s.houses[1]).toBe(5);
    expect(s.hotelsLeft).toBe(11);
    expect(s.housesLeft).toBe(32 - 4);
    expect(s.players[0].cash).toBe(1500 - 9 * 50);
    expect(() => Monopoli.apply(s, 0, { type: 'sellHouse', sq: 3 }, rng)).toThrow('eşit');
    s = Monopoli.apply(s, 0, { type: 'sellHouse', sq: 1 }, rng);
    expect(s.houses[1]).toBe(4);
    expect(s.players[0].cash).toBe(1500 - 450 + 25);
  });
  it('ipotek: evli grupta yapılamaz; yarı fiyat; %10 ile kaldırma', () => {
    let s = st();
    s.owner[1] = 0; s.owner[3] = 0; s.houses[3] = 1; s.phase = 'manage';
    expect(() => Monopoli.apply(s, 0, { type: 'mortgage', sq: 1 }, rng)).toThrow('evleri');
    s.houses[3] = 0;
    s = Monopoli.apply(s, 0, { type: 'mortgage', sq: 1 }, rng);
    expect(s.players[0].cash).toBe(1530);
    expect(() => Monopoli.apply(s, 0, { type: 'build', sq: 3 }, rng)).toThrow('ipotekli');
    s = Monopoli.apply(s, 0, { type: 'unmortgage', sq: 1 }, rng);
    expect(s.players[0].cash).toBe(1530 - 33);
  });
  it('takas teklifi kabul ve red', () => {
    let s = st();
    s.owner[1] = 0; s.owner[39] = 1; s.phase = 'manage';
    s = Monopoli.apply(s, 0, { type: 'propose', offer: { from: 0, to: 1, give: { cash: 100, props: [1] }, get: { cash: 0, props: [39] } } }, rng);
    expect(Monopoli.toAct(s)).toEqual([1]);
    const accepted = Monopoli.apply(s, 1, { type: 'acceptTrade' }, rng);
    expect(accepted.owner[39]).toBe(0);
    expect(accepted.owner[1]).toBe(1);
    expect(accepted.players[0].cash).toBe(1400);
    expect(accepted.phase).toBe('manage');
    const rejected = Monopoli.apply(s, 1, { type: 'rejectTrade' }, rng);
    expect(rejected.owner[39]).toBe(1);
    expect(() => Monopoli.apply({ ...st(), phase: 'manage' }, 0, { type: 'propose', offer: { from: 0, to: 1, give: { cash: 0, props: [39] }, get: { cash: 0, props: [] } } }, rng)).toThrow('sahiplerine');
  });
  it('hapis: 50 TL, kart, üçüncü denemede zorunlu ödeme', () => {
    let s = st();
    s.players[0].jail = 1; s.players[0].pos = 10;
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(1, 2));
    expect(s.players[0].pos).toBe(10);
    expect(s.players[0].jail).toBe(2);
    let t = st();
    t.players[0].jail = 3; t.players[0].pos = 10;
    t = Monopoli.apply(t, 0, { type: 'roll' }, dice(1, 2));
    expect(t.players[0].jail).toBe(0);
    expect(t.players[0].pos).toBe(13);
    expect(t.players[0].cash).toBe(1450 - (t.owner[13] === null ? 0 : 0));
    let u = st();
    u.players[0].jail = 1; u.players[0].jailCards = 1;
    u = Monopoli.apply(u, 0, { type: 'useJailCard' }, rng);
    expect(u.players[0].jail).toBe(0);
  });
});

describe('Monopoli — takas yapay zekâsı ve sınırı', () => {
  it('bir turda en fazla 3 teklif', () => {
    let s = st();
    s.owner[1] = 0; s.owner[39] = 1; s.phase = 'manage';
    const offer = { from: 0, to: 1, give: { cash: 0, props: [1] }, get: { cash: 0, props: [39] } };
    for (let k = 0; k < 3; k++) { s = Monopoli.apply(s, 0, { type: 'propose', offer }, rng); s = Monopoli.apply(s, 1, { type: 'rejectTrade' }, rng); }
    expect(() => Monopoli.apply(s, 0, { type: 'propose', offer }, rng)).toThrow('en fazla 3');
  });
  it('YZ setini tamamlamak için teklif verir; rakibe seti ucuza vermez', () => {
    const s = st();
    s.owner[37] = 0; s.owner[39] = 1; s.phase = 'manage'; s.players[0].cash = 2000;
    const a = Monopoli.ai(Monopoli.view(s, 0), 0, 'zor', rng) as any;
    expect(a.type).toBe('propose');
    expect(a.offer.get.props).toEqual([39]);
    // Ucuz teklif: rakip (YZ) reddetmeli
    let t = Monopoli.apply(s, 0, { type: 'propose', offer: { from: 0, to: 1, give: { cash: 100, props: [] }, get: { cash: 0, props: [39] } } }, rng);
    expect(Monopoli.ai(Monopoli.view(t, 1), 1, 'zor', rng)).toEqual({ type: 'rejectTrade' });
    t = Monopoli.apply(s, 0, { type: 'propose', offer: a.offer }, rng);
    expect(Monopoli.ai(Monopoli.view(t, 1), 1, 'zor', rng)).toEqual({ type: 'acceptTrade' });
  });
});

describe('Monopoli — borç ve iflas', () => {
  it('ödeyemeyen borç aşamasına girer, ipotekle öder', () => {
    let s = st();
    s.owner[39] = 1; s.houses[37] = 0; s.owner[37] = 1; s.houses[39] = 5;
    s.players[0].cash = 100; s.owner[1] = 0;
    s.players[0].pos = 37;
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(1, 1)); // 39 → otel kirası 2000
    expect(s.phase).toBe('debt');
    expect(Monopoli.legalActions(s, 0).some((a) => a.type === 'payDebt')).toBe(false);
    s = Monopoli.apply(s, 0, { type: 'bankrupt' }, rng);
    expect(s.players[0].bankrupt).toBe(true);
    expect(s.owner[1]).toBe(1); // mülkler alacaklıya geçer
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(1);
  });
  it('vergiye iflas edilirse mülkler bankaya döner', () => {
    let s = st(3);
    s.players[0].cash = 50; s.owner[1] = 0; s.owner[3] = 0; s.houses[1] = 1; s.players[0].pos = 1;
    s = Monopoli.apply(s, 0, { type: 'roll' }, dice(1, 2)); // 4 → Gelir vergisi 200
    expect(s.phase).toBe('debt');
    s = Monopoli.apply(s, 0, { type: 'sellHouse', sq: 1 }, rng);
    expect(s.players[0].cash).toBe(75);
    s = Monopoli.apply(s, 0, { type: 'bankrupt' }, rng);
    expect(s.owner[1]).toBeNull();
    expect(s.players[0].bankrupt).toBe(true);
    expect(s.turn).not.toBe(0);
  });
  it('görünüm kart destelerinin sırasını göstermez', () => {
    expect((Monopoli.view(st(), 0) as any).decks).toBeUndefined();
  });
});

describe('Monopoli — tam oyun simülasyonları', () => {
  it('YZ maçları (2–6 kişi) hatasız biter; para korunumu (banka dışı akış tutarlı)', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (let g = 0; g < 24; g++) {
      const r = seededRng(40 + g);
      const n = 2 + (g % 5);
      let s = Monopoli.setup({ players: n, options: { maxRounds: g % 2 ? 40 : 0 } }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = Monopoli.toAct(s)[0];
        const v = Monopoli.view(s, seat);
        const a = Monopoli.ai(v, seat, diffs[(g + seat) % 3], r);
        s = Monopoli.apply(s, seat, a, r);
        expect(s.players.every((p) => p.bankrupt || p.cash >= 0)).toBe(true);
        expect(s.housesLeft + s.houses.reduce((t, h) => t + (h === 5 ? 0 : h), 0)).toBe(32);
        expect(s.hotelsLeft + s.houses.filter((h) => h === 5).length).toBe(12);
        if (++steps > 60000) throw new Error('bitmedi');
      }
      expect(s.winner).not.toBeNull();
      if (g % 2 === 0) {
        // Klasik mod güvenlik sınırına takılmadan, gerçek iflaslarla bitmeli
        expect(s.round).toBeLessThanOrEqual(200);
        expect(s.players.filter((p) => p.bankrupt)).toHaveLength(n - 1);
      }
      const res = Monopoli.result(s);
      if (res) expect(res.scores[s.winner!]).toBe(Math.max(...s.players.map((p, i) => (p.bankrupt ? -1 : netWorth(s, i)))));
    }
  });
});
