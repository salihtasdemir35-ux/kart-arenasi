import type { ReactNode } from 'react';
import { SeatBadge } from '../components/ui';

export interface TableProps<V = any> {
  view: V;
  names: string[];
  avatars: string[];
  offline?: boolean[];
  onAction: (a: any) => void;
}

/** Koltukları "ben" altta olacak şekilde sıralar: [ben, sıradaki, ...]. */
export function relSeats(n: number, me: number | null) {
  const m = me ?? 0;
  return Array.from({ length: n }, (_, k) => (m + k) % n);
}

export function Opponents({ seats, render }: { seats: number[]; render: (seat: number) => ReactNode }) {
  return (
    <div className={`grid gap-2 ${seats.length >= 3 ? 'grid-cols-3' : seats.length === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${seats.length > 3 ? 'sm:grid-cols-5' : ''}`}>
      {seats.map((s) => (
        <div key={s} className="flex flex-col items-center gap-1.5">{render(s)}</div>
      ))}
    </div>
  );
}

export function Who({ seat, names, avatars, active, sub, offline }: { seat: number; names: string[]; avatars: string[]; active: boolean; sub?: ReactNode; offline?: boolean[] }) {
  return <SeatBadge name={names[seat] ?? `Oyuncu ${seat + 1}`} avatar={avatars[seat] ?? '🙂'} active={active} sub={sub} offline={offline?.[seat]} />;
}

export function TurnHint({ mine, text }: { mine: boolean; text: string }) {
  return (
    <p aria-live="polite" className={`text-center text-sm font-semibold ${mine ? 'text-pirinc-300' : 'text-fildisi/60'}`}>{text}</p>
  );
}
