import { describe, expect, it } from 'vitest';
import { Pisti, type PistiState, scoreSides, cardPoints } from '../src/games/pisti';
import { seededRng } from '../src/rng';
import { makeDeck, rankOf } from '../src/cards';
import { IllegalMoveError, type Difficulty } from '../src/types';

const rng = seededRng(42);

/** Testler için elle kurulmuş durum. */
function fixed(partial: Partial<PistiState>): PistiState {
  const base = Pisti.setup({ players: 2 }, seededRng(1));
  return { ...base, ...partial } as PistiState;
}

function allCards(s: PistiState): string[] {
  return [...s.deck, ...s.table, ...s.hands.flat(), ...s.captured.flat()];
}

describe('Pişti — başlangıç', () => {
  it('2 kişide 4 yer kartı, 4’er el kartı, 40 deste kartı', () => {
    const s = Pisti.setup({ players: 2 }, rng);
    expect(s.table).toHaveLength(4);
    expect(s.hands.map((h) => h.length)).toEqual([4, 4]);
    expect(s.deck).toHaveLength(44 - 4);
    expect(new Set(allCards(s)).size).toBe(52);
  });
  it('4 kişide eşli: 2 taraf', () => {
    const s = Pisti.setup({ players: 4 }, rng);
    expect(s.sides).toBe(2);
    expect(s.hands.every((h) => h.length === 4)).toBe(true);
    expect(s.deck).toHaveLength(32);
  });
  it('desteklenmeyen oyuncu sayısı reddedilir', () => {
    expect(() => Pisti.setup({ players: 3 }, rng)).toThrow(IllegalMoveError);
  });
  it('yerdeki açık kart hiçbir zaman Vale olmaz (500 dağıtım)', () => {
    for (let i = 0; i < 500; i++) {
      const s = Pisti.setup({ players: 2 }, seededRng(i));
      expect(rankOf(s.table[3])).not.toBe(11);
      expect(new Set(allCards(s)).size).toBe(52);
    }
  });
});

describe('Pişti — hamleler', () => {
  it('aynı değerle yerdekileri alır', () => {
    const s = fixed({ table: ['H5', 'S9', 'D2', 'C7'], hidden: 3, hands: [['H7', 'S3'], ['D9', 'C3']], turn: 0, captured: [[], []], pistis: [] });
    const t = Pisti.apply(s, 0, { type: 'play', card: 'H7' }, rng);
    expect(t.table).toEqual([]);
    expect(t.captured[0].sort()).toEqual(['C7', 'D2', 'H5', 'H7', 'S9'].sort());
    expect(t.pistis).toHaveLength(0);
    expect(t.lastCapturer).toBe(0);
    expect(t.turn).toBe(1);
  });
  it('Vale ile her şeyi alır ama Vale olmayan tek kart üzerine pişti sayılmaz', () => {
    const s = fixed({ table: ['H5'], hidden: 0, hands: [['S11', 'S3'], ['D9', 'C3']], turn: 0, captured: [[], []], pistis: [] });
    const t = Pisti.apply(s, 0, { type: 'play', card: 'S11' }, rng);
    expect(t.captured[0]).toHaveLength(2);
    expect(t.pistis).toHaveLength(0);
  });
  it('tek karta aynı değer = 10 puan pişti', () => {
    const s = fixed({ table: ['H8'], hidden: 0, hands: [['S8', 'S3'], ['D9', 'C3']], turn: 0, captured: [[], []], pistis: [] });
    const t = Pisti.apply(s, 0, { type: 'play', card: 'S8' }, rng);
    expect(t.pistis).toEqual([{ side: 0, seat: 0, value: 10, card: 'S8' }]);
  });
  it('Vale üstüne Vale = 20 puan pişti', () => {
    const s = fixed({ table: ['H11'], hidden: 0, hands: [['S11', 'S3'], ['D9', 'C3']], turn: 0, captured: [[], []], pistis: [] });
    const t = Pisti.apply(s, 0, { type: 'play', card: 'S11' }, rng);
    expect(t.pistis[0].value).toBe(20);
  });
  it('eşleşmeyen kart yere eklenir', () => {
    const s = fixed({ table: ['H8'], hidden: 0, hands: [['S9', 'S3'], ['D9', 'C3']], turn: 0, captured: [[], []], pistis: [] });
    const t = Pisti.apply(s, 0, { type: 'play', card: 'S9' }, rng);
    expect(t.table).toEqual(['H8', 'S9']);
  });
  it('sırası olmayan oyuncu oynayamaz, elinde olmayan kart oynanamaz', () => {
    const s = Pisti.setup({ players: 2 }, seededRng(3));
    const other = (s.turn + 1) % 2;
    expect(() => Pisti.apply(s, other, { type: 'play', card: s.hands[other][0] }, rng)).toThrow('Sıra sizde değil');
    expect(() => Pisti.apply(s, s.turn, { type: 'play', card: s.hands[other][0] }, rng)).toThrow('Bu kart elinizde yok');
  });
  it('apply girdi durumunu değiştirmez', () => {
    const s = Pisti.setup({ players: 2 }, seededRng(4));
    const snap = JSON.stringify(s);
    Pisti.apply(s, s.turn, { type: 'play', card: s.hands[s.turn][0] }, rng);
    expect(JSON.stringify(s)).toBe(snap);
  });
  it('eller bitince yeniden 4 kart dağıtılır', () => {
    let s = Pisti.setup({ players: 2 }, seededRng(5));
    for (let i = 0; i < 8; i++) s = Pisti.apply(s, s.turn, { type: 'play', card: s.hands[s.turn][0] }, rng);
    expect(s.hands.map((h) => h.length)).toEqual([4, 4]);
    expect(s.deck).toHaveLength(32);
  });
  it('el sonunda yerde kalanlar son alana gider', () => {
    const s = fixed({ deck: [], table: ['H4'], hidden: 0, hands: [['S9'], []], turn: 0, captured: [['C5'], ['D6']], pistis: [], lastCapturer: 1, target: 0 });
    const t = Pisti.apply(s, 0, { type: 'play', card: 'S9' }, rng);
    expect(t.over).toBe(true);
    expect(t.captured[1].sort()).toEqual(['D6', 'H4', 'S9'].sort());
  });
});

describe('Pişti — puanlama', () => {
  it('kart puanlarının toplamı 13 (+3 çoğunluk)', () => {
    expect(makeDeck().reduce((t, c) => t + cardPoints(c), 0)).toBe(13);
  });
  it('çoğunluk eşitliğinde 3 puan verilmez', () => {
    const s = fixed({ captured: [makeDeck().slice(0, 26), makeDeck().slice(26)], pistis: [] });
    const sc = scoreSides(s, true);
    expect(sc[0] + sc[1]).toBe(13);
  });
  it('eşli oyunda koltuk 0 ve 2 aynı tarafa yazar', () => {
    const base = Pisti.setup({ players: 4 }, seededRng(9));
    const s = { ...base, table: ['H8'], hidden: 0, turn: 2, hands: [['C3'], ['C4'], ['S8'], ['C6']], captured: [[], []], pistis: [] } as PistiState;
    const t = Pisti.apply(s, 2, { type: 'play', card: 'S8' }, rng);
    expect(t.captured[0]).toHaveLength(2);
    expect(t.pistis[0].side).toBe(0);
  });
});

describe('Pişti — gizli bilgi', () => {
  it('görünüm rakibin elini ve desteyi içermez', () => {
    const s = Pisti.setup({ players: 2 }, seededRng(11));
    const v = Pisti.view(s, 0);
    const json = JSON.stringify(v);
    for (const c of s.hands[1]) expect(v.hand).not.toContain(c);
    for (const c of s.deck) expect(json.includes(`"${c}"`)).toBe(false);
    for (const c of s.table.slice(0, 3)) expect(json.includes(`"${c}"`)).toBe(false);
    expect(v.handCounts).toEqual([4, 4]);
  });
  it('seyirci görünümünde hiç el kartı yok', () => {
    const s = Pisti.setup({ players: 4 }, seededRng(12));
    const v = Pisti.view(s, null);
    expect(v.hand).toEqual([]);
    for (const h of s.hands) for (const c of h) expect(JSON.stringify(v).includes(`"${c}"`)).toBe(false);
  });
});

describe('Pişti — tam oyun simülasyonları', () => {
  const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
  it('1500 YZ maçı: kart korunumu, geçerli hamleler, puan tutarlılığı', () => {
    for (let g = 0; g < 1500; g++) {
      const n = g % 2 === 0 ? 2 : 4;
      const r = seededRng(1000 + g);
      let s = Pisti.setup({ players: n, options: { target: g % 10 === 0 ? 51 : 0 } }, r);
      let steps = 0;
      while (!Pisti.isOver(s)) {
        const seat = Pisti.toAct(s)[0];
        const v = Pisti.view(s, seat);
        const a = Pisti.ai(v, seat, diffs[(seat + g) % 3], r);
        expect(Pisti.legalActions(s, seat).some((l) => l.card === a.card)).toBe(true);
        s = Pisti.apply(s, seat, a, r);
        if (!s.over && s.handNo === 1) expect(new Set(allCards(s)).size).toBe(52);
        if (++steps > 5000) throw new Error('sonsuz döngü');
      }
      const res = Pisti.result(s)!;
      expect(res.winners.length).toBeGreaterThan(0);
      if (s.target === 0) {
        const pistiPts = s.pistis.reduce((t, p) => t + p.value, 0);
        const total = s.totals.reduce((a, b) => a + b, 0);
        expect([13 + pistiPts, 16 + pistiPts]).toContain(total);
      } else {
        expect(Math.max(...s.totals)).toBeGreaterThanOrEqual(51);
      }
    }
  });
  it('zor YZ, rastgele oynayan kolay YZ’yi çoğunlukla yener', () => {
    let hardWins = 0;
    const games = 400;
    for (let g = 0; g < games; g++) {
      const r = seededRng(9000 + g);
      let s = Pisti.setup({ players: 2 }, r);
      while (!s.over) {
        const seat = s.turn;
        s = Pisti.apply(s, seat, Pisti.ai(Pisti.view(s, seat), seat, seat === 0 ? 'zor' : 'kolay', r), r);
      }
      if (s.totals[0] > s.totals[1]) hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.6);
  });
});
