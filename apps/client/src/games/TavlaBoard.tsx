import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { TavlaAction, TavlaView } from '@kart/engine';
import { TurnHint, Who, type TableProps } from './common';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function Die({ n, used }: { n: number; used?: boolean }) {
  return (
    <span className={`grid h-9 w-9 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg bg-fildisi p-1.5 shadow ${used ? 'opacity-35' : ''}`} aria-label={`Zar ${n}`}>
      {Array.from({ length: 9 }).map((_, i) => <span key={i} className={`rounded-full ${PIPS[n]?.includes(i) ? 'bg-ceviz' : ''}`} />)}
    </span>
  );
}

const dest = (seat: number, from: number, die: number) => {
  const t = from === 24 ? (seat === 0 ? 24 - die : die - 1) : seat === 0 ? from - die : from + die;
  return t < 0 || t > 23 ? -1 : t;
};

function Checker({ white, small }: { white: boolean; small?: boolean }) {
  return <span className={`block ${small ? 'h-4 w-4' : 'h-[min(6.4vw,1.9rem)] w-[min(6.4vw,1.9rem)]'} rounded-full border-2 ${white ? 'border-fildisi-200 bg-fildisi' : 'border-ceviz bg-[#5A2A1E]'} shadow-[inset_0_-3px_0_rgba(0,0,0,.25),0_2px_3px_rgba(0,0,0,.4)]`} />;
}

export function TavlaBoard({ view: v, names, avatars, offline, onAction }: TableProps<TavlaView>) {
  const me = v.me ?? 0;
  const [sel, setSel] = useState<number | null>(null);
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const moves = v.legal.filter((a): a is Extract<TavlaAction, { type: 'move' }> => a.type === 'move');
  const sources = new Set(moves.map((m) => m.from));
  const targets = useMemo(() => {
    const t = new Map<number, Extract<TavlaAction, { type: 'move' }>>();
    for (const m of moves.filter((m) => m.from === sel)) { const d = dest(me, m.from, m.die); if (!t.has(d)) t.set(d, m); }
    return t;
  }, [moves, sel, me]);
  const opp = 1 - me;
  // Görüntüleme: kendi evin sağ altta
  const map = (i: number) => (me === 0 ? i : 23 - i);
  const topRow = [12, 13, 14, 15, 16, 17, -1, 18, 19, 20, 21, 22, 23].map((i) => (i < 0 ? i : map(i)));
  const botRow = [11, 10, 9, 8, 7, 6, -1, 5, 4, 3, 2, 1, 0].map((i) => (i < 0 ? i : map(i)));
  const pick = (from: number) => { if (mine && v.phase === 'move') setSel(sources.has(from) ? (sel === from ? null : from) : null); };
  const go = (to: number) => { const m = targets.get(to); if (m) { onAction(m); setSel(null); } };

  const Point = ({ idx, top }: { idx: number; top: boolean }) => {
    const n = v.points[idx];
    const count = Math.abs(n);
    const white = n > 0;
    const isTarget = targets.has(idx);
    const isSource = mine && sources.has(idx);
    const dark = idx % 2 === 0;
    return (
      <button onClick={() => (isTarget ? go(idx) : pick(idx))} aria-label={`${me === 0 ? idx + 1 : 24 - idx}. kapı, ${count} taş`}
        className={`relative flex h-full flex-1 ${top ? 'flex-col' : 'flex-col-reverse'} items-center`}>
        <span className={`absolute inset-x-0.5 ${top ? 'top-0' : 'bottom-0'} h-[88%] ${dark ? 'bg-cay' : 'bg-fildisi-200'} ${isTarget ? 'brightness-125 outline outline-2 outline-cuha-200' : ''}`}
          style={{ clipPath: top ? 'polygon(0 0, 100% 0, 50% 100%)' : 'polygon(50% 0, 100% 100%, 0 100%)' }} />
        <span className={`relative z-10 flex ${top ? 'flex-col' : 'flex-col-reverse'} items-center gap-px pt-0.5 pb-0.5 ${sel === idx ? 'drop-shadow-[0_0_6px_#E8C988]' : ''}`}>
          {Array.from({ length: Math.min(count, 5) }).map((_, k) => <motion.span layout key={k}><Checker white={white} /></motion.span>)}
          {count > 5 && <span className="text-xs font-bold text-fildisi">+{count - 5}</span>}
        </span>
        {isSource && !isTarget && <span className={`absolute ${top ? 'bottom-1' : 'top-1'} z-10 h-1.5 w-1.5 rounded-full bg-pirinc`} />}
      </button>
    );
  };

  const Bar = ({ who }: { who: number }) => (
    <button onClick={() => pick(24)} className={`flex flex-1 flex-col items-center justify-center gap-px ${who === me && mine && sources.has(24) ? 'ring-2 ring-pirinc' : ''}`} aria-label={`${names[who]} barda ${v.bar[who]} taş`}>
      {Array.from({ length: v.bar[who] }).map((_, k) => <Checker key={k} white={who === 0} small />)}
    </button>
  );

  const hint = v.phase === 'over' ? 'Maç bitti'
    : !mine ? `${names[v.turn]} ${v.phase === 'roll' ? 'zar atıyor…' : 'oynuyor…'}`
    : v.phase === 'roll' ? 'Zar at' : sel === null ? 'Oynatmak istediğin taşa dokun' : 'Gideceği yere dokun';

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <Who seat={opp} names={names} avatars={avatars} offline={offline} active={v.phase !== 'over' && v.turn === opp} sub={<>{opp === 0 ? 'Beyaz' : 'Kırmızı'} · Pip {v.pip[opp]} · Toplanan {v.off[opp]}</>} />
      <div className="flex w-full max-w-[44rem] gap-1.5 rounded-2xl bg-[#6B4430] p-2 shadow-2xl ring-4 ring-pirinc-700" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,.06) 0 3px, transparent 3px 11px)' }}>
        <div className="flex aspect-[13/11] flex-1 flex-col rounded-lg bg-[#2E5A43] p-1">
          <div className="flex h-1/2">
            {topRow.map((i, k) => (i < 0 ? <div key={k} className="flex w-[7%] flex-col bg-[#4A2F21]"><Bar who={opp} /></div> : <Point key={k} idx={i} top />))}
          </div>
          <div className="flex h-1/2">
            {botRow.map((i, k) => (i < 0 ? <div key={k} className="flex w-[7%] flex-col bg-[#4A2F21]"><Bar who={me} /></div> : <Point key={k} idx={i} top={false} />))}
          </div>
        </div>
        <div className="flex w-[11%] flex-col justify-between rounded-lg bg-[#4A2F21] p-1 text-center text-[10px]">
          <div className="flex flex-col items-center gap-0.5"><span>{v.off[opp]}</span>{Array.from({ length: Math.min(v.off[opp], 8) }).map((_, k) => <span key={k} className={`block h-1.5 w-full rounded ${opp === 0 ? 'bg-fildisi' : 'bg-[#5A2A1E] ring-1 ring-black/40'}`} />)}</div>
          <button onClick={() => go(-1)} disabled={!targets.has(-1)} aria-label="Taşı topla"
            className={`flex flex-col items-center gap-0.5 rounded ${targets.has(-1) ? 'bg-cuha-400 p-1 text-fildisi' : ''}`}>
            {targets.has(-1) && <span className="font-bold">Topla</span>}
            {Array.from({ length: Math.min(v.off[me], 8) }).map((_, k) => <span key={k} className={`block h-1.5 w-full rounded ${me === 0 ? 'bg-fildisi' : 'bg-[#5A2A1E] ring-1 ring-black/40'}`} />)}<span>{v.off[me]}</span>
          </button>
        </div>
      </div>
      <div className="flex min-h-[2.75rem] items-center gap-2">
        {v.phase === 'move' && v.rolled.map((d, k) => <Die key={k} n={d} />)}
        {v.phase === 'move' && v.dice.length > 0 && <span className="text-xs text-fildisi/60">kalan: {v.dice.join(', ')}</span>}
        {mine && v.phase === 'roll' && <button className="btn-brass px-6" onClick={() => onAction({ type: 'roll' })}>{v.opening ? 'Açılış zarlarını oyna' : 'Zar at'}</button>}
      </div>
      {v.opening && <p className="text-xs text-fildisi/70">Açılış atışı: {names[0]} {v.opening[0]}, {names[1]} {v.opening[1]}. Büyük atan başlar.</p>}
      {v.lastTurn?.passed && <p className="text-xs text-pirinc-300">{names[v.lastTurn.seat]} oynanacak hamle bulamadı, sıra geçti.</p>}
      <TurnHint mine={mine} text={hint} />
      <Who seat={me} names={names} avatars={avatars} offline={offline} active={mine} sub={<>{me === 0 ? 'Beyaz' : 'Kırmızı'} · Pip {v.pip[me]} · Toplanan {v.off[me]}</>} />
      <p className="text-xs text-fildisi/60">Maç: {v.matchTo} puan · Skor {names[0]} {v.score[0]} – {v.score[1]} {names[1]}{v.lastGame ? ` · Son oyun: ${v.lastGame.kind} (+${v.lastGame.points})` : ''}</p>
    </div>
  );
}
