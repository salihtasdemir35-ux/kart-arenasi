import { makeDeck, rankOf } from '../cards';
import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * BLACKJACK — SANAL FİŞLE (gerçek para yok)
 * - 1–7 oyuncu kasaya (krupiye) karşı; 6 deste. Ayakkabının %75'i bitince yeniden karıştırılır.
 * - Herkes 1.000 fişle başlar. Her tur önce bahis (10–500, 10'un katları), sonra iki kart; kasanın bir kartı kapalıdır.
 * - Kasa As ya da 10 değerinde kart gösterirse blackjack kontrolü yapar; kasada blackjack varsa tur hemen biter.
 * - Oyuncu: kart çek, dur, ikiye katla (ilk iki kartta, bahsi ikiye katlar ve tek kart alır),
 *   böl (aynı değerde iki kart, tek bölme; bölünen Aslara birer kart verilir ve onlar 21 olsa da blackjack sayılmaz).
 * - Kasa 17 ve üstünde durur (yumuşak 17'de de durur).
 * - Ödemeler: blackjack 3:2, kazanma 1:1, beraberlik bahis iade. Sigorta uygulanmaz.
 * - Fişi biten oyundan çıkar. Seçilen tur sayısı sonunda en çok fişi olan kazanır.
 */

export interface BJHand { cards: string[]; bet: number; done: boolean; doubled: boolean; fromSplit: boolean; result?: string }
export interface BJState {
  game: 'blackjack';
  n: number;
  chips: number[];
  out: boolean[];
  shoe: string[];
  dealer: string[];
  hands: BJHand[][];
  phase: 'bet' | 'play' | 'over';
  turn: number;
  hand: number;
  round: number;
  maxRounds: number;
  lastRound: { results: string[][]; dealer: string[]; dealerTotal: number } | null;
}
export type BJAction = { type: 'bet'; amount: number } | { type: 'hit' } | { type: 'stand' } | { type: 'double' } | { type: 'split' };
export interface BJView extends Omit<BJState, 'shoe' | 'dealer'> { me: number | null; dealerShown: string[]; dealerHidden: boolean; legal: BJAction[] }

const card = (c: string) => c.split('#')[0];
const val = (c: string) => { const r = rankOf(card(c)); return r === 14 ? 11 : r >= 10 ? 10 : r; };
export function total(cards: string[]): { total: number; soft: boolean } {
  let t = 0, aces = 0;
  for (const c of cards) { t += val(c); if (rankOf(card(c)) === 14) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
const isBJ = (h: BJHand | string[]) => { const cs = Array.isArray(h) ? h : h.cards; return cs.length === 2 && total(cs).total === 21 && (Array.isArray(h) || !h.fromSplit); };

function newShoe(rng: Rng) { return shuffle(Array.from({ length: 6 }, (_, d) => makeDeck().map((c) => `${c}#${d}`)).flat(), rng); }
function draw(s: BJState) { return s.shoe.pop()!; }

function nextActor(s: BJState, from: number): number {
  for (let p = from; p < s.n; p++) if (!s.out[p] && s.hands[p].some((h) => !h.done)) return p;
  return -1;
}

function settle(s: BJState) {
  // Kasa oynar (en az bir el patlamamışsa)
  const anyAlive = s.hands.some((hs) => hs.some((h) => total(h.cards).total <= 21 && !(isBJ(h) && h.result)));
  if (anyAlive) while (total(s.dealer).total < 17) s.dealer.push(draw(s));
  const d = total(s.dealer).total;
  const dBJ = isBJ(s.dealer);
  const results: string[][] = [];
  s.hands.forEach((hs, p) => {
    results[p] = hs.map((h) => {
      const t = total(h.cards).total;
      let res: string, pay: number;
      if (t > 21) { res = 'Patladı'; pay = 0; }
      else if (isBJ(h) && !dBJ) { res = 'Blackjack!'; pay = h.bet + Math.floor(h.bet * 1.5); }
      else if (dBJ && !isBJ(h)) { res = 'Kasa blackjack'; pay = 0; }
      else if (d > 21 || t > d) { res = 'Kazandı'; pay = h.bet * 2; }
      else if (t === d) { res = 'Berabere'; pay = h.bet; }
      else { res = 'Kaybetti'; pay = 0; }
      s.chips[p] += pay;
      h.result = res;
      return res;
    });
  });
  s.lastRound = { results, dealer: s.dealer.slice(), dealerTotal: d };
  for (let p = 0; p < s.n; p++) if (s.chips[p] < 10) s.out[p] = true;
  if ((s.maxRounds && s.round >= s.maxRounds) || s.out.every(Boolean)) { s.phase = 'over'; return; }
  s.round++;
  s.phase = 'bet';
  s.hands = s.hands.map(() => []);
  s.dealer = [];
  s.turn = s.out.indexOf(false);
}

function startPlay(s: BJState, rng: Rng) {
  if (s.shoe.length < 78) s.shoe = newShoe(rng);
  for (let p = 0; p < s.n; p++) for (const h of s.hands[p]) h.cards = [draw(s), draw(s)];
  s.dealer = [draw(s), draw(s)];
  s.phase = 'play';
  const up = val(s.dealer[0]);
  if ((up === 11 || up === 10) && isBJ(s.dealer)) { s.hands.forEach((hs) => hs.forEach((h) => (h.done = true))); settle(s); return; }
  s.hands.forEach((hs) => hs.forEach((h) => { if (isBJ(h)) h.done = true; }));
  s.turn = nextActor(s, 0);
  s.hand = s.turn >= 0 ? s.hands[s.turn].findIndex((h) => !h.done) : 0;
  if (s.turn < 0) settle(s);
}

function advance(s: BJState) {
  const hs = s.hands[s.turn];
  const nh = hs.findIndex((h) => !h.done);
  if (nh >= 0) { s.hand = nh; return; }
  s.turn = nextActor(s, s.turn + 1);
  if (s.turn < 0) { s.turn = 0; settle(s); return; }
  s.hand = s.hands[s.turn].findIndex((h) => !h.done);
}

export const Blackjack: GameModule<BJState, BJAction, BJView> = {
  id: 'blackjack',
  name: 'Blackjack',
  playerCounts: [1, 2, 3, 4, 5, 6, 7],
  options: [{ key: 'rounds', label: 'Tur sayısı', default: 10, choices: [5, 10, 20, 50].map((v) => ({ value: v, label: `${v} tur` })) }],
  setup(cfg, rng) {
    if (cfg.players < 1 || cfg.players > 7) throw new IllegalMoveError('Blackjack 1–7 kişiyle oynanır');
    return { game: 'blackjack', n: cfg.players, chips: new Array(cfg.players).fill(1000), out: new Array(cfg.players).fill(false), shoe: newShoe(rng), dealer: [], hands: Array.from({ length: cfg.players }, () => []), phase: 'bet', turn: 0, hand: 0, round: 1, maxRounds: Number(cfg.options?.rounds ?? 10), lastRound: null };
  },
  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },
  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'bet') return [10, 50, 100, 200].filter((b) => b <= s.chips[seat]).map((amount) => ({ type: 'bet' as const, amount }));
    const h = s.hands[seat][s.hand];
    const a: BJAction[] = [{ type: 'hit' }, { type: 'stand' }];
    if (h.cards.length === 2 && s.chips[seat] >= h.bet) {
      a.push({ type: 'double' });
      if (s.hands[seat].length === 1 && val(h.cards[0]) === val(h.cards[1])) a.push({ type: 'split' });
    }
    return a;
  },
  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s: BJState = { ...s0, chips: s0.chips.slice(), out: s0.out.slice(), shoe: s0.shoe.slice(), dealer: s0.dealer.slice(), hands: s0.hands.map((hs) => hs.map((h) => ({ ...h, cards: h.cards.slice() }))) };
    if (s.phase === 'bet') {
      if (a?.type !== 'bet' || !Number.isInteger(a.amount) || a.amount < 10 || a.amount > 500 || a.amount % 10 || a.amount > s.chips[seat]) throw new IllegalMoveError('Bahis 10–500 arası, 10’un katı ve fişinizden az olmalı');
      s.chips[seat] -= a.amount;
      s.hands[seat] = [{ cards: [], bet: a.amount, done: false, doubled: false, fromSplit: false }];
      let nx = seat + 1;
      while (nx < s.n && s.out[nx]) nx++;
      if (nx < s.n) s.turn = nx; else startPlay(s, rng);
      return s;
    }
    const h = s.hands[seat][s.hand];
    switch (a?.type) {
      case 'hit': h.cards.push(draw(s)); if (total(h.cards).total >= 21) h.done = true; break;
      case 'stand': h.done = true; break;
      case 'double':
        if (h.cards.length !== 2 || s.chips[seat] < h.bet) throw new IllegalMoveError('İkiye katlanamaz');
        s.chips[seat] -= h.bet; h.bet *= 2; h.doubled = true; h.cards.push(draw(s)); h.done = true; break;
      case 'split': {
        if (s.hands[seat].length !== 1 || h.cards.length !== 2 || val(h.cards[0]) !== val(h.cards[1]) || s.chips[seat] < h.bet) throw new IllegalMoveError('Bölünemez');
        s.chips[seat] -= h.bet;
        const aces = rankOf(card(h.cards[0])) === 14;
        const h2: BJHand = { cards: [h.cards.pop()!, draw(s)], bet: h.bet, done: aces, doubled: false, fromSplit: true };
        h.cards.push(draw(s)); h.fromSplit = true; h.done = aces;
        s.hands[seat].push(h2);
        break;
      }
      default: throw new IllegalMoveError('Geçersiz hamle');
    }
    advance(s);
    return s;
  },
  view(s, seat) {
    const { shoe, dealer, ...rest } = s;
    const hidden = s.phase === 'play';
    return { ...rest, chips: s.chips.slice(), out: s.out.slice(), hands: s.hands.map((hs) => hs.map((h) => ({ ...h, cards: h.cards.slice() }))), me: seat, dealerShown: hidden ? dealer.slice(0, 1) : dealer.slice(), dealerHidden: hidden, legal: seat === null ? [] : Blackjack.legalActions(s, seat) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    const max = Math.max(...s.chips);
    return { winners: s.chips.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0), scores: s.chips.slice(), summary: 'En çok fişe sahip olan kazandı (sanal fiş)' };
  },
  ai(v, seat, d, rng) {
    if (v.phase === 'bet') { const opts = v.legal as { type: 'bet'; amount: number }[]; return opts[d === 'kolay' ? rng.int(opts.length) : Math.min(1, opts.length - 1)]; }
    const h = v.hands[seat][v.hand];
    const { total: t, soft } = total(h.cards);
    const up = val(v.dealerShown[0]);
    const has = (x: BJAction['type']) => v.legal.some((a) => a.type === x);
    if (d === 'kolay') return { type: t < 17 ? 'hit' : 'stand' };
    // Temel strateji (S17)
    if (has('split')) {
      const r = val(h.cards[0]);
      if (r === 11 || r === 8) return { type: 'split' };
      if (d === 'zor' && ([2, 3, 7].includes(r) && up <= 7 || r === 6 && up <= 6 || r === 9 && ![7, 10, 11].includes(up))) return { type: 'split' };
    }
    if (soft) {
      if (d === 'zor' && has('double') && ((t === 17 || t === 18) && up >= 3 && up <= 6)) return { type: 'double' };
      if (t >= 19 || (t === 18 && up <= 8)) return { type: 'stand' };
      return { type: 'hit' };
    }
    if (has('double') && (t === 11 || (t === 10 && up <= 9) || (d === 'zor' && t === 9 && up >= 3 && up <= 6))) return { type: 'double' };
    if (t >= 17) return { type: 'stand' };
    if (t >= 13 && up <= 6) return { type: 'stand' };
    if (t === 12 && up >= 4 && up <= 6) return { type: 'stand' };
    return { type: 'hit' };
  },
};

export { card as bjCard };
