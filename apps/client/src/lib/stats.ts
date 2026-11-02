import { prefs } from './platform';

export interface LocalStats { games: Record<string, { played: number; won: number }>; recent: { gameId: string; won: boolean; at: number; summary: string }[] }

export function getLocalStats(): LocalStats {
  return prefs.get<LocalStats>('localStats', { games: {}, recent: [] });
}

export function recordLocal(gameId: string, won: boolean, summary: string) {
  const s = getLocalStats();
  const g = (s.games[gameId] ??= { played: 0, won: 0 });
  g.played += 1;
  if (won) g.won += 1;
  s.recent.unshift({ gameId, won, at: Date.now(), summary });
  s.recent = s.recent.slice(0, 20);
  prefs.set('localStats', s);
}
