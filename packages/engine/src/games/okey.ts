import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * KLASİK OKEY — uygulanan kurallar
 * - 106 taş: 4 renk (Sarı, Mavi, Siyah, Kırmızı) × 1–13 × 2 adet + 2 sahte okey. 4 oyuncu.
 * - Bir taş gösterge olarak açılır. Göstergenin aynı renkteki bir fazlası OKEY'dir (13'ün okeyi 1).
 *   Okey taşları istenen her taşın yerine geçer. Sahte okeyler okey taşının gerçek değerini alır.
 * - Dağıtan 15, diğerleri 14 taş alır. Dağıtan bir taş atarak başlar.
 * - Sırası gelen ortadan ya da solundakinin attığı son taşı çeker, sonra bir taş atar.
 * - Per: aynı renkte ardışık en az 3 taş (12-13-1 geçerli, 13-1-2 değil) ya da aynı sayıda farklı renkte 3–4 taş.
 * - Bitirme: 15. taşı atarken kalan 14 taşın tamamı perlerden oluşmalı ya da 7 çift olmalı.
 * - Puanlar (herkes 20 puanla başlar, kaybedenden düşülür): normal bitiriş 2, çifte bitiriş 4,
 *   okey atarak bitiriş 4, okey atarak çifte bitiriş 8. Göstergeyi gösteren (ilk taşını atmadan önce
 *   elinde gösterge taşının eşi olan) oyuncu için diğerlerinden 1 puan düşülür.
 * - Ortada taş kalmazsa el berabere biter. Oyun seçilen el sayısında ya da birinin puanı 0'a inince biter.
 */

export const OKEY_COLORS = ['Sarı', 'Mavi', 'Siyah', 'Kırmızı'];
export const FAKE = [104, 105];
export const tileColor = (id: number) => (id >= 104 ? -1 : Math.floor(id / 26));
export const tileNum = (id: number) => (id >= 104 ? 0 : ((id % 26) >> 1) + 1);
export const tileId = (c: number, n: number, copy = 0) => c * 26 + (n - 1) * 2 + copy;
export const tileName = (id: number) => (id >= 104 ? 'Sahte okey' : `${OKEY_COLORS[tileColor(id)]} ${tileNum(id)}`);

export interface Okey { c: number; n: number }
export const okeyOf = (indicator: number): Okey => ({ c: tileColor(indicator), n: tileNum(indicator) === 13 ? 1 : tileNum(indicator) + 1 });
export const isWild = (id: number, ok: Okey) => id < 104 && tileColor(id) === ok.c && tileNum(id) === ok.n;
/** Taşın elde değerlendirilen (renk, sayı) değeri; okey taşları için null (joker). */
export const valueOf = (id: number, ok: Okey): [number, number] | null => (isWild(id, ok) ? null : id >= 104 ? [ok.c, ok.n] : [tileColor(id), tileNum(id)]);

type Counts = number[][]; // [renk][1..14] (14 = 1'in 13'ten sonraki kullanımı için ayrılmaz; sayım 1..13)

function toCounts(ids: number[], ok: Okey): { cnt: Counts; wild: number } {
  const cnt = [0, 1, 2, 3].map(() => new Array(15).fill(0));
  let wild = 0;
  for (const id of ids) { const v = valueOf(id, ok); if (!v) wild++; else cnt[v[0]][v[1]]++; }
  return { cnt, wild };
}
const keyOf = (cnt: Counts, w: number) => cnt.map((r) => r.slice(1, 14).join('')).join('|') + '#' + w;

/** Taşların (jokerlerle) tamamen perlere bölünebilir mi? */
export function canMeldAll(cnt: Counts, wild: number, memo = new Map<string, boolean>()): boolean {
  let c0 = -1, n0 = -1;
  outer: for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) if (cnt[c][n] > 0) { c0 = c; n0 = n; break outer; }
  if (c0 < 0) return wild === 0 || wild >= 3; // kalan jokerler kendi aralarında per olabilir
  const k = keyOf(cnt, wild);
  if (memo.has(k)) return memo.get(k)!;
  let ok = false;
  // 1) Grup: aynı sayı, farklı renkler (3–4)
  const others = [0, 1, 2, 3].filter((c) => c !== c0);
  for (let mask = 0; mask < 8 && !ok; mask++) {
    const use = others.filter((_, i) => mask & (1 << i));
    if (use.some((c) => cnt[c][n0] === 0)) continue;
    for (let jokers = 0; jokers <= Math.min(wild, 3 - use.length); jokers++) {
      const size = 1 + use.length + jokers;
      if (size < 3 || size > 4) continue;
      cnt[c0][n0]--; use.forEach((c) => cnt[c][n0]--);
      if (canMeldAll(cnt, wild - jokers, memo)) ok = true;
      cnt[c0][n0]++; use.forEach((c) => cnt[c][n0]++);
      if (ok) break;
    }
  }
  // 2) Seri: aynı renk ardışık. n0 bu renkteki en küçük gerçek taştır; ondan önceki konumlar yalnız jokerle dolar.
  //    Her konumda gerçek taş da joker de denenir (gerçek taş başka bir perde gerekebilir).
  //    Konum 14 = 13'ten sonra gelen 1 (12-13-1).
  if (!ok) {
    cnt[c0][n0]--;
    for (let pre = 0; pre <= Math.min(wild, n0 - 1) && !ok; pre++) {
      const start = n0 - pre;
      const ext = (pos: number, w: number, len: number): boolean => {
        if (len >= 3 && canMeldAll(cnt, w, memo)) return true;
        if (pos > 14 || (pos === 14 && start === 1)) return false;
        const real = pos === 14 ? 1 : pos;
        if (cnt[c0][real] > 0) { cnt[c0][real]--; const r = ext(pos + 1, w, len + 1); cnt[c0][real]++; if (r) return true; }
        return w > 0 && ext(pos + 1, w - 1, len + 1);
      };
      ok = ext(n0 + 1, wild - pre, pre + 1);
    }
    // n0 = 1 ise 1'i "13'ten sonraki" uç olarak kullanan seriler: ..., 12, 13, 1
    if (!ok && n0 === 1) {
      const down = (pos: number, w: number, len: number): boolean => {
        if (len >= 3 && canMeldAll(cnt, w, memo)) return true;
        if (pos < 2) return false;
        if (cnt[c0][pos] > 0) { cnt[c0][pos]--; const r = down(pos - 1, w, len + 1); cnt[c0][pos]++; if (r) return true; }
        return w > 0 && down(pos - 1, w - 1, len + 1);
      };
      ok = down(13, wild, 1);
    }
    cnt[c0][n0]++;
  }
  memo.set(k, ok);
  return ok;
}

export function isWinningHand(ids: number[], ok: Okey): 'per' | 'cift' | null {
  if (ids.length !== 14) return null;
  const { cnt, wild } = toCounts(ids, ok);
  // Çift: 7 çift (aynı renk ve sayı); jokerler eşsiz taşı tamamlar
  let singles = 0, pairs = 0;
  for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) { pairs += cnt[c][n] >> 1; singles += cnt[c][n] & 1; }
  const pairOk = singles <= wild && pairs + singles + Math.floor((wild - singles) / 2) === 7;
  if (canMeldAll(cnt, wild)) return 'per';
  if (pairOk) return 'cift';
  return null;
}

/** En fazla kaç taş per içinde kullanılabilir (YZ için). */
export function meldCoverage(ids: number[], ok: Okey): number {
  const { cnt, wild } = toCounts(ids, ok);
  const memo = new Map<string, number>();
  const rec = (w: number): number => {
    let c0 = -1, n0 = -1;
    outer: for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) if (cnt[c][n] > 0) { c0 = c; n0 = n; break outer; }
    if (c0 < 0) return w >= 3 ? w : 0;
    const k = keyOf(cnt, w);
    if (memo.has(k)) return memo.get(k)!;
    // Bu taşı kullanma
    cnt[c0][n0]--; let best = rec(w); cnt[c0][n0]++;
    // Grup
    const others = [0, 1, 2, 3].filter((c) => c !== c0);
    for (let mask = 0; mask < 8; mask++) {
      const use = others.filter((_, i) => mask & (1 << i));
      if (use.some((c) => cnt[c][n0] === 0)) continue;
      for (let j = 0; j <= Math.min(w, 3 - use.length); j++) {
        const size = 1 + use.length + j;
        if (size < 3 || size > 4) continue;
        cnt[c0][n0]--; use.forEach((c) => cnt[c][n0]--);
        best = Math.max(best, size + rec(w - j));
        cnt[c0][n0]++; use.forEach((c) => cnt[c][n0]++);
      }
    }
    // Seri (n0'dan başlayarak)
    const used: number[] = [];
    let ww = w;
    cnt[c0][n0]--; used.push(n0);
    for (let pos = n0 + 1; pos <= 14; pos++) {
      const real = pos === 14 ? 1 : pos;
      if (cnt[c0][real] > 0 && !(pos === 14 && used.includes(1))) { cnt[c0][real]--; used.push(real); }
      else if (ww > 0) { ww--; used.push(-1); }
      else break;
      if (used.length >= 3) best = Math.max(best, used.length + rec(ww));
    }
    for (const u of used) if (u > 0) cnt[c0][u]++;
    memo.set(k, best);
    return best;
  };
  return rec(wild);
}

export interface OkeyState {
  game: 'okey';
  n: 4;
  hands: number[][];
  pile: number[];
  discards: number[][];
  indicator: number;
  okey: Okey;
  dealer: number;
  turn: number;
  phase: 'draw' | 'discard' | 'over';
  hasDiscarded: boolean[];
  shown: number | null;
  scores: number[];
  handNo: number;
  totalHands: number;
  lastHand: { winner: number | null; kind: string; points: number } | null;
  log: { seat: number; text: string }[];
}

export type OkeyAction =
  | { type: 'draw'; from: 'pile' | 'discard' }
  | { type: 'discard'; tile: number }
  | { type: 'finish'; tile: number }
  | { type: 'show' };

export interface OkeyView extends Omit<OkeyState, 'hands' | 'pile'> {
  me: number | null;
  hand: number[];
  handCounts: number[];
  pileCount: number;
  legal: OkeyAction[];
}

function deal(s: OkeyState, rng: Rng) {
  const all = shuffle([...Array(106).keys()], rng);
  let ind = all.pop()!;
  while (ind >= 104) { all.unshift(ind); ind = all.pop()!; } // sahte okey gösterge olamaz
  s.indicator = ind;
  s.okey = okeyOf(ind);
  s.hands = [0, 1, 2, 3].map((p) => all.splice(0, p === s.dealer ? 15 : 14));
  s.pile = all;
  s.discards = [[], [], [], []];
  s.turn = s.dealer;
  s.phase = 'discard';
  s.hasDiscarded = [false, false, false, false];
  s.shown = null;
  s.log = [];
}

const prevSeat = (seat: number) => (seat + 3) % 4;

function clone(s: OkeyState): OkeyState {
  return { ...s, hands: s.hands.map((h) => h.slice()), pile: s.pile.slice(), discards: s.discards.map((d) => d.slice()), hasDiscarded: s.hasDiscarded.slice(), scores: s.scores.slice(), log: s.log.slice() };
}

function endHand(s: OkeyState, rng: Rng, winner: number | null, kind: string, points: number) {
  if (winner !== null) for (let p = 0; p < 4; p++) if (p !== winner) s.scores[p] -= points;
  s.lastHand = { winner, kind, points };
  if (s.handNo >= s.totalHands || s.scores.some((v) => v <= 0)) { s.phase = 'over'; return; }
  s.handNo++;
  s.dealer = (s.dealer + 1) % 4;
  deal(s, rng);
}

export const OkeyGame: GameModule<OkeyState, OkeyAction, OkeyView> = {
  id: 'okey',
  name: 'Okey',
  playerCounts: [4],
  options: [{ key: 'hands', label: 'El sayısı', default: 3, choices: [1, 3, 5, 10].map((v) => ({ value: v, label: `${v} el` })) }],

  setup(cfg, rng) {
    if (cfg.players !== 4) throw new IllegalMoveError('Okey 4 kişiyle oynanır');
    const s = { game: 'okey', n: 4, dealer: rng.int(4), scores: [20, 20, 20, 20], handNo: 1, totalHands: Number(cfg.options?.hands ?? 3), lastHand: null } as unknown as OkeyState;
    deal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'draw') {
      const acts: OkeyAction[] = [{ type: 'draw', from: 'pile' }];
      if (s.discards[prevSeat(seat)].length) acts.push({ type: 'draw', from: 'discard' });
      return acts;
    }
    const acts: OkeyAction[] = s.hands[seat].map((tile) => ({ type: 'discard' as const, tile }));
    for (const tile of new Set(s.hands[seat])) {
      const rest = s.hands[seat].slice(); rest.splice(rest.indexOf(tile), 1);
      if (isWinningHand(rest, s.okey)) acts.push({ type: 'finish', tile });
    }
    if (!s.hasDiscarded[seat] && s.shown === null && s.hands[seat].some((t) => t !== s.indicator && t < 104 && tileColor(t) === tileColor(s.indicator) && tileNum(t) === tileNum(s.indicator))) acts.push({ type: 'show' });
    return acts;
  },

  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    if (s.phase === 'draw') {
      if (a?.type !== 'draw') throw new IllegalMoveError('Önce taş çekin');
      if (a.from === 'discard') {
        const d = s.discards[prevSeat(seat)];
        if (!d.length) throw new IllegalMoveError('Yanda taş yok');
        s.hands[seat].push(d.pop()!);
        s.log.push({ seat, text: 'yandan aldı' });
      } else {
        if (!s.pile.length) { endHand(s, rng, null, 'Ortada taş kalmadı', 0); return s; }
        s.hands[seat].push(s.pile.pop()!);
      }
      s.phase = 'discard';
      return s;
    }
    if (a?.type === 'show') {
      if (!OkeyGame.legalActions(s0, seat).some((x) => x.type === 'show')) throw new IllegalMoveError('Gösterge gösterilemez');
      s.shown = seat;
      for (let p = 0; p < 4; p++) if (p !== seat) s.scores[p] -= 1;
      s.log.push({ seat, text: 'göstergeyi gösterdi' });
      return s;
    }
    if (a?.type !== 'discard' && a?.type !== 'finish') throw new IllegalMoveError('Bir taş atmalısınız');
    const k = s.hands[seat].indexOf(a.tile);
    if (k < 0) throw new IllegalMoveError('Bu taş elinizde yok');
    s.hands[seat].splice(k, 1);
    s.discards[seat].push(a.tile);
    s.hasDiscarded[seat] = true;
    if (a.type === 'finish') {
      const kind = isWinningHand(s.hands[seat], s.okey);
      if (!kind) throw new IllegalMoveError('Eliniz bitmiyor: tüm taşlar per veya 7 çift olmalı');
      const okeyDiscard = isWild(a.tile, s.okey);
      const pts = (kind === 'cift' ? 4 : 2) * (okeyDiscard ? 2 : 1);
      s.log.push({ seat, text: 'bitirdi' });
      endHand(s, rng, seat, `${kind === 'cift' ? 'Çifte bitiş' : 'Bitiş'}${okeyDiscard ? ' (okey atarak)' : ''}`, pts);
      return s;
    }
    s.turn = (seat + 1) % 4;
    s.phase = 'draw';
    return s;
  },

  view(s, seat) {
    const { hands, pile, ...rest } = s;
    return { ...rest, discards: s.discards.map((d) => d.slice()), scores: s.scores.slice(), log: s.log.slice(-8), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), pileCount: pile.length, legal: seat === null ? [] : OkeyGame.legalActions(s, seat) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const max = Math.max(...s.scores);
    const winners = s.scores.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
    return { winners, scores: s.scores.slice(), summary: s.lastHand?.kind ?? '' };
  },
  ai(v, seat, d, rng) { return okeyAi(v, seat, d, rng); },
};

/** Elin değeri: perdeki taş sayısı + ikili yakınlıklar (YZ). */
export function handValue(ids: number[], ok: Okey): number {
  let v = meldCoverage(ids, ok) * 10;
  const vals = ids.map((t) => valueOf(t, ok)).filter(Boolean) as [number, number][];
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
    const [c1, n1] = vals[i], [c2, n2] = vals[j];
    if (c1 === c2 && Math.abs(n1 - n2) <= 2 && n1 !== n2) v += 1.2;
    if (n1 === n2 && c1 !== c2) v += 1.2;
    if (n1 === n2 && c1 === c2) v += 0.8;
  }
  return v + ids.filter((t) => isWild(t, ok)).length * 6;
}

export function okeyAi(v: OkeyView, seat: number, d: Difficulty, rng: Rng): OkeyAction {
  const fin = v.legal.find((a) => a.type === 'finish');
  if (fin) {
    // Okey atarak bitirmek iki kat puan
    const okeyFinish = v.legal.find((a) => a.type === 'finish' && isWild(a.tile, v.okey));
    return okeyFinish ?? fin;
  }
  if (v.legal.some((a) => a.type === 'show') && d !== 'kolay') return { type: 'show' };
  if (v.phase === 'draw') {
    const top = v.discards[prevSeat(seat)][v.discards[prevSeat(seat)].length - 1];
    if (top !== undefined) {
      if (isWild(top, v.okey)) return { type: 'draw', from: 'discard' };
      if (d !== 'kolay') {
        const best = (hand: number[]) => Math.max(...hand.map((t, i) => handValue(hand.filter((_, j) => j !== i), v.okey)));
        if (best([...v.hand, top]) > handValue(v.hand, v.okey) + 4) return { type: 'draw', from: 'discard' };
      }
    }
    return { type: 'draw', from: 'pile' };
  }
  const cand = [...new Set(v.hand)].filter((t) => !isWild(t, v.okey));
  if (d === 'kolay' && rng.int(3) === 0) return { type: 'discard', tile: cand[rng.int(cand.length)] };
  let best = cand[0], bv = -Infinity;
  const nextSeat = (seat + 1) % 4;
  for (const t of cand) {
    const rest = v.hand.slice(); rest.splice(rest.indexOf(t), 1);
    let val = handValue(rest, v.okey);
    // Zor: sonraki oyuncunun aldığı taşlara yarayan taşı atma
    if (d === 'zor') {
      const tv = valueOf(t, v.okey);
      const taken = v.discards[nextSeat];
      if (tv && taken.some((x) => { const xv = valueOf(x, v.okey); return xv && ((xv[0] === tv[0] && Math.abs(xv[1] - tv[1]) <= 1) || xv[1] === tv[1]); })) val -= 3;
    }
    val += rng.int(2) * 0.1;
    if (val > bv) { bv = val; best = t; }
  }
  return { type: 'discard', tile: best };
}
