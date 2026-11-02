import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';
import { BOARD, FON, GROUP_SQUARES, JAIL, SANS, type CardEffect } from './monopoli-data';

/**
 * MONOPOLİ — uygulanan kurallar (klasik)
 * - 2–6 oyuncu, 1.500 TL. Başlangıç'tan geçen ya da gelen 200 TL alır.
 * - İki zar; çift atan tekrar atar, üst üste üç çift hapse gönderir.
 * - Sahipsiz mülke gelen satın alabilir; almazsa mülk müzayedeye çıkar (sırayla teklif, en az 10 TL artış, pas geçen çıkar).
 * - Kira: arsa kirası; rengin tamamı aynı oyuncudaysa ve arsada ev yoksa iki kat. Evler/otel kira tablosuna göre.
 *   Garlar: 1/2/3/4 gar = 25/50/100/200 TL. İdareler: biri varsa zarın 4 katı, ikisi de varsa 10 katı. İpotekli mülkten kira alınmaz.
 * - Ev: rengin tamamına sahip olunmalı ve grupta ipotek olmamalı; evler eşit dağıtılır (aradaki fark en fazla 1).
 *   4 evden sonra otel. Bankada 32 ev, 12 otel vardır. Evler yarı fiyatına bankaya satılır (eşit dağılımla).
 * - İpotek: grupta ev yokken mülk yarı fiyatına ipotek edilir; kaldırmak için %10 faizle geri ödenir.
 * - Hapis: 50 TL öde, hapisten çıkış kartı kullan ya da üç tura kadar çift dene; üçüncü denemede çift gelmezse 50 TL ödenip çıkılır.
 * - Takas: oyuncular para ve (evsiz) mülk takası teklif edebilir; karşı taraf kabul eder ya da reddeder.
 * - Borç: ödeyemeyen ev satar, ipotek eder; yine ödeyemezse iflas eder. Bir oyuncuya iflas edilirse
 *   tüm para ve mülkler ona geçer; bankaya iflas edilirse mülkler sahipsiz kalır.
 * - Son kalan oyuncu kazanır. "Tur sınırı" seçilirse sınırda servetçe en zengin kazanır.
 *   Klasik modda oyunun sonsuza dek sürmemesi için 200 turluk güvenlik sınırı vardır.
 * - Bir oyuncu bir turda en fazla 3 takas teklifi verebilir.
 * - Ücretsiz Otopark'ta özel bir şey olmaz. Vergiler bankaya ödenir.
 */

interface Player { cash: number; pos: number; jail: number; jailCards: number; bankrupt: boolean }
interface Debt { seat: number; amount: number; to: number | null }
export interface TradeOffer { from: number; to: number; give: { cash: number; props: number[] }; get: { cash: number; props: number[] } }

export interface MonoState {
  game: 'monopoli';
  n: number;
  players: Player[];
  owner: (number | null)[];
  houses: number[];
  mortgaged: boolean[];
  turn: number;
  phase: 'roll' | 'buy' | 'auction' | 'manage' | 'debt' | 'trade' | 'over';
  resume: 'roll' | 'manage';
  dice: [number, number] | null;
  doubles: number;
  auction: { square: number; bid: number; bidder: number | null; active: number[]; idx: number } | null;
  debts: Debt[];
  trade: TradeOffer | null;
  tradePrev: 'roll' | 'manage';
  decks: { sans: number[]; fon: number[] };
  lastCard: { deck: 'Şans' | 'Kamu Fonu'; text: string } | null;
  housesLeft: number;
  hotelsLeft: number;
  round: number;
  maxRounds: number;
  proposed: number;
  log: string[];
  winner: number | null;
}

export type MonoAction =
  | { type: 'roll' } | { type: 'payJail' } | { type: 'useJailCard' }
  | { type: 'buy' } | { type: 'decline' }
  | { type: 'bid'; amount: number } | { type: 'passBid' }
  | { type: 'build'; sq: number } | { type: 'sellHouse'; sq: number }
  | { type: 'mortgage'; sq: number } | { type: 'unmortgage'; sq: number }
  | { type: 'propose'; offer: TradeOffer } | { type: 'acceptTrade' } | { type: 'rejectTrade' }
  | { type: 'payDebt' } | { type: 'bankrupt' } | { type: 'endTurn' };

export interface MonoView extends Omit<MonoState, 'decks'> { me: number | null; legal: MonoAction[]; worth: number[] }

const unmortgageCost = (sq: number) => Math.ceil((BOARD[sq].price! / 2) * 1.1);

export function ownsGroup(s: MonoState, seat: number, group: number) { return GROUP_SQUARES[group].every((q) => s.owner[q] === seat); }

export function rentOf(s: MonoState, sq: number, diceSum: number, cardMul = 1): number {
  const o = s.owner[sq];
  const b = BOARD[sq];
  if (o === null || s.mortgaged[sq]) return 0;
  if (b.kind === 'mulk') {
    const h = s.houses[sq];
    if (h > 0) return b.rents![h];
    return b.rents![0] * (ownsGroup(s, o, b.group!) ? 2 : 1);
  }
  if (b.kind === 'gar') return 25 * 2 ** (GROUP_SQUARES[8].filter((q) => s.owner[q] === o).length - 1) * cardMul;
  if (b.kind === 'idare') {
    const cnt = GROUP_SQUARES[9].filter((q) => s.owner[q] === o).length;
    return diceSum * (cardMul > 1 ? 10 : cnt === 2 ? 10 : 4);
  }
  return 0;
}

export function netWorth(s: MonoState, seat: number) {
  let w = s.players[seat].cash;
  BOARD.forEach((b, q) => {
    if (s.owner[q] !== seat) return;
    w += s.mortgaged[q] ? b.price! / 2 : b.price!;
    if (b.house) w += s.houses[q] * b.house;
  });
  return w;
}

function clone(s: MonoState): MonoState {
  return {
    ...s, players: s.players.map((p) => ({ ...p })), owner: s.owner.slice(), houses: s.houses.slice(), mortgaged: s.mortgaged.slice(),
    auction: s.auction ? { ...s.auction, active: s.auction.active.slice() } : null, debts: s.debts.map((d) => ({ ...d })),
    trade: s.trade ? JSON.parse(JSON.stringify(s.trade)) : null, decks: { sans: s.decks.sans.slice(), fon: s.decks.fon.slice() }, log: s.log.slice(-30),
  };
}

const alive = (s: MonoState) => s.players.map((p, i) => (p.bankrupt ? -1 : i)).filter((i) => i >= 0);

function pay(s: MonoState, seat: number, amount: number, to: number | null) {
  if (amount <= 0) return;
  const p = s.players[seat];
  if (p.cash >= amount) {
    p.cash -= amount;
    if (to !== null) s.players[to].cash += amount;
  } else {
    s.debts.push({ seat, amount, to });
  }
}

function afterAction(s: MonoState) {
  if (s.debts.length) { s.phase = 'debt'; return; }
  if (s.phase !== 'buy' && s.phase !== 'auction' && s.phase !== 'over') s.phase = s.resume;
}

function sendToJail(s: MonoState, seat: number) {
  s.players[seat].pos = JAIL;
  s.players[seat].jail = 1;
  s.doubles = 0;
  s.resume = 'manage';
  s.log.push(`${seat}:hapse girdi`);
}

function moveTo(s: MonoState, seat: number, to: number, passGo = true) {
  const p = s.players[seat];
  if (passGo && to < p.pos) { p.cash += 200; }
  p.pos = to;
}

function land(s: MonoState, seat: number, rng: Rng, cardMul = 1) {
  const b = BOARD[s.players[seat].pos];
  const sum = s.dice ? s.dice[0] + s.dice[1] : 7;
  if (b.price) {
    const o = s.owner[s.players[seat].pos];
    if (o === null) { s.phase = 'buy'; return; }
    if (o !== seat) pay(s, seat, rentOf(s, s.players[seat].pos, sum, cardMul), o);
  } else if (b.kind === 'vergi') pay(s, seat, b.tax!, null);
  else if (b.kind === 'hapse-gir') sendToJail(s, seat);
  else if (b.kind === 'sans' || b.kind === 'fon') drawCard(s, seat, b.kind, rng);
  afterAction(s);
}

function drawCard(s: MonoState, seat: number, kind: 'sans' | 'fon', rng: Rng) {
  const deck = kind === 'sans' ? s.decks.sans : s.decks.fon;
  const cards = kind === 'sans' ? SANS : FON;
  if (!deck.length) deck.push(...shuffle([...cards.keys()], rng));
  const idx = deck.shift()!;
  const card = cards[idx];
  s.lastCard = { deck: kind === 'sans' ? 'Şans' : 'Kamu Fonu', text: card.text };
  const e: CardEffect = card.e;
  const p = s.players[seat];
  switch (e.t) {
    case 'git': moveTo(s, seat, e.to); land(s, seat, rng); return;
    case 'enYakin': {
      let q = p.pos;
      do q = (q + 1) % 40; while (BOARD[q].kind !== e.kind);
      moveTo(s, seat, q);
      land(s, seat, rng, e.kind === 'gar' ? 2 : 10);
      return;
    }
    case 'geri': p.pos = (p.pos + 40 - e.n) % 40; land(s, seat, rng); return;
    case 'hapis': sendToJail(s, seat); break;
    case 'hapisKart': p.jailCards++; break;
    case 'para': if (e.amount > 0) p.cash += e.amount; else pay(s, seat, -e.amount, null); break;
    case 'herkestenAl': for (const o of alive(s)) if (o !== seat) pay(s, o, e.amount, seat); break;
    case 'herkeseOde': for (const o of alive(s)) if (o !== seat) pay(s, seat, e.amount, o); break;
    case 'tamir': {
      let t = 0;
      s.houses.forEach((h, q) => { if (s.owner[q] === seat) t += h === 5 ? e.hotel : h * e.house; });
      pay(s, seat, t, null);
      break;
    }
  }
}

function canBuild(s: MonoState, seat: number, q: number): string | null {
  const b = BOARD[q];
  if (b.kind !== 'mulk' || s.owner[q] !== seat) return 'Bu mülk sizin değil';
  if (!ownsGroup(s, seat, b.group!)) return 'Ev için rengin tamamına sahip olmalısınız';
  const g = GROUP_SQUARES[b.group!];
  if (g.some((x) => s.mortgaged[x])) return 'Grupta ipotekli mülk var';
  if (s.houses[q] >= 5) return 'Burada zaten otel var';
  if (s.houses[q] > Math.min(...g.map((x) => s.houses[x]))) return 'Evler eşit dağıtılmalı';
  if (s.houses[q] === 4 ? s.hotelsLeft < 1 : s.housesLeft < 1) return 'Bankada yeterli ev/otel yok';
  if (s.players[seat].cash < b.house!) return 'Paranız yetmiyor';
  return null;
}
function canSellHouse(s: MonoState, seat: number, q: number): string | null {
  const b = BOARD[q];
  if (s.owner[q] !== seat || s.houses[q] === 0) return 'Satılacak ev yok';
  const g = GROUP_SQUARES[b.group!];
  if (s.houses[q] < Math.max(...g.map((x) => s.houses[x]))) return 'Evler eşit azaltılmalı';
  if (s.houses[q] === 5 && s.housesLeft < 4) return 'Oteli bozmak için bankada 4 ev olmalı';
  return null;
}
function canMortgage(s: MonoState, seat: number, q: number): string | null {
  const b = BOARD[q];
  if (s.owner[q] !== seat || s.mortgaged[q]) return 'İpotek edilemez';
  if (b.group !== undefined && GROUP_SQUARES[b.group].some((x) => s.houses[x] > 0)) return 'Önce gruptaki evleri satın';
  return null;
}

function manageActions(s: MonoState, seat: number): MonoAction[] {
  const out: MonoAction[] = [];
  for (let q = 0; q < 40; q++) {
    if (s.owner[q] !== seat) continue;
    if (!canBuild(s, seat, q)) out.push({ type: 'build', sq: q });
    if (!canSellHouse(s, seat, q)) out.push({ type: 'sellHouse', sq: q });
    if (!canMortgage(s, seat, q)) out.push({ type: 'mortgage', sq: q });
    if (s.mortgaged[q] && s.players[seat].cash >= unmortgageCost(q)) out.push({ type: 'unmortgage', sq: q });
  }
  return out;
}

function nextTurn(s: MonoState) {
  const al = alive(s);
  if (al.length <= 1) { s.phase = 'over'; s.winner = al[0] ?? null; return; }
  let t = s.turn;
  do { t = (t + 1) % s.n; if (t === 0) s.round++; } while (s.players[t].bankrupt);
  s.turn = t;
  s.doubles = 0;
  s.dice = null;
  s.phase = 'roll';
  s.resume = 'roll';
  s.proposed = 0;
  const limit = s.maxRounds || 200;
  if (s.round > limit) {
    s.phase = 'over';
    const w = al.map((p) => netWorth(s, p));
    s.winner = al[w.indexOf(Math.max(...w))];
  }
}

function goBankrupt(s: MonoState, seat: number, to: number | null) {
  const p = s.players[seat];
  for (let q = 0; q < 40; q++) {
    if (s.owner[q] !== seat) continue;
    const b = BOARD[q];
    if (s.houses[q]) {
      p.cash += (s.houses[q] * b.house!) / 2;
      if (s.houses[q] === 5) s.hotelsLeft++; else s.housesLeft += s.houses[q];
      s.houses[q] = 0;
    }
    if (to === null) { s.owner[q] = null; s.mortgaged[q] = false; } else s.owner[q] = to;
  }
  if (to !== null) { s.players[to].cash += Math.max(0, p.cash); s.players[to].jailCards += p.jailCards; }
  p.cash = 0;
  p.jailCards = 0;
  p.bankrupt = true;
  s.debts = s.debts.filter((d) => d.seat !== seat);
  s.log.push(`${seat}:iflas etti`);
}

export const Monopoli: GameModule<MonoState, MonoAction, MonoView> = {
  id: 'monopoli',
  name: 'Monopoli',
  playerCounts: [2, 3, 4, 5, 6],
  options: [{ key: 'maxRounds', label: 'Oyun sonu', default: 0, choices: [{ value: 0, label: 'Klasik (son kalan kazanır)' }, { value: 20, label: '20 tur sonra en zengin' }, { value: 40, label: '40 tur sonra en zengin' }] }],

  setup(cfg, rng) {
    if (cfg.players < 2 || cfg.players > 6) throw new IllegalMoveError('Monopoli 2–6 kişiyle oynanır');
    return {
      game: 'monopoli', n: cfg.players, players: Array.from({ length: cfg.players }, () => ({ cash: 1500, pos: 0, jail: 0, jailCards: 0, bankrupt: false })),
      owner: new Array(40).fill(null), houses: new Array(40).fill(0), mortgaged: new Array(40).fill(false),
      turn: rng.int(cfg.players), phase: 'roll', resume: 'roll', dice: null, doubles: 0, auction: null, debts: [], trade: null, tradePrev: 'roll',
      decks: { sans: shuffle([...SANS.keys()], rng), fon: shuffle([...FON.keys()], rng) }, lastCard: null,
      housesLeft: 32, hotelsLeft: 12, round: 1, maxRounds: Number(cfg.options?.maxRounds ?? 0), proposed: 0, log: [], winner: null,
    };
  },

  toAct(s) {
    if (s.phase === 'over') return [];
    if (s.phase === 'debt') return [s.debts[0].seat];
    if (s.phase === 'auction') return [s.auction!.active[s.auction!.idx]];
    if (s.phase === 'trade') return [s.trade!.to];
    return [s.turn];
  },

  legalActions(s, seat) {
    if (!Monopoli.toAct(s).includes(seat)) return [];
    const p = s.players[seat];
    switch (s.phase) {
      case 'roll': {
        const a: MonoAction[] = [{ type: 'roll' }];
        if (p.jail && p.cash >= 50) a.push({ type: 'payJail' });
        if (p.jail && p.jailCards) a.push({ type: 'useJailCard' });
        return [...a, ...manageActions(s, seat)];
      }
      case 'buy': return p.cash >= BOARD[p.pos].price! ? [{ type: 'buy' }, { type: 'decline' }] : [{ type: 'decline' }];
      case 'auction': {
        const a: MonoAction[] = [{ type: 'passBid' }];
        const min = s.auction!.bid + (s.auction!.bidder === null ? 1 : 10);
        if (p.cash >= min && s.auction!.bidder !== seat) a.push({ type: 'bid', amount: min });
        return a;
      }
      case 'manage': return [{ type: 'endTurn' }, ...manageActions(s, seat)];
      case 'debt': {
        const a: MonoAction[] = [{ type: 'bankrupt' }];
        if (p.cash >= s.debts[0].amount) a.unshift({ type: 'payDebt' });
        return [...a, ...manageActions(s, seat).filter((x) => x.type === 'sellHouse' || x.type === 'mortgage')];
      }
      case 'trade': return [{ type: 'acceptTrade' }, { type: 'rejectTrade' }];
    }
    return [];
  },

  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (!Monopoli.toAct(s0).includes(seat)) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);
    const p = s.players[seat];
    const sq = (a as any)?.sq;

    // Her zaman yapılabilen yönetim işlemleri (sırası gelen oyuncu ya da borçlu)
    if (a?.type === 'build' || a?.type === 'sellHouse' || a?.type === 'mortgage' || a?.type === 'unmortgage') {
      if (!['roll', 'manage', 'debt'].includes(s.phase)) throw new IllegalMoveError('Şu an mülk yönetimi yapılamaz');
      if (s.phase === 'debt' && (a.type === 'build' || a.type === 'unmortgage')) throw new IllegalMoveError('Borcunuz varken bu yapılamaz');
      if (!Number.isInteger(sq) || sq < 0 || sq > 39) throw new IllegalMoveError('Geçersiz mülk');
      const b = BOARD[sq];
      if (a.type === 'build') {
        const e = canBuild(s, seat, sq); if (e) throw new IllegalMoveError(e);
        p.cash -= b.house!;
        if (s.houses[sq] === 4) { s.hotelsLeft--; s.housesLeft += 4; } else s.housesLeft--;
        s.houses[sq]++;
      } else if (a.type === 'sellHouse') {
        const e = canSellHouse(s, seat, sq); if (e) throw new IllegalMoveError(e);
        if (s.houses[sq] === 5) { s.hotelsLeft++; s.housesLeft -= 4; } else s.housesLeft++;
        s.houses[sq]--;
        p.cash += b.house! / 2;
      } else if (a.type === 'mortgage') {
        const e = canMortgage(s, seat, sq); if (e) throw new IllegalMoveError(e);
        s.mortgaged[sq] = true;
        p.cash += b.price! / 2;
      } else {
        if (s.owner[sq] !== seat || !s.mortgaged[sq]) throw new IllegalMoveError('İpotekli değil');
        if (p.cash < unmortgageCost(sq)) throw new IllegalMoveError('Paranız yetmiyor');
        p.cash -= unmortgageCost(sq);
        s.mortgaged[sq] = false;
      }
      return s;
    }

    switch (s.phase) {
      case 'roll': {
        if (a?.type === 'propose') return propose(s, seat, a.offer);
        if (a?.type === 'payJail') { if (!p.jail || p.cash < 50) throw new IllegalMoveError('Hapiste değilsiniz'); p.cash -= 50; p.jail = 0; return s; }
        if (a?.type === 'useJailCard') { if (!p.jail || !p.jailCards) throw new IllegalMoveError('Kartınız yok'); p.jailCards--; p.jail = 0; return s; }
        if (a?.type !== 'roll') throw new IllegalMoveError('Zar atın');
        const d: [number, number] = [1 + rng.int(6), 1 + rng.int(6)];
        s.dice = d;
        const dbl = d[0] === d[1];
        if (p.jail) {
          if (dbl) { p.jail = 0; s.resume = 'manage'; }
          else if (p.jail >= 3) { p.jail = 0; s.resume = 'manage'; pay(s, seat, 50, null); }
          else { p.jail++; s.phase = 'manage'; s.resume = 'manage'; return s; }
        } else if (dbl) {
          s.doubles++;
          if (s.doubles >= 3) { sendToJail(s, seat); s.phase = 'manage'; return s; }
          s.resume = 'roll';
        } else s.resume = 'manage';
        moveTo(s, seat, (p.pos + d[0] + d[1]) % 40);
        s.phase = s.resume;
        land(s, seat, rng);
        return s;
      }
      case 'buy': {
        const q = p.pos;
        if (a?.type === 'buy') {
          if (p.cash < BOARD[q].price!) throw new IllegalMoveError('Paranız yetmiyor');
          p.cash -= BOARD[q].price!;
          s.owner[q] = seat;
          s.phase = s.resume;
          return s;
        }
        if (a?.type !== 'decline') throw new IllegalMoveError('Satın alın ya da müzayedeye bırakın');
        const al = alive(s);
        const start = al.indexOf(seat);
        s.auction = { square: q, bid: 0, bidder: null, active: [...al.slice(start), ...al.slice(0, start)], idx: 0 };
        s.phase = 'auction';
        return s;
      }
      case 'auction': {
        const au = s.auction!;
        if (a?.type === 'bid') {
          const min = au.bid + (au.bidder === null ? 1 : 10);
          if (!Number.isInteger(a.amount) || a.amount < min) throw new IllegalMoveError(`En az ${min} TL teklif verin`);
          if (a.amount > p.cash) throw new IllegalMoveError('Paranız yetmiyor');
          if (au.bidder === seat) throw new IllegalMoveError('En yüksek teklif zaten sizde');
          au.bid = a.amount; au.bidder = seat;
          au.idx = (au.idx + 1) % au.active.length;
        } else if (a?.type === 'passBid') {
          au.active.splice(au.idx, 1);
          if (au.idx >= au.active.length) au.idx = 0;
        } else throw new IllegalMoveError('Teklif verin ya da pas geçin');
        const finished = au.active.length === 0 || (au.active.length === 1 && au.bidder === au.active[0]);
        if (finished) {
          if (au.bidder !== null) { s.players[au.bidder].cash -= au.bid; s.owner[au.square] = au.bidder; s.log.push(`${au.bidder}:müzayede ${au.bid}`); }
          s.auction = null;
          s.phase = s.resume;
        } else if (au.active[au.idx] === au.bidder) au.idx = (au.idx + 1) % au.active.length;
        return s;
      }
      case 'manage': {
        if (a?.type === 'propose') return propose(s, seat, a.offer);
        if (a?.type !== 'endTurn') throw new IllegalMoveError('Turu bitirin');
        nextTurn(s);
        return s;
      }
      case 'debt': {
        const d = s.debts[0];
        if (a?.type === 'payDebt') {
          if (p.cash < d.amount) throw new IllegalMoveError('Paranız hâlâ yetmiyor: ev satın veya ipotek edin');
          p.cash -= d.amount;
          if (d.to !== null) s.players[d.to].cash += d.amount;
          s.debts.shift();
        } else if (a?.type === 'bankrupt') {
          goBankrupt(s, seat, d.to);
          if (alive(s).length <= 1) { s.phase = 'over'; s.winner = alive(s)[0]; return s; }
          if (seat === s.turn && !s.debts.length) { nextTurn(s); return s; }
        } else throw new IllegalMoveError('Borcu ödeyin ya da iflas edin');
        if (!s.debts.length) { if (s.players[s.turn].bankrupt) nextTurn(s); else s.phase = s.resume; }
        return s;
      }
      case 'trade': {
        const t = s.trade!;
        if (a?.type === 'acceptTrade') {
          const err = tradeError(s, t);
          if (err) throw new IllegalMoveError(err);
          s.players[t.from].cash += t.get.cash - t.give.cash;
          s.players[t.to].cash += t.give.cash - t.get.cash;
          t.give.props.forEach((q) => (s.owner[q] = t.to));
          t.get.props.forEach((q) => (s.owner[q] = t.from));
          s.log.push(`${t.from}-${t.to}:takas`);
        } else if (a?.type !== 'rejectTrade') throw new IllegalMoveError('Teklifi kabul edin ya da reddedin');
        s.trade = null;
        s.phase = s.tradePrev;
        return s;
      }
    }
    throw new IllegalMoveError('Geçersiz hamle');
  },

  view(s, seat) {
    const { decks, ...rest } = s;
    return { ...rest, players: s.players.map((p) => ({ ...p })), owner: s.owner.slice(), houses: s.houses.slice(), mortgaged: s.mortgaged.slice(), log: s.log.slice(-10), me: seat, legal: seat === null ? [] : Monopoli.legalActions(s, seat), worth: s.players.map((_, i) => netWorth(s, i)) };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    return { winners: s.winner === null ? [] : [s.winner], scores: s.players.map((_, i) => netWorth(s, i)), summary: s.round > (s.maxRounds || 200) ? 'Tur sınırında en zengin oyuncu kazandı' : 'Son kalan oyuncu kazandı' };
  },
  ai(v, seat, d, rng) { return monoAi(v, seat, d, rng); },
};

function tradeError(s: MonoState, t: TradeOffer): string | null {
  if (t.from === t.to || !s.players[t.to] || s.players[t.to].bankrupt) return 'Geçersiz oyuncu';
  if (t.give.cash < 0 || t.get.cash < 0 || !Number.isInteger(t.give.cash) || !Number.isInteger(t.get.cash)) return 'Geçersiz para';
  if (s.players[t.from].cash < t.give.cash || s.players[t.to].cash < t.get.cash) return 'Teklifteki para karşılanamıyor';
  for (const [props, own] of [[t.give.props, t.from], [t.get.props, t.to]] as const) for (const q of props) {
    if (s.owner[q] !== own) return 'Teklifteki mülkler sahiplerine ait değil';
    const g = BOARD[q].group!;
    if (GROUP_SQUARES[g].some((x) => s.houses[x] > 0)) return 'Evli gruptaki mülkler takas edilemez';
  }
  if (!t.give.props.length && !t.get.props.length) return 'Takas en az bir mülk içermeli';
  return null;
}

function propose(s: MonoState, seat: number, offer: TradeOffer) {
  if (s.proposed >= 3) throw new IllegalMoveError('Bir turda en fazla 3 takas teklifi verebilirsiniz');
  const t: TradeOffer = { from: seat, to: Number(offer?.to), give: { cash: Number(offer?.give?.cash ?? 0), props: [...(offer?.give?.props ?? [])] }, get: { cash: Number(offer?.get?.cash ?? 0), props: [...(offer?.get?.props ?? [])] } };
  const err = tradeError(s, t);
  if (err) throw new IllegalMoveError(err);
  s.proposed++;
  s.trade = t;
  s.tradePrev = s.phase as 'roll' | 'manage';
  s.phase = 'trade';
  return s;
}

// ---------- Yapay zekâ ----------
function propValue(v: MonoView, seat: number, q: number) {
  const b = BOARD[q];
  let val = b.price!;
  const g = GROUP_SQUARES[b.group!];
  const mine = g.filter((x) => v.owner[x] === seat).length;
  if (mine === g.length - 1) val *= 1.8; // seti tamamlıyor
  const others = new Set(g.map((x) => v.owner[x]).filter((o) => o !== null && o !== seat));
  if (others.size === 1 && g.filter((x) => v.owner[x] !== null && v.owner[x] !== seat).length === g.length - 1) val *= 1.4; // rakibin setini bloke eder
  return val;
}

export function monoAi(v: MonoView, seat: number, d: Difficulty, rng: Rng): MonoAction {
  const p = v.players[seat];
  const reserve = d === 'kolay' ? 0 : d === 'orta' ? 120 : 200;
  const has = (t: MonoAction['type']) => v.legal.find((x) => x.type === t);
  switch (v.phase) {
    case 'trade': {
      const t = v.trade!;
      // Alıcının gözünden: aldıklarının değeri ve verdiklerinin (rakibe set kazandırıyorsa) bedeli
      const gain = t.give.props.reduce((a, q) => a + propValue(v, seat, q), 0) + t.give.cash;
      const loss = t.get.props.reduce((a, q) => a + BOARD[q].price! * (completesFor(v, t.from, q, t.get.props) ? 2 : 1), 0) + t.get.cash;
      return gain >= loss * (d === 'kolay' ? 0.9 : 1.1) ? { type: 'acceptTrade' } : { type: 'rejectTrade' };
    }
    case 'debt': {
      if (has('payDebt')) return { type: 'payDebt' };
      const sell = v.legal.find((x) => x.type === 'sellHouse');
      if (sell) return sell;
      const morts = v.legal.filter((x): x is { type: 'mortgage'; sq: number } => x.type === 'mortgage').sort((a, b) => BOARD[a.sq].price! - BOARD[b.sq].price!);
      if (morts.length) return morts[0];
      return { type: 'bankrupt' };
    }
    case 'buy': {
      const price = BOARD[p.pos].price!;
      if (!has('buy')) return { type: 'decline' };
      const want = propValue(v, seat, p.pos) > price * 1.3 || p.cash - price >= reserve || d === 'kolay';
      return want ? { type: 'buy' } : { type: 'decline' };
    }
    case 'auction': {
      const bid = v.legal.find((x): x is { type: 'bid'; amount: number } => x.type === 'bid');
      const limit = Math.min(p.cash - reserve, propValue(v, seat, v.auction!.square) * (d === 'zor' ? 1 : 0.8));
      return bid && bid.amount <= limit ? bid : { type: 'passBid' };
    }
    case 'roll': {
      if (p.jail && has('useJailCard')) return { type: 'useJailCard' };
      const freeProps = v.owner.filter((o) => o === null).length;
      if (p.jail && has('payJail') && freeProps > 8 && p.cash > 300) return { type: 'payJail' };
      if (d !== 'kolay') { const um = unmortgagePick(v, seat, reserve); if (um) return um; }
      return { type: 'roll' };
    }
    case 'manage': {
      if (d !== 'kolay') {
        const builds = v.legal.filter((x): x is { type: 'build'; sq: number } => x.type === 'build');
        const affordable = builds.filter((b) => p.cash - BOARD[b.sq].house! >= reserve).sort((a, b) => BOARD[b.sq].price! - BOARD[a.sq].price!);
        if (affordable.length) return affordable[0];
        const um = unmortgagePick(v, seat, reserve * 2);
        if (um) return um;
        if (v.proposed === 0) { const offer = makeOffer(v, seat, reserve); if (offer) return { type: 'propose', offer }; }
      } else if (rng.int(4) === 0) {
        const b = v.legal.find((x) => x.type === 'build');
        if (b && p.cash > 300) return b;
      }
      return { type: 'endTurn' };
    }
  }
  return v.legal[0];
}

/** q mülkünü alan oyuncu (diğer verilen mülklerle birlikte) rengin tamamına sahip olur mu? */
function completesFor(v: MonoView, who: number, q: number, also: number[] = []) {
  const g = BOARD[q].group!;
  if (g > 7) return false;
  return GROUP_SQUARES[g].every((x) => v.owner[x] === who || x === q || also.includes(x));
}

/** Setini tamamlamak için tek bir rakipten eksik mülk(ler)i isteyen teklif. */
function makeOffer(v: MonoView, seat: number, reserve: number): TradeOffer | null {
  const me = v.players[seat];
  for (let g = 0; g < 8; g++) {
    const sq = GROUP_SQUARES[g];
    const missing = sq.filter((x) => v.owner[x] !== seat);
    if (!missing.length || missing.length === sq.length || missing.length > 2) continue;
    const owners = new Set(missing.map((x) => v.owner[x]));
    if (owners.size !== 1 || owners.has(null)) continue;
    const other = [...owners][0]!;
    if (v.players[other].bankrupt || sq.some((x) => v.houses[x] > 0)) continue;
    // Karşı tarafın setini tamamlayan bir mülküm varsa takas et
    const sweet = v.owner.map((o, q) => (o === seat && BOARD[q].group! < 8 && !GROUP_SQUARES[BOARD[q].group!].some((x) => v.houses[x] > 0) && completesFor(v, other, q) ? q : -1)).filter((q) => q >= 0);
    const value = missing.reduce((a, q) => a + BOARD[q].price! * 2, 0);
    if (sweet.length) return { from: seat, to: other, give: { cash: 0, props: [sweet[0]] }, get: { cash: 0, props: missing } };
    const cash = Math.ceil((value * 1.15) / 10) * 10;
    if (me.cash - cash >= reserve) return { from: seat, to: other, give: { cash, props: [] }, get: { cash: 0, props: missing } };
  }
  return null;
}

function unmortgagePick(v: MonoView, seat: number, reserve: number): MonoAction | null {
  const um = v.legal.filter((x): x is { type: 'unmortgage'; sq: number } => x.type === 'unmortgage');
  for (const u of um) if (v.players[seat].cash - unmortgageCost(u.sq) >= reserve) return u;
  return null;
}

export { unmortgageCost, canBuild };
