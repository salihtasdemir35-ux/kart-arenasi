import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BOARD, type CinView } from '@kart/engine';
import { TurnHint, Who, relSeats, type TableProps } from './common';

export const CIN_COLORS = ['#B23A2E', '#2F5D8A', '#D4A44C', '#2E7A5E', '#7A4E9C', '#2B1A12'];
export const CIN_NAMES = ['Kırmızı', 'Mavi', 'Sarı', 'Yeşil', 'Mor', 'Kahverengi'];

export function CinBoard({ view: v, names, avatars, offline, onAction }: TableProps<CinView>) {
  const [sel, setSel] = useState<number | null>(null);
  const mine = v.me !== null && v.turn === v.me && !v.over;
  const targets = useMemo(() => new Map(v.legal.filter((m) => m.path[0] === sel).map((m) => [m.path[m.path.length - 1], m])), [v.legal, sel]);
  const sources = useMemo(() => new Set(v.legal.map((m) => m.path[0])), [v.legal]);
  // Kendi köşen altta: köşe c, saat yönünde 60° aralıkla; köşe 3 alttadır
  const myCorner = v.corners[v.me ?? 0];
  const rot = ((3 - myCorner) * 60 * Math.PI) / 180;
  const pts = BOARD.holes.map(([x, , z]) => {
    const px = Math.sqrt(3) * (x + z / 2), py = 1.5 * z;
    return [px * Math.cos(rot) - py * Math.sin(rot), px * Math.sin(rot) + py * Math.cos(rot)];
  });
  const lastPath = v.last?.path ?? [];
  const order = relSeats(v.n, v.me);
  const click = (i: number) => {
    if (!mine) return;
    const t = targets.get(i);
    if (t) { onAction(t); setSel(null); return; }
    setSel(v.board[i] === v.me && sources.has(i) ? i : null);
  };
  const cornerColor = (c: number) => { const seat = v.corners.indexOf(c); const opp = v.corners.indexOf((c + 3) % 6); return seat >= 0 ? CIN_COLORS[seat] : opp >= 0 ? CIN_COLORS[opp] : null; };

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {order.slice(1).map((s) => <Who key={s} seat={s} names={names} avatars={avatars} offline={offline} active={v.turn === s && !v.over} sub={`${CIN_NAMES[s]} · %${v.progress[s]}`} />)}
      </div>
      <div className="w-full max-w-[min(94vw,32rem)] rounded-full bg-[#E9C98F] p-3 shadow-2xl ring-4 ring-pirinc-700">
        <svg viewBox="-14.5 -14.5 29 29" className="aspect-square w-full" role="grid" aria-label="Çin Daması tahtası">
          {lastPath.length > 1 && <polyline points={lastPath.map((i) => pts[i].join(',')).join(' ')} fill="none" stroke="#D4A44C" strokeWidth="0.25" strokeDasharray="0.4 0.3" />}
          {pts.map(([x, y], i) => {
            const c = BOARD.corner[i];
            const tint = c >= 0 ? cornerColor(c) : null;
            const owner = v.board[i];
            const isT = targets.has(i);
            return (
              <g key={i} onClick={() => click(i)} role="button" aria-label={`delik ${i}${owner >= 0 ? ' ' + CIN_NAMES[owner] : ''}`} style={{ cursor: mine ? 'pointer' : 'default' }}>
                <circle cx={x} cy={y} r={0.62} fill={tint ? tint + '33' : 'transparent'} />
                <circle cx={x} cy={y} r={0.38} fill="#5A3A2244" />
                {isT && <circle cx={x} cy={y} r={0.5} fill="#2E7A5E" opacity={0.85} />}
                {owner >= 0 && (
                  <motion.circle layout cx={x} cy={y} r={0.6} fill={CIN_COLORS[owner]} stroke={sel === i ? '#E8C988' : '#00000066'} strokeWidth={sel === i ? 0.25 : 0.08}
                    initial={false} animate={{ cx: x, cy: y }} />
                )}
                {owner === v.me && mine && sources.has(i) && sel !== i && <circle cx={x} cy={y} r={0.18} fill="#FAF5EA" opacity={0.8} />}
              </g>
            );
          })}
        </svg>
      </div>
      <TurnHint mine={mine} text={v.over ? 'Oyun bitti' : mine ? (sel === null ? 'Oynatacağın taşa dokun' : 'Gideceği deliğe dokun (atlamalar dahil)') : `${names[v.turn]} oynuyor…`} />
      {v.me !== null && <Who seat={v.me} names={names} avatars={avatars} active={mine} sub={`${CIN_NAMES[v.me]} · hedefte %${v.progress[v.me]}`} />}
    </div>
  );
}
