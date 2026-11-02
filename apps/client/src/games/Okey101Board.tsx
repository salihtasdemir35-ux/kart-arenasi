import { useEffect, useMemo, useState } from 'react';
import { bestMelds, findPairs, meldInfo, valueOf, type O101View } from '@kart/engine';
import { OkeyTile } from './OkeyBoard';
import { TurnHint, Who, relSeats, type TableProps } from './common';

export function Okey101Board({ view: v, names, avatars, offline, onAction }: TableProps<O101View>) {
  const [order, setOrder] = useState<number[]>(v.hand);
  const [sel, setSel] = useState<number | null>(null);
  const [staging, setStaging] = useState<number[][] | null>(null);
  const [current, setCurrent] = useState<number[]>([]);
  useEffect(() => {
    setOrder((o) => [...o.filter((t) => v.hand.includes(t)), ...v.hand.filter((t) => !o.includes(t))]);
    setSel(null);
    setStaging((st) => (st ? st.filter((g) => g.every((t) => v.hand.includes(t))) : st));
  }, [v.hand.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = v.me ?? 0;
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const playing = mine && v.phase === 'play';
  const prev = (me + 3) % 4;
  const prevTop = v.discards[prev].slice(-1)[0];
  const staged = new Set([...(staging ?? []).flat(), ...current]);
  const total = useMemo(() => (staging ?? []).reduce((t, g) => t + (meldInfo(g, v.okey)?.points ?? 0), 0), [staging, v.okey]);
  const pairMode = (staging ?? []).length > 0 && staging!.every((g) => g.length === 2);
  const mustUse = v.taken !== null && v.hand.includes(v.taken);

  const click = (t: number) => {
    if (staging) { if (staged.has(t) && !current.includes(t)) return; setCurrent((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t])); return; }
    if (sel === null || sel === t) { setSel(sel === t ? null : t); return; }
    const o = order.filter((x) => x !== sel); o.splice(o.indexOf(t), 0, sel); setOrder(o); setSel(null);
  };
  const sortBy = (mode: 'renk' | 'sayi') => {
    const key = (t: number) => { const val = valueOf(t, v.okey); if (!val) return 999; return mode === 'renk' ? val[0] * 20 + val[1] : val[1] * 5 + val[0]; };
    setOrder([...order].sort((a, b) => key(a) - key(b)));
  };
  const curInfo = current.length >= 3 ? meldInfo(current, v.okey) : null;
  const curPair = current.length === 2 && findPairs(current, v.okey).length === 1;
  const canOpen = staging && staging.length > 0 && (v.opened[me] ? true : pairMode ? staging.length >= 5 : total >= 101);
  const others = relSeats(4, v.me).slice(1);
  const byOwner = [0, 1, 2, 3].map((p) => v.melds.map((m, i) => ({ m, i })).filter((x) => x.m.owner === p));

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="grid w-full grid-cols-3 gap-2">
        {others.map((s) => (
          <div key={s} className="flex flex-col items-center gap-1">
            <Who seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`ceza ${v.scores[s]} · ${v.handCounts[s]} taş${v.opened[s] ? ' · açtı' : ''}`} />
            <div className="flex min-h-[2.25rem] items-center gap-1 text-[10px] text-fildisi/60">attığı: {v.discards[s].length ? <OkeyTile id={v.discards[s].slice(-1)[0]} okey={v.okey} small /> : '—'}</div>
          </div>
        ))}
      </div>

      <div className="felt flex w-full max-w-[44rem] flex-col gap-2 rounded-[1.5rem] p-3">
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
          <span className="flex items-center gap-1">Gösterge <OkeyTile id={v.indicator} okey={v.okey} small /></span>
          <button disabled={!(mine && v.phase === 'draw')} onClick={() => onAction({ type: 'draw', from: 'pile' })} className={`rounded-md bg-[#8E2A21] px-3 py-2 font-bold text-fildisi ${mine && v.phase === 'draw' ? 'ring-4 ring-pirinc' : 'opacity-80'}`}>Ortadan ({v.pileCount})</button>
          <span className="flex items-center gap-1">Yandan
            {prevTop !== undefined ? <OkeyTile id={prevTop} okey={v.okey} small onClick={mine && v.phase === 'draw' ? () => onAction({ type: 'draw', from: 'discard' }) : undefined} selected={mine && v.phase === 'draw'} /> : '—'}
          </span>
        </div>
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" aria-label="Masadaki perler">
          {byOwner.map((list, p) => list.length ? (
            <div key={p} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 truncate text-[11px] text-fildisi/70">{names[p]}</span>
              {list.map(({ m, i }) => (
                <button key={i} disabled={!(playing && sel !== null && v.opened[me])} onClick={() => sel !== null && onAction({ type: 'process', tile: sel, meld: i })}
                  aria-label={`${names[p]} peri ${i + 1}`} className={`flex gap-0.5 rounded-md bg-black/20 p-1 ${playing && sel !== null && v.opened[me] && m.kind !== 'cift' && meldInfo([...m.tiles, sel], v.okey) ? 'ring-2 ring-pirinc' : ''}`}>
                  {m.tiles.map((t) => <OkeyTile key={t} id={t} okey={v.okey} small />)}
                </button>
              ))}
            </div>
          ) : null)}
          {!v.melds.length && <p className="text-center text-xs text-fildisi/60">Henüz kimse açmadı</p>}
        </div>
      </div>

      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : v.phase === 'draw' ? 'Ortadan çek ya da yandan al' : mustUse ? 'Yandan aldığın taşı açmada veya işlemede kullanmalısın' : staging ? 'Per için taşlara dokun, sonra "Grubu ekle"' : 'Taş seç: at, masadaki pere işle ya da "Per kur"'} />

      {staging && (
        <div className="panel flex w-full max-w-[44rem] flex-col gap-2 p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {staging.map((g, k) => (
              <button key={k} className="flex gap-0.5 rounded bg-black/25 p-1" onClick={() => setStaging(staging.filter((_, j) => j !== k))} aria-label="Grubu çıkar">
                {g.map((t) => <OkeyTile key={t} id={t} okey={v.okey} small />)}
              </button>
            ))}
            <span className="text-fildisi/80">{pairMode ? `${staging.length} çift` : `Toplam ${total}`}{!v.opened[me] && !pairMode ? ' / 101' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn-ghost px-3 py-1.5 text-sm" disabled={!(curInfo || curPair)} onClick={() => { setStaging([...staging, current]); setCurrent([]); }}>
              Grubu ekle{curInfo ? ` (${curInfo.points})` : curPair ? ' (çift)' : ''}
            </button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { const b = bestMelds(v.hand, v.okey); setStaging(b.melds); setCurrent([]); }}>Öneri: en iyi per</button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { setStaging(findPairs(v.hand, v.okey)); setCurrent([]); }}>Öneri: çiftler</button>
            <button className="btn-brass px-4 py-1.5 text-sm" disabled={!canOpen} onClick={() => onAction({ type: 'open', melds: staging })}>{v.opened[me] ? 'Masaya koy' : 'El aç'}</button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { setStaging(null); setCurrent([]); }}>Vazgeç</button>
          </div>
        </div>
      )}

      <div className="w-full max-w-[44rem] rounded-xl bg-[#6B4430] p-2 shadow-xl ring-2 ring-pirinc-700" aria-label="Istakan">
        <div className="flex flex-wrap justify-center gap-1">
          {order.map((t) => (
            <OkeyTile key={t} id={t} okey={v.okey} selected={staging ? current.includes(t) : sel === t} dim={!!staging && staged.has(t) && !current.includes(t)} onClick={() => click(t)} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        <button className="btn-ghost px-3 text-sm" onClick={() => sortBy('renk')}>Renge göre</button>
        <button className="btn-ghost px-3 text-sm" onClick={() => sortBy('sayi')}>Sayıya göre</button>
        {playing && !staging && (
          <>
            <button className="btn-ghost px-3" onClick={() => { setStaging([]); setSel(null); }}>{v.opened[me] ? 'Per ekle' : 'Per kur'}</button>
            {mustUse && <button className="btn-ghost px-3" onClick={() => onAction({ type: 'undoTake' })}>Aldığımı geri bırak</button>}
            <button className="btn-brass px-4" disabled={sel === null || mustUse} onClick={() => sel !== null && onAction({ type: 'discard', tile: sel })}>At</button>
          </>
        )}
      </div>
      <Who seat={me} names={names} avatars={avatars} active={mine} sub={`ceza ${v.scores[me]} · ${v.handNo}/${v.totalHands}. el${v.opened[me] ? ' · açtın' : ''}`} />
      {v.lastHand && <p className="text-center text-xs text-fildisi/70">Son el: {v.lastHand.note} · {v.lastHand.deltas.map((d, p) => `${names[p]} ${d > 0 ? '+' : ''}${d}`).join(' · ')}</p>}
    </div>
  );
}
