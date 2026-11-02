import { describe, expect, it } from 'vitest';
import { OkeyGame, isWinningHand, okeyOf, tileId, isWild, type OkeyState } from '../src/games/okey';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(4);
// Renkler: 0 Sarı, 1 Mavi, 2 Siyah, 3 Kırmızı. Gösterge Kırmızı 7 → okey Kırmızı 8.
const IND = tileId(3, 7);
const OK = okeyOf(IND);
const t = (c: number, n: number, copy = 0) => tileId(c, n, copy);
const JOKER = t(3, 8); // okey taşı (joker)
const JOKER2 = t(3, 8, 1);

describe('Okey — taşlar ve okey', () => {
  it('okey göstergenin bir fazlası; 13 göstergede okey 1', () => {
    expect(OK).toEqual({ c: 3, n: 8 });
    expect(okeyOf(t(0, 13))).toEqual({ c: 0, n: 1 });
    expect(isWild(JOKER, OK)).toBe(true);
    expect(isWild(t(3, 9), OK)).toBe(false);
  });
});

describe('Okey — el kontrolü', () => {
  it('seriler ve gruplarla 14 taş biter', () => {
    const hand = [t(0, 1), t(0, 2), t(0, 3), t(0, 4), t(1, 5), t(1, 6), t(1, 7), t(0, 9), t(1, 9), t(2, 9), t(3, 9), t(2, 11), t(2, 12), t(2, 13)];
    expect(isWinningHand(hand, OK)).toBe('per');
  });
  it('12-13-1 geçerli, 13-1-2 geçersiz', () => {
    const rest = [t(0, 2), t(0, 3), t(0, 4), t(0, 5), t(1, 6), t(1, 7), t(1, 8), t(2, 9), t(2, 10), t(2, 11)];
    expect(isWinningHand([...rest, t(3, 11), t(3, 12), t(3, 13), t(3, 1)], OK)).toBe('per'); // Kırmızı 11-12-13-1
    expect(isWinningHand([...rest, t(3, 12), t(3, 13), t(3, 1), t(3, 2)], OK)).toBe(null);   // Kırmızı 12-13-1-2 olmaz
    expect(isWinningHand([...rest, t(3, 13), t(3, 1), t(3, 2), t(3, 3)], OK)).toBe(null);    // 1-2-3 seri olur ama 13 tek kalır
  });
  it('okey, gerçek taşı başka pere bırakmak için seride kullanılabilir', () => {
    // Sarı 3-4-[okey] | Sarı 5, Mavi 5, Siyah 5 | Mavi 9-12 | Siyah 1-4  (Sarı 5 seride değil grupta kullanılmalı)
    const hand = [t(0, 3), t(0, 4), JOKER, t(0, 5), t(1, 5), t(2, 5), t(1, 9), t(1, 10), t(1, 11), t(1, 12), t(2, 1), t(2, 2), t(2, 3), t(2, 4)];
    expect(hand).toHaveLength(14);
    expect(isWinningHand(hand, OK)).toBe('per');
  });
  it('sahte okey okeyin değerini alır (Kırmızı 8)', () => {
    const hand = [t(3, 6), t(3, 7), 104, t(0, 1), t(0, 2), t(0, 3), t(1, 1), t(1, 2), t(1, 3), t(2, 1), t(2, 2), t(2, 3), t(2, 4), t(2, 5)];
    expect(isWinningHand(hand, OK)).toBe('per');
    const wrong = [t(3, 1), t(3, 2), 104, ...hand.slice(3)]; // sahte okey 3 değil 8 olur
    expect(isWinningHand(wrong, OK)).toBe(null);
  });
  it('çifte bitiş: 7 çift, okey eşsiz taşı tamamlar', () => {
    const pairs = [t(0, 1), t(0, 1, 1), t(1, 4), t(1, 4, 1), t(2, 9), t(2, 9, 1), t(3, 2), t(3, 2, 1), t(0, 13), t(0, 13, 1), t(1, 7), t(1, 7, 1), t(2, 3), JOKER];
    expect(isWinningHand(pairs, OK)).toBe('cift');
    const notPairs = [...pairs.slice(0, 12), t(2, 3), t(3, 11)];
    expect(isWinningHand(notPairs, OK)).toBe(null);
  });
  it('iki okey taşı iki eksiği tamamlar', () => {
    const hand = [t(0, 1), JOKER, t(0, 3), t(1, 7), t(2, 7), JOKER2, t(0, 10), t(0, 11), t(0, 12), t(1, 1), t(1, 2), t(1, 3), t(1, 4), t(1, 5)];
    expect(isWinningHand(hand, OK)).toBe('per');
  });
});

describe('Okey — oyun akışı', () => {
  const st = (): OkeyState => OkeyGame.setup({ players: 4, options: { hands: 1 } }, seededRng(2));
  it('dağıtım: dağıtan 15, diğerleri 14, ortada 48; toplam 106', () => {
    const s = st();
    expect(s.hands[s.dealer]).toHaveLength(15);
    expect(s.hands.filter((h) => h.length === 14)).toHaveLength(3);
    expect(s.pile).toHaveLength(48);
    expect(new Set([...s.hands.flat(), ...s.pile, s.indicator]).size).toBe(106);
    expect(s.indicator).toBeLessThan(104);
    expect(s.phase).toBe('discard');
  });
  it('at → çek (ortadan veya yandan) → at; sıra kontrolü', () => {
    let s = st();
    const d = s.dealer, next = (d + 1) % 4;
    const tile = s.hands[d][0];
    expect(() => OkeyGame.apply(s, next, { type: 'discard', tile: s.hands[next][0] }, rng)).toThrow('Sıra sizde değil');
    s = OkeyGame.apply(s, d, { type: 'discard', tile }, rng);
    expect(s.turn).toBe(next);
    expect(() => OkeyGame.apply(s, next, { type: 'discard', tile: s.hands[next][0] }, rng)).toThrow('Önce taş çekin');
    s = OkeyGame.apply(s, next, { type: 'draw', from: 'discard' }, rng);
    expect(s.hands[next]).toContain(tile);
    expect(s.discards[d]).toHaveLength(0);
  });
  it('bitmeyen elle "bitir" reddedilir; geçerli elle biter ve puan düşülür', () => {
    let s = st();
    const d = s.dealer;
    expect(() => OkeyGame.apply(s, d, { type: 'finish', tile: s.hands[d][0] }, rng)).toThrow('Eliniz bitmiyor');
    const win = [t(0, 1), t(0, 2), t(0, 3), t(0, 4), t(1, 5), t(1, 6), t(1, 7), t(0, 9), t(1, 9), t(2, 9), t(3, 9), t(2, 11), t(2, 12), t(2, 13)];
    s = { ...s, okey: OK, hands: s.hands.map((h, p) => (p === d ? [...win, JOKER] : h)) };
    s = OkeyGame.apply(s, d, { type: 'finish', tile: JOKER }, rng);
    expect(s.lastHand).toMatchObject({ winner: d, kind: 'Bitiş (okey atarak)', points: 4 });
    expect(s.scores.filter((v) => v === 16)).toHaveLength(3);
    expect(s.phase).toBe('over');
  });
  it('göstergeyi gösteren için diğerlerinden 1 düşülür; yalnızca ilk taşı atmadan önce', () => {
    let s = st();
    const d = s.dealer;
    const twin = s.indicator % 2 === 0 ? s.indicator + 1 : s.indicator - 1;
    s = { ...s, hands: s.hands.map((h, p) => (p === d ? [...h.slice(0, 14), twin] : h.filter((x) => x !== twin))) };
    expect(OkeyGame.legalActions(s, d).some((a) => a.type === 'show')).toBe(true);
    s = OkeyGame.apply(s, d, { type: 'show' }, rng);
    expect(s.scores.filter((v) => v === 19)).toHaveLength(3);
    expect(OkeyGame.legalActions(s, d).some((a) => a.type === 'show')).toBe(false);
  });
  it('görünüm diğer elleri ve ortadaki taşları göstermez', () => {
    const s = st();
    const v = OkeyGame.view(s, 0);
    expect((v as any).hands).toBeUndefined();
    expect((v as any).pile).toBeUndefined();
    expect(v.pileCount).toBe(48);
  });
  it('120 YZ eli: her hamle geçerli, 106 taş korunur', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    let finished = 0;
    for (let g = 0; g < 120; g++) {
      const r = seededRng(300 + g);
      let s = OkeyGame.setup({ players: 4, options: { hands: 1 } }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = s.turn;
        const v = OkeyGame.view(s, seat);
        const a = OkeyGame.ai(v, seat, diffs[(g + seat) % 3], r);
        if (a.type !== 'draw') expect(v.legal.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true);
        s = OkeyGame.apply(s, seat, a, r);
        if (s.phase !== 'over') expect(s.hands.flat().length + s.pile.length + s.discards.flat().length + 1).toBe(106);
        if (++steps > 1000) throw new Error('bitmedi');
      }
      if (s.lastHand?.winner !== null) finished++;
    }
    expect(finished).toBeGreaterThan(30); // YZ'ler gerçekten el bitirebiliyor
  });
});
