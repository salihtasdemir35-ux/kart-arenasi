import { describe, expect, it } from 'vitest';
import { Papaz, removePairs, type PapazState } from '../src/games/papaz';
import { seededRng } from '../src/rng';
import { rankOf } from '../src/cards';
import { MODULES } from '../src/registry';
import { CATALOG } from '../src/catalog';

const rng = seededRng(99);

const noPairs = (h: string[]) => new Set(h.map(rankOf)).size === h.length;

describe('Papaz Kaçtı', () => {
  it('çift atma: 4 aynı değer iki çift olarak atılır', () => {
    const r = removePairs(['S5', 'H5', 'D5', 'C5', 'S9', 'H9', 'D9', 'S13']);
    expect(r.removed).toHaveLength(6);
    expect(r.hand.sort()).toEqual(['D9', 'S13'].sort());
  });
  it('kurulumda 51 kart, ellerde çift yok, tek papaz eşsiz kalır', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const s = Papaz.setup({ players: n }, seededRng(n));
      const all = [...s.hands.flat(), ...s.discards.flatMap((d) => d.cards)];
      expect(all).toHaveLength(51);
      expect(all).not.toContain('C13');
      s.hands.forEach((h) => expect(noPairs(h)).toBe(true));
      expect(s.hands.flat().filter((c) => rankOf(c) === 13).length % 2).toBe(1); // 3 papazdan biri hep eşsiz
    }
  });
  it('1 veya 7 oyuncu reddedilir', () => {
    expect(() => Papaz.setup({ players: 1 }, rng)).toThrow();
    expect(() => Papaz.setup({ players: 7 }, rng)).toThrow();
  });
  it('çekilen kart çift yaparsa atılır, sıra kartı çekilene geçer', () => {
    const base = Papaz.setup({ players: 3 }, seededRng(1));
    const s: PapazState = { ...base, hands: [['S5', 'H7'], ['D5', 'C9'], ['S13', 'H2']], turn: 0, finished: [], over: false, loser: null };
    const idx = s.hands[1].indexOf('D5');
    const t = Papaz.apply(s, 0, { type: 'draw', index: idx }, rng);
    expect(t.hands[0]).toEqual(['H7']);
    expect(t.hands[1]).toEqual(['C9']);
    expect(t.turn).toBe(1);
    expect(t.lastDraw).toEqual({ from: 1, to: 0, paired: true });
  });
  it('kartı biten kurtulur, elinde kart kalan son oyuncu kaybeder', () => {
    const base = Papaz.setup({ players: 2 }, seededRng(2));
    const s: PapazState = { ...base, hands: [['H13'], ['S13', 'D4']], turn: 1, finished: [], over: false, loser: null };
    // Oyuncu 1, oyuncu 0'dan H13'ü çeker -> S13 ile çift olur, 1'de D4 kalır, 0'ın eli biter
    const t = Papaz.apply(s, 1, { type: 'draw', index: 0 }, rng);
    expect(t.over).toBe(true);
    expect(t.loser).toBe(1);
    expect(Papaz.result(t)!.winners).toEqual([0]);
  });
  it('geçersiz indeks ve sıra dışı hamle reddedilir', () => {
    const s = Papaz.setup({ players: 3 }, seededRng(3));
    const other = (s.turn + 1) % 3;
    expect(() => Papaz.apply(s, other, { type: 'draw', index: 0 }, rng)).toThrow('Sıra sizde değil');
    expect(() => Papaz.apply(s, s.turn, { type: 'draw', index: 999 }, rng)).toThrow('Geçersiz kart seçimi');
  });
  it('görünüm rakip elleri göstermez, son çekilen kartı yalnızca çekene gösterir', () => {
    let s = Papaz.setup({ players: 3 }, seededRng(4));
    const drawer = s.turn;
    s = Papaz.apply(s, drawer, { type: 'draw', index: 0 }, rng);
    for (let p = 0; p < 3; p++) {
      const v = Papaz.view(s, p);
      const json = JSON.stringify(v);
      for (let q = 0; q < 3; q++) if (q !== p) for (const c of s.hands[q]) expect(json.includes(`"${c}"`)).toBe(false);
      if (p !== drawer) expect(v.myLastDrawn).toBeNull();
    }
  });
  it('3000 simülasyon: her zaman biter, papaz kaybedende kalır', () => {
    for (let g = 0; g < 3000; g++) {
      const r = seededRng(g);
      const n = 2 + (g % 5);
      let s = Papaz.setup({ players: n }, r);
      let steps = 0;
      while (!s.over) {
        const seat = s.turn;
        s = Papaz.apply(s, seat, Papaz.ai(Papaz.view(s, seat), seat, 'orta', r), r);
        s.hands.forEach((h) => expect(noPairs(h)).toBe(true));
        if (++steps > 3000) throw new Error('sonsuz döngü');
      }
      expect(s.loser).not.toBeNull();
      expect(s.hands[s.loser!]).toHaveLength(1);
      expect(rankOf(s.hands[s.loser!][0])).toBe(13);
      expect(s.finished).toHaveLength(n - 1);
    }
  });
});

describe('Oyun sözleşmesi ve katalog', () => {
  it('katalogda 31 oyun var ve oynanabilir olanların motoru kayıtlı', () => {
    expect(CATALOG).toHaveLength(31);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(31);
    for (const c of CATALOG.filter((c) => c.playable)) expect(MODULES[c.engine ?? c.id]).toBeDefined();
  });
  it('Çin Daması ve Xiangqi ayrı oyunlardır', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(ids).toContain('cin-damasi');
    expect(ids).toContain('xiangqi');
  });
  it('her modül: seyirci görünümü el içermez, bitmeyen oyunda sonuç null', () => {
    for (const m of Object.values(MODULES)) {
      const s = m.setup({ players: m.playerCounts[m.playerCounts.length - 1] }, seededRng(5));
      expect(m.result(s)).toBeNull();
      const sv = m.view(s, null);
      expect(sv.legal).toEqual([]);
      if (Array.isArray((sv as any).hand)) expect((sv as any).hand).toEqual([]);
      const act = m.toAct(s);
      expect(act.length).toBeGreaterThanOrEqual(1);
      act.forEach((p) => expect(p).toBeLessThan(m.playerCounts[m.playerCounts.length - 1]));
    }
  });
});
