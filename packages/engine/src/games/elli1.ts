import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * 51 (İSKAMBİL İLE EL AÇMA) — uygulanan kurallar
 * - 2 deste + 4 joker (108 kart), 2–4 oyuncu. İlk oyuncu 15, diğerleri 14 kart alır; ilk oyuncu atarak başlar.
 * - Tur: desteden ya da önceki oyuncunun attığı karttan çek → (isteğe bağlı) el aç / per ekle / işle → bir kart at.
 * - Per: aynı renkte (takım) ardışık en az 3 kart ya da aynı değerde farklı takımlardan 3–4 kart.
 *   As, A-2-3'te 1, Q-K-A'da ve gruplarda 11 sayılır. K-A-2 gibi dönen seri yoktur.
 * - Değerler: 2–10 kendi sayısı, J/Q/K 10, As 1 ya da 11. Joker temsil ettiği kartın değerini alır.
 * - El açma: perlerin toplamı en az 51 olmalı. Açtıktan sonra per eklenebilir ve masadaki perlere işlenebilir.
 * - Önceki oyuncunun attığı kart alınırsa aynı turda açmada ya da işlemede kullanılmalı; kullanılamazsa geri bırakılır
 *   ve desteden çekilir.
 * - Joker atmak +51 cezadır (bitiren son kart hariç).
 * - El sonu cezaları: bitiren −51; elini açmayan +102; açan elindeki kartların toplamı (joker 25, As 11).
 * - Deste biterse el bitiren olmadan biter. Seçilen el sayısı sonunda en düşük toplam kazanır.
 */

export const JOKERS = [104, 105, 106, 107];
export const isJoker = (id: number) => id >= 104;
export const cardSuit = (id: number) => Math.floor((id % 52) / 13); // 0 maça, 1 kupa, 2 karo, 3 sinek
export const cardRank = (id: number) => (id % 13) + 1; // 1 = As
const SUIT_LETTER = ['S', 'H', 'D', 'C'];
/** Arayüzdeki iskambil bileşeni için "S14" biçimi (As = 14). */
export const cardCode = (id: number) => SUIT_LETTER[cardSuit(id)] + (cardRank(id) === 1 ? 14 : cardRank(id));
const faceValue = (pos: number) => (pos === 1 ? 1 : pos === 14 ? 11 : pos >= 11 ? 10 : pos);

export interface CardMeld { owner: number; cards: number[]; kind: 'seri' | 'grup' }

export function meld51(cards: number[]): { kind: 'seri' | 'grup'; points: number } | null {
  if (cards.length < 3) return null;
  const reals = cards.filter((c) => !isJoker(c));
  const w = cards.length - reals.length;
  if (!reals.length) return null;
  const r0 = cardRank(reals[0]);
  if (cards.length <= 4 && reals.every((c) => cardRank(c) === r0) && new Set(reals.map(cardSuit)).size === reals.length) {
    return { kind: 'grup', points: (r0 === 1 ? 11 : faceValue(r0)) * cards.length };
  }
  if (!reals.every((c) => cardSuit(c) === cardSuit(reals[0]))) return null;
  let best: number | null = null;
  for (const aceHigh of [false, true]) {
    const pos = reals.map((c) => (cardRank(c) === 1 && aceHigh ? 14 : cardRank(c))).sort((a, b) => a - b);
    if (new Set(pos).size !== pos.length) continue;
    const gaps = pos[pos.length - 1] - pos[0] + 1 - pos.length;
    if (gaps > w) continue;
    const extra = w - gaps;
    for (let up = extra; up >= 0; up--) {
      const lo = pos[0] - (extra - up), hi = pos[pos.length - 1] + up;
      if (lo < 1 || hi > 14) continue;
      if (lo === 1 && hi === 14) continue; // As iki uçta birden olamaz
      let pts = 0;
      for (let p = lo; p <= hi; p++) pts += faceValue(p === 1 && hi > 3 && lo === 1 ? 1 : p);
      if (best === null || pts > best) best = pts;
    }
  }
  return best === null ? null : { kind: 'seri', points: best };
}

export function best51(cards: number[], limit = 15000): { melds: number[][]; points: number } {
  const jokers = cards.filter(isJoker);
  const by = new Map<string, number[]>();
  for (const c of cards) if (!isJoker(c)) { const k = `${cardSuit(c)},${cardRank(c)}`; by.set(k, [...(by.get(k) ?? []), c]); }
  const cands: number[][] = [];
  for (let r = 1; r <= 13; r++) {
    const suits = [0, 1, 2, 3].filter((s) => by.has(`${s},${r}`));
    const subsets = suits.reduce<number[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
    for (const sub of subsets) for (let j = 0; j <= Math.min(2, jokers.length); j++) {
      const size = sub.length + j;
      if (size >= 3 && size <= 4 && sub.length) cands.push([...sub.map((s) => by.get(`${s},${r}`)![0]), ...jokers.slice(0, j)]);
    }
  }
  for (let s = 0; s < 4; s++) for (let a = 1; a <= 12; a++) for (let b = a + 2; b <= 14; b++) {
    if (a === 1 && b === 14) continue;
    const got: number[] = [];
    let need = 0;
    for (let p = a; p <= b; p++) { const r = p === 14 ? 1 : p; const c = by.get(`${s},${r}`)?.[0]; if (c !== undefined) got.push(c); else need++; }
    if (got.length && need <= Math.min(2, jokers.length)) cands.push([...got, ...jokers.slice(0, need)]);
  }
  const valid = cands.map((m) => ({ m, i: meld51(m) })).filter((x) => x.i).map((x) => ({ m: x.m, p: x.i!.points })).sort((a, b) => b.p - a.p);
  let best = { melds: [] as number[][], points: 0 };
  let budget = limit;
  const used = new Set<number>();
  const rec = (i: number, cur: number[][], pts: number) => {
    if (--budget < 0) return;
    if (pts > best.points) best = { melds: cur.slice(), points: pts };
    for (let k = i; k < valid.length; k++) {
      const fixed: number[] = [];
      let ok = true;
      for (const c of valid[k].m) {
        if (!used.has(c) && !fixed.includes(c)) { fixed.push(c); continue; }
        const alt = cards.find((x) => !used.has(x) && !fixed.includes(x) && (isJoker(c) ? isJoker(x) : !isJoker(x) && cardSuit(x) === cardSuit(c) && cardRank(x) === cardRank(c)));
        if (alt === undefined) { ok = false; break; }
        fixed.push(alt);
      }
      if (!ok) continue;
      fixed.forEach((c) => used.add(c));
      cur.push(fixed);
      rec(k + 1, cur, pts + valid[k].p);
      cur.pop();
      fixed.forEach((c) => used.delete(c));
    }
  };
  rec(0, [], 0);
  return best;
}

export const processable51 = (melds: CardMeld[], card: number) => melds.map((m, i) => (meld51([...m.cards, card]) ? i : -1)).filter((i) => i >= 0);

export interface E51State {
  game: 'elli1';
  n: number;
  hands: number[][];
  pile: number[];
  discard: number[];
  turn: number;
  first: number;
  phase: 'draw' | 'play' | 'over';
  opened: boolean[];
  melds: CardMeld[];
  taken: number | null;
  scores: number[];
  handNo: number;
  totalHands: number;
  lastHand: { winner: number | null; deltas: number[]; note: string } | null;
  log: { seat: number; text: string }[];
}
export type E51Action = { type: 'draw'; from: 'pile' | 'discard' } | { type: 'open'; melds: number[][] } | { type: 'process'; card: number; meld: number } | { type: 'discard'; card: number } | { type: 'undoTake' };
export interface E51View extends Omit<E51State, 'hands' | 'pile'> { me: number | null; hand: number[]; handCounts: number[]; pileCount: number; legal: E51Action[] }

function deal(s: E51State, rng: Rng) {
  const deck = shuffle([...Array(108).keys()], rng);
  s.hands = Array.from({ length: s.n }, (_, p) => deck.splice(0, p === s.first ? 15 : 14));
  s.pile = deck;
  s.discard = [];
  s.turn = s.first;
  s.phase = 'play';
  s.opened = new Array(s.n).fill(false);
  s.melds = [];
  s.taken = null;
  s.log = [];
}
const cardPenalty = (c: number) => (isJoker(c) ? 25 : cardRank(c) === 1 ? 11 : faceValue(cardRank(c)));
function clone(s: E51State): E51State {
  return { ...s, hands: s.hands.map((h) => h.slice()), pile: s.pile.slice(), discard: s.discard.slice(), opened: s.opened.slice(), melds: s.melds.map((m) => ({ ...m, cards: m.cards.slice() })), scores: s.scores.slice(), log: s.log.slice() };
}
function removeCards(hand: number[], cards: number[]) {
  const h = hand.slice();
  for (const c of cards) { const k = h.indexOf(c); if (k < 0) throw new IllegalMoveError('Bu kart elinizde yok'); h.splice(k, 1); }
  return h;
}
function endHand(s: E51State, rng: Rng, winner: number | null) {
  const deltas = s.hands.map((h, p) => (p === winner ? -51 : !s.opened[p] ? 102 : h.reduce((t, c) => t + cardPenalty(c), 0)));
  deltas.forEach((d, p) => (s.scores[p] += d));
  s.lastHand = { winner, deltas, note: winner === null ? 'Deste bitti' : 'Elini bitirdi' };
  if (s.handNo >= s.totalHands) { s.phase = 'over'; return; }
  s.handNo++;
  s.first = (s.first + 1) % s.n;
  deal(s, rng);
}
const prev = (s: E51State, seat: number) => (seat + s.n - 1) % s.n;

export const Elli1: GameModule<E51State, E51Action, E51View> = {
  id: 'elli1',
  name: '51',
  playerCounts: [2, 3, 4],
  options: [{ key: 'hands', label: 'El sayısı', default: 3, choices: [1, 3, 5].map((v) => ({ value: v, label: `${v} el` })) }],
  setup(cfg, rng) {
    if (!this.playerCounts.includes(cfg.players)) throw new IllegalMoveError('51, 2–4 kişiyle oynanır');
    const s = { game: 'elli1', n: cfg.players, first: rng.int(cfg.players), scores: new Array(cfg.players).fill(0), handNo: 1, totalHands: Number(cfg.options?.hands ?? 3), lastHand: null } as unknown as E51State;
    deal(s, rng);
    return s;
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'draw') return s.discard.length ? [{ type: 'draw', from: 'pile' }, { type: 'draw', from: 'discard' }] : [{ type: 'draw', from: 'pile' }];
    if (s.taken !== null && s.hands[seat].includes(s.taken)) return [{ type: 'undoTake' }];
    return [...new Set(s.hands[seat])].map((card) => ({ type: 'discard' as const, card }));
  },
  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    if (s.phase === 'draw') {
      if (a?.type !== 'draw') throw new IllegalMoveError('Önce kart çekin');
      if (a.from === 'discard') {
        if (!s.discard.length) throw new IllegalMoveError('Yerde kart yok');
        s.taken = s.discard.pop()!;
        s.hands[seat].push(s.taken);
      } else {
        if (!s.pile.length) { endHand(s, rng, null); return s; }
        s.hands[seat].push(s.pile.pop()!);
        s.taken = null;
      }
      s.phase = 'play';
      return s;
    }
    if (a?.type === 'undoTake') {
      if (s.taken === null || !s.hands[seat].includes(s.taken)) throw new IllegalMoveError('Geri bırakılacak kart yok');
      s.hands[seat] = removeCards(s.hands[seat], [s.taken]);
      s.discard.push(s.taken);
      s.taken = null;
      if (!s.pile.length) { endHand(s, rng, null); return s; }
      s.hands[seat].push(s.pile.pop()!);
      return s;
    }
    if (a?.type === 'open') {
      if (!Array.isArray(a.melds) || !a.melds.length) throw new IllegalMoveError('Açılacak perleri seçin');
      const flat = a.melds.flat();
      if (new Set(flat).size !== flat.length) throw new IllegalMoveError('Aynı kart iki kez kullanılamaz');
      const rest = removeCards(s.hands[seat], flat);
      let total = 0;
      const infos = a.melds.map((m) => { const i = meld51(m); if (!i) throw new IllegalMoveError('Geçersiz per'); total += i.points; return i; });
      if (!s.opened[seat] && total < 51) throw new IllegalMoveError(`Açmak için en az 51 gerekir (şu an ${total})`);
      a.melds.forEach((m, k) => s.melds.push({ owner: seat, cards: m, kind: infos[k].kind }));
      s.opened[seat] = true;
      s.hands[seat] = rest;
      if (s.taken !== null && flat.includes(s.taken)) s.taken = null;
      s.log.push({ seat, text: 'per açtı' });
      if (!rest.length) endHand(s, rng, seat);
      return s;
    }
    if (a?.type === 'process') {
      if (!s.opened[seat]) throw new IllegalMoveError('İşlemek için önce elinizi açmalısınız');
      const m = s.melds[a.meld];
      if (!m || !meld51([...m.cards, a.card])) throw new IllegalMoveError('Kart bu pere uymuyor');
      s.hands[seat] = removeCards(s.hands[seat], [a.card]);
      m.cards.push(a.card);
      if (s.taken === a.card) s.taken = null;
      if (!s.hands[seat].length) endHand(s, rng, seat);
      return s;
    }
    if (a?.type !== 'discard') throw new IllegalMoveError('Geçersiz hamle');
    if (s.taken !== null && s.hands[seat].includes(s.taken)) throw new IllegalMoveError('Yerden aldığınız kartı bu turda kullanmalısınız');
    s.hands[seat] = removeCards(s.hands[seat], [a.card]);
    s.discard.push(a.card);
    s.taken = null;
    if (!s.hands[seat].length) { endHand(s, rng, seat); return s; }
    if (isJoker(a.card)) { s.scores[seat] += 51; s.log.push({ seat, text: 'joker attı (+51)' }); }
    s.turn = (seat + 1) % s.n;
    s.phase = 'draw';
    return s;
  },
  view(s, seat) {
    const { hands, pile, ...rest } = s;
    return { ...rest, discard: s.discard.slice(-3), melds: s.melds.map((m) => ({ ...m, cards: m.cards.slice() })), opened: s.opened.slice(), scores: s.scores.slice(), log: s.log.slice(-6), me: seat, hand: seat === null ? [] : hands[seat].slice(), handCounts: hands.map((h) => h.length), pileCount: pile.length, legal: seat === null ? [] : Elli1.legalActions(s, seat) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const min = Math.min(...s.scores);
    return { winners: s.scores.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0), scores: s.scores.slice(), lowerIsBetter: true, summary: 'En düşük ceza puanı kazanır' };
  },
  ai(v, seat, d, rng) {
    if (v.phase === 'draw') {
      const top = v.discard[v.discard.length - 1];
      if (top !== undefined && d !== 'kolay') {
        if (v.opened[seat] && processable51(v.melds, top).length) return { type: 'draw', from: 'discard' };
        if (!v.opened[seat]) { const b = best51([...v.hand, top], 5000); if (b.points >= 51 && b.melds.flat().includes(top)) return { type: 'draw', from: 'discard' }; }
      }
      return { type: 'draw', from: 'pile' };
    }
    const b = best51(v.hand, d === 'kolay' ? 2000 : 10000);
    const usesTaken = v.taken === null || b.melds.flat().includes(v.taken);
    if (b.melds.length && usesTaken && (v.opened[seat] || b.points >= 51) && v.hand.length - b.melds.flat().length >= (v.opened[seat] ? 1 : 0)) return { type: 'open', melds: b.melds };
    if (v.opened[seat]) for (const c of v.hand) { const ms = processable51(v.melds, c); if (ms.length && (v.hand.length > 1 || true)) return { type: 'process', card: c, meld: ms[0] }; }
    if (v.taken !== null && v.hand.includes(v.taken)) return { type: 'undoTake' };
    const keep = new Set(b.melds.flat());
    const pool = [...new Set(v.hand)].filter((c) => !isJoker(c));
    const list = pool.length ? pool : v.hand;
    const score = (c: number) => (keep.has(c) ? -100 : 0) + cardPenalty(c) + (d === 'kolay' ? rng.int(8) : 0);
    return { type: 'discard', card: list.sort((x, y) => score(y) - score(x))[0] };
  },
};
