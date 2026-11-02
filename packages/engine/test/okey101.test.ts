import { describe, expect, it } from 'vitest';
import { Okey101, meldInfo, bestMelds, type O101State } from '../src/games/okey101';
import { okeyOf, tileId } from '../src/games/okey';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(6);
const t = (c: number, n: number, copy = 0) => tileId(c, n, copy);
const IND = tileId(3, 7);
const OK = okeyOf(IND); // Kırmızı 8
const J = t(3, 8);

function st(): O101State {
  const s = Okey101.setup({ players: 4, options: { hands: 1 } }, seededRng(2));
  return { ...s, indicator: IND, okey: OK, turn: 0, phase: 'play', dealer: 0 };
}

describe('101 — perler', () => {
  it('grup ve seri puanları; joker en yüksek değerli yere', () => {
    expect(meldInfo([t(0, 10), t(1, 10), t(2, 10)], OK)).toEqual({ kind: 'grup', points: 30 });
    expect(meldInfo([t(0, 11), t(0, 12), J], OK)).toEqual({ kind: 'seri', points: 36 }); // 11-12-13
    expect(meldInfo([t(0, 12), t(0, 13), t(0, 1)], OK)).toEqual({ kind: 'seri', points: 26 }); // 12-13-1
    expect(meldInfo([t(0, 13), t(0, 1), t(0, 2)], OK)).toBeNull();
    expect(meldInfo([t(0, 5), t(1, 5), t(1, 5, 1)], OK)).toBeNull();
    expect(meldInfo([t(0, 5), t(0, 6)], OK)).toBeNull();
  });
  it('en iyi per kümesi ayrık taşlardan oluşur', () => {
    const hand = [t(0, 10), t(0, 11), t(0, 12), t(0, 13), t(1, 13), t(2, 13), t(1, 9), t(1, 10), t(1, 11), J];
    const b = bestMelds(hand, OK);
    expect(new Set(b.melds.flat()).size).toBe(b.melds.flat().length);
    expect(b.points).toBeGreaterThanOrEqual(46 + 39 + 30);
  });
});

describe('101 — açma, işleme, cezalar', () => {
  const opening = [[t(0, 10), t(0, 11), t(0, 12), t(0, 13)], [t(1, 13), t(2, 13), t(3, 13)], [t(1, 9), t(1, 10), t(1, 11)]]; // 46+39+30 = 115
  it('101 altı açılış reddedilir, 101 ve üstü kabul', () => {
    let s = st();
    s.hands[0] = [...opening.flat(), t(0, 2), t(1, 4), t(2, 6), t(2, 7)];
    expect(() => Okey101.apply(s, 0, { type: 'open', melds: [opening[2]] }, rng)).toThrow('en az 101');
    s = Okey101.apply(s, 0, { type: 'open', melds: opening }, rng);
    expect(s.opened[0]).toBe('per');
    expect(s.melds).toHaveLength(3);
    expect(s.hands[0]).toHaveLength(4);
  });
  it('5 çiftle açma; çift az ise ret', () => {
    const s = st();
    const pairs = [[t(0, 1), t(0, 1, 1)], [t(1, 2), t(1, 2, 1)], [t(2, 3), t(2, 3, 1)], [t(0, 4), t(0, 4, 1)], [t(1, 6), J]];
    s.hands[0] = [...pairs.flat(), t(2, 9)];
    expect(() => Okey101.apply(s, 0, { type: 'open', melds: pairs.slice(0, 4) }, rng)).toThrow('en az 5 çift');
    const t2 = Okey101.apply(s, 0, { type: 'open', melds: pairs }, rng);
    expect(t2.opened[0]).toBe('cift');
  });
  it('açmadan işleme yapılamaz; açtıktan sonra uygun pere işlenir', () => {
    let s = st();
    s.hands[0] = [...opening.flat(), t(0, 9), t(1, 4), t(2, 6)];
    expect(() => Okey101.apply(s, 0, { type: 'process', tile: t(0, 9), meld: 0 }, rng)).toThrow('önce elinizi');
    s = Okey101.apply(s, 0, { type: 'open', melds: opening }, rng);
    expect(() => Okey101.apply(s, 0, { type: 'process', tile: t(1, 4), meld: 0 }, rng)).toThrow('uymuyor');
    s = Okey101.apply(s, 0, { type: 'process', tile: t(0, 9), meld: 0 }, rng);
    expect(s.melds[0].tiles).toHaveLength(5);
  });
  it('işlenebilir taş atmak ve okey atmak +101 ceza', () => {
    let s = st();
    s.hands[0] = [...opening.flat(), t(1, 12), J, t(2, 2)];
    s = Okey101.apply(s, 0, { type: 'open', melds: opening }, rng);
    const a = Okey101.apply(s, 0, { type: 'discard', tile: t(1, 12) }, rng); // mavi 9-10-11'e işlenirdi
    expect(a.scores[0]).toBe(101);
    const b = Okey101.apply(s, 0, { type: 'discard', tile: J }, rng);
    expect(b.scores[0]).toBe(101);
    const c = Okey101.apply(s, 0, { type: 'discard', tile: t(2, 2) }, rng);
    expect(c.scores[0]).toBe(0);
  });
  it('yandan alınan taş kullanılmadan atış yapılamaz; geri bırakılabilir', () => {
    let s = st();
    s.phase = 'draw';
    s.discards[3] = [t(2, 5)];
    s = Okey101.apply(s, 0, { type: 'draw', from: 'discard' }, rng);
    expect(() => Okey101.apply(s, 0, { type: 'discard', tile: s.hands[0][0] }, rng)).toThrow('Yandan aldığınız');
    expect(Okey101.legalActions(s, 0)).toEqual([{ type: 'undoTake' }]);
    const before = s.hands[0].length;
    s = Okey101.apply(s, 0, { type: 'undoTake' }, rng);
    expect(s.discards[3]).toEqual([t(2, 5)]);
    expect(s.hands[0]).toHaveLength(before);
    expect(s.hands[0]).not.toContain(t(2, 5));
  });
  it('el sonu: bitiren −101, açmayan +202, açan elindeki toplam', () => {
    let s = st();
    s.hands[0] = [...opening.flat(), t(2, 2)];
    s.hands[1] = [t(0, 5), t(1, 6)]; s.opened[1] = 'per';
    s.hands[2] = [t(0, 3)];
    s.hands[3] = [J, t(1, 1)]; s.opened[3] = 'per';
    s = Okey101.apply(s, 0, { type: 'open', melds: opening }, rng);
    s = Okey101.apply(s, 0, { type: 'discard', tile: t(2, 2) }, rng);
    expect(s.lastHand!.deltas).toEqual([-101, 11, 202, 102]);
    expect(s.phase).toBe('over');
  });
  it('dağıtım 22/21/21/21, ortada 20; diğer eller görünmez', () => {
    const s = Okey101.setup({ players: 4 }, seededRng(3));
    expect(s.hands[s.dealer]).toHaveLength(22);
    expect(s.pile).toHaveLength(20);
    const v = Okey101.view(s, 0);
    expect((v as any).hands).toBeUndefined();
    expect((v as any).pile).toBeUndefined();
  });
  it('60 YZ eli hatasız biter, 106 taş korunur ve açılışlar olur', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    let opens = 0;
    for (let g = 0; g < 60; g++) {
      const r = seededRng(500 + g);
      let s = Okey101.setup({ players: 4, options: { hands: 1 } }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = s.turn;
        s = Okey101.apply(s, seat, Okey101.ai(Okey101.view(s, seat), seat, diffs[(g + seat) % 3], r), r);
        if (s.phase !== 'over') expect(s.hands.flat().length + s.pile.length + s.discards.flat().length + s.melds.reduce((a, m) => a + m.tiles.length, 0) + 1).toBe(106);
        if (++steps > 3000) throw new Error('bitmedi');
      }
      opens += s.lastHand!.deltas.filter((d) => d !== 202).length;
    }
    expect(opens).toBeGreaterThan(60);
  });
});
