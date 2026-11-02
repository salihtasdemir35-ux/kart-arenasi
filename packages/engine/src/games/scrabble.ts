import { shuffle } from '../rng';
import { IllegalMoveError, type Difficulty, type GameModule, type Rng } from '../types';

/**
 * SCRABBLE (TÜRKÇE / İNGİLİZCE) — uygulanan kurallar
 * - 15×15 tahta; standart Harf ×2 / Harf ×3 / Kelime ×2 / Kelime ×3 kareleri. Merkez Kelime ×2'dir.
 * - Her dilin kendi harf dağılımı ve puanları (100 taş, 2 joker). Oyuncu başına 7 taş.
 * - İlk kelime merkezden geçmeli ve en az 2 harf olmalı. Sonraki kelimeler mevcut harflere bağlanmalı.
 * - Taşlar tek satır veya tek sütunda, arada boşluk kalmadan konur.
 * - Hamlede oluşan TÜM kelimeler (ana kelime + çapraz kelimeler) kontrol edilir ve puanlanır.
 * - Özel kareler yalnızca o hamlede konan taşlar için geçerlidir. Joker 0 puandır.
 * - 7 taşın hepsini kullanmak +50 puan.
 * - Harf değiştirme (torbada en az 7 taş varken) ve pas.
 * - Doğrulama modu: "otomatik" (sözlükte olmayan kelime reddedilir) veya
 *   "itirazlı" (hamle masaya konur; sıradaki oyuncu itiraz edebilir. Kelime geçersizse hamle geri alınır,
 *   geçerliyse itiraz eden sırasını kaybeder).
 * - Oyun sonu: torba boşken bir oyuncu tüm taşlarını bitirirse diğerlerinin elindeki puanlar ona eklenir,
 *   diğerlerinden düşülür. Üst üste 6 puansız tur (pas, değiştirme, reddedilen hamle) olursa herkes elindekini kaybeder.
 */

export type Lang = 'tr' | 'en';

export const TILESET: Record<Lang, { counts: Record<string, number>; points: Record<string, number> }> = {
  en: {
    counts: { A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, '?': 2 },
    points: { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, '?': 0 },
  },
  tr: {
    counts: { A: 12, B: 2, C: 2, Ç: 2, D: 2, E: 8, F: 1, G: 1, Ğ: 1, H: 1, I: 4, İ: 7, J: 1, K: 7, L: 7, M: 4, N: 5, O: 3, Ö: 1, P: 1, R: 6, S: 3, Ş: 2, T: 5, U: 3, Ü: 2, V: 1, Y: 2, Z: 2, '?': 2 },
    points: { A: 1, B: 3, C: 4, Ç: 4, D: 3, E: 1, F: 7, G: 5, Ğ: 8, H: 5, I: 2, İ: 1, J: 10, K: 1, L: 1, M: 2, N: 1, O: 2, Ö: 7, P: 5, R: 1, S: 2, Ş: 4, T: 1, U: 2, Ü: 3, V: 7, Y: 3, Z: 4, '?': 0 },
  },
};
export const ALPHABET: Record<Lang, string[]> = { en: Object.keys(TILESET.en.counts).filter((l) => l !== '?'), tr: Object.keys(TILESET.tr.counts).filter((l) => l !== '?') };

// ---------- Sözlük ----------
const DICTS: Partial<Record<Lang, string[]>> = {};
/** Sıralı, küçük harfli kelime listesi kaydeder. */
export function registerDictionary(lang: Lang, words: string[]) {
  const arr = words.filter(Boolean);
  for (let i = 1; i < arr.length; i++) if (arr[i - 1] > arr[i]) { arr.sort(); break; }
  DICTS[lang] = arr;
}
export const hasDictionary = (lang: Lang) => !!DICTS[lang];
export const toKey = (lang: Lang, upper: string) => upper.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US');
function lowerBound(arr: string[], w: string) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < w) lo = m + 1; else hi = m; }
  return lo;
}
export function isWord(lang: Lang, upper: string): boolean {
  const d = DICTS[lang];
  if (!d) throw new Error('Sözlük yüklenmedi');
  const w = toKey(lang, upper);
  const i = lowerBound(d, w);
  return d[i] === w;
}
function isPrefix(d: string[], lowerPrefix: string) {
  const i = lowerBound(d, lowerPrefix);
  return i < d.length && d[i].startsWith(lowerPrefix);
}

// ---------- Tahta ----------
export type Premium = 'TW' | 'DW' | 'TL' | 'DL' | null;
export const PREMIUM: Premium[] = (() => {
  const p: Premium[] = new Array(225).fill(null);
  const set = (list: number[][], v: Premium) => list.forEach(([r, c]) => { for (const [rr, cc] of [[r, c], [c, r], [14 - r, c], [r, 14 - c], [14 - r, 14 - c], [c, 14 - r], [14 - c, r], [14 - c, 14 - r]]) p[rr * 15 + cc] = v; });
  set([[0, 0], [0, 7]], 'TW');
  set([[1, 1], [2, 2], [3, 3], [4, 4], [7, 7]], 'DW');
  set([[1, 5], [5, 5]], 'TL');
  set([[0, 3], [2, 6], [3, 7], [6, 6]], 'DL');
  return p;
})();
export const CENTER = 112;

export interface Cell { l: string; blank: boolean; by: number }
export interface PlacedTile { i: number; l: string; as?: string }
export interface WordScore { word: string; score: number; cells: number[] }

export interface ScrabbleState {
  game: 'scrabble';
  lang: Lang;
  n: number;
  mode: 'otomatik' | 'itirazli';
  learning: boolean;
  board: (Cell | null)[];
  racks: string[][];
  bag: string[];
  scores: number[];
  turn: number;
  scoreless: number;
  phase: 'play' | 'challenge' | 'over';
  pending: { seat: number; tiles: PlacedTile[]; words: WordScore[]; score: number } | null;
  history: { seat: number; kind: 'kelime' | 'degistir' | 'pas' | 'itiraz' | 'red'; words: WordScore[]; score: number; note?: string }[];
  winner: number[] | null;
  endNote: string | null;
}

export type ScrabbleAction =
  | { type: 'place'; tiles: PlacedTile[] }
  | { type: 'exchange'; letters: string[] }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'accept' };

export interface ScrabbleView extends Omit<ScrabbleState, 'racks' | 'bag'> {
  me: number | null;
  rack: string[];
  rackCounts: number[];
  bagCount: number;
  legal: ScrabbleAction[];
  points: Record<string, number>;
}

const pts = (lang: Lang, c: Cell) => (c.blank ? 0 : TILESET[lang].points[c.l]);

/**
 * Yerleştirmeyi kurallara göre çözümler: kelimeleri ve puanı döner, kural dışıysa hata fırlatır.
 * Sözlük kontrolü YAPMAZ (çağıran yapar).
 */
export function analyzePlacement(board: (Cell | null)[], lang: Lang, tiles: PlacedTile[], seat = 0): { words: WordScore[]; score: number } {
  if (!Array.isArray(tiles) || tiles.length === 0) throw new IllegalMoveError('En az bir taş koyun');
  const idx = tiles.map((t) => t.i);
  if (new Set(idx).size !== idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i > 224)) throw new IllegalMoveError('Geçersiz kare');
  if (idx.some((i) => board[i])) throw new IllegalMoveError('Dolu kareye taş konamaz');
  const rows = new Set(idx.map((i) => Math.floor(i / 15))), cols = new Set(idx.map((i) => i % 15));
  if (rows.size > 1 && cols.size > 1) throw new IllegalMoveError('Taşlar tek satır veya tek sütunda olmalı');
  const b = board.slice();
  for (const t of tiles) {
    const letter = t.l === '?' ? t.as : t.l;
    if (!letter || !ALPHABET[lang].includes(letter)) throw new IllegalMoveError('Joker için bir harf seçin');
    b[t.i] = { l: letter, blank: t.l === '?', by: seat };
  }
  const empty = board.every((c) => !c);
  if (empty && !idx.includes(CENTER)) throw new IllegalMoveError('İlk kelime ortadaki yıldızdan geçmeli');
  if (empty && tiles.length < 2) throw new IllegalMoveError('İlk kelime en az 2 harf olmalı');

  const horiz = rows.size === 1 && (tiles.length > 1 || hasNeighbor(b, idx[0], 1));
  const step = horiz ? 1 : 15;
  const line = (i: number, s: number) => {
    let a = i;
    while (inLine(a, a - s, s) && b[a - s]) a -= s;
    const cells: number[] = [];
    for (let k = a; k >= 0 && k < 225 && b[k] && (cells.length === 0 || inLine(k - s, k, s)); k += s) cells.push(k);
    return cells;
  };
  // Boşluksuzluk: ana çizgi tüm yeni taşları kapsamalı
  const main = line(idx[0], step);
  if (!idx.every((i) => main.includes(i))) throw new IllegalMoveError('Taşlar arasında boşluk kalmamalı');
  const words: WordScore[] = [];
  const newSet = new Set(idx);
  const score = (cells: number[]) => {
    let s = 0, mul = 1;
    for (const c of cells) {
      let v = pts(lang, b[c]!);
      if (newSet.has(c)) {
        const p = PREMIUM[c];
        if (p === 'DL') v *= 2; else if (p === 'TL') v *= 3; else if (p === 'DW') mul *= 2; else if (p === 'TW') mul *= 3;
      }
      s += v;
    }
    return s * mul;
  };
  const wordOf = (cells: number[]) => cells.map((c) => b[c]!.l).join('');
  if (main.length >= 2) words.push({ word: wordOf(main), score: score(main), cells: main });
  for (const i of idx) {
    const cross = line(i, horiz ? 15 : 1);
    if (cross.length >= 2) words.push({ word: wordOf(cross), score: score(cross), cells: cross });
  }
  if (words.length === 0) throw new IllegalMoveError('En az iki harfli bir kelime oluşmalı');
  if (!empty && !words.some((w) => w.cells.some((c) => !newSet.has(c)))) throw new IllegalMoveError('Yeni kelime tahtadaki harflere bağlanmalı');
  let total = words.reduce((t, w) => t + w.score, 0);
  if (tiles.length === 7) total += 50;
  return { words, score: total };
}

function inLine(a: number, b: number, step: number) {
  if (a < 0 || b < 0 || a > 224 || b > 224) return false;
  return step === 1 ? Math.floor(a / 15) === Math.floor(b / 15) : true;
}
function hasNeighbor(b: (Cell | null)[], i: number, step: number) {
  return (inLine(i, i - step, step) && !!b[i - step]) || (inLine(i, i + step, step) && !!b[i + step]);
}

function rackValue(lang: Lang, rack: string[]) { return rack.reduce((t, l) => t + TILESET[lang].points[l], 0); }

function takeFromRack(rack: string[], tiles: PlacedTile[]) {
  const r = rack.slice();
  for (const t of tiles) {
    const k = r.indexOf(t.l);
    if (k < 0) throw new IllegalMoveError(`Elinizde "${t.l === '?' ? 'joker' : t.l}" taşı yok`);
    r.splice(k, 1);
  }
  return r;
}

function clone(s: ScrabbleState): ScrabbleState {
  return { ...s, board: s.board.slice(), racks: s.racks.map((r) => r.slice()), bag: s.bag.slice(), scores: s.scores.slice(), history: s.history.slice() };
}

function draw(s: ScrabbleState, seat: number) { while (s.racks[seat].length < 7 && s.bag.length) s.racks[seat].push(s.bag.pop()!); }

function commit(s: ScrabbleState, seat: number, tiles: PlacedTile[], words: WordScore[], score: number) {
  s.racks[seat] = takeFromRack(s.racks[seat], tiles);
  for (const t of tiles) s.board[t.i] = { l: t.l === '?' ? t.as! : t.l, blank: t.l === '?', by: seat };
  s.scores[seat] += score;
  s.history.push({ seat, kind: 'kelime', words, score });
  s.scoreless = 0;
  draw(s, seat);
  if (s.racks[seat].length === 0 && s.bag.length === 0) { endGame(s, seat); return; }
}

function endGame(s: ScrabbleState, finisher: number | null) {
  let bonus = 0;
  s.racks.forEach((r, p) => { const v = rackValue(s.lang, r); s.scores[p] -= v; bonus += v; });
  if (finisher !== null) s.scores[finisher] += bonus;
  s.phase = 'over';
  const max = Math.max(...s.scores);
  s.winner = s.scores.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  s.endNote = finisher !== null ? 'Bir oyuncu taşlarını bitirdi' : 'Üst üste 6 puansız tur';
}

function nextTurn(s: ScrabbleState) { s.turn = (s.turn + 1) % s.n; }
function scorelessTurn(s: ScrabbleState) { s.scoreless += 1; if (s.scoreless >= 6) endGame(s, null); }

export const Scrabble: GameModule<ScrabbleState, ScrabbleAction, ScrabbleView> = {
  id: 'scrabble',
  name: 'Scrabble',
  playerCounts: [2, 3, 4],
  options: [
    { key: 'lang', label: 'Dil', default: 'tr', choices: [{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'İngilizce' }] },
    { key: 'mode', label: 'Kelime kontrolü', default: 'otomatik', choices: [{ value: 'otomatik', label: 'Otomatik (geçersiz reddedilir)' }, { value: 'itirazli', label: 'İtirazlı' }] },
    { key: 'learning', label: 'Öğrenme modu (ipucu)', default: false, choices: [{ value: false, label: 'Kapalı' }, { value: true, label: 'Açık' }] },
  ],

  setup(cfg, rng) {
    if (!this.playerCounts.includes(cfg.players)) throw new IllegalMoveError('Scrabble 2–4 kişiyle oynanır');
    const lang = (cfg.options?.lang === 'en' ? 'en' : 'tr') as Lang;
    const bag: string[] = [];
    for (const [l, c] of Object.entries(TILESET[lang].counts)) for (let k = 0; k < c; k++) bag.push(l);
    const s: ScrabbleState = {
      game: 'scrabble', lang, n: cfg.players, mode: cfg.options?.mode === 'itirazli' ? 'itirazli' : 'otomatik', learning: cfg.options?.learning === true,
      board: new Array(225).fill(null), racks: Array.from({ length: cfg.players }, () => []), bag: shuffle(bag, rng),
      scores: new Array(cfg.players).fill(0), turn: rng.int(cfg.players), scoreless: 0, phase: 'play', pending: null, history: [], winner: null, endNote: null,
    };
    for (let p = 0; p < s.n; p++) draw(s, p);
    return s;
  },

  toAct(s) { return s.phase === 'over' ? [] : [s.turn]; },

  legalActions(s, seat) {
    if (s.phase === 'over' || seat !== s.turn) return [];
    if (s.phase === 'challenge') return [{ type: 'challenge' }, { type: 'accept' }];
    const acts: ScrabbleAction[] = [{ type: 'pass' }];
    if (s.bag.length >= 7) acts.push({ type: 'exchange', letters: [] });
    return acts; // yerleştirmeler sınırsız sayıda olduğu için listelenmez; apply() doğrular
  },

  apply(s0, seat, a, rng) {
    if (s0.phase === 'over') throw new IllegalMoveError('Oyun bitti');
    if (seat !== s0.turn) throw new IllegalMoveError('Sıra sizde değil');
    const s = clone(s0);

    if (s.phase === 'challenge') {
      const p = s.pending!;
      if (a?.type === 'accept') {
        s.pending = null; s.phase = 'play';
        commit(s, p.seat, p.tiles, p.words, p.score);
        return s;
      }
      if (a?.type !== 'challenge') throw new IllegalMoveError('Önce önceki kelimeyi kabul edin veya itiraz edin');
      const bad = p.words.filter((w) => !isWord(s.lang, w.word));
      s.pending = null; s.phase = 'play';
      if (bad.length) {
        s.history.push({ seat: p.seat, kind: 'red', words: p.words, score: 0, note: `İtiraz kabul edildi: ${bad.map((w) => w.word).join(', ')} sözlükte yok` });
        scorelessTurn(s);
        return s; // itiraz eden oyuncu sırasını oynar
      }
      commit(s, p.seat, p.tiles, p.words, p.score);
      if ((s.phase as string) === 'over') return s;
      s.history.push({ seat, kind: 'itiraz', words: [], score: 0, note: 'İtiraz reddedildi, sıra kaybedildi' });
      nextTurn(s);
      return s;
    }

    if (a?.type === 'pass') {
      s.history.push({ seat, kind: 'pas', words: [], score: 0 });
      nextTurn(s);
      scorelessTurn(s);
      return s;
    }
    if (a?.type === 'exchange') {
      if (s.bag.length < 7) throw new IllegalMoveError('Torbada 7’den az taş varken harf değiştirilemez');
      if (!Array.isArray(a.letters) || a.letters.length === 0) throw new IllegalMoveError('Değiştirilecek taşları seçin');
      const rest = takeFromRack(s.racks[seat], a.letters.map((l) => ({ i: 0, l })));
      const newTiles = s.bag.splice(s.bag.length - a.letters.length, a.letters.length);
      s.racks[seat] = [...rest, ...newTiles];
      s.bag = shuffle([...s.bag, ...a.letters], rng);
      s.history.push({ seat, kind: 'degistir', words: [], score: 0, note: `${a.letters.length} taş değiştirildi` });
      nextTurn(s);
      scorelessTurn(s);
      return s;
    }
    if (a?.type !== 'place') throw new IllegalMoveError('Geçersiz hamle');
    takeFromRack(s.racks[seat], a.tiles); // elde var mı?
    const { words, score } = analyzePlacement(s.board, s.lang, a.tiles, seat);
    if (s.mode === 'otomatik') {
      const bad = words.filter((w) => !isWord(s.lang, w.word));
      if (bad.length) throw new IllegalMoveError(`Sözlükte yok: ${bad.map((w) => w.word).join(', ')}`);
      commit(s, seat, a.tiles, words, score);
      if (s.phase !== 'over') nextTurn(s);
      return s;
    }
    // İtirazlı mod: sıradaki oyuncu karar verir
    s.pending = { seat, tiles: a.tiles, words, score };
    s.phase = 'challenge';
    nextTurn(s);
    return s;
  },

  view(s, seat) {
    const { racks, bag, ...rest } = s;
    return {
      ...rest, board: s.board.slice(), scores: s.scores.slice(), history: s.history.slice(-30), me: seat,
      rack: seat === null ? [] : racks[seat].slice(), rackCounts: racks.map((r) => r.length), bagCount: bag.length,
      legal: seat === null ? [] : Scrabble.legalActions(s, seat), points: TILESET[s.lang].points,
    };
  },
  isOver(s) { return s.phase === 'over'; },
  result(s) {
    if (s.phase !== 'over') return null;
    return { winners: s.winner!, scores: s.scores.slice(), summary: s.endNote ?? '' };
  },
  ai(v, seat, d, rng) { return scrabbleAi(v, seat, d, rng); },
};

// ---------- Hamle üretici (yapay zekâ ve ipucu) ----------
export interface Candidate { tiles: PlacedTile[]; score: number; words: WordScore[] }

/** Verilen tahta ve elle yapılabilecek tüm geçerli hamleleri üretir (en fazla `limit` aday). */
export function generateMoves(board: (Cell | null)[], lang: Lang, rack: string[], limit = 4000): Candidate[] {
  const d = DICTS[lang];
  if (!d) return [];
  const empty = board.every((c) => !c);
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const alpha = ALPHABET[lang];
  const low = (s: string) => toKey(lang, s);
  let budget = 400000;

  for (const horiz of [true, false]) {
    const step = horiz ? 1 : 15;
    const crossStep = horiz ? 15 : 1;
    const at = (line: number, pos: number) => (horiz ? line * 15 + pos : pos * 15 + line);
    // Çapraz kontrol: bu boş kareye hangi harfler konabilir?
    const crossCache = new Map<number, Set<string> | null>();
    const crossOk = (i: number, l: string) => {
      if (!crossCache.has(i)) {
        let a = i; while (inLine(a, a - crossStep, crossStep) && board[a - crossStep]) a -= crossStep;
        let z = i; while (inLine(z, z + crossStep, crossStep) && board[z + crossStep]) z += crossStep;
        if (a === i && z === i) crossCache.set(i, null);
        else {
          let pre = '', suf = '';
          for (let k = a; k < i; k += crossStep) pre += board[k]!.l;
          for (let k = i + crossStep; k <= z; k += crossStep) suf += board[k]!.l;
          crossCache.set(i, new Set(alpha.filter((x) => isWord(lang, pre + x + suf))));
        }
      }
      const set = crossCache.get(i);
      return set === null || set!.has(l);
    };
    const isAnchor = (i: number) => (empty ? i === CENTER : !board[i] && [i - 1, i + 1, i - 15, i + 15].some((n) => n >= 0 && n < 225 && inLine(i, n, Math.abs(n - i) === 1 ? 1 : 15) && board[n]));

    for (let line = 0; line < 15; line++) {
      const anchors: number[] = [];
      for (let pos = 0; pos < 15; pos++) if (isAnchor(at(line, pos))) anchors.push(pos);
      if (!anchors.length) continue;
      for (let start = 0; start < 15; start++) {
        if (start > 0 && board[at(line, start - 1)]) continue; // kelime bir harfin ortasından başlamaz
        // Başlangıçtan sonraki 7 boş kare içinde bir çapa olmalı
        let empties = 0, ok = false;
        for (let pos = start; pos < 15; pos++) {
          if (anchors.includes(pos)) { ok = true; break; }
          if (!board[at(line, pos)]) empties++;
          if (empties >= rack.length) break;
        }
        if (!ok) continue;
        const rec = (pos: number, word: string, r: string[], placed: PlacedTile[], touched: boolean) => {
          if (--budget <= 0 || out.length >= limit) return;
          if (pos < 15 && board[at(line, pos)]) {
            const nw = word + board[at(line, pos)]!.l;
            if (!isPrefix(d, low(nw))) return;
            rec(pos + 1, nw, r, placed, true);
            return;
          }
          // Kelime burada bitebilir
          if (placed.length && word.length >= 2 && touched && isWord(lang, word)) {
            const key = placed.map((t) => `${t.i}${t.as ?? t.l}`).sort().join('|');
            if (!seen.has(key)) {
              seen.add(key);
              try {
                const res = analyzePlacement(board, lang, placed);
                if (res.words.every((w) => isWord(lang, w.word))) out.push({ tiles: placed, score: res.score, words: res.words });
              } catch { /* kural dışı */ }
            }
          }
          if (pos >= 15 || r.length === 0) return;
          const i = at(line, pos);
          const anchorHere = anchors.includes(pos);
          const tried = new Set<string>();
          for (let k = 0; k < r.length; k++) {
            const tile = r[k];
            if (tried.has(tile)) continue;
            tried.add(tile);
            const rest = r.slice(0, k).concat(r.slice(k + 1));
            const letters = tile === '?' ? alpha : [tile];
            for (const l of letters) {
              if (!crossOk(i, l)) continue;
              const nw = word + l;
              if (!isPrefix(d, low(nw))) continue;
              const hasCross = !empty && [i - crossStep, i + crossStep].some((n) => n >= 0 && n < 225 && inLine(i, n, crossStep) && board[n]);
              rec(pos + 1, nw, rest, [...placed, tile === '?' ? { i, l: '?', as: l } : { i, l }], touched || anchorHere || hasCross);
            }
          }
        };
        rec(start, '', rack, [], false);
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Elde kalan harflerin kabaca değeri (zor YZ için). */
function leaveValue(lang: Lang, rest: string[]) {
  const vowels = lang === 'tr' ? 'AEIİOÖUÜ' : 'AEIOU';
  const v = rest.filter((l) => vowels.includes(l)).length;
  const c = rest.length - v;
  let val = -Math.abs(v - c) * 1.5;
  val += rest.filter((l) => l === '?').length * 8;
  val -= rest.filter((l) => TILESET[lang].points[l] >= 7).length * 3;
  return val;
}

export function scrabbleAi(v: ScrabbleView, seat: number, d: Difficulty, rng: Rng): ScrabbleAction {
  if (v.phase === 'challenge') {
    const bad = v.pending!.words.some((w) => !isWord(v.lang, w.word));
    // Kolay YZ bazen hatayı kaçırır
    return bad && (d !== 'kolay' || rng.int(2) === 0) ? { type: 'challenge' } : { type: 'accept' };
  }
  const moves = generateMoves(v.board, v.lang, v.rack, d === 'kolay' ? 300 : 4000);
  if (!moves.length) {
    if (v.bagCount >= 7) {
      const worst = v.rack.slice().sort((a, b) => v.points[b] - v.points[a]).slice(0, Math.min(4, v.rack.length)).filter((l) => l !== '?');
      if (worst.length) return { type: 'exchange', letters: worst };
    }
    return { type: 'pass' };
  }
  let pick: Candidate;
  if (d === 'kolay') pick = moves[Math.floor(moves.length * 0.5 + rng.int(Math.max(1, Math.floor(moves.length * 0.5))))] ?? moves[moves.length - 1];
  else if (d === 'orta') pick = moves[rng.int(Math.min(5, moves.length))];
  else {
    let best = -Infinity;
    pick = moves[0];
    for (const m of moves.slice(0, 200)) {
      const rest = v.rack.slice();
      for (const t of m.tiles) rest.splice(rest.indexOf(t.l), 1);
      const val = m.score + (v.bagCount > 0 ? leaveValue(v.lang, rest) : 0);
      if (val > best) { best = val; pick = m; }
    }
  }
  return { type: 'place', tiles: pick.tiles };
}
