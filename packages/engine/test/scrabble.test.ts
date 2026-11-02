import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Scrabble, TILESET, PREMIUM, CENTER, registerDictionary, isWord, analyzePlacement, generateMoves, type ScrabbleState, type PlacedTile } from '../src/games/scrabble';
import { seededRng } from '../src/rng';

const rng = seededRng(8);
beforeAll(() => {
  for (const lang of ['tr', 'en'] as const) {
    const file = path.resolve(__dirname, `../../../apps/client/public/dict/${lang}.txt`);
    registerDictionary(lang, fs.readFileSync(file, 'utf8').split('\n'));
  }
});

const row = (r: number, c: number) => r * 15 + c;
const word = (w: string, r: number, c: number, vertical = false): PlacedTile[] =>
  [...w].map((l, k) => ({ i: vertical ? row(r + k, c) : row(r, c + k), l }));
function st(lang: 'tr' | 'en', mode: 'otomatik' | 'itirazli' = 'otomatik'): ScrabbleState {
  return { ...Scrabble.setup({ players: 2, options: { lang, mode } }, seededRng(1)), turn: 0 };
}
const withRack = (s: ScrabbleState, seat: number, rack: string) => { s.racks[seat] = [...rack]; return s; };

describe('Scrabble — taşlar, tahta, sözlük', () => {
  it('her dilde 100 taş, 2 joker; tahtada 8 K×3, 17 K×2, 12 H×3, 24 H×2', () => {
    for (const l of ['tr', 'en'] as const) {
      expect(Object.values(TILESET[l].counts).reduce((a, b) => a + b)).toBe(100);
      expect(TILESET[l].counts['?']).toBe(2);
    }
    const c = (p: string) => PREMIUM.filter((x) => x === p).length;
    expect([c('TW'), c('DW'), c('TL'), c('DL')]).toEqual([8, 17, 12, 24]);
    expect(PREMIUM[CENTER]).toBe('DW');
  });
  it('Türkçe karakterler doğru: KİTAP var, KITAP yok; ĞÜŞÖÇ desteklenir', () => {
    expect(isWord('tr', 'KİTAP')).toBe(true);
    expect(isWord('tr', 'KITAP')).toBe(false);
    expect(isWord('tr', 'ILIK')).toBe(true);
    expect(isWord('tr', 'ÇİÇEK')).toBe(true);
    expect(isWord('tr', 'AĞAÇ')).toBe(true);
    expect(isWord('tr', 'ÖĞRETMEN')).toBe(true);
    expect(isWord('en', 'QUIZ')).toBe(true);
    expect(isWord('en', 'QXZ')).toBe(false);
  });
  it('başlangıçta herkese 7 taş, torbada kalan doğru', () => {
    const s = Scrabble.setup({ players: 4, options: { lang: 'tr' } }, rng);
    expect(s.racks.every((r) => r.length === 7)).toBe(true);
    expect(s.bag).toHaveLength(72);
  });
});

describe('Scrabble — yerleştirme kuralları ve puan', () => {
  it('ilk kelime merkezden geçmeli; geçince puanlanır (CAT = 10, merkez K×2)', () => {
    const s = withRack(st('en'), 0, 'CATXXXX');
    expect(() => Scrabble.apply(s, 0, { type: 'place', tiles: word('CAT', 0, 0) }, rng)).toThrow('yıldızdan');
    const t = Scrabble.apply(s, 0, { type: 'place', tiles: word('CAT', 7, 6) }, rng);
    expect(t.scores[0]).toBe(10);
    expect(t.racks[0]).toHaveLength(7);
    expect(t.turn).toBe(1);
  });
  it('sözlükte olmayan kelime otomatik modda reddedilir', () => {
    const s = withRack(st('en'), 0, 'QXZAAAA');
    expect(() => Scrabble.apply(s, 0, { type: 'place', tiles: word('QXZ', 7, 6) }, rng)).toThrow('Sözlükte yok: QXZ');
  });
  it('bağlantısız, boşluklu ve çapraz yerleştirme reddedilir', () => {
    let s = withRack(st('en'), 0, 'CATDOGS');
    s = Scrabble.apply(s, 0, { type: 'place', tiles: word('CAT', 7, 6) }, rng);
    s = withRack(s, 1, 'DOGSAAA');
    expect(() => Scrabble.apply(s, 1, { type: 'place', tiles: word('DOG', 0, 0) }, rng)).toThrow('bağlanmalı');
    expect(() => Scrabble.apply(s, 1, { type: 'place', tiles: [{ i: row(8, 6), l: 'D' }, { i: row(10, 6), l: 'O' }] }, rng)).toThrow('boşluk');
    expect(() => Scrabble.apply(s, 1, { type: 'place', tiles: [{ i: row(8, 6), l: 'D' }, { i: row(9, 7), l: 'O' }] }, rng)).toThrow('tek satır');
  });
  it('mevcut harfle kelime kurma ve aynı hamlede oluşan tüm kelimelerin puanı', () => {
    let s = withRack(st('en'), 0, 'CATQQQQ');
    s = Scrabble.apply(s, 0, { type: 'place', tiles: word('CAT', 7, 6) }, rng); // C(7,6) A(7,7) T(7,8)
    s = withRack(s, 1, 'SOTEEEE');
    // "CATS" + dikey "SO" (S 7,9 ; O 8,9)
    const t = Scrabble.apply(s, 1, { type: 'place', tiles: [{ i: row(7, 9), l: 'S' }, { i: row(8, 9), l: 'O' }] }, rng);
    const last = t.history[t.history.length - 1];
    expect(last.words.map((w) => w.word).sort()).toEqual(['CATS', 'SO']);
    // CATS: 3+1+1+1 = 6 ; SO: S(7,9)=1 + O(8,9)=1 ⇒ 2 (ikisi de düz kare) ; toplam 8
    expect(last.score).toBe(8);
  });
  it('joker 0 puan, 7 taş bonusu +50', () => {
    const s = withRack(st('en'), 0, 'RETAIN?');
    const tiles: PlacedTile[] = [...[...'RETAIN'].map((l, k): PlacedTile => ({ i: row(7, 4 + k), l })), { i: row(7, 10), l: '?', as: 'S' }];
    const t = Scrabble.apply(s, 0, { type: 'place', tiles }, rng);
    // RETAINS: R1 E1 T1 A1(merkez K×2) I1 N1 S(joker)0 = 6, ×2 = 12, +50
    expect(t.scores[0]).toBe(62);
    expect(t.board[row(7, 10)]).toMatchObject({ l: 'S', blank: true });
  });
  it('elde olmayan taş kullanılamaz', () => {
    const s = withRack(st('tr'), 0, 'KİTAPXX'.replace(/X/g, 'A'));
    expect(() => Scrabble.apply(s, 0, { type: 'place', tiles: word('KEDİ', 7, 6) }, rng)).toThrow('Elinizde');
  });
  it('Türkçe kelime: KİTAP oynanır ve puanlanır', () => {
    const s = withRack(st('tr'), 0, 'KİTAPAA');
    const t = Scrabble.apply(s, 0, { type: 'place', tiles: word('KİTAP', 7, 5) }, rng);
    // K1 İ1 T1 A1 P5 = 9 ×2 (merkez) = 18 ; (7,3) H×2 kelime dışında
    expect(t.scores[0]).toBe(18);
  });
});

describe('Scrabble — değiştirme, pas, itiraz, oyun sonu', () => {
  it('harf değiştirme torbadaki taş sayısını korur', () => {
    const s = withRack(st('tr'), 0, 'AAAAAAA');
    const bagBefore = s.bag.length;
    const t = Scrabble.apply(s, 0, { type: 'exchange', letters: ['A', 'A', 'A'] }, rng);
    expect(t.racks[0]).toHaveLength(7);
    expect(t.bag).toHaveLength(bagBefore);
    expect(t.turn).toBe(1);
  });
  it('üst üste 6 puansız tur oyunu bitirir ve eldekiler düşülür', () => {
    let s = st('en');
    for (let k = 0; k < 6; k++) s = Scrabble.apply(s, s.turn, { type: 'pass' }, rng);
    expect(s.phase).toBe('over');
    expect(s.scores.every((v) => v < 0)).toBe(true);
  });
  it('itirazlı mod: geçersiz kelimeye itiraz hamleyi geri alır', () => {
    let s = withRack(st('en', 'itirazli'), 0, 'QXZAAAA');
    s = Scrabble.apply(s, 0, { type: 'place', tiles: word('QXZ', 7, 6) }, rng);
    expect(s.phase).toBe('challenge');
    expect(s.turn).toBe(1);
    expect(() => Scrabble.apply(s, 1, { type: 'pass' }, rng)).toThrow('itiraz');
    s = Scrabble.apply(s, 1, { type: 'challenge' }, rng);
    expect(s.board.every((c) => !c)).toBe(true);
    expect(s.scores[0]).toBe(0);
    expect(s.racks[0]).toEqual([...'QXZAAAA']);
    expect(s.turn).toBe(1); // itiraz eden oynar
  });
  it('itirazlı mod: geçerli kelimeye itiraz eden sırasını kaybeder', () => {
    let s = withRack(st('en', 'itirazli'), 0, 'CATAAAA');
    s = Scrabble.apply(s, 0, { type: 'place', tiles: word('CAT', 7, 6) }, rng);
    s = Scrabble.apply(s, 1, { type: 'challenge' }, rng);
    expect(s.scores[0]).toBe(10);
    expect(s.turn).toBe(0);
  });
  it('torba boşken taşlarını bitiren rakiplerin el puanını alır', () => {
    let s = withRack(st('en'), 0, 'CAT');
    s.bag = [];
    s.racks[1] = ['Q', 'Z'];
    s = Scrabble.apply(s, 0, { type: 'place', tiles: word('CAT', 7, 6) }, rng);
    expect(s.phase).toBe('over');
    expect(s.scores).toEqual([10 + 20, -20]);
    expect(Scrabble.result(s)!.winners).toEqual([0]);
  });
  it('görünüm rakibin elini ve torbayı göstermez', () => {
    const s = st('tr');
    const v = Scrabble.view(s, 0);
    expect((v as any).racks).toBeUndefined();
    expect((v as any).bag).toBeUndefined();
    expect(v.rack).toEqual(s.racks[0]);
    expect(v.rackCounts).toEqual([7, 7]);
  });
});

describe('Scrabble — hamle üretici ve yapay zekâ', () => {
  it('üretilen tüm hamleler kurala ve sözlüğe uygun', () => {
    let s = withRack(st('tr'), 0, 'KİTAPLR');
    const moves = generateMoves(s.board, 'tr', s.racks[0]);
    expect(moves.length).toBeGreaterThan(5);
    for (const m of moves.slice(0, 50)) {
      const r = analyzePlacement(s.board, 'tr', m.tiles);
      expect(r.words.every((w) => isWord('tr', w.word))).toBe(true);
      expect(r.score).toBe(m.score);
    }
    s = Scrabble.apply(s, 0, { type: 'place', tiles: moves[0].tiles }, rng);
    const next = generateMoves(s.board, 'tr', s.racks[1]);
    for (const m of next.slice(0, 30)) expect(() => analyzePlacement(s.board, 'tr', m.tiles)).not.toThrow();
  });
  it('YZ maçları (TR ve EN): 100 taş korunur, oyun biter', () => {
    for (const [g, lang] of [[1, 'tr'], [2, 'en'], [3, 'tr']] as const) {
      const r = seededRng(g);
      let s = Scrabble.setup({ players: 2, options: { lang } }, r);
      let steps = 0;
      while (s.phase !== 'over') {
        const seat = s.turn;
        s = Scrabble.apply(s, seat, Scrabble.ai(Scrabble.view(s, seat), seat, seat === 0 ? 'zor' : 'orta', r), r);
        const total = s.bag.length + s.racks.reduce((t, x) => t + x.length, 0) + s.board.filter(Boolean).length;
        expect(total).toBe(100);
        if (++steps > 400) throw new Error('bitmedi');
      }
      expect(Math.max(...s.scores)).toBeGreaterThan(100);
    }
  });
});
