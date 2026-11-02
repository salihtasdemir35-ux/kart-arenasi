import { useEffect, useState } from 'react';
import { total, type BJView, type PokerView } from '@kart/engine';
import { CardBack, PlayingCard } from '../components/Card';
import { TurnHint, Who, relSeats, type TableProps } from './common';

const VARIANT = { holdem: "Texas Hold'em", omaha: 'Omaha (pot limit)', draw: '5 kart çekmeli' } as const;

export function PokerTable({ view: v, names, avatars, offline, onAction }: TableProps<PokerView>) {
  const order = relSeats(v.n, v.me);
  const me = v.me ?? 0;
  const mine = v.me !== null && v.legal.length > 0;
  const has = (t: string) => v.legal.find((a) => a.type === t) as any;
  const raise = has('raise');
  const [amt, setAmt] = useState(v.minRaiseTo);
  const [disc, setDisc] = useState<string[]>([]);
  useEffect(() => { setAmt(v.minRaiseTo); setDisc([]); }, [v.minRaiseTo, v.phase, v.handNo]);
  const clamp = (x: number) => Math.max(v.minRaiseTo, Math.min(v.maxRaiseTo, Math.round(x / 10) * 10));
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap justify-center gap-2 text-xs"><span className="chip bg-black/35">{VARIANT[v.variant]}</span><span className="chip bg-black/35">{v.handNo}. el · kör 10/20</span><span className="chip bg-pirinc/30">Sanal fiş — gerçek para yok</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {order.slice(1).map((s) => (
          <div key={s} className={`flex flex-col items-center gap-1 rounded-xl p-1.5 ${v.folded[s] || v.out[s] ? 'opacity-40' : ''}`}>
            <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={v.out[s] ? 'Elendi' : `${v.chips[s]} fiş${v.bets[s] ? ` · bahis ${v.bets[s]}` : ''}${v.folded[s] ? ' · çekildi' : v.chips[s] === 0 ? ' · all-in' : ''}`} />
            <div className="flex">{Array.from({ length: v.holeCounts[s] }).map((_, k) => <CardBack key={k} size="sm" className={k ? '-ml-5' : ''} />)}</div>
            {s === v.button && <span className="chip bg-fildisi text-ceviz">D</span>}
          </div>
        ))}
      </div>
      <div className="felt flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 rounded-[2rem] p-3">
        <p className="text-lg font-black text-pirinc-300">Pot: {v.pot}</p>
        <div className="flex gap-1">{v.board.map((c) => <PlayingCard key={c} card={c} size="md" />)}{v.variant !== 'draw' && Array.from({ length: 5 - v.board.length }).map((_, k) => <span key={k} className="h-20 w-14 rounded-lg border border-dashed border-white/20" />)}</div>
        {v.phase === 'over' && v.lastHand && (
          <div className="flex flex-col items-center gap-1 text-sm" aria-live="polite">
            {v.lastHand.winners.map((w) => <p key={w.seat}><b>{names[w.seat]}</b> {w.amount} fiş kazandı · {w.hand}</p>)}
            {v.lastHand.shown.map((x) => <div key={x.seat} className="flex items-center gap-1 text-xs"><span className="w-20 truncate">{names[x.seat]}</span>{x.cards.map((c) => <PlayingCard key={c} card={c} size="sm" />)}<span>{x.hand}</span></div>)}
          </div>
        )}
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? (mine ? 'El bitti — sonraki eli başlat' : 'El bitti') : !mine ? `${names[v.turn]} düşünüyor…` : v.phase === 'draw' ? 'Değiştirmek istediğin kartları seç (en fazla 3)' : v.toCall ? `Görmek için ${v.toCall} fiş` : 'Sıra sende'} />
      {mine && v.phase === 'over' && <button className="btn-brass self-center px-6" onClick={() => onAction({ type: 'check' })}>Sonraki el</button>}
      {mine && v.phase === 'draw' && <button className="btn-brass self-center px-6" onClick={() => onAction({ type: 'draw', discard: disc })}>{disc.length ? `${disc.length} kart değiştir` : 'Kart değiştirme (servis)'}</button>}
      {mine && v.phase === 'bet' && (
        <div className="panel flex flex-col gap-2 p-3">
          <div className="flex flex-wrap justify-center gap-1.5">
            <button className="btn-red px-4" onClick={() => onAction({ type: 'fold' })}>Çekil</button>
            {has('check') && <button className="btn-ghost px-4" onClick={() => onAction({ type: 'check' })}>Pas</button>}
            {has('call') && <button className="btn-ghost px-4" onClick={() => onAction({ type: 'call' })}>Gör ({Math.min(v.toCall, v.chips[me])})</button>}
            {raise && <button className="btn-brass px-4" onClick={() => onAction({ type: 'raise', to: amt })}>{v.currentBet ? 'Artır' : 'Bahis'}: {amt}</button>}
            {has('allin') && <button className="btn-red px-4" onClick={() => onAction({ type: 'allin' })}>All-in ({v.chips[me] + v.bets[me]})</button>}
          </div>
          {raise && v.maxRaiseTo > v.minRaiseTo && (
            <div className="flex items-center gap-2 text-xs">
              <input type="range" className="flex-1 accent-pirinc" min={v.minRaiseTo} max={v.maxRaiseTo} step={10} value={amt} onChange={(e) => setAmt(clamp(Number(e.target.value)))} aria-label="Artırma miktarı" />
              <button className="chip bg-white/10" onClick={() => setAmt(clamp(v.currentBet + v.pot / 2))}>½ pot</button>
              <button className="chip bg-white/10" onClick={() => setAmt(clamp(v.currentBet + v.pot))}>Pot</button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={me} names={names} avatars={avatars} active={mine} sub={v.out[me] ? 'Elendin' : `${v.chips[me]} fiş${v.bets[me] ? ` · bahsin ${v.bets[me]}` : ''}${me === v.button ? ' · D' : ''}`} />}
        <div className="flex gap-1">
          {v.hole.map((c) => <PlayingCard key={c} card={c} size="lg" playable={mine && v.phase === 'draw'} onClick={() => setDisc((d) => (d.includes(c) ? d.filter((x) => x !== c) : d.length < 3 ? [...d, c] : d))} className={disc.includes(c) ? '-translate-y-3 !ring-4 !ring-cay' : ''} />)}
        </div>
      </div>
    </div>
  );
}

const strip = (c: string) => c.split('#')[0];

export function BlackjackTable({ view: v, names, avatars, offline, onAction }: TableProps<BJView>) {
  const me = v.me ?? 0;
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const has = (t: string) => v.legal.some((a) => a.type === t);
  const dealerTotal = v.dealerShown.length ? total(v.dealerShown).total : 0;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap justify-center gap-2 text-xs"><span className="chip bg-black/35">Tur {v.round}/{v.maxRounds}</span><span className="chip bg-pirinc/30">Sanal fiş — gerçek para yok</span></div>
      <div className="felt flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-[2rem] p-3">
        <p className="text-sm font-semibold">Kasa {v.dealerShown.length ? `· ${dealerTotal}${v.dealerHidden ? '+?' : ''}` : ''}</p>
        <div className="flex gap-1">{v.dealerShown.map((c, k) => <PlayingCard key={c + k} card={strip(c)} size="md" />)}{v.dealerHidden && <CardBack size="md" />}</div>
        {v.lastRound && v.phase === 'bet' && <p className="text-xs text-fildisi/70">Son tur kasa: {v.lastRound.dealerTotal}{v.lastRound.dealerTotal > 21 ? ' (patladı)' : ''}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {relSeats(v.n, v.me).map((p) => (
          <div key={p} className={`flex flex-col gap-1 rounded-xl bg-black/20 p-2 ${v.out[p] ? 'opacity-40' : ''}`}>
            <Who seat={p} names={names} avatars={avatars} offline={offline} active={v.turn === p && v.phase !== 'over'} sub={`${v.chips[p]} fiş${v.out[p] ? ' · elendi' : ''}`} />
            {v.hands[p].map((h, k) => (
              <div key={k} className={`flex items-center gap-1 ${v.turn === p && v.hand === k && v.phase === 'play' ? 'rounded-lg ring-2 ring-pirinc' : ''}`}>
                {h.cards.map((c, j) => <PlayingCard key={c + j} card={strip(c)} size="sm" />)}
                <span className="text-xs">{h.cards.length ? total(h.cards).total : ''} · bahis {h.bet}{h.result ? ` · ${h.result}` : ''}</span>
              </div>
            ))}
            {v.lastRound && v.phase === 'bet' && v.lastRound.results[p]?.length ? <p className="text-xs text-fildisi/70">Son tur: {v.lastRound.results[p].join(', ')}</p> : null}
          </div>
        ))}
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : v.phase === 'bet' ? 'Bahsini koy' : 'Kart çek ya da dur'} />
      {mine && v.phase === 'bet' && (
        <div className="flex flex-wrap justify-center gap-2">
          {(v.legal as { type: 'bet'; amount: number }[]).map((b) => <button key={b.amount} className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-dashed border-fildisi/70 bg-cay font-black text-fildisi shadow-lg" onClick={() => onAction(b)}>{b.amount}</button>)}
        </div>
      )}
      {mine && v.phase === 'play' && (
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-brass px-5" onClick={() => onAction({ type: 'hit' })}>Kart çek</button>
          <button className="btn-ghost px-5" onClick={() => onAction({ type: 'stand' })}>Dur</button>
          {has('double') && <button className="btn-ghost px-4" onClick={() => onAction({ type: 'double' })}>İkiye katla</button>}
          {has('split') && <button className="btn-ghost px-4" onClick={() => onAction({ type: 'split' })}>Böl</button>}
        </div>
      )}
    </div>
  );
}
