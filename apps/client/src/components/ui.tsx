import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="panel max-h-[88vh] w-full max-w-lg overflow-y-auto p-5"
            initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{title}</h2>
              <button className="btn-ghost px-3 py-1.5" onClick={onClose} aria-label="Kapat">✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toast({ text, onClose, tone = 'red' }: { text: string | null; onClose: () => void; tone?: 'red' | 'brass' }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          role="status"
          className={`fixed left-1/2 top-4 z-[60] w-[92%] max-w-md -translate-x-1/2 rounded-xl px-4 py-3 font-medium shadow-xl ${tone === 'red' ? 'bg-cay text-fildisi' : 'bg-pirinc text-ceviz'}`}
          initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
          onClick={onClose}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Segmented<T extends string | number | boolean>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm text-fildisi/70">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)} type="button" disabled={o.disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={`btn px-3 py-2 text-sm ${o.value === value ? 'bg-pirinc text-ceviz' : 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SeatBadge({ name, avatar, active, sub, right, offline }: { name: string; avatar: string; active?: boolean; sub?: ReactNode; right?: ReactNode; offline?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition ${active ? 'bg-pirinc text-ceviz shadow-[0_0_0_3px_rgba(232,201,136,.35)]' : 'bg-black/30 text-fildisi'}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${active ? 'bg-ceviz/15' : 'bg-white/10'} ${offline ? 'opacity-40' : ''}`}>{avatar || '🙂'}</span>
      <span className="min-w-0 leading-tight">
        <span className="block max-w-[8.5rem] truncate text-sm font-semibold">{name}</span>
        {sub && <span className="block text-[11px] opacity-80">{sub}</span>}
      </span>
      {right}
    </div>
  );
}
