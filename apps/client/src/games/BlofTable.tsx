import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { rankName, sortHand, type BlofView } from '@kart/engine';
import { BackFan, CardBack, PlayingCard } from '../components/Card';
import { Opponents, TurnHint, Who, relSeats, type TableProps } from './common';

export function BlofTable({ view: v, names, avatars, offline, onAction }: TableProps<BlofView>) {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [v.hand.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = relSeats(v.n, v.me);
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const toggle = (c: string) => setSel((x) => (x.includes(c) ? x.filter((y) => y !== c) : x.length < 4 ? [...x, c] : x));
  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (
        <>
          <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`${v.handCounts[s]} kart`} />
          <BackFan count={v.handCounts[s]} />
        </>
      )} />
      <div className="felt relative flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-3 rounded-[2rem] p-4">
        <div className="flex items-center">
          {Array.from({ length: Math.min(v.pileCount, 6) }).map((_, i) => <CardBack key={i} size="lg" className={i ? '-ml-14 rotate-3' : '-rotate-2'} />)}
          {!v.pileCount && <div className="h-[6.2rem] w-[4.4rem] rounded-xl border-2 border-dashed border-white/25" />}
        </div>
        <p className="text-sm">Yerde {v.pileCount} kart · sıradaki değer: <b className="text-pirinc-300">{rankName(v.rank)}</b></p>
        {v.claim && <p className="rounded-full bg-black/35 px-3 py-1 text-sm">{names[v.claim.seat]}: “{v.claim.count} tane {rankName(v.claim.rank)}”</p>}
        <AnimatePresence>
          {v.last && (
            <motion.p key={v.last.text + v.pileCount} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${v.last.caught ? 'bg-cay text-fildisi' : v.last.caught === false ? 'bg-pirinc text-ceviz' : 'bg-black/30'}`} aria-live="polite">
              {v.last.text}{v.last.taker !== null ? ` Yığını ${names[v.last.taker]} aldı.` : ''}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} düşünüyor…` : v.phase === 'decide' ? 'İnanıyor musun?' : `1–4 kart seç ve "${rankName(v.rank)}" diye at`} />
      {mine && v.phase === 'decide' && (
        <div className="flex justify-center gap-2">
          <button className="btn-red px-6 text-lg" onClick={() => onAction({ type: 'challenge' })}>Blöf!</button>
          <button className="btn-ghost px-6" onClick={() => onAction({ type: 'believe' })}>İnanıyorum</button>
        </div>
      )}
      {mine && v.phase === 'play' && (
        <button className="btn-brass self-center px-6" disabled={!sel.length} onClick={() => onAction({ type: 'play', cards: sel })}>
          {sel.length ? `${sel.length} kartı “${rankName(v.rank)}” diye at` : 'Kart seç'}
        </button>
      )}
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={`${v.hand.length} kart`} />}
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {sortHand(v.hand).map((c) => (
            <PlayingCard key={c} card={c} size="md" playable={mine && v.phase === 'play'} onClick={() => toggle(c)} className={sel.includes(c) ? '-translate-y-3 !ring-4' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
