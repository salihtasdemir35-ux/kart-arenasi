import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GROUP_COLORS, GROUP_NAMES, MONO_BOARD as BOARD, unmortgageCost, type MonoAction, type MonoView, type TradeOffer } from '@kart/engine';
import { Die } from './TavlaBoard';
import { Modal } from '../components/ui';
import { TurnHint, type TableProps } from './common';

export const MONO_COLORS = ['#B23A2E', '#2F5D8A', '#2E8B57', '#D4A44C', '#7A4E9C', '#E07A6E'];

/** Kare → 11×11 ızgara konumu (satır, sütun); Başlangıç sağ alt köşe. */
function gridPos(i: number): [number, number] {
  if (i <= 10) return [10, 10 - i];
  if (i <= 20) return [10 - (i - 10), 0];
  if (i <= 30) return [0, i - 20];
  return [i - 30, 10];
}
const KIND_ICON: Record<string, string> = { baslangic: '➜', sans: '?', fon: '♦', vergi: '₺', hapis: '▦', otopark: 'P', 'hapse-gir': '⚑', gar: '🚆', idare: '⚡' };

export function MonopoliBoard({ view: v, names, onAction }: TableProps<MonoView>) {
  const me = v.me ?? 0;
  const [info, setInfo] = useState<number | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [bidExtra, setBidExtra] = useState(0);
  const legal = (t: MonoAction['type']) => v.legal.find((a) => a.type === t);
  const sqAct = (t: MonoAction['type'], sq: number) => v.legal.some((a) => a.type === t && (a as any).sq === sq);
  const mine = v.me !== null && v.legal.length > 0;
  const cur = v.players[v.turn];
  const here = BOARD[cur.pos];
  const myProps = BOARD.map((b, q) => ({ b, q })).filter((x) => v.owner[x.q] === me);

  const tokens = useMemo(() => {
    const m = new Map<number, number[]>();
    v.players.forEach((p, i) => { if (!p.bankrupt) m.set(p.pos, [...(m.get(p.pos) ?? []), i]); });
    return m;
  }, [v.players]);

  const action = (() => {
    if (!mine) {
      if (v.phase === 'over') return <p>Oyun bitti</p>;
      if (v.phase === 'trade') return <p className="text-sm">{names[v.trade!.to]} takas teklifini değerlendiriyor…</p>;
      if (v.phase === 'auction') return <p className="text-sm">{BOARD[v.auction!.square].name} müzayedede: {v.auction!.bid} TL ({v.auction!.bidder !== null ? names[v.auction!.bidder] : 'teklif yok'})</p>;
      if (v.phase === 'debt') return <p className="text-sm">{names[v.debts[0].seat]} borcunu ödemeye çalışıyor…</p>;
      return <p className="text-sm">{names[v.turn]} oynuyor…</p>;
    }
    switch (v.phase) {
      case 'roll': return (
        <div className="flex flex-wrap justify-center gap-1.5">
          <button className="btn-brass px-6" onClick={() => onAction({ type: 'roll' })}>{cur.jail ? 'Çift için zar at' : 'Zar at'}</button>
          {legal('payJail') && <button className="btn-ghost" onClick={() => onAction({ type: 'payJail' })}>50 TL öde, çık</button>}
          {legal('useJailCard') && <button className="btn-ghost" onClick={() => onAction({ type: 'useJailCard' })}>Çıkış kartını kullan</button>}
        </div>
      );
      case 'buy': return (
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm"><b>{here.name}</b> sahipsiz · {here.price} TL</p>
          <div className="flex gap-1.5">
            <button className="btn-brass" disabled={!legal('buy')} onClick={() => onAction({ type: 'buy' })}>Satın al</button>
            <button className="btn-ghost" onClick={() => onAction({ type: 'decline' })}>Müzayedeye bırak</button>
          </div>
        </div>
      );
      case 'auction': {
        const au = v.auction!;
        const bid = legal('bid') as { amount: number } | undefined;
        return (
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm">Müzayede: <b>{BOARD[au.square].name}</b> · en yüksek {au.bid} TL {au.bidder !== null ? `(${names[au.bidder]})` : ''}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {bid && [0, 40, 90].map((x) => bid.amount + x <= v.players[me].cash && (
                <button key={x} className="btn-brass px-3" onClick={() => onAction({ type: 'bid', amount: bid.amount + x + bidExtra })}>{bid.amount + x + bidExtra} TL</button>
              ))}
              <button className="btn-ghost" onClick={() => { setBidExtra(0); onAction({ type: 'passBid' }); }}>Pas</button>
            </div>
          </div>
        );
      }
      case 'manage': return (
        <div className="flex flex-wrap justify-center gap-1.5">
          <button className="btn-brass px-6" onClick={() => onAction({ type: 'endTurn' })}>Turu bitir</button>
          <button className="btn-ghost" onClick={() => setTradeOpen(true)}>Takas teklif et</button>
        </div>
      );
      case 'debt': return (
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm text-cay-300">Borç: {v.debts[0].amount} TL → {v.debts[0].to === null ? 'banka' : names[v.debts[0].to]}. Ev sat ya da ipotek et.</p>
          <div className="flex gap-1.5">
            <button className="btn-brass" disabled={!legal('payDebt')} onClick={() => onAction({ type: 'payDebt' })}>Borcu öde</button>
            <button className="btn-red" onClick={() => onAction({ type: 'bankrupt' })}>İflas et</button>
          </div>
        </div>
      );
      case 'trade': {
        const t = v.trade!;
        return (
          <div className="flex flex-col items-center gap-1.5 text-sm">
            <p><b>{names[t.from]}</b> teklif ediyor:</p>
            <p>Sana: {[...t.give.props.map((q) => BOARD[q].name), t.give.cash ? `${t.give.cash} TL` : ''].filter(Boolean).join(', ') || '—'}</p>
            <p>Senden: {[...t.get.props.map((q) => BOARD[q].name), t.get.cash ? `${t.get.cash} TL` : ''].filter(Boolean).join(', ') || '—'}</p>
            <div className="flex gap-1.5"><button className="btn-brass" onClick={() => onAction({ type: 'acceptTrade' })}>Kabul et</button><button className="btn-ghost" onClick={() => onAction({ type: 'rejectTrade' })}>Reddet</button></div>
          </div>
        );
      }
    }
    return null;
  })();

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="relative w-full max-w-[min(96vw,40rem)]">
        <div className="grid aspect-square grid-cols-11 grid-rows-11 gap-[1px] rounded-lg bg-[#1E3B2F] p-[2px] shadow-2xl ring-4 ring-pirinc-700" role="grid" aria-label="Monopoli tahtası">
          {BOARD.map((b, i) => {
            const [r, c] = gridPos(i);
            const o = v.owner[i];
            const h = v.houses[i];
            const toks = tokens.get(i) ?? [];
            return (
              <button key={i} onClick={() => setInfo(i)} style={{ gridRow: r + 1, gridColumn: c + 1, boxShadow: o !== null ? `inset 0 0 0 2px ${MONO_COLORS[o]}` : undefined }}
                aria-label={`${b.name}${o !== null ? ', sahibi ' + names[o] : ''}`}
                className={`relative flex flex-col items-center overflow-hidden rounded-[2px] bg-[#EFE6D2] text-ceviz ${v.mortgaged[i] ? 'opacity-50' : ''}`}>
                {b.group !== undefined && b.group < 8 && <span className="h-[22%] w-full" style={{ background: GROUP_COLORS[b.group] }} />}
                {b.kind !== 'mulk' && <span className="mt-[8%] text-[min(2.6vw,0.85rem)] leading-none">{KIND_ICON[b.kind]}</span>}
                <span lang="tr" className="px-[1px] text-center text-[min(1.45vw,0.5rem)] font-bold leading-[1.05] hyphens-auto [overflow-wrap:anywhere]">{b.name}</span>
                {h > 0 && <span className="absolute bottom-[2px] left-0 right-0 flex justify-center gap-[1px]">{h === 5 ? <span className="h-1.5 w-3 rounded-sm bg-cay" /> : Array.from({ length: h }).map((_, k) => <span key={k} className="h-1.5 w-1.5 rounded-sm bg-cuha" />)}</span>}
                {toks.length > 0 && (
                  <span className="absolute inset-x-0 bottom-[22%] flex flex-wrap justify-center gap-[1px]">
                    {toks.map((p) => <motion.span layoutId={`tok-${p}`} key={p} className="h-[min(2.2vw,0.7rem)] w-[min(2.2vw,0.7rem)] rounded-full border border-white" style={{ background: MONO_COLORS[p] }} />)}
                  </span>
                )}
              </button>
            );
          })}
          <div className="col-start-2 col-end-11 row-start-2 row-end-11 flex flex-col items-center justify-center gap-2 p-2 text-center text-fildisi">
            <p className="text-[min(4vw,1.3rem)] font-black tracking-tight text-pirinc-300">KART ARENASI</p>
            {v.dice && <div className="flex gap-2">{v.dice.map((d, k) => <Die key={k} n={d} />)}</div>}
            {v.lastCard && <p className="max-w-[90%] rounded-lg bg-fildisi/90 px-2 py-1 text-[min(2.8vw,0.8rem)] text-ceviz"><b>{v.lastCard.deck}:</b> {v.lastCard.text}</p>}
            <div className="text-[min(3vw,0.85rem)]">{action}</div>
          </div>
        </div>
      </div>

      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : `Sıra: ${names[v.turn]} · ${v.round}. tur${v.maxRounds ? ` / ${v.maxRounds}` : ''}`} />

      <ul className="grid w-full max-w-[40rem] grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
        {v.players.map((p, i) => (
          <li key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${i === v.turn ? 'bg-pirinc/25 ring-1 ring-pirinc' : 'bg-black/25'} ${p.bankrupt ? 'opacity-40 line-through' : ''}`}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: MONO_COLORS[i] }} />
            <span className="min-w-0 flex-1 truncate">{names[i]}{p.jail ? ' (hapiste)' : ''}</span>
            <span className="font-bold">{p.cash} TL</span>
          </li>
        ))}
      </ul>

      {v.me !== null && myProps.length > 0 && (
        <details className="w-full max-w-[40rem] rounded-xl bg-black/20 p-2 text-sm" open>
          <summary className="cursor-pointer font-semibold">Mülklerim ({myProps.length}) · servet {v.worth[me]} TL</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {myProps.map(({ b, q }) => (
              <li key={q} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: GROUP_COLORS[b.group!] }} />
                <span className="min-w-0 flex-1 truncate">{b.name}{v.houses[q] ? ` · ${v.houses[q] === 5 ? 'otel' : v.houses[q] + ' ev'}` : ''}{v.mortgaged[q] ? ' · ipotekli' : ''}</span>
                {sqAct('build', q) && <button className="btn-brass px-2 py-1 text-xs" onClick={() => onAction({ type: 'build', sq: q })}>Ev kur ({b.house})</button>}
                {sqAct('sellHouse', q) && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onAction({ type: 'sellHouse', sq: q })}>Ev sat</button>}
                {sqAct('mortgage', q) && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onAction({ type: 'mortgage', sq: q })}>İpotek (+{b.price! / 2})</button>}
                {sqAct('unmortgage', q) && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onAction({ type: 'unmortgage', sq: q })}>İpoteği kaldır ({unmortgageCost(q)})</button>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={info !== null} onClose={() => setInfo(null)} title={info !== null ? BOARD[info].name : ''}>
        {info !== null && (() => {
          const b = BOARD[info];
          return (
            <div className="flex flex-col gap-1 text-sm">
              {b.group !== undefined && <p>{GROUP_NAMES[b.group]} · {b.price} TL{v.owner[info] !== null ? ` · sahibi ${names[v.owner[info]!]}` : ' · sahipsiz'}</p>}
              {b.rents && <ul className="grid grid-cols-2 gap-1">{['Arsa', '1 ev', '2 ev', '3 ev', '4 ev', 'Otel'].map((l, k) => <li key={l} className="rounded bg-black/20 px-2 py-1">{l}: {b.rents![k]} TL</li>)}</ul>}
              {b.house && <p>Ev/otel: {b.house} TL · İpotek: {b.price! / 2} TL</p>}
              {b.kind === 'gar' && <p>Kira: 1 gar 25, 2 gar 50, 3 gar 100, 4 gar 200 TL</p>}
              {b.kind === 'idare' && <p>Kira: zarın 4 katı; iki idare birdeyse 10 katı</p>}
              {b.tax && <p>Vergi: {b.tax} TL</p>}
            </div>
          );
        })()}
      </Modal>

      {tradeOpen && <TradeModal v={v} names={names} onClose={() => setTradeOpen(false)} onSend={(offer) => { onAction({ type: 'propose', offer }); setTradeOpen(false); }} />}
    </div>
  );
}

function TradeModal({ v, names, onClose, onSend }: { v: MonoView; names: string[]; onClose: () => void; onSend: (o: TradeOffer) => void }) {
  const me = v.me ?? 0;
  const others = v.players.map((p, i) => i).filter((i) => i !== me && !v.players[i].bankrupt);
  const [to, setTo] = useState(others[0]);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const tradable = (owner: number) => BOARD.map((_, q) => q).filter((q) => v.owner[q] === owner && !BOARD.some((x, k) => x.group === BOARD[q].group && v.houses[k] > 0));
  const toggle = (arr: number[], set: (x: number[]) => void, q: number) => set(arr.includes(q) ? arr.filter((x) => x !== q) : [...arr, q]);
  const List = ({ owner, sel, setSel }: { owner: number; sel: number[]; setSel: (x: number[]) => void }) => (
    <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
      {tradable(owner).map((q) => (
        <li key={q}><label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-pirinc" checked={sel.includes(q)} onChange={() => toggle(sel, setSel, q)} />
          <span className="h-3 w-3 rounded-sm" style={{ background: GROUP_COLORS[BOARD[q].group!] }} />{BOARD[q].name}{v.mortgaged[q] ? ' (ipotekli)' : ''}</label></li>
      ))}
      {!tradable(owner).length && <li className="text-fildisi/50">Takas edilebilir mülk yok</li>}
    </ul>
  );
  return (
    <Modal open onClose={onClose} title="Takas teklifi">
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex items-center gap-2">Kime:
          <select className="field" value={to} onChange={(e) => { setTo(Number(e.target.value)); setGet([]); }}>{others.map((o) => <option key={o} value={o}>{names[o]}</option>)}</select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="mb-1 font-semibold">Verdiğin</p><List owner={me} sel={give} setSel={setGive} />
            <input className="field mt-1" type="number" min={0} max={v.players[me].cash} step={10} value={giveCash} onChange={(e) => setGiveCash(Math.max(0, Number(e.target.value) | 0))} aria-label="Verdiğin para" /></div>
          <div><p className="mb-1 font-semibold">İstediğin</p><List owner={to} sel={get} setSel={setGet} />
            <input className="field mt-1" type="number" min={0} step={10} value={getCash} onChange={(e) => setGetCash(Math.max(0, Number(e.target.value) | 0))} aria-label="İstediğin para" /></div>
        </div>
        <button className="btn-brass" disabled={!give.length && !get.length} onClick={() => onSend({ from: me, to, give: { cash: giveCash, props: give }, get: { cash: getCash, props: get } })}>Teklifi gönder</button>
        <p className="text-xs text-fildisi/60">Bir turda en fazla 3 teklif verebilirsin. Evli gruptaki mülkler takas edilemez.</p>
      </div>
    </Modal>
  );
}
