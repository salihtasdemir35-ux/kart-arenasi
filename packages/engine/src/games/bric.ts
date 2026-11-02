import { makeDeck, rankOf, suitOf, type Suit } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';
import { trickWinner } from './batak';

/**
 * BRİÇ (KONTRAT BRİÇİ, DUPLICATE PUANLAMA) — uygulanan kurallar
 * - Koltuklar: 0 Kuzey, 1 Doğu, 2 Güney, 3 Batı. Kuzey-Güney ve Doğu-Batı eştir. Her board'da 13'er kart.
 * - Dağıtan ve zon durumu standart 16 board döngüsüne göre belirlenir.
 * - İhale dağıtandan başlar: pas, ihale (1–7 × ♣ ♦ ♥ ♠ SA, her ihale öncekinden yüksek), kontr (son ihale rakibinse),
 *   sürkontr (son kontr rakibinse). İlk dört çağrı pas ise board oynanmaz. Bir ihaleden sonra üç pas ihaleyi bitirir.
 * - Deklaran: kontrat rengini (ya da SA'yı) kendi tarafında ilk söyleyen oyuncu. Açışı deklaranın solundaki yapar;
 *   açıştan sonra yer (deklaranın eşi) kartlarını açar ve yerin kartlarını deklaran oynar.
 * - Renge uymak zorunludur. El en yüksek koza, koz yoksa açılan rengin en yükseğine gider.
 * - Puan: kontrat (♣♦ 20, ♥♠ 30, SA ilk el 40 sonra 30; kontr ×2, sürkontr ×4), kontrat puanı 100 ve üstü ise oyun
 *   (zonsuz 300, zonda 500), değilse kısmi 50; küçük şlem 500/750, büyük şlem 1000/1500; kontrlu yapılan +50, sürkontrlu +100;
 *   fazla el normal el değeri, kontrlu 100/200, sürkontrlu 200/400; batış normal 50/100 el başına,
 *   kontrlu zonsuz 100-300-500-800…, zonda 200-500-800…; sürkontr iki katı.
 * - Seçilen board sayısı sonunda toplam puanı yüksek olan taraf kazanır.
 */

export type Strain = 'C' | 'D' | 'H' | 'S' | 'NT';
export const STRAINS: Strain[] = ['C', 'D', 'H', 'S', 'NT'];
export const STRAIN_LABEL: Record<Strain, string> = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'SA' };
export type Call = { type: 'pass' } | { type: 'bid'; level: number; strain: Strain } | { type: 'double' } | { type: 'redouble' };
export type BricAction = Call | { type: 'play'; card: string };

const VUL_CYCLE = ['-', 'NS', 'EW', 'B', 'NS', 'EW', 'B', '-', 'EW', 'B', '-', 'NS', 'B', '-', 'NS', 'EW'];
export const isVul = (board: number, seat: number) => { const v = VUL_CYCLE[(board - 1) % 16]; return v === 'B' || (v === 'NS' && seat % 2 === 0) || (v === 'EW' && seat % 2 === 1); };
const bidRank = (level: number, strain: Strain) => (level - 1) * 5 + STRAINS.indexOf(strain);

export interface BricState {
  game: 'bric';
  hands: string[][];
  board: number;
  totalBoards: number;
  dealer: number;
  phase: 'auction' | 'play' | 'over';
  calls: { seat: number; call: Call }[];
  contract: { level: number; strain: Strain; declarer: number; doubled: 0 | 1 | 2 } | null;
  turn: number;
  trick: { seat: number; card: string }[];
  tricks: number[]; // [NS, EW]
  dummyShown: boolean;
  played: string[];
  scores: number[]; // [NS, EW]
  lastBoard: { board: number; contract: BricState['contract']; tricks: number; delta: number[]; note: string } | null;
}
export interface BricView extends Omit<BricState, 'hands'> { me: number | null; hand: string[]; dummy: string[] | null; dummySeat: number | null; handCounts: number[]; legal: BricAction[]; vul: boolean[]; controlling: number | null }

function deal(s: BricState, rng: Rng) {
  const deck = shuffle(makeDeck(), rng);
  s.hands = [0, 1, 2, 3].map((p) => deck.slice(p * 13, p * 13 + 13));
  s.dealer = (s.board - 1) % 4;
  s.phase = 'auction';
  s.calls = [];
  s.contract = null;
  s.turn = s.dealer;
  s.trick = [];
  s.tricks = [0, 0];
  s.dummyShown = false;
  s.played = [];
}

function lastBid(s: BricState) { for (let i = s.calls.length - 1; i >= 0; i--) if (s.calls[i].call.type === 'bid') return s.calls[i]; return null; }
function lastNonPass(s: BricState) { for (let i = s.calls.length - 1; i >= 0; i--) if (s.calls[i].call.type !== 'pass') return s.calls[i]; return null; }
const sameSide = (a: number, b: number) => a % 2 === b % 2;

export function legalCalls(s: BricState, seat: number): Call[] {
  const out: Call[] = [{ type: 'pass' }];
  const lb = lastBid(s);
  const from = lb ? bidRank((lb.call as any).level, (lb.call as any).strain) + 1 : 0;
  for (let r = from; r < 35; r++) out.push({ type: 'bid', level: Math.floor(r / 5) + 1, strain: STRAINS[r % 5] });
  const ln = lastNonPass(s);
  if (ln && ln.call.type === 'bid' && !sameSide(ln.seat, seat)) out.push({ type: 'double' });
  if (ln && ln.call.type === 'double' && !sameSide(ln.seat, seat)) out.push({ type: 'redouble' });
  return out;
}

export function scoreContract(c: NonNullable<BricState['contract']>, tricksTaken: number, vul: boolean): number {
  const need = c.level + 6;
  const per = c.strain === 'C' || c.strain === 'D' ? 20 : 30;
  if (tricksTaken >= need) {
    let base = c.strain === 'NT' ? 40 + 30 * (c.level - 1) : per * c.level;
    base *= c.doubled === 0 ? 1 : c.doubled === 1 ? 2 : 4;
    let score = base + (base >= 100 ? (vul ? 500 : 300) : 50);
    if (c.level === 6) score += vul ? 750 : 500;
    if (c.level === 7) score += vul ? 1500 : 1000;
    if (c.doubled) score += c.doubled === 1 ? 50 : 100;
    const over = tricksTaken - need;
    score += over * (c.doubled === 0 ? (c.strain === 'NT' ? 30 : per) : (vul ? 200 : 100) * c.doubled);
    return score;
  }
  const down = need - tricksTaken;
  if (c.doubled === 0) return -down * (vul ? 100 : 50);
  let pen = 0;
  for (let k = 1; k <= down; k++) pen += vul ? (k === 1 ? 200 : 300) : k === 1 ? 100 : k <= 3 ? 200 : 300;
  return -pen * c.doubled;
}

function endBoard(s: BricState, rng: Rng, note: string, delta: number[]) {
  s.scores = s.scores.map((v, i) => v + delta[i]);
  s.lastBoard = { board: s.board, contract: s.contract, tricks: s.contract ? s.tricks[s.contract.declarer % 2] : 0, delta, note };
  if (s.board >= s.totalBoards) { s.phase = 'over'; return; }
  s.board++;
  deal(s, rng);
}

/** Şu an oynanacak el (yerin sırasıysa deklaran oynar). */
const controller = (s: BricState) => (s.contract && s.phase === 'play' && s.turn === (s.contract.declarer + 2) % 4 ? s.contract.declarer : s.turn);

export const Bric: GameModule<BricState, BricAction, BricView> = {
  id: 'bric',
  name: 'Briç',
  playerCounts: [4],
  options: [{ key: 'boards', label: 'Board sayısı', default: 4, choices: [1, 4, 8, 16].map((v) => ({ value: v, label: `${v} board` })) }],
  setup(cfg, rng) {
    if (cfg.players !== 4) throw new IllegalMoveError('Briç 4 kişiyle oynanır');
    const s = { game: 'bric', board: 1, totalBoards: Number(cfg.options?.boards ?? 4), scores: [0, 0], lastBoard: null } as unknown as BricState;
    deal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [controller(s)]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== controller(s)) return [];
    if (s.phase === 'auction') return legalCalls(s, seat);
    const hand = s.hands[s.turn];
    const led = s.trick.length ? suitOf(s.trick[0].card) : null;
    const follow = led ? hand.filter((c) => suitOf(c) === led) : [];
    return (follow.length ? follow : hand).map((card) => ({ type: 'play' as const, card }));
  },
  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== controller(s0)) throw new IllegalMoveError('Sıra sizde değil');
    const s: BricState = { ...s0, hands: s0.hands.map((h) => h.slice()), calls: s0.calls.slice(), trick: s0.trick.slice(), tricks: s0.tricks.slice(), played: s0.played.slice(), scores: s0.scores.slice(), contract: s0.contract ? { ...s0.contract } : null };
    if (s.phase === 'auction') {
      if (!a || a.type === 'play' || !legalCalls(s, seat).some((c) => JSON.stringify(c) === JSON.stringify(a))) throw new IllegalMoveError('Bu çağrı yapılamaz');
      s.calls.push({ seat, call: a });
      const passes = (() => { let k = 0; for (let i = s.calls.length - 1; i >= 0 && s.calls[i].call.type === 'pass'; i--) k++; return k; })();
      const lb = lastBid(s);
      if (!lb && passes === 4) { endBoard(s, rng, 'Herkes pas dedi, board oynanmadı', [0, 0]); return s; }
      if (lb && passes === 3) {
        const { level, strain } = lb.call as { level: number; strain: Strain };
        const side = lb.seat % 2;
        const declarer = s.calls.find((c) => c.seat % 2 === side && c.call.type === 'bid' && c.call.strain === strain)!.seat;
        const ln = lastNonPass(s)!;
        s.contract = { level, strain, declarer, doubled: ln.call.type === 'double' ? 1 : ln.call.type === 'redouble' ? 2 : 0 };
        s.phase = 'play';
        s.turn = (declarer + 1) % 4;
        return s;
      }
      s.turn = (seat + 1) % 4;
      return s;
    }
    if (a?.type !== 'play') throw new IllegalMoveError('Kart oynayın');
    const hand = s.hands[s.turn];
    if (!hand.includes(a.card)) throw new IllegalMoveError(s.turn !== seat ? 'Bu kart yerde yok' : 'Bu kart elinizde yok');
    const led = s.trick.length ? suitOf(s.trick[0].card) : null;
    if (led && suitOf(a.card) !== led && hand.some((c) => suitOf(c) === led)) throw new IllegalMoveError('Açılan renge uymak zorundasınız');
    hand.splice(hand.indexOf(a.card), 1);
    s.trick.push({ seat: s.turn, card: a.card });
    s.played.push(a.card);
    s.dummyShown = true;
    if (s.trick.length < 4) { s.turn = (s.turn + 1) % 4; return s; }
    const trump = s.contract!.strain === 'NT' ? null : (s.contract!.strain as Suit);
    const w = trickWinner(s.trick, trump);
    s.tricks[w % 2]++;
    s.trick = [];
    s.turn = w;
    if (s.tricks[0] + s.tricks[1] === 13) {
      const c = s.contract!;
      const side = c.declarer % 2;
      const sc = scoreContract(c, s.tricks[side], isVul(s.board, c.declarer));
      const delta = side === 0 ? [Math.max(sc, 0), Math.max(-sc, 0)] : [Math.max(-sc, 0), Math.max(sc, 0)];
      const need = c.level + 6;
      endBoard(s, rng, s.tricks[side] >= need ? `Kontrat yapıldı (+${s.tricks[side] - need})` : `${need - s.tricks[side]} batık`, delta);
    }
    return s;
  },
  view(s, seat) {
    const { hands, ...rest } = s;
    const dummySeat = s.contract ? (s.contract.declarer + 2) % 4 : null;
    return {
      ...rest, calls: s.calls.slice(), trick: s.trick.slice(), tricks: s.tricks.slice(), played: s.played.slice(), scores: s.scores.slice(),
      me: seat, hand: seat === null ? [] : hands[seat].slice(), dummySeat, dummy: dummySeat !== null && s.dummyShown ? hands[dummySeat].slice() : null,
      handCounts: hands.map((h) => h.length), legal: seat === null ? [] : Bric.legalActions(s, seat), vul: [0, 1, 2, 3].map((p) => isVul(s.board, p)), controlling: s.phase === 'over' ? null : controller(s),
    };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const w = s.scores[0] === s.scores[1] ? [0, 1, 2, 3] : s.scores[0] > s.scores[1] ? [0, 2] : [1, 3];
    return { winners: w, scores: [s.scores[0], s.scores[1], s.scores[0], s.scores[1]], summary: s.scores[0] === s.scores[1] ? 'Berabere' : `${s.scores[0] > s.scores[1] ? 'Kuzey-Güney' : 'Doğu-Batı'} kazandı` };
  },
  ai(v, seat, d, rng) { return bricAi(v, seat, d, rng); },
};

// ---------- Yapay zekâ (doğal ihale + basit kart oyunu) ----------
const HCP = (hand: string[]) => hand.reduce((t, c) => t + Math.max(0, rankOf(c) - 10), 0);
const lenOf = (hand: string[], s: string) => hand.filter((c) => suitOf(c) === s).length;
const balanced = (hand: string[]) => { const l = ['S', 'H', 'D', 'C'].map((s) => lenOf(hand, s)).sort((a, b) => a - b); return l[0] >= 2 && l[1] >= 2 && l[3] <= 5; };

export function bricAi(v: BricView, seat: number, d: Difficulty, rng: Rng): BricAction {
  if (v.phase === 'auction') return bidAi(v, seat, d);
  const actSeat = v.turn;
  const hand = actSeat === seat ? v.hand : v.dummy ?? [];
  const cards = (v.legal as { type: 'play'; card: string }[]).map((x) => x.card).filter((c) => hand.includes(c));
  if (!cards.length) return v.legal[0];
  if (d === 'kolay') return { type: 'play', card: cards[rng.int(cards.length)] };
  const trump = v.contract!.strain === 'NT' ? null : (v.contract!.strain as Suit);
  const low = (cs: string[]) => cs.slice().sort((a, b) => rankOf(a) - rankOf(b))[0];
  const high = (cs: string[]) => cs.slice().sort((a, b) => rankOf(b) - rankOf(a))[0];
  if (!v.trick.length) {
    // Sıralı onörün tepesi varsa onu, yoksa en uzun koz dışı rengin en küçüğünü aç
    for (const c of cards.slice().sort((a, b) => rankOf(b) - rankOf(a))) if (rankOf(c) === 14 || (rankOf(c) === 13 && cards.includes(suitOf(c) + 14))) return { type: 'play', card: c };
    const suits = ['S', 'H', 'D', 'C'].filter((s) => s !== trump && cards.some((c) => suitOf(c) === s)).sort((a, b) => lenOf(cards, b) - lenOf(cards, a));
    return { type: 'play', card: low(suits.length ? cards.filter((c) => suitOf(c) === suits[0]) : cards) };
  }
  const partnerWinning = trickWinner(v.trick, trump) === (actSeat + 2) % 4;
  const wins = cards.filter((c) => trickWinner([...v.trick, { seat: actSeat, card: c }], trump) === actSeat);
  if (partnerWinning && v.trick.length >= 2) return { type: 'play', card: low(cards) };
  if (wins.length) return { type: 'play', card: v.trick.length === 3 ? low(wins) : high(wins) === low(wins) ? low(wins) : low(wins) };
  return { type: 'play', card: low(cards) };
}

function bidAi(v: BricView, seat: number, d: Difficulty): Call {
  const legal = v.legal as Call[];
  const can = (level: number, strain: Strain): Call | null => legal.find((c) => c.type === 'bid' && c.level === level && c.strain === strain) ?? null;
  const hcp = HCP(v.hand);
  const partner = (seat + 2) % 4;
  const myBids = v.calls.filter((c) => c.seat === seat && c.call.type === 'bid');
  const pBids = v.calls.filter((c) => c.seat === partner && c.call.type === 'bid').map((c) => c.call as { level: number; strain: Strain });
  const oppBid = v.calls.some((c) => c.seat % 2 !== seat % 2 && c.call.type === 'bid');
  const longest = (['S', 'H', 'D', 'C'] as Suit[]).sort((a, b) => lenOf(v.hand, b) - lenOf(v.hand, a) || 'SHDC'.indexOf(a) - 'SHDC'.indexOf(b))[0];
  const cheapest = (strain: Strain, maxLevel = 7): Call | null => { for (let l = 1; l <= maxLevel; l++) { const c = can(l, strain); if (c) return c; } return null; };
  // Açış
  if (!pBids.length && !myBids.length) {
    if (d === 'kolay') return hcp >= 13 ? cheapest(longest, 2) ?? { type: 'pass' } : { type: 'pass' };
    if (!oppBid && hcp >= 15 && hcp <= 17 && balanced(v.hand)) return can(1, 'NT') ?? { type: 'pass' };
    if (hcp >= 12 + (oppBid ? 1 : 0) && lenOf(v.hand, longest) >= (oppBid ? 5 : 4)) return cheapest(longest, oppBid ? 2 : 1) ?? { type: 'pass' };
    return { type: 'pass' };
  }
  // Ortağın ihalesine cevap / devam
  if (pBids.length) {
    const p = pBids[pBids.length - 1];
    const shown = p.strain === 'NT' && p.level === 1 ? 16 : myBids.length ? 13 : p.level === 1 ? 13 : 10;
    const total = hcp + shown;
    const fit = p.strain !== 'NT' && lenOf(v.hand, p.strain) + (p.level === 1 ? 4 : 5) >= 8;
    const already = myBids.length >= 2 || v.calls.filter((c) => c.call.type === 'bid').some((c) => (c.call as any).level >= 4);
    if (already) return { type: 'pass' };
    if (fit && (p.strain === 'H' || p.strain === 'S')) {
      if (total >= 33) return can(6, p.strain) ?? { type: 'pass' };
      if (total >= 25) return can(4, p.strain) ?? { type: 'pass' };
      if (total >= 19 && !myBids.length) return cheapest(p.strain, 3) ?? { type: 'pass' };
      return { type: 'pass' };
    }
    if (total >= 33 && balanced(v.hand)) return can(6, 'NT') ?? { type: 'pass' };
    if (total >= 25) return can(3, 'NT') ?? (fit ? can(5, p.strain) ?? { type: 'pass' } : { type: 'pass' });
    if (!myBids.length && hcp >= 6) {
      if (lenOf(v.hand, longest) >= 4 && longest !== p.strain) { const c = cheapest(longest, 2); if (c) return c; }
      if (fit) { const c = cheapest(p.strain, 3); if (c) return c; }
      return can(1, 'NT') ?? { type: 'pass' };
    }
    return { type: 'pass' };
  }
  return { type: 'pass' };
}
