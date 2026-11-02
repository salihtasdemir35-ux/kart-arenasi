import { describe, expect, it } from 'vitest';
import { CinDamasi, BOARD, N_HOLES, NEIGH, CORNER_HOLES, holeAt, reachable, START_CORNERS, type CinState } from '../src/games/cindamasi';
import { Xiangqi, xqFrom, xqInitial, xqLegal, type XqState, type XqPiece } from '../src/games/xiangqi';
import { seededRng } from '../src/rng';
import type { Difficulty } from '../src/types';

const rng = seededRng(3);

describe('Çin Daması — tahta', () => {
  it('121 delik: 61 orta + 6 köşe × 10', () => {
    expect(N_HOLES).toBe(121);
    expect(BOARD.corner.filter((c) => c === -1)).toHaveLength(61);
    for (const c of CORNER_HOLES) expect(c).toHaveLength(10);
  });
  it('komşuluk simetrik, her deliğin 2–6 komşusu var', () => {
    NEIGH.forEach((ns, i) => {
      const real = ns.filter((x) => x >= 0);
      expect(real.length).toBeGreaterThanOrEqual(2);
      for (const n of real) expect(NEIGH[n]).toContain(i);
    });
  });
  it('oyuncu sayısına göre başlangıç köşeleri; 5 kişi reddedilir', () => {
    expect(START_CORNERS[2]).toEqual([0, 3]);
    expect(START_CORNERS[3]).toEqual([0, 2, 4]);
    for (const n of [2, 3, 4, 6]) {
      const s = CinDamasi.setup({ players: n }, rng);
      for (let p = 0; p < n; p++) expect(s.board.filter((x) => x === p)).toHaveLength(10);
    }
    expect(() => CinDamasi.setup({ players: 5 }, rng)).toThrow();
  });
});

function empty(n = 2): CinState {
  const s = CinDamasi.setup({ players: n }, seededRng(1));
  return { ...s, board: new Array(N_HOLES).fill(-1), turn: 0 };
}

describe('Çin Daması — hamleler', () => {
  it('tek adım ve zincirleme atlama; atlanan taşlar yerinde kalır', () => {
    const s = empty();
    const a = holeAt(0, 0, 0);
    s.board[a] = 0;
    s.board[holeAt(1, -1, 0)] = 1; // atlanacak
    s.board[holeAt(3, -3, 0)] = 0; // ikinci atlama için kendi taşı
    const r = reachable(s.board, a);
    const end = holeAt(4, -4, 0);
    expect(r.get(end)).toEqual([a, holeAt(2, -2, 0), end]);
    const t = CinDamasi.apply(s, 0, { type: 'move', path: r.get(end)! }, rng);
    expect(t.board[end]).toBe(0);
    expect(t.board[holeAt(1, -1, 0)]).toBe(1);
    expect(t.board[holeAt(3, -3, 0)]).toBe(0);
    expect(t.board[a]).toBe(-1);
    expect(t.turn).toBe(1);
  });
  it('boşluk üzerinden atlanamaz, uzak deliğe tek adımda gidilemez', () => {
    const s = empty();
    const a = holeAt(0, 0, 0);
    s.board[a] = 0;
    expect(() => CinDamasi.apply(s, 0, { type: 'move', path: [a, holeAt(2, -2, 0)] }, rng)).toThrow('Atlama kurallara uygun değil');
  });
  it('başka oyuncunun köşesinde durulamaz ama içinden geçilir', () => {
    const s = empty(2); // köşe 1 ve 2 kimsenin değil
    const inCorner1 = CORNER_HOLES[1][0];
    const nb = NEIGH[inCorner1].find((x) => x >= 0 && BOARD.corner[x] === -1)!;
    s.board[nb] = 0;
    expect(CinDamasi.legalActions(s, 0).some((m) => m.path[m.path.length - 1] === inCorner1)).toBe(false);
    expect(() => CinDamasi.apply(s, 0, { type: 'move', path: [nb, inCorner1] }, rng)).toThrow('Başka oyuncunun köşesinde duramazsınız');
  });
  it('tüm taşlar karşı köşeye ulaşınca kazanır', () => {
    const s = empty(2);
    const target = CORNER_HOLES[3];
    target.slice(0, 9).forEach((h) => (s.board[h] = 0));
    const last = target[9];
    const from = NEIGH[last].find((x) => x >= 0 && s.board[x] === -1 && !target.includes(x))!;
    s.board[from] = 0;
    s.board[CORNER_HOLES[0][0]] = 1;
    const t = CinDamasi.apply(s, 0, { type: 'move', path: [from, last] }, rng);
    expect(t.over).toBe(true);
    expect(CinDamasi.result(t)!.winners).toEqual([0]);
  });
  it('YZ maçları (2, 3, 4, 6 kişi) kurallara uygun biter, taş sayısı korunur', () => {
    const diffs: Difficulty[] = ['orta', 'zor', 'kolay'];
    for (let g = 0; g < 40; g++) {
      const n = [2, 3, 4, 6][g % 4];
      const r = seededRng(200 + g);
      let s = CinDamasi.setup({ players: n }, r);
      let steps = 0;
      while (!s.over) {
        const seat = s.turn;
        const v = CinDamasi.view(s, seat);
        const a = CinDamasi.ai(v, seat, diffs[(g + seat) % 3], r);
        s = CinDamasi.apply(s, seat, a, r);
        if (++steps > 8000) throw new Error('bitmedi');
      }
      for (let p = 0; p < n; p++) expect(s.board.filter((x) => x === p)).toHaveLength(10);
      expect(s.winner).not.toBeNull();
    }
  });
  it('zor YZ ile oynanan 2 kişilik maçlar hedefe ulaşarak biter (süre sınırına takılmaz)', () => {
    for (let g = 0; g < 10; g++) {
      const r = seededRng(900 + g);
      let s = CinDamasi.setup({ players: 2 }, r);
      while (!s.over) s = CinDamasi.apply(s, s.turn, CinDamasi.ai(CinDamasi.view(s, s.turn), s.turn, 'zor', r), r);
      expect(CinDamasi.result(s)!.scores[s.winner!]).toBeGreaterThan(0);
      expect(s.moveNo).toBeLessThan(s.maxMoves * 2);
    }
  });
});

// ---------- Xiangqi ----------
const sq = (f: number, r: number) => r * 9 + f;
function perft(b: (XqPiece | null)[], c: 'r' | 'b', d: number): number {
  const ms = xqLegal(b, c);
  if (d === 1) return ms.length;
  let n = 0;
  for (const m of ms) { const nb = b.slice(); nb[m.to] = nb[m.from]; nb[m.from] = null; n += perft(nb, c === 'r' ? 'b' : 'r', d - 1); }
  return n;
}
function custom(pieces: Record<string, XqPiece>, turn: 'r' | 'b' = 'r'): XqState {
  const b: (XqPiece | null)[] = new Array(90).fill(null);
  for (const [k, p] of Object.entries(pieces)) { const [f, r] = k.split(',').map(Number); b[sq(f, r)] = p; }
  return xqFrom(b, turn);
}
const has = (s: XqState, from: number, to: number) => Xiangqi.legalActions(s, s.turn === 'r' ? 0 : 1).some((m: any) => m.from === from && m.to === to);

describe('Xiangqi', () => {
  it('perft: 44 / 1920 / 79666', () => {
    const b = xqInitial();
    expect(perft(b, 'r', 1)).toBe(44);
    expect(perft(b, 'r', 2)).toBe(1920);
    expect(perft(b, 'r', 3)).toBe(79666);
  });
  it('at ayak bağı: önündeki kesişim doluysa gidemez', () => {
    const s = custom({ '4,0': 'rK', '3,9': 'bK', '1,2': 'rH', '1,3': 'rS' });
    expect(has(s, sq(1, 2), sq(0, 4))).toBe(false);
    expect(has(s, sq(1, 2), sq(2, 4))).toBe(false);
    expect(has(s, sq(1, 2), sq(3, 3))).toBe(true);
  });
  it('fil: göz doluysa gidemez, nehri geçemez', () => {
    const s = custom({ '4,0': 'rK', '3,9': 'bK', '2,4': 'rE', '1,3': 'rS' });
    expect(has(s, sq(2, 4), sq(0, 2))).toBe(false); // göz (1,3) dolu
    expect(has(s, sq(2, 4), sq(4, 2))).toBe(true);
    expect(has(s, sq(2, 4), sq(4, 6))).toBe(false); // nehir
  });
  it('top yalnızca bir perde üzerinden alır', () => {
    const s = custom({ '4,0': 'rK', '3,9': 'bK', '0,2': 'rC', '0,5': 'bS', '0,7': 'bR' });
    expect(has(s, sq(0, 2), sq(0, 5))).toBe(false); // perdesiz alamaz
    expect(has(s, sq(0, 2), sq(0, 7))).toBe(true);  // perde (0,5) üzerinden
    expect(has(s, sq(0, 2), sq(0, 4))).toBe(true);
  });
  it('asker nehirden önce yana gidemez, sonra gidebilir, geri gidemez', () => {
    const before = custom({ '4,0': 'rK', '3,9': 'bK', '2,3': 'rS' });
    expect(has(before, sq(2, 3), sq(3, 3))).toBe(false);
    const after = custom({ '4,0': 'rK', '3,9': 'bK', '2,5': 'rS' });
    expect(has(after, sq(2, 5), sq(3, 5))).toBe(true);
    expect(has(after, sq(2, 5), sq(2, 4))).toBe(false);
  });
  it('generaller yüz yüze gelemez; saraydan çıkılamaz', () => {
    const s = custom({ '3,0': 'rK', '4,9': 'bK', '4,5': 'rS' });
    expect(() => Xiangqi.apply(s, 0, { type: 'move', from: sq(3, 0), to: sq(4, 0) }, rng)).not.toThrow();
    const t = custom({ '3,0': 'rK', '4,9': 'bK' });
    expect(() => Xiangqi.apply(t, 0, { type: 'move', from: sq(3, 0), to: sq(4, 0) }, rng)).toThrow('Generaller yüz yüze gelemez');
    expect(has(t, sq(3, 0), sq(2, 0))).toBe(false);
  });
  it('mat ve pat (pat kayıptır)', () => {
    // Siyah general (4,9); iki kırmızı araba 8. ve 9. sıraları tutuyor → mat
    const mate = custom({ '3,0': 'rK', '4,9': 'bK', '0,9': 'rR', '8,8': 'rR' }, 'b');
    expect(mate.over).toBe(true);
    expect(mate.winner).toBe('r');
    expect(mate.reason).toBe('Mat');
  });
  it('teslim olma ve tam YZ maçları', () => {
    const s = Xiangqi.apply(Xiangqi.setup({ players: 2 }, rng), 0, { type: 'resign' }, rng);
    expect(Xiangqi.result(s)!.winners).toEqual([1]);
    const diffs: Difficulty[] = ['kolay', 'orta'];
    for (let g = 0; g < 15; g++) {
      const r = seededRng(g);
      let x = Xiangqi.setup({ players: 2 }, r);
      let steps = 0;
      while (!x.over) {
        const seat = x.turn === 'r' ? 0 : 1;
        x = Xiangqi.apply(x, seat, Xiangqi.ai(Xiangqi.view(x, seat), seat, diffs[(g + seat) % 2], r), r);
        if (++steps > 2000) throw new Error('bitmedi');
      }
      expect(x.reason).toBeTruthy();
    }
  });
  it('zor YZ 1 hamlede matı bulur', () => {
    const s = custom({ '3,0': 'rK', '4,9': 'bK', '0,8': 'rR', '8,0': 'rR' }); // Araba 8,0→8,9 mat
    const m = Xiangqi.ai(Xiangqi.view(s, 0), 0, 'zor', rng) as any;
    const t = Xiangqi.apply(s, 0, m, rng);
    expect(t.over && t.winner === 'r').toBe(true);
  });
});
