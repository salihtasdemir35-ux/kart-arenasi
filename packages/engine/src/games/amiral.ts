import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * AMİRAL BATTI — uygulanan kurallar
 * - 2 oyuncu, 10×10 alan (satır A–J, sütun 1–10). Filo: Uçak gemisi 5, Zırhlı 4, Kruvazör 3, Denizaltı 3, Hücumbot 2.
 * - Önce iki oyuncu da gemilerini gizlice yerleştirir: yatay ya da dikey, alan içinde, üst üste gelmeden.
 *   "Gemiler birbirine değmesin" seçeneği açıksa çapraz dahil komşu karelere gemi konamaz.
 * - Sonra sırayla koordinata ateş edilir: ıska, isabet ya da batırma bildirilir. Aynı kareye iki kez ateş edilemez.
 * - "İsabette tekrar at" seçeneği açıksa vuran oyuncu bir kez daha atar.
 * - Rakibin bütün gemilerini ilk batıran kazanır. Rakip gemileri yalnızca batınca görünür.
 */

export const FLEET = [
  { name: 'Uçak gemisi', len: 5 }, { name: 'Zırhlı', len: 4 }, { name: 'Kruvazör', len: 3 }, { name: 'Denizaltı', len: 3 }, { name: 'Hücumbot', len: 2 },
];
export interface Ship { r: number; c: number; len: number; dir: 'y' | 'd' } // y = yatay, d = dikey
export const shipCells = (s: Ship) => Array.from({ length: s.len }, (_, k) => (s.dir === 'y' ? s.r * 10 + s.c + k : (s.r + k) * 10 + s.c));

export interface AmiralState {
  game: 'amiral';
  phase: 'place' | 'fire' | 'over';
  ships: (Ship[] | null)[];
  shots: number[][]; // shots[p] = p'nin rakibe attığı kareler
  turn: number;
  noTouch: boolean;
  extraOnHit: boolean;
  last: { seat: number; cell: number; result: 'iska' | 'isabet' | 'batti'; ship?: string } | null;
  winner: number | null;
}
export type AmiralAction = { type: 'place'; ships: Ship[] } | { type: 'fire'; cell: number };
export interface AmiralView {
  game: 'amiral';
  phase: AmiralState['phase'];
  me: number | null;
  myShips: Ship[] | null;
  placed: boolean[];
  /** Her oyuncunun rakibe attığı atışlar ve sonuçları. */
  shots: { cell: number; hit: boolean }[][];
  /** Her oyuncunun batmış gemileri (rakip görebilir). */
  sunk: Ship[][];
  turn: number;
  noTouch: boolean;
  extraOnHit: boolean;
  last: AmiralState['last'];
  winner: number | null;
  legal: AmiralAction[];
}

export function validateFleet(ships: Ship[], noTouch: boolean): string | null {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return 'Beş geminin hepsini yerleştirin';
  const lens = ships.map((s) => s.len).sort((a, b) => b - a);
  if (lens.join() !== FLEET.map((f) => f.len).join()) return 'Filo boyutları hatalı';
  return checkShips(ships, noTouch);
}

/** Yalnızca geometri: alan içinde mi, çakışma/temas var mı. */
export function checkShips(ships: Ship[], noTouch: boolean): string | null {
  const occ = new Set<number>();
  for (const s of ships) {
    if (!Number.isInteger(s.r) || !Number.isInteger(s.c) || (s.dir !== 'y' && s.dir !== 'd')) return 'Geçersiz gemi';
    const endR = s.dir === 'd' ? s.r + s.len - 1 : s.r, endC = s.dir === 'y' ? s.c + s.len - 1 : s.c;
    if (s.r < 0 || s.c < 0 || endR > 9 || endC > 9) return 'Gemi alanın dışına taşıyor';
    for (const cell of shipCells(s)) { if (occ.has(cell)) return 'Gemiler üst üste gelemez'; }
    if (noTouch) for (const cell of shipCells(s)) {
      const r = Math.floor(cell / 10), c = cell % 10;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 10 && cc >= 0 && cc < 10 && occ.has(rr * 10 + cc)) return 'Gemiler birbirine değmemeli';
      }
    }
    shipCells(s).forEach((x) => occ.add(x));
  }
  return null;
}

/** Rastgele geçerli filo. */
export function randomFleet(rng: Rng, noTouch: boolean): Ship[] {
  for (;;) {
    const ships: Ship[] = [];
    let ok = true;
    for (const f of FLEET) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const dir = rng.int(2) ? 'y' : 'd';
        const s: Ship = { r: rng.int(dir === 'd' ? 11 - f.len : 10), c: rng.int(dir === 'y' ? 11 - f.len : 10), len: f.len, dir };
        if (!validatePartial([...ships, s], noTouch)) { ships.push(s); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}
const validatePartial = (ships: Ship[], noTouch: boolean) => checkShips(ships, noTouch);

const opp = (p: number) => 1 - p;
function isHit(s: AmiralState, shooter: number, cell: number) { return s.ships[opp(shooter)]!.some((sh) => shipCells(sh).includes(cell)); }
function sunkShips(s: AmiralState, owner: number) {
  const shots = new Set(s.shots[opp(owner)]);
  return (s.ships[owner] ?? []).filter((sh) => shipCells(sh).every((c) => shots.has(c)));
}

export const Amiral: GameModule<AmiralState, AmiralAction, AmiralView> = {
  id: 'amiral',
  name: 'Amiral Battı',
  playerCounts: [2],
  options: [
    { key: 'noTouch', label: 'Gemiler birbirine değmesin', default: false, choices: [{ value: false, label: 'Hayır' }, { value: true, label: 'Evet' }] },
    { key: 'extraOnHit', label: 'İsabette tekrar at', default: false, choices: [{ value: false, label: 'Hayır' }, { value: true, label: 'Evet' }] },
  ],
  setup(cfg, rng) {
    if (cfg.players !== 2) throw new IllegalMoveError('Amiral Battı 2 kişiyle oynanır');
    return { game: 'amiral', phase: 'place', ships: [null, null], shots: [[], []], turn: rng.int(2), noTouch: cfg.options?.noTouch === true, extraOnHit: cfg.options?.extraOnHit === true, last: null, winner: null };
  },
  toAct(s) {
    if (s.phase === 'over') return [];
    if (s.phase === 'place') return [0, 1].filter((p) => !s.ships[p]);
    return [s.turn];
  },
  legalActions(s, seat) {
    if (s.phase === 'place') return s.ships[seat] ? [] : [{ type: 'place', ships: [] }];
    if (s.phase !== 'fire' || seat !== s.turn) return [];
    const done = new Set(s.shots[seat]);
    return [...Array(100).keys()].filter((c) => !done.has(c)).map((cell) => ({ type: 'fire' as const, cell }));
  },
  apply(s0, seat, a) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    const s: AmiralState = { ...s0, ships: s0.ships.slice(), shots: s0.shots.map((x) => x.slice()) };
    if (s.phase === 'place') {
      if (a?.type !== 'place') throw new IllegalMoveError('Önce gemilerinizi yerleştirin');
      if (s.ships[seat]) throw new IllegalMoveError('Gemileriniz zaten yerleşti');
      const err = validateFleet(a.ships, s.noTouch);
      if (err) throw new IllegalMoveError(err);
      s.ships[seat] = a.ships.map((x) => ({ r: x.r, c: x.c, len: x.len, dir: x.dir }));
      if (s.ships[0] && s.ships[1]) s.phase = 'fire';
      return s;
    }
    if (seat !== s.turn) throw new IllegalMoveError('Sıra sizde değil');
    if (a?.type !== 'fire' || !Number.isInteger(a.cell) || a.cell < 0 || a.cell > 99) throw new IllegalMoveError('Geçersiz koordinat');
    if (s.shots[seat].includes(a.cell)) throw new IllegalMoveError('Bu kareye zaten ateş ettiniz');
    s.shots[seat].push(a.cell);
    const hit = isHit(s, seat, a.cell);
    let result: 'iska' | 'isabet' | 'batti' = hit ? 'isabet' : 'iska';
    let shipName: string | undefined;
    if (hit) {
      const target = s.ships[opp(seat)]!.find((sh) => shipCells(sh).includes(a.cell))!;
      if (shipCells(target).every((c) => s.shots[seat].includes(c))) { result = 'batti'; shipName = FLEET.find((f) => f.len === target.len)!.name; }
    }
    s.last = { seat, cell: a.cell, result, ship: shipName };
    if (sunkShips(s, opp(seat)).length === FLEET.length) { s.phase = 'over'; s.winner = seat; return s; }
    if (!(hit && s.extraOnHit)) s.turn = opp(seat);
    return s;
  },
  view(s, seat) {
    return {
      game: 'amiral', phase: s.phase, me: seat, myShips: seat === null ? null : s.ships[seat], placed: s.ships.map(Boolean),
      shots: [0, 1].map((p) => s.shots[p].map((cell) => ({ cell, hit: s.ships[opp(p)] ? isHit(s, p, cell) : false }))),
      sunk: [0, 1].map((p) => (s.phase === 'over' ? s.ships[p] ?? [] : sunkShips(s, p))),
      turn: s.turn, noTouch: s.noTouch, extraOnHit: s.extraOnHit, last: s.last, winner: s.winner,
      legal: seat === null ? [] : Amiral.legalActions(s, seat),
    };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    return { winners: [s.winner!], scores: [0, 1].map((p) => sunkShips(s, opp(p)).length), summary: 'Rakip filonun tamamı batırıldı' };
  },
  ai(v, seat, d, rng) {
    if (v.phase === 'place') return { type: 'place', ships: randomFleet(rng, v.noTouch) };
    return { type: 'fire', cell: amiralAim(v, seat, d, rng) };
  },
};

/** Atış seçimi: yalnızca kendi atış geçmişini ve batan gemileri bilir. */
export function amiralAim(v: AmiralView, seat: number, d: Difficulty, rng: Rng): number {
  const mine = v.shots[seat];
  const shot = new Map(mine.map((x) => [x.cell, x.hit]));
  const sunkCells = new Set(v.sunk[1 - seat].flatMap(shipCells));
  const free = [...Array(100).keys()].filter((c) => !shot.has(c));
  if (d === 'kolay') return free[rng.int(free.length)];
  // Batmamış isabetler: hedef modu
  const open = mine.filter((x) => x.hit && !sunkCells.has(x.cell)).map((x) => x.cell);
  const remaining = FLEET.map((f) => f.len).filter((len, i, arr) => {
    const sunkLens = v.sunk[1 - seat].map((s) => s.len);
    const k = arr.slice(0, i + 1).filter((x) => x === len).length;
    return sunkLens.filter((x) => x === len).length < k;
  });
  const heat = new Array(100).fill(0);
  for (const len of remaining) for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) for (const dir of ['y', 'd'] as const) {
    const s: Ship = { r, c, len, dir };
    if ((dir === 'y' && c + len > 10) || (dir === 'd' && r + len > 10)) continue;
    const cells = shipCells(s);
    if (cells.some((x) => (shot.has(x) && !shot.get(x)) || sunkCells.has(x))) continue;
    const covers = cells.filter((x) => open.includes(x)).length;
    if (open.length && covers === 0 && d === 'zor') continue;
    for (const x of cells) if (!shot.has(x)) heat[x] += 1 + covers * 20;
  }
  if (d === 'orta') {
    if (open.length) {
      const nb = open.flatMap((x) => [x - 10, x + 10, x % 10 ? x - 1 : -1, x % 10 < 9 ? x + 1 : -1]).filter((x) => x >= 0 && x < 100 && !shot.has(x));
      if (nb.length) return nb[rng.int(nb.length)];
    }
    const parity = free.filter((x) => (Math.floor(x / 10) + (x % 10)) % 2 === 0);
    return (parity.length ? parity : free)[rng.int((parity.length ? parity : free).length)];
  }
  let best = free[0], bv = -1;
  for (const x of free) if (heat[x] > bv || (heat[x] === bv && rng.int(2))) { bv = heat[x]; best = x; }
  return best;
}
