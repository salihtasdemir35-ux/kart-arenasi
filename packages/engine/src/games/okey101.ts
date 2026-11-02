import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';
import { isWild, okeyOf, tileColor, tileNum, valueOf, type Okey } from './okey';

/**
 * 101 OKEY (TEKLİ) — uygulanan kurallar
 * - Okey ile aynı 106 taş, gösterge ve okey. 4 oyuncu; dağıtan 22, diğerleri 21 taş alır, dağıtan atarak başlar.
 * - Tur: ortadan veya solundakinin attığı taşı çek → (isteğe bağlı) el aç / per ekle / işle → bir taş at.
 * - El açma: perlerin (seri ya da grup, en az 3 taş) sayı toplamı en az 101 olmalı YA DA en az 5 çift.
 *   Okey temsil ettiği taşın sayısını alır. Açtıktan sonraki turlarda yeni per eklenebilir (çift açan çift ekler).
 * - İşleme: yalnızca el açmış oyuncu, masadaki herhangi bir pere (çift hariç) taş ekleyebilir.
 * - Yandan alınan taş aynı turda el açmada ya da işlemede kullanılmak zorundadır.
 * - Cezalar (puanlar ceza; düşük olan kazanır):
 *   • İşlenebilecek bir taşı atmak +101 • Okey atmak (bitirmeden) +101
 *   • El sonunda: elini açmayan +202; açan elinde kalan taşların sayı toplamı (okey 101 sayılır); çift açan ×2.
 *   • Bitiren −101; okey atarak bitirirse −202 ve diğerlerinin cezaları ×2.
 * - Yandan alınan taş kullanılamıyorsa geri bırakılır ve ortadan çekilir (oyunun kilitlenmemesi için).
 * - Ortada taş kalmazsa el biter (bitiren yok). Seçilen el sayısı sonunda en düşük toplam kazanır.
 * - Basitleştirme: masadaki perde duran okeyi gerçek taşla değiştirip geri alma uygulanmaz.
 */

export interface Meld { owner: number; tiles: number[]; kind: 'seri' | 'grup' | 'cift' }

/** Taşların geçerli bir per olup olmadığı ve sayı değeri (jokerlerin en yüksek değerli yerleşimi). */
export function meldInfo(tiles: number[], ok: Okey): { kind: 'seri' | 'grup'; points: number } | null {
  if (tiles.length < 3) return null;
  const vals = tiles.map((t) => valueOf(t, ok));
  const reals = vals.filter(Boolean) as [number, number][];
  const w = vals.length - reals.length;
  if (reals.length === 0) return null;
  // Grup: aynı sayı, farklı renk, 3–4 taş
  if (tiles.length <= 4 && reals.every((r) => r[1] === reals[0][1]) && new Set(reals.map((r) => r[0])).size === reals.length) {
    return { kind: 'grup', points: reals[0][1] * tiles.length };
  }
  // Seri: aynı renk; konumlar 1..14 (14 = 13'ten sonraki 1)
  if (!reals.every((r) => r[0] === reals[0][0])) return null;
  const nums = reals.map((r) => r[1]);
  let best: number | null = null;
  for (const useHigh of [false, true]) {
    const pos = nums.map((n) => (useHigh && n === 1 ? 14 : n)).sort((a, b) => a - b);
    if (new Set(pos).size !== pos.length) continue;
    const span = pos[pos.length - 1] - pos[0] + 1;
    const gaps = span - pos.length;
    if (gaps > w) continue;
    const extra = w - gaps;
    // Kalan jokerler uçlara: önce yukarı (daha çok puan), sınır 14
    for (let up = extra; up >= 0; up--) {
      const lo = pos[0] - (extra - up), hi = pos[pos.length - 1] + up;
      if (lo < 1 || hi > 14) continue;
      if (useHigh === false && hi === 14) continue; // 14 yalnızca 1'in yüksek kullanımı içindir
      let pts = 0;
      for (let p = lo; p <= hi; p++) pts += p === 14 ? 1 : p;
      if (best === null || pts > best) best = pts;
    }
  }
  return best === null ? null : { kind: 'seri', points: best };
}

const isPair = (a: number, b: number, ok: Okey) => {
  const va = valueOf(a, ok), vb = valueOf(b, ok);
  return !va || !vb || (va[0] === vb[0] && va[1] === vb[1]);
};

/** Elden en yüksek puanlı ayrık per kümesini bulur (YZ ve açma önerisi). */
export function bestMelds(ids: number[], ok: Okey, limit = 20000): { melds: number[][]; points: number } {
  // Aday perler: tüm geçerli 3–5 taşlık alt kümeleri saymak yerine renk/sayı yapısından üret
  const byVal = new Map<string, number[]>();
  const wilds = ids.filter((t) => isWild(t, ok));
  for (const t of ids) { const v = valueOf(t, ok); if (v) byVal.set(v.join(','), [...(byVal.get(v.join(',')) ?? []), t]); }
  const cands: number[][] = [];
  // Gruplar
  for (let n = 1; n <= 13; n++) {
    const cols = [0, 1, 2, 3].filter((c) => byVal.has(`${c},${n}`));
    const subsets = (arr: number[]) => arr.reduce<number[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
    for (const sub of subsets(cols)) for (let j = 0; j <= wilds.length; j++) {
      const size = sub.length + j;
      if (size >= 3 && size <= 4 && sub.length >= 1) cands.push([...sub.map((c) => byVal.get(`${c},${n}`)![0]), ...wilds.slice(0, j)]);
    }
  }
  // Seriler
  for (let c = 0; c < 4; c++) for (let s = 1; s <= 12; s++) for (let e = s + 2; e <= Math.min(14, s + 12); e++) {
    const tiles: number[] = [];
    let need = 0;
    for (let p = s; p <= e; p++) { const n = p === 14 ? 1 : p; const t = byVal.get(`${c},${n}`)?.[0]; if (t !== undefined) tiles.push(t); else need++; }
    if (need <= wilds.length && tiles.length >= 1 && need <= 2) cands.push([...tiles, ...wilds.slice(0, need)]);
  }
  const valid = cands.map((m) => ({ m, info: meldInfo(m, ok) })).filter((x) => x.info).map((x) => ({ m: x.m, p: x.info!.points }));
  valid.sort((a, b) => b.p - a.p);
  let best = { melds: [] as number[][], points: 0 };
  let budget = limit;
  const used = new Set<number>();
  const rec = (i: number, cur: number[][], pts: number) => {
    if (--budget < 0) return;
    if (pts > best.points) best = { melds: cur.slice(), points: pts };
    for (let k = i; k < valid.length; k++) {
      const { m, p } = valid[k];
      // Aynı değerdeki ikinci kopyayı da deneyebilmek için kullanılmış taş yerine eşini koy
      const fixed: number[] = [];
      let ok2 = true;
      for (const t of m) {
        if (!used.has(t) && !fixed.includes(t)) { fixed.push(t); continue; }
        const v = valueOf(t, ok);
        const alt = ids.find((x) => !used.has(x) && !fixed.includes(x) && (v ? valueOf(x, ok)?.join() === v.join() : isWild(x, ok)));
        if (alt === undefined) { ok2 = false; break; }
        fixed.push(alt);
      }
      if (!ok2) continue;
      fixed.forEach((t) => used.add(t));
      cur.push(fixed);
      rec(k + 1, cur, pts + p);
      cur.pop();
      fixed.forEach((t) => used.delete(t));
    }
  };
  rec(0, [], 0);
  return best;
}

export function findPairs(ids: number[], ok: Okey): number[][] {
  const pairs: number[][] = [];
  const left = ids.filter((t) => !isWild(t, ok));
  const wilds = ids.filter((t) => isWild(t, ok));
  const seen = new Set<number>();
  for (const a of left) {
    if (seen.has(a)) continue;
    const b = left.find((x) => x !== a && !seen.has(x) && isPair(a, x, ok));
    if (b !== undefined) { seen.add(a); seen.add(b); pairs.push([a, b]); }
  }
  for (const wd of wilds) { const a = left.find((x) => !seen.has(x)); if (a !== undefined) { seen.add(a); pairs.push([a, wd]); } }
  return pairs;
}

export interface O101State {
  game: 'okey101';
  n: 4;
  hands: number[][];
  pile: number[];
  discards: number[][];
  indicator: number;
  okey: Okey;
  dealer: number;
  turn: number;
  phase: 'draw' | 'play' | 'over';
  opened: (null | 'per' | 'cift')[];
  melds: Meld[];
  taken: number | null;
  scores: number[];
  handNo: number;
  totalHands: number;
  lastHand: { winner: number | null; deltas: number[]; note: string } | null;
  log: { seat: number; text: string }[];
}

export type O101Action =
  | { type: 'draw'; from: 'pile' | 'discard' }
  | { type: 'open'; melds: number[][] }
  | { type: 'process'; tile: number; meld: number }
  | { type: 'discard'; tile: number }
  | { type: 'undoTake' };

export interface O101View extends Omit<O101State, 'hands' | 'pile'> {
  me: number | null;
  hand: number[];
  handCounts: number[];
  pileCount: number;
  legal: O101Action[];
}

const prevSeat = (s: number) => (s + 3) % 4;

function deal(s: O101State, rng: Rng) {
  const all = shuffle([...Array(106).keys()], rng);
  let ind = all.pop()!;
  while (ind >= 104) { all.unshift(ind); ind = all.pop()!; }
  s.indicator = ind;
  s.okey = okeyOf(ind);
  s.hands = [0, 1, 2, 3].map((p) => all.splice(0, p === s.dealer ? 22 : 21));
  s.pile = all;
  s.discards = [[], [], [], []];
  s.turn = s.dealer;
  s.phase = 'play';
  s.opened = [null, null, null, null];
  s.melds = [];
  s.taken = null;
  s.log = [];
}

function clone(s: O101State): O101State {
  return { ...s, hands: s.hands.map((h) => h.slice()), pile: s.pile.slice(), discards: s.discards.map((d) => d.slice()), opened: s.opened.slice(), melds: s.melds.map((m) => ({ ...m, tiles: m.tiles.slice() })), scores: s.scores.slice(), log: s.log.slice() };
}

/** Taş masadaki bir pere işlenebilir mi? */
export function processable(melds: Meld[], tile: number, ok: Okey): number[] {
  const out: number[] = [];
  melds.forEach((m, i) => { if (m.kind !== 'cift' && meldInfo([...m.tiles, tile], ok)) out.push(i); });
  return out;
}

function handPenalty(s: O101State, p: number) {
  if (!s.opened[p]) return 202;
  const sum = s.hands[p].reduce((t, x) => t + (isWild(x, s.okey) ? 101 : x >= 104 ? s.okey.n : tileNum(x)), 0);
  return s.opened[p] === 'cift' ? sum * 2 : sum;
}

function endHand(s: O101State, rng: Rng, winner: number | null, okeyFinish: boolean) {
  const deltas = [0, 0, 0, 0];
  for (let p = 0; p < 4; p++) {
    if (p === winner) deltas[p] = okeyFinish ? -202 : -101;
    else deltas[p] = handPenalty(s, p) * (okeyFinish ? 2 : 1);
  }
  deltas.forEach((d, p) => (s.scores[p] += d));
  s.lastHand = { winner, deltas, note: winner === null ? 'Ortada taş kalmadı' : okeyFinish ? 'Okey atarak bitirdi' : 'Elini bitirdi' };
  if (s.handNo >= s.totalHands) { s.phase = 'over'; return; }
  s.handNo++;
  s.dealer = (s.dealer + 1) % 4;
  deal(s, rng);
}

function removeTiles(hand: number[], tiles: number[]) {
  const h = hand.slice();
  for (const t of tiles) { const k = h.indexOf(t); if (k < 0) throw new IllegalMoveError('Bu taş elinizde yok'); h.splice(k, 1); }
  return h;
}

export const Okey101: GameModule<O101State, O101Action, O101View> = {
  id: 'okey101',
  name: '101 Okey',
  playerCounts: [4],
  options: [{ key: 'hands', label: 'El sayısı', default: 3, choices: [1, 3, 5, 9].map((v) => ({ value: v, label: `${v} el` })) }],

  setup(cfg, rng) {
    if (cfg.players !== 4) throw new IllegalMoveError('101 Okey 4 kişiyle oynanır');
    const s = { game: 'okey101', n: 4, dealer: rng.int(4), scores: [0, 0, 0, 0], handNo: 1, totalHands: Number(cfg.options?.hands ?? 3), lastHand: null } as unknown as O101State;
    deal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'draw') {
      const a: O101Action[] = [{ type: 'draw', from: 'pile' }];
      if (s.discards[prevSeat(seat)].length) a.push({ type: 'draw', from: 'discard' });
      return a;
    }
    // Açma/işleme sayısız kombinasyon olduğundan listelenmez; atış seçenekleri listelenir
    if (s.taken !== null && s.hands[seat].includes(s.taken)) return [{ type: 'undoTake' }];
    return [...new Set(s.hands[seat])].map((tile) => ({ type: 'discard' as const, tile }));
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
        const t = d.pop()!;
        s.hands[seat].push(t);
        s.taken = t;
        s.log.push({ seat, text: 'yandan aldı' });
      } else {
        if (!s.pile.length) { endHand(s, rng, null, false); return s; }
        s.hands[seat].push(s.pile.pop()!);
        s.taken = null;
      }
      s.phase = 'play';
      return s;
    }
    if (a?.type === 'undoTake') {
      if (s.taken === null || !s.hands[seat].includes(s.taken)) throw new IllegalMoveError('Geri bırakılacak taş yok');
      s.hands[seat] = removeTiles(s.hands[seat], [s.taken]);
      s.discards[prevSeat(seat)].push(s.taken);
      s.taken = null;
      if (!s.pile.length) { endHand(s, rng, null, false); return s; }
      s.hands[seat].push(s.pile.pop()!);
      s.log.push({ seat, text: 'yandan aldığını geri bıraktı' });
      return s;
    }
    if (a?.type === 'open') {
      if (!Array.isArray(a.melds) || !a.melds.length) throw new IllegalMoveError('Açılacak perleri seçin');
      const flat = a.melds.flat();
      if (new Set(flat).size !== flat.length) throw new IllegalMoveError('Aynı taş iki kez kullanılamaz');
      const rest = removeTiles(s.hands[seat], flat);
      const already = s.opened[seat];
      const pairMode = a.melds.every((m) => m.length === 2);
      if (pairMode) {
        if (already === 'per') throw new IllegalMoveError('Per ile açan çift ekleyemez');
        if (!a.melds.every(([x, y]) => isPair(x, y, s.okey))) throw new IllegalMoveError('Çiftler aynı renk ve sayıda olmalı');
        if (!already && a.melds.length < 5) throw new IllegalMoveError('Çiftle açmak için en az 5 çift gerekir');
        a.melds.forEach((m) => s.melds.push({ owner: seat, tiles: m, kind: 'cift' }));
        s.opened[seat] = 'cift';
      } else {
        if (already === 'cift') throw new IllegalMoveError('Çift ile açan per ekleyemez');
        let total = 0;
        const infos = a.melds.map((m) => { const i = meldInfo(m, s.okey); if (!i) throw new IllegalMoveError('Geçersiz per: aynı renk ardışık ya da aynı sayı farklı renk, en az 3 taş'); total += i.points; return i; });
        if (!already && total < 101) throw new IllegalMoveError(`Açmak için en az 101 gerekir (şu an ${total})`);
        a.melds.forEach((m, k) => s.melds.push({ owner: seat, tiles: m, kind: infos[k].kind }));
        s.opened[seat] = 'per';
      }
      s.hands[seat] = rest;
      if (s.taken !== null && flat.includes(s.taken)) s.taken = null;
      s.log.push({ seat, text: already ? 'per ekledi' : 'elini açtı' });
      if (rest.length === 0) endHand(s, rng, seat, false);
      return s;
    }
    if (a?.type === 'process') {
      if (!s.opened[seat]) throw new IllegalMoveError('İşlemek için önce elinizi açmalısınız');
      const m = s.melds[a.meld];
      if (!m || m.kind === 'cift') throw new IllegalMoveError('Bu pere taş işlenemez');
      if (!meldInfo([...m.tiles, a.tile], s.okey)) throw new IllegalMoveError('Taş bu pere uymuyor');
      s.hands[seat] = removeTiles(s.hands[seat], [a.tile]);
      m.tiles.push(a.tile);
      if (s.taken === a.tile) s.taken = null;
      if (s.hands[seat].length === 0) endHand(s, rng, seat, false);
      return s;
    }
    if (a?.type !== 'discard') throw new IllegalMoveError('Geçersiz hamle');
    if (s.taken !== null && s.hands[seat].includes(s.taken)) throw new IllegalMoveError('Yandan aldığınız taşı bu turda açmada ya da işlemede kullanmalısınız');
    s.hands[seat] = removeTiles(s.hands[seat], [a.tile]);
    s.discards[seat].push(a.tile);
    s.taken = null;
    if (s.hands[seat].length === 0) { endHand(s, rng, seat, isWild(a.tile, s.okey)); return s; }
    if (isWild(a.tile, s.okey)) { s.scores[seat] += 101; s.log.push({ seat, text: 'okey attı (+101)' }); }
    else if (processable(s.melds, a.tile, s.okey).length) { s.scores[seat] += 101; s.log.push({ seat, text: 'işlek taş attı (+101)' }); }
    s.turn = (seat + 1) % 4;
    s.phase = 'draw';
    return s;
  },

  view(s, seat) {
    const { hands, pile, ...rest } = s;
    return { ...rest, discards: s.discards.map((d) => d.slice()), melds: s.melds.map((m) => ({ ...m, tiles: m.tiles.slice() })), opened: s.opened.slice(), scores: s.scores.slice(), log: s.log.slice(-8), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), pileCount: pile.length, legal: seat === null ? [] : Okey101.legalActions(s, seat) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const min = Math.min(...s.scores);
    return { winners: s.scores.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0), scores: s.scores.slice(), lowerIsBetter: true, summary: 'En düşük ceza puanı kazanır' };
  },
  ai(v, seat, d, rng) { return okey101Ai(v, seat, d, rng); },
};

export function okey101Ai(v: O101View, seat: number, d: Difficulty, rng: Rng): O101Action {
  const ok = v.okey;
  if (v.phase === 'draw') {
    const top = v.discards[prevSeat(seat)].slice(-1)[0];
    if (top !== undefined && d !== 'kolay') {
      // Yandan alıp hemen kullanabiliyorsak al
      if (v.opened[seat] === 'per' && processable(v.melds, top, ok).length) return { type: 'draw', from: 'discard' };
      if (!v.opened[seat]) {
        const withTop = bestMelds([...v.hand, top], ok, 6000);
        if (withTop.points >= 101 && withTop.melds.some((m) => m.includes(top))) return { type: 'draw', from: 'discard' };
      }
    }
    return { type: 'draw', from: 'pile' };
  }
  // Açma
  if (!v.opened[seat]) {
    const best = bestMelds(v.hand, ok, d === 'kolay' ? 3000 : 15000);
    if (best.points >= 101 && (v.taken === null || best.melds.flat().includes(v.taken))) return { type: 'open', melds: best.melds };
    const pairs = findPairs(v.hand, ok);
    if (d === 'zor' && pairs.length >= 5 && best.points < 101 && (v.taken === null || pairs.flat().includes(v.taken))) return { type: 'open', melds: pairs };
  } else if (v.opened[seat] === 'per') {
    const more = bestMelds(v.hand, ok, 4000);
    if (more.melds.length && v.hand.length - more.melds.flat().length >= 1) return { type: 'open', melds: more.melds };
    for (const t of v.hand) { const ms = processable(v.melds, t, ok); if (ms.length && v.hand.length > 1) return { type: 'process', tile: t, meld: ms[0] }; }
  } else {
    const pairs = findPairs(v.hand, ok);
    if (pairs.length && v.hand.length - pairs.flat().length >= 1) return { type: 'open', melds: pairs };
  }
  if (v.taken !== null && v.hand.includes(v.taken)) {
    // Kullanamadığımız yandan alınmış taşı işleme şansı yok: kural gereği önce kullanılmalı.
    // Bu durumda (YZ yanlış değerlendirdiyse) kullanılabilir bir pere işlemeyi dene
    const ms = v.opened[seat] === 'per' ? processable(v.melds, v.taken, ok) : [];
    if (ms.length) return { type: 'process', tile: v.taken, meld: ms[0] };
    return { type: 'undoTake' };
  }
  // Atış: işlek olmayan, okey olmayan, en yüksek sayılı ve en az perde kullanılan taş
  const keep = new Set(bestMelds(v.hand, ok, 3000).melds.flat());
  const cands = [...new Set(v.hand)].filter((t) => !isWild(t, ok) && !processable(v.melds, t, ok).length);
  const pool = cands.length ? cands : [...new Set(v.hand)];
  const score = (t: number) => (keep.has(t) ? -100 : 0) + (t >= 104 ? ok.n : tileNum(t)) + (d === 'kolay' ? rng.int(10) : 0);
  return { type: 'discard', tile: pool.sort((a, b) => score(b) - score(a))[0] };
}

export { tileColor };
