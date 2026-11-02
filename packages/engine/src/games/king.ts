import { makeDeck, rankOf, suitOf, type Suit } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';
import { trickWinner } from './batak';

/**
 * KING — uygulanan kurallar
 * - 4 oyuncu, herkese 13 kart. Klasik oyun 20 eldir; seçme sırası her el bir sonraki oyuncuya geçer.
 * - Her oyuncu toplam 2 kozlu ve 3 ceza oyunu seçer; her ceza türü oyunda en fazla 2 kez oynanır.
 *   (Kısa oyun: 8 el, her oyuncu 1 kozlu + 1 ceza, her ceza en fazla 1 kez.)
 * - Ceza oyunları: El almaz (−50/el), Kupa almaz (−30/kupa), Erkek almaz (−60/papaz ve vale),
 *   Kız almaz (−100/kız), Rıfkı (−320, kupa papazı), Son iki (−180, son iki elin her biri).
 * - Kozlu: seçen kozu belirler, her el +50.
 * - Seçen oyuncu ilk eli açar. Renge uymak zorunludur. Kozluda renk yoksa koz atmak zorunludur.
 *   Kupa almaz ve Rıfkı'da kupa kırılmadan (yere kupa düşmeden) kupa ile el açılamaz (elde yalnız kupa yoksa).
 * - Ceza kartlarının hepsi alınınca el erken biter (Kupa almaz, Erkek almaz, Kız almaz, Rıfkı).
 * - Oyun sonunda en yüksek toplam puan kazanır.
 */

export type KingGame = 'koz' | 'el' | 'kupa' | 'erkek' | 'kiz' | 'rifki' | 'soniki';
export const KING_GAMES: Record<KingGame, string> = { koz: 'Kozlu', el: 'El almaz', kupa: 'Kupa almaz', erkek: 'Erkek almaz', kiz: 'Kız almaz', rifki: 'Rıfkı', soniki: 'Son iki' };
const CEZALAR: KingGame[] = ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki'];

export interface KingState {
  game: 'king';
  hands: string[][];
  handNo: number;
  totalHands: number;
  quota: { koz: number; ceza: number; perType: number };
  chooser: number;
  firstChooser: number;
  phase: 'choose' | 'play' | 'over';
  contract: { game: KingGame; trump: Suit | null } | null;
  usedTypes: Record<string, number>;
  picks: { koz: number; ceza: number }[];
  trick: { seat: number; card: string }[];
  trickNo: number;
  turn: number;
  taken: string[][];
  tricksWon: number[];
  heartsBroken: boolean;
  scores: number[];
  lastHand: { game: KingGame; chooser: number; delta: number[] } | null;
  lastTrick: { seat: number; card: string }[] | null;
  played: string[];
}
export type KingAction = { type: 'choose'; game: KingGame; trump?: Suit } | { type: 'play'; card: string };
export interface KingView extends Omit<KingState, 'hands'> { me: number | null; hand: string[]; handCounts: number[]; legal: KingAction[]; handDelta: number[] }

const isPenaltyCard = (g: KingGame, c: string) =>
  g === 'kupa' ? suitOf(c) === 'H' : g === 'erkek' ? rankOf(c) === 13 || rankOf(c) === 11 : g === 'kiz' ? rankOf(c) === 12 : g === 'rifki' ? c === 'H13' : false;
const PENALTY_TOTAL: Partial<Record<KingGame, number>> = { kupa: 13, erkek: 8, kiz: 4, rifki: 1 };

/** Bu ana kadarki el puanı (oyuncu başına). */
export function handScore(s: Pick<KingState, 'contract' | 'taken' | 'tricksWon'> & { lastTwo?: number[] }, lastTwo: number[] = []): number[] {
  const g = s.contract!.game;
  return [0, 1, 2, 3].map((p) => (scoreFor(p) || 0)); // -0 olmasın
  function scoreFor(p: number): number {
    const cards = s.taken[p];
    switch (g) {
      case 'koz': return s.tricksWon[p] * 50;
      case 'el': return s.tricksWon[p] * -50;
      case 'kupa': return cards.filter((c) => suitOf(c) === 'H').length * -30;
      case 'erkek': return cards.filter((c) => rankOf(c) === 13 || rankOf(c) === 11).length * -60;
      case 'kiz': return cards.filter((c) => rankOf(c) === 12).length * -100;
      case 'rifki': return cards.includes('H13') ? -320 : 0;
      case 'soniki': return lastTwo.filter((w) => w === p).length * -180;
    }
  }
}

function allowedChoices(s: KingState): KingGame[] {
  const pk = s.picks[s.chooser];
  const out: KingGame[] = [];
  if (pk.koz < s.quota.koz) out.push('koz');
  if (pk.ceza < s.quota.ceza) for (const g of CEZALAR) if ((s.usedTypes[g] ?? 0) < s.quota.perType) out.push(g);
  return out;
}

export function kingLegalCards(hand: string[], trick: { seat: number; card: string }[], c: { game: KingGame; trump: Suit | null }, heartsBroken: boolean): string[] {
  if (!trick.length) {
    if ((c.game === 'kupa' || c.game === 'rifki') && !heartsBroken) {
      const non = hand.filter((x) => suitOf(x) !== 'H');
      if (non.length) return non;
    }
    return hand.slice();
  }
  const led = suitOf(trick[0].card);
  const follow = hand.filter((x) => suitOf(x) === led);
  if (follow.length) return follow;
  if (c.game === 'koz' && c.trump) {
    const tr = hand.filter((x) => suitOf(x) === c.trump);
    if (tr.length) return tr;
  }
  return hand.slice();
}

function deal(s: KingState, rng: Rng) {
  const deck = shuffle(makeDeck(), rng);
  s.hands = [0, 1, 2, 3].map((p) => deck.slice(p * 13, p * 13 + 13));
  s.phase = 'choose';
  s.contract = null;
  s.trick = [];
  s.trickNo = 0;
  s.taken = [[], [], [], []];
  s.tricksWon = [0, 0, 0, 0];
  s.heartsBroken = false;
  s.played = [];
  s.turn = s.chooser;
  (s as any)._lastTwo = [];
}

function clone(s: KingState): KingState {
  return { ...s, hands: s.hands.map((h) => h.slice()), usedTypes: { ...s.usedTypes }, picks: s.picks.map((p) => ({ ...p })), trick: s.trick.slice(), taken: s.taken.map((t) => t.slice()), tricksWon: s.tricksWon.slice(), scores: s.scores.slice(), played: s.played.slice(), ...({ _lastTwo: ((s as any)._lastTwo ?? []).slice() } as any) };
}

function finishHand(s: KingState, rng: Rng) {
  const delta = handScore(s, (s as any)._lastTwo ?? []);
  delta.forEach((d, p) => (s.scores[p] += d));
  s.lastHand = { game: s.contract!.game, chooser: s.chooser, delta };
  if (s.handNo >= s.totalHands) { s.phase = 'over'; return; }
  s.handNo++;
  s.chooser = (s.chooser + 1) % 4;
  deal(s, rng);
}

export const King: GameModule<KingState, KingAction, KingView> = {
  id: 'king',
  name: 'King',
  playerCounts: [4],
  options: [{ key: 'length', label: 'Oyun', default: 'tam', choices: [{ value: 'tam', label: 'Klasik (20 el)' }, { value: 'kisa', label: 'Kısa (8 el)' }] }],
  setup(cfg, rng) {
    if (cfg.players !== 4) throw new IllegalMoveError('King 4 kişiyle oynanır');
    const short = cfg.options?.length === 'kisa';
    const first = rng.int(4);
    const s = {
      game: 'king', handNo: 1, totalHands: short ? 8 : 20, quota: short ? { koz: 1, ceza: 1, perType: 1 } : { koz: 2, ceza: 3, perType: 2 },
      chooser: first, firstChooser: first, usedTypes: {}, picks: [0, 1, 2, 3].map(() => ({ koz: 0, ceza: 0 })), scores: [0, 0, 0, 0], lastHand: null, lastTrick: null,
    } as unknown as KingState;
    deal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'choose') return allowedChoices(s).flatMap<KingAction>((g) => (g === 'koz' ? (['S', 'H', 'D', 'C'] as Suit[]).map((trump) => ({ type: 'choose' as const, game: g, trump })) : [{ type: 'choose' as const, game: g }]));
    return kingLegalCards(s.hands[seat], s.trick, s.contract!, s.heartsBroken).map((card) => ({ type: 'play' as const, card }));
  },
  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    if (s.phase === 'choose') {
      if (a?.type !== 'choose' || !allowedChoices(s).includes(a.game)) throw new IllegalMoveError('Bu oyunu seçemezsiniz (hakkınız ya da oyunun kotası doldu)');
      if (a.game === 'koz' && !['S', 'H', 'D', 'C'].includes(a.trump as string)) throw new IllegalMoveError('Kozu seçin');
      s.contract = { game: a.game, trump: a.game === 'koz' ? a.trump! : null };
      if (a.game === 'koz') s.picks[seat].koz++; else { s.picks[seat].ceza++; s.usedTypes[a.game] = (s.usedTypes[a.game] ?? 0) + 1; }
      s.phase = 'play';
      s.turn = s.chooser;
      return s;
    }
    if (a?.type !== 'play') throw new IllegalMoveError('Kart oynayın');
    const legal = kingLegalCards(s.hands[seat], s.trick, s.contract!, s.heartsBroken);
    if (!legal.includes(a.card)) {
      if (!s.hands[seat].includes(a.card)) throw new IllegalMoveError('Bu kart elinizde yok');
      if (!s.trick.length) throw new IllegalMoveError('Kupa kırılmadan kupa ile el açılamaz');
      throw new IllegalMoveError(s.hands[seat].some((x) => suitOf(x) === suitOf(s.trick[0].card)) ? 'Yerdeki renge uymak zorundasınız' : 'Renginiz yoksa koz atmak zorundasınız');
    }
    s.hands[seat].splice(s.hands[seat].indexOf(a.card), 1);
    s.trick.push({ seat, card: a.card });
    s.played.push(a.card);
    if (suitOf(a.card) === 'H') s.heartsBroken = true;
    if (s.trick.length < 4) { s.turn = (seat + 1) % 4; return s; }
    const w = trickWinner(s.trick, s.contract!.trump);
    s.taken[w].push(...s.trick.map((t) => t.card));
    s.tricksWon[w]++;
    s.trickNo++;
    if (s.trickNo >= 12) (s as any)._lastTwo.push(w);
    s.lastTrick = s.trick;
    s.trick = [];
    s.turn = w;
    const g = s.contract!.game;
    const total = PENALTY_TOTAL[g];
    const collected = total !== undefined && s.taken.flat().filter((c) => isPenaltyCard(g, c)).length >= total;
    if (s.trickNo === 13 || collected) finishHand(s, rng);
    return s;
  },
  view(s, seat) {
    const { hands, ...rest } = s;
    return { ...rest, picks: s.picks.map((p) => ({ ...p })), usedTypes: { ...s.usedTypes }, trick: s.trick.slice(), taken: s.taken.map((t) => t.slice()), tricksWon: s.tricksWon.slice(), scores: s.scores.slice(), played: s.played.slice(), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), legal: seat === null ? [] : King.legalActions(s, seat), handDelta: s.contract ? handScore(s, (s as any)._lastTwo ?? []) : [0, 0, 0, 0] };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const max = Math.max(...s.scores);
    return { winners: s.scores.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0), scores: s.scores.slice(), summary: 'En yüksek puan kazanır' };
  },
  ai(v, seat, d, rng) { return kingAi(v, seat, d, rng); },
};

// ---------- Yapay zekâ ----------
function risk(hand: string[], g: KingGame): number {
  const hi = hand.filter((c) => rankOf(c) >= 11).length;
  const bySuit = (s: string) => hand.filter((c) => suitOf(c) === s);
  switch (g) {
    case 'el': return hi * 50;
    case 'kupa': return bySuit('H').filter((c) => rankOf(c) >= 9).length * 45 + (bySuit('H').length <= 2 ? 0 : 20);
    case 'erkek': return hand.filter((c) => rankOf(c) === 13 || rankOf(c) === 11).length * 70 + hand.filter((c) => rankOf(c) === 14).length * 30;
    case 'kiz': return hand.filter((c) => rankOf(c) === 12).length * 110 + hand.filter((c) => rankOf(c) >= 13).length * 30;
    case 'rifki': return hand.includes('H13') ? 260 - bySuit('H').length * 30 : hand.includes('H14') ? 120 : 40;
    case 'soniki': return hand.filter((c) => rankOf(c) >= 12).length * 40;
    case 'koz': return 0;
  }
}

export function kingAi(v: KingView, seat: number, d: Difficulty, rng: Rng): KingAction {
  if (v.phase === 'choose') {
    const opts = v.legal as Extract<KingAction, { type: 'choose' }>[];
    if (d === 'kolay') return opts[rng.int(opts.length)];
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    const bestTrump = suits.map((s) => ({ s, v: v.hand.filter((c) => suitOf(c) === s).reduce((t, c) => t + 1 + Math.max(0, rankOf(c) - 10) * 0.6, 0) })).sort((a, b) => b.v - a.v)[0];
    const kozOpt = opts.find((o) => o.game === 'koz' && o.trump === bestTrump.s);
    const strength = v.hand.filter((c) => rankOf(c) >= 13).length + v.hand.filter((c) => suitOf(c) === bestTrump.s).length * 0.5;
    const cezas = opts.filter((o) => o.game !== 'koz').sort((a, b) => risk(v.hand, a.game) - risk(v.hand, b.game));
    if (kozOpt && (strength >= 5.5 || !cezas.length)) return kozOpt;
    return cezas[0] ?? opts[0];
  }
  const cards = (v.legal as { type: 'play'; card: string }[]).map((x) => x.card);
  if (d === 'kolay' || cards.length === 1) return { type: 'play', card: cards[rng.int(cards.length)] };
  const g = v.contract!.game;
  const trump = v.contract!.trump;
  const low = (cs: string[]) => cs.slice().sort((a, b) => rankOf(a) - rankOf(b))[0];
  const high = (cs: string[]) => cs.slice().sort((a, b) => rankOf(b) - rankOf(a))[0];
  if (g === 'koz') {
    if (!v.trick.length) return { type: 'play', card: high(cards) };
    const wins = cards.filter((c) => trickWinner([...v.trick, { seat, card: c }], trump) === seat);
    return { type: 'play', card: wins.length ? low(wins) : low(cards) };
  }
  // Ceza oyunları: el almamaya çalış, cezalı kartlardan kurtul
  const pen = (c: string) => (isPenaltyCard(g, c) ? 100 : 0) + rankOf(c);
  if (!v.trick.length) return { type: 'play', card: low(cards) };
  const led = suitOf(v.trick[0].card);
  const following = cards.every((c) => suitOf(c) === led);
  const ducks = cards.filter((c) => trickWinner([...v.trick, { seat, card: c }], null) !== seat);
  if (following) {
    if (ducks.length) return { type: 'play', card: high(ducks) }; // kazanmayan en yüksek kart
    return { type: 'play', card: v.trick.length === 3 ? high(cards) : low(cards) };
  }
  // Renk yok: en tehlikeli kartı at
  return { type: 'play', card: cards.slice().sort((a, b) => pen(b) - pen(a))[0] };
}
