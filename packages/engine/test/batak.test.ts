import { describe, expect, it } from 'vitest';
import { Batak, legalCards, trickWinner, estimateTricks, type BatakState } from '../src/games/batak';
import { seededRng } from '../src/rng';
import { suitOf } from '../src/cards';
import type { Difficulty } from '../src/types';

const rng = seededRng(7);

function playState(partial: Partial<BatakState>): BatakState {
  const s = Batak.setup({ players: 4 }, seededRng(2));
  return { ...s, phase: 'play', trump: 'S', bidder: 0, highBid: 5, trumpBroken: false, trick: [], ...partial } as BatakState;
}

describe('Batak — dağıtım ve ihale', () => {
  it('herkese 13 kart, 52 farklı kart', () => {
    const s = Batak.setup({ players: 4 }, rng);
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(s.hands.flat()).size).toBe(52);
    expect(s.phase).toBe('bid');
    expect(s.turn).toBe((s.dealer + 1) % 4);
  });
  it('4 dışında oyuncu sayısı reddedilir', () => {
    expect(() => Batak.setup({ players: 3 }, rng)).toThrow();
  });
  it('ihale en düşük 4, önceki ihaleden küçük verilemez', () => {
    let s = Batak.setup({ players: 4 }, seededRng(3));
    const p = s.turn;
    expect(() => Batak.apply(s, p, { type: 'bid', value: 3 }, rng)).toThrow();
    s = Batak.apply(s, p, { type: 'bid', value: 6 }, rng);
    const q = s.turn;
    expect(() => Batak.apply(s, q, { type: 'bid', value: 6 }, rng)).toThrow();
    expect(Batak.legalActions(s, q).filter((a) => a.type === 'bid').map((a: any) => a.value)[0]).toBe(7);
  });
  it('herkes pas derse dağıtan en düşük ihaleyle alır ve koz seçer', () => {
    let s = Batak.setup({ players: 4 }, seededRng(4));
    for (let i = 0; i < 4; i++) s = Batak.apply(s, s.turn, { type: 'pass' }, rng);
    expect(s.phase).toBe('trump');
    expect(s.bidder).toBe(s.dealer);
    expect(s.highBid).toBe(4);
    expect(s.turn).toBe(s.dealer);
  });
  it('tek kalan ihaleci ihaleyi alır; pas diyen tekrar sıraya girmez', () => {
    let s = Batak.setup({ players: 4 }, seededRng(5));
    const first = s.turn;
    s = Batak.apply(s, first, { type: 'bid', value: 5 }, rng);
    const second = s.turn;
    s = Batak.apply(s, second, { type: 'pass' }, rng);
    s = Batak.apply(s, s.turn, { type: 'bid', value: 6 }, rng);
    const bidder6 = (first + 2) % 4;
    s = Batak.apply(s, s.turn, { type: 'pass' }, rng); // 4. oyuncu
    expect(s.turn).toBe(first); // ikinci oyuncu atlandı
    s = Batak.apply(s, first, { type: 'pass' }, rng);
    expect(s.phase).toBe('trump');
    expect(s.bidder).toBe(bidder6);
  });
  it('13 ihalesi ihaleyi hemen bitirir', () => {
    let s = Batak.setup({ players: 4 }, seededRng(6));
    const p = s.turn;
    s = Batak.apply(s, p, { type: 'bid', value: 13 }, rng);
    expect(s.phase).toBe('trump');
    expect(s.bidder).toBe(p);
  });
});

describe('Batak — oyun kuralları', () => {
  it('koz kırılmadan kozla el açılamaz', () => {
    expect(legalCards(['S5', 'H3', 'D9'], [], 'S', false).sort()).toEqual(['D9', 'H3']);
    expect(legalCards(['S5', 'S9'], [], 'S', false).sort()).toEqual(['S5', 'S9']);
    expect(legalCards(['S5', 'H3'], [], 'S', true).sort()).toEqual(['H3', 'S5']);
  });
  it('renge uymak ve yükseltmek zorunlu', () => {
    const trick = [{ seat: 0, card: 'H10' }];
    expect(legalCards(['H4', 'H12', 'H14', 'S2', 'D5'], trick, 'S', false).sort()).toEqual(['H12', 'H14']);
    expect(legalCards(['H4', 'H8', 'S2'], trick, 'S', false).sort()).toEqual(['H4', 'H8']);
  });
  it('masada koz varken açılan rengi yükseltme zorunluluğu yok', () => {
    const trick = [{ seat: 0, card: 'H10' }, { seat: 1, card: 'S3' }];
    expect(legalCards(['H4', 'H12'], trick, 'S', true).sort()).toEqual(['H12', 'H4']);
  });
  it('renk yoksa koz zorunlu, masadaki kozu geçmek zorunlu', () => {
    const trick = [{ seat: 0, card: 'H10' }, { seat: 1, card: 'S7' }];
    expect(legalCards(['S4', 'S9', 'D3'], trick, 'S', true)).toEqual(['S9']);
    expect(legalCards(['S4', 'S5', 'D3'], trick, 'S', true).sort()).toEqual(['S4', 'S5']);
    expect(legalCards(['D3', 'C5'], trick, 'S', true).sort()).toEqual(['C5', 'D3']);
  });
  it('el kazananı: koz yoksa açılan rengin en büyüğü, varsa en büyük koz', () => {
    expect(trickWinner([{ seat: 0, card: 'H10' }, { seat: 1, card: 'H14' }, { seat: 2, card: 'D14' }, { seat: 3, card: 'H2' }], 'S')).toBe(1);
    expect(trickWinner([{ seat: 0, card: 'H10' }, { seat: 1, card: 'H14' }, { seat: 2, card: 'S2' }, { seat: 3, card: 'S5' }], 'S')).toBe(3);
    expect(trickWinner([{ seat: 2, card: 'C3' }, { seat: 3, card: 'D14' }, { seat: 0, card: 'C4' }, { seat: 1, card: 'H14' }], 'S')).toBe(0);
  });
  it('kural dışı kart sunucuda açıklamalı reddedilir', () => {
    const s = playState({ turn: 1, trick: [{ seat: 0, card: 'H10' }], hands: [[], ['H4', 'H12', 'S2'], ['C2'], ['C3']] });
    expect(() => Batak.apply(s, 1, { type: 'play', card: 'S2' }, rng)).toThrow('Yerdeki renge uymak zorundasınız');
    expect(() => Batak.apply(s, 1, { type: 'play', card: 'H4' }, rng)).toThrow('Yerdeki kartı geçmek zorundasınız');
    const t = Batak.apply(s, 1, { type: 'play', card: 'H12' }, rng);
    expect(t.turn).toBe(2);
  });
  it('ihaleci tutturursa aldığı el kadar artı, tutturamazsa ihale kadar eksi', () => {
    // Son el: ihaleci 0, ihale 5; şu ana kadar 0:4 el
    const base = playState({ tricksWon: [4, 3, 3, 2], totalHands: 1, handNo: 1, scores: [0, 0, 0, 0] });
    const s = { ...base, turn: 0, trick: [], hands: [['H14'], ['H2'], ['H3'], ['H4']] } as BatakState;
    let t = s;
    for (let i = 0; i < 4; i++) t = Batak.apply(t, t.turn, Batak.legalActions(t, t.turn)[0] as any, rng);
    expect(t.phase).toBe('over');
    expect(t.scores).toEqual([5, 3, 3, 2]);
    const s2 = { ...s, hands: [['H2'], ['H14'], ['H3'], ['H4']] } as BatakState;
    t = s2;
    for (let i = 0; i < 4; i++) t = Batak.apply(t, t.turn, Batak.legalActions(t, t.turn)[0] as any, rng);
    expect(t.scores).toEqual([-5, 4, 3, 2]);
  });
});

describe('Eşli Batak', () => {
  it('takım ihalesi: takımın toplam eli ihaleye ulaşırsa artı, ulaşamazsa eksi; eşler aynı puanı alır', () => {
    const base = playState({ esli: true, tricksWon: [3, 3, 2, 4], totalHands: 1, handNo: 1, scores: [0, 0, 0, 0], bidder: 0, highBid: 6 } as any);
    const s = { ...base, turn: 0, trick: [], hands: [['H14'], ['H2'], ['H3'], ['H4']] } as BatakState;
    let t = s;
    for (let i = 0; i < 4; i++) t = Batak.apply(t, t.turn, Batak.legalActions(t, t.turn)[0] as any, rng);
    // Takım 0-2: 3+2+1 = 6 el → ihale 6 tuttu → +6 ; takım 1-3: 3+4 = 7
    expect(t.scores).toEqual([6, 7, 6, 7]);
    const s2 = { ...base, highBid: 8, turn: 0, trick: [], hands: [['H14'], ['H2'], ['H3'], ['H4']] } as BatakState;
    t = s2;
    for (let i = 0; i < 4; i++) t = Batak.apply(t, t.turn, Batak.legalActions(t, t.turn)[0] as any, rng);
    expect(t.scores).toEqual([-8, 7, -8, 7]);
    expect(Batak.result(t)!.winners).toEqual([1, 3]);
  });
  it('eşli YZ maçları biter', () => {
    for (let g = 0; g < 100; g++) {
      const r = seededRng(g);
      let s = Batak.setup({ players: 4, options: { esli: true } }, r);
      while (!Batak.isOver(s)) s = Batak.apply(s, s.turn, Batak.ai(Batak.view(s, s.turn), s.turn, 'orta', r), r);
      expect(s.scores[0]).toBe(s.scores[2]);
      expect(s.scores[1]).toBe(s.scores[3]);
    }
  });
});

describe('Koz Maça ve Gömmeli Batak', () => {
  it('Koz Maça: herkes söz verir (pas yok), koz maça, söz puanlaması', () => {
    let s = Batak.setup({ players: 4, options: { variant: 'kozmaca' } }, seededRng(5));
    expect(Batak.legalActions(s, s.turn).some((a) => a.type === 'pass')).toBe(false);
    for (let k = 0; k < 4; k++) s = Batak.apply(s, s.turn, { type: 'bid', value: 3 }, rng);
    expect(s.phase).toBe('play');
    expect(s.trump).toBe('S');
    expect(s.turn).toBe((s.dealer + 1) % 4);
    const t = { ...s, tricksWon: [4, 2, 3, 3], hands: [['H14'], ['H2'], ['H3'], ['H4']], turn: 0, trick: [] } as BatakState;
    let u = t;
    for (let i = 0; i < 4; i++) u = Batak.apply(u, u.turn, Batak.legalActions(u, u.turn)[0] as any, rng);
    expect(u.scores).toEqual([5, -3, 3, 3]);
  });
  it('Gömmeli: 3 kişi, 16 kart + 4 gömü; ihaleci gömüyü alıp 4 kart gömer', () => {
    let s = Batak.setup({ players: 3, options: { variant: 'gommeli' } }, seededRng(6));
    expect(s.hands.map((h) => h.length)).toEqual([16, 16, 16]);
    expect(s.gomu).toHaveLength(4);
    expect((Batak.view(s, 0) as any).gomu).toBeUndefined();
    expect(() => Batak.setup({ players: 4, options: { variant: 'gommeli' } }, rng)).toThrow('3 kişiyle');
    const first = s.turn;
    s = Batak.apply(s, first, { type: 'bid', value: 6 }, rng);
    s = Batak.apply(s, s.turn, { type: 'pass' }, rng);
    s = Batak.apply(s, s.turn, { type: 'pass' }, rng);
    expect(s.phase).toBe('bury');
    expect(s.hands[first]).toHaveLength(20);
    expect(() => Batak.apply(s, first, { type: 'bury', cards: s.hands[first].slice(0, 3) }, rng)).toThrow('4 kart');
    const b = s.hands[first].slice(0, 4);
    s = Batak.apply(s, first, { type: 'bury', cards: b }, rng);
    expect(s.hands[first]).toHaveLength(16);
    expect(Batak.view(s, first).buried).toEqual(b);
    expect(Batak.view(s, (first + 1) % 3).buried).toEqual([]);
    expect(s.phase).toBe('trump');
  });
  it('YZ maçları: Koz Maça ve Gömmeli hatasız biter, toplam el sayısı doğru', () => {
    for (let g = 0; g < 200; g++) {
      const r = seededRng(g);
      const gom = g % 2 === 0;
      let s = Batak.setup({ players: gom ? 3 : 4, options: { variant: gom ? 'gommeli' : 'kozmaca' } }, r);
      while (!Batak.isOver(s)) s = Batak.apply(s, s.turn, Batak.ai(Batak.view(s, s.turn), s.turn, (['kolay', 'orta', 'zor'] as const)[g % 3], r), r);
      expect(s.lastHand!.tricks.reduce((a, b) => a + b, 0)).toBe(gom ? 16 : 13);
    }
  });
});

describe('Batak — gizli bilgi', () => {
  it('görünüm diğer elleri içermez', () => {
    const s = Batak.setup({ players: 4 }, seededRng(20));
    const v = Batak.view(s, 2);
    const json = JSON.stringify(v);
    expect((v as any).hands).toBeUndefined();
    for (const p of [0, 1, 3]) for (const c of s.hands[p]) expect(json.includes(`"${c}"`)).toBe(false);
    expect(v.hand).toHaveLength(13);
  });
});

describe('Batak — tam oyun simülasyonları', () => {
  const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
  it('1000 YZ maçı: her hamle geçerli, 13 el, kart korunumu', () => {
    for (let g = 0; g < 1000; g++) {
      const r = seededRng(500 + g);
      let s = Batak.setup({ players: 4, options: { hands: g % 20 === 0 ? 3 : 1, minBid: g % 2 ? 5 : 4 } }, r);
      let steps = 0;
      while (!Batak.isOver(s)) {
        const seat = Batak.toAct(s)[0];
        const v = Batak.view(s, seat);
        const a = Batak.ai(v, seat, diffs[(g + seat) % 3], r);
        expect(v.legal.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true);
        s = Batak.apply(s, seat, a, r);
        if (s.phase === 'play') {
          const inPlay = [...s.hands.flat(), ...s.played];
          expect(new Set(inPlay).size).toBe(52);
          expect(s.tricksWon.reduce((a, b) => a + b, 0) * 4 + s.trick.length).toBe(s.played.length);
        }
        if (++steps > 10000) throw new Error('sonsuz döngü');
      }
      expect(s.lastHand!.tricks.reduce((a, b) => a + b, 0)).toBe(13);
      expect(Batak.result(s)!.winners.length).toBeGreaterThan(0);
    }
  });
  it('el gücü tahmini makul aralıkta', () => {
    const strong = ['S14', 'S13', 'S12', 'S11', 'S10', 'S9', 'H14', 'H13', 'D14', 'D13', 'C14', 'C13', 'C12'];
    expect(estimateTricks(strong, 'S')).toBeGreaterThan(9);
    const weak = ['S2', 'S3', 'H4', 'H5', 'H6', 'D2', 'D3', 'D4', 'C2', 'C3', 'C4', 'C5', 'C6'];
    expect(estimateTricks(weak, 'C')).toBeLessThan(2);
    expect(suitOf('S14')).toBe('S');
  });
});
