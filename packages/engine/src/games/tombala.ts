import { shuffle } from '../rng';
import { IllegalMoveError, type GameModule, type Rng } from '../types';

/**
 * TOMBALA — uygulanan kurallar
 * - 2–20 oyuncu; her oyuncuya seçilen sayıda (1–3) kart. Torbada 1–90 arası 90 numara.
 * - Kart: 3 satır × 9 sütun; her satırda 5 numara (toplam 15). Sütunlar: 1–9, 10–19, …, 70–79, 80–90.
 *   Her sütunda en az 1, en çok 3 numara; sütun içinde yukarıdan aşağı artan sıralı.
 * - Numaralar sunucuda çekilir ve kartlarda otomatik işaretlenir.
 * - Ödüller (sunucu doğrular): 1. çinko = bir kartta bir satır tamam; 2. çinko = aynı kartta iki satır tamam;
 *   tombala = bir kartın 15 numarası tamam. Aynı çekilişte birden çok kazanan olursa ödül paylaşılır.
 * - Puan: 1. çinko 1, 2. çinko 2, tombala 5 (paylaşılırsa her kazanana aynı puan yazılır). Tombala çıkınca oyun biter.
 * - Numarayı masayı açan oyuncu (koltuk 0) çeker; "otomatik çek" seçeneğinde sistem çeker.
 */

export type TCard = (number | null)[][]; // 3 × 9

export function makeCard(rng: Rng): TCard {
  for (;;) {
    // Her satır için 5 sütun seç
    const rows = [0, 1, 2].map(() => shuffle([...Array(9).keys()], rng).slice(0, 5).sort((a, b) => a - b));
    const counts = new Array(9).fill(0);
    rows.forEach((r) => r.forEach((c) => counts[c]++));
    if (counts.some((x) => x === 0)) continue;
    const card: TCard = [0, 1, 2].map(() => new Array(9).fill(null));
    let ok = true;
    for (let col = 0; col < 9; col++) {
      const lo = col === 0 ? 1 : col * 10, hi = col === 8 ? 90 : col * 10 + 9;
      const pool = shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), rng).slice(0, counts[col]).sort((a, b) => a - b);
      if (pool.length < counts[col]) { ok = false; break; }
      let k = 0;
      for (let r = 0; r < 3; r++) if (rows[r].includes(col)) card[r][col] = pool[k++];
    }
    if (ok) return card;
  }
}

const rowDone = (row: (number | null)[], drawn: Set<number>) => row.every((x) => x === null || drawn.has(x));
const doneRows = (card: TCard, drawn: Set<number>) => card.filter((r) => rowDone(r, drawn)).length;

export interface TombalaState {
  game: 'tombala';
  n: number;
  cards: TCard[][]; // cards[oyuncu][kart]
  bag: number[];
  drawn: number[];
  prizes: { cinko1: number[] | null; cinko2: number[] | null; tombala: number[] | null };
  scores: number[];
  autoDraw: boolean;
  over: boolean;
}
export type TombalaAction = { type: 'draw' };
export interface TombalaView extends Omit<TombalaState, 'bag'> { me: number | null; remaining: number; legal: TombalaAction[]; caller: number }

export const Tombala: GameModule<TombalaState, TombalaAction, TombalaView> = {
  id: 'tombala',
  name: 'Tombala',
  playerCounts: Array.from({ length: 19 }, (_, i) => i + 2),
  options: [
    { key: 'cards', label: 'Oyuncu başına kart', default: 1, choices: [1, 2, 3].map((v) => ({ value: v, label: `${v} kart` })) },
  ],
  setup(cfg, rng) {
    if (cfg.players < 2 || cfg.players > 20) throw new IllegalMoveError('Tombala 2–20 kişiyle oynanır');
    const k = Math.min(3, Math.max(1, Number(cfg.options?.cards ?? 1)));
    return {
      game: 'tombala', n: cfg.players, cards: Array.from({ length: cfg.players }, () => Array.from({ length: k }, () => makeCard(rng))),
      bag: shuffle(Array.from({ length: 90 }, (_, i) => i + 1), rng), drawn: [], prizes: { cinko1: null, cinko2: null, tombala: null },
      scores: new Array(cfg.players).fill(0), autoDraw: cfg.options?.autoDraw === true, over: false,
    };
  },
  toAct(s) { return s.over ? [] : [0]; },
  legalActions(s, seat) { return s.over || seat !== 0 ? [] : [{ type: 'draw' }]; },
  apply(s0, seat, a) {
    if (s0.over) throw new IllegalMoveError('Oyun bitti');
    if (seat !== 0) throw new IllegalMoveError('Numarayı masayı açan oyuncu çeker');
    if (a?.type !== 'draw') throw new IllegalMoveError('Geçersiz hamle');
    const s: TombalaState = { ...s0, bag: s0.bag.slice(), drawn: s0.drawn.slice(), prizes: { ...s0.prizes }, scores: s0.scores.slice() };
    s.drawn.push(s.bag.pop()!);
    const set = new Set(s.drawn);
    const best = s.cards.map((cs) => Math.max(...cs.map((c) => doneRows(c, set))));
    const award = (key: 'cinko1' | 'cinko2' | 'tombala', need: number, pts: number) => {
      if (s.prizes[key]) return false;
      const w = best.map((b, p) => (b >= need ? p : -1)).filter((p) => p >= 0);
      if (!w.length) return false;
      s.prizes[key] = w;
      w.forEach((p) => (s.scores[p] += pts));
      return true;
    };
    award('cinko1', 1, 1);
    if (s.prizes.cinko1) award('cinko2', 2, 2);
    if (s.prizes.cinko2) award('tombala', 3, 5);
    if (s.prizes.tombala || !s.bag.length) s.over = true;
    return s;
  },
  view(s, seat) {
    const { bag, ...rest } = s;
    // Kartlar herkese açıktır (gerçek oyunda da masadadır); torba sırası gizlidir.
    return { ...rest, me: seat, remaining: bag.length, legal: seat === null ? [] : Tombala.legalActions(s, seat), caller: 0 };
  },
  isOver(s) { return s.over; },
  result(s) {
    if (!s.over) return null;
    const max = Math.max(...s.scores);
    return { winners: s.scores.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0), scores: s.scores.slice(), summary: s.prizes.tombala ? 'Tombala!' : 'Torba bitti' };
  },
  ai() { return { type: 'draw' }; },
};

export { doneRows };
