import { AnimatePresence, motion } from 'framer-motion';
import { STRAIN_LABEL, sortHand, type BricAction, type BricView, type Call, type Strain } from '@kart/engine';
import { PlayingCard } from '../components/Card';
import { TurnHint, Who, relSeats, type TableProps } from './common';

const SEAT_NAMES = ['Kuzey', 'Doğu', 'Güney', 'Batı'];
const POS = ['bottom-2 left-1/2 -translate-x-1/2', 'left-3 top-1/2 -translate-y-1/2', 'top-2 left-1/2 -translate-x-1/2', 'right-3 top-1/2 -translate-y-1/2'];
const STRAINS: Strain[] = ['C', 'D', 'H', 'S', 'NT'];
const callText = (c: Call) => (c.type === 'pass' ? 'Pas' : c.type === 'double' ? 'X' : c.type === 'redouble' ? 'XX' : `${c.level}${STRAIN_LABEL[c.strain]}`);
const red = (st: string) => st === 'H' || st === 'D';

export function BricTable({ view: v, names, avatars, offline, onAction }: TableProps<BricView>) {
  const order = relSeats(4, v.me);
  const rel = (seat: number) => order.indexOf(seat);
  const mine = v.me !== null && v.controlling === v.me && v.phase !== 'over';
  const legal = v.legal as BricAction[];
  const can = (c: Call) => legal.some((x) => JSON.stringify(x) === JSON.stringify(c));
  const playable = new Set(legal.filter((x): x is { type: 'play'; card: string } => x.type === 'play').map((x) => x.card));
  const c = v.contract;
  const label = (s: number) => `${names[s]} · ${SEAT_NAMES[s]}${v.vul[s] ? ' (zonda)' : ''}`;
  const dummyMine = mine && v.turn === v.dummySeat;
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        <span className="chip bg-black/35">Board {v.board}/{v.totalBoards}</span>
        <span className="chip bg-black/35">K-G {v.scores[0]} · D-B {v.scores[1]}</span>
        {c && <span className="chip bg-fildisi font-bold text-ceviz">{c.level}<span className={red(c.strain) ? 'text-cay' : ''}>{STRAIN_LABEL[c.strain]}</span>{c.doubled === 1 ? ' X' : c.doubled === 2 ? ' XX' : ''} · {SEAT_NAMES[c.declarer]}</span>}
        {c && <span className="chip bg-black/35">El: K-G {v.tricks[0]} · D-B {v.tricks[1]}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[order[1], order[2], order[3]].map((s) => <div key={s} className="flex justify-center"><Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`${SEAT_NAMES[s]}${s === v.dummySeat && v.dummy ? ' · yer' : ''} · ${v.handCounts[s]} kart`} /></div>)}
      </div>
      {v.dummy && v.dummySeat !== v.me && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs text-fildisi/70">Yer ({SEAT_NAMES[v.dummySeat!]}){dummyMine ? ' — sıra yerde, sen oynuyorsun' : ''}</p>
          <div className="flex max-w-full flex-wrap justify-center gap-0.5">
            {sortHand(v.dummy).map((card) => <PlayingCard key={card} card={card} size="sm" playable={dummyMine && playable.has(card)} dim={dummyMine && !playable.has(card)} onClick={() => onAction({ type: 'play', card })} />)}
          </div>
        </div>
      )}
      {v.phase === 'auction' ? (
        <div className="panel flex flex-col gap-2 p-3">
          <table className="w-full text-center text-sm" aria-label="İhale geçmişi">
            <thead><tr>{[0, 1, 2, 3].map((p) => <th key={p} className="font-semibold text-fildisi/70">{SEAT_NAMES[p]}</th>)}</tr></thead>
            <tbody>
              {(() => {
                const cells: (string | null)[] = [...Array(v.dealer).fill(null), ...v.calls.map((x) => callText(x.call))];
                const rows = [];
                for (let i = 0; i < cells.length; i += 4) rows.push(cells.slice(i, i + 4));
                return rows.map((r, i) => <tr key={i}>{[0, 1, 2, 3].map((k) => <td key={k}>{r[k] ?? ''}</td>)}</tr>);
              })()}
            </tbody>
          </table>
          {mine ? (
            <>
              <div className="grid grid-cols-5 gap-1" role="group" aria-label="İhale ver">
                {[1, 2, 3, 4, 5, 6, 7].flatMap((l) => STRAINS.map((st) => {
                  const call: Call = { type: 'bid', level: l, strain: st };
                  return can(call) ? <button key={l + st} className={`btn bg-fildisi px-1 py-1.5 text-sm ${red(st) ? 'text-cay' : 'text-ceviz'}`} onClick={() => onAction(call)}>{l}{STRAIN_LABEL[st]}</button> : <span key={l + st} />;
                }))}
              </div>
              <div className="flex justify-center gap-2">
                <button className="btn-ghost px-5" onClick={() => onAction({ type: 'pass' })}>Pas</button>
                {can({ type: 'double' }) && <button className="btn-red px-4" onClick={() => onAction({ type: 'double' })}>Kontr (X)</button>}
                {can({ type: 'redouble' }) && <button className="btn-red px-4" onClick={() => onAction({ type: 'redouble' })}>Sürkontr (XX)</button>}
              </div>
            </>
          ) : <p className="text-center text-sm">{names[v.turn]} ihale düşünüyor…</p>}
        </div>
      ) : (
        <div className="felt relative min-h-[13rem] flex-1 rounded-[2rem]">
          <AnimatePresence>
            {v.trick.map((t) => (
              <motion.div key={t.card} className={`absolute ${POS[rel(t.seat)]}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <PlayingCard card={t.card} size="md" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} ${v.phase === 'auction' ? 'ihale veriyor' : 'oynuyor'}…` : v.phase === 'auction' ? 'İhale ver' : dummyMine ? 'Yerden bir kart oyna' : 'Kart oyna'} />
      <div className="flex flex-col items-center gap-2">
        {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine && !dummyMine} sub={label(v.me)} />}
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {sortHand(v.hand).map((card) => {
            const ok = mine && !dummyMine && v.phase === 'play' && playable.has(card);
            return <PlayingCard key={card} card={card} size="md" playable={ok} dim={mine && !dummyMine && v.phase === 'play' && !ok} onClick={() => onAction({ type: 'play', card })} />;
          })}
        </div>
      </div>
      {v.lastBoard && <p className="text-center text-xs text-fildisi/60">Board {v.lastBoard.board}: {v.lastBoard.contract ? `${v.lastBoard.contract.level}${STRAIN_LABEL[v.lastBoard.contract.strain]} ${SEAT_NAMES[v.lastBoard.contract.declarer]} · ` : ''}{v.lastBoard.note} · K-G +{v.lastBoard.delta[0]}, D-B +{v.lastBoard.delta[1]}</p>}
    </div>
  );
}
