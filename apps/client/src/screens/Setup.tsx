import { useMemo, useState } from 'react';
import { getModule, type CatalogEntry, type Difficulty } from '@kart/engine';
import { Modal, Segmented } from '../components/ui';
import type { LocalSetup } from '../lib/local';

export interface OnlineSetup {
  gameId: string; players: number; bots: number; difficulty: Difficulty; options: Record<string, unknown>;
  clockMinutes: number; password: string; turnSeconds: number; botOnLeave: boolean; allowSpectators: boolean;
}

export function SetupModal({ entry, mode: initialMode, onClose, onLocal, onOnline, onlineReady }: {
  entry: CatalogEntry | null; mode: 'local' | 'online'; onClose: () => void;
  onLocal: (s: LocalSetup) => void; onOnline: (s: OnlineSetup) => void; onlineReady: boolean;
}) {
  const mod = entry ? getModule(entry.engine ?? entry.id) : undefined;
  const counts = useMemo(() => (entry?.presetPlayers ? [entry.presetPlayers] : mod?.playerCounts ?? [2]), [entry, mod]);
  const [mode, setMode] = useState<'local' | 'online'>(initialMode);
  const [players, setPlayers] = useState(counts[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>('orta');
  const [options, setOptions] = useState<Record<string, unknown>>(() => Object.fromEntries((mod?.options ?? []).map((o) => [o.key, o.default])));
  const [bots, setBots] = useState(0);
  const [password, setPassword] = useState('');
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [clockMinutes, setClockMinutes] = useState(0);
  const [botOnLeave, setBotOnLeave] = useState(true);
  const [allowSpectators, setAllowSpectators] = useState(true);
  if (!entry || !mod) return null;
  const p = counts.includes(players) ? players : counts[0];
  const maxBots = p - 1;

  return (
    <Modal open={!!entry} onClose={onClose} title={entry.name}>
      <div className="flex flex-col gap-4">
        <Segmented label="Nasıl oynayacaksın?" value={mode} onChange={setMode}
          options={[{ value: 'local', label: 'Bilgisayara karşı' }, { value: 'online', label: 'Arkadaşlarla online' }]} />
        {counts.length > 1 && (
          <Segmented label="Oyuncu sayısı" value={p} onChange={(v) => { setPlayers(v); setBots((b) => Math.min(b, v - 1)); }}
            options={counts.map((c) => ({ value: c, label: `${c} kişi` }))} />
        )}
        {counts.length === 1 && <p className="text-sm text-fildisi/70">{p} kişiyle oynanır.</p>}
        {mode === 'online' && (
          <Segmented label="Bilgisayar oyuncusu (boş koltuklara)" value={Math.min(bots, maxBots)} onChange={setBots}
            options={Array.from({ length: maxBots + 1 }, (_, i) => ({ value: i, label: i === 0 ? 'Yok' : String(i) }))} />
        )}
        {(mode === 'local' || bots > 0) && (
          <Segmented label="Bilgisayar seviyesi" value={difficulty} onChange={setDifficulty}
            options={[{ value: 'kolay', label: 'Kolay' }, { value: 'orta', label: 'Orta' }, { value: 'zor', label: 'Zor' }]} />
        )}
        {mod.options.filter((o) => !(entry.presetOptions && o.key in entry.presetOptions) && !(mode === 'online' && o.key === 'learning')).map((o) => (
          <Segmented key={o.key} label={o.label} value={options[o.key] as any} onChange={(v) => setOptions((x) => ({ ...x, [o.key]: v }))}
            options={o.choices.map((c) => ({ value: c.value as any, label: c.label }))} />
        ))}
        {mode === 'online' && (
          <>
            {mod.resign && (
              <Segmented label="Oyun saati (her oyuncuya)" value={clockMinutes} onChange={setClockMinutes}
                options={[{ value: 0, label: 'Yok' }, { value: 3, label: '3 dk' }, { value: 5, label: '5 dk' }, { value: 10, label: '10 dk' }, { value: 15, label: '15 dk' }]} />
            )}
            <Segmented label="Hamle süresi" value={turnSeconds} onChange={setTurnSeconds}
              options={[{ value: 0, label: 'Sınırsız' }, { value: 20, label: '20 sn' }, { value: 30, label: '30 sn' }, { value: 60, label: '60 sn' }]} />
            <label className="flex flex-col gap-1.5 text-sm text-fildisi/70">
              Masa şifresi (isteğe bağlı)
              <input className="field" value={password} maxLength={40} onChange={(e) => setPassword(e.target.value)} placeholder="Boş bırakırsan herkes kodla katılır" />
            </label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-pirinc" checked={botOnLeave} onChange={(e) => setBotOnLeave(e.target.checked)} /> Biri ayrılırsa yerine bilgisayar oynasın</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-pirinc" checked={allowSpectators} onChange={(e) => setAllowSpectators(e.target.checked)} /> Seyirci kabul et</label>
            {!onlineReady && <p className="rounded-xl bg-cay/20 p-3 text-sm">Online masa açmak için önce Online sekmesinden giriş yap.</p>}
          </>
        )}
        <button
          className="btn-brass mt-1 py-3 text-lg"
          disabled={mode === 'online' && !onlineReady}
          onClick={() => mode === 'local'
            ? onLocal({ gameId: entry.id, engineId: entry.engine ?? entry.id, players: p, options: { ...options, ...(entry.presetOptions ?? {}) }, difficulty })
            : onOnline({ gameId: entry.id, players: p, bots: Math.min(bots, maxBots), difficulty, options, clockMinutes, password, turnSeconds, botOnLeave, allowSpectators })}
        >
          {mode === 'local' ? 'Oyunu başlat' : 'Masayı aç'}
        </button>
      </div>
    </Modal>
  );
}
