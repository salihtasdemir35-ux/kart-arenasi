import { AnimatePresence, motion } from 'framer-motion';
import { cardName, rankOf, sortHand, type PapazView } from '@kart/engine';
import { BackFan, CardBack, PlayingCard } from '../components/Card';
import { Opponents, TurnHint, Who, relSeats, type TableProps } from './common';

export function PapazTable({ view: v, names, avatars, offline, onAction }: TableProps<PapazView>) {
  const order = relSeats(v.n, v.me);
  const myTurn = v.me !== null && v.turn === v.me && !v.over;
  const done = (s: number) => v.finished.includes(s);
  const ld = v.lastDraw;

  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (
        <>
          <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && !v.over}
            sub={v.loser === s ? 'Papaz onda kaldı' : done(s) ? 'Kurtuldu ✓' : `${v.handCounts[s]} kart`} />
          {!done(s) && <BackFan count={v.handCounts[s]} />}
        </>
      )} />

      <div className="felt relative flex min-h-[15rem] flex-1 flex-col items-center justify-center gap-3 rounded-[2rem] p-4">
        {myTurn && v.target !== null ? (
          <>
            <p className="text-sm font-semibold text-pirinc-300">{names[v.target]} oyuncusundan bir kart çek</p>
            <div className="flex max-w-full flex-wrap justify-center gap-1.5">
              {v.legal.map((a) => (
                <CardBack key={a.index} size="md" highlight onClick={() => onAction(a)} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex">{[0, 1, 2].map((i) => <CardBack key={i} size="md" className={i ? '-ml-10 rotate-6' : '-rotate-3'} />)}</div>
            <p className="text-sm text-fildisi/70">Atılan kart: {v.discardCount}</p>
          </div>
        )}
        {ld && (
          <p className="text-center text-xs text-fildisi/80">
            {names[ld.to]}, {names[ld.from]} oyuncusundan kart çekti{ld.paired ? ' ve çift attı' : ''}.
          </p>
        )}
        <AnimatePresence>
          {v.myLastDrawn && (
            <motion.p key={v.myLastDrawn + v.discardCount} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-3 rounded-full bg-black/40 px-3 py-1 text-xs">
              Çektiğin kart: {cardName(v.myLastDrawn)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <TurnHint mine={myTurn} text={v.over ? 'Oyun bitti' : myTurn ? 'Sıra sende' : `${names[v.turn]} kart çekiyor…`} />

      <div className="flex flex-col items-center gap-2">
        {v.me !== null && (
          <Who seat={v.me} names={names} avatars={avatars} active={myTurn}
            sub={v.loser === v.me ? 'Papaz sende kaldı' : done(v.me) ? 'Kurtuldun ✓' : `${v.hand.length} kart`} />
        )}
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          <AnimatePresence mode="popLayout">
            {sortHand(v.hand).map((c) => <PlayingCard key={c} card={c} size="md" className={rankOf(c) === 13 ? 'ring-2 ring-cay' : ''} />)}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
