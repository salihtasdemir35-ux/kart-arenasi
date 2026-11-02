import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * TAVLA (klasik / "erkek tavlası" düzeni) KURALLARI — bu motorda uygulananlar
 * - 24 kapı, oyuncu başına 15 taş. points[i] > 0 → Beyaz (koltuk 0) taşları, < 0 → Siyah (koltuk 1).
 * - Beyaz 23'ten 0'a doğru ilerler, evi 0–5. Siyah 0'dan 23'e ilerler, evi 18–23.
 * - Başlangıç: Beyaz 24'te 2, 13'te 5, 8'de 3, 6'da 5 (kapı numaraları 1'den başlar).
 * - İlk atışta iki oyuncu birer zar atar; büyük atan başlar (eşitse tekrar).
 * - Çift zarda dört hamle oynanır.
 * - Kırılan taş bara gider; barda taşı olan önce onu girmek zorundadır.
 * - 2 veya daha fazla rakip taşı olan kapıya (kapalı kapı) gidilemez.
 * - Zarların mümkün olan en fazlası oynanmak zorundadır; yalnızca biri oynanabiliyorsa büyük zar oynanır.
 * - Tüm taşlar evdeyken taş toplanır; zar daha büyükse ve geride taş yoksa en uzaktaki taş toplanır.
 * - Puan: normal 1, mars (rakip hiç taş toplayamadıysa) 2,
 *   katmerli mars (ayrıca rakibin barda ya da kazananın evinde taşı varsa) 3.
 * - Maç: seçilen puana ilk ulaşan kazanır.
 */

export interface TavlaState {
  game: 'tavla';
  points: number[];
  bar: [number, number];
  off: [number, number];
  turn: 0 | 1;
  phase: 'roll' | 'move' | 'over';
  dice: number[];
  rolled: number[];
  opening: [number, number] | null;
  matchTo: number;
  score: [number, number];
  gameNo: number;
  lastGame: { winner: number; points: number; kind: string } | null;
  lastTurn: { seat: number; moves: TavlaMove[]; passed: boolean } | null;
  moves: TavlaMove[];
}

/** from: 24 = bar; to: -1 = toplama. */
export interface TavlaMove { from: number; to: number; die: number; hit: boolean }
export type TavlaAction = { type: 'roll' } | { type: 'move'; from: number; die: number } | { type: 'resign' };

export interface TavlaView extends TavlaState { me: number | null; legal: TavlaAction[]; pip: [number, number] }

const BAR = 24;
const sgn = (p: number) => (p === 0 ? 1 : -1);

export function initialPoints(): number[] {
  const pts = new Array(24).fill(0);
  pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return pts;
}

interface Pos { points: number[]; bar: [number, number]; off: [number, number] }

const own = (pos: Pos, p: number, i: number) => pos.points[i] * sgn(p);
/** Oyuncunun i kapısının "ev uzaklığı" (1..24): toplama için kalan adım. */
const dist = (p: number, i: number) => (p === 0 ? i + 1 : 24 - i);

function allHome(pos: Pos, p: number) {
  if (pos.bar[p] > 0) return false;
  for (let i = 0; i < 24; i++) if (own(pos, p, i) > 0 && dist(p, i) > 6) return false;
  return true;
}

function singleMoves(pos: Pos, p: number, die: number): TavlaMove[] {
  const out: TavlaMove[] = [];
  const dest = (from: number) => (from === BAR ? (p === 0 ? 24 - die : die - 1) : p === 0 ? from - die : from + die);
  const canLand = (t: number) => own(pos, p, t) >= -1;
  if (pos.bar[p] > 0) {
    const t = dest(BAR);
    if (canLand(t)) out.push({ from: BAR, to: t, die, hit: own(pos, p, t) === -1 });
    return out;
  }
  const home = allHome(pos, p);
  for (let i = 0; i < 24; i++) {
    if (own(pos, p, i) <= 0) continue;
    const t = dest(i);
    if (t >= 0 && t < 24) {
      if (canLand(t)) out.push({ from: i, to: t, die, hit: own(pos, p, t) === -1 });
    } else if (home) {
      const d = dist(p, i);
      if (d === die) out.push({ from: i, to: -1, die, hit: false });
      else if (die > d) {
        // Daha uzakta taş yoksa büyük zarla toplanabilir
        let farther = false;
        for (let j = 0; j < 24; j++) if (own(pos, p, j) > 0 && dist(p, j) > d) farther = true;
        if (!farther) out.push({ from: i, to: -1, die, hit: false });
      }
    }
  }
  return out;
}

function play(pos: Pos, p: number, m: TavlaMove): Pos {
  const points = pos.points.slice();
  const bar: [number, number] = [pos.bar[0], pos.bar[1]];
  const off: [number, number] = [pos.off[0], pos.off[1]];
  const s = sgn(p);
  if (m.from === BAR) bar[p]--; else points[m.from] -= s;
  if (m.to === -1) off[p]++;
  else {
    if (m.hit) { points[m.to] = 0; bar[1 - p]++; }
    points[m.to] += s;
  }
  return { points, bar, off };
}

const posKey = (ps: Pos, left: number[]) => ps.points.join(',') + '|' + ps.bar + '|' + ps.off + '|' + left.slice().sort().join('');

/** Bu konumdan kalan zarlarla en fazla kaç zar oynanabilir (bellekli). */
function maxPlayable(pos: Pos, p: number, dice: number[], memo: Map<string, number>): number {
  if (dice.length === 0) return 0;
  const key = posKey(pos, dice);
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  const tried = new Set<number>();
  for (let k = 0; k < dice.length && best < dice.length; k++) {
    if (tried.has(dice[k])) continue;
    tried.add(dice[k]);
    const rest = dice.slice(0, k).concat(dice.slice(k + 1));
    for (const m of singleMoves(pos, p, dice[k])) {
      best = Math.max(best, 1 + maxPlayable(play(pos, p, m), p, rest, memo));
      if (best === dice.length) break;
    }
  }
  memo.set(key, best);
  return best;
}

/** Kural gereği şu an oynanabilecek tekil hamleler. */
export function legalFirstMoves(pos: Pos, p: number, dice: number[]): TavlaMove[] {
  const memo = new Map<string, number>();
  const total = maxPlayable(pos, p, dice, memo);
  if (total === 0) return [];
  const out: TavlaMove[] = [];
  const tried = new Set<number>();
  for (let k = 0; k < dice.length; k++) {
    if (tried.has(dice[k])) continue;
    tried.add(dice[k]);
    const rest = dice.slice(0, k).concat(dice.slice(k + 1));
    for (const m of singleMoves(pos, p, dice[k])) if (1 + maxPlayable(play(pos, p, m), p, rest, memo) === total) out.push(m);
  }
  if (total === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const big = Math.max(...dice);
    if (out.some((m) => m.die === big)) return out.filter((m) => m.die === big);
  }
  return out;
}

/** Kurala uygun tam hamle dizileri (aynı son konuma varan diziler tekilleştirilir). Yapay zekâ için. */
export function sequences(pos: Pos, p: number, dice: number[]): TavlaMove[][] {
  const res: TavlaMove[][] = [];
  const visited = new Set<string>();
  const rec = (ps: Pos, left: number[], path: TavlaMove[]) => {
    const key = posKey(ps, left);
    if (visited.has(key)) return;
    visited.add(key);
    const moves = legalFirstMoves(ps, p, left);
    if (!moves.length) { if (path.length) res.push(path); return; }
    for (const m of moves) {
      const k = left.indexOf(m.die);
      rec(play(ps, p, m), left.slice(0, k).concat(left.slice(k + 1)), [...path, m]);
    }
  };
  rec(pos, dice, []);
  return res;
}

function legalMoves(s: TavlaState): TavlaMove[] {
  if (s.phase !== 'move') return [];
  return legalFirstMoves(s, s.turn, s.dice);
}

export function pipCount(pos: Pos, p: number) {
  let t = pos.bar[p] * 25;
  for (let i = 0; i < 24; i++) if (own(pos, p, i) > 0) t += own(pos, p, i) * dist(p, i);
  return t;
}

function freshGame(s: TavlaState, rng: Rng, starter?: number) {
  s.points = initialPoints();
  s.bar = [0, 0];
  s.off = [0, 0];
  s.moves = [];
  let a = 0, b = 0;
  if (starter === undefined) {
    do { a = 1 + rng.int(6); b = 1 + rng.int(6); } while (a === b);
    s.opening = [a, b];
    s.turn = a > b ? 0 : 1;
  } else {
    s.opening = null;
    s.turn = starter as 0 | 1;
  }
  s.phase = 'roll';
  s.dice = [];
  s.rolled = [];
}

function finishTurn(s: TavlaState, passed: boolean) {
  s.lastTurn = { seat: s.turn, moves: s.moves, passed };
  s.moves = [];
  s.turn = (1 - s.turn) as 0 | 1;
  s.phase = 'roll';
  s.dice = [];
}

function gameWon(s: TavlaState, winner: number, rng: Rng, forced?: string) {
  const loser = 1 - winner;
  let pts = 1, kind = forced ?? 'Normal';
  if (!forced && s.off[loser] === 0) {
    pts = 2; kind = 'Mars';
    let back = s.bar[loser] > 0;
    for (let i = 0; i < 24; i++) if (own(s, loser, i) > 0 && dist(winner, i) <= 6) back = true;
    if (back) { pts = 3; kind = 'Katmerli mars'; }
  }
  if (forced) pts = Math.max(1, s.matchTo - s.score[winner]);
  s.score[winner] += pts;
  s.lastGame = { winner, points: pts, kind };
  if (s.score[winner] >= s.matchTo) s.phase = 'over';
  else { s.gameNo++; freshGame(s, rng, winner); }
}

function clone(s: TavlaState): TavlaState {
  return { ...s, points: s.points.slice(), bar: [...s.bar] as [number, number], off: [...s.off] as [number, number], dice: s.dice.slice(), rolled: s.rolled.slice(), score: [...s.score] as [number, number], moves: s.moves.slice() };
}

export const Tavla: GameModule<TavlaState, TavlaAction, TavlaView> & { resign(s: TavlaState, seat: number, reason: string): TavlaState } = {
  id: 'tavla',
  name: 'Tavla',
  playerCounts: [2],
  options: [{ key: 'matchTo', label: 'Maç', default: 3, choices: [1, 3, 5, 7].map((v) => ({ value: v, label: v === 1 ? 'Tek oyun' : `${v} puana` })) }],

  setup(cfg, rng) {
    if (cfg.players !== 2) throw new IllegalMoveError('Tavla 2 kişiyle oynanır');
    const s = { game: 'tavla', matchTo: Number(cfg.options?.matchTo ?? 3), score: [0, 0], gameNo: 1, lastGame: null, lastTurn: null } as unknown as TavlaState;
    freshGame(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'roll') return [{ type: 'roll' }];
    return legalMoves(s).map((m) => ({ type: 'move' as const, from: m.from, die: m.die }));
  },

  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (a?.type === 'resign') return Tavla.resign(s0, seat, 'Teslim oldu');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    if (s.phase === 'roll') {
      if (a?.type !== 'roll') throw new IllegalMoveError('Önce zar atın');
      let d1: number, d2: number;
      if (s.opening) { [d1, d2] = s.turn === 0 ? s.opening : [s.opening[1], s.opening[0]]; s.opening = null; }
      else { d1 = 1 + rng.int(6); d2 = 1 + rng.int(6); }
      s.rolled = [d1, d2];
      s.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      s.phase = 'move';
      if (legalMoves(s).length === 0) finishTurn(s, true);
      return s;
    }
    if (a?.type !== 'move') throw new IllegalMoveError('Taş oynamalısınız');
    const m = legalMoves(s).find((x) => x.from === a.from && x.die === a.die);
    if (!m) {
      if (s.bar[seat] > 0 && a.from !== BAR) throw new IllegalMoveError('Önce kırılan taşınızı girmelisiniz');
      throw new IllegalMoveError('Bu hamle kurallara uygun değil');
    }
    const pos = play(s, seat, m);
    s.points = pos.points; s.bar = pos.bar; s.off = pos.off;
    s.dice.splice(s.dice.indexOf(m.die), 1);
    s.moves.push(m);
    if (s.off[seat] === 15) { s.lastTurn = { seat, moves: s.moves, passed: false }; s.moves = []; gameWon(s, seat, rng); return s; }
    if (s.dice.length === 0 || legalMoves(s).length === 0) finishTurn(s, false);
    return s;
  },

  resign(s0, seat) {
    if (s0.phase === 'over') return s0;
    const s = clone(s0);
    const w = 1 - seat;
    s.score[w] = Math.max(s.score[w], s.matchTo);
    s.lastGame = { winner: w, points: 0, kind: 'Teslim' };
    s.phase = 'over';
    return s;
  },

  view(s, seat) {
    return { ...s, me: seat, legal: seat === null ? [] : Tavla.legalActions(s, seat), pip: [pipCount(s, 0), pipCount(s, 1)] };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const w = s.score[0] > s.score[1] ? 0 : 1;
    return { winners: [w], scores: [...s.score], summary: s.lastGame?.kind === 'Teslim' ? 'Rakip teslim oldu' : `${s.lastGame?.kind ?? ''} ile maç bitti` };
  },
  ai(v, seat, d, rng) { return tavlaAi(v, seat, d, rng); },
};

// ---------- Yapay zekâ ----------
function evalPos(pos: Pos, p: number, careful: boolean): number {
  const o = 1 - p;
  let v = (pipCount(pos, o) - pipCount(pos, p)) * 1.0 + pos.off[p] * 6 - pos.bar[p] * 8 + pos.bar[o] * 10;
  const race = (() => {
    // Taşlar birbirini geçtiyse temas yok: yarış
    let minP = 99, maxO = -1;
    for (let i = 0; i < 24; i++) {
      if (own(pos, p, i) > 0) minP = Math.min(minP, p === 0 ? 24 - i : i);
      if (own(pos, o, i) > 0) maxO = Math.max(maxO, p === 0 ? 24 - i : i);
    }
    return pos.bar[0] + pos.bar[1] === 0 && minP > maxO;
  })();
  if (race) return v;
  for (let i = 0; i < 24; i++) {
    const n = own(pos, p, i);
    if (n >= 2) v += dist(p, i) <= 6 ? 6 : 3;
    if (n === 1) {
      // Açık taş: önünde kaç rakip taşı onu vurabilir?
      let shooters = 0;
      for (let j = 0; j < 24; j++) {
        if (own(pos, o, j) <= 0) continue;
        const gap = p === 0 ? i - j : j - i; // rakip hareket yönü ters
        if (gap > 0 && gap <= 12) shooters += gap <= 6 ? 2 : 1;
      }
      if (pos.bar[o] > 0) shooters += 1;
      v -= (careful ? 2.5 : 1.2) * shooters * (1 + (24 - dist(p, i)) / 24);
    }
  }
  return v;
}

export function tavlaAi(v: TavlaView, seat: number, d: Difficulty, rng: Rng): TavlaAction {
  if (v.phase === 'roll') return { type: 'roll' };
  const seqs = sequences(v, seat, v.dice);
  if (!seqs.length) return v.legal[0];
  let pick: TavlaMove[];
  if (d === 'kolay') pick = seqs[rng.int(seqs.length)];
  else {
    let best = -Infinity;
    pick = seqs[0];
    for (const sq of seqs) {
      let pos: Pos = v;
      for (const m of sq) pos = play(pos, seat, m);
      const val = evalPos(pos, seat, d === 'zor') + (d === 'orta' ? rng.int(4) : 0);
      if (val > best) { best = val; pick = sq; }
    }
  }
  return { type: 'move', from: pick[0].from, die: pick[0].die };
}
