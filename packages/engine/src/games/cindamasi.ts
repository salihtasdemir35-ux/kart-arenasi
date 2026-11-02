import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * ÇİN DAMASI KURALLARI — bu motorda uygulananlar
 * - 121 delikli altı köşeli yıldız tahta. Her köşe 10 delik; oyuncu başına 10 taş.
 * - 2 oyuncu: karşılıklı köşeler. 3 oyuncu: birer atlamalı köşeler (hedefler boş karşı köşeler).
 *   4 oyuncu: iki karşılıklı çift. 6 oyuncu: tüm köşeler.
 * - Hamle: komşu boş deliğe bir adım YA DA bir veya daha fazla atlama.
 * - Atlama: herhangi bir taşın (kendi ya da rakip) üzerinden, hemen arkasındaki boş deliğe.
 *   Zincirleme atlama tek hamlede yapılır; oyuncu istediği yerde durabilir.
 * - Atlanan taş tahtadan alınmaz (klasik damadan farkı budur).
 * - Taşlar başka bir oyuncunun hedef köşesine girebilir ama hamle sonunda orada kalamaz
 *   (o köşe kendi başlangıç veya hedef köşesi değilse).
 * - Tüm taşlarını karşı köşeye ilk dolduran kazanır.
 * - Hedef köşeyi tıkayan rakip taşı varsa ve hedefin geri kalanı doluysa da kazanılır
 *   (köşe doluysa ve en az bir taşın oradaysa — yaygın "tıkanma" kuralı).
 */

export type Hole = [number, number, number]; // küp koordinatı (x+y+z=0)

const DIRS: Hole[] = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];

/** Tahtadaki tüm delikler ve köşe (0..5) bilgisi; merkez altıgen = -1. */
function buildBoard() {
  const holes: Hole[] = [];
  const corner: number[] = [];
  for (let x = -8; x <= 8; x++)
    for (let y = -8; y <= 8; y++) {
      const z = -x - y;
      if (z < -8 || z > 8) continue;
      const inHex = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 4;
      // Yıldız = iki üçgenin birleşimi
      const triA = x <= 4 && y <= 4 && z <= 4;
      const triB = x >= -4 && y >= -4 && z >= -4;
      if (!(triA || triB)) continue;
      holes.push([x, y, z]);
      corner.push(inHex ? -1 : cornerOf(x, y, z));
    }
  return { holes, corner };
}

/** Köşeler saat yönünde: 0 = üst (y>4), sonra sağ üst, ... */
function cornerOf(x: number, y: number, z: number): number {
  if (z < -4) return 0;
  if (x > 4) return 1;
  if (y < -4) return 2;
  if (z > 4) return 3;
  if (x < -4) return 4;
  return 5; // y > 4
}

export const BOARD = buildBoard();
export const N_HOLES = BOARD.holes.length;
const indexOf = new Map(BOARD.holes.map((h, i) => [h.join(','), i]));
export const holeAt = (x: number, y: number, z: number) => indexOf.get(`${x},${y},${z}`) ?? -1;
export const NEIGH: number[][] = BOARD.holes.map(([x, y, z]) => DIRS.map(([a, b, c]) => holeAt(x + a, y + b, z + c)));
export const JUMP: number[][] = BOARD.holes.map(([x, y, z]) => DIRS.map(([a, b, c]) => holeAt(x + 2 * a, y + 2 * b, z + 2 * c)));
export const CORNER_HOLES: number[][] = [0, 1, 2, 3, 4, 5].map((c) => BOARD.corner.map((k, i) => (k === c ? i : -1)).filter((i) => i >= 0));
const opposite = (c: number) => (c + 3) % 6;

/** Oyuncu sayısına göre başlangıç köşeleri. */
export const START_CORNERS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] };

export interface CinState {
  game: 'cindamasi';
  n: number;
  board: number[]; // delik başına oyuncu (-1 boş)
  corners: number[]; // oyuncunun başlangıç köşesi
  turn: number;
  moveNo: number;
  last: { seat: number; path: number[] } | null;
  winner: number | null;
  over: boolean;
  maxMoves: number;
}

export type CinAction = { type: 'move'; path: number[] };
export interface CinView extends CinState { me: number | null; legal: CinAction[]; progress: number[] }

/** Bir taşın gidebileceği tüm hedefler ve oraya giden yol. */
export function reachable(board: number[], from: number): Map<number, number[]> {
  const res = new Map<number, number[]>();
  for (const nb of NEIGH[from]) if (nb >= 0 && board[nb] === -1) res.set(nb, [from, nb]);
  // Atlamalar (BFS) — başlangıç deliği boş sayılır
  const b = board.slice();
  b[from] = -1;
  const queue: number[][] = [[from]];
  const seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const cur = path[path.length - 1];
    for (let d = 0; d < 6; d++) {
      const over = NEIGH[cur][d], land = JUMP[cur][d];
      if (over < 0 || land < 0 || b[over] === -1 || b[land] !== -1 || seen.has(land)) continue;
      seen.add(land);
      const np = [...path, land];
      if (!res.has(land)) res.set(land, np);
      queue.push(np);
    }
  }
  return res;
}

function allowedEnd(s: CinState, seat: number, hole: number) {
  const c = BOARD.corner[hole];
  return c === -1 || c === s.corners[seat] || c === opposite(s.corners[seat]);
}

function legal(s: CinState, seat: number): CinAction[] {
  if (s.over || seat !== s.turn) return [];
  const out: CinAction[] = [];
  for (let i = 0; i < N_HOLES; i++) {
    if (s.board[i] !== seat) continue;
    for (const [to, path] of reachable(s.board, i)) if (allowedEnd(s, seat, to)) out.push({ type: 'move', path });
  }
  return out;
}

export function progressOf(s: CinState, seat: number) {
  const target = CORNER_HOLES[opposite(s.corners[seat])];
  return target.filter((h) => s.board[h] === seat).length * 10;
}

function won(s: CinState, seat: number) {
  const target = CORNER_HOLES[opposite(s.corners[seat])];
  const mine = target.filter((h) => s.board[h] === seat).length;
  const full = target.every((h) => s.board[h] !== -1);
  return mine === 10 || (full && mine > 0);
}

/** Hedef köşenin en uç deliğine (köşenin tepesi) olan uzaklık — YZ için. */
const CENTER = holeAt(0, 0, 0);
const tipOf = (c: number) => CORNER_HOLES[c].reduce((best, h) => (dist(h, CENTER) > dist(best, CENTER) ? h : best), CORNER_HOLES[c][0]);
export function dist(a: number, b: number) {
  const [x1, y1, z1] = BOARD.holes[a], [x2, y2, z2] = BOARD.holes[b];
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

export const CinDamasi: GameModule<CinState, CinAction, CinView> = {
  id: 'cindamasi',
  name: 'Çin Daması',
  playerCounts: [2, 3, 4, 6],
  options: [],

  setup(cfg, rng) {
    const corners = START_CORNERS[cfg.players];
    if (!corners) throw new IllegalMoveError('Çin Daması 2, 3, 4 veya 6 kişiyle oynanır');
    const board = new Array(N_HOLES).fill(-1);
    corners.forEach((c, seat) => CORNER_HOLES[c].forEach((h) => (board[h] = seat)));
    return { game: 'cindamasi', n: cfg.players, board, corners, turn: rng.int(cfg.players), moveNo: 0, last: null, winner: null, over: false, maxMoves: 600 };
  },
  toAct(s) { return s.over ? [] : [s.turn]; },
  legalActions(s, seat) { return legal(s, seat); },

  apply(s0, seat, a) {
    if (s0.over) throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const path = a?.path;
    if (!Array.isArray(path) || path.length < 2) throw new IllegalMoveError('Geçersiz hamle');
    const from = path[0], to = path[path.length - 1];
    if (s0.board[from] !== seat) throw new IllegalMoveError('Kendi taşınızı seçin');
    // Yolu adım adım doğrula (istemcinin gönderdiği yol)
    const b = s0.board.slice();
    b[from] = -1;
    if (path.length === 2 && NEIGH[from].includes(to)) {
      if (b[to] !== -1) throw new IllegalMoveError('Delik dolu');
    } else {
      const seen = new Set([from]);
      for (let k = 1; k < path.length; k++) {
        const cur = path[k - 1], nx = path[k];
        const d = JUMP[cur].indexOf(nx);
        if (d < 0 || b[NEIGH[cur][d]] === -1 || b[nx] !== -1 || seen.has(nx)) throw new IllegalMoveError('Atlama kurallara uygun değil');
        seen.add(nx);
      }
    }
    if (!allowedEnd(s0, seat, to)) throw new IllegalMoveError('Başka oyuncunun köşesinde duramazsınız');
    b[to] = seat;
    const s: CinState = { ...s0, board: b, last: { seat, path: path.slice() }, moveNo: s0.moveNo + 1 };
    if (won(s, seat)) { s.over = true; s.winner = seat; return s; }
    if (s.moveNo >= s.maxMoves * s.n) {
      // Güvenlik sınırı: en ileri giden kazanır
      s.over = true;
      const pr = [...Array(s.n).keys()].map((p) => progressOf(s, p) * 1000 - totalDist(s, p));
      s.winner = pr.indexOf(Math.max(...pr));
      return s;
    }
    s.turn = (seat + 1) % s.n;
    if (legal(s, s.turn).length === 0) s.turn = (s.turn + 1) % s.n; // nadir: tıkalı oyuncu pas geçer
    return s;
  },

  view(s, seat) {
    return { ...s, me: seat, legal: seat === null ? [] : legal(s, seat), progress: [...Array(s.n).keys()].map((p) => progressOf(s, p)) };
  },
  isOver(s) { return s.over; },
  result(s) {
    if (!s.over) return null;
    return { winners: [s.winner!], scores: [...Array(s.n).keys()].map((p) => progressOf(s, p)), summary: 'Tüm taşlarını karşı köşeye ilk taşıyan kazandı' };
  },
  ai(v, seat, d, rng) { return cinAi(v, seat, d, rng); },
};

function totalDist(s: CinState, seat: number) {
  const tip = tipOf(opposite(s.corners[seat]));
  let t = 0;
  for (let i = 0; i < N_HOLES; i++) if (s.board[i] === seat) t += dist(i, tip);
  return t;
}

export function cinAi(v: CinView, seat: number, d: Difficulty, rng: Rng): CinAction {
  const moves = v.legal;
  if (d === 'kolay' && rng.int(3) === 0) return moves[rng.int(moves.length)];
  const tip = tipOf(opposite(v.corners[seat]));
  const target = new Set(CORNER_HOLES[opposite(v.corners[seat])]);
  let best = moves[0], bv = -Infinity;
  for (const m of moves) {
    const from = m.path[0], to = m.path[m.path.length - 1];
    let val = (dist(from, tip) - dist(to, tip)) * 10;
    if (target.has(from) && !target.has(to)) val -= 40; // hedefteki taşı geri çekme
    if (target.has(to)) val += 4;
    // Geride kalan taşları ileri taşı (zor): arkadaki taşa ağırlık ver
    if (d === 'zor') val += dist(from, tip) * 1.2;
    if (d !== 'kolay') {
      // Bir sonraki tur zincir atlama potansiyeli (zor): hamleden sonra en iyi devamı
      if (d === 'zor') {
        const b = v.board.slice(); b[from] = -1; b[to] = seat;
        let follow = 0;
        for (const [t2] of reachable(b, to)) follow = Math.max(follow, dist(to, tip) - dist(t2, tip));
        val += follow * 2;
      }
    }
    val += rng.int(3);
    if (val > bv) { bv = val; best = m; }
  }
  return best;
}
