import { makeDeck, rankOf } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type GameModule, type Rng } from '../types';

/**
 * PAPAZ KAÇTI KURALLARI — bu motorda uygulananlar
 * - 2–6 oyuncu. Desteden Sinek Papaz çıkarılır; geriye eşi olmayan tek bir papaz kalır (51 kart).
 * - Kartların hepsi dağıtılır. Herkes elindeki aynı değerdeki çiftleri yere atar (otomatik).
 * - Sırası gelen oyuncu, solundaki (oyunda kalan) oyuncunun kapalı elinden bir kart çeker.
 *   Çift oluşursa atılır. Kartı biten oyuncu oyundan çıkar (kurtulur).
 * - Sıra, kartı çekilen oyuncuya geçer.
 * - Elinde son kalan papazla kalan oyuncu kaybeder; diğer herkes kazanır.
 * - Kapalı ellerin sırası her çekişten sonra sunucuda karıştırılır (oyuncu kartın yerini bilemez).
 */

export interface PapazState {
  game: 'papaz';
  n: number;
  hands: string[][];
  turn: number;
  finished: number[];
  loser: number | null;
  discards: { seat: number; cards: string[] }[];
  lastDraw: { from: number; to: number; paired: boolean } | null;
  over: boolean;
}

export type PapazAction = { type: 'draw'; index: number };

export interface PapazView {
  game: 'papaz';
  n: number;
  me: number | null;
  hand: string[];
  handCounts: number[];
  turn: number;
  /** Sıradaki oyuncunun kart çekeceği oyuncu. */
  target: number | null;
  finished: number[];
  loser: number | null;
  discardCount: number;
  recentDiscards: PapazState['discards'];
  lastDraw: PapazState['lastDraw'];
  /** Bu oyuncunun son çektiği kart (yalnızca kendisi görür). */
  myLastDrawn: string | null;
  over: boolean;
  legal: PapazAction[];
}

/** Elden çiftleri çıkarır; atılan kartları döner. */
export function removePairs(hand: string[]): { hand: string[]; removed: string[] } {
  const byRank = new Map<number, string[]>();
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  const keep: string[] = [];
  const removed: string[] = [];
  for (const cs of byRank.values()) {
    const pairs = Math.floor(cs.length / 2) * 2;
    removed.push(...cs.slice(0, pairs));
    keep.push(...cs.slice(pairs));
  }
  return { hand: keep, removed };
}

const active = (s: PapazState) => [...Array(s.n).keys()].filter((p) => s.hands[p].length > 0);

function nextActive(s: PapazState, from: number): number {
  for (let k = 1; k <= s.n; k++) {
    const p = (from + k) % s.n;
    if (s.hands[p].length > 0) return p;
  }
  return from;
}

function settle(s: PapazState) {
  for (let p = 0; p < s.n; p++) if (s.hands[p].length === 0 && !s.finished.includes(p)) s.finished.push(p);
  const act = active(s);
  if (act.length <= 1) {
    s.over = true;
    s.loser = act.length === 1 ? act[0] : null;
  }
}

// Son çekilen kartı oyuncuya göstermek için durumda gizli tutuyoruz
interface Internal extends PapazState { _drawn?: { seat: number; card: string } | null }

export const Papaz: GameModule<PapazState, PapazAction, PapazView> = {
  id: 'papaz',
  name: 'Papaz Kaçtı',
  playerCounts: [2, 3, 4, 5, 6],
  options: [],

  setup(cfg, rng) {
    if (!this.playerCounts.includes(cfg.players)) throw new IllegalMoveError('Papaz Kaçtı 2–6 kişiyle oynanır');
    const n = cfg.players;
    const deck = shuffle(makeDeck().filter((c) => c !== 'C13'), rng);
    const hands: string[][] = Array.from({ length: n }, () => []);
    deck.forEach((c, i) => hands[i % n].push(c));
    const s: Internal = { game: 'papaz', n, hands: [], turn: rng.int(n), finished: [], loser: null, discards: [], lastDraw: null, over: false, _drawn: null };
    s.hands = hands.map((h, seat) => {
      const r = removePairs(h);
      if (r.removed.length) s.discards.push({ seat, cards: r.removed });
      return shuffle(r.hand, rng);
    });
    settle(s);
    if (!s.over && s.hands[s.turn].length === 0) s.turn = nextActive(s, s.turn);
    return s;
  },

  toAct(s) { return s.over ? [] : [s.turn]; },

  legalActions(s, seat) {
    if (s.over || seat !== s.turn) return [];
    const t = nextActive(s, seat);
    return s.hands[t].map((_, index) => ({ type: 'draw' as const, index }));
  },

  apply(s0, seat, a, rng) {
    if (s0.over) throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const from = nextActive(s0, seat);
    if (!a || a.type !== 'draw' || !Number.isInteger(a.index) || a.index < 0 || a.index >= s0.hands[from].length)
      throw new IllegalMoveError('Geçersiz kart seçimi');
    const s: Internal = { ...s0, hands: s0.hands.map((h) => h.slice()), finished: s0.finished.slice(), discards: s0.discards.slice() };
    const [card] = s.hands[from].splice(a.index, 1);
    const mine = [...s.hands[seat], card];
    const r = removePairs(mine);
    s.hands[seat] = shuffle(r.hand, rng);
    s.hands[from] = shuffle(s.hands[from], rng);
    if (r.removed.length) s.discards.push({ seat, cards: r.removed });
    s.lastDraw = { from, to: seat, paired: r.removed.length > 0 };
    s._drawn = { seat, card };
    settle(s);
    if (!s.over) s.turn = s.hands[from].length > 0 ? from : nextActive(s, seat);
    return s;
  },

  view(s, seat) {
    const internal = s as Internal;
    const target = s.over ? null : nextActive(s, s.turn);
    return {
      game: 'papaz', n: s.n, me: seat,
      hand: seat === null ? [] : s.hands[seat].slice(),
      handCounts: s.hands.map((h) => h.length),
      turn: s.turn, target, finished: s.finished.slice(), loser: s.loser,
      discardCount: s.discards.reduce((t, d) => t + d.cards.length, 0),
      recentDiscards: s.discards.slice(-6),
      lastDraw: s.lastDraw,
      myLastDrawn: seat !== null && internal._drawn?.seat === seat ? internal._drawn.card : null,
      over: s.over,
      legal: seat === null ? [] : Papaz.legalActions(s, seat),
    };
  },

  isOver(s) { return s.over; },

  result(s) {
    if (!s.over) return null;
    const winners = [...Array(s.n).keys()].filter((p) => p !== s.loser);
    const scores = [...Array(s.n).keys()].map((p) => (p === s.loser ? 0 : 1));
    return { winners, scores, loser: s.loser ?? undefined, summary: s.loser === null ? 'Herkes kurtuldu' : `Papaz Oyuncu ${s.loser + 1}'de kaldı` };
  },

  /** Kapalı elden çekiş tamamen şansa dayanır; zorluk seviyesi burada fark yaratmaz. */
  ai(v, _seat, _d, rng: Rng) {
    return { type: 'draw', index: rng.int(Math.max(1, v.legal.length)) };
  },
};
