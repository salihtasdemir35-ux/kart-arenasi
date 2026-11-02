import { describe, expect, it } from 'vitest';
import { Elli1, meld51, best51, type E51State } from '../src/games/elli1';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(9);
// kart: deste*52 + takım*13 + (değer-1); takım 0 maça, 1 kupa, 2 karo, 3 sinek
const c = (suit: number, rank: number, deck = 0) => deck * 52 + suit * 13 + rank - 1;
const J = 104;

describe('51 — perler', () => {
  it('As: A-2-3 = 6, Q-K-A = 31, K-A-2 geçersiz; grup ve joker', () => {
    expect(meld51([c(0, 1), c(0, 2), c(0, 3)])).toEqual({ kind: 'seri', points: 6 });
    expect(meld51([c(0, 12), c(0, 13), c(0, 1)])).toEqual({ kind: 'seri', points: 31 });
    expect(meld51([c(0, 13), c(0, 1), c(0, 2)])).toBeNull();
    expect(meld51([c(0, 7), c(1, 7), c(2, 7)])).toEqual({ kind: 'grup', points: 21 });
    expect(meld51([c(0, 1), c(1, 1), c(2, 1)])).toEqual({ kind: 'grup', points: 33 });
    expect(meld51([c(0, 9), c(0, 10), J])).toEqual({ kind: 'seri', points: 29 }); // 9-10-J
    expect(meld51([c(0, 7), c(0, 7, 1), c(1, 7)])).toBeNull();
  });
  it('en iyi per kümesi ayrık', () => {
    const b = best51([c(0, 10), c(0, 11), c(0, 12), c(1, 12), c(2, 12), c(3, 12), c(1, 5), c(1, 6), c(1, 7)]);
    expect(new Set(b.melds.flat()).size).toBe(b.melds.flat().length);
    expect(b.points).toBeGreaterThanOrEqual(30 + 40 + 18 - 10);
  });
});

function st(): E51State {
  const s = Elli1.setup({ players: 3, options: { hands: 1 } }, seededRng(2));
  return { ...s, turn: 0, phase: 'play', first: 0 };
}
const opening = [[c(0, 10), c(0, 11), c(0, 12)], [c(1, 13), c(2, 13), c(3, 13)]]; // 30 + 30 = 60

describe('51 — oyun', () => {
  it('dağıtım 15/14/14 ve 108 kart; eller gizli', () => {
    const s = Elli1.setup({ players: 3 }, seededRng(4));
    expect(s.hands[s.first]).toHaveLength(15);
    expect(s.hands.flat().length + s.pile.length).toBe(108);
    expect((Elli1.view(s, 0) as any).hands).toBeUndefined();
  });
  it('51 altı açılış reddedilir, üstü kabul; işleme yalnızca açınca', () => {
    let s = st();
    s.hands[0] = [...opening.flat(), c(0, 13), c(2, 2), c(3, 5)];
    expect(() => Elli1.apply(s, 0, { type: 'open', melds: [opening[0]] }, rng)).toThrow('en az 51');
    expect(() => Elli1.apply(s, 0, { type: 'process', card: c(0, 13), meld: 0 }, rng)).toThrow('önce elinizi');
    s = Elli1.apply(s, 0, { type: 'open', melds: opening }, rng);
    s = Elli1.apply(s, 0, { type: 'process', card: c(0, 13), meld: 0 }, rng);
    expect(s.melds[0].cards).toHaveLength(4);
  });
  it('yerden alınan kart kullanılmalı; geri bırakılabilir', () => {
    let s = st();
    s.phase = 'draw';
    s.discard = [c(2, 9)];
    s = Elli1.apply(s, 0, { type: 'draw', from: 'discard' }, rng);
    expect(() => Elli1.apply(s, 0, { type: 'discard', card: s.hands[0][0] }, rng)).toThrow('kullanmalısınız');
    s = Elli1.apply(s, 0, { type: 'undoTake' }, rng);
    expect(s.discard).toEqual([c(2, 9)]);
  });
  it('joker atmak +51; el sonu cezaları', () => {
    let s = st();
    s.hands[0] = [...opening.flat(), J, c(2, 2)];
    s = Elli1.apply(s, 0, { type: 'open', melds: opening }, rng);
    expect(Elli1.apply(s, 0, { type: 'discard', card: J }, rng).scores[0]).toBe(51);
    s.hands[0] = [c(2, 2)];
    s.hands[1] = [c(0, 1), J]; s.opened[1] = true;
    s.hands[2] = [c(3, 4)];
    s = Elli1.apply(s, 0, { type: 'discard', card: c(2, 2) }, rng);
    expect(s.lastHand!.deltas).toEqual([-51, 36, 102]);
    expect(Elli1.result(s)!.winners).toEqual([0]);
  });
  it('YZ maçları (2–4 kişi) hatasız biter, 108 kart korunur', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (let g = 0; g < 45; g++) {
      const r = seededRng(700 + g);
      const n = 2 + (g % 3);
      let s = Elli1.setup({ players: n, options: { hands: 1 } }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = s.turn;
        s = Elli1.apply(s, seat, Elli1.ai(Elli1.view(s, seat), seat, diffs[(g + seat) % 3], r), r);
        if (s.phase !== 'over') expect(s.hands.flat().length + s.pile.length + s.discard.length + s.melds.reduce((a, m) => a + m.cards.length, 0)).toBe(108);
        if (++steps > 3000) throw new Error('bitmedi');
      }
    }
  });
});
