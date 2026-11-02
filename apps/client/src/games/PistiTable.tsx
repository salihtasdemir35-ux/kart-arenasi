import { AnimatePresence, motion } from 'framer-motion';
import { sortHand, type PistiView } from '@kart/engine';
import { BackFan, CardBack, PlayingCard } from '../components/Card';
import { Opponents, TurnHint, Who, relSeats, type TableProps } from './common';

export function PistiTable({ view: v, names, avatars, offline, onAction }: TableProps<PistiView>) {
  const order = relSeats(v.n, v.me);
  const me = order[0];
  const myTurn = v.me !== null && v.turn === v.me && !v.over;
  const legal = new Set(v.legal.map((a) => a.card));
  const team = v.n === 4;
  const sideOf = (seat: number) => (team ? seat % 2 : seat);
  const sideName = (side: number) => team ? (side === sideOf(me) ? 'Bizim takım' : 'Rakip takım') : names[side];
  const last = v.log[v.log.length - 1];
  const shownTable = v.tableVisible.slice(-6);

  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (
        <>
          <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && !v.over}
            sub={team ? (sideOf(s) === sideOf(me) ? 'Eşin' : 'Rakip') : `${v.capturedCounts[sideOf(s)]} kart aldı`} />
          <BackFan count={v.handCounts[s]} />
        </>
      )} />

      <div className="felt relative flex min-h-[15rem] flex-1 items-center justify-center rounded-[2rem] p-4">
        <div className="absolute left-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
          {v.deckCount > 0 ? <CardBack size="sm" /> : <div className="h-[3.15rem] w-9 rounded-md border border-dashed border-white/20" />}
          <span className="text-xs text-fildisi/80">Deste {v.deckCount}</span>
        </div>

        <div className="relative flex items-center" aria-label={`Yerde ${v.tableCount} kart`}>
          {v.hiddenCount > 0 && Array.from({ length: v.hiddenCount }).map((_, i) => (
            <CardBack key={'h' + i} size="lg" className={i ? '-ml-14' : ''} />
          ))}
          <AnimatePresence mode="popLayout">
            {shownTable.map((c, i) => (
              <PlayingCard key={c} card={c} size="lg" layoutId={'p-' + c}
                className={(i > 0 || v.hiddenCount > 0) ? '-ml-12' : ''} />
            ))}
          </AnimatePresence>
          {v.tableCount === 0 && <div className="flex h-[6.2rem] w-[4.4rem] items-center justify-center rounded-xl border-2 border-dashed border-white/25 text-xs text-fildisi/60">Boş</div>}
        </div>

        <AnimatePresence>
          {last?.pisti ? (
            <motion.div key={v.log.length + '-' + last.card}
              initial={{ scale: 0.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute right-4 top-4 rounded-2xl bg-cay px-4 py-2 text-2xl font-black text-fildisi shadow-xl">
              Pişti! +{last.pisti}
            </motion.div>
          ) : null}
        </AnimatePresence>

      </div>

      <div className="flex flex-wrap justify-center gap-2 text-xs">
        {Array.from({ length: v.sides }).map((_, side) => (
          <span key={side} className={`chip ${side === sideOf(me) ? 'bg-pirinc text-ceviz' : 'bg-black/35'}`}>
            {sideName(side)}: {v.totals[side] + v.currentScores[side]} puan · {v.capturedCounts[side]} kart
          </span>
        ))}
      </div>

      <TurnHint mine={myTurn} text={v.over ? 'Oyun bitti' : myTurn ? 'Sıra sende: bir kart at' : `${names[v.turn]} düşünüyor…`} />

      <div className="flex flex-col items-center gap-2">
        {v.me !== null && (
          <Who seat={me} names={names} avatars={avatars} active={myTurn} sub={team ? 'Takım: ' + sideName(sideOf(me)) : `${v.capturedCounts[sideOf(me)]} kart aldın`} />
        )}
        <div className="flex min-h-[6.6rem] items-end justify-center gap-2">
          <AnimatePresence mode="popLayout">
            {sortHand(v.hand).map((c) => (
              <PlayingCard key={c} card={c} size="lg" layoutId={'p-' + c} playable={myTurn && legal.has(c)}
                onClick={() => onAction({ type: 'play', card: c })} />
            ))}
          </AnimatePresence>
        </div>
        {v.target > 0 && <p className="text-xs text-fildisi/60">{v.handNo}. el · {v.target} puana kadar</p>}
      </div>
    </div>
  );
}
