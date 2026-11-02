import { describe, expect, it } from 'vitest';
import { King, kingLegalCards, handScore, type KingState } from '../src/games/king';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(3);
const st = (): KingState => ({ ...King.setup({ players: 4 }, seededRng(1)), chooser: 0, turn: 0 });

describe('King', () => {
  it('seçim: kozlu kozla, ceza kotaları', () => {
    let s = st();
    expect(() => King.apply(s, 0, { type: 'choose', game: 'koz' }, rng)).toThrow('Kozu seçin');
    s = King.apply(s, 0, { type: 'choose', game: 'kiz' }, rng);
    expect(s.contract).toEqual({ game: 'kiz', trump: null });
    expect(s.usedTypes.kiz).toBe(1);
    s.usedTypes.kupa = 2;
    s.phase = 'choose'; s.turn = 0;
    expect(() => King.apply(s, 0, { type: 'choose', game: 'kupa' }, rng)).toThrow('kotası');
    s.picks[0] = { koz: 2, ceza: 0 };
    expect(King.legalActions(s, 0).some((a: any) => a.game === 'koz')).toBe(false);
  });
  it('kupa kırılmadan kupa ile açılmaz; kozluda renk yoksa koz', () => {
    expect(kingLegalCards(['H5', 'S3'], [], { game: 'kupa', trump: null }, false)).toEqual(['S3']);
    expect(kingLegalCards(['H5', 'H9'], [], { game: 'kupa', trump: null }, false)).toEqual(['H5', 'H9']);
    expect(kingLegalCards(['H5', 'S3'], [], { game: 'kupa', trump: null }, true)).toEqual(['H5', 'S3']);
    expect(kingLegalCards(['D4', 'C9'], [{ seat: 1, card: 'H2' }], { game: 'koz', trump: 'C' }, true)).toEqual(['C9']);
    expect(kingLegalCards(['D4', 'C9'], [{ seat: 1, card: 'H2' }], { game: 'el', trump: null }, true)).toEqual(['D4', 'C9']);
  });
  it('ceza puanları', () => {
    const base = { tricksWon: [3, 4, 6, 0], taken: [['H13', 'H2', 'S12', 'D11'], ['C12', 'H12'], [], ['S13']] };
    expect(handScore({ ...base, contract: { game: 'el', trump: null } })).toEqual([-150, -200, -300, 0]);
    expect(handScore({ ...base, contract: { game: 'kupa', trump: null } })).toEqual([-60, -30, 0, 0]);
    expect(handScore({ ...base, contract: { game: 'erkek', trump: null } })).toEqual([-120, 0, 0, -60]);
    expect(handScore({ ...base, contract: { game: 'kiz', trump: null } })).toEqual([-100, -200, 0, 0]);
    expect(handScore({ ...base, contract: { game: 'rifki', trump: null } })).toEqual([-320, 0, 0, 0]);
    expect(handScore({ ...base, contract: { game: 'soniki', trump: null } }, [2, 2])).toEqual([0, 0, -360, 0]);
    expect(handScore({ ...base, contract: { game: 'koz', trump: 'S' } })).toEqual([150, 200, 300, 0]);
  });
  it('Rıfkı: kupa papazı alınınca el biter', () => {
    let s = st();
    s = King.apply(s, 0, { type: 'choose', game: 'rifki' }, rng);
    s.hands = [['H14', 'S2'], ['H13', 'S3'], ['H2', 'S4'], ['H3', 'S5']];
    s.heartsBroken = true;
    for (const [p, c] of [[0, 'H14'], [1, 'H13'], [2, 'H2'], [3, 'H3']] as const) s = King.apply(s, p, { type: 'play', card: c }, rng);
    expect(s.lastHand).toMatchObject({ game: 'rifki', delta: [-320, 0, 0, 0] });
    expect(s.handNo).toBe(2);
  });
  it('20 el: her oyuncu tam 2 kozlu + 3 ceza, her ceza türü 2 kez', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (let g = 0; g < 40; g++) {
      const r = seededRng(g);
      let s = King.setup({ players: 4, options: { length: g % 4 === 0 ? 'kisa' : 'tam' } }, r);
      const games: string[] = [];
      while (s.phase !== 'over') {
        const seat = s.turn;
        const a = King.ai(King.view(s, seat), seat, diffs[(g + seat) % 3], r);
        if (a.type === 'choose') games.push(a.game);
        s = King.apply(s, seat, a, r);
      }
      if (s.totalHands === 20) {
        expect(games).toHaveLength(20);
        expect(s.picks.every((p) => p.koz === 2 && p.ceza === 3)).toBe(true);
        for (const t of ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki']) expect(games.filter((x) => x === t)).toHaveLength(2);
      } else expect(games).toHaveLength(8);
      expect(King.result(s)!.winners.length).toBeGreaterThan(0);
    }
  });
  it('görünüm diğer elleri göstermez', () => {
    expect((King.view(st(), 0) as any).hands).toBeUndefined();
  });
});
