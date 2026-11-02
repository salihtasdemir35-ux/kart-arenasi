import { describe, expect, it } from 'vitest';
import { Bric, scoreContract, legalCalls, isVul, type BricState } from '../src/games/bric';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(1);
const C = (level: number, strain: any, doubled: 0 | 1 | 2 = 0) => ({ level, strain, declarer: 0, doubled });

describe('Briç — puan tablosu', () => {
  it('yapılan kontratlar', () => {
    expect(scoreContract(C(4, 'S'), 10, false)).toBe(420);
    expect(scoreContract(C(4, 'S'), 10, true)).toBe(620);
    expect(scoreContract(C(3, 'NT'), 10, false)).toBe(430);
    expect(scoreContract(C(1, 'C'), 9, false)).toBe(110);
    expect(scoreContract(C(6, 'H'), 12, true)).toBe(1430);
    expect(scoreContract(C(7, 'NT'), 13, true)).toBe(2220);
    expect(scoreContract(C(4, 'S', 1), 10, false)).toBe(590);
    expect(scoreContract(C(2, 'H', 1), 8, true)).toBe(670);
    expect(scoreContract(C(1, 'NT', 2), 8, false)).toBe(760); // 160 + 300 + 100 + 200
  });
  it('batışlar', () => {
    expect(scoreContract(C(3, 'NT'), 8, false)).toBe(-50);
    expect(scoreContract(C(4, 'S', 1), 7, false)).toBe(-500);
    expect(scoreContract(C(4, 'S', 1), 8, true)).toBe(-500);
    expect(scoreContract(C(4, 'S', 2), 9, false)).toBe(-200);
    expect(scoreContract(C(5, 'D', 1), 7, false)).toBe(-800);
  });
  it('zon döngüsü', () => {
    expect([1, 2, 3, 4].map((b) => [isVul(b, 0), isVul(b, 1)])).toEqual([[false, false], [true, false], [false, true], [true, true]]);
  });
});

describe('Briç — ihale', () => {
  const st = (): BricState => Bric.setup({ players: 4 }, seededRng(2));
  it('dört pas: board oynanmaz', () => {
    let s = st();
    for (let k = 0; k < 4; k++) s = Bric.apply(s, s.turn, { type: 'pass' }, rng);
    expect(s.board).toBe(2);
    expect(s.lastBoard!.note).toContain('pas');
  });
  it('kontr yalnızca rakip ihaleye, sürkontr yalnızca rakip kontra; düşük ihale reddedilir', () => {
    let s = st(); // board 1 dağıtan Kuzey (0)
    s = Bric.apply(s, 0, { type: 'bid', level: 1, strain: 'H' }, rng);
    expect(legalCalls(s, 1).some((c) => c.type === 'double')).toBe(true);
    expect(() => Bric.apply(s, 1, { type: 'bid', level: 1, strain: 'D' }, rng)).toThrow();
    s = Bric.apply(s, 1, { type: 'double' }, rng);
    expect(legalCalls(s, 2).some((c) => c.type === 'redouble')).toBe(true);
    expect(legalCalls(s, 3).some((c) => c.type === 'redouble')).toBe(false);
  });
  it('deklaran rengi ilk söyleyen; açış solundan; yeri deklaran oynar', () => {
    let s = st();
    s = Bric.apply(s, 0, { type: 'bid', level: 1, strain: 'H' }, rng);
    s = Bric.apply(s, 1, { type: 'pass' }, rng);
    s = Bric.apply(s, 2, { type: 'bid', level: 4, strain: 'H' }, rng);
    for (let k = 0; k < 3; k++) s = Bric.apply(s, s.turn, { type: 'pass' }, rng);
    expect(s.contract).toMatchObject({ level: 4, strain: 'H', declarer: 0, doubled: 0 });
    expect(s.turn).toBe(1);
    expect(Bric.view(s, 3).dummy).toBeNull();
    s = Bric.apply(s, 1, Bric.legalActions(s, 1)[0] as any, rng);
    expect(Bric.view(s, 3).dummy).toHaveLength(13); // yer açıldı
    expect(Bric.toAct(s)).toEqual([0]); // yerin (2) sırası → deklaran oynar
    expect(() => Bric.apply(s, 2, Bric.legalActions(s, 0)[0] as any, rng)).toThrow('Sıra');
    s = Bric.apply(s, 0, Bric.legalActions(s, 0)[0] as any, rng);
    expect(s.hands[2]).toHaveLength(12);
  });
  it('YZ ile tam maçlar: 13 el, puanlar tutarlı, gizlilik', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    let contracts = 0;
    for (let g = 0; g < 40; g++) {
      const r = seededRng(g);
      let s = Bric.setup({ players: 4, options: { boards: 4 } }, r);
      while (s.phase !== 'over') {
        const seat = Bric.toAct(s)[0];
        const v = Bric.view(s, seat);
        if (s.phase === 'play' && !s.dummyShown) expect(v.dummy).toBeNull();
        const before = s.board;
        s = Bric.apply(s, seat, Bric.ai(v, seat, diffs[(g + seat) % 3], r), r);
        if (s.board !== before && s.lastBoard?.contract) { contracts++; expect(s.lastBoard.tricks).toBeLessThanOrEqual(13); }
      }
    }
    expect(contracts).toBeGreaterThan(60);
  });
});
