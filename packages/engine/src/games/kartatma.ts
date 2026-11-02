import { makeDeck, rankOf, suitOf, type Suit } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

/* =====================================================================================
 * PİS YEDİLİ — uygulanan kurallar
 * - 2–5 oyuncu, 52 kart, herkese 7 kart; bir kart açılır (Vale çıkarsa desteye karıştırılıp yenisi açılır).
 * - Yerdeki kartla aynı renk (takım) ya da aynı değerde kart atılır. Vale her kartın üstüne atılır ve takım seçilir.
 * - 7: sıradaki 2 kart çeker; elinde 7 varsa atıp cezayı büyütebilir (7 başına +2).
 * - 8: atan oyuncu bir kart daha atar (atamazsa bir kart çeker ve sıra geçer).
 * - As: sıradaki oyuncu atlanır. 10: yön değişir (2 kişide sıradaki atlanır).
 * - Atacak kartı olmayan bir kart çeker; çektiği kart uyuyorsa atabilir, uymuyorsa pas geçer.
 * - Elini ilk bitiren eli kazanır. Diğerleri elindeki kartların cezasını yazar: 2–10 kendi sayısı, Q/K 10, As 11,
 *   Vale 25; el Valeyle bitirildiyse cezalar iki katı. Seçilen el sayısı sonunda en düşük ceza kazanır.
 * ===================================================================================== */

export interface PisState {
  game: 'pisyedili';
  n: number;
  hands: string[][];
  deck: string[];
  discard: string[];
  suit: Suit;
  dir: 1 | -1;
  turn: number;
  phase: 'play' | 'drawn' | 'eight' | 'over';
  penalty: number;
  scores: number[];
  handNo: number;
  totalHands: number;
  lastHand: { winner: number; delta: number[]; jack: boolean } | null;
  note: string;
}
export type PisAction = { type: 'play'; card: string; suit?: Suit } | { type: 'draw' } | { type: 'pass' };
export interface PisView extends Omit<PisState, 'hands' | 'deck'> { me: number | null; hand: string[]; handCounts: number[]; deckCount: number; top: string; legal: PisAction[] }

const pisPenalty = (c: string) => (rankOf(c) === 11 ? 25 : rankOf(c) === 14 ? 11 : rankOf(c) >= 12 ? 10 : rankOf(c));
const step = (s: PisState, k = 1) => (((s.turn + s.dir * k) % s.n) + s.n) % s.n;

function pisDraw(s: PisState, seat: number, k: number) {
  for (let i = 0; i < k; i++) {
    if (!s.deck.length) {
      const top = s.discard.pop()!;
      s.deck = s.discard.reverse();
      s.discard = [top];
      if (!s.deck.length) return;
    }
    s.hands[seat].push(s.deck.pop()!);
  }
}

function pisDeal(s: PisState, rng: Rng) {
  let deck = shuffle(makeDeck(), rng);
  s.hands = Array.from({ length: s.n }, () => deck.splice(0, 7));
  let top = deck.pop()!;
  while (rankOf(top) === 11) { deck.unshift(top); deck = shuffle(deck, rng); top = deck.pop()!; }
  s.deck = deck;
  s.discard = [top];
  s.suit = suitOf(top);
  s.dir = 1;
  s.penalty = 0;
  s.phase = 'play';
  s.note = '';
}

function pisPlayable(s: PisState, card: string) {
  const top = s.discard[s.discard.length - 1];
  if (s.penalty > 0) return rankOf(card) === 7;
  if (rankOf(card) === 11) return true;
  return suitOf(card) === s.suit || rankOf(card) === rankOf(top);
}

export const PisYedili: GameModule<PisState, PisAction, PisView> = {
  id: 'pisyedili',
  name: 'Pis Yedili',
  playerCounts: [2, 3, 4, 5],
  options: [{ key: 'hands', label: 'El sayısı', default: 3, choices: [1, 3, 5].map((v) => ({ value: v, label: `${v} el` })) }],
  setup(cfg, rng) {
    if (cfg.players < 2 || cfg.players > 5) throw new IllegalMoveError('Pis Yedili 2–5 kişiyle oynanır');
    const s = { game: 'pisyedili', n: cfg.players, turn: rng.int(cfg.players), scores: new Array(cfg.players).fill(0), handNo: 1, totalHands: Number(cfg.options?.hands ?? 3), lastHand: null } as unknown as PisState;
    pisDeal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    const hand = s.hands[seat];
    const cards = (s.phase === 'drawn' ? [hand[hand.length - 1]] : hand).filter((c) => pisPlayable(s, c));
    const out: PisAction[] = cards.flatMap((card) => (rankOf(card) === 11 ? SUITS.map((suit) => ({ type: 'play' as const, card, suit })) : [{ type: 'play' as const, card }]));
    if (s.phase === 'drawn') out.push({ type: 'pass' });
    else out.push({ type: 'draw' });
    return out;
  },
  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s: PisState = { ...s0, hands: s0.hands.map((h) => h.slice()), deck: s0.deck.slice(), discard: s0.discard.slice(), scores: s0.scores.slice() };
    if (a?.type === 'draw') {
      if (s.phase === 'drawn') throw new IllegalMoveError('Zaten çektiniz');
      if (s.penalty > 0) { pisDraw(s, seat, s.penalty); s.note = `${s.penalty} kart çekti`; s.penalty = 0; s.turn = step(s); s.phase = 'play'; return s; }
      pisDraw(s, seat, 1);
      if (s.phase === 'eight') { s.turn = step(s); s.phase = 'play'; return s; }
      s.phase = 'drawn';
      return s;
    }
    if (a?.type === 'pass') {
      if (s.phase !== 'drawn') throw new IllegalMoveError('Önce kart çekin');
      s.phase = 'play'; s.turn = step(s); return s;
    }
    if (a?.type !== 'play') throw new IllegalMoveError('Geçersiz hamle');
    if (!s.hands[seat].includes(a.card)) throw new IllegalMoveError('Bu kart elinizde yok');
    if (s.phase === 'drawn' && a.card !== s.hands[seat][s.hands[seat].length - 1]) throw new IllegalMoveError('Yalnızca çektiğiniz kartı atabilirsiniz');
    if (!pisPlayable(s, a.card)) throw new IllegalMoveError(s.penalty ? '7 cezası var: 7 atın ya da kart çekin' : 'Bu kart yerdeki karta uymuyor');
    const r = rankOf(a.card);
    if (r === 11 && !SUITS.includes(a.suit as Suit)) throw new IllegalMoveError('Vale için takım seçin');
    s.hands[seat].splice(s.hands[seat].indexOf(a.card), 1);
    s.discard.push(a.card);
    s.suit = r === 11 ? a.suit! : suitOf(a.card);
    s.note = '';
    if (!s.hands[seat].length) {
      const jack = r === 11;
      const delta = s.hands.map((h) => h.reduce((t, c) => t + pisPenalty(c), 0) * (jack ? 2 : 1));
      delta.forEach((d, p) => (s.scores[p] += d));
      s.lastHand = { winner: seat, delta, jack };
      if (s.handNo >= s.totalHands) { s.phase = 'over'; return s; }
      s.handNo++;
      pisDeal(s, rng);
      s.turn = seat;
      return s;
    }
    if (r === 8) { s.phase = 'eight'; s.note = '8: bir kart daha'; return s; }
    s.phase = 'play';
    if (r === 7) { s.penalty += 2; s.turn = step(s); return s; }
    if (r === 14) { s.turn = step(s, 2); s.note = 'As: sıradaki atlandı'; return s; }
    if (r === 10) { if (s.n === 2) s.turn = seat; else { s.dir = (s.dir * -1) as 1 | -1; s.turn = step(s); } s.note = 'Yön değişti'; return s; }
    s.turn = step(s);
    return s;
  },
  view(s, seat) {
    const { hands, deck, ...rest } = s;
    return { ...rest, discard: s.discard.slice(-5), scores: s.scores.slice(), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), deckCount: deck.length, top: s.discard[s.discard.length - 1], legal: seat === null ? [] : PisYedili.legalActions(s, seat) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const min = Math.min(...s.scores);
    return { winners: s.scores.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0), scores: s.scores.slice(), lowerIsBetter: true, summary: 'En az ceza kazanır' };
  },
  ai(v, seat, d, rng) {
    const plays = v.legal.filter((x): x is Extract<PisAction, { type: 'play' }> => x.type === 'play');
    if (!plays.length) return v.legal[0];
    if (d === 'kolay') return plays[rng.int(plays.length)];
    const count = (s: Suit) => v.hand.filter((c) => suitOf(c) === s && rankOf(c) !== 11).length;
    const nextCards = v.handCounts[(seat + v.dir + v.n) % v.n];
    const score = (x: Extract<PisAction, { type: 'play' }>) => {
      const r = rankOf(x.card);
      let val = pisPenalty(x.card) * 0.3;
      if (r === 11) val -= v.hand.length > 2 ? 20 : -10; // Valeyi sona sakla
      if (r === 7 || r === 14) val += nextCards <= 3 ? 12 : 3;
      if (r === 8) val += 4;
      if (x.suit) val += count(x.suit) * 3;
      else val += count(suitOf(x.card));
      return val;
    };
    return plays.sort((a, b) => score(b) - score(a))[0];
  },
};

/* =====================================================================================
 * DOST KAZIĞI — uygulanan kurallar
 * - 2–5 oyuncu, 52 kart. Herkese 3 kapalı, üstüne 3 açık ve elde 3 kart; kalan kartlar deste olur.
 * - Yerdeki kartla aynı ya da daha büyük değerde (3 en küçük, As en büyük) bir veya aynı değerde birkaç kart atılır.
 * - 2 her kartın üstüne atılır (sıfırlar). 10 yığını yakar: yığın oyundan çıkar ve atan tekrar oynar.
 *   Yığının üstünde aynı değerden dört kart birikirse de yığın yanar.
 * - Atacak kartı olmayan yığını alır. Deste bitene kadar el 3 karta tamamlanır.
 * - El ve deste bitince açık kartlar, onlar da bitince kapalı kartlar (körlemesine) oynanır.
 *   Kapalı kart uymazsa oyuncu o kartla birlikte yığını alır.
 * - Kartlarını bitiren kurtulur; son kalan oyuncu "kazığı yer" (kaybeder).
 * ===================================================================================== */

export interface KazikState {
  game: 'kazik';
  n: number;
  hands: string[][];
  up: string[][];
  down: string[][];
  deck: string[];
  pile: string[];
  turn: number;
  out: number[];
  loser: number | null;
  note: string;
}
export type KazikAction = { type: 'play'; cards: string[] } | { type: 'blind'; index: number } | { type: 'take' };
export interface KazikView extends Omit<KazikState, 'hands' | 'down' | 'deck'> { me: number | null; hand: string[]; handCounts: number[]; downCounts: number[]; deckCount: number; legal: KazikAction[] }

const kr = (c: string) => rankOf(c); // 2..14
const kazikActive = (s: KazikState) => [...Array(s.n).keys()].filter((p) => !s.out.includes(p));
function topRank(pile: string[]) {
  for (let i = pile.length - 1; i >= 0; i--) return kr(pile[i]);
  return 0;
}
const canBeat = (pile: string[], c: string) => kr(c) === 2 || kr(c) === 10 || kr(c) >= topRank(pile) || (topRank(pile) === 2);
function source(s: KazikState, p: number): 'hand' | 'up' | 'down' | null {
  if (s.hands[p].length) return 'hand';
  if (s.up[p].length) return 'up';
  if (s.down[p].length) return 'down';
  return null;
}
function kazikAdvance(s: KazikState, seat: number, again: boolean) {
  while (s.hands[seat].length < 3 && s.deck.length) s.hands[seat].push(s.deck.pop()!);
  if (source(s, seat) === null && !s.out.includes(seat)) s.out.push(seat);
  const act = kazikActive(s);
  if (act.length <= 1) { s.loser = act[0] ?? null; return; }
  if (again && !s.out.includes(seat)) { s.turn = seat; return; }
  let t = seat;
  do t = (t + 1) % s.n; while (s.out.includes(t));
  s.turn = t;
}
function burnCheck(s: KazikState) {
  const r = kr(s.pile[s.pile.length - 1]);
  const four = s.pile.length >= 4 && s.pile.slice(-4).every((c) => kr(c) === r);
  if (r === 10 || four) { s.pile = []; s.note = 'Yığın yandı!'; return true; }
  return false;
}

export const DostKazigi: GameModule<KazikState, KazikAction, KazikView> = {
  id: 'kazik',
  name: 'Dost Kazığı',
  playerCounts: [2, 3, 4, 5],
  options: [],
  setup(cfg, rng) {
    if (cfg.players < 2 || cfg.players > 5) throw new IllegalMoveError('Dost Kazığı 2–5 kişiyle oynanır');
    const deck = shuffle(makeDeck(), rng);
    const n = cfg.players;
    return {
      game: 'kazik', n, down: Array.from({ length: n }, () => deck.splice(0, 3)), up: Array.from({ length: n }, () => deck.splice(0, 3)),
      hands: Array.from({ length: n }, () => deck.splice(0, 3)), deck, pile: [], turn: rng.int(n), out: [], loser: null, note: '',
    };
  },
  toAct(s) { return s.loser !== null ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.loser !== null || seat !== s.turn) return [];
    const src = source(s, seat);
    if (src === 'down') return s.down[seat].map((_, index) => ({ type: 'blind' as const, index }));
    const cards = src === 'hand' ? s.hands[seat] : s.up[seat];
    const out: KazikAction[] = [];
    const byRank = new Map<number, string[]>();
    for (const c of cards) if (canBeat(s.pile, c)) byRank.set(kr(c), [...(byRank.get(kr(c)) ?? []), c]);
    for (const cs of byRank.values()) for (let k = 1; k <= cs.length; k++) out.push({ type: 'play', cards: cs.slice(0, k) });
    if (!out.length) out.push({ type: 'take' });
    return out;
  },
  apply(s0, seat, a) {
    if (s0.loser !== null) throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s: KazikState = { ...s0, hands: s0.hands.map((h) => h.slice()), up: s0.up.map((h) => h.slice()), down: s0.down.map((h) => h.slice()), deck: s0.deck.slice(), pile: s0.pile.slice(), out: s0.out.slice(), note: '' };
    const src = source(s, seat);
    if (a?.type === 'take') {
      if (src === 'down' || DostKazigi.legalActions(s0, seat).some((x) => x.type === 'play')) throw new IllegalMoveError('Atabileceğiniz kart varken yığını alamazsınız');
      s.hands[seat].push(...s.pile); s.pile = []; s.note = 'yığını aldı';
      kazikAdvance(s, seat, false);
      return s;
    }
    if (a?.type === 'blind') {
      if (src !== 'down' || !Number.isInteger(a.index) || a.index < 0 || a.index >= s.down[seat].length) throw new IllegalMoveError('Geçersiz kapalı kart');
      const [c] = s.down[seat].splice(a.index, 1);
      if (!canBeat(s.pile, c)) { s.hands[seat].push(...s.pile, c); s.pile = []; s.note = 'kapalı kart uymadı, yığını aldı'; kazikAdvance(s, seat, false); return s; }
      s.pile.push(c);
      const burned = burnCheck(s);
      kazikAdvance(s, seat, burned);
      return s;
    }
    if (a?.type !== 'play' || !Array.isArray(a.cards) || !a.cards.length) throw new IllegalMoveError('Kart seçin');
    const from = src === 'hand' ? s.hands[seat] : src === 'up' ? s.up[seat] : null;
    if (!from || a.cards.some((c) => !from.includes(c)) || new Set(a.cards).size !== a.cards.length) throw new IllegalMoveError(src === 'down' ? 'Kapalı kartlardan birini seçin' : 'Bu kartlar oynanamaz');
    if (new Set(a.cards.map(kr)).size !== 1) throw new IllegalMoveError('Aynı anda yalnızca aynı değerdeki kartlar atılır');
    if (!canBeat(s.pile, a.cards[0])) throw new IllegalMoveError('Yerdeki kart kadar ya da daha büyük kart atmalısınız');
    for (const c of a.cards) from.splice(from.indexOf(c), 1);
    s.pile.push(...a.cards);
    const burned = burnCheck(s);
    kazikAdvance(s, seat, burned);
    return s;
  },
  view(s, seat) {
    const { hands, down, deck, ...rest } = s;
    return { ...rest, up: s.up.map((u) => u.slice()), pile: s.pile.slice(-4), out: s.out.slice(), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), downCounts: down.map((d) => d.length), deckCount: deck.length, legal: seat === null ? [] : DostKazigi.legalActions(s, seat) };
  },
  isOver(s) { return s.loser !== null; },
  result(s) {
    if (s.loser === null) return null;
    return { winners: [...Array(s.n).keys()].filter((p) => p !== s.loser), scores: [...Array(s.n).keys()].map((p) => (p === s.loser ? 0 : s.n - s.out.indexOf(p))), loser: s.loser, summary: 'Son kalan kazığı yedi' };
  },
  ai(v, _seat, d, rng) {
    const plays = v.legal.filter((x): x is Extract<KazikAction, { type: 'play' }> => x.type === 'play');
    if (!plays.length) return v.legal[rng.int(v.legal.length)];
    if (d === 'kolay') return plays[rng.int(plays.length)];
    // En küçük normal kartı (2 ve 10 dışı) mümkün olduğunca çok sayıda at; özel kartları sakla
    const special = (c: string) => kr(c) === 2 || kr(c) === 10;
    const normal = plays.filter((p) => !special(p.cards[0]));
    const pool = normal.length ? normal : plays;
    return pool.sort((a, b) => kr(a.cards[0]) - kr(b.cards[0]) || b.cards.length - a.cards.length)[0];
  },
};

/* =====================================================================================
 * YANIK — uygulanan kurallar
 * - 2–4 oyuncu, 52 kart + 2 joker, herkese 7 kart; bir kart açılır.
 * - Sırası gelen desteden ya da yerdeki son karttan çeker, sonra bir kart atar.
 * - Per: aynı takımdan ardışık en az 3 kart (As A-2-3 ya da Q-K-A) ya da aynı değerde farklı takımlardan 3–4 kart.
 *   Joker her kartın yerine geçer.
 * - Çektikten sonra elindeki 7 kartın tamamı perlerden oluşan oyuncu 8. kartı atarak eli bitirir.
 * - Diğerleri perlere giremeyen kartlarının cezasını yazar: 2–10 kendi sayısı, J/Q/K 10, As 11, joker 25.
 * - Toplam cezası 101'e ulaşan "yanar" ve oyundan çıkar. Son kalan oyuncu kazanır.
 * - Deste biterse yerdeki kartlar (son kart hariç) karıştırılıp yeni deste olur.
 * ===================================================================================== */

export interface YanikState {
  game: 'yanik';
  n: number;
  hands: string[][];
  deck: string[];
  discard: string[];
  turn: number;
  phase: 'draw' | 'discard' | 'over';
  scores: number[];
  burned: boolean[];
  handNo: number;
  lastHand: { winner: number; delta: number[]; burned: number[] } | null;
}
export type YanikAction = { type: 'draw'; from: 'deck' | 'discard' } | { type: 'discard'; card: string } | { type: 'finish'; card: string };
export interface YanikView extends Omit<YanikState, 'hands' | 'deck'> { me: number | null; hand: string[]; handCounts: number[]; deckCount: number; legal: YanikAction[]; myPenalty: number }

const isJ = (c: string) => c.startsWith('X');
const yVal = (c: string) => (isJ(c) ? 25 : rankOf(c) === 14 ? 11 : rankOf(c) >= 11 ? 10 : rankOf(c));

/** Kartlar geçerli bir per mi (jokerlerle)? */
export function yanikMeld(cards: string[]): boolean {
  if (cards.length < 3) return false;
  const reals = cards.filter((c) => !isJ(c));
  const w = cards.length - reals.length;
  if (!reals.length) return false;
  const r0 = rankOf(reals[0]);
  if (cards.length <= 4 && reals.every((c) => rankOf(c) === r0) && new Set(reals.map(suitOf)).size === reals.length) return true;
  if (!reals.every((c) => suitOf(c) === suitOf(reals[0]))) return false;
  for (const aceLow of [false, true]) {
    const pos = reals.map((c) => (aceLow && rankOf(c) === 14 ? 1 : rankOf(c))).sort((a, b) => a - b);
    if (new Set(pos).size !== pos.length) continue;
    const gaps = pos[pos.length - 1] - pos[0] + 1 - pos.length;
    if (gaps <= w && pos[pos.length - 1] - pos[0] + 1 + (w - gaps) <= 14) return true;
  }
  return false;
}

/** Perlere girebilen en yüksek değerli kart kümesi; dönen değer: perlere girmeyen kartların ceza toplamı. */
export function yanikPenalty(hand: string[]): number {
  const n = hand.length;
  const memo = new Map<number, number>();
  const all = (1 << n) - 1;
  const rec = (mask: number): number => {
    if (mask === 0) return 0;
    if (memo.has(mask)) return memo.get(mask)!;
    const first = Math.log2(mask & -mask) | 0;
    // ilk kartı bırak
    let best = yVal(hand[first]) + rec(mask & ~(1 << first));
    // ilk kartı içeren bir per kur
    for (let sub = mask; sub; sub = (sub - 1) & mask) {
      if (!(sub & (1 << first))) continue;
      const cnt = popcount(sub);
      if (cnt < 3) continue;
      const cards = hand.filter((_, i) => sub & (1 << i));
      if (yanikMeld(cards)) best = Math.min(best, rec(mask & ~sub));
    }
    memo.set(mask, best);
    return best;
  };
  return rec(all);
}
const popcount = (x: number) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };

function yDeal(s: YanikState, rng: Rng) {
  const deck = shuffle([...makeDeck(), 'X1', 'X2'], rng);
  s.hands = [...Array(s.n).keys()].map((p) => (s.burned[p] ? [] : deck.splice(0, 7)));
  s.discard = [deck.pop()!];
  s.deck = deck;
  s.phase = 'draw';
}
const yNext = (s: YanikState, seat: number) => { let t = seat; do t = (t + 1) % s.n; while (s.burned[t]); return t; };

export const Yanik: GameModule<YanikState, YanikAction, YanikView> = {
  id: 'yanik',
  name: 'Yanık',
  playerCounts: [2, 3, 4],
  options: [],
  setup(cfg, rng) {
    if (cfg.players < 2 || cfg.players > 4) throw new IllegalMoveError('Yanık 2–4 kişiyle oynanır');
    const s = { game: 'yanik', n: cfg.players, turn: rng.int(cfg.players), scores: new Array(cfg.players).fill(0), burned: new Array(cfg.players).fill(false), handNo: 1, lastHand: null } as unknown as YanikState;
    yDeal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'draw') return [{ type: 'draw', from: 'deck' }, { type: 'draw', from: 'discard' }];
    const out: YanikAction[] = [...new Set(s.hands[seat])].map((card) => ({ type: 'discard' as const, card }));
    for (const card of new Set(s.hands[seat])) {
      const rest = s.hands[seat].slice(); rest.splice(rest.indexOf(card), 1);
      if (yanikPenalty(rest) === 0) out.push({ type: 'finish', card });
    }
    return out;
  },
  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s: YanikState = { ...s0, hands: s0.hands.map((h) => h.slice()), deck: s0.deck.slice(), discard: s0.discard.slice(), scores: s0.scores.slice(), burned: s0.burned.slice() };
    if (s.phase === 'draw') {
      if (a?.type !== 'draw') throw new IllegalMoveError('Önce kart çekin');
      if (a.from === 'discard') { if (!s.discard.length) throw new IllegalMoveError('Yerde kart yok'); s.hands[seat].push(s.discard.pop()!); }
      else {
        if (!s.deck.length) { const top = s.discard.pop()!; s.deck = shuffle(s.discard, rng); s.discard = [top]; }
        s.hands[seat].push(s.deck.pop()!);
      }
      s.phase = 'discard';
      return s;
    }
    if (a?.type !== 'discard' && a?.type !== 'finish') throw new IllegalMoveError('Bir kart atın');
    const k = s.hands[seat].indexOf(a.card);
    if (k < 0) throw new IllegalMoveError('Bu kart elinizde yok');
    s.hands[seat].splice(k, 1);
    s.discard.push(a.card);
    if (a.type === 'finish') {
      if (yanikPenalty(s.hands[seat]) !== 0) throw new IllegalMoveError('Eliniz bitmiyor: 7 kartın hepsi per olmalı');
      const delta = s.hands.map((h, p) => (p === seat || s.burned[p] ? 0 : yanikPenalty(h)));
      delta.forEach((d, p) => (s.scores[p] += d));
      const newly = [...Array(s.n).keys()].filter((p) => !s.burned[p] && s.scores[p] >= 101);
      newly.forEach((p) => (s.burned[p] = true));
      s.lastHand = { winner: seat, delta, burned: newly };
      if (s.burned.filter((b) => !b).length <= 1) { s.phase = 'over'; return s; }
      s.handNo++;
      yDeal(s, rng);
      s.turn = yNext(s, seat);
      return s;
    }
    s.turn = yNext(s, seat);
    s.phase = 'draw';
    return s;
  },
  view(s, seat) {
    const { hands, deck, ...rest } = s;
    return { ...rest, discard: s.discard.slice(-3), scores: s.scores.slice(), burned: s.burned.slice(), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), deckCount: deck.length, legal: seat === null ? [] : Yanik.legalActions(s, seat), myPenalty: seat === null ? 0 : yanikPenalty(hands[seat].length > 7 ? hands[seat].slice(0, 7) : hands[seat]) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const winner = s.burned.indexOf(false);
    return { winners: [winner], scores: s.scores.slice(), lowerIsBetter: true, summary: 'Diğerleri yandı, son kalan kazandı' };
  },
  ai(v, seat, d, rng) {
    if (v.phase === 'draw') {
      const top = v.discard[v.discard.length - 1];
      if (top && d !== 'kolay') {
        const now = Math.min(...v.hand.map((_, i) => yanikPenalty(v.hand.filter((__, j) => j !== i))));
        const withTop = Math.min(...v.hand.map((_, i) => yanikPenalty([...v.hand.filter((__, j) => j !== i), top])));
        if (withTop < now - 5) return { type: 'draw', from: 'discard' };
      }
      return { type: 'draw', from: 'deck' };
    }
    const fin = v.legal.find((x) => x.type === 'finish');
    if (fin) return fin;
    const opts = [...new Set(v.hand)].filter((c) => !isJ(c));
    if (d === 'kolay') return { type: 'discard', card: opts[rng.int(opts.length)] };
    let best = opts[0], bv = Infinity;
    for (const c of opts) {
      const rest = v.hand.slice(); rest.splice(rest.indexOf(c), 1);
      const val = yanikPenalty(rest) - (d === 'zor' ? yVal(c) * 0.2 : 0);
      if (val < bv) { bv = val; best = c; }
    }
    return { type: 'discard', card: best };
  },
};
