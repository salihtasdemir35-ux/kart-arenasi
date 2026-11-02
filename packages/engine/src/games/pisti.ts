import { makeDeck, rankOf } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * PİŞTİ KURALLARI (bu motorda uygulananlar)
 * - 52 kart. Yere 4 kart (3'ü kapalı, en üstteki açık), her oyuncuya 4 kart.
 * - Yerdeki en üstteki açık kart Vale çıkarsa desteden Vale olmayan bir kartla değiştirilir.
 * - Oyuncu aynı değerde kart atarsa veya Vale atarsa yerdeki tüm kartları alır.
 * - Yerde tek kart varken aynı değerde kartla almak PİŞTİ: 10 puan. Vale üstüne Vale ile pişti: 20 puan.
 * - Eller bitince desteden yeniden 4'er kart dağıtılır. Deste bitince yerde kalan kartlar
 *   son kart alan oyuncuya (takıma) gider.
 * - Puanlar: her As 1, her Vale 1, Sinek 2 = 2, Karo 10 = 3, en çok kart alan 3 (eşitlikte kimse almaz).
 * - 4 oyuncuda karşılıklı oturanlar eş olur (0-2 ve 1-3).
 * - Hedef puan seçeneği: tek el veya 51 / 101 / 151'e kadar el el devam.
 */

export interface PistiState {
  game: 'pisti';
  n: number;
  sides: number;
  target: number;
  deck: string[];
  table: string[];
  /** Başlangıçta kapalı duran kart sayısı (yerdeki ilk kartlar alınana kadar gizli kalır). */
  hidden: number;
  hands: string[][];
  captured: string[][];
  pistis: { side: number; seat: number; value: number; card: string }[];
  turn: number;
  dealer: number;
  lastCapturer: number | null;
  totals: number[];
  handNo: number;
  lastHand: { scores: number[]; cards: number[] } | null;
  played: string[];
  over: boolean;
  log: { seat: number; card: string; took: number; pisti: number }[];
}

export type PistiAction = { type: 'play'; card: string };

export interface PistiView {
  game: 'pisti';
  n: number;
  sides: number;
  target: number;
  me: number | null;
  hand: string[];
  handCounts: number[];
  tableTop: string | null;
  tableCount: number;
  /** Yerde görünür (açık atılmış) kartlar. */
  tableVisible: string[];
  hiddenCount: number;
  deckCount: number;
  capturedCounts: number[];
  pistis: PistiState['pistis'];
  turn: number;
  totals: number[];
  currentScores: number[];
  handNo: number;
  lastHand: PistiState['lastHand'];
  played: string[];
  over: boolean;
  legal: PistiAction[];
  log: PistiState['log'];
}

const sideOf = (s: PistiState, seat: number) => (s.sides === 2 && s.n === 4 ? seat % 2 : seat);

function clone(s: PistiState): PistiState {
  return {
    ...s,
    deck: s.deck.slice(),
    table: s.table.slice(),
    hands: s.hands.map((h) => h.slice()),
    captured: s.captured.map((c) => c.slice()),
    pistis: s.pistis.slice(),
    totals: s.totals.slice(),
    played: s.played.slice(),
    log: s.log.slice(),
  };
}

export function cardPoints(c: string): number {
  if (c === 'C2') return 2;
  if (c === 'D10') return 3;
  const r = rankOf(c);
  if (r === 14 || r === 11) return 1;
  return 0;
}

/** O ana kadar elde edilen puanlar (el sonu çoğunluk bonusu dahil değil). */
export function scoreSides(s: PistiState, withMajority: boolean): number[] {
  const sc = new Array(s.sides).fill(0);
  s.captured.forEach((cards, side) => cards.forEach((c) => (sc[side] += cardPoints(c))));
  s.pistis.forEach((p) => (sc[p.side] += p.value));
  if (withMajority) {
    const counts = s.captured.map((c) => c.length);
    const max = Math.max(...counts);
    if (counts.filter((x) => x === max).length === 1) sc[counts.indexOf(max)] += 3;
  }
  return sc;
}

function deal(s: PistiState) {
  for (let k = 0; k < 4; k++)
    for (let i = 1; i <= s.n; i++) s.hands[(s.dealer + i) % s.n].push(s.deck.pop()!);
}

function newHand(s: PistiState, rng: Rng) {
  s.deck = shuffle(makeDeck(), rng);
  s.table = [];
  for (let i = 0; i < 4; i++) s.table.push(s.deck.pop()!);
  if (rankOf(s.table[3]) === 11) {
    // Açık kart Vale: desteden Vale olmayan bir kartla yer değiştir
    const idx = s.deck.findIndex((c) => rankOf(c) !== 11);
    [s.table[3], s.deck[idx]] = [s.deck[idx], s.table[3]];
    s.deck = shuffle(s.deck, rng);
  }
  s.hidden = 3;
  s.hands = Array.from({ length: s.n }, () => []);
  s.captured = Array.from({ length: s.sides }, () => []);
  s.pistis = [];
  s.lastCapturer = null;
  s.played = [s.table[3]];
  s.log = [];
  deal(s);
  s.turn = (s.dealer + 1) % s.n;
}

export const Pisti: GameModule<PistiState, PistiAction, PistiView> = {
  id: 'pisti',
  name: 'Pişti',
  playerCounts: [2, 4],
  options: [
    {
      key: 'target',
      label: 'Oyun sonu',
      default: 0,
      choices: [
        { value: 0, label: 'Tek el' },
        { value: 51, label: "51'e kadar" },
        { value: 101, label: "101'e kadar" },
        { value: 151, label: "151'e kadar" },
      ],
    },
  ],

  setup(cfg, rng) {
    if (!this.playerCounts.includes(cfg.players)) throw new IllegalMoveError('Pişti 2 veya 4 kişiyle oynanır');
    const n = cfg.players;
    const sides = n === 4 ? 2 : n;
    const target = Number(cfg.options?.target ?? 0);
    const s: PistiState = {
      game: 'pisti', n, sides, target, deck: [], table: [], hidden: 0, hands: [], captured: [], pistis: [],
      turn: 0, dealer: rng.int(n), lastCapturer: null, totals: new Array(sides).fill(0), handNo: 1,
      lastHand: null, played: [], over: false, log: [],
    };
    newHand(s, rng);
    return s;
  },

  toAct(s) { return s.over ? [] : [s.turn]; },

  legalActions(s, seat) {
    if (s.over || seat !== s.turn) return [];
    return s.hands[seat].map((card) => ({ type: 'play' as const, card }));
  },

  apply(s0, seat, a, rng) {
    if (s0.over) throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    if (!a || a.type !== 'play' || !s0.hands[seat].includes(a.card)) throw new IllegalMoveError('Bu kart elinizde yok');
    const s = clone(s0);
    s.hands[seat].splice(s.hands[seat].indexOf(a.card), 1);
    s.played.push(a.card);
    const top = s.table[s.table.length - 1];
    const r = rankOf(a.card);
    let took = 0;
    let pisti = 0;
    if (top && (rankOf(top) === r || r === 11)) {
      const side = sideOf(s, seat);
      if (s.table.length === 1 && rankOf(top) === r) {
        pisti = r === 11 ? 20 : 10;
        s.pistis.push({ side, seat, value: pisti, card: a.card });
      }
      took = s.table.length + 1;
      s.captured[side].push(...s.table, a.card);
      s.table = [];
      s.hidden = 0;
      s.lastCapturer = seat;
    } else {
      s.table.push(a.card);
    }
    s.log.push({ seat, card: a.card, took, pisti });
    s.turn = (seat + 1) % s.n;

    if (s.hands.every((h) => h.length === 0)) {
      if (s.deck.length > 0) deal(s);
      else {
        // El bitti: kalan kartlar son alana
        if (s.table.length && s.lastCapturer !== null) {
          s.captured[sideOf(s, s.lastCapturer)].push(...s.table);
          s.table = [];
          s.hidden = 0;
        }
        const scores = scoreSides(s, true);
        s.lastHand = { scores, cards: s.captured.map((c) => c.length) };
        scores.forEach((v, i) => (s.totals[i] += v));
        const max = Math.max(...s.totals);
        const leaders = s.totals.filter((t) => t === max).length;
        if (s.target === 0 || (max >= s.target && leaders === 1)) {
          s.over = true;
        } else {
          s.handNo += 1;
          s.dealer = (s.dealer + 1) % s.n;
          newHand(s, rng);
        }
      }
    }
    return s;
  },

  view(s, seat) {
    const visibleStart = s.hidden;
    return {
      game: 'pisti', n: s.n, sides: s.sides, target: s.target, me: seat,
      hand: seat === null ? [] : s.hands[seat].slice(),
      handCounts: s.hands.map((h) => h.length),
      tableTop: s.table.length ? s.table[s.table.length - 1] : null,
      tableCount: s.table.length,
      tableVisible: s.table.slice(visibleStart),
      hiddenCount: s.hidden,
      deckCount: s.deck.length,
      capturedCounts: s.captured.map((c) => c.length),
      pistis: s.pistis.slice(),
      turn: s.turn,
      totals: s.totals.slice(),
      currentScores: scoreSides(s, false),
      handNo: s.handNo,
      lastHand: s.lastHand,
      played: s.played.slice(),
      over: s.over,
      legal: seat === null ? [] : Pisti.legalActions(s, seat),
      log: s.log.slice(-12),
    };
  },

  isOver(s) { return s.over; },

  result(s) {
    if (!s.over) return null;
    const max = Math.max(...s.totals);
    const winSides = s.totals.map((t, i) => (t === max ? i : -1)).filter((i) => i >= 0);
    const winners: number[] = [];
    for (let seat = 0; seat < s.n; seat++) if (winSides.includes(sideOf(s, seat))) winners.push(seat);
    const scores = Array.from({ length: s.n }, (_, seat) => s.totals[sideOf(s, seat)]);
    const summary = winSides.length > 1 ? 'Berabere' : s.sides === 2 && s.n === 4 ? `Kazanan takım: ${winSides[0] + 1}` : `Kazanan: Oyuncu ${winSides[0] + 1}`;
    return { winners, scores, summary };
  },

  ai(v, seat, difficulty, rng) {
    return { type: 'play', card: pistiAiCard(v, difficulty, rng) };
  },
};

/** Yapay zekâ: yalnızca kendi eli ve açık oynanmış kartları bilir. */
export function pistiAiCard(v: PistiView, d: Difficulty, rng: Rng): string {
  const hand = v.hand;
  if (hand.length === 1) return hand[0];
  if (d === 'kolay') {
    const caps = hand.filter((c) => v.tableTop && (rankOf(c) === rankOf(v.tableTop) || (rankOf(c) === 11 && v.tableCount > 0)));
    if (caps.length && rng.int(2) === 0) return caps[rng.int(caps.length)];
    return hand[rng.int(hand.length)];
  }
  // Görülmemiş kart sayısı (her değer için): orta zorluk kaba tahmin, zor tam sayım
  const seen = new Set([...v.played, ...hand]);
  const unseenOfRank = (r: number) => {
    if (d === 'orta') return Math.max(0, 4 - hand.filter((c) => rankOf(c) === r).length - (v.tableTop && rankOf(v.tableTop) === r ? 1 : 0));
    let k = 0;
    for (const s of ['S', 'H', 'D', 'C']) if (!seen.has(s + r)) k++;
    return k;
  };
  const unseenTotal = Math.max(1, 52 - seen.size);
  const tableValue = v.tableVisible.reduce((t, c) => t + cardPoints(c), 0) + v.hiddenCount * 0.45 + v.tableCount * 0.12;
  let best = hand[0];
  let bestScore = -Infinity;
  for (const c of hand) {
    const r = rankOf(c);
    let score: number;
    const top = v.tableTop;
    if (top && rankOf(top) === r) {
      score = 4 + tableValue + cardPoints(c) + (v.tableCount === 1 ? 10 : 0);
    } else if (top && r === 11) {
      // Valeyi büyük masa için sakla
      score = tableValue + 1 - 3.5 + (v.tableCount >= 4 ? 2 : 0);
    } else {
      // Kartı yere bırakırsak rakibin alma riski
      const pileAfter = tableValue + cardPoints(c) + 0.12;
      const matchProb = Math.min(1, (unseenOfRank(r) * 4) / unseenTotal);
      const jackProb = Math.min(1, (unseenOfRank(11) * 4) / unseenTotal);
      const pistiRisk = v.tableCount === 0 ? matchProb * 10 : 0;
      score = -(pileAfter * Math.min(1, matchProb + jackProb * 0.6)) - pistiRisk - cardPoints(c) * 0.5;
      if (r === 11) score -= 4;
    }
    if (d === 'orta') score += (rng.int(100) / 100) * 0.8;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}
