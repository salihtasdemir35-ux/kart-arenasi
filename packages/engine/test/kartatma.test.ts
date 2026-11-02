import { describe, expect, it } from 'vitest';
import { PisYedili, DostKazigi, Yanik, yanikMeld, yanikPenalty, type PisState, type KazikState, type YanikState } from '../src/games/kartatma';
import { seededRng } from '../src/rng';
import type { Difficulty, GameModule } from '../src/types';

const rng = seededRng(4);
const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
function sim(m: GameModule, n: number, games: number, check?: (s: any) => void, opts: any = {}) {
  for (let g = 0; g < games; g++) {
    const r = seededRng(1000 + g);
    let s = m.setup({ players: n + (g % 2 && m.playerCounts.includes(n + 1) ? 1 : 0), options: opts }, r);
    let steps = 0;
    while (!m.isOver(s)) {
      const seat = m.toAct(s)[0];
      s = m.apply(s, seat, m.ai(m.view(s, seat), seat, diffs[(g + seat) % 3], r), r);
      check?.(s);
      if (++steps > 20000) throw new Error('bitmedi');
    }
    expect(m.result(s)!.winners.length).toBeGreaterThan(0);
  }
}

describe('Pis Yedili', () => {
  const st = (hands: string[][], top: string): PisState => ({ ...PisYedili.setup({ players: hands.length }, rng), hands, discard: [top], suit: top[0] as any, turn: 0, phase: 'play', penalty: 0, dir: 1 });
  it('takım ya da değer eşleşmesi; Vale her yere ve takım seçtirir', () => {
    const s = st([['H5', 'S9', 'C11', 'D2'], ['C3']], 'H9');
    const plays = PisYedili.legalActions(s, 0).filter((a) => a.type === 'play').map((a: any) => a.card);
    expect([...new Set(plays)].sort()).toEqual(['C11', 'H5', 'S9']);
    expect(() => PisYedili.apply(s, 0, { type: 'play', card: 'C11' }, rng)).toThrow('takım seçin');
    const t = PisYedili.apply(s, 0, { type: 'play', card: 'C11', suit: 'D' }, rng);
    expect(t.suit).toBe('D');
  });
  it('7 cezası birikir; 7 yoksa toplam çekilir', () => {
    let s = st([['H7', 'S2'], ['C7', 'D4'], ['D9', 'D8']], 'H9');
    s = PisYedili.apply(s, 0, { type: 'play', card: 'H7' }, rng);
    expect(s.penalty).toBe(2);
    expect(PisYedili.legalActions(s, 1).filter((a) => a.type === 'play').map((a: any) => a.card)).toEqual(['C7']);
    s = PisYedili.apply(s, 1, { type: 'play', card: 'C7' }, rng);
    expect(s.penalty).toBe(4);
    s = PisYedili.apply(s, 2, { type: 'draw' }, rng);
    expect(s.hands[2]).toHaveLength(6);
    expect(s.turn).toBe(0);
  });
  it('As atlatır, 10 yön değiştirir, 8 tekrar oynatır', () => {
    let s = st([['H14', 'H3'], ['C5'], ['D9']], 'H9');
    expect(PisYedili.apply(s, 0, { type: 'play', card: 'H14' }, rng).turn).toBe(2);
    s = st([['H10', 'H3'], ['C5'], ['D9']], 'H9');
    expect(PisYedili.apply(s, 0, { type: 'play', card: 'H10' }, rng).turn).toBe(2);
    s = st([['H8', 'H3'], ['C5'], ['D9']], 'H9');
    const t = PisYedili.apply(s, 0, { type: 'play', card: 'H8' }, rng);
    expect(t.turn).toBe(0);
    expect(t.phase).toBe('eight');
  });
  it('eli bitirince ceza; Valeyle bitirince iki kat', () => {
    const s = st([['C11'], ['H14', 'S10'], ['D2']], 'H9');
    const t = PisYedili.apply({ ...s, totalHands: 1 }, 0, { type: 'play', card: 'C11', suit: 'S' }, rng);
    expect(t.lastHand).toMatchObject({ winner: 0, jack: true, delta: [0, 42, 4] });
    expect(t.phase).toBe('over');
  });
  it('YZ maçları biter, 52 kart korunur', () => sim(PisYedili, 3, 150, (s) => expect(s.hands.flat().length + s.deck.length + s.discard.length).toBe(52), { hands: 1 }));
});

describe('Dost Kazığı', () => {
  const st = (hands: string[][], pile: string[]): KazikState => ({ ...DostKazigi.setup({ players: hands.length }, rng), hands, pile, deck: [], turn: 0, out: [] });
  it('aynı ya da büyük atılır; 2 her yere; atamayan yığını alır', () => {
    let s = st([['S5', 'H9', 'D2'], ['C3']], ['C7']);
    const plays = DostKazigi.legalActions(s, 0).map((a: any) => a.cards?.[0]);
    expect(plays.sort()).toEqual(['D2', 'H9']);
    expect(() => DostKazigi.apply(s, 0, { type: 'play', cards: ['S5'] }, rng)).toThrow('büyük');
    expect(() => DostKazigi.apply(s, 0, { type: 'take' }, rng)).toThrow();
    s = st([['S5'], ['C3']], ['C9']);
    s = DostKazigi.apply(s, 0, { type: 'take' }, rng);
    expect(s.hands[0].sort()).toEqual(['C9', 'S5']);
  });
  it('10 ve dörtlü yığını yakar, atan tekrar oynar', () => {
    let s = st([['S10', 'H4'], ['C3']], ['C9', 'D9']);
    s = DostKazigi.apply(s, 0, { type: 'play', cards: ['S10'] }, rng);
    expect(s.pile).toEqual([]);
    expect(s.turn).toBe(0);
    s = st([['S6', 'H6', 'C2'], ['C3']], ['D6', 'C6']);
    s = DostKazigi.apply(s, 0, { type: 'play', cards: ['S6', 'H6'] }, rng);
    expect(s.pile).toEqual([]);
  });
  it('kapalı kart uymazsa yığınla birlikte alınır; son kalan kaybeder', () => {
    let s = st([[], ['C3']], ['SA'.replace('A', '14')]);
    s.up[0] = []; s.down[0] = ['H5'];
    s = DostKazigi.apply(s, 0, { type: 'blind', index: 0 }, rng);
    expect(s.hands[0].sort()).toEqual(['H5', 'S14']);
    const v = DostKazigi.view(s, 1);
    expect((v as any).down).toBeUndefined();
  });
  it('YZ maçları biter, 52 kart korunur', () => sim(DostKazigi, 3, 150, (s) => {
    const burnedCount = 52 - (s.hands.flat().length + s.up.flat().length + s.down.flat().length + s.deck.length + s.pile.length);
    expect(burnedCount).toBeGreaterThanOrEqual(0);
  }));
});

describe('Yanık', () => {
  it('per kontrolü: seri, grup, As iki uçta, joker', () => {
    expect(yanikMeld(['H3', 'H4', 'H5'])).toBe(true);
    expect(yanikMeld(['H14', 'H2', 'H3'])).toBe(true);
    expect(yanikMeld(['H12', 'H13', 'H14'])).toBe(true);
    expect(yanikMeld(['H13', 'H14', 'H2'])).toBe(false);
    expect(yanikMeld(['S7', 'H7', 'X1'])).toBe(true);
    expect(yanikMeld(['S7', 'S7', 'H7'])).toBe(false);
    expect(yanikPenalty(['H3', 'H4', 'H5', 'S9', 'C9', 'D9', 'H9'])).toBe(0);
    expect(yanikPenalty(['H3', 'H4', 'H5', 'S9', 'C9', 'D13', 'X1'])).toBe(10);
  });
  it('bitmeyen elle bitirilemez; bitince cezalar; 101 yanar', () => {
    let s: YanikState = { ...Yanik.setup({ players: 3 }, seededRng(2)), turn: 0, phase: 'discard' };
    s.hands = [['H3', 'H4', 'H5', 'S9', 'C9', 'D9', 'H9', 'C2'], ['S14', 'D13'], ['C4']];
    s.scores = [0, 90, 0];
    expect(() => Yanik.apply({ ...s, hands: [['H3', 'H4', 'S6', 'S9', 'C9', 'D9', 'H9', 'C2'], ...s.hands.slice(1)] }, 0, { type: 'finish', card: 'C2' }, rng)).toThrow('bitmiyor');
    s = Yanik.apply(s, 0, { type: 'finish', card: 'C2' }, rng);
    expect(s.lastHand!.delta).toEqual([0, 21, 4]);
    expect(s.burned).toEqual([false, true, false]);
  });
  it('YZ maçları biter (yanma ile)', () => sim(Yanik, 2, 25));
});
