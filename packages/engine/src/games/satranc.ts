import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * SATRANÇ — FIDE kuralları
 * Kare numarası: 0 = a1, 7 = h1, 56 = a8, 63 = h8. Koltuk 0 = Beyaz, koltuk 1 = Siyah.
 * Taş kodu: renk (w/b) + tür (K V(Q) R B N P) → "wK", "bQ" ...
 * Uygulananlar: rok (şah/kale oynamamış, aradaki kareler boş, şah tehdit altından geçmez),
 * geçerken alma, terfi (V, K, F, A seçimli), şah, mat, pat, 50 hamle kuralı,
 * üç kez tekrar, yetersiz materyal, teslim olma, süre bitimi (sunucu saati).
 */

export type Piece = string; // "wK"
export interface ChessMove { type: 'move'; from: number; to: number; promo?: 'Q' | 'R' | 'B' | 'N' }
export type ChessAction = ChessMove | { type: 'resign' };

export interface ChessState {
  game: 'satranc';
  board: (Piece | null)[];
  turn: 'w' | 'b';
  castle: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  ep: number | null;
  halfmove: number;
  fullmove: number;
  reps: Record<string, number>;
  history: { san: string; from: number; to: number }[];
  over: boolean;
  winner: 'w' | 'b' | null;
  reason: string | null;
}

export interface ChessView extends ChessState {
  me: number | null;
  inCheck: boolean;
  legal: ChessMove[];
}

const F = (sq: number) => sq & 7;
const R = (sq: number) => sq >> 3;
const color = (p: Piece) => p[0] as 'w' | 'b';
const kind = (p: Piece) => p[1];
const other = (c: 'w' | 'b') => (c === 'w' ? 'b' : 'w');
const FILES = 'abcdefgh';
export const sqName = (sq: number) => FILES[F(sq)] + (R(sq) + 1);
export const parseSq = (s: string) => FILES.indexOf(s[0]) + (Number(s[1]) - 1) * 8;

export function initialBoard(): (Piece | null)[] {
  const b: (Piece | null)[] = new Array(64).fill(null);
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    b[f] = 'w' + back[f];
    b[8 + f] = 'wP';
    b[48 + f] = 'bP';
    b[56 + f] = 'b' + back[f];
  }
  return b;
}

const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function at(f: number, r: number) { return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1; }

/** sq karesi c rengi tarafından saldırı altında mı? */
export function attacked(b: (Piece | null)[], sq: number, c: 'w' | 'b'): boolean {
  const f = F(sq), r = R(sq);
  const pr = c === 'w' ? r - 1 : r + 1;
  for (const df of [-1, 1]) { const s = at(f + df, pr); if (s >= 0 && b[s] === c + 'P') return true; }
  for (const [df, dr] of KN) { const s = at(f + df, r + dr); if (s >= 0 && b[s] === c + 'N') return true; }
  for (const [df, dr] of KG) { const s = at(f + df, r + dr); if (s >= 0 && b[s] === c + 'K') return true; }
  for (const [dirs, kinds] of [[ROOK, 'RQ'], [BISH, 'BQ']] as const) {
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr;
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
        const p = b[rr * 8 + ff];
        if (p) { if (color(p) === c && kinds.includes(kind(p))) return true; break; }
        ff += df; rr += dr;
      }
    }
  }
  return false;
}

const kingSq = (b: (Piece | null)[], c: 'w' | 'b') => b.indexOf(c + 'K');
export const inCheck = (s: Pick<ChessState, 'board' | 'turn'>) => attacked(s.board, kingSq(s.board, s.turn), other(s.turn));

function pseudo(s: ChessState): ChessMove[] {
  const out: ChessMove[] = [];
  const b = s.board, c = s.turn;
  const push = (from: number, to: number) => {
    if (kind(b[from]!) === 'P' && (R(to) === 7 || R(to) === 0)) for (const p of ['Q', 'R', 'B', 'N'] as const) out.push({ type: 'move', from, to, promo: p });
    else out.push({ type: 'move', from, to });
  };
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p || color(p) !== c) continue;
    const f = F(sq), r = R(sq), k = kind(p);
    if (k === 'P') {
      const dir = c === 'w' ? 1 : -1, start = c === 'w' ? 1 : 6;
      const one = at(f, r + dir);
      if (one >= 0 && !b[one]) {
        push(sq, one);
        const two = at(f, r + 2 * dir);
        if (r === start && !b[two]) push(sq, two);
      }
      for (const df of [-1, 1]) {
        const t = at(f + df, r + dir);
        if (t < 0) continue;
        if ((b[t] && color(b[t]!) !== c) || t === s.ep) push(sq, t);
      }
    } else if (k === 'N' || k === 'K') {
      for (const [df, dr] of k === 'N' ? KN : KG) {
        const t = at(f + df, r + dr);
        if (t >= 0 && (!b[t] || color(b[t]!) !== c)) push(sq, t);
      }
      if (k === 'K') {
        const home = c === 'w' ? 4 : 60;
        if (sq === home && !attacked(b, sq, other(c))) {
          if (s.castle[(c + 'K') as 'wK'] && b[home + 3] === c + 'R' && !b[home + 1] && !b[home + 2] &&
            !attacked(b, home + 1, other(c)) && !attacked(b, home + 2, other(c))) out.push({ type: 'move', from: sq, to: home + 2 });
          if (s.castle[(c + 'Q') as 'wQ'] && b[home - 4] === c + 'R' && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
            !attacked(b, home - 1, other(c)) && !attacked(b, home - 2, other(c))) out.push({ type: 'move', from: sq, to: home - 2 });
        }
      }
    } else {
      const dirs = k === 'R' ? ROOK : k === 'B' ? BISH : [...ROOK, ...BISH];
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const t = rr * 8 + ff;
          if (b[t]) { if (color(b[t]!) !== c) push(sq, t); break; }
          push(sq, t);
          ff += df; rr += dr;
        }
      }
    }
  }
  return out;
}

/** Tahta üzerinde hamleyi uygular (kural kontrolü yapmaz). */
function makeMove(s: ChessState, m: ChessMove): ChessState {
  const b = s.board.slice();
  const p = b[m.from]!;
  const c = color(p), k = kind(p);
  const captured = b[m.to];
  b[m.to] = m.promo ? c + m.promo : p;
  b[m.from] = null;
  if (k === 'P' && m.to === s.ep) b[m.to + (c === 'w' ? -8 : 8)] = null;
  if (k === 'K' && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
    else { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
  }
  const castle = { ...s.castle };
  if (k === 'K') { castle[(c + 'K') as 'wK'] = false; castle[(c + 'Q') as 'wQ'] = false; }
  for (const [sq, key] of [[0, 'wQ'], [7, 'wK'], [56, 'bQ'], [63, 'bK']] as const) if (m.from === sq || m.to === sq) castle[key] = false;
  const ep = k === 'P' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : null;
  return {
    ...s, board: b, turn: other(c), castle, ep,
    halfmove: k === 'P' || captured || (k === 'P' && m.to === s.ep) ? 0 : s.halfmove + 1,
    fullmove: c === 'b' ? s.fullmove + 1 : s.fullmove,
  };
}

export function legalMoves(s: ChessState): ChessMove[] {
  if (s.over) return [];
  return pseudo(s).filter((m) => {
    const t = makeMove(s, m);
    return !attacked(t.board, kingSq(t.board, s.turn), t.turn);
  });
}

function posKey(s: ChessState) {
  // Geçerken alma yalnızca gerçekten mümkünse konuma dahil edilir
  const epUsable = s.ep !== null && pseudo(s).some((m) => m.to === s.ep && kind(s.board[m.from]!) === 'P');
  return s.board.map((p) => p ?? '.').join('') + s.turn + JSON.stringify(s.castle) + (epUsable ? s.ep : '-');
}

function insufficient(b: (Piece | null)[]) {
  const pcs = b.filter(Boolean) as Piece[];
  const minor = pcs.filter((p) => kind(p) !== 'K');
  if (minor.length === 0) return true;
  if (minor.length === 1 && 'BN'.includes(kind(minor[0]))) return true;
  if (minor.every((p) => kind(p) === 'B')) {
    const sqs = b.map((p, i) => (p && kind(p) === 'B' ? (F(i) + R(i)) % 2 : -1)).filter((x) => x >= 0);
    return new Set(sqs).size === 1;
  }
  return false;
}

const LETTER: Record<string, string> = { K: 'Ş', Q: 'V', R: 'K', B: 'F', N: 'A', P: '' };

/** Türkçe cebirsel gösterim (Ş=şah, V=vezir, K=kale, F=fil, A=at). */
export function san(s: ChessState, m: ChessMove): string {
  const p = s.board[m.from]!;
  const k = kind(p);
  if (k === 'K' && Math.abs(m.to - m.from) === 2) return m.to > m.from ? 'O-O' : 'O-O-O';
  const capture = !!s.board[m.to] || (k === 'P' && m.to === s.ep);
  let str = LETTER[k];
  if (k !== 'P') {
    const same = legalMoves(s).filter((x) => x.to === m.to && x.from !== m.from && s.board[x.from] === p);
    if (same.length) str += same.some((x) => F(x.from) === F(m.from)) ? sqName(m.from)[1] : FILES[F(m.from)];
  } else if (capture) str += FILES[F(m.from)];
  str += (capture ? 'x' : '') + sqName(m.to) + (m.promo ? '=' + LETTER[m.promo] : '');
  const t = makeMove(s, m);
  if (inCheck(t)) str += legalMoves(t).length ? '+' : '#';
  return str;
}

function settle(s: ChessState): ChessState {
  const moves = legalMoves(s);
  if (moves.length === 0) {
    if (inCheck(s)) return { ...s, over: true, winner: other(s.turn), reason: 'Şah mat' };
    return { ...s, over: true, winner: null, reason: 'Pat' };
  }
  if (s.halfmove >= 100) return { ...s, over: true, winner: null, reason: '50 hamle kuralı' };
  if ((s.reps[posKey(s)] ?? 0) >= 3) return { ...s, over: true, winner: null, reason: 'Üç kez tekrar' };
  if (insufficient(s.board)) return { ...s, over: true, winner: null, reason: 'Yetersiz materyal' };
  return s;
}

export function chessFrom(board: (Piece | null)[], turn: 'w' | 'b', castle = { wK: false, wQ: false, bK: false, bQ: false }, ep: number | null = null): ChessState {
  const s: ChessState = { game: 'satranc', board, turn, castle, ep, halfmove: 0, fullmove: 1, reps: {}, history: [], over: false, winner: null, reason: null };
  s.reps[posKey(s)] = 1;
  return settle(s);
}

const seatColor = (seat: number) => (seat === 0 ? 'w' : 'b');

export const Satranc: GameModule<ChessState, ChessAction, ChessView> & { resign(s: ChessState, seat: number, reason: string): ChessState } = {
  id: 'satranc',
  name: 'Satranç',
  playerCounts: [2],
  options: [],

  setup(cfg) {
    if (cfg.players !== 2) throw new IllegalMoveError('Satranç 2 kişiyle oynanır');
    return chessFrom(initialBoard(), 'w', { wK: true, wQ: true, bK: true, bQ: true });
  },
  toAct(s) { return s.over ? [] : [s.turn === 'w' ? 0 : 1]; },
  legalActions(s, seat) { return s.over || seatColor(seat) !== s.turn ? [] : legalMoves(s); },

  apply(s, seat, a) {
    if (s.over) throw new IllegalMoveError('Oyun bitti');
    if (a?.type === 'resign') return Satranc.resign(s, seat, 'Teslim oldu');
    if (seatColor(seat) !== s.turn) throw new IllegalMoveError('Sıra sizde değil');
    const m = legalMoves(s).find((x) => x.from === a?.from && x.to === a?.to && (x.promo ?? null) === ((a as ChessMove)?.promo ?? null));
    if (!m) {
      const p = s.board[(a as ChessMove)?.from];
      if (!p || color(p) !== s.turn) throw new IllegalMoveError('Önce kendi taşınızı seçin');
      if (kind(p) === 'P' && (R((a as ChessMove).to) === 7 || R((a as ChessMove).to) === 0) && !(a as ChessMove).promo) throw new IllegalMoveError('Terfi için taş seçin');
      throw new IllegalMoveError(inCheck(s) ? 'Şahınız tehdit altında: bu hamle şahı kurtarmıyor' : 'Bu hamle kurallara uygun değil');
    }
    const notation = san(s, m);
    let t = makeMove(s, m);
    const key = posKey(t);
    t = { ...t, reps: { ...s.reps, [key]: (s.reps[key] ?? 0) + 1 }, history: [...s.history, { san: notation, from: m.from, to: m.to }] };
    return settle(t);
  },

  resign(s, seat, reason) {
    if (s.over) return s;
    return { ...s, over: true, winner: other(seatColor(seat)), reason: `${seat === 0 ? 'Beyaz' : 'Siyah'}: ${reason}` };
  },

  view(s, seat) {
    return { ...s, me: seat, inCheck: !s.over && inCheck(s), legal: seat === null ? [] : Satranc.legalActions(s, seat) as ChessMove[] };
  },
  isOver(s) { return s.over; },
  result(s) {
    if (!s.over) return null;
    const winners = s.winner === null ? [0, 1] : [s.winner === 'w' ? 0 : 1];
    return { winners, scores: winners.length === 2 ? [0.5, 0.5] : [s.winner === 'w' ? 1 : 0, s.winner === 'b' ? 1 : 0], summary: s.reason ?? '' };
  },
  ai(v, _seat, d, rng) { return chessAi(v, d, rng); },
};

// ---------- Yapay zekâ: alfa-beta + taş-kare tabloları ----------
const VAL: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const PST: Record<string, number[]> = {
  P: [0,0,0,0,0,0,0,0, 5,10,10,-20,-20,10,10,5, 5,-5,-10,0,0,-10,-5,5, 0,0,0,20,20,0,0,0, 5,5,10,25,25,10,5,5, 10,10,20,30,30,20,10,10, 50,50,50,50,50,50,50,50, 0,0,0,0,0,0,0,0],
  N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,5,5,0,-20,-40, -30,5,10,15,15,10,5,-30, -30,0,15,20,20,15,0,-30, -30,5,15,20,20,15,5,-30, -30,0,10,15,15,10,0,-30, -40,-20,0,0,0,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,5,0,0,0,0,5,-10, -10,10,10,10,10,10,10,-10, -10,0,10,10,10,10,0,-10, -10,5,5,10,10,5,5,-10, -10,0,5,10,10,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  R: [0,0,0,5,5,0,0,0, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 5,10,10,10,10,10,10,5, 0,0,0,0,0,0,0,0],
  Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,5,0,0,0,0,-10, -10,5,5,5,5,5,0,-10, 0,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5, -10,0,5,5,5,5,0,-10, -10,0,0,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  K: [20,30,10,0,0,10,30,20, 20,20,0,0,0,0,20,20, -10,-20,-20,-20,-20,-20,-20,-10, -20,-30,-30,-40,-40,-30,-30,-20, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30],
};

function evaluate(s: ChessState): number {
  let v = 0;
  s.board.forEach((p, sq) => {
    if (!p) return;
    const k = kind(p);
    const idx = color(p) === 'w' ? sq : (7 - R(sq)) * 8 + F(sq);
    const val = VAL[k] + PST[k][idx];
    v += color(p) === 'w' ? val : -val;
  });
  return s.turn === 'w' ? v : -v;
}

function order(s: ChessState, ms: ChessMove[]) {
  const score = (m: ChessMove) => (s.board[m.to] ? 10 * VAL[kind(s.board[m.to]!)] - VAL[kind(s.board[m.from]!)] : 0) + (m.promo === 'Q' ? 800 : 0);
  return ms.slice().sort((a, b) => score(b) - score(a));
}

function search(s: ChessState, depth: number, alpha: number, beta: number, budget: { n: number }): number {
  const moves = legalMoves(s);
  if (moves.length === 0) return inCheck(s) ? -100000 - depth : 0;
  if (s.halfmove >= 100 || insufficient(s.board)) return 0;
  if (depth === 0 || --budget.n <= 0) return quiesce(s, alpha, beta, 4);
  for (const m of order(s, moves)) {
    const v = -search(makeMove(s, m), depth - 1, -beta, -alpha, budget);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function quiesce(s: ChessState, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(s);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth === 0) return alpha;
  for (const m of order(s, legalMoves(s).filter((m) => s.board[m.to] || m.promo))) {
    const v = -quiesce(makeMove(s, m), -beta, -alpha, depth - 1);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

export function chessAi(v: ChessView, d: Difficulty, rng: Rng): ChessMove {
  const s: ChessState = { ...v, over: false };
  const moves = v.legal;
  if (d === 'kolay') {
    const caps = moves.filter((m) => v.board[m.to]);
    if (caps.length && rng.int(3) === 0) return caps[rng.int(caps.length)];
    return moves[rng.int(moves.length)];
  }
  const depth = d === 'orta' ? 1 : 2;
  let best = moves[0], bestV = -Infinity;
  const budget = { n: d === 'orta' ? 20000 : 60000 };
  for (const m of order(s, moves)) {
    const t = makeMove(s, m);
    // Tekrar ile beraberliğe sürüklenmemek için hafif ceza
    const rep = (v.reps[posKey(t)] ?? 0) * 30;
    const raw = -search(t, depth, -Infinity, -bestV, budget);
    // Mat skorlarında rastgelelik yok: en kısa mat her zaman seçilir
    const val = Math.abs(raw) > 50000 ? raw : raw - rep + rng.int(d === 'orta' ? 25 : 6);
    if (val > bestV) { bestV = val; best = m; }
  }
  return best;
}
