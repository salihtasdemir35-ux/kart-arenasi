import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { ChessMove, ChessView } from '@kart/engine';
import { Modal } from '../components/ui';
import { TurnHint, Who, type TableProps } from './common';

// Metin sunumu (U+FE0E) Android'de piyonun emoji olarak çizilmesini engeller
const GLYPH: Record<string, string> = { K: '♚\uFE0E', Q: '♛\uFE0E', R: '♜\uFE0E', B: '♝\uFE0E', N: '♞\uFE0E', P: '♟\uFE0E' };
const PROMO: { k: 'Q' | 'R' | 'B' | 'N'; label: string }[] = [{ k: 'Q', label: 'Vezir' }, { k: 'R', label: 'Kale' }, { k: 'B', label: 'Fil' }, { k: 'N', label: 'At' }];
const FILES = 'abcdefgh';

export function ChessBoard({ view: v, names, avatars, offline, onAction }: TableProps<ChessView>) {
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<ChessMove[] | null>(null);
  const flip = v.me === 1;
  const mine = v.me !== null && !v.over && (v.turn === 'w' ? 0 : 1) === v.me;
  const targets = useMemo(() => new Map(v.legal.filter((m) => m.from === sel).map((m) => [m.to, m])), [v.legal, sel]);
  const last = v.history[v.history.length - 1];
  const kingInCheck = v.inCheck ? v.board.indexOf(v.turn + 'K') : -1;
  const top = flip ? 0 : 1;
  const bottom = flip ? 1 : 0;

  const click = (sq: number) => {
    if (!mine) return;
    if (sel !== null && targets.has(sq)) {
      const opts = v.legal.filter((m) => m.from === sel && m.to === sq);
      if (opts.length > 1) { setPromo(opts); return; }
      onAction(opts[0]);
      setSel(null);
      return;
    }
    const p = v.board[sq];
    setSel(p && p[0] === v.turn && v.legal.some((m) => m.from === sq) ? sq : null);
  };

  const rows = Array.from({ length: 8 }, (_, i) => (flip ? i : 7 - i));
  const cols = Array.from({ length: 8 }, (_, i) => (flip ? 7 - i : i));
  const moves = [];
  for (let i = 0; i < v.history.length; i += 2) moves.push([Math.floor(i / 2) + 1, v.history[i].san, v.history[i + 1]?.san ?? '']);

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <Who seat={top} names={names} avatars={avatars} offline={offline} active={!v.over && (v.turn === 'w' ? 0 : 1) === top} sub={top === 0 ? 'Beyaz' : 'Siyah'} />
      <div className="w-full max-w-[min(92vw,30rem)] rounded-xl bg-ceviz-600 p-2 shadow-2xl ring-4 ring-pirinc-700">
        <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-md" role="grid" aria-label="Satranç tahtası">
          {rows.map((r) => cols.map((f) => {
            const sq = r * 8 + f;
            const p = v.board[sq];
            const dark = (r + f) % 2 === 0;
            const isLast = last && (last.from === sq || last.to === sq);
            const t = targets.get(sq);
            return (
              <button key={sq} onClick={() => click(sq)} aria-label={`${FILES[f]}${r + 1}${p ? ' ' + (p[0] === 'w' ? 'beyaz' : 'siyah') : ''}`}
                className={`relative flex items-center justify-center ${dark ? 'bg-[#8B6248]' : 'bg-fildisi-200'} ${isLast ? 'after:absolute after:inset-0 after:bg-pirinc/40' : ''} ${sel === sq ? 'after:absolute after:inset-0 after:bg-pirinc/70' : ''} ${kingInCheck === sq ? 'after:absolute after:inset-0 after:bg-cay/70' : ''}`}>
                {p && (
                  <motion.span layoutId={`pc-${sq}-${p}`} className="relative z-10 select-none leading-none"
                    style={{ fontSize: 'min(9vw, 2.6rem)', color: p[0] === 'w' ? '#FAF5EA' : '#2B1A12', textShadow: p[0] === 'w' ? '0 0 2px #2B1A12, 0 0 1px #2B1A12, 0 1px 0 #2B1A12' : '0 1px 0 rgba(255,255,255,.25)' }}>
                    {GLYPH[p[1]]}
                  </motion.span>
                )}
                {t && <span className={`absolute z-20 rounded-full ${p ? 'inset-1 ring-4 ring-cuha/70' : 'h-1/4 w-1/4 bg-cuha/70'}`} />}
                {f === (flip ? 7 : 0) && <span className={`absolute left-0.5 top-0 text-[9px] font-bold ${dark ? 'text-fildisi-200' : 'text-ceviz-400'}`}>{r + 1}</span>}
                {r === (flip ? 7 : 0) && <span className={`absolute bottom-0 right-0.5 text-[9px] font-bold ${dark ? 'text-fildisi-200' : 'text-ceviz-400'}`}>{FILES[f]}</span>}
              </button>
            );
          }))}
        </div>
      </div>
      <TurnHint mine={mine} text={v.over ? (v.reason ?? 'Oyun bitti') : mine ? (v.inCheck ? 'Şah! Şahını kurtar' : 'Sıra sende') : `${names[v.turn === 'w' ? 0 : 1]} düşünüyor…${v.inCheck ? ' (şah çekildi)' : ''}`} />
      <Who seat={bottom} names={names} avatars={avatars} offline={offline} active={mine} sub={bottom === 0 ? 'Beyaz' : 'Siyah'} />
      {moves.length > 0 && (
        <ol className="flex max-w-[30rem] flex-wrap gap-x-3 gap-y-1 rounded-xl bg-black/20 px-3 py-2 text-sm" aria-label="Hamle geçmişi">
          {moves.slice(-12).map(([n, w, b]) => <li key={n as number}><span className="text-fildisi/50">{n}.</span> {w} {b}</li>)}
        </ol>
      )}
      <Modal open={!!promo} onClose={() => setPromo(null)} title="Piyon neye terfi etsin?">
        <div className="grid grid-cols-4 gap-2">
          {PROMO.map((o) => (
            <button key={o.k} className="btn-ghost flex-col py-3" onClick={() => { const m = promo!.find((x) => x.promo === o.k)!; onAction(m); setPromo(null); setSel(null); }}>
              <span className="text-3xl">{GLYPH[o.k]}</span><span className="text-xs">{o.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
