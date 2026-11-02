import { useEffect, useMemo, useState } from 'react';
import { best51, cardCode, cardRank, cardSuit, isJoker, meld51, type E51View } from '@kart/engine';
import { PlayingCard } from '../components/Card';
import { TurnHint, Who, relSeats, type TableProps } from './common';

function Card51({ id, small, selected, dim, onClick }: { id: number; small?: boolean; selected?: boolean; dim?: boolean; onClick?: () => void }) {
  if (isJoker(id)) {
    return (
      <button onClick={onClick} disabled={!onClick} aria-label="Joker"
        className={`flex shrink-0 items-center justify-center rounded-lg bg-fildisi font-black text-cuha shadow ring-1 ring-black/10 ${small ? 'h-[3.15rem] w-9 text-[10px]' : 'h-20 w-14 text-xs'} ${selected ? '-translate-y-2 ring-4 ring-pirinc' : ''} ${dim ? 'opacity-40' : ''}`}>
        ★<br />JOKER
      </button>
    );
  }
  return <PlayingCard card={cardCode(id)} size={small ? 'sm' : 'md'} onClick={onClick} playable={!!onClick} dim={dim} className={selected ? '-translate-y-2 !ring-4' : ''} />;
}

export function Elli1Board({ view: v, names, avatars, offline, onAction }: TableProps<E51View>) {
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
  const top = v.discard[v.discard.length - 1];
  const staged = new Set([...(staging ?? []).flat(), ...current]);
  const total = useMemo(() => (staging ?? []).reduce((t, g) => t + (meld51(g)?.points ?? 0), 0), [staging]);
  const mustUse = v.taken !== null && v.hand.includes(v.taken);
  const curInfo = meld51(current);
  const canOpen = !!staging && staging.length > 0 && (v.opened[me] || total >= 51);
  const click = (c: number) => {
    if (staging) { if (staged.has(c) && !current.includes(c)) return; setCurrent((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c])); return; }
    if (sel === null || sel === c) { setSel(sel === c ? null : c); return; }
    const o = order.filter((x) => x !== sel); o.splice(o.indexOf(c), 0, sel); setOrder(o); setSel(null);
  };
  const sortBy = (m: 'takim' | 'deger') => {
    const k = (c: number) => (isJoker(c) ? 999 : m === 'takim' ? cardSuit(c) * 20 + cardRank(c) : cardRank(c) * 5 + cardSuit(c));
    setOrder([...order].sort((a, b) => k(a) - k(b)));
  };
  const others = relSeats(v.n, v.me).slice(1);

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {others.map((s) => <Who key={s} seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`ceza ${v.scores[s]} · ${v.handCounts[s]} kart${v.opened[s] ? ' · açtı' : ''}`} />)}
      </div>
      <div className="felt flex w-full max-w-[44rem] flex-col gap-2 rounded-[1.5rem] p-3">
        <div className="flex items-center justify-center gap-4 text-xs">
          <button disabled={!(mine && v.phase === 'draw')} onClick={() => onAction({ type: 'draw', from: 'pile' })} className={`rounded-md bg-[#8E2A21] px-3 py-3 font-bold text-fildisi ${mine && v.phase === 'draw' ? 'ring-4 ring-pirinc' : 'opacity-80'}`}>Desteden ({v.pileCount})</button>
          <span className="flex items-center gap-2">Yerde {top !== undefined ? <Card51 id={top} small selected={mine && v.phase === 'draw'} onClick={mine && v.phase === 'draw' ? () => onAction({ type: 'draw', from: 'discard' }) : undefined} /> : '—'}</span>
        </div>
        <div className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto" aria-label="Masadaki perler">
          {v.melds.map((m, i) => (
            <button key={i} disabled={!(playing && sel !== null && v.opened[me])} onClick={() => sel !== null && onAction({ type: 'process', card: sel, meld: i })} aria-label={`${names[m.owner]} peri ${i + 1}`}
              className={`flex rounded-md bg-black/20 p-1 ${playing && sel !== null && v.opened[me] && meld51([...m.cards, sel]) ? 'ring-2 ring-pirinc' : ''}`}>
              {m.cards.map((c, k) => <span key={c} className={k ? '-ml-5' : ''}><Card51 id={c} small /></span>)}
            </button>
          ))}
          {!v.melds.length && <p className="w-full text-center text-xs text-fildisi/60">Henüz kimse açmadı</p>}
        </div>
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : !mine ? `${names[v.turn]} oynuyor…` : v.phase === 'draw' ? 'Desteden çek ya da yerdeki kartı al' : mustUse ? 'Yerden aldığın kartı açmada veya işlemede kullanmalısın' : staging ? 'Per için kartlara dokun, sonra "Grubu ekle"' : 'Kart seç: at, pere işle ya da "Per kur"'} />
      {staging && (
        <div className="panel flex w-full max-w-[44rem] flex-col gap-2 p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {staging.map((g, k) => (
              <button key={k} className="flex rounded bg-black/25 p-1" onClick={() => setStaging(staging.filter((_, j) => j !== k))} aria-label="Grubu çıkar">
                {g.map((c, j) => <span key={c} className={j ? '-ml-5' : ''}><Card51 id={c} small /></span>)}
              </button>
            ))}
            <span>Toplam {total}{!v.opened[me] ? ' / 51' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn-ghost px-3 py-1.5 text-sm" disabled={!curInfo} onClick={() => { setStaging([...staging, current]); setCurrent([]); }}>Grubu ekle{curInfo ? ` (${curInfo.points})` : ''}</button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { setStaging(best51(v.hand).melds); setCurrent([]); }}>Öneri: en iyi per</button>
            <button className="btn-brass px-4 py-1.5 text-sm" disabled={!canOpen} onClick={() => onAction({ type: 'open', melds: staging })}>{v.opened[me] ? 'Masaya koy' : 'El aç'}</button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { setStaging(null); setCurrent([]); }}>Vazgeç</button>
          </div>
        </div>
      )}
      <div className="flex max-w-full flex-wrap justify-center gap-1" aria-label="Elin">
        {order.map((c) => <Card51 key={c} id={c} selected={staging ? current.includes(c) : sel === c} dim={!!staging && staged.has(c) && !current.includes(c)} onClick={() => click(c)} />)}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        <button className="btn-ghost px-3 text-sm" onClick={() => sortBy('takim')}>Takıma göre</button>
        <button className="btn-ghost px-3 text-sm" onClick={() => sortBy('deger')}>Değere göre</button>
        {playing && !staging && (
          <>
            <button className="btn-ghost px-3" onClick={() => { setStaging([]); setSel(null); }}>{v.opened[me] ? 'Per ekle' : 'Per kur'}</button>
            {mustUse && <button className="btn-ghost px-3" onClick={() => onAction({ type: 'undoTake' })}>Aldığımı geri bırak</button>}
            <button className="btn-brass px-4" disabled={sel === null || mustUse} onClick={() => sel !== null && onAction({ type: 'discard', card: sel })}>At</button>
          </>
        )}
      </div>
      <Who seat={me} names={names} avatars={avatars} active={mine} sub={`ceza ${v.scores[me]} · ${v.handNo}/${v.totalHands}. el${v.opened[me] ? ' · açtın' : ''}`} />
      {v.lastHand && <p className="text-center text-xs text-fildisi/70">Son el: {v.lastHand.note} · {v.lastHand.deltas.map((d, p) => `${names[p]} ${d > 0 ? '+' : ''}${d}`).join(' · ')}</p>}
    </div>
  );
}
