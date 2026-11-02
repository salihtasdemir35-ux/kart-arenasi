import { motion } from 'framer-motion';
import type { KizmaView } from '@kart/engine';
import { Die } from './TavlaBoard';
import { TurnHint, Who, relSeats, type TableProps } from './common';

export const KIZMA_COLORS = ['#B23A2E', '#D4A44C', '#2E7A5E', '#2F5D8A'];
export const KIZMA_NAMES = ['Kırmızı', 'Sarı', 'Yeşil', 'Mavi'];
// 11×11 tahta üzerinde 40 karelik pist (sütun, satır)
export const TRACK: [number, number][] = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5],
  [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10], [4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5],
];
export const HOME: [number, number][][] = [
  [[1, 5], [2, 5], [3, 5], [4, 5]], [[5, 1], [5, 2], [5, 3], [5, 4]], [[9, 5], [8, 5], [7, 5], [6, 5]], [[5, 9], [5, 8], [5, 7], [5, 6]],
];
export const BASE: [number, number][][] = [
  [[0, 0], [1, 0], [0, 1], [1, 1]], [[9, 0], [10, 0], [9, 1], [10, 1]], [[9, 9], [10, 9], [9, 10], [10, 10]], [[0, 9], [1, 9], [0, 10], [1, 10]],
];

export function KizmaBoard({ view: v, names, avatars, offline, onAction }: TableProps<KizmaView>) {
  const mine = v.me !== null && v.turn === v.me && v.phase !== 'over';
  const movable = new Set(v.legal.filter((a) => a.type === 'move').map((a: any) => a.token));
  const cell = (c: number, r: number) => ({ gridColumn: c + 1, gridRow: r + 1 });
  const posOf = (seat: number, t: number): [number, number] => {
    const col = v.colors[seat];
    const rel = v.tokens[seat][t];
    if (rel === -1) return BASE[col][t];
    if (rel >= 40) return HOME[col][rel - 40];
    return TRACK[(col * 10 + rel) % 40];
  };
  const order = relSeats(v.n, v.me);
  const colorOfSquare = (i: number) => { const c = [0, 1, 2, 3].find((k) => k * 10 === i); return c !== undefined ? KIZMA_COLORS[c] : null; };

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {order.slice(1).map((s) => (
          <Who key={s} seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && v.phase !== 'over'} sub={`${KIZMA_NAMES[v.colors[s]]} · evde ${v.tokens[s].filter((r) => r >= 40).length}/4`} />
        ))}
      </div>
      <div className="w-full max-w-[min(94vw,32rem)] rounded-2xl bg-fildisi-200 p-2 shadow-2xl ring-4 ring-pirinc-700">
        <div className="relative grid aspect-square grid-cols-11 grid-rows-11 gap-[2px]" role="grid" aria-label="Kızma Birader tahtası">
          {TRACK.map(([c, r], i) => (
            <span key={'t' + i} style={{ ...cell(c, r), background: colorOfSquare(i) ?? '#FAF5EA' }} className="rounded-full border border-ceviz/25" />
          ))}
          {HOME.map((h, col) => h.map(([c, r], k) => <span key={`h${col}${k}`} style={{ ...cell(c, r), background: KIZMA_COLORS[col], opacity: 0.55 }} className="rounded-full border border-ceviz/25" />))}
          {BASE.map((b, col) => b.map(([c, r], k) => <span key={`b${col}${k}`} style={{ ...cell(c, r), borderColor: KIZMA_COLORS[col] }} className="rounded-full border-[3px] bg-fildisi" />))}
          <span style={cell(5, 5)} className="flex items-center justify-center">
            {v.die ? <Die n={v.die} /> : null}
          </span>
          {v.tokens.map((ts, seat) => ts.map((_, t) => {
            const [c, r] = posOf(seat, t);
            const can = mine && seat === v.me && movable.has(t);
            return (
              <motion.button key={`${seat}-${t}`} layout transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                style={{ ...cell(c, r), background: KIZMA_COLORS[v.colors[seat]] }} disabled={!can}
                onClick={() => onAction({ type: 'move', token: t })} aria-label={`${KIZMA_NAMES[v.colors[seat]]} taş ${t + 1}`}
                className={`z-10 m-[12%] rounded-full border-2 border-ceviz shadow-[inset_0_-3px_0_rgba(0,0,0,.3)] ${can ? 'animate-pulse ring-4 ring-ceviz' : ''}`} />
            );
          }))}
        </div>
      </div>
      <div className="flex min-h-[2.75rem] items-center gap-2">
        {mine && v.phase === 'roll' && <button className="btn-brass px-6" onClick={() => onAction({ type: 'roll' })}>Zar at{v.tries > 0 ? ` (${v.tries + 1}. deneme)` : ''}</button>}
        {v.last && <span className="text-xs text-fildisi/70">{names[v.last.seat]} {v.last.die} attı{v.last.captured !== null ? `, ${names[v.last.captured]} taşını yedi!` : v.last.note ? `: ${v.last.note.toLowerCase()}` : ''}</span>}
      </div>
      <TurnHint mine={mine} text={v.phase === 'over' ? 'Oyun bitti' : mine ? (v.phase === 'roll' ? 'Zar at' : 'Oynatacağın taşa dokun') : `${names[v.turn]} oynuyor…`} />
      {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={`${KIZMA_NAMES[v.colors[v.me]]} · evde ${v.tokens[v.me].filter((r) => r >= 40).length}/4`} />}
    </div>
  );
}
