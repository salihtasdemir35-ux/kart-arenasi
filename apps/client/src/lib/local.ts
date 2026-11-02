import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogById, cryptoRng, getModule, type Difficulty } from '@kart/engine';
import { recordLocal } from './stats';
import { prefs } from './platform';

export interface LocalSetup {
  gameId: string;
  engineId: string;
  players: number;
  options: Record<string, unknown>;
  difficulty: Difficulty;
}

/**
 * Bilgisayara karşı oyun: motor cihazda çalışır, insan her zaman koltuk 0'dadır.
 * Yapay zekâ rakipler yalnızca kendi görünümlerini (view) alır.
 */
export function useLocalGame(setup: LocalSetup, aiDelay = prefs.get('aiDelay', 750)) {
  const mod = getModule(setup.engineId)!;
  const rng = useMemo(() => cryptoRng(), []);
  const fullOptions = useMemo(() => ({ ...(catalogById(setup.gameId)?.presetOptions ?? {}), ...setup.options }), [setup.gameId, setup.options]);
  const [state, setState] = useState(() => mod.setup({ players: setup.players, options: fullOptions }, rng));
  const [error, setError] = useState<string | null>(null);
  const recorded = useRef(false);

  const act = useCallback((action: unknown) => {
    setState((s: any) => {
      try {
        // Sıra yapay zekâdaysa dokunuşu sessizce yok say (çift dokunma vb.)
        const resign = (action as any)?.type === 'resign';
        if (resign && mod.resign) return mod.resign(s, 0, 'Teslim oldu');
        if (!mod.toAct(s).includes(0)) return s;
        setError(null);
        return mod.apply(s, 0, action, rng);
      } catch (e: any) {
        setError(e.message);
        return s;
      }
    });
  }, [mod, rng]);

  useEffect(() => {
    if (mod.isOver(state)) {
      if (!recorded.current) {
        recorded.current = true;
        const r = mod.result(state)!;
        recordLocal(setup.gameId, r.winners.includes(0), r.summary);
      }
      return;
    }
    // Test kancası: ka:autoplay açıksa insan koltuğunu da yapay zekâ oynar (uçtan uca tarayıcı testleri için)
    const auto = prefs.get('autoplay', false);
    const seat = mod.toAct(state).find((p: number) => auto || p !== 0);
    if (seat === undefined) return;
    const t = setTimeout(() => {
      setState((s: any) => (mod.toAct(s).includes(seat) ? mod.apply(s, seat, mod.ai(mod.view(s, seat), seat, setup.difficulty, rng), rng) : s));
    }, aiDelay);
    return () => clearTimeout(t);
  }, [state, mod, rng, setup.difficulty, setup.gameId, aiDelay]);

  const restart = useCallback(() => {
    recorded.current = false;
    setError(null);
    setState(mod.setup({ players: setup.players, options: fullOptions }, rng));
  }, [mod, rng, setup.players, fullOptions]);

  return { view: mod.view(state, 0), over: mod.isOver(state), result: mod.result(state), act, restart, error, clearError: () => setError(null) };
}
