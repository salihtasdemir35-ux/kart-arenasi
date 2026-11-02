import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SUIT_NAMES, SUIT_SYMBOLS, sortHand, suitOf, type BatakAction, type BatakView, type Suit } from '@kart/engine';
import { BackFan, PlayingCard } from '../components/Card';
import { Opponents, TurnHint, Who, relSeats, type TableProps } from './common';

const POS = ['bottom-2 left-1/2 -translate-x-1/2', 'left-3 top-1/2 -translate-y-1/2', 'top-2 left-1/2 -translate-x-1/2', 'right-3 top-1/2 -translate-y-1/2'];

export function BatakTable({ view: v, names, avatars, offline, onAction }: TableProps<BatakView>) {
  const [bury, setBury] = useState<string[]>([]);
  const order = relSeats(v.n, v.me);
  const rel = (seat: number) => order.indexOf(seat);
  const myTurn = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const legalCards = new Set(v.legal.filter((a): a is Extract<BatakAction, { type: 'play' }> => a.type === 'play').map((a) => a.card));
  const bids = v.legal.filter((a): a is Extract<BatakAction, { type: 'bid' }> => a.type === 'bid');
  const bidLabel = (b: number | 'pas' | null) => (b === null ? '—' : b === 'pas' ? 'Pas' : String(b));
  const red = (s: Suit) => s === 'H' || s === 'D';

  const hint = v.phase === 'over' ? 'Oyun bitti'
    : v.phase === 'bid' ? (myTurn ? 'İhale sırası sende' : `${names[v.turn]} ihale düşünüyor…`)
    : v.phase === 'trump' ? (myTurn ? 'İhale senin: kozu seç' : `${names[v.turn]} koz seçiyor…`)
    : myTurn ? 'Sıra sende' : `${names[v.turn]} oynuyor…`;

  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (
        <>
          <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'}
            sub={<>{v.esli && v.me !== null && s % 2 === v.me % 2 ? 'Eşin · ' : ''}İhale {bidLabel(v.bids[s])} · El {v.tricksWon[s]} · Puan {v.scores[s]}</>} />
          <BackFan count={v.handCounts[s]} />
        </>
      )} />

      <div className="flex flex-wrap justify-center gap-2 text-xs">
          {v.trump && <span className={`chip bg-fildisi ${red(v.trump) ? 'text-cay' : 'text-ceviz'} text-sm font-bold`}>Koz {SUIT_SYMBOLS[v.trump]} {SUIT_NAMES[v.trump]}</span>}
          {v.bidder !== null && v.highBid !== null && v.phase !== 'bid' && <span className="chip bg-black/35">{names[v.bidder]} · ihale {v.highBid}</span>}
          {v.trump && !v.trumpBroken && v.phase === 'play' && <span className="chip bg-black/35">Koz henüz kırılmadı</span>}
          {v.totalHands > 1 && <span className="chip bg-black/35">El {v.handNo}/{v.totalHands}</span>}
      </div>
      <div className="felt relative min-h-[16rem] flex-1 rounded-[2rem]">
        <AnimatePresence>
          {v.trick.map((t) => (
            <motion.div key={t.card} className={`absolute ${POS[rel(t.seat)]}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}>
              <PlayingCard card={t.card} size="md" />
            </motion.div>
          ))}
        </AnimatePresence>
        {v.trick.length === 0 && v.lastTrickWinner !== null && v.phase === 'play' && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-fildisi/70">Son eli {names[v.lastTrickWinner]} aldı</p>
        )}
        {v.phase === 'bid' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="rounded-2xl bg-black/35 px-4 py-3 text-center">
              <p className="text-sm text-fildisi/80">En yüksek ihale</p>
              <p className="text-4xl font-black text-pirinc-300">{v.highBid ?? '—'}</p>
              {v.bidder !== null && <p className="text-sm">{names[v.bidder]}</p>}
            </div>
          </div>
        )}
      </div>

      <TurnHint mine={myTurn} text={hint} />

      {myTurn && v.phase === 'bid' && (
        <div className="panel flex flex-wrap items-center justify-center gap-1.5 p-3" role="group" aria-label="İhale ver">
          {v.legal.some((x) => x.type === 'pass') && <button className="btn-red px-4" onClick={() => onAction({ type: 'pass' })}>Pas</button>}
          {v.variant === 'kozmaca' && <span className="w-full text-center text-xs text-fildisi/70">Koz maça. Kaç el alacağını söyle:</span>}
          {bids.map((b) => <button key={b.value} className="btn-brass min-w-[2.75rem] px-3" onClick={() => onAction(b)}>{b.value}</button>)}
        </div>
      )}
      {myTurn && v.phase === 'bury' && (
        <div className="panel flex flex-col items-center gap-2 p-3">
          <p className="text-sm">Gömüyü aldın. Gömmek için 4 kart seç ({bury.length}/4)</p>
          <button className="btn-brass" disabled={bury.length !== 4} onClick={() => { onAction({ type: 'bury', cards: bury }); setBury([]); }}>Göm</button>
        </div>
      )}
      {myTurn && v.phase === 'trump' && (
        <div className="panel flex justify-center gap-2 p-3" role="group" aria-label="Koz seç">
          {(['S', 'H', 'D', 'C'] as Suit[]).map((s) => (
            <button key={s} className={`btn bg-fildisi px-4 text-2xl ${red(s) ? 'text-cay' : 'text-ceviz'}`} onClick={() => onAction({ type: 'trump', suit: s })} aria-label={SUIT_NAMES[s]}>
              {SUIT_SYMBOLS[s]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        {v.me !== null && (
          <Who seat={v.me} names={names} avatars={avatars} active={myTurn} sub={<>İhale {bidLabel(v.bids[v.me])} · El {v.tricksWon[v.me]} · Puan {v.scores[v.me]}</>} />
        )}
        <div className="flex max-w-full flex-wrap justify-center gap-1 sm:flex-nowrap">
          <AnimatePresence mode="popLayout">
            {sortHand(v.hand).map((c, i) => {
              const ok = myTurn && v.phase === 'play' && legalCards.has(c);
              return (
                <PlayingCard key={c} card={c} size="md" playable={ok || (myTurn && v.phase === 'bury')} dim={myTurn && v.phase === 'play' && !ok}
                  className={i && suitOf(c) === suitOf(sortHand(v.hand)[i - 1]) ? 'sm:-ml-4' : ''}
                  onClick={() => (v.phase === 'bury' ? setBury((b) => (b.includes(c) ? b.filter((x) => x !== c) : b.length < 4 ? [...b, c] : b)) : onAction({ type: 'play', card: c }))} />
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      {v.lastHand && (
        <p className="text-center text-xs text-fildisi/60">
          Son el: {names[v.lastHand.bidder]} {v.lastHand.bid} ihale, {v.lastHand.tricks[v.lastHand.bidder]} el aldı ({v.lastHand.delta[v.lastHand.bidder] > 0 ? '+' : ''}{v.lastHand.delta[v.lastHand.bidder]})
        </p>
      )}
    </div>
  );
}
