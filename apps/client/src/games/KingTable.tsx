import { AnimatePresence, motion } from 'framer-motion';
import { KING_GAMES, SUIT_NAMES, SUIT_SYMBOLS, sortHand, type KingAction, type KingGame, type KingView, type Suit } from '@kart/engine';
import { BackFan, PlayingCard } from '../components/Card';
import { Opponents, TurnHint, Who, relSeats, type TableProps } from './common';

const POS = ['bottom-2 left-1/2 -translate-x-1/2', 'left-3 top-1/2 -translate-y-1/2', 'top-2 left-1/2 -translate-x-1/2', 'right-3 top-1/2 -translate-y-1/2'];

export function KingTable({ view: v, names, avatars, offline, onAction }: TableProps<KingView>) {
  const order = relSeats(4, v.me);
  const rel = (seat: number) => order.indexOf(seat);
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const legalCards = new Set(v.legal.filter((a): a is Extract<KingAction, { type: 'play' }> => a.type === 'play').map((a) => a.card));
  const choices = v.legal.filter((a): a is Extract<KingAction, { type: 'choose' }> => a.type === 'choose');
  const cezaChoices = [...new Set(choices.filter((c) => c.game !== 'koz').map((c) => c.game))] as KingGame[];
  const kozOk = choices.some((c) => c.game === 'koz');
  const red = (s: Suit) => s === 'H' || s === 'D';
  const c = v.contract;
  const sub = (s: number) => <>{v.scores[s]} puan{c ? ` · bu el ${v.handDelta[s]}` : ''}</>;

  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (
        <>
          <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={sub(s)} />
          <BackFan count={v.handCounts[s]} />
        </>
      )} />
      <div className="flex flex-wrap justify-center gap-2 text-xs">
          <span className="chip bg-black/35">{v.handNo}/{v.totalHands}. el</span>
          {c && <span className="chip bg-fildisi text-sm font-bold text-ceviz">{KING_GAMES[c.game]}{c.trump ? <span className={red(c.trump) ? 'text-cay' : ''}> {SUIT_SYMBOLS[c.trump]}</span> : ''}</span>}
          {c && <span className="chip bg-black/35">Seçen: {names[v.chooser]}</span>}
      </div>
      <div className="felt relative min-h-[16rem] flex-1 rounded-[2rem]">
        <AnimatePresence>
          {v.trick.map((t) => (
            <motion.div key={t.card} className={`absolute ${POS[rel(t.seat)]}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <PlayingCard card={t.card} size="md" />
            </motion.div>
          ))}
        </AnimatePresence>
        {v.phase === 'choose' && !mine && <p className="absolute inset-0 flex items-center justify-center text-sm">{names[v.chooser]} oyunu seçiyor…</p>}
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : v.phase === 'choose' ? (mine ? 'Bu elin oyununu seç' : `${names[v.chooser]} seçiyor…`) : mine ? 'Sıra sende' : `${names[v.turn]} oynuyor…`} />
      {mine && v.phase === 'choose' && (
        <div className="panel flex flex-col gap-2 p-3" role="group" aria-label="Oyun seç">
          <div className="flex flex-wrap justify-center gap-1.5">
            {cezaChoices.map((g) => <button key={g} className="btn-ghost px-3 py-2 text-sm" onClick={() => onAction({ type: 'choose', game: g })}>{KING_GAMES[g]}</button>)}
          </div>
          {kozOk && (
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm">Kozlu:</span>
              {(['S', 'H', 'D', 'C'] as Suit[]).map((s) => <button key={s} aria-label={`Kozlu ${SUIT_NAMES[s]}`} className={`btn bg-fildisi px-3 text-xl ${red(s) ? 'text-cay' : 'text-ceviz'}`} onClick={() => onAction({ type: 'choose', game: 'koz', trump: s })}>{SUIT_SYMBOLS[s]}</button>)}
            </div>
          )}
          {v.me !== null && <p className="text-center text-xs text-fildisi/60">Kalan hakların: {v.quota.koz - v.picks[v.me].koz} kozlu · {v.quota.ceza - v.picks[v.me].ceza} ceza</p>}
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={sub(v.me)} />}
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {sortHand(v.hand).map((card) => {
            const ok = mine && v.phase === 'play' && legalCards.has(card);
            return <PlayingCard key={card} card={card} size="md" playable={ok} dim={mine && v.phase === 'play' && !ok} onClick={() => onAction({ type: 'play', card })} />;
          })}
        </div>
      </div>
      {v.lastHand && <p className="text-center text-xs text-fildisi/60">Son el ({KING_GAMES[v.lastHand.game]}): {v.lastHand.delta.map((d, p) => `${names[p]} ${d > 0 ? '+' : ''}${d}`).join(' · ')}</p>}
    </div>
  );
}
