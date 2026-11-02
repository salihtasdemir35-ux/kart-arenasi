import { makeDeck, rankOf, suitOf, type Suit } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * BATAK (İHALELİ, TEKLİ) KURALLARI — bu motorda uygulananlar
 * - 4 oyuncu, 52 kart, herkese 13 kart.
 * - İhale dağıtanın solundan başlar. En az ihale 4 (ayarlanabilir 4/5), en çok 13.
 *   Pas geçen ihaleye geri dönemez. Herkes pas derse dağıtan en düşük ihaleyle almak zorundadır.
 * - İhaleyi alan kozu seçer ve ilk eli o açar.
 * - Koz kırılmadan (oyunda koz atılmadan) koz ile el açılamaz; elinde sadece koz varsa açılabilir.
 * - Yerdeki renge uymak zorunludur. Uyabiliyorsan ve elde koz yoksa yerdeki en büyük kartı
 *   geçmek (yükseltmek) zorunludur.
 * - Renk yoksa koz atmak zorunludur; masada koz varsa onu geçebiliyorsan geçmek zorunludur.
 * - El en büyük koza, koz yoksa açılan rengin en büyüğüne gider.
 * - Puan: ihaleyi alan ihalesini tutturursa aldığı el sayısı kadar artı, tutturamazsa ihale kadar eksi.
 *   Diğer oyuncular aldıkları el sayısı kadar artı puan alır.
 * - EŞLİ BATAK seçeneği: karşılıklı oturanlar eştir (0-2, 1-3). İhale takımın ortak sözüdür: ihaleyi alan takımın
 *   toplam eli ihaleye ulaşırsa takım aldığı el kadar artı, ulaşamazsa ihale kadar eksi yazar; diğer takım aldığı el kadar artı.
 *   Takımın iki oyuncusu aynı puanı görür.
 * - KOZ MAÇA (sözlü): ihale yoktur, koz her zaman maçadır. Dağıtanın solundan başlayarak her oyuncu kaç el
 *   alacağını söyler (1–13). Sözünü tutturan aldığı el kadar artı, tutturamayan sözü kadar eksi yazar.
 *   Dağıtanın solundaki ilk eli açar; diğer kurallar (renge uyma, yükseltme, koz kırılması) aynıdır.
 * - GÖMMELİ BATAK: 3 oyuncu; herkese 16 kart, 4 kart gömü (yerde kapalı). İhaleyi alan gömüyü alır, elinden
 *   4 kart gömer (gömülen kartlar hiçbir ele sayılmaz), kozu seçer ve açar. Puanlama ihaleli gibidir (16 el).
 */

export interface BatakState {
  game: 'batak';
  n: number;
  variant: 'ihaleli' | 'kozmaca' | 'gommeli';
  gomu: string[];
  buried: string[];
  minBid: number;
  esli: boolean;
  totalHands: number;
  handNo: number;
  dealer: number;
  hands: string[][];
  phase: 'bid' | 'bury' | 'trump' | 'play' | 'over';
  bids: (number | 'pas' | null)[];
  bidTurn: number;
  highBid: number | null;
  bidder: number | null;
  trump: Suit | null;
  trumpBroken: boolean;
  trick: { seat: number; card: string }[];
  lastTrick: { seat: number; card: string }[] | null;
  lastTrickWinner: number | null;
  turn: number;
  tricksWon: number[];
  scores: number[];
  lastHand: { bidder: number; bid: number; trump: Suit; tricks: number[]; delta: number[] } | null;
  played: string[];
}

export type BatakAction =
  | { type: 'bid'; value: number }
  | { type: 'bury'; cards: string[] }
  | { type: 'pass' }
  | { type: 'trump'; suit: Suit }
  | { type: 'play'; card: string };

export interface BatakView extends Omit<BatakState, 'hands' | 'gomu'> {
  gomuCount: number;
  me: number | null;
  hand: string[];
  handCounts: number[];
  legal: BatakAction[];
}

function clone(s: BatakState): BatakState {
  return {
    ...s,
    hands: s.hands.map((h) => h.slice()),
    bids: s.bids.slice(),
    trick: s.trick.slice(),
    tricksWon: s.tricksWon.slice(),
    scores: s.scores.slice(),
    played: s.played.slice(),
    gomu: s.gomu.slice(),
    buried: s.buried.slice(),
  };
}

function dealHand(s: BatakState, rng: Rng) {
  const deck = shuffle(makeDeck(), rng);
  s.hands = Array.from({ length: s.n }, () => []);
  const dealt = s.variant === 'gommeli' ? 48 : 52;
  for (let i = 0; i < dealt; i++) s.hands[(s.dealer + 1 + i) % s.n].push(deck[i]);
  s.gomu = deck.slice(dealt);
  s.buried = [];
  s.phase = 'bid';
  s.bids = new Array(s.n).fill(null);
  s.bidTurn = (s.dealer + 1) % s.n;
  s.highBid = null;
  s.bidder = null;
  s.trump = null;
  s.trumpBroken = false;
  s.trick = [];
  s.tricksWon = new Array(s.n).fill(0);
  s.played = [];
  s.turn = s.bidTurn;
}

/** Elin şu anki kazananı. */
export function trickWinner(trick: { seat: number; card: string }[], trump: Suit | null): number {
  // En iyi kart her zaman ya açılan renkte ya da kozdadır.
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const bs = suitOf(best.card);
    const ts = suitOf(t.card);
    if (ts === bs) { if (rankOf(t.card) > rankOf(best.card)) best = t; }
    else if (trump && ts === trump) best = t;
  }
  return best.seat;
}

export function legalCards(hand: string[], trick: { seat: number; card: string }[], trump: Suit | null, trumpBroken: boolean): string[] {
  if (trick.length === 0) {
    if (!trumpBroken && trump) {
      const non = hand.filter((c) => suitOf(c) !== trump);
      if (non.length) return non;
    }
    return hand.slice();
  }
  const led = suitOf(trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  const trumpInTrick = trump !== null && trick.some((t) => suitOf(t.card) === trump);
  if (follow.length) {
    if (trumpInTrick && led !== trump) return follow;
    const highest = Math.max(...trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card)));
    const higher = follow.filter((c) => rankOf(c) > highest);
    return higher.length ? higher : follow;
  }
  const trumps = trump ? hand.filter((c) => suitOf(c) === trump) : [];
  if (trumps.length) {
    const tr = trick.filter((t) => suitOf(t.card) === trump).map((t) => rankOf(t.card));
    const top = tr.length ? Math.max(...tr) : 0;
    const over = trumps.filter((c) => rankOf(c) > top);
    return over.length ? over : trumps;
  }
  return hand.slice();
}

function finishBidding(s: BatakState) {
  if (s.highBid === null) {
    s.highBid = s.minBid;
    s.bidder = s.dealer;
    s.bids[s.dealer] = s.minBid;
  }
  if (s.variant === 'gommeli') {
    s.hands[s.bidder!].push(...s.gomu);
    s.gomu = [];
    s.phase = 'bury';
  } else s.phase = 'trump';
  s.turn = s.bidder!;
}

export const Batak: GameModule<BatakState, BatakAction, BatakView> = {
  id: 'batak',
  name: 'Batak (İhaleli)',
  playerCounts: [3, 4],
  options: [
    { key: 'hands', label: 'El sayısı', default: 1, choices: [1, 3, 5, 10].map((v) => ({ value: v, label: `${v} el` })) },
    { key: 'minBid', label: 'En düşük ihale', default: 4, choices: [{ value: 4, label: '4' }, { value: 5, label: '5' }] },
    { key: 'esli', label: 'Eşli', default: false, choices: [{ value: false, label: 'Tekli' }, { value: true, label: 'Eşli (karşılıklı)' }] },
  ],

  setup(cfg, rng) {
    const variant = (['kozmaca', 'gommeli'].includes(cfg.options?.variant as string) ? cfg.options!.variant : 'ihaleli') as BatakState['variant'];
    if (variant === 'gommeli' ? cfg.players !== 3 : cfg.players !== 4) throw new IllegalMoveError(variant === 'gommeli' ? 'Gömmeli Batak 3 kişiyle oynanır' : 'Batak 4 kişiyle oynanır');
    const s: BatakState = {
      game: 'batak', n: cfg.players, variant, gomu: [], buried: [], minBid: Number(cfg.options?.minBid ?? 4), esli: cfg.options?.esli === true, totalHands: Number(cfg.options?.hands ?? 1),
      handNo: 1, dealer: rng.int(cfg.players), hands: [], phase: 'bid', bids: [], bidTurn: 0, highBid: null, bidder: null,
      trump: null, trumpBroken: false, trick: [], lastTrick: null, lastTrickWinner: null, turn: 0,
      tricksWon: new Array(cfg.players).fill(0), scores: new Array(cfg.players).fill(0), lastHand: null, played: [],
    };
    dealHand(s, rng);
    return s;
  },

  toAct(s) {
    if (s.phase === 'over') return [];
    return [s.turn];
  },

  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'bid' && s.variant === 'kozmaca') return Array.from({ length: 13 }, (_, k) => ({ type: 'bid' as const, value: k + 1 }));
    if (s.phase === 'bury') return [{ type: 'bury', cards: [] }]; // 4 kartlık seçim; apply doğrular
    if (s.phase === 'bid') {
      const acts: BatakAction[] = [{ type: 'pass' }];
      const from = s.highBid === null ? s.minBid : s.highBid + 1;
      for (let v = from; v <= 13; v++) acts.push({ type: 'bid', value: v });
      return acts;
    }
    if (s.phase === 'trump') return (['S', 'H', 'D', 'C'] as Suit[]).map((suit) => ({ type: 'trump', suit }));
    return legalCards(s.hands[seat], s.trick, s.trump, s.trumpBroken).map((card) => ({ type: 'play', card }));
  },

  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    if (s.phase === 'bury') {
      if (a?.type !== 'bury' || !Array.isArray(a.cards) || a.cards.length !== 4 || new Set(a.cards).size !== 4 || a.cards.some((c) => !s.hands[seat].includes(c)))
        throw new IllegalMoveError('Elinizden 4 kart seçip gömün');
      s.hands[seat] = s.hands[seat].filter((c) => !a.cards.includes(c));
      s.buried = a.cards.slice();
      s.phase = 'trump';
      return s;
    }
    const legal = Batak.legalActions(s0, seat);
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a))) throw new IllegalMoveError(illegalReason(s0, seat, a));

    if (s.phase === 'bid' && s.variant === 'kozmaca') {
      s.bids[seat] = (a as { value: number }).value;
      if (s.bids.every((b) => b !== null)) {
        s.trump = 'S';
        s.phase = 'play';
        s.turn = (s.dealer + 1) % s.n;
      } else s.turn = s.bidTurn = (seat + 1) % s.n;
      return s;
    }
    if (s.phase === 'bid') {
      if (a.type === 'pass') s.bids[seat] = 'pas';
      else if (a.type === 'bid') { s.bids[seat] = a.value; s.highBid = a.value; s.bidder = seat; }
      const active = [...Array(s.n).keys()].filter((p) => s.bids[p] !== 'pas');
      if (s.highBid === 13 || active.length === 0 || (active.length === 1 && s.highBid !== null && s.bidder === active[0])) {
        finishBidding(s);
      } else {
        let nx = (seat + 1) % s.n;
        while (s.bids[nx] === 'pas') nx = (nx + 1) % s.n;
        s.bidTurn = nx;
        s.turn = nx;
      }
      return s;
    }

    if (s.phase === 'trump' && a.type === 'trump') {
      s.trump = a.suit;
      s.phase = 'play';
      s.turn = s.bidder!;
      return s;
    }

    if (a.type !== 'play') throw new IllegalMoveError('Geçersiz hamle');
    s.hands[seat].splice(s.hands[seat].indexOf(a.card), 1);
    s.trick.push({ seat, card: a.card });
    s.played.push(a.card);
    if (suitOf(a.card) === s.trump) s.trumpBroken = true;
    if (s.trick.length < s.n) {
      s.turn = (seat + 1) % s.n;
      return s;
    }
    const w = trickWinner(s.trick, s.trump);
    s.tricksWon[w] += 1;
    s.lastTrick = s.trick;
    s.lastTrickWinner = w;
    s.trick = [];
    s.turn = w;
    if (s.hands.every((h) => h.length === 0)) {
      const bid = s.highBid ?? 0;
      const bidder = s.bidder ?? -1;
      let delta: number[];
      if (s.variant === 'kozmaca') {
        delta = s.tricksWon.map((t, p) => (t >= (s.bids[p] as number) ? t : -(s.bids[p] as number)));
      } else if (s.esli) {
        const team = (p: number) => p % 2;
        const tt = [0, 1].map((k) => s.tricksWon.filter((_, p) => team(p) === k).reduce((a, b) => a + b, 0));
        const bt = team(bidder);
        const teamDelta = [0, 1].map((k) => (k === bt ? (tt[k] >= bid ? tt[k] : -bid) : tt[k]));
        delta = [0, 1, 2, 3].map((p) => teamDelta[team(p)]);
      } else delta = s.tricksWon.map((t, p) => (p === bidder ? (t >= bid ? t : -bid) : t));
      delta.forEach((d, p) => (s.scores[p] += d));
      s.lastHand = { bidder, bid, trump: s.trump!, tricks: s.tricksWon.slice(), delta, bids: s.bids.slice() } as any;
      if (s.handNo >= s.totalHands) {
        s.phase = 'over';
      } else {
        s.handNo += 1;
        s.dealer = (s.dealer + 1) % s.n;
        dealHand(s, rng);
      }
    }
    return s;
  },

  view(s, seat) {
    const { hands, gomu, buried, ...rest } = s;
    return {
      ...rest,
      gomuCount: gomu.length,
      buried: seat !== null && seat === s.bidder ? buried.slice() : [],
      bids: s.bids.slice(),
      trick: s.trick.slice(),
      tricksWon: s.tricksWon.slice(),
      scores: s.scores.slice(),
      played: s.played.slice(),
      me: seat,
      hand: seat === null ? [] : hands[seat].slice(),
      handCounts: hands.map((h) => h.length),
      legal: seat === null ? [] : Batak.legalActions(s, seat),
    };
  },

  isOver(s) { return s.phase === 'over'; },

  result(s) {
    if (s.phase !== 'over') return null;
    const max = Math.max(...s.scores);
    const winners = s.scores.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
    return { winners, scores: s.scores.slice(), summary: winners.length > 1 ? 'Berabere' : `Kazanan: Oyuncu ${winners[0] + 1}` };
  },

  ai(v, seat, d, rng) { return batakAi(v, seat, d, rng); },
};

function illegalReason(s: BatakState, seat: number, a: BatakAction): string {
  if (s.phase === 'bid') return 'Geçersiz ihale';
  if (s.phase === 'trump') return 'Önce koz seçilmeli';
  if (a.type !== 'play') return 'Şu an kart oynanmalı';
  if (!s.hands[seat].includes(a.card)) return 'Bu kart elinizde yok';
  if (s.trick.length === 0) return 'Koz kırılmadan kozla el açılamaz';
  const led = suitOf(s.trick[0].card);
  if (s.hands[seat].some((c) => suitOf(c) === led)) {
    return suitOf(a.card) === led ? 'Yerdeki kartı geçmek zorundasınız' : 'Yerdeki renge uymak zorundasınız';
  }
  return 'Renginiz yoksa koz atmak (ve geçebiliyorsanız geçmek) zorundasınız';
}

/** El gücü tahmini (yalnızca kendi eline bakar). */
export function estimateTricks(hand: string[], trump: Suit | null): number {
  let est = 0;
  for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
    const cs = hand.filter((c) => suitOf(c) === suit).map(rankOf).sort((a, b) => b - a);
    const len = cs.length;
    if (cs.includes(14)) est += 1;
    if (cs.includes(13) && len >= 2) est += cs.includes(14) ? 0.9 : 0.6;
    if (cs.includes(12) && len >= 3) est += 0.4;
    if (suit === trump) est += Math.max(0, len - 3) * 0.9 + (cs.includes(11) && len >= 4 ? 0.3 : 0);
  }
  return est;
}

function bestTrump(hand: string[]): Suit {
  let best: Suit = 'S';
  let bv = -1;
  for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
    const cs = hand.filter((c) => suitOf(c) === suit);
    const v = cs.length * 2 + cs.reduce((t, c) => t + Math.max(0, rankOf(c) - 9), 0) * 0.5;
    if (v > bv) { bv = v; best = suit; }
  }
  return best;
}

export function batakAi(v: BatakView, seat: number, d: Difficulty, rng: Rng): BatakAction {
  const legal = v.legal;
  if (v.phase === 'bury') {
    // Koz olması muhtemel en uzun renk dışındaki en küçük 4 kartı göm
    const keep = bestTrump(v.hand);
    const cands = v.hand.filter((c) => suitOf(c) !== keep).sort((a, b) => rankOf(a) - rankOf(b));
    const pool = [...cands, ...v.hand.filter((c) => suitOf(c) === keep).sort((a, b) => rankOf(a) - rankOf(b))];
    return { type: 'bury', cards: pool.slice(0, 4) };
  }
  if (legal.length === 1) return legal[0];
  if (v.phase === 'bid' && v.variant === 'kozmaca') {
    const est = Math.round(estimateTricks(v.hand, 'S') - (d === 'kolay' ? 1 : 0));
    return { type: 'bid', value: Math.max(1, Math.min(13, est)) };
  }
  if (v.phase === 'bid') {
    const est = estimateTricks(v.hand, bestTrump(v.hand));
    const target = Math.floor(d === 'kolay' ? est - 1 : d === 'orta' ? est - 0.4 : est);
    const min = v.highBid === null ? v.minBid : v.highBid + 1;
    if (target >= min && target <= 13) {
      // Rakibi geçecek en düşük ihale verilir; hedef tahmini aşılmaz.
      return { type: 'bid', value: min };
    }
    return { type: 'pass' };
  }
  if (v.phase === 'trump') return { type: 'trump', suit: bestTrump(v.hand) };
  const cards = legal.filter((l): l is { type: 'play'; card: string } => l.type === 'play').map((l) => l.card);
  if (d === 'kolay') return { type: 'play', card: cards[rng.int(cards.length)] };

  const trump = v.trump;
  const playedSet = new Set(v.played);
  const isBoss = (c: string) => {
    // Bu renkte bundan büyük oynanmamış kart kalmadıysa "boss" kart
    for (let r = rankOf(c) + 1; r <= 14; r++) {
      const id = suitOf(c) + r;
      if (!playedSet.has(id) && !v.hand.includes(id)) return false;
    }
    return true;
  };
  const low = (cs: string[]) => cs.slice().sort((a, b) => rankOf(a) - rankOf(b))[0];
  const high = (cs: string[]) => cs.slice().sort((a, b) => rankOf(b) - rankOf(a))[0];

  if (v.trick.length === 0) {
    const bosses = cards.filter((c) => suitOf(c) !== trump && isBoss(c));
    if (bosses.length) return { type: 'play', card: high(bosses) };
    if (d === 'zor' && trump && cards.some((c) => suitOf(c) === trump && isBoss(c)) && v.bidder === seat)
      return { type: 'play', card: high(cards.filter((c) => suitOf(c) === trump)) };
    // En uzun koz dışı renkten küçük kart
    const bySuit = new Map<string, string[]>();
    for (const c of cards) { const k = suitOf(c); bySuit.set(k, [...(bySuit.get(k) ?? []), c]); }
    const nonTrump = [...bySuit.entries()].filter(([k]) => k !== trump);
    const pool = nonTrump.length ? nonTrump.sort((a, b) => b[1].length - a[1].length)[0][1] : cards;
    return { type: 'play', card: low(pool) };
  }

  const winning = (c: string) => trickWinner([...v.trick, { seat, card: c }], trump) === seat;
  const winners = cards.filter(winning);
  const last = v.trick.length === 3;
  if (winners.length) {
    const lowWin = low(winners);
    if (last || isBoss(lowWin) || (trump && suitOf(lowWin) === trump && d === 'zor')) return { type: 'play', card: lowWin };
    return { type: 'play', card: high(winners) };
  }
  return { type: 'play', card: low(cards) };
}
