import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { XqView } from '@kart/engine';
import { TurnHint, Who, type TableProps } from './common';

export const XQ_LABEL: Record<string, string> = { K: 'G', A: 'D', E: 'F', H: 'At', R: 'Ar', C: 'T', S: 'As' };
const XQ_NAME: Record<string, string> = { K: 'General', A: 'Danışman', E: 'Fil', H: 'At', R: 'Araba', C: 'Top', S: 'Asker' };

export function XiangqiBoard({ view: v, names, avatars, offline, onAction }: TableProps<XqView>) {
  const [sel, setSel] = useState<number | null>(null);
  const flip = v.me === 1;
  const mine = v.me !== null && !v.over && (v.turn === 'r' ? 0 : 1) === v.me;
  const targets = useMemo(() => new Set(v.legal.filter((m) => m.from === sel).map((m) => m.to)), [v.legal, sel]);
  const last = v.history[v.history.length - 1];
  // Ekran konumu (yüzde): kendi tarafın altta
  const pos = (i: number) => {
    const f = i % 9, r = Math.floor(i / 9);
    const x = flip ? 8 - f : f, y = flip ? r : 9 - r;
    return { left: `${(x / 8) * 100}%`, top: `${(y / 9) * 100}%` };
  };
  const click = (i: number) => {
    if (!mine) return;
    if (sel !== null && targets.has(i)) { onAction({ type: 'move', from: sel, to: i }); setSel(null); return; }
    const p = v.board[i];
    setSel(p && p[0] === v.turn && v.legal.some((m) => m.from === i) ? i : null);
  };
  const top = flip ? 0 : 1, bottom = flip ? 1 : 0;
  const kingInCheck = v.inCheck ? v.board.indexOf(v.turn + 'K') : -1;
  const lines = [];
  for (let r = 0; r < 10; r++) lines.push(<line key={'h' + r} x1={0} x2={8} y1={r} y2={r} />);
  for (let f = 0; f < 9; f++) {
    if (f === 0 || f === 8) lines.push(<line key={'v' + f} x1={f} x2={f} y1={0} y2={9} />);
    else { lines.push(<line key={'v' + f + 'a'} x1={f} x2={f} y1={0} y2={4} />); lines.push(<line key={'v' + f + 'b'} x1={f} x2={f} y1={5} y2={9} />); }
  }
  for (const [y1, y2] of [[0, 2], [7, 9]]) { lines.push(<line key={'p1' + y1} x1={3} x2={5} y1={y1} y2={y2} />); lines.push(<line key={'p2' + y1} x1={5} x2={3} y1={y1} y2={y2} />); }

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <Who seat={top} names={names} avatars={avatars} offline={offline} active={!v.over && (v.turn === 'r' ? 0 : 1) === top} sub={top === 0 ? 'Kırmızı' : 'Siyah'} />
      <div className="w-full max-w-[min(92vw,28rem)] rounded-xl bg-[#E9C98F] p-[6%] shadow-2xl ring-4 ring-pirinc-700">
        <div className="relative aspect-[8/9]" role="grid" aria-label="Xiangqi tahtası">
          <svg viewBox="-0.05 -0.05 8.1 9.1" className="absolute inset-0 h-full w-full" stroke="#5A3A22" strokeWidth="0.04" preserveAspectRatio="none">{lines}</svg>
          <span className="pointer-events-none absolute inset-x-0 top-[44.4%] flex h-[11.1%] items-center justify-around text-sm font-bold tracking-widest text-[#5A3A22]/70"><span>NEHİR</span><span>NEHİR</span></span>
          {Array.from({ length: 90 }).map((_, i) => {
            const p = v.board[i];
            const isT = targets.has(i);
            const isLast = last && (last.from === i || last.to === i);
            if (!p && !isT && !isLast) return null;
            return (
              <button key={i} onClick={() => click(i)} style={pos(i)}
                aria-label={`${i % 9 + 1}. sütun ${Math.floor(i / 9) + 1}. sıra${p ? ' ' + (p[0] === 'r' ? 'kırmızı ' : 'siyah ') + XQ_NAME[p[1]] : ''}`}
                className="absolute z-10 flex h-[10%] w-[11.5%] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                {p ? (
                  <motion.span layout className={`flex h-full w-full items-center justify-center rounded-full border-[3px] bg-fildisi text-[min(3.6vw,1rem)] font-black shadow-[0_3px_0_rgba(0,0,0,.35)]
                    ${p[0] === 'r' ? 'border-cay text-cay' : 'border-ceviz text-ceviz'} ${sel === i ? 'ring-4 ring-pirinc' : ''} ${kingInCheck === i ? 'ring-4 ring-cay' : ''} ${isT ? 'outline outline-4 outline-cuha' : ''} ${isLast ? 'shadow-[0_0_0_3px_rgba(212,164,76,.8)]' : ''}`}>
                    {XQ_LABEL[p[1]]}
                  </motion.span>
                ) : isT ? <span className="h-1/3 w-1/3 rounded-full bg-cuha/80" /> : <span className="h-1/4 w-1/4 rounded-full bg-pirinc/70" />}
              </button>
            );
          })}
          {mine && Array.from({ length: 90 }).map((_, i) => (!v.board[i] && !targets.has(i) ? (
            <button key={'e' + i} onClick={() => click(i)} style={pos(i)} aria-hidden tabIndex={-1} className="absolute h-[9%] w-[10%] -translate-x-1/2 -translate-y-1/2" />
          ) : null))}
        </div>
      </div>
      <TurnHint mine={mine} text={v.over ? (v.reason ?? 'Oyun bitti') : mine ? (v.inCheck ? 'Generalin tehdit altında!' : 'Sıra sende') : `${names[v.turn === 'r' ? 0 : 1]} düşünüyor…`} />
      <Who seat={bottom} names={names} avatars={avatars} offline={offline} active={mine} sub={bottom === 0 ? 'Kırmızı' : 'Siyah'} />
      <p className="text-center text-xs text-fildisi/60">G General · D Danışman · F Fil · At · Ar Araba · T Top · As Asker</p>
    </div>
  );
}
