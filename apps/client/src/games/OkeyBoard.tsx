import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { OKEY_COLORS, isWild, tileColor, tileNum, valueOf, type OkeyView, type Okey } from '@kart/engine';
import { TurnHint, Who, relSeats, type TableProps } from './common';

const INK = ['#B8860B', '#2F5D8A', '#1A1A1A', '#B23A2E'];

export function OkeyTile({ id, okey, small, selected, onClick, dim }: { id: number; okey: Okey; small?: boolean; selected?: boolean; onClick?: () => void; dim?: boolean }) {
  const fake = id >= 104;
  const wild = isWild(id, okey);
  const c = tileColor(id);
  const Tag: any = onClick ? motion.button : motion.span;
  return (
    <Tag layout onClick={onClick} aria-label={fake ? 'Sahte okey' : `${OKEY_COLORS[c]} ${tileNum(id)}${wild ? ' okey' : ''}`}
      className={`relative flex shrink-0 flex-col items-center justify-center rounded-md bg-fildisi font-black shadow-[inset_0_-3px_0_#E3D6BA,0_2px_4px_rgba(0,0,0,.35)] ${small ? 'h-9 w-7 text-sm' : 'h-[min(13vw,3.4rem)] w-[min(9vw,2.5rem)] text-[min(5.5vw,1.4rem)]'} ${selected ? '-translate-y-2 ring-4 ring-pirinc' : ''} ${dim ? 'opacity-60' : ''}`}>
      {fake ? <span className="text-ceviz">★</span> : <span style={{ color: INK[c] }}>{tileNum(id)}</span>}
      {!fake && <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: INK[c] }} />}
      {wild && <span className="absolute -top-1.5 rounded bg-cuha px-1 text-[8px] font-bold text-fildisi">OKEY</span>}
    </Tag>
  );
}

export function OkeyBoard({ view: v, names, avatars, offline, onAction }: TableProps<OkeyView>) {
  const [order, setOrder] = useState<number[]>(v.hand);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    setOrder((o) => [...o.filter((t) => v.hand.includes(t)), ...v.hand.filter((t) => !o.includes(t))]);
    setSel((s) => (s !== null && v.hand.includes(s) ? s : null));
  }, [v.hand.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = v.me ?? 0;
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const prev = (me + 3) % 4;
  const prevTop = v.discards[prev][v.discards[prev].length - 1];
  const canFinish = sel !== null && v.legal.some((a) => a.type === 'finish' && a.tile === sel);
  const canShow = v.legal.some((a) => a.type === 'show');
  const click = (t: number) => {
    if (sel === null) { setSel(t); return; }
    if (sel === t) { setSel(null); return; }
    // Seçili taşı dokunulan taşın yerine taşı
    const o = order.filter((x) => x !== sel);
    o.splice(o.indexOf(t), 0, sel);
    setOrder(o);
    setSel(null);
  };
  const sortBy = (mode: 'renk' | 'sayi') => {
    const key = (t: number) => { const val = valueOf(t, v.okey); if (!val) return 999; return mode === 'renk' ? val[0] * 20 + val[1] : val[1] * 5 + val[0]; };
    setOrder([...order].sort((a, b) => key(a) - key(b)));
  };
  const others = relSeats(4, v.me).slice(1);
  const rows = [order.slice(0, Math.ceil(order.length / 2)), order.slice(Math.ceil(order.length / 2))];

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="grid w-full grid-cols-3 gap-2">
        {others.map((s) => {
          const top = v.discards[s][v.discards[s].length - 1];
          return (
            <div key={s} className="flex flex-col items-center gap-1">
              <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`${v.scores[s]} puan`} />
              <div className="flex min-h-[2.25rem] items-center gap-1 text-[10px] text-fildisi/60">attığı: {top !== undefined ? <OkeyTile id={top} okey={v.okey} small /> : '—'}</div>
            </div>
          );
        })}
      </div>

      <div className="felt flex w-full max-w-[40rem] flex-wrap items-center justify-center gap-4 rounded-[2rem] p-4">
        <div className="flex flex-col items-center gap-1 text-xs"><span>Gösterge</span><OkeyTile id={v.indicator} okey={v.okey} /></div>
        <button disabled={!(mine && v.phase === 'draw')} onClick={() => onAction({ type: 'draw', from: 'pile' })}
          className={`flex h-[min(13vw,3.4rem)] w-[min(14vw,3.6rem)] flex-col items-center justify-center rounded-md bg-[#8E2A21] text-xs font-bold text-fildisi shadow-lg ${mine && v.phase === 'draw' ? 'ring-4 ring-pirinc' : 'opacity-80'}`}>
          Ortadan<span className="text-base">{v.pileCount}</span>
        </button>
        <div className="flex flex-col items-center gap-1 text-xs">
          <span>Yandan ({names[prev]})</span>
          {prevTop !== undefined
            ? <OkeyTile id={prevTop} okey={v.okey} onClick={mine && v.phase === 'draw' ? () => onAction({ type: 'draw', from: 'discard' }) : undefined} selected={mine && v.phase === 'draw'} />
            : <span className="h-[min(13vw,3.4rem)] w-[min(9vw,2.5rem)] rounded-md border border-dashed border-white/25" />}
        </div>
        <div className="flex flex-col items-center gap-1 text-xs">
          <span>Senin attığın</span>
          {v.discards[me].length ? <OkeyTile id={v.discards[me][v.discards[me].length - 1]} okey={v.okey} /> : <span className="h-[min(13vw,3.4rem)] w-[min(9vw,2.5rem)] rounded-md border border-dashed border-white/25" />}
        </div>
      </div>

      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : v.phase === 'draw' ? 'Ortadan çek ya da yandan al' : sel === null ? 'Atacağın taşı seç (taşları dizmek için iki taşa sırayla dokun)' : canFinish ? 'Bu taşla bitirebilirsin!' : 'Seçili taşı at ya da yerini değiştirmek için başka taşa dokun'} />

      <div className="w-full max-w-[44rem] rounded-xl bg-[#6B4430] p-2 shadow-xl ring-2 ring-pirinc-700" aria-label="Istakan">
        {rows.map((r, k) => (
          <div key={k} className={`flex min-h-[3.6rem] flex-wrap justify-center gap-1 ${k ? 'mt-1.5 border-t border-black/20 pt-1.5' : ''}`}>
            {r.map((t) => <OkeyTile key={t} id={t} okey={v.okey} selected={sel === t} onClick={() => click(t)} />)}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        <button className="btn-ghost px-3 text-sm" onClick={() => sortBy('renk')}>Renge göre diz</button>
        <button className="btn-ghost px-3 text-sm" onClick={() => sortBy('sayi')}>Sayıya göre diz</button>
        {mine && v.phase === 'discard' && (
          <>
            <button className="btn-brass px-4" disabled={sel === null} onClick={() => sel !== null && onAction({ type: 'discard', tile: sel })}>At</button>
            <button className="btn-red px-4" disabled={!canFinish} onClick={() => sel !== null && onAction({ type: 'finish', tile: sel })}>Bitir</button>
            {canShow && <button className="btn-ghost px-3" onClick={() => onAction({ type: 'show' })}>Göstergeyi göster</button>}
          </>
        )}
      </div>
      <Who seat={me} names={names} avatars={avatars} active={mine} sub={`${v.scores[me]} puan · ${v.handNo}/${v.totalHands}. el`} />
      {v.lastHand && <p className="text-center text-xs text-fildisi/70">Son el: {v.lastHand.winner !== null ? `${names[v.lastHand.winner]} — ${v.lastHand.kind} (diğerlerine −${v.lastHand.points})` : v.lastHand.kind}</p>}
    </div>
  );
}
