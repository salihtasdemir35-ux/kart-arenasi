import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * KIZMA BİRADER KURALLARI — bu motorda uygulananlar
 * - 2–4 oyuncu, dört renk, oyuncu başına 4 taş. 2 kişide karşılıklı renkler kullanılır.
 * - Pist 40 kare; her rengin başlangıç karesi 10 kare arayla. Ardından 4 karelik güvenli ev yolu.
 * - Taş konumu (oyuncuya göre): -1 = başlangıç evi, 0..39 = pistte kat edilen adım, 40..43 = ev yolu.
 * - 6 atınca evden taş çıkarılır (başlangıç karesinde kendi taşın yoksa çıkarmak zorunludur).
 * - 6 atan bir kez daha atar.
 * - Pistteki tüm taşlar evdeyse (oynanabilir taş yoksa) 6 için 3 deneme hakkı vardır.
 * - Rakip taşın üstüne gelinirse rakip taş başlangıç evine döner.
 * - Kendi taşının üstüne gelinemez. Ev yolunda taşların üzerinden atlanamaz, tam zar gerekir.
 * - Ev yolu güvenli alandır: oraya rakip giremez.
 * - Dört taşını eve ilk sokan kazanır.
 */

export interface KizmaState {
  game: 'kizma';
  n: number;
  colors: number[];
  tokens: number[][];
  turn: number;
  phase: 'roll' | 'move' | 'over';
  die: number | null;
  tries: number;
  winner: number | null;
  last: { seat: number; die: number; token: number | null; captured: number | null; note: string } | null;
}

export type KizmaAction = { type: 'roll' } | { type: 'move'; token: number };
export interface KizmaView extends KizmaState { me: number | null; legal: KizmaAction[] }

const abs = (color: number, rel: number) => (color * 10 + rel) % 40;

function occupant(s: KizmaState, square: number): { seat: number; token: number } | null {
  for (let p = 0; p < s.n; p++)
    for (let t = 0; t < 4; t++) {
      const r = s.tokens[p][t];
      if (r >= 0 && r < 40 && abs(s.colors[p], r) === square) return { seat: p, token: t };
    }
  return null;
}

export function targetOf(s: KizmaState, seat: number, token: number, die: number): number | null {
  const r = s.tokens[seat][token];
  if (r === -1) return die === 6 ? 0 : null;
  const t = r + die;
  if (t > 43) return null;
  if (t >= 40) {
    // Ev yolunda taş üstünden atlanamaz
    for (let k = Math.max(r + 1, 40); k <= t; k++) if (s.tokens[seat].includes(k)) return null;
    return t;
  }
  return t;
}

function movable(s: KizmaState, seat: number, die: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < 4; t++) {
    const to = targetOf(s, seat, t, die);
    if (to === null) continue;
    if (to < 40) {
      const occ = occupant(s, abs(s.colors[seat], to));
      if (occ && occ.seat === seat) continue;
    }
    out.push(t);
  }
  // 6 atıldı, evde taş var ve başlangıç karesi boşsa çıkarmak zorunlu
  if (die === 6) {
    const out0 = out.filter((t) => s.tokens[seat][t] === -1);
    if (out0.length) return out0;
  }
  return out;
}

const canMoveAny = (s: KizmaState, seat: number) => s.tokens[seat].some((r) => r >= 0 && r < 40) || s.tokens[seat].some((r, i) => r >= 40 && [1, 2, 3].some((d) => targetOf(s, seat, i, d) !== null));

function nextTurn(s: KizmaState) {
  s.turn = (s.turn + 1) % s.n;
  s.phase = 'roll';
  s.die = null;
  s.tries = 0;
}

export const Kizma: GameModule<KizmaState, KizmaAction, KizmaView> = {
  id: 'kizma',
  name: 'Kızma Birader',
  playerCounts: [2, 3, 4],
  options: [],

  setup(cfg, rng) {
    if (!this.playerCounts.includes(cfg.players)) throw new IllegalMoveError('Kızma Birader 2–4 kişiyle oynanır');
    const n = cfg.players;
    const colors = n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n);
    return { game: 'kizma', n, colors, tokens: Array.from({ length: n }, () => [-1, -1, -1, -1]), turn: rng.int(n), phase: 'roll', die: null, tries: 0, winner: null, last: null };
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'roll') return [{ type: 'roll' }];
    return movable(s, seat, s.die!).map((token) => ({ type: 'move' as const, token }));
  },

  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s: KizmaState = { ...s0, tokens: s0.tokens.map((t) => t.slice()) };
    if (s.phase === 'roll') {
      if (a?.type !== 'roll') throw new IllegalMoveError('Önce zar atın');
      const die = 1 + rng.int(6);
      s.die = die;
      const opts = movable(s, seat, die);
      if (opts.length) { s.phase = 'move'; s.last = { seat, die, token: null, captured: null, note: '' }; return s; }
      s.tries += 1;
      const stuck = !canMoveAny(s, seat);
      s.last = { seat, die, token: null, captured: null, note: 'Oynanacak taş yok' };
      if (stuck && s.tries < 3) { s.phase = 'roll'; return s; } // 3 deneme hakkı
      if (die === 6) { s.phase = 'roll'; s.tries = 0; return s; }
      nextTurn(s);
      return s;
    }
    if (a?.type !== 'move' || !movable(s, seat, s.die!).includes(a.token)) {
      if (a?.type === 'move' && s.die === 6 && s.tokens[seat][a.token] !== -1 && s.tokens[seat].includes(-1)) throw new IllegalMoveError('6 attınız: önce evden taş çıkarmalısınız');
      throw new IllegalMoveError('Bu taş oynanamaz');
    }
    const to = targetOf(s, seat, a.token, s.die!)!;
    let captured: number | null = null;
    if (to < 40) {
      const occ = occupant(s, abs(s.colors[seat], to));
      if (occ) { s.tokens[occ.seat][occ.token] = -1; captured = occ.seat; }
    }
    s.tokens[seat][a.token] = to;
    s.last = { seat, die: s.die!, token: a.token, captured, note: '' };
    if (s.tokens[seat].every((r) => r >= 40)) { s.phase = 'over'; s.winner = seat; return s; }
    if (s.die === 6) { s.phase = 'roll'; s.die = null; s.tries = 0; return s; }
    nextTurn(s);
    return s;
  },

  view(s, seat) { return { ...s, me: seat, legal: seat === null ? [] : Kizma.legalActions(s, seat) }; },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const progress = s.tokens.map((ts) => ts.reduce((t, r) => t + (r + 1), 0));
    return { winners: [s.winner!], scores: progress, summary: 'Dört taşını eve ilk sokan kazandı' };
  },
  ai(v, seat, d, rng) { return kizmaAi(v, seat, d, rng); },
};

export function kizmaAi(v: KizmaView, seat: number, d: Difficulty, rng: Rng): KizmaAction {
  if (v.phase === 'roll') return { type: 'roll' };
  const opts = v.legal as { type: 'move'; token: number }[];
  if (d === 'kolay' || opts.length === 1) return opts[rng.int(opts.length)];
  const danger = (seatX: number, rel: number) => {
    if (rel < 0 || rel >= 40) return 0;
    const sq = abs(v.colors[seatX], rel);
    let k = 0;
    for (let p = 0; p < v.n; p++) {
      if (p === seatX) continue;
      for (const r of v.tokens[p]) {
        if (r < 0 || r >= 40) continue;
        const gap = (sq - abs(v.colors[p], r) + 40) % 40;
        if (gap >= 1 && gap <= 6 && r + gap < 40) k++;
      }
    }
    return k;
  };
  let best = opts[0], bv = -Infinity;
  for (const o of opts) {
    const from = v.tokens[seat][o.token];
    const to = targetOf(v, seat, o.token, v.die!)!;
    let val = 0;
    if (to < 40) {
      const occ = occupant(v, abs(v.colors[seat], to));
      if (occ && occ.seat !== seat) val += 50 + v.tokens[occ.seat][occ.token];
    }
    if (from === -1) val += 30;
    if (to >= 40) val += 40;
    val += to * 0.4;
    if (d === 'zor') val += (danger(seat, from) - danger(seat, to)) * 12;
    else val -= danger(seat, to) * 4;
    val += rng.int(3);
    if (val > bv) { bv = val; best = o; }
  }
  return best;
}
