import { AnimatePresence, motion } from 'framer-motion';
import type { TombalaView } from '@kart/engine';
import { TurnHint, type TableProps } from './common';

export function TombalaBoard({ view: v, names, onAction }: TableProps<TombalaView>) {
  const drawn = new Set(v.drawn);
  const last = v.drawn[v.drawn.length - 1];
  const me = v.me ?? 0;
  const canDraw = v.me === 0 && !v.over;
  const rowsDone = (p: number) => Math.max(...v.cards[p].map((c) => c.filter((r) => r.every((x) => x === null || drawn.has(x))).length));
  const prize = (k: 'cinko1' | 'cinko2' | 'tombala', label: string) => (
    <span className={`chip ${v.prizes[k] ? 'bg-pirinc text-ceviz' : 'bg-black/30'}`}>{label}{v.prizes[k] ? `: ${v.prizes[k]!.map((p) => names[p]).join(', ')}` : ''}</span>
  );
  return (
    <div className="flex h-full flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-1.5 text-xs">{prize('cinko1', '1. çinko')}{prize('cinko2', '2. çinko')}{prize('tombala', 'Tombala')}</div>
      <div className="flex items-center gap-4">
        <AnimatePresence mode="popLayout">
          <motion.div key={last ?? 'bos'} initial={{ y: -40, rotate: -90, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-cay text-3xl font-black text-fildisi shadow-[inset_0_-6px_0_rgba(0,0,0,.25),0_8px_20px_rgba(0,0,0,.4)]" aria-live="polite" aria-label={last ? `Çekilen numara ${last}` : 'Henüz numara çekilmedi'}>
            {last ?? '—'}
          </motion.div>
        </AnimatePresence>
        <div className="text-sm">
          <p>Torbada {v.remaining} numara</p>
          {canDraw && <button className="btn-brass mt-1" onClick={() => onAction({ type: 'draw' })}>Numara çek</button>}
        </div>
      </div>
      <TurnHint mine={canDraw} text={v.over ? 'Oyun bitti' : canDraw ? 'Numara çekmek için düğmeye bas' : `${names[0]} numara çekiyor…`} />
      {v.me !== null && v.cards[me].map((card, k) => (
        <div key={k} className="w-full max-w-[34rem] rounded-xl bg-fildisi p-1.5 shadow-xl" aria-label={`Kartın ${k + 1}`}>
          <div className="grid grid-cols-9 gap-[2px]">
            {card.flat().map((x, i) => (
              <span key={i} className={`flex aspect-[4/5] items-center justify-center rounded-sm text-[min(4.2vw,1.15rem)] font-black ${x === null ? 'bg-cuha/15' : drawn.has(x) ? 'bg-cay text-fildisi' : 'bg-white text-ceviz'}`}>
                {x ?? ''}
              </span>
            ))}
          </div>
        </div>
      ))}
      <details className="w-full max-w-[34rem] text-xs">
        <summary className="cursor-pointer text-fildisi/70">Çekilen numaralar ({v.drawn.length}) ve oyuncular</summary>
        <div className="mt-2 grid grid-cols-10 gap-[2px]">
          {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => <span key={n} className={`rounded-sm py-0.5 text-center ${drawn.has(n) ? 'bg-pirinc text-ceviz' : 'bg-black/25 text-fildisi/50'}`}>{n}</span>)}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-1">
          {v.cards.map((_, p) => <li key={p} className="flex justify-between rounded bg-black/20 px-2 py-1"><span className="truncate">{names[p]}</span><span>{rowsDone(p)}/3 satır · {v.scores[p]} puan</span></li>)}
        </ul>
      </details>
    </div>
  );
}
