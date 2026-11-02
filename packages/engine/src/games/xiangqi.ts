import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * XIANGQI (ÇİN SATRANCI) — uygulanan kurallar
 * Tahta 9 dikey × 10 yatay çizgi; kesişim = f + r*9 (r=0 Kırmızının arka sırası). Koltuk 0 = Kırmızı (önce oynar), 1 = Siyah.
 * Taşlar: K general, A danışman, E fil, H at, R araba, C top, S asker.
 * - General ve danışman sarayın (3 sütun × 3 sıra) dışına çıkamaz. General düz, danışman çapraz bir adım gider.
 * - Fil iki çapraz adım gider, nehri geçemez; aradaki "göz" doluysa gidemez.
 * - At bir düz + bir çapraz gider; düz adımdaki kesişim doluysa (ayak bağı) gidemez.
 * - Araba kale gibi gider. Top araba gibi gider, ama yalnızca arada TAM BİR taş (perde) varken alır.
 * - Asker ileri bir adım gider; nehri geçince yana da gidebilir; asla geri gidemez.
 * - İki general aynı sütunda aralarında taş olmadan karşı karşıya gelemez.
 * - Kendi generalini tehdit altında bırakan hamle yapılamaz.
 * - Hamlesi kalmayan taraf kaybeder (mat da pat da kayıptır).
 * - Üç kez tekrar ve 120 hamle boyunca taş alınmaması beraberliktir; teslim olunabilir.
 */

export type XqPiece = string; // "rK", "bC"
export interface XqMove { type: 'move'; from: number; to: number }
export type XqAction = XqMove | { type: 'resign' };

export interface XqState {
  game: 'xiangqi';
  board: (XqPiece | null)[];
  turn: 'r' | 'b';
  quiet: number;
  reps: Record<string, number>;
  history: { from: number; to: number; piece: XqPiece; capture: XqPiece | null }[];
  over: boolean;
  winner: 'r' | 'b' | null;
  reason: string | null;
}
export interface XqView extends XqState { me: number | null; inCheck: boolean; legal: XqMove[] }

const F = (i: number) => i % 9;
const R = (i: number) => Math.floor(i / 9);
const at = (f: number, r: number) => (f >= 0 && f < 9 && r >= 0 && r < 10 ? r * 9 + f : -1);
const other = (c: 'r' | 'b') => (c === 'r' ? 'b' : 'r');
const inPalace = (c: 'r' | 'b', f: number, r: number) => f >= 3 && f <= 5 && (c === 'r' ? r <= 2 : r >= 7);
const ownSide = (c: 'r' | 'b', r: number) => (c === 'r' ? r <= 4 : r >= 5);

export function xqInitial(): (XqPiece | null)[] {
  const b: (XqPiece | null)[] = new Array(90).fill(null);
  const back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
  back.forEach((k, f) => { b[at(f, 0)] = 'r' + k; b[at(f, 9)] = 'b' + k; });
  for (const f of [1, 7]) { b[at(f, 2)] = 'rC'; b[at(f, 7)] = 'bC'; }
  for (const f of [0, 2, 4, 6, 8]) { b[at(f, 3)] = 'rS'; b[at(f, 6)] = 'bS'; }
  return b;
}

function pseudo(b: (XqPiece | null)[], c: 'r' | 'b'): XqMove[] {
  const out: XqMove[] = [];
  const add = (from: number, to: number) => { if (to >= 0 && (!b[to] || b[to]![0] !== c)) out.push({ type: 'move', from, to }); };
  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (!p || p[0] !== c) continue;
    const f = F(i), r = R(i), k = p[1];
    if (k === 'K') {
      for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inPalace(c, f + df, r + dr)) add(i, at(f + df, r + dr));
    } else if (k === 'A') {
      for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (inPalace(c, f + df, r + dr)) add(i, at(f + df, r + dr));
    } else if (k === 'E') {
      for (const [df, dr] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const t = at(f + df, r + dr), eye = at(f + df / 2, r + dr / 2);
        if (t >= 0 && ownSide(c, r + dr) && !b[eye]) add(i, t);
      }
    } else if (k === 'H') {
      for (const [lf, lr, moves] of [[0, 1, [[1, 2], [-1, 2]]], [0, -1, [[1, -2], [-1, -2]]], [1, 0, [[2, 1], [2, -1]]], [-1, 0, [[-2, 1], [-2, -1]]]] as [number, number, number[][]][]) {
        const leg = at(f + lf, r + lr);
        if (leg < 0 || b[leg]) continue;
        for (const [df, dr] of moves) add(i, at(f + df, r + dr));
      }
    } else if (k === 'R' || k === 'C') {
      for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let ff = f + df, rr = r + dr, screen = false;
        while (ff >= 0 && ff < 9 && rr >= 0 && rr < 10) {
          const t = rr * 9 + ff;
          if (k === 'R') {
            if (b[t]) { if (b[t]![0] !== c) out.push({ type: 'move', from: i, to: t }); break; }
            out.push({ type: 'move', from: i, to: t });
          } else if (!screen) {
            if (b[t]) screen = true; else out.push({ type: 'move', from: i, to: t });
          } else if (b[t]) {
            if (b[t]![0] !== c) out.push({ type: 'move', from: i, to: t });
            break;
          }
          ff += df; rr += dr;
        }
      }
    } else if (k === 'S') {
      const dir = c === 'r' ? 1 : -1;
      add(i, at(f, r + dir));
      if (!ownSide(c, r)) { add(i, at(f + 1, r)); add(i, at(f - 1, r)); }
    }
  }
  return out;
}

function generalsFace(b: (XqPiece | null)[]) {
  const rk = b.indexOf('rK'), bk = b.indexOf('bK');
  if (rk < 0 || bk < 0 || F(rk) !== F(bk)) return false;
  for (let r = R(rk) + 1; r < R(bk); r++) if (b[at(F(rk), r)]) return false;
  return true;
}

export function xqInCheck(b: (XqPiece | null)[], c: 'r' | 'b') {
  const k = b.indexOf(c + 'K');
  return generalsFace(b) || pseudo(b, other(c)).some((m) => m.to === k);
}

function moveBoard(b: (XqPiece | null)[], m: XqMove) {
  const n = b.slice();
  n[m.to] = n[m.from];
  n[m.from] = null;
  return n;
}

export function xqLegal(b: (XqPiece | null)[], c: 'r' | 'b'): XqMove[] {
  return pseudo(b, c).filter((m) => !xqInCheck(moveBoard(b, m), c));
}

const key = (s: Pick<XqState, 'board' | 'turn'>) => s.board.map((p) => p ?? '.').join('') + s.turn;

function settle(s: XqState): XqState {
  if (xqLegal(s.board, s.turn).length === 0) return { ...s, over: true, winner: other(s.turn), reason: xqInCheck(s.board, s.turn) ? 'Mat' : 'Hamlesi kalmadı (pat kayıptır)' };
  if ((s.reps[key(s)] ?? 0) >= 3) return { ...s, over: true, winner: null, reason: 'Üç kez tekrar' };
  if (s.quiet >= 120) return { ...s, over: true, winner: null, reason: '120 hamle taş alınmadı' };
  return s;
}

export function xqFrom(board: (XqPiece | null)[], turn: 'r' | 'b'): XqState {
  const s: XqState = { game: 'xiangqi', board, turn, quiet: 0, reps: {}, history: [], over: false, winner: null, reason: null };
  s.reps[key(s)] = 1;
  return settle(s);
}

const seatColor = (seat: number) => (seat === 0 ? 'r' : 'b');

export const Xiangqi: GameModule<XqState, XqAction, XqView> & { resign(s: XqState, seat: number, reason: string): XqState } = {
  id: 'xiangqi',
  name: 'Çin Satrancı (Xiangqi)',
  playerCounts: [2],
  options: [],
  setup(cfg) {
    if (cfg.players !== 2) throw new IllegalMoveError('Xiangqi 2 kişiyle oynanır');
    return xqFrom(xqInitial(), 'r');
  },
  toAct(s) { return s.over ? [] : [s.turn === 'r' ? 0 : 1]; },
  legalActions(s, seat) { return s.over || seatColor(seat) !== s.turn ? [] : xqLegal(s.board, s.turn); },
  apply(s, seat, a) {
    if (s.over) throw new IllegalMoveError('Oyun bitti');
    if (a?.type === 'resign') return Xiangqi.resign(s, seat, 'Teslim oldu');
    if (seatColor(seat) !== s.turn) throw new IllegalMoveError('Sıra sizde değil');
    const m = xqLegal(s.board, s.turn).find((x) => x.from === a?.from && x.to === a?.to);
    if (!m) {
      const p = s.board[(a as XqMove)?.from];
      if (!p || p[0] !== s.turn) throw new IllegalMoveError('Önce kendi taşınızı seçin');
      const pseudoOk = pseudo(s.board, s.turn).some((x) => x.from === (a as XqMove).from && x.to === (a as XqMove).to);
      if (pseudoOk) throw new IllegalMoveError(generalsFace(moveBoard(s.board, a as XqMove)) ? 'Generaller yüz yüze gelemez' : 'Generaliniz tehdit altında kalır');
      throw new IllegalMoveError('Bu taş oraya gidemez');
    }
    const capture = s.board[m.to];
    const board = moveBoard(s.board, m);
    const t: XqState = { ...s, board, turn: other(s.turn), quiet: capture ? 0 : s.quiet + 1, history: [...s.history, { from: m.from, to: m.to, piece: s.board[m.from]!, capture }] };
    const k = key(t);
    t.reps = { ...s.reps, [k]: (s.reps[k] ?? 0) + 1 };
    return settle(t);
  },
  resign(s, seat, reason) {
    if (s.over) return s;
    return { ...s, over: true, winner: other(seatColor(seat)), reason: `${seat === 0 ? 'Kırmızı' : 'Siyah'}: ${reason}` };
  },
  view(s, seat) { return { ...s, me: seat, inCheck: !s.over && xqInCheck(s.board, s.turn), legal: seat === null ? [] : (Xiangqi.legalActions(s, seat) as XqMove[]) }; },
  isOver(s) { return s.over; },
  result(s) {
    if (!s.over) return null;
    const winners = s.winner === null ? [0, 1] : [s.winner === 'r' ? 0 : 1];
    return { winners, scores: winners.length === 2 ? [0.5, 0.5] : [s.winner === 'r' ? 1 : 0, s.winner === 'b' ? 1 : 0], summary: s.reason ?? '' };
  },
  ai(v, _seat, d, rng) { return xqAi(v, d, rng); },
};

// ---------- Yapay zekâ ----------
const VAL: Record<string, number> = { K: 0, A: 200, E: 200, H: 400, R: 900, C: 450, S: 100 };
function evalXq(b: (XqPiece | null)[], c: 'r' | 'b') {
  let v = 0;
  b.forEach((p, i) => {
    if (!p) return;
    let val = VAL[p[1]];
    if (p[1] === 'S' && !ownSide(p[0] as 'r' | 'b', R(i))) val += 100 + (F(i) >= 3 && F(i) <= 5 ? 30 : 0);
    if (p[1] === 'H' || p[1] === 'R') val += 10 - Math.abs(F(i) - 4) * 2;
    v += p[0] === c ? val : -val;
  });
  return v;
}
function xqSearch(b: (XqPiece | null)[], c: 'r' | 'b', depth: number, alpha: number, beta: number): number {
  const moves = xqLegal(b, c);
  if (!moves.length) return -100000 - depth;
  if (depth === 0) return evalXq(b, c);
  moves.sort((x, y) => (b[y.to] ? VAL[b[y.to]![1]] : 0) - (b[x.to] ? VAL[b[x.to]![1]] : 0));
  for (const m of moves) {
    const v = -xqSearch(moveBoard(b, m), other(c), depth - 1, -beta, -alpha);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
export function xqAi(v: XqView, d: Difficulty, rng: Rng): XqMove {
  const moves = v.legal;
  if (d === 'kolay') {
    const caps = moves.filter((m) => v.board[m.to]);
    return caps.length && rng.int(2) === 0 ? caps[rng.int(caps.length)] : moves[rng.int(moves.length)];
  }
  const depth = d === 'orta' ? 1 : 2;
  let best = moves[0], bv = -Infinity;
  for (const m of moves) {
    const nb = moveBoard(v.board, m);
    const raw = -xqSearch(nb, other(v.turn), depth, -Infinity, -bv);
    const rep = (v.reps[nb.map((p) => p ?? '.').join('') + other(v.turn)] ?? 0) * 40;
    const val = Math.abs(raw) > 50000 ? raw : raw - rep + rng.int(d === 'orta' ? 20 : 5);
    if (val > bv) { bv = val; best = m; }
  }
  return best;
}
