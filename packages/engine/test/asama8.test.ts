import { describe, expect, it } from 'vitest';
import { Poker, eval5, cmpHands, bestHand, handName, type PokerState } from '../src/games/poker';
import { Blackjack, total, type BJState } from '../src/games/blackjack';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(7);

describe('Poker — el değerlendirme', () => {
  const h = (s: string) => eval5(s.split(' '));
  it('kategoriler doğru sırada', () => {
    const hands = ['S14 S13 S12 S11 S10', 'H9 H8 H7 H6 H5', 'C9 D9 H9 S9 C2', 'C9 D9 H9 S4 C4', 'H2 H7 H9 H11 H13', 'C5 D6 H7 S8 C9', 'C9 D9 H9 S4 C2', 'C9 D9 H4 S4 C2', 'C9 D9 H4 S3 C2', 'C14 D9 H4 S3 C2'];
    const names = ['Floş royal', 'Floş sıralı', 'Kare', 'Full', 'Floş', 'Sıralı', 'Üçlü', 'Döper', 'Per', 'Yüksek kart'];
    hands.forEach((x, i) => expect(handName(h(x))).toBe(names[i]));
    for (let i = 0; i + 1 < hands.length; i++) expect(cmpHands(h(hands[i]), h(hands[i + 1]))).toBeGreaterThan(0);
  });
  it('A-2-3-4-5 en küçük sıralı; eşitlik bozucular', () => {
    expect(h('S14 H2 D3 C4 S5')).toEqual([4, 5]);
    expect(cmpHands(h('S6 H2 D3 C4 S5'), h('S14 H2 D3 C4 S5'))).toBeGreaterThan(0);
    expect(cmpHands(h('S14 H14 D9 C4 S3'), h('C14 D14 H9 S4 C2'))).toBeGreaterThan(0);
    expect(cmpHands(h('S14 H14 D9 C4 S3'), h('C14 D14 H9 S4 C3'))).toBe(0);
  });
  it('Omaha: tam 2 kapalı + 3 ortak (tahtada 4 kupa, elde 1 kupa → floş yok)', () => {
    const board = ['H2', 'H5', 'H9', 'H12', 'S3'];
    expect(handName(bestHand('holdem', ['H14', 'C7'], board))).toBe('Floş');
    expect(handName(bestHand('omaha', ['H14', 'C7', 'D8', 'S11'], board))).not.toBe('Floş');
    expect(handName(bestHand('omaha', ['H14', 'H7', 'D8', 'S11'], board))).toBe('Floş');
  });
});

describe('Poker — bahis ve potlar', () => {
  it('körler, en az artırma, çekilince pot', () => {
    let s = Poker.setup({ players: 3 }, seededRng(1));
    const total0 = s.chips.reduce((a, b) => a + b, 0) + s.contrib.reduce((a, b) => a + b, 0);
    expect(total0).toBe(3000);
    expect(s.contrib.filter((c) => c > 0).sort()).toEqual([10, 20]);
    expect(() => Poker.apply(s, s.turn, { type: 'raise', to: 30 }, rng)).toThrow('En az 40');
    s = Poker.apply(s, s.turn, { type: 'raise', to: 60 }, rng);
    s = Poker.apply(s, s.turn, { type: 'fold' }, rng);
    s = Poker.apply(s, s.turn, { type: 'fold' }, rng);
    expect(s.phase).toBe('over');
    expect(s.lastHand!.winners[0].hand).toBe('Herkes çekildi');
    expect(s.chips.reduce((a, b) => a + b, 0)).toBe(3000);
  });
  it('yan pot: kısa all-in yalnızca katkısı kadarını kazanabilir', () => {
    let s = Poker.setup({ players: 3 }, seededRng(2));
    s = { ...s, chips: [0, 0, 0] } as PokerState;
    // Elle kurulmuş açık: 0 → 100 katkı (en iyi el), 1 ve 2 → 300 katkı
    const st: PokerState = { ...s, variant: 'holdem', holes: [['S14', 'H14'], ['C13', 'D13'], ['C2', 'D7']], board: ['S2', 'H8', 'D11', 'C4', 'S9'], folded: [false, false, false], contrib: [100, 300, 300], chips: [0, 700, 700], phase: 'bet', toActLeft: [], deck: [] } as PokerState;
    const fn = (Poker as any);
    // showdown'u tetiklemek için: son konuşan oyuncu "check" yapsın
    const t = fn.apply({ ...st, toActLeft: [1], turn: 1, currentBet: 0, bets: [0, 0, 0], street: 3 }, 1, { type: 'check' }, rng) as PokerState;
    const w = Object.fromEntries(t.lastHand!.winners.map((x) => [x.seat, x.amount]));
    expect(w[0]).toBe(300); // ana pot 100×3
    expect(w[1]).toBe(400); // yan pot 200×2
    expect(t.chips.reduce((a, b) => a + b, 0)).toBe(2100);
  });
  it('Omaha pot limiti aşılamaz', () => {
    const s = Poker.setup({ players: 2, options: { variant: 'omaha' } }, seededRng(3));
    const v = Poker.view(s, s.turn);
    expect(v.maxRaiseTo).toBeLessThan(1000);
    expect(() => Poker.apply(s, s.turn, { type: 'raise', to: v.maxRaiseTo + 10 }, rng)).toThrow('pot limit');
  });
  it('kapalı kartlar gizli', () => {
    const s = Poker.setup({ players: 4 }, seededRng(4));
    const v = Poker.view(s, 0);
    for (const c of s.holes[1]) expect(JSON.stringify(v).includes(`"${c}"`)).toBe(false);
  });
  it('YZ maçları (3 tür): fiş korunur, oyun biter', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (const [g, variant] of [[0, 'holdem'], [1, 'omaha'], [2, 'draw'], [3, 'holdem'], [4, 'omaha'], [5, 'draw']] as const) {
      const r = seededRng(50 + g);
      const n = 2 + (g % 4);
      let s = Poker.setup({ players: n, options: { variant, hands: 30 } }, r);
      let steps = 0;
      while (!Poker.isOver(s)) {
        const seat = Poker.toAct(s)[0];
        s = Poker.apply(s, seat, Poker.ai(Poker.view(s, seat), seat, diffs[(g + seat) % 3], r), r);
        expect(s.chips.reduce((a, b) => a + b, 0) + s.contrib.reduce((a, b) => a + b, 0)).toBe(1000 * n);
        expect(s.chips.every((c) => c >= 0)).toBe(true);
        if (++steps > 20000) throw new Error('bitmedi');
      }
      expect(Poker.result(s)!.winners.length).toBeGreaterThan(0);
    }
  });
});

describe('Blackjack', () => {
  it('toplam ve yumuşak el', () => {
    expect(total(['S14#0', 'H6#1'])).toEqual({ total: 17, soft: true });
    expect(total(['S14#0', 'H6#1', 'D10#0'])).toEqual({ total: 17, soft: false });
    expect(total(['S14#0', 'H14#1', 'D9#0'])).toEqual({ total: 21, soft: true });
  });
  it('bahis kuralları; blackjack 3:2; kasa 17’de durur', () => {
    let s = Blackjack.setup({ players: 1, options: { rounds: 5 } }, seededRng(1));
    expect(() => Blackjack.apply(s, 0, { type: 'bet', amount: 15 }, rng)).toThrow();
    // Ayakkabıyı ayarla: oyuncu A+K (blackjack), kasa 10+7
    s = { ...s, shoe: [...s.shoe.slice(0, 200), 'C7#0', 'D10#0', 'S13#0', 'H14#0'] } as BJState;
    s = Blackjack.apply(s, 0, { type: 'bet', amount: 100 }, rng);
    expect(s.lastRound!.results[0][0]).toBe('Blackjack!');
    expect(s.chips[0]).toBe(1150);
    expect(s.lastRound!.dealerTotal).toBe(17);
  });
  it('ikiye katlama ve bölme', () => {
    let s = Blackjack.setup({ players: 1, options: { rounds: 5 } }, seededRng(2));
    s = { ...s, shoe: [...s.shoe.slice(0, 200), 'C3#0', 'D2#0', 'S9#0', 'H10#0', 'C8#0', 'D8#0'] } as BJState;
    s = Blackjack.apply(s, 0, { type: 'bet', amount: 100 }, rng);
    expect(Blackjack.legalActions(s, 0).some((a) => a.type === 'split')).toBe(true);
    s = Blackjack.apply(s, 0, { type: 'split' }, rng);
    expect(s.hands[0]).toHaveLength(2);
    expect(s.chips[0]).toBe(800);
    s = Blackjack.apply(s, 0, { type: 'double' }, rng);
    expect(s.hands[0][0].bet).toBe(200);
  });
  it('YZ ile 7 kişilik maçlar biter; kasa görünümde kapalı kart gizli', () => {
    for (let g = 0; g < 30; g++) {
      const r = seededRng(g);
      let s = Blackjack.setup({ players: 1 + (g % 7), options: { rounds: 20 } }, r);
      while (s.phase !== 'over') {
        if (s.phase === 'play') expect(Blackjack.view(s, 0).dealerShown).toHaveLength(1);
        s = Blackjack.apply(s, s.turn, Blackjack.ai(Blackjack.view(s, s.turn), s.turn, (['kolay', 'orta', 'zor'] as const)[g % 3], r), r);
        expect(s.chips.every((c) => c >= 0)).toBe(true);
      }
    }
  });
});
