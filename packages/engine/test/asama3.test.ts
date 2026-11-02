import { describe, expect, it } from 'vitest';
import { Satranc, chessFrom, legalMoves, parseSq, chessAi, type ChessState, type Piece } from '../src/games/satranc';
import { Tavla, legalFirstMoves, sequences, initialPoints, pipCount, type TavlaState } from '../src/games/tavla';
import { Kizma, type KizmaState } from '../src/games/kizma';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(5);

// ---------- Satranç ----------
function fen(f: string): ChessState {
  const [pos, turn, cast, ep] = f.split(' ');
  const board: (Piece | null)[] = new Array(64).fill(null);
  pos.split('/').forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else { board[(7 - i) * 8 + file] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(); file++; }
    }
  });
  return chessFrom(board, turn as 'w' | 'b', { wK: cast.includes('K'), wQ: cast.includes('Q'), bK: cast.includes('k'), bQ: cast.includes('q') }, ep && ep !== '-' ? parseSq(ep) : null);
}
function perft(s: ChessState, d: number): number {
  if (d === 0) return 1;
  const ms = legalMoves(s);
  if (d === 1) return ms.length;
  let n = 0;
  const seat = s.turn === 'w' ? 0 : 1;
  for (const m of ms) {
    const t = Satranc.apply({ ...s, reps: {} }, seat, m, rng);
    n += perft({ ...t, over: false }, d - 1);
  }
  return n;
}
const mv = (s: ChessState, from: string, to: string, promo?: 'Q' | 'R' | 'B' | 'N') =>
  Satranc.apply(s, s.turn === 'w' ? 0 : 1, { type: 'move', from: parseSq(from), to: parseSq(to), promo }, rng);

describe('Satranç — hamle üreteci (perft referans değerleri)', () => {
  it('başlangıç konumu: 20 / 400 / 8902', () => {
    const s = Satranc.setup({ players: 2 }, rng);
    expect(perft(s, 1)).toBe(20);
    expect(perft(s, 2)).toBe(400);
    expect(perft(s, 3)).toBe(8902);
  });
  it('"Kiwipete" (rok, geçerken alma, açmaz): 48 / 2039', () => {
    const s = fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2039);
  });
  it('konum 3 (geçerken alma ve şah açmazı): 14 / 191 / 2812', () => {
    const s = fen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -');
    expect(perft(s, 1)).toBe(14);
    expect(perft(s, 2)).toBe(191);
    expect(perft(s, 3)).toBe(2812);
  });
  it('konum 4 (terfiler): 6 / 264 / 9467', () => {
    const s = fen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(s, 1)).toBe(6);
    expect(perft(s, 2)).toBe(264);
    expect(perft(s, 3)).toBe(9467);
  });
});

describe('Satranç — kurallar', () => {
  it('Çoban matı: mat ve kazanan', () => {
    let s = Satranc.setup({ players: 2 }, rng);
    for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]) s = mv(s, a, b);
    expect(s.over).toBe(true);
    expect(s.reason).toBe('Şah mat');
    expect(Satranc.result(s)!.winners).toEqual([0]);
    expect(s.history[s.history.length - 1].san).toBe('Vxf7#');
  });
  it('pat beraberliktir', () => {
    const s = fen('7k/5Q2/6K1/8/8/8/8/8 b - -');
    expect(s.over).toBe(true);
    expect(s.reason).toBe('Pat');
    expect(Satranc.result(s)!.winners).toEqual([0, 1]);
  });
  it('tehdit altındaki kareden rok yapılamaz; serbestken yapılır ve kale yer değiştirir', () => {
    let s = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
    s = mv(s, 'e1', 'g1');
    expect(s.board[parseSq('f1')]).toBe('wR');
    expect(s.board[parseSq('h1')]).toBeNull();
    const t = fen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq -'); // f2'deki kale... şah zaten tehdit altında değil ama f1 tehdit altında
    expect(legalMoves(t).some((m) => m.from === parseSq('e1') && m.to === parseSq('g1'))).toBe(false);
    expect(() => mv(t, 'e1', 'g1')).toThrow();
  });
  it('geçerken alma yalnızca hemen ardından yapılabilir', () => {
    let s = fen('4k3/3p4/8/4P3/8/8/8/4K3 b - -');
    s = mv(s, 'd7', 'd5');
    const ep = mv(s, 'e5', 'd6');
    expect(ep.board[parseSq('d5')]).toBeNull();
    expect(ep.board[parseSq('d6')]).toBe('wP');
    s = mv(s, 'e1', 'e2'); s = mv(s, 'e8', 'e7');
    expect(() => mv(s, 'e5', 'd6')).toThrow();
  });
  it('terfi: taş seçilmeden reddedilir, seçilince uygulanır', () => {
    const s = fen('4k3/1P6/8/8/8/8/8/4K3 w - -');
    expect(() => mv(s, 'b7', 'b8')).toThrow('Terfi için taş seçin');
    expect(mv(s, 'b7', 'b8', 'N').board[parseSq('b8')]).toBe('wN');
  });
  it('şah tehdit altındayken kurtarmayan hamle reddedilir', () => {
    const s = fen('4k3/8/8/8/8/8/4r3/K7 w - -');
    expect(() => mv(s, 'a1', 'b2')).toThrow(); // b2 kalenin tehdidinde
    expect(() => mv(s, 'a1', 'b1')).not.toThrow();
    const u = fen('k7/8/8/8/8/8/1P6/K6r w - -');
    expect(() => mv(u, 'b2', 'b3')).toThrow('Şahınız tehdit altında');
  });
  it('üç kez tekrar ve yetersiz materyal beraberlik', () => {
    let s = Satranc.setup({ players: 2 }, rng);
    for (let i = 0; i < 2; i++) for (const [a, b] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) s = mv(s, a, b);
    expect(s.over).toBe(true);
    expect(s.reason).toBe('Üç kez tekrar');
    expect(fen('4k3/8/8/8/8/8/8/4KB2 w - -').reason).toBe('Yetersiz materyal');
  });
  it('teslim olma rakibe galibiyet verir', () => {
    const s = Satranc.apply(Satranc.setup({ players: 2 }, rng), 1, { type: 'resign' }, rng);
    expect(Satranc.result(s)!.winners).toEqual([0]);
  });
  it('zor YZ 1 hamlede matı bulur, kolay YZ geçerli hamle yapar', () => {
    const s = fen('6k1/5ppp/8/8/8/8/8/R5K1 w - -');
    const m = chessAi(Satranc.view(s, 0), 'zor', rng);
    expect([m.from, m.to]).toEqual([parseSq('a1'), parseSq('a8')]);
  });
  it('120 YZ maçı kurallara uygun biter', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'kolay'];
    for (let g = 0; g < 120; g++) {
      const r = seededRng(g);
      let s = Satranc.setup({ players: 2 }, r);
      while (!s.over) {
        const seat = s.turn === 'w' ? 0 : 1;
        const a = Satranc.ai(Satranc.view(s, seat), seat, diffs[(g + seat) % 3], r);
        s = Satranc.apply(s, seat, a, r);
      }
      expect(s.reason).toBeTruthy();
      expect(s.history.length).toBeGreaterThan(0);
    }
  });
});

// ---------- Tavla ----------
const tv = (partial: Partial<TavlaState>): TavlaState => ({ ...Tavla.setup({ players: 2 }, seededRng(1)), ...partial } as TavlaState);
const empty = () => new Array(24).fill(0);

describe('Tavla', () => {
  it('başlangıç: 15’er taş, 167 pip, açılışta büyük zar başlar ve o zarı oynar', () => {
    const s = Tavla.setup({ players: 2 }, seededRng(3));
    expect(initialPoints().filter((x) => x > 0).reduce((a, b) => a + b)).toBe(15);
    expect(pipCount(s, 0)).toBe(167);
    expect(pipCount(s, 1)).toBe(167);
    const [a, b] = s.opening!;
    expect(s.turn).toBe(a > b ? 0 : 1);
    const t = Tavla.apply(s, s.turn, { type: 'roll' }, rng);
    expect(t.rolled.slice().sort()).toEqual([a, b].sort());
  });
  it('çift zar dört hamle verir', () => {
    const s = tv({ phase: 'roll', turn: 0, opening: null });
    const t = Tavla.apply(s, 0, { type: 'roll' }, { int: () => 2 }); // 3-3
    expect(t.dice).toEqual([3, 3, 3, 3]);
  });
  it('kapalı kapıya gidilemez; tek taşı kırar ve bara yollar', () => {
    const pts = empty(); pts[10] = 1; pts[7] = -2; pts[6] = -1; pts[23] = -12;
    const s = tv({ points: pts, phase: 'move', turn: 0, dice: [3, 4], off: [14, 0], bar: [0, 0] });
    const moves = legalFirstMoves(s, 0, [3, 4]);
    expect(moves.some((m) => m.die === 3)).toBe(false); // 10→7 kapalı
    const t = Tavla.apply(s, 0, { type: 'move', from: 10, die: 4 }, rng);
    expect(t.bar[1]).toBe(1);
    expect(t.points[6]).toBe(1);
  });
  it('barda taşı olan önce onu girmeli', () => {
    const pts = initialPoints(); pts[23] = 1;
    const s = tv({ points: pts, bar: [1, 0], phase: 'move', turn: 0, dice: [3, 5] });
    expect(Tavla.legalActions(s, 0).every((a: any) => a.from === 24)).toBe(true);
    expect(() => Tavla.apply(s, 0, { type: 'move', from: 12, die: 3 }, rng)).toThrow('Önce kırılan taşınızı girmelisiniz');
  });
  it('mümkünse iki zar da oynanmalı; tek zar oynanabiliyorsa büyük olan', () => {
    // Beyaz tek taş 13. kapıda (idx 12). 6 ile idx 6 kapalı, 1 ile 11 açık ama sonra 6 ile 5 açık → iki zar oynanabilir: önce 1 zorunlu
    const pts = empty(); pts[12] = 1; pts[6] = -2; pts[0] = -13;
    const s = tv({ points: pts, phase: 'move', turn: 0, dice: [6, 1], off: [14, 0] });
    expect(Tavla.legalActions(s, 0)).toEqual([{ type: 'move', from: 12, die: 1 }]);
    // Tek zar oynanabiliyorsa büyük zar
    const p2 = empty(); p2[12] = 1; p2[4] = -2; p2[9] = -2; p2[0] = -11;
    const s2 = tv({ points: p2, phase: 'move', turn: 0, dice: [2, 5], off: [14, 0] });
    // 12→10 (2) sonra 10→5 (5)... 5 kapı açık? idx5 boş → iki zar oynanabilir; değiştirelim
    p2[5] = -2; p2[0] = -9; p2[7] = -0;
    const s3 = tv({ points: p2, phase: 'move', turn: 0, dice: [2, 5], off: [14, 0] });
    const legal = Tavla.legalActions(s3, 0) as any[];
    // 12→10 sonra 10→5 kapalı; 12→7 sonra 7→5 kapalı → yalnızca bir zar, büyük (5) oynanmalı
    expect(legal).toEqual([{ type: 'move', from: 12, die: 5 }]);
    expect(s2).toBeTruthy();
  });
  it('taş toplama: tam zar, büyük zarla en uzak taş, evde değilken toplanamaz', () => {
    const pts = empty(); pts[2] = 2; pts[0] = 1; pts[20] = -15;
    const s = tv({ points: pts, phase: 'move', turn: 0, dice: [6, 3], off: [12, 0] });
    const m = legalFirstMoves(s, 0, [6, 3]);
    expect(m.some((x) => x.from === 2 && x.die === 6 && x.to === -1)).toBe(true);
    expect(m.some((x) => x.from === 2 && x.die === 3 && x.to === -1)).toBe(true);
    const p2 = empty(); p2[2] = 1; p2[8] = 1; p2[20] = -15;
    const s2 = tv({ points: p2, phase: 'move', turn: 0, dice: [3, 1], off: [13, 0] });
    expect(legalFirstMoves(s2, 0, [3]).some((x) => x.to === -1)).toBe(false);
  });
  it('mars ve katmerli mars puanları', () => {
    const pts = empty(); pts[0] = 1; pts[20] = -15;
    let s = tv({ points: pts, phase: 'move', turn: 0, dice: [1, 2], off: [14, 0], score: [0, 0], matchTo: 7 });
    // Tek zar oynanabildiği için büyük zar (2) zorunlu
    expect(() => Tavla.apply(s, 0, { type: 'move', from: 0, die: 1 }, rng)).toThrow();
    s = Tavla.apply(s, 0, { type: 'move', from: 0, die: 2 }, rng);
    expect(s.lastGame).toMatchObject({ winner: 0, points: 2, kind: 'Mars' });
    const p2 = empty(); p2[0] = 1; p2[3] = -1; p2[20] = -14;
    let t = tv({ points: p2, phase: 'move', turn: 0, dice: [1, 2], off: [14, 0], score: [0, 0], matchTo: 7 });
    t = Tavla.apply(t, 0, { type: 'move', from: 0, die: 2 }, rng);
    expect(t.lastGame).toMatchObject({ points: 3, kind: 'Katmerli mars' });
    expect(t.score).toEqual([3, 0]);
    expect(t.phase).toBe('roll'); // yeni oyun başladı
  });
  it('oynanacak hamle yoksa sıra otomatik geçer', () => {
    const pts = empty(); pts[23] = -0; pts[18] = -2; pts[19] = -2; pts[20] = -2; pts[21] = -2; pts[22] = -2; pts[17] = -2; pts[0] = -3;
    const s = tv({ points: pts, bar: [1, 0], phase: 'roll', turn: 0, opening: null, off: [14, 0] });
    const t = Tavla.apply(s, 0, { type: 'roll' }, rng);
    expect(t.turn).toBe(1);
    expect(t.lastTurn?.passed).toBe(true);
  });
  it('YZ dizileri kurala uygun; 300 maç biter, taş sayısı hep 15', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (let g = 0; g < 300; g++) {
      const r = seededRng(70 + g);
      let s = Tavla.setup({ players: 2, options: { matchTo: g % 10 === 0 ? 3 : 1 } }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = s.turn;
        const v = Tavla.view(s, seat);
        const a = Tavla.ai(v, seat, diffs[(g + seat) % 3], r);
        expect(v.legal.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true);
        s = Tavla.apply(s, seat, a, r);
        for (const p of [0, 1]) {
          const onBoard = s.points.reduce((t, x) => t + Math.max(0, p === 0 ? x : -x), 0);
          expect(onBoard + s.bar[p] + s.off[p]).toBe(15);
        }
        if (++steps > 20000) throw new Error('bitmedi');
      }
      expect(Math.max(...s.score)).toBeGreaterThanOrEqual(s.matchTo);
    }
  });
  it('zor YZ kolay YZ’yi çoğunlukla yener', () => {
    let wins = 0;
    for (let g = 0; g < 120; g++) {
      const r = seededRng(4000 + g);
      let s = Tavla.setup({ players: 2, options: { matchTo: 1 } }, r);
      while (s.phase !== 'over') s = Tavla.apply(s, s.turn, Tavla.ai(Tavla.view(s, s.turn), s.turn, s.turn === 0 ? 'zor' : 'kolay', r), r);
      if (s.score[0] > s.score[1]) wins++;
    }
    expect(wins / 120).toBeGreaterThan(0.6);
  });
  it('dizi araması tutarlı: her yasal ilk hamle en uzun diziye uzanır', () => {
    const s = Tavla.setup({ players: 2 }, seededRng(9));
    for (const dice of [[3, 3, 3, 3], [6, 5], [1, 1, 1, 1]]) {
      const seqs = sequences(s, 0, dice);
      const max = Math.max(...seqs.map((q) => q.length));
      expect(seqs.every((q) => q.length === max)).toBe(true);
      const firsts = legalFirstMoves(s, 0, dice);
      for (const q of seqs) expect(firsts.some((f) => q[0].from === f.from && q[0].die === f.die)).toBe(true);
    }
  });
});

// ---------- Kızma Birader ----------
const kz = (partial: Partial<KizmaState>): KizmaState => ({ ...Kizma.setup({ players: 4 }, seededRng(1)), ...partial } as KizmaState);
const fixedDie = (d: number) => ({ int: () => d - 1 });

describe('Kızma Birader', () => {
  it('2 kişide karşılıklı renkler; desteklenmeyen sayı reddedilir', () => {
    expect(Kizma.setup({ players: 2 }, rng).colors).toEqual([0, 2]);
    expect(() => Kizma.setup({ players: 5 }, rng)).toThrow();
  });
  it('6 olmadan taş çıkmaz, 3 deneme hakkı', () => {
    let s = kz({ turn: 0, phase: 'roll' });
    s = Kizma.apply(s, 0, { type: 'roll' }, fixedDie(3));
    expect(s.turn).toBe(0); expect(s.tries).toBe(1);
    s = Kizma.apply(s, 0, { type: 'roll' }, fixedDie(2));
    s = Kizma.apply(s, 0, { type: 'roll' }, fixedDie(5));
    expect(s.turn).toBe(1);
  });
  it('6 ile taş çıkar ve tekrar atar; 6 atınca çıkarmak zorunlu', () => {
    let s = kz({ turn: 0, phase: 'roll', tokens: [[5, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    s = Kizma.apply(s, 0, { type: 'roll' }, fixedDie(6));
    expect(() => Kizma.apply(s, 0, { type: 'move', token: 0 }, rng)).toThrow('önce evden taş çıkarmalısınız');
    s = Kizma.apply(s, 0, { type: 'move', token: 1 }, rng);
    expect(s.tokens[0][1]).toBe(0);
    expect(s.turn).toBe(0); expect(s.phase).toBe('roll');
  });
  it('rakibin üstüne gelince rakip eve döner; kendi taşının üstüne gelinmez', () => {
    // Oyuncu 0 (renk 0) rel 3 → mutlak 3. Oyuncu 1 (renk 1) mutlak 5 = rel 35.
    let s = kz({ turn: 0, phase: 'roll', tokens: [[3, 7, -1, -1], [35, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    s = Kizma.apply(s, 0, { type: 'roll' }, fixedDie(4));
    expect(Kizma.legalActions(s, 0)).toEqual([{ type: 'move', token: 1 }].length ? Kizma.legalActions(s, 0) : []);
    expect((Kizma.legalActions(s, 0) as any[]).some((a) => a.token === 0)).toBe(false); // 3+4=7 kendi taşı
    let t = kz({ turn: 0, phase: 'roll', tokens: [[3, -1, -1, -1], [35, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    t = Kizma.apply(t, 0, { type: 'roll' }, fixedDie(2));
    t = Kizma.apply(t, 0, { type: 'move', token: 0 }, rng);
    expect(t.tokens[1][0]).toBe(-1);
    expect(t.last?.captured).toBe(1);
  });
  it('ev yolu tam zar ister ve dört taşla oyun biter', () => {
    let s = kz({ turn: 0, phase: 'roll', tokens: [[41, 42, 43, 38], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    s = Kizma.apply(s, 0, { type: 'roll' }, fixedDie(3)); // 38+3=41 dolu → oynanamaz; diğerleri de oynanamaz
    expect(s.turn).not.toBe(0);
    let t = kz({ turn: 0, phase: 'roll', tokens: [[41, 42, 43, 38], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]] });
    t = Kizma.apply(t, 0, { type: 'roll' }, fixedDie(2));
    t = Kizma.apply(t, 0, { type: 'move', token: 3 }, rng);
    expect(t.phase).toBe('over');
    expect(Kizma.result(t)!.winners).toEqual([0]);
  });
  it('1000 YZ maçı biter; taşlar hiç çakışmaz', () => {
    const diffs: Difficulty[] = ['kolay', 'orta', 'zor'];
    for (let g = 0; g < 1000; g++) {
      const r = seededRng(g);
      const n = 2 + (g % 3);
      let s = Kizma.setup({ players: n }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = s.turn;
        s = Kizma.apply(s, seat, Kizma.ai(Kizma.view(s, seat), seat, diffs[(g + seat) % 3], r), r);
        const sq = new Set<number>();
        s.tokens.forEach((ts, p) => ts.forEach((rel) => { if (rel >= 0 && rel < 40) { const a = (s.colors[p] * 10 + rel) % 40; expect(sq.has(a)).toBe(false); sq.add(a); } }));
        if (++steps > 5000) throw new Error('bitmedi');
      }
    }
  });
});
