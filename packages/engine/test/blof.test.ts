import { describe, expect, it } from 'vitest';
import { Blof, blofAi, type BlofState } from '../src/games/blof';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(2);
function st(hands: string[][], turn = 0, rank = 1): BlofState {
  return { ...Blof.setup({ players: hands.length }, rng), hands, turn, rank, pile: [], claim: null, phase: 'play' };
}

describe('Blöf', () => {
  it('dağıtım: 52 kartın hepsi, 3–6 oyuncu', () => {
    for (const n of [3, 4, 5, 6]) expect(Blof.setup({ players: n }, rng).hands.flat()).toHaveLength(52);
    expect(() => Blof.setup({ players: 2 }, rng)).toThrow();
  });
  it('yalan yakalanırsa atan yığını alır, itiraz eden oynar', () => {
    let s = st([['S14', 'H5', 'D9'], ['C3', 'C4'], ['H2']]);
    s = Blof.apply(s, 0, { type: 'play', cards: ['H5'] }, rng); // As diyor ama 5
    expect(s.phase).toBe('decide');
    expect(s.rank).toBe(2);
    s = Blof.apply(s, 1, { type: 'challenge' }, rng);
    expect(s.last!.caught).toBe(true);
    expect(s.hands[0]).toContain('H5');
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('play');
  });
  it('doğruysa itiraz eden yığını alır', () => {
    let s = st([['S14', 'H14', 'D9'], ['C3'], ['H2']]);
    s.pile = ['C7', 'C8'];
    s = Blof.apply(s, 0, { type: 'play', cards: ['S14', 'H14'] }, rng);
    s = Blof.apply(s, 1, { type: 'challenge' }, rng);
    expect(s.last!.caught).toBe(false);
    expect(s.hands[1].sort()).toEqual(['C3', 'C7', 'C8', 'H14', 'S14'].sort());
  });
  it('son kartla kazanma; yakalanan son blöf kazandırmaz', () => {
    let s = st([['S14'], ['C3'], ['H2']]);
    s = Blof.apply(s, 0, { type: 'play', cards: ['S14'] }, rng);
    expect(Blof.apply(s, 1, { type: 'believe' }, rng).winner).toBe(0);
    expect(Blof.apply(s, 1, { type: 'challenge' }, rng).winner).toBe(0);
    let t = st([['H5'], ['C3'], ['H2']]);
    t = Blof.apply(t, 0, { type: 'play', cards: ['H5'] }, rng);
    t = Blof.apply(t, 1, { type: 'challenge' }, rng);
    expect(t.phase).toBe('play');
    expect(t.hands[0]).toEqual(['H5']);
  });
  it('kural dışı atış reddedilir; kapalı kartlar görünmez', () => {
    let s = st([['S14', 'H5', 'D9', 'C9', 'S9'], ['C3'], ['H2']]);
    expect(() => Blof.apply(s, 0, { type: 'play', cards: [] }, rng)).toThrow();
    expect(() => Blof.apply(s, 0, { type: 'play', cards: ['S14', 'H5', 'D9', 'C9', 'S9'] }, rng)).toThrow();
    expect(() => Blof.apply(s, 0, { type: 'play', cards: ['C3'] }, rng)).toThrow('elinizde yok');
    s = Blof.apply(s, 0, { type: 'play', cards: ['H5'] }, rng);
    const v = Blof.view(s, 1);
    expect(JSON.stringify(v)).not.toContain('"H5"');
    expect(v.claim).toEqual({ seat: 0, count: 1, rank: 1 });
  });
  it('YZ kesin yalanı yakalar (elinde 3 As varken 2 As iddiası)', () => {
    let s = st([['C2', 'C3', 'C4'], ['S14', 'H14', 'D14', 'C5'], ['H2']]);
    s = Blof.apply(s, 0, { type: 'play', cards: ['C2', 'C3'] }, rng);
    expect(blofAi(Blof.view(s, 1), 1, 'kolay', rng)).toEqual({ type: 'challenge' });
  });
  it('aynı seviyedeki YZ’ler (3–6 kişi) hiç takılmaz; hamle sınırına nadiren kalır', () => {
    for (const d of ['orta', 'zor'] as const) {
      let limit = 0;
      for (let g = 0; g < 400; g++) {
        const r = seededRng(70000 + g);
        let s = Blof.setup({ players: 3 + (g % 4) }, r);
        let steps = 0;
        while (s.phase !== 'over') { s = Blof.apply(s, s.turn, Blof.ai(Blof.view(s, s.turn), s.turn, d, r), r); if (++steps > 3000) throw new Error('takıldı'); }
        if (s.hands[s.winner!].length) limit++;
      }
      expect(limit / 400).toBeLessThan(0.1);
    }
  });
  it('hamle sınırında en az kartı kalan kazanır', () => {
    let s = { ...st([['S2', 'H5'], ['C3'], ['H2', 'D4', 'D5']]), moves: 599 };
    s = Blof.apply(s, 0, { type: 'play', cards: ['S2'] }, rng);
    s = Blof.apply(s, 1, { type: 'believe' }, rng);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
  });
  it('YZ maçları biter; 52 kart korunur', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (let g = 0; g < 300; g++) {
      const r = seededRng(g);
      let s = Blof.setup({ players: 3 + (g % 4) }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        s = Blof.apply(s, s.turn, Blof.ai(Blof.view(s, s.turn), s.turn, diffs[(g + s.turn) % 3], r), r);
        expect(s.hands.flat().length + s.pile.length).toBe(52);
        if (++steps > 5000) throw new Error('bitmedi');
      }
    }
  });
});
