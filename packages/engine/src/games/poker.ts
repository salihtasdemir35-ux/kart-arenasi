import { makeDeck, rankOf, suitOf } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * POKER AİLESİ — SANAL FİŞLE (gerçek para yok)
 * Varyantlar:
 * - draw   (Poker, 5 kart çekmeli): 5 kart → bahis → 0–3 kart değiştirme → bahis → açık. Limitsiz.
 * - holdem (Texas Hold'em): 2 kapalı + 5 ortak kart (flop 3, turn 1, river 1), 4 bahis turu. Limitsiz.
 * - omaha  (Omaha): 4 kapalı kart; el TAM OLARAK 2 kapalı + 3 ortak karttan kurulur. Pot limitli.
 * Ortak kurallar:
 * - Herkes 1.000 fişle başlar; küçük kör 10, büyük kör 20. Krupiye düğmesi her el döner; iki kişide düğme küçük kördür.
 * - Bahis: pas (check), gör (call), artır (en az son artırma kadar, en az büyük kör), çekil (fold), all-in.
 *   Artırma tam yapılmadan all-in olunursa diğerlerine yeniden artırma hakkı açılmaz.
 * - Herkes eşitleyip konuşunca tur biter. Tek oyuncu kalırsa potu alır. All-in durumunda kalan kartlar açılır.
 * - Açıkta yan potlar katkıya göre ayrılır; her pot o pota katkı yapan en iyi ele gider, eşitlikte bölünür
 *   (artan fiş düğmenin solundaki kazanana).
 * - El sıralaması: Floş Royal > Floş Sıralı > Kare > Full > Floş > Sıralı (A-2-3-4-5 en küçük) > Üçlü > Döper > Per > Yüksek kart.
 * - Fişi biten oyundan çıkar. Seçilen el sayısı sonunda ya da tek oyuncu kalınca en çok fişi olan kazanır.
 */

export type PokerVariant = 'draw' | 'holdem' | 'omaha';
const CAT = ['Yüksek kart', 'Per', 'Döper', 'Üçlü', 'Sıralı', 'Floş', 'Full', 'Kare', 'Floş sıralı'];

/** 5 kartı değerlendirir: [kategori, ...eşitlik bozucular] (büyük olan iyi). */
export function eval5(cards: string[]): number[] {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5;
  }
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroups = groups.map((g) => g[0]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, ...byGroups];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...byGroups];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...byGroups];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroups];
  if (groups[0][1] === 2) return [1, ...byGroups];
  return [0, ...ranks];
}
export const cmpHands = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0); return 0; };
export const handName = (h: number[]) => (h[0] === 8 && h[1] === 14 ? 'Floş royal' : CAT[h[0]]);

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (i: number, cur: T[]) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); } };
  rec(0, []);
  return out;
}
export function bestHand(variant: PokerVariant, hole: string[], board: string[]): number[] {
  let best: number[] = [-1];
  const consider = (five: string[]) => { const e = eval5(five); if (cmpHands(e, best) > 0) best = e; };
  if (variant === 'draw') consider(hole);
  else if (variant === 'holdem') combos([...hole, ...board], 5).forEach(consider);
  else for (const h of combos(hole, 2)) for (const b of combos(board, 3)) consider([...h, ...b]);
  return best;
}

export interface PokerState {
  game: 'poker';
  variant: PokerVariant;
  n: number;
  chips: number[];
  holes: string[][];
  board: string[];
  deck: string[];
  button: number;
  street: number; // holdem/omaha: 0 preflop,1 flop,2 turn,3 river ; draw: 0 ilk bahis, 1 değiştirme, 2 son bahis
  phase: 'bet' | 'draw' | 'over';
  folded: boolean[];
  out: boolean[];
  bets: number[]; // bu turdaki bahisler
  contrib: number[]; // eldeki toplam katkı
  currentBet: number;
  minRaise: number;
  toActLeft: number[]; // bu turda daha konuşması gerekenler
  drawn: boolean[];
  turn: number;
  handNo: number;
  maxHands: number;
  sb: number; bb: number;
  lastHand: { winners: { seat: number; amount: number; hand: string }[]; shown: { seat: number; cards: string[]; hand: string }[]; board: string[] } | null;
  log: string[];
}
export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number } | { type: 'allin' } | { type: 'draw'; discard: string[] };
export interface PokerView extends Omit<PokerState, 'holes' | 'deck'> { me: number | null; hole: string[]; legal: PokerAction[]; pot: number; toCall: number; minRaiseTo: number; maxRaiseTo: number; holeCounts: number[] }

const holeCount = (v: PokerVariant) => (v === 'holdem' ? 2 : v === 'omaha' ? 4 : 5);
const live = (s: PokerState) => [...Array(s.n).keys()].filter((p) => !s.out[p] && !s.folded[p]);
const canAct = (s: PokerState, p: number) => !s.out[p] && !s.folded[p] && s.chips[p] > 0;
const nextSeat = (s: PokerState, from: number, pred: (p: number) => boolean) => { for (let k = 1; k <= s.n; k++) { const p = (from + k) % s.n; if (pred(p)) return p; } return -1; };
const potTotal = (s: PokerState) => s.contrib.reduce((a, b) => a + b, 0);

function put(s: PokerState, p: number, amount: number) {
  const a = Math.min(amount, s.chips[p]);
  s.chips[p] -= a; s.bets[p] += a; s.contrib[p] += a;
}

function startHand(s: PokerState, rng: Rng) {
  const seats = [...Array(s.n).keys()].filter((p) => !s.out[p]);
  s.deck = shuffle(makeDeck(), rng);
  s.holes = [...Array(s.n).keys()].map((p) => (s.out[p] ? [] : s.deck.splice(0, holeCount(s.variant))));
  s.board = [];
  s.folded = s.out.slice();
  s.bets = new Array(s.n).fill(0);
  s.contrib = new Array(s.n).fill(0);
  s.drawn = new Array(s.n).fill(false);
  s.street = 0;
  s.phase = 'bet';
  const headsUp = seats.length === 2;
  const sbSeat = headsUp ? s.button : nextSeat(s, s.button, (p) => !s.out[p]);
  const bbSeat = nextSeat(s, sbSeat, (p) => !s.out[p]);
  put(s, sbSeat, s.sb);
  put(s, bbSeat, s.bb);
  s.currentBet = s.bb;
  s.minRaise = s.bb;
  const first = nextSeat(s, bbSeat, (p) => canAct(s, p));
  s.toActLeft = orderFrom(s, first);
  s.turn = s.toActLeft[0] ?? first;
  if (!s.toActLeft.length) runOut(s);
}

/** p'den başlayarak hareket edebilecek oyuncular sırası. */
function orderFrom(s: PokerState, p: number) {
  const out: number[] = [];
  if (p < 0) return out;
  for (let k = 0; k < s.n; k++) { const q = (p + k) % s.n; if (canAct(s, q)) out.push(q); }
  return out;
}

function nextStreet(s: PokerState) {
  s.bets = new Array(s.n).fill(0);
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.street++;
  if (s.variant === 'draw') {
    if (s.street === 1) { s.phase = 'draw'; s.toActLeft = orderFrom(s, nextSeat(s, s.button, (p) => !s.folded[p] && !s.out[p])).filter((p) => !s.folded[p]); const all = [...Array(s.n).keys()].filter((p) => !s.folded[p] && !s.out[p]); s.toActLeft = orderAll(s, all); s.turn = s.toActLeft[0]; return; }
    if (s.street === 2) s.phase = 'bet';
    if (s.street > 2) return showdown(s);
  } else {
    if (s.street === 1) s.board.push(...s.deck.splice(0, 3));
    else if (s.street <= 3) s.board.push(...s.deck.splice(0, 1));
    else return showdown(s);
  }
  s.toActLeft = orderFrom(s, nextSeat(s, s.button, (p) => canAct(s, p)));
  if (s.toActLeft.length <= 1 && live(s).filter((p) => s.chips[p] > 0).length <= 1) return runOut(s);
  s.turn = s.toActLeft[0];
}
function orderAll(s: PokerState, seats: number[]) {
  const start = nextSeat(s, s.button, (p) => seats.includes(p));
  return seats.slice().sort((a, b) => ((a - start + s.n) % s.n) - ((b - start + s.n) % s.n));
}

/** Herkes all-in: kalan kartları aç ve sonuca git. */
function runOut(s: PokerState) {
  if (s.variant === 'draw') { s.street = 2; return showdown(s); }
  while (s.board.length < 5) s.board.push(s.deck.shift()!);
  showdown(s);
}

function showdown(s: PokerState) {
  const contenders = live(s);
  const shown = contenders.map((p) => ({ seat: p, cards: s.holes[p].slice(), hand: bestHand(s.variant, s.holes[p], s.board) }));
  const winners = new Map<number, number>();
  // Yan potlar
  const levels = [...new Set(s.contrib.filter((c) => c > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const lvl of levels) {
    const payers = [...Array(s.n).keys()].filter((p) => s.contrib[p] >= lvl);
    const pot = (lvl - prev) * payers.length;
    prev = lvl;
    const eligible = shown.filter((x) => s.contrib[x.seat] >= lvl);
    if (!eligible.length) { // herkes çekildiyse kalan tek oyuncuya
      const sole = contenders[0];
      winners.set(sole, (winners.get(sole) ?? 0) + pot); continue;
    }
    let best = eligible[0].hand;
    for (const e of eligible) if (cmpHands(e.hand, best) > 0) best = e.hand;
    const w = eligible.filter((e) => cmpHands(e.hand, best) === 0).map((e) => e.seat);
    const share = Math.floor(pot / w.length);
    let rem = pot - share * w.length;
    const orderW = orderAll(s, w);
    for (const p of orderW) { winners.set(p, (winners.get(p) ?? 0) + share + (rem > 0 ? 1 : 0)); if (rem > 0) rem--; }
  }
  winners.forEach((amt, p) => (s.chips[p] += amt));
  s.lastHand = {
    winners: [...winners.entries()].map(([seat, amount]) => ({ seat, amount, hand: contenders.length > 1 ? handName(bestHand(s.variant, s.holes[seat], s.board)) : 'Herkes çekildi' })),
    shown: contenders.length > 1 ? shown.map((x) => ({ seat: x.seat, cards: x.cards, hand: handName(x.hand) })) : [],
    board: s.board.slice(),
  };
  endHand(s);
}

function endHand(s: PokerState) {
  s.contrib = new Array(s.n).fill(0);
  s.bets = new Array(s.n).fill(0);
  for (let p = 0; p < s.n; p++) if (s.chips[p] <= 0) s.out[p] = true;
  s.phase = 'over';
  (s as any)._pendingNext = true;
}

function awardUncontested(s: PokerState) {
  const w = live(s)[0];
  const pot = potTotal(s);
  s.chips[w] += pot;
  s.lastHand = { winners: [{ seat: w, amount: pot, hand: 'Herkes çekildi' }], shown: [], board: s.board.slice() };
  endHand(s);
}

function afterBetAction(s: PokerState, seat: number, raised: boolean) {
  s.toActLeft = s.toActLeft.filter((p) => p !== seat);
  if (raised) s.toActLeft = orderFrom(s, nextSeat(s, seat, (p) => canAct(s, p))).filter((p) => p !== seat);
  s.toActLeft = s.toActLeft.filter((p) => canAct(s, p));
  if (live(s).length === 1) return awardUncontested(s);
  if (!s.toActLeft.length) {
    const notAllIn = live(s).filter((p) => s.chips[p] > 0);
    if (notAllIn.length <= 1 && live(s).every((p) => s.chips[p] === 0 || s.bets[p] >= s.currentBet)) return runOut(s);
    return nextStreet(s);
  }
  s.turn = s.toActLeft[0];
}

function maxRaiseTo(s: PokerState, p: number) {
  const all = s.bets[p] + s.chips[p];
  if (s.variant !== 'omaha') return all;
  const call = s.currentBet - s.bets[p];
  return Math.min(all, s.currentBet + potTotal(s) + call);
}

export const Poker: GameModule<PokerState, PokerAction, PokerView> = {
  id: 'poker',
  name: 'Poker',
  playerCounts: [2, 3, 4, 5, 6, 7, 8],
  options: [
    { key: 'variant', label: 'Tür', default: 'holdem', choices: [{ value: 'holdem', label: "Texas Hold'em" }, { value: 'omaha', label: 'Omaha' }, { value: 'draw', label: '5 kart çekmeli' }] },
    { key: 'hands', label: 'Oyun sonu', default: 0, choices: [{ value: 0, label: 'Tek kalan kazanır' }, { value: 20, label: '20 el' }, { value: 50, label: '50 el' }] },
  ],
  setup(cfg, rng) {
    const variant = (['draw', 'omaha'].includes(cfg.options?.variant as string) ? cfg.options!.variant : 'holdem') as PokerVariant;
    const max = variant === 'draw' ? 6 : 8;
    if (cfg.players < 2 || cfg.players > max) throw new IllegalMoveError(`Bu poker türü 2–${max} kişiyle oynanır`);
    const s = { game: 'poker', variant, n: cfg.players, chips: new Array(cfg.players).fill(1000), out: new Array(cfg.players).fill(false), button: rng.int(cfg.players), handNo: 1, maxHands: Number(cfg.options?.hands ?? 0), sb: 10, bb: 20, lastHand: null, log: [] } as unknown as PokerState;
    startHand(s, rng);
    return s;
  },
  toAct(s) {
    if (s.phase === 'over') return (s as any)._pendingNext && !gameOver(s) ? [s.out[s.button] ? nextSeat(s, s.button, (p) => !s.out[p]) : s.button] : [];
    return [s.turn];
  },
  legalActions(s, seat) {
    if (!Poker.toAct(s).includes(seat)) return [];
    if (s.phase === 'over') return [{ type: 'check' }]; // "yeni el" onayı (sıradaki elin başlatılması)
    if (s.phase === 'draw') return [{ type: 'draw', discard: [] }];
    const toCall = s.currentBet - s.bets[seat];
    const a: PokerAction[] = [{ type: 'fold' }];
    a.push(toCall > 0 ? { type: 'call' } : { type: 'check' });
    const minTo = s.currentBet + s.minRaise;
    if (s.bets[seat] + s.chips[seat] > s.currentBet && maxRaiseTo(s, seat) >= Math.min(minTo, s.bets[seat] + s.chips[seat])) {
      if (maxRaiseTo(s, seat) >= minTo) a.push({ type: 'raise', to: minTo });
      if (s.variant !== 'omaha' || maxRaiseTo(s, seat) === s.bets[seat] + s.chips[seat]) a.push({ type: 'allin' });
    }
    return a;
  },
  apply(s0, seat, a, rng) {
    if (!Poker.toAct(s0).includes(seat)) throw new IllegalMoveError('Sıra sizde değil');
    const s: PokerState = { ...s0, chips: s0.chips.slice(), holes: s0.holes.map((h) => h.slice()), board: s0.board.slice(), deck: s0.deck.slice(), folded: s0.folded.slice(), out: s0.out.slice(), bets: s0.bets.slice(), contrib: s0.contrib.slice(), toActLeft: s0.toActLeft.slice(), drawn: s0.drawn.slice() };
    if (s.phase === 'over') {
      (s as any)._pendingNext = false;
      s.handNo++;
      s.button = nextSeat(s, s.button, (p) => !s.out[p]);
      startHand(s, rng);
      return s;
    }
    if (s.phase === 'draw') {
      if (a?.type !== 'draw' || !Array.isArray(a.discard) || a.discard.length > 3 || a.discard.some((c) => !s.holes[seat].includes(c))) throw new IllegalMoveError('En fazla 3 kart değiştirebilirsiniz');
      s.holes[seat] = s.holes[seat].filter((c) => !a.discard.includes(c));
      s.holes[seat].push(...s.deck.splice(0, a.discard.length));
      s.toActLeft = s.toActLeft.filter((p) => p !== seat);
      s.log.push(`${seat}:${a.discard.length} kart değiştirdi`);
      if (!s.toActLeft.length) {
        s.street = 2; s.phase = 'bet'; s.currentBet = 0; s.minRaise = s.bb; s.bets = new Array(s.n).fill(0);
        s.toActLeft = orderFrom(s, nextSeat(s, s.button, (p) => canAct(s, p)));
        if (s.toActLeft.length <= 1) { s.street = 2; showdown(s); return s; }
        s.turn = s.toActLeft[0];
      } else s.turn = s.toActLeft[0];
      return s;
    }
    const toCall = s.currentBet - s.bets[seat];
    switch (a?.type) {
      case 'fold': s.folded[seat] = true; afterBetAction(s, seat, false); return s;
      case 'check': if (toCall > 0) throw new IllegalMoveError('Bahis var: görün ya da çekilin'); afterBetAction(s, seat, false); return s;
      case 'call': if (toCall <= 0) throw new IllegalMoveError('Görülecek bahis yok'); put(s, seat, toCall); afterBetAction(s, seat, false); return s;
      case 'allin': case 'raise': {
        const all = s.bets[seat] + s.chips[seat];
        const to = a.type === 'allin' ? all : Math.floor(a.to);
        const minTo = s.currentBet + s.minRaise;
        if (a.type === 'allin' && s.variant === 'omaha' && all > maxRaiseTo(s, seat)) throw new IllegalMoveError('Pot limitli: en fazla pot kadar artırabilirsiniz');
        if (to > all) throw new IllegalMoveError('Fişiniz yetmiyor');
        if (to > maxRaiseTo(s, seat)) throw new IllegalMoveError(`En fazla ${maxRaiseTo(s, seat)} yapabilirsiniz (pot limit)`);
        if (to < minTo && to < all) throw new IllegalMoveError(`En az ${minTo} yapmalısınız`);
        if (to <= s.currentBet) { put(s, seat, to - s.bets[seat]); afterBetAction(s, seat, false); return s; } // gören all-in
        const raiseBy = to - s.currentBet;
        const full = raiseBy >= s.minRaise;
        put(s, seat, to - s.bets[seat]);
        s.currentBet = to;
        if (full) s.minRaise = raiseBy;
        afterBetAction(s, seat, full);
        return s;
      }
    }
    throw new IllegalMoveError('Geçersiz hamle');
  },
  view(s, seat) {
    const { holes, deck, ...rest } = s;
    const toCall = seat === null ? 0 : Math.max(0, s.currentBet - s.bets[seat]);
    return {
      ...rest, chips: s.chips.slice(), board: s.board.slice(), folded: s.folded.slice(), out: s.out.slice(), bets: s.bets.slice(), contrib: s.contrib.slice(), toActLeft: s.toActLeft.slice(), drawn: s.drawn.slice(),
      me: seat, hole: seat === null ? [] : holes[seat].slice(), holeCounts: holes.map((h) => h.length), legal: seat === null ? [] : Poker.legalActions(s, seat),
      pot: potTotal(s), toCall, minRaiseTo: s.currentBet + s.minRaise, maxRaiseTo: seat === null ? 0 : maxRaiseTo(s, seat),
    };
  },
  isOver(s) { return gameOver(s); },
  result(s) {
    if (!gameOver(s)) return null;
    const max = Math.max(...s.chips);
    return { winners: s.chips.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0), scores: s.chips.slice(), summary: 'En çok fişe sahip olan kazandı (sanal fiş)' };
  },
  ai(v, seat, d, rng) { return pokerAi(v, seat, d, rng); },
};

function gameOver(s: PokerState) {
  if (s.phase !== 'over') return false;
  const alive = s.chips.filter((c) => c > 0).length;
  return alive <= 1 || (s.maxHands > 0 && s.handNo >= s.maxHands);
}

// ---------- Yapay zekâ: Monte Carlo el gücü + pot oranı ----------
export function equity(v: PokerView, seat: number, sims: number, rng: Rng): number {
  const opp = [...Array(v.n).keys()].filter((p) => p !== seat && !v.folded[p] && !v.out[p]).length;
  if (!opp) return 1;
  const known = new Set([...v.hole, ...v.board]);
  const deck = makeDeck().filter((c) => !known.has(c));
  let score = 0;
  for (let k = 0; k < sims; k++) {
    const d = shuffle(deck, rng);
    const board = [...v.board, ...d.splice(0, v.variant === 'draw' ? 0 : 5 - v.board.length)];
    const mine = bestHand(v.variant, v.hole, board);
    let win = true, tie = false;
    for (let o = 0; o < opp; o++) {
      const h = d.splice(0, holeCount(v.variant));
      const c = cmpHands(bestHand(v.variant, h, board), mine);
      if (c > 0) { win = false; break; }
      if (c === 0) tie = true;
    }
    score += win ? (tie ? 0.5 : 1) : 0;
  }
  return score / sims;
}

export function pokerAi(v: PokerView, seat: number, d: Difficulty, rng: Rng): PokerAction {
  if (v.phase === 'over') return { type: 'check' };
  if (v.phase === 'draw') {
    // Kombinasyonda yer alan kartları tut, gerisini (en fazla 3) değiştir
    const counts = new Map<number, number>();
    v.hole.forEach((c) => counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1));
    const made = eval5(v.hole);
    if (made[0] >= 4) return { type: 'draw', discard: [] };
    const keep = v.hole.filter((c) => (counts.get(rankOf(c)) ?? 0) >= 2);
    const discard = v.hole.filter((c) => !keep.includes(c)).sort((a, b) => rankOf(a) - rankOf(b));
    return { type: 'draw', discard: discard.slice(0, keep.length ? 3 : Math.max(0, discard.length - 2)).slice(0, 3) };
  }
  const sims = d === 'kolay' ? 30 : d === 'orta' ? 120 : 300;
  const eq = equity(v, seat, sims, rng);
  const has = (t: PokerAction['type']) => v.legal.find((a) => a.type === t);
  const potOdds = v.toCall > 0 ? v.toCall / (v.pot + v.toCall) : 0;
  const noise = d === 'kolay' ? (rng.int(30) - 15) / 100 : d === 'orta' ? (rng.int(10) - 5) / 100 : 0;
  const e = eq + noise;
  const raise = has('raise') as { type: 'raise'; to: number } | undefined;
  if (e > 0.75 && (raise || has('allin'))) {
    const target = Math.min(v.maxRaiseTo, Math.max(raise?.to ?? 0, Math.round(v.currentBet + v.pot * (d === 'zor' ? 0.75 : 0.6))));
    if (raise && target >= raise.to) return { type: 'raise', to: target };
    return has('allin') ?? (has('call') ?? { type: 'check' });
  }
  if (e > 0.55 && raise && v.toCall === 0 && rng.int(3) === 0) return { type: 'raise', to: raise.to };
  if (v.toCall === 0) return { type: 'check' };
  if (e >= potOdds + (d === 'zor' ? 0.05 : 0)) return has('call') ?? has('allin') ?? { type: 'fold' };
  return { type: 'fold' };
}
