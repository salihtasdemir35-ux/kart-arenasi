import { useEffect, useState } from 'react';
import { SUIT_NAMES, SUIT_SYMBOLS, sortHand, type KazikView, type PisView, type Suit, type YanikView } from '@kart/engine';
import { BackFan, CardBack, PlayingCard } from '../components/Card';
import { Modal } from '../components/ui';
import { Opponents, TurnHint, Who, relSeats, type TableProps } from './common';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function AnyCard({ c, onClick, playable, dim, selected, size = 'md' }: { c: string; onClick?: () => void; playable?: boolean; dim?: boolean; selected?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  if (c.startsWith('X')) return (
    <button onClick={onClick} disabled={!playable} aria-label="Joker" className={`flex h-20 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-fildisi text-xs font-black text-cuha shadow ${playable ? 'ring-2 ring-pirinc' : ''} ${selected ? '-translate-y-3 ring-4 ring-pirinc' : ''}`}>★<br />JOKER</button>
  );
  return <PlayingCard card={c} size={size} onClick={onClick} playable={playable} dim={dim} className={selected ? '-translate-y-3 !ring-4' : ''} />;
}

export function PisTable({ view: v, names, avatars, offline, onAction }: TableProps<PisView>) {
  const [jack, setJack] = useState<string | null>(null);
  const order = relSeats(v.n, v.me);
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const playable = new Set(v.legal.filter((a) => a.type === 'play').map((a: any) => a.card));
  const red = (s: Suit) => s === 'H' || s === 'D';
  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (<><Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`${v.handCounts[s]} kart · ceza ${v.scores[s]}`} /><BackFan count={v.handCounts[s]} /></>)} />
      <div className="felt flex min-h-[14rem] flex-1 items-center justify-center gap-6 rounded-[2rem] p-4">
        <div className="flex flex-col items-center gap-1 text-xs"><CardBack size="lg" /><span>Deste {v.deckCount}</span></div>
        <div className="flex flex-col items-center gap-1">
          <PlayingCard card={v.top} size="lg" />
          <span className={`chip bg-fildisi text-sm font-bold ${red(v.suit) ? 'text-cay' : 'text-ceviz'}`}>Takım: {SUIT_SYMBOLS[v.suit]} {SUIT_NAMES[v.suit]}</span>
          {v.penalty > 0 && <span className="chip bg-cay">7 cezası: {v.penalty} kart</span>}
          {v.note && <span className="text-xs text-fildisi/80">{v.note}</span>}
          <span className="text-xs text-fildisi/60">Yön: {v.dir === 1 ? '↻' : '↺'}</span>
        </div>
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : v.phase === 'eight' ? '8 attın: bir kart daha at ya da çek' : v.phase === 'drawn' ? 'Çektiğin kartı at ya da pas geç' : v.penalty ? '7 at ya da cezayı çek' : 'Kart at ya da çek'} />
      {mine && (
        <div className="flex justify-center gap-2">
          {v.legal.some((a) => a.type === 'draw') && <button className="btn-ghost px-5" onClick={() => onAction({ type: 'draw' })}>{v.penalty ? `${v.penalty} kart çek` : 'Kart çek'}</button>}
          {v.legal.some((a) => a.type === 'pass') && <button className="btn-ghost px-5" onClick={() => onAction({ type: 'pass' })}>Pas</button>}
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={`ceza ${v.scores[v.me]} · ${v.handNo}/${v.totalHands}. el`} />}
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {sortHand(v.hand).map((c) => <PlayingCard key={c} card={c} size="md" playable={mine && playable.has(c)} dim={mine && !playable.has(c)} onClick={() => (c.endsWith('11') && c.length === 3 ? setJack(c) : onAction({ type: 'play', card: c }))} />)}
        </div>
      </div>
      {v.lastHand && <p className="text-center text-xs text-fildisi/60">Son el: {names[v.lastHand.winner]} bitirdi{v.lastHand.jack ? ' (Valeyle, ceza ×2)' : ''}</p>}
      <Modal open={!!jack} onClose={() => setJack(null)} title="Vale: takımı seç">
        <div className="grid grid-cols-4 gap-2">
          {SUITS.map((s) => <button key={s} aria-label={SUIT_NAMES[s]} className={`btn bg-fildisi py-3 text-3xl ${red(s) ? 'text-cay' : 'text-ceviz'}`} onClick={() => { onAction({ type: 'play', card: jack!, suit: s }); setJack(null); }}>{SUIT_SYMBOLS[s]}</button>)}
        </div>
      </Modal>
    </div>
  );
}

export function KazikTable({ view: v, names, avatars, offline, onAction }: TableProps<KazikView>) {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [v.hand.join(','), v.pile.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = relSeats(v.n, v.me);
  const me = v.me ?? 0;
  const mine = v.me !== null && v.turn === v.me && v.loser === null;
  const blind = v.legal.some((a) => a.type === 'blind');
  const usable = new Set(v.legal.flatMap((a: any) => a.cards ?? []));
  const fromUp = v.hand.length === 0 && v.up[me].length > 0;
  const pickable = fromUp ? v.up[me] : v.hand;
  const toggle = (c: string) => setSel((x) => (x.includes(c) ? x.filter((y) => y !== c) : x.length && !x.every((y) => y.slice(1) === c.slice(1)) ? [c] : [...x, c]));
  const top = v.pile[v.pile.length - 1];
  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (
        <>
          <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.loser === null} sub={v.out.includes(s) ? 'Kurtuldu ✓' : `${v.handCounts[s]} el kartı`} />
          <div className="flex gap-0.5">{v.up[s].map((c) => <PlayingCard key={c} card={c} size="sm" />)}{Array.from({ length: v.downCounts[s] }).map((_, k) => <CardBack key={k} size="sm" className={v.up[s].length ? '-ml-3' : ''} />)}</div>
        </>
      )} />
      <div className="felt flex min-h-[13rem] flex-1 items-center justify-center gap-6 rounded-[2rem] p-4">
        <div className="flex flex-col items-center gap-1 text-xs">{v.deckCount ? <CardBack size="lg" /> : <span className="h-[6.2rem] w-[4.4rem] rounded-xl border-2 border-dashed border-white/25" />}<span>Deste {v.deckCount}</span></div>
        <div className="flex flex-col items-center gap-1 text-xs">
          {top ? <div className="flex">{v.pile.map((c, k) => <span key={c + k} className={k ? '-ml-12' : ''}><PlayingCard card={c} size="lg" /></span>)}</div> : <span className="h-[6.2rem] w-[4.4rem] rounded-xl border-2 border-dashed border-white/25" />}
          <span>{v.note || (top ? 'Yığın' : 'Yığın boş')}</span>
        </div>
      </div>
      <TurnHint mine={mine} text={v.loser !== null ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : blind ? 'Kapalı kartlarından birini körlemesine aç' : usable.size ? 'Aynı değerden kart(lar) seç ve at' : 'Atacak kartın yok: yığını al'} />
      {mine && !blind && (
        <div className="flex justify-center gap-2">
          <button className="btn-brass px-5" disabled={!sel.length || !sel.every((c) => usable.has(c))} onClick={() => onAction({ type: 'play', cards: sel })}>{sel.length ? `${sel.length} kart at` : 'Kart seç'}</button>
          {v.legal.some((a) => a.type === 'take') && <button className="btn-red px-5" onClick={() => onAction({ type: 'take' })}>Yığını al</button>}
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={v.out.includes(me) ? 'Kurtuldun ✓' : `${v.hand.length} el · ${v.up[me].length} açık · ${v.downCounts[me]} kapalı`} />}
        <div className="flex gap-1">
          {v.up[me].map((c) => <AnyCard key={c} c={c} size="sm" playable={mine && fromUp && usable.has(c)} selected={sel.includes(c)} onClick={() => toggle(c)} />)}
          {Array.from({ length: v.downCounts[me] }).map((_, k) => <CardBack key={k} size="sm" onClick={mine && blind ? () => onAction({ type: 'blind', index: k }) : undefined} highlight={mine && blind} />)}
        </div>
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {sortHand(v.hand).map((c) => <AnyCard key={c} c={c} playable={mine && usable.has(c)} dim={mine && !usable.has(c) && !fromUp} selected={sel.includes(c)} onClick={() => toggle(c)} />)}
        </div>
        {pickable.length === 0 && !blind && v.me !== null && null}
      </div>
    </div>
  );
}

export function YanikTable({ view: v, names, avatars, offline, onAction }: TableProps<YanikView>) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [v.hand.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = relSeats(v.n, v.me);
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const top = v.discard[v.discard.length - 1];
  const canFinish = sel !== null && v.legal.some((a) => a.type === 'finish' && a.card === sel);
  return (
    <div className="flex h-full flex-col gap-3">
      <Opponents seats={order.slice(1)} render={(s) => (<><Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={v.burned[s] ? 'Yandı 🔥' : `ceza ${v.scores[s]}/101`} />{!v.burned[s] && <BackFan count={v.handCounts[s]} />}</>)} />
      <div className="felt flex min-h-[13rem] flex-1 items-center justify-center gap-6 rounded-[2rem] p-4">
        <button disabled={!(mine && v.phase === 'draw')} onClick={() => onAction({ type: 'draw', from: 'deck' })} className="flex flex-col items-center gap-1 text-xs" aria-label="Desteden çek"><CardBack size="lg" highlight={mine && v.phase === 'draw'} /><span>Deste {v.deckCount}</span></button>
        <div className="flex flex-col items-center gap-1 text-xs">
          {top && <AnyCard c={top} size="lg" playable={mine && v.phase === 'draw'} onClick={() => onAction({ type: 'draw', from: 'discard' })} />}
          <span>Yerdeki kart</span>
        </div>
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : v.phase === 'draw' ? 'Desteden ya da yerden çek' : canFinish ? 'Bu kartı atarak bitirebilirsin!' : 'Atacağın kartı seç'} />
      {mine && v.phase === 'discard' && (
        <div className="flex justify-center gap-2">
          <button className="btn-brass px-5" disabled={sel === null} onClick={() => sel && onAction({ type: 'discard', card: sel })}>At</button>
          <button className="btn-red px-5" disabled={!canFinish} onClick={() => sel && onAction({ type: 'finish', card: sel })}>Bitir</button>
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={v.burned[v.me] ? 'Yandın 🔥' : `ceza ${v.scores[v.me]}/101 · elindeki açık ceza ${v.myPenalty}`} />}
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {sortHand(v.hand.filter((c) => !c.startsWith('X'))).concat(v.hand.filter((c) => c.startsWith('X'))).map((c) => (
            <AnyCard key={c} c={c} playable={mine && v.phase === 'discard'} selected={sel === c} onClick={() => setSel(sel === c ? null : c)} />
          ))}
        </div>
      </div>
      {v.lastHand && <p className="text-center text-xs text-fildisi/60">Son el: {names[v.lastHand.winner]} bitirdi · {v.lastHand.delta.map((d, p) => `${names[p]} +${d}`).join(' · ')}{v.lastHand.burned.length ? ` · yanan: ${v.lastHand.burned.map((p) => names[p]).join(', ')}` : ''}</p>}
    </div>
  );
}
