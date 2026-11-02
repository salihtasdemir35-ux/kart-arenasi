import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FLEET, checkShips, cryptoRng, randomFleet, shipCells, type AmiralView, type Ship } from '@kart/engine';
import { TurnHint, Who, type TableProps } from './common';

const ROWS = 'ABCDEFGHIJ';
const label = (c: number) => `${ROWS[Math.floor(c / 10)]}${(c % 10) + 1}`;

function Grid({ cells, onCell, title, radar }: { cells: (c: number) => { bg: string; mark?: string; clickable?: boolean }; onCell?: (c: number) => void; title: string; radar?: boolean }) {
  return (
    <div className="flex w-full max-w-[22rem] flex-col items-center gap-1">
      <p className="text-xs font-semibold text-fildisi/80">{title}</p>
      <div className={`grid w-full grid-cols-[repeat(11,1fr)] gap-[2px] rounded-lg p-1.5 ${radar ? 'bg-[#0E2A22]' : 'bg-[#17405A]'}`} role="grid" aria-label={title}>
        <span />
        {Array.from({ length: 10 }).map((_, i) => <span key={i} className="text-center text-[9px] text-fildisi/60">{i + 1}</span>)}
        {Array.from({ length: 10 }).map((_, r) => [
          <span key={'r' + r} className="flex items-center justify-center text-[9px] text-fildisi/60">{ROWS[r]}</span>,
          ...Array.from({ length: 10 }).map((_, c) => {
            const cell = r * 10 + c;
            const st = cells(cell);
            return (
              <button key={cell} disabled={!st.clickable} onClick={() => onCell?.(cell)} aria-label={`${label(cell)}${st.mark ? ' ' + st.mark : ''}`}
                className={`relative flex aspect-square items-center justify-center rounded-[3px] text-[min(3vw,0.8rem)] font-black ${st.bg} ${st.clickable ? 'hover:brightness-150' : ''}`}>
                {st.mark === 'isabet' ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-cay-300">✕</motion.span> : st.mark === 'iska' ? <span className="h-1.5 w-1.5 rounded-full bg-fildisi/70" /> : null}
              </button>
            );
          }),
        ])}
      </div>
    </div>
  );
}

export function AmiralBoard({ view: v, names, avatars, offline, onAction }: TableProps<AmiralView>) {
  const me = v.me ?? 0;
  const op = 1 - me;
  const [draft, setDraft] = useState<Ship[]>([]);
  const [pick, setPick] = useState(0);
  const [dir, setDir] = useState<'y' | 'd'>('y');
  const [err, setErr] = useState<string | null>(null);
  const placing = v.phase === 'place' && v.me !== null && !v.placed[me];
  const mine = v.phase === 'fire' && v.turn === me && v.me !== null;
  const draftCells = useMemo(() => new Set(draft.flatMap(shipCells)), [draft]);
  const myShipCells = useMemo(() => new Set((v.myShips ?? []).flatMap(shipCells)), [v.myShips]);
  const sunkOp = useMemo(() => new Set(v.sunk[op].flatMap(shipCells)), [v.sunk, op]);
  const myShots = new Map(v.shots[me].map((x) => [x.cell, x.hit]));
  const theirShots = new Map(v.shots[op].map((x) => [x.cell, x.hit]));
  const remaining = FLEET.map((f, i) => ({ ...f, i })).filter((f) => !draft.some((d) => (d as any).k === f.i));

  const place = (cell: number) => {
    const f = FLEET[pick];
    if (!f || draft.some((d) => (d as any).k === pick)) return;
    const ship = { r: Math.floor(cell / 10), c: cell % 10, len: f.len, dir, k: pick } as Ship & { k: number };
    const e = checkShips([...draft, ship], v.noTouch);
    if (e) { setErr(e); return; }
    setErr(null);
    const next = [...draft, ship];
    setDraft(next);
    const nextPick = FLEET.findIndex((_, i) => !next.some((d) => (d as any).k === i));
    setPick(nextPick);
  };

  if (v.phase === 'place') {
    return (
      <div className="flex h-full flex-col items-center gap-3">
        <Who seat={op} names={names} avatars={avatars} offline={offline} active={!v.placed[op]} sub={v.placed[op] ? 'Gemileri hazır' : 'Gemilerini yerleştiriyor…'} />
        {placing ? (
          <>
            <Grid title="Denizin — gemini seç, yönünü belirle, kareye dokun" cells={(c) => ({ bg: draftCells.has(c) ? 'bg-[#8C9A93]' : 'bg-[#2A6A8E]', clickable: pick >= 0 })} onCell={place} />
            {err && <p role="alert" className="text-sm text-cay-300">{err}</p>}
            <div className="flex flex-wrap justify-center gap-1.5">
              {remaining.map((f) => <button key={f.i} onClick={() => setPick(f.i)} className={`btn px-3 py-1.5 text-sm ${pick === f.i ? 'bg-pirinc text-ceviz' : 'bg-white/5 ring-1 ring-white/10'}`}>{f.name} ({f.len})</button>)}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              <button className="btn-ghost px-3" onClick={() => setDir(dir === 'y' ? 'd' : 'y')}>Yön: {dir === 'y' ? 'Yatay' : 'Dikey'}</button>
              <button className="btn-ghost px-3" onClick={() => { setDraft(randomFleet(cryptoRng(), v.noTouch).map((s, i) => ({ ...s, k: i }) as any)); setPick(-1); setErr(null); }}>Rastgele diz</button>
              <button className="btn-ghost px-3" onClick={() => { setDraft([]); setPick(0); }}>Temizle</button>
              <button className="btn-brass px-5" disabled={draft.length !== FLEET.length} onClick={() => onAction({ type: 'place', ships: draft.map(({ r, c, len, dir: d }) => ({ r, c, len, dir: d })) })}>Hazırım</button>
            </div>
          </>
        ) : <TurnHint mine={false} text="Gemilerin hazır. Rakibin yerleştirmesi bekleniyor…" />}
      </div>
    );
  }

  const last = v.last;
  return (
    <div className="flex h-full flex-col items-center gap-3">
      <Who seat={op} names={names} avatars={avatars} offline={offline} active={v.turn === op && v.phase === 'fire'} sub={`Batırdığı: ${v.sunk[me].length}/5`} />
      <Grid radar title="Rakip alanı (radar)" onCell={(c) => onAction({ type: 'fire', cell: c })}
        cells={(c) => {
          const s = myShots.get(c);
          return { bg: sunkOp.has(c) ? 'bg-cay/80' : s === true ? 'bg-[#5A2A1E]' : 'bg-[#1E4A3A]', mark: s === undefined ? undefined : s ? 'isabet' : 'iska', clickable: mine && s === undefined };
        }} />
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : mine ? 'Ateş etmek için rakip alanında bir kareye dokun' : `${names[v.turn]} nişan alıyor…`} />
      {last && <p aria-live="polite" className="text-sm font-semibold">{names[last.seat]} {label(last.cell)}: {last.result === 'iska' ? 'ıska' : last.result === 'isabet' ? 'isabet!' : `${last.ship} battı!`}</p>}
      <Grid title="Senin denizin" cells={(c) => { const s = theirShots.get(c); return { bg: myShipCells.has(c) ? 'bg-[#8C9A93]' : 'bg-[#2A6A8E]', mark: s === undefined ? undefined : s ? 'isabet' : 'iska' }; }} />
      <Who seat={me} names={names} avatars={avatars} active={mine} sub={`Batırdığın: ${v.sunk[op].length}/5`} />
    </div>
  );
}
