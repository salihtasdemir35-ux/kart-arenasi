import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { GameResult } from '@kart/engine';

export function ResultOverlay({ result, names, mySeat, children }: { result: GameResult; names: string[]; mySeat: number | null; children: ReactNode }) {
  const won = mySeat !== null && result.winners.includes(mySeat);
  const line = result.loser !== undefined ? (result.loser === mySeat ? 'Papaz sende kaldı' : `${names[result.loser]} papazla kaldı`)
    : result.winners.length ? `Kazanan: ${result.winners.map((i) => names[i]).join(' ve ')}` : result.summary;
  const order = result.scores.map((s, i) => ({ s, i })).sort((a, b) => (result.lowerIsBetter ? a.s - b.s : b.s - a.s));
  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="panel w-full max-w-sm p-6 text-center" initial={{ scale: 0.85 }} animate={{ scale: 1 }}>
        <p className="text-5xl" aria-hidden>{mySeat === null ? '🏁' : won ? '🏆' : '🍵'}</p>
        <h2 className="mt-2 text-2xl font-black">{mySeat === null ? 'Oyun bitti' : won ? 'Kazandın!' : 'Bu sefer olmadı'}</h2>
        <p className="mt-1 text-fildisi/70">{line}</p>
        {result.scores.length > 0 && result.loser === undefined && (
          <ul className="mt-4 flex flex-col gap-1 text-left">
            {order.map(({ s, i }) => (
              <li key={i} className={`flex justify-between rounded-lg px-3 py-1.5 ${result.winners.includes(i) ? 'bg-pirinc/20' : 'bg-black/20'}`}>
                <span>{names[i]}</span><span className="font-bold">{s}{result.lowerIsBetter ? ' ceza' : ''}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>
      </motion.div>
    </motion.div>
  );
}
