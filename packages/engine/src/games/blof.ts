import { makeDeck, rankOf, RANK_LABELS } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * BLÖF — uygulanan kurallar
 * - 3–6 oyuncu, 52 kartlık destenin tamamı dağıtılır.
 * - Sıradaki değer As ile başlar ve her hamlede bir artar (A, 2, 3, …, 10, J, Q, K, sonra yine A).
 * - Sırası gelen oyuncu 1–4 kartı kapalı olarak ortaya koyar ve hepsinin sıradaki değerde olduğunu söyler.
 * - Sıradaki oyuncu "Blöf!" diyebilir ya da inanıp kendi hamlesine geçebilir.
 *   Blöf denirse kartlar açılır: yalan varsa ortadaki tüm kartları atan alır; hepsi doğruysa itiraz eden alır.
 * - Elindeki son kartları atan ve blöfü yakalanmayan oyuncu kazanır. Kalanlar elindeki kart sayısına göre sıralanır.
 * - Basitleştirme: yalnızca sıradaki oyuncu blöf diyebilir (çevrim içi oyunda herkes aynı anda bağırmasın diye).
 * - Uzun oyun sınırı: 600 hamlede kimse bitiremezse en az kartı kalan oyuncu kazanır (eşitlikte ilk sıradaki).
 */

export interface BlofState {
  game: 'blof';
  n: number;
  hands: string[][];
  pile: string[];
  claim: { seat: number; count: number; rank: number; cards: string[] } | null;
  rank: number; // sıradaki değer 1..13 (1 = As)
  turn: number;
  phase: 'play' | 'decide' | 'over';
  last: { text: string; caught: boolean | null; taker: number | null } | null;
  winner: number | null;
  moves: number;
}
export type BlofAction = { type: 'play'; cards: string[] } | { type: 'challenge' } | { type: 'believe' };
export interface BlofView extends Omit<BlofState, 'hands' | 'pile' | 'claim'> {
  me: number | null;
  hand: string[];
  handCounts: number[];
  pileCount: number;
  claim: { seat: number; count: number; rank: number } | null;
  legal: BlofAction[];
}

const value = (c: string) => (rankOf(c) === 14 ? 1 : rankOf(c));
export const rankName = (r: number) => (r === 1 ? 'As' : r === 11 ? 'Vale' : r === 12 ? 'Kız' : r === 13 ? 'Papaz' : RANK_LABELS[r]);
const next = (s: BlofState, seat: number) => (seat + 1) % s.n;

function clone(s: BlofState): BlofState {
  return { ...s, hands: s.hands.map((h) => h.slice()), pile: s.pile.slice(), claim: s.claim ? { ...s.claim, cards: s.claim.cards.slice() } : null };
}

export const Blof: GameModule<BlofState, BlofAction, BlofView> = {
  id: 'blof',
  name: 'Blöf',
  playerCounts: [3, 4, 5, 6],
  options: [],
  setup(cfg, rng) {
    if (cfg.players < 3 || cfg.players > 6) throw new IllegalMoveError('Blöf 3–6 kişiyle oynanır');
    const deck = shuffle(makeDeck(), rng);
    const hands: string[][] = Array.from({ length: cfg.players }, () => []);
    deck.forEach((c, i) => hands[i % cfg.players].push(c));
    return { game: 'blof', n: cfg.players, hands, pile: [], claim: null, rank: 1, turn: rng.int(cfg.players), phase: 'play', last: null, winner: null, moves: 0 };
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'decide') return [{ type: 'challenge' }, { type: 'believe' }];
    return [{ type: 'play', cards: [] }]; // 1–4 kartlık tüm kombinasyonlar listelenmez; apply doğrular
  },
  apply(s0, seat, a) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    if (s.phase === 'decide') {
      const c = s.claim!;
      if (a?.type === 'challenge') {
        const lie = c.cards.some((x) => value(x) !== c.rank);
        const taker = lie ? c.seat : seat;
        s.hands[taker].push(...s.pile);
        s.last = { text: lie ? `Blöf yakalandı! ${c.cards.length} kartın hepsi ${rankName(c.rank)} değildi.` : `Doğru söylüyordu: ${c.count} tane ${rankName(c.rank)}.`, caught: lie, taker };
        s.pile = [];
        s.claim = null;
        if (!lie && s.hands[c.seat].length === 0) { s.phase = 'over'; s.winner = c.seat; return s; }
        if ((s.moves ?? 0) >= 600) return limitEnd(s);
        s.phase = 'play';
        s.turn = seat; // itiraz eden oyuncu oynar
        return s;
      }
      if (a?.type !== 'believe') throw new IllegalMoveError('Blöf deyin ya da inanın');
      if (s.hands[c.seat].length > 0 && (s.moves ?? 0) >= 600) return limitEnd(s);
      s.last = { text: `${c.count} tane ${rankName(c.rank)} kabul edildi.`, caught: null, taker: null };
      s.claim = null;
      if (s.hands[c.seat].length === 0) { s.phase = 'over'; s.winner = c.seat; return s; }
      s.phase = 'play';
      return s;
    }
    if (a?.type !== 'play' || !Array.isArray(a.cards) || a.cards.length < 1 || a.cards.length > 4) throw new IllegalMoveError('1 ile 4 arasında kart seçin');
    if (new Set(a.cards).size !== a.cards.length || a.cards.some((c) => !s.hands[seat].includes(c))) throw new IllegalMoveError('Bu kartlar elinizde yok');
    s.hands[seat] = s.hands[seat].filter((c) => !a.cards.includes(c));
    s.pile.push(...a.cards);
    s.claim = { seat, count: a.cards.length, rank: s.rank, cards: a.cards.slice() };
    s.moves = (s.moves ?? 0) + 1;
    s.rank = (s.rank % 13) + 1;
    s.turn = next(s, seat);
    s.phase = 'decide';
    return s;
  },
  view(s, seat) {
    const { hands, pile, claim, ...rest } = s;
    return { ...rest, me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), pileCount: pile.length, claim: claim ? { seat: claim.seat, count: claim.count, rank: claim.rank } : null, legal: seat === null ? [] : Blof.legalActions(s, seat) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    return { winners: [s.winner!], scores: s.hands.map((h) => -h.length), summary: s.hands[s.winner!].length ? 'Hamle sınırında en az kartı kalan kazandı' : 'Kartlarını ilk bitiren kazandı' };
  },
  ai(v, seat, d, rng) { return blofAi(v, seat, d, rng); },
};

function limitEnd(s: BlofState): BlofState {
  let w = 0;
  s.hands.forEach((h, p) => { if (h.length < s.hands[w].length) w = p; });
  s.phase = 'over';
  s.winner = w;
  s.last = { text: 'Hamle sınırı doldu: en az kartı kalan kazandı.', caught: null, taker: null };
  return s;
}

export function blofAi(v: BlofView, seat: number, d: Difficulty, rng: Rng): BlofAction {
  const mine = (r: number) => v.hand.filter((c) => value(c) === r);
  if (v.phase === 'decide') {
    const c = v.claim!;
    const have = mine(c.rank).length;
    if (have + c.count > 4) return { type: 'challenge' }; // kesin yalan
    if (v.handCounts[c.seat] === 0) {
      // Son atış: iddianın doğru olma olasılığını kabaca hesapla; kör itiraz oyunu kilitler
      const unknownCopies = 4 - have;
      const pTrue = unknownCopies < c.count ? 0 : Math.pow(unknownCopies / 4, c.count) * 0.6;
      const pChallenge = d === 'zor' ? 0.8 - pTrue : d === 'orta' ? 0.55 - pTrue / 2 : 0.45;
      return rng.int(100) / 100 < pChallenge ? { type: 'challenge' } : { type: 'believe' };
    }
    if (d === 'kolay') return rng.int(5) === 0 ? { type: 'challenge' } : { type: 'believe' };
    // Olasılık: iddia edilen değerden görmediğim kopya sayısına göre yalan ihtimali.
    // Rakip çoğunlukla elindeki doğru kartları atar; 1–2 kartlık iddialar genelde doğrudur.
    const unknown = 4 - have;
    // Kaç oyuncu varsa elde o kadar çok kopya olabilir; büyük iddialar ancak az oyunculu masada şüphelidir
    const pLie = c.count > unknown ? 1 : c.count <= 2 ? 0.15 * c.count : c.count === 3 ? 0.25 + 0.05 * v.n : 0.35 + 0.05 * v.n;
    const risk = v.pileCount / 52; // büyük yığını almak pahalı
    const threshold = (d === 'zor' ? 0.4 : 0.45) + risk * 0.5 + rng.int(10) / 100;
    return pLie > threshold ? { type: 'challenge' } : { type: 'believe' };
  }
  const truth = mine(v.rank);
  if (truth.length) {
    // Doğru kartlar + (zor) bir tane gereksiz kart ekleyerek el boşalt
    // Doğru kartların yanına bir "fazlalık" ekleyerek eli hızlı boşalt (son kartlarda risk alma)
    const extra = d !== 'kolay' && truth.length < 4 && v.hand.length > truth.length + 2 && rng.int(2) === 0 ? [pickJunk(v, rng)].filter((x) => !truth.includes(x)) : [];
    return { type: 'play', cards: [...truth.slice(0, 4), ...extra].slice(0, 4) };
  }
  // Blöf: ilerideki sıralarda en az işe yarayacak kartı at
  return { type: 'play', cards: [pickJunk(v, rng)] };
}

function pickJunk(v: BlofView, rng: Rng): string {
  // Sıradaki değere en uzak (en geç lazım olacak) kart
  let best = v.hand[0], bd = -1;
  for (const c of v.hand) {
    const dist = (value(c) - v.rank + 13) % 13;
    if (dist > bd || (dist === bd && rng.int(2))) { bd = dist; best = c; }
  }
  return best;
}
