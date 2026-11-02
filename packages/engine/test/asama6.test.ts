import { describe, expect, it } from 'vitest';
import { Amiral, validateFleet, randomFleet, shipCells, FLEET, type AmiralState, type Ship } from '../src/games/amiral';
import { Tombala, makeCard, type TombalaState } from '../src/games/tombala';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(12);
const fleet: Ship[] = [{ r: 0, c: 0, len: 5, dir: 'y' }, { r: 2, c: 0, len: 4, dir: 'y' }, { r: 4, c: 0, len: 3, dir: 'y' }, { r: 6, c: 0, len: 3, dir: 'y' }, { r: 8, c: 0, len: 2, dir: 'y' }];

describe('Amiral Battı', () => {
  it('filo doğrulama: eksik, taşan, çakışan, temas seçeneği', () => {
    expect(validateFleet(fleet, true)).toBeNull();
    expect(validateFleet(fleet.slice(0, 4), false)).toContain('Beş');
    expect(validateFleet([{ ...fleet[0], c: 7 }, ...fleet.slice(1)], false)).toContain('dışına');
    expect(validateFleet([fleet[0], { ...fleet[1], r: 0 }, ...fleet.slice(2)], false)).toContain('üst üste');
    const touching = [fleet[0], { ...fleet[1], r: 1 }, ...fleet.slice(2)];
    expect(validateFleet(touching, false)).toBeNull();
    expect(validateFleet(touching, true)).toContain('değmemeli');
  });
  it('rastgele filo her zaman geçerli (500 deneme, temaslı ve temassız)', () => {
    for (let k = 0; k < 500; k++) {
      expect(validateFleet(randomFleet(seededRng(k), false), false)).toBeNull();
      expect(validateFleet(randomFleet(seededRng(k), true), true)).toBeNull();
    }
  });
  it('yerleştirme sonrası atış: ıska, isabet, battı; aynı kareye iki kez ateş yok', () => {
    let s = Amiral.setup({ players: 2 }, rng);
    expect(() => Amiral.apply(s, 0, { type: 'fire', cell: 0 }, rng)).toThrow('yerleştirin');
    s = Amiral.apply(s, 0, { type: 'place', ships: fleet }, rng);
    s = Amiral.apply(s, 1, { type: 'place', ships: fleet }, rng);
    s = { ...s, turn: 0 } as AmiralState;
    s = Amiral.apply(s, 0, { type: 'fire', cell: 99 }, rng);
    expect(s.last!.result).toBe('iska');
    expect(s.turn).toBe(1);
    s = Amiral.apply(s, 1, { type: 'fire', cell: 99 }, rng);
    s = Amiral.apply(s, 0, { type: 'fire', cell: 80 }, rng);
    expect(s.last!.result).toBe('isabet');
    s = Amiral.apply(s, 1, { type: 'fire', cell: 98 }, rng);
    expect(() => Amiral.apply(s, 0, { type: 'fire', cell: 80 }, rng)).toThrow('zaten');
    s = Amiral.apply(s, 0, { type: 'fire', cell: 81 }, rng);
    expect(s.last).toMatchObject({ result: 'batti', ship: 'Hücumbot' });
  });
  it('rakip gemileri görünümde gizli, yalnızca batanlar görünür', () => {
    let s = Amiral.setup({ players: 2 }, rng);
    s = Amiral.apply(s, 0, { type: 'place', ships: fleet }, rng);
    s = Amiral.apply(s, 1, { type: 'place', ships: randomFleet(seededRng(3), false) }, rng);
    const v = Amiral.view(s, 0);
    expect(v.myShips).toEqual(fleet);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.ships[1]![0]));
    expect(v.sunk[1]).toEqual([]);
  });
  it('isabette tekrar at seçeneği', () => {
    let s = Amiral.setup({ players: 2, options: { extraOnHit: true } }, rng);
    s = Amiral.apply(s, 0, { type: 'place', ships: fleet }, rng);
    s = Amiral.apply(s, 1, { type: 'place', ships: fleet }, rng);
    s = { ...s, turn: 0 } as AmiralState;
    s = Amiral.apply(s, 0, { type: 'fire', cell: 0 }, rng);
    expect(s.turn).toBe(0);
  });
  it('YZ maçları biter; zor YZ kolayı açık farkla yener', () => {
    const play = (d0: Difficulty, d1: Difficulty, seed: number) => {
      const r = seededRng(seed);
      let s = Amiral.setup({ players: 2 }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = Amiral.toAct(s)[0];
        s = Amiral.apply(s, seat, Amiral.ai(Amiral.view(s, seat), seat, seat === 0 ? d0 : d1, r), r);
        if (++steps > 400) throw new Error('bitmedi');
      }
      return s;
    };
    let wins = 0;
    for (let g = 0; g < 60; g++) if (play('zor', 'kolay', g).winner === 0) wins++;
    expect(wins).toBeGreaterThan(50);
    const s = play('orta', 'orta', 999);
    expect(s.shots[s.winner!].filter(Boolean).length).toBeLessThanOrEqual(100);
    expect(shipCells(FLEET.map((f, i) => ({ r: i, c: 0, len: f.len, dir: 'y' as const }))[0])).toHaveLength(5);
  });
});

describe('Tombala', () => {
  it('1000 kart: 3 satır × 5 numara, sütun aralıkları, her sütunda ≥1, sütun içinde sıralı, tekrarsız', () => {
    for (let k = 0; k < 1000; k++) {
      const card = makeCard(seededRng(k));
      const nums = card.flat().filter((x): x is number => x !== null);
      expect(nums).toHaveLength(15);
      expect(new Set(nums).size).toBe(15);
      card.forEach((row) => expect(row.filter((x) => x !== null)).toHaveLength(5));
      for (let col = 0; col < 9; col++) {
        const vals = card.map((r) => r[col]).filter((x): x is number => x !== null);
        expect(vals.length).toBeGreaterThanOrEqual(1);
        const lo = col === 0 ? 1 : col * 10, hi = col === 8 ? 90 : col * 10 + 9;
        vals.forEach((x) => { expect(x).toBeGreaterThanOrEqual(lo); expect(x).toBeLessThanOrEqual(hi); });
        expect([...vals].sort((a, b) => a - b)).toEqual(vals);
      }
    }
  });
  it('yalnızca masayı açan çeker; ödüller doğru sırada ve doğru kişiye', () => {
    let s = Tombala.setup({ players: 3 }, seededRng(5));
    expect(() => Tombala.apply(s, 1, { type: 'draw' }, rng)).toThrow('masayı açan');
    // Oyuncu 2'nin kartının ilk satırını torbanın sonuna koy → ilk 5 çekilişte 1. çinko
    const row = s.cards[2][0][0].filter((x): x is number => x !== null);
    s = { ...s, bag: [...s.bag.filter((x) => !row.includes(x)), ...row] } as TombalaState;
    for (let k = 0; k < 5; k++) s = Tombala.apply(s, 0, { type: 'draw' }, rng);
    expect(s.prizes.cinko1).toContain(2);
    expect(s.scores[2]).toBeGreaterThanOrEqual(1);
  });
  it('torba sırası görünümde yok; 300 oyun tombala ile biter ve kazananın kartı gerçekten dolu', () => {
    for (let g = 0; g < 300; g++) {
      let s = Tombala.setup({ players: 2 + (g % 19), options: { cards: 1 + (g % 3) } }, seededRng(g));
      expect((Tombala.view(s, 1) as any).bag).toBeUndefined();
      while (!s.over) s = Tombala.apply(s, 0, { type: 'draw' }, seededRng(g));
      expect(s.prizes.tombala).not.toBeNull();
      const drawn = new Set(s.drawn);
      for (const w of s.prizes.tombala!) expect(s.cards[w].some((c) => c.flat().every((x) => x === null || drawn.has(x)))).toBe(true);
      expect(s.prizes.cinko1).not.toBeNull();
      expect(s.prizes.cinko2).not.toBeNull();
    }
  });
});
