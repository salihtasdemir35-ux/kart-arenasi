import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { RANK_LABELS, SUIT_SYMBOLS, cardName, isRed, rankOf, suitOf } from '@kart/engine';

type Size = 'sm' | 'md' | 'lg';
const DIM: Record<Size, string> = {
  sm: 'w-9 h-[3.15rem] text-[11px] rounded-md',
  md: 'w-14 h-20 text-sm rounded-lg',
  lg: 'w-[4.4rem] h-[6.2rem] text-base rounded-xl',
};

export const PlayingCard = forwardRef<HTMLElement, {
  card: string; size?: Size; onClick?: () => void; playable?: boolean; dim?: boolean; layoutId?: string; className?: string;
}>(function PlayingCard({ card, size = 'md', onClick, playable, dim, layoutId, className = '' }, ref) {
  const red = isRed(card);
  const sym = SUIT_SYMBOLS[suitOf(card)];
  const label = RANK_LABELS[rankOf(card)];
  const Tag: any = onClick ? motion.button : motion.div;
  return (
    <Tag
      ref={ref}
      layoutId={layoutId}
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileHover={playable ? { y: -10 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      onClick={onClick}
      disabled={onClick ? !playable : undefined}
      aria-label={cardName(card)}
      className={`relative shrink-0 select-none bg-fildisi shadow-[0_2px_0_#EFE6D2,0_6px_14px_rgba(0,0,0,.35)] ring-1 ring-black/10 ${DIM[size]} ${red ? 'text-cay' : 'text-ceviz'} ${playable ? 'ring-2 ring-pirinc cursor-pointer' : ''} ${dim ? 'brightness-[.6] saturate-50' : ''} ${className}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-bold leading-none">
        <span>{label}</span><span>{sym}</span>
      </span>
      <span className={`absolute inset-0 flex items-center justify-center ${size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-3xl'}`}>{sym}</span>
      <span className="absolute bottom-0.5 right-1 rotate-180 flex flex-col items-center font-bold leading-none">
        <span>{label}</span><span>{sym}</span>
      </span>
    </Tag>
  );
});

export function CardBack({ size = 'md', className = '', onClick, highlight }: { size?: Size; className?: string; onClick?: () => void; highlight?: boolean }) {
  const Tag: any = onClick ? motion.button : motion.div;
  return (
    <Tag
      onClick={onClick}
      whileHover={onClick ? { y: -8 } : undefined}
      aria-label={onClick ? 'Kapalı kart seç' : 'Kapalı kart'}
      className={`shrink-0 ${DIM[size]} ring-1 ring-black/30 shadow-[0_4px_10px_rgba(0,0,0,.35)] ${highlight ? 'ring-2 ring-pirinc-300' : ''} ${className}`}
      style={{
        background:
          'repeating-linear-gradient(45deg, rgba(212,164,76,.55) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgba(212,164,76,.55) 0 2px, transparent 2px 7px), #8E2A21',
        boxShadow: 'inset 0 0 0 3px #FAF5EA',
      }}
    />
  );
}

/** Kapalı kart yelpazesi (rakip eli). */
export function BackFan({ count, size = 'sm', max = 8 }: { count: number; size?: Size; max?: number }) {
  const shown = Math.min(count, max);
  return (
    <div className="flex items-center">
      {Array.from({ length: shown }).map((_, i) => (
        <CardBack key={i} size={size} className={i ? (size === 'sm' ? '-ml-6' : '-ml-10') : ''} />
      ))}
      {count > max && <span className="ml-1 text-xs text-fildisi/70">+{count - max}</span>}
    </div>
  );
}
