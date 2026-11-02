import { useEffect, useMemo, useState } from 'react';
import { catalogById, getModule, hasDictionary, registerDictionary, type Lang } from '@kart/engine';
import { useLocalGame, type LocalSetup } from '../lib/local';
import { GameTable } from '../games/GameTable';
import { Toast } from '../components/ui';
import { RulesModal } from './Rules';
import { ResultOverlay } from './Result';

/** Scrabble için sözlüğü cihazdan (uygulama paketinden) yükler. */
function useDictionary(lang: Lang | null) {
  const [state, setState] = useState<'yok' | 'yükleniyor' | 'hazır' | 'hata'>(lang && !hasDictionary(lang) ? 'yükleniyor' : 'hazır');
  useEffect(() => {
    if (!lang || hasDictionary(lang)) return;
    fetch(`./dict/${lang}.txt`).then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((t) => { registerDictionary(lang, t.split('\n')); setState('hazır'); })
      .catch(() => setState('hata'));
  }, [lang]);
  return state;
}

export function LocalGame(props: { setup: LocalSetup; onExit: () => void; myAvatar: string }) {
  const lang = props.setup.engineId === 'scrabble' ? ((props.setup.options.lang as Lang) ?? 'tr') : null;
  const dict = useDictionary(lang);
  if (dict === 'hazır') return <LocalGameInner {...props} />;
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg">{dict === 'hata' ? 'Sözlük yüklenemedi.' : 'Sözlük hazırlanıyor…'}</p>
      <button className="btn-ghost" onClick={props.onExit}>Oyunlara dön</button>
    </div>
  );
}

function LocalGameInner({ setup, onExit, myAvatar }: { setup: LocalSetup; onExit: () => void; myAvatar: string }) {
  const g = useLocalGame(setup);
  const entry = catalogById(setup.gameId)!;
  const [rules, setRules] = useState(false);
  const names = useMemo(() => Array.from({ length: setup.players }, (_, i) => (i === 0 ? 'Sen' : `Bilgisayar ${i}`)), [setup.players]);
  const avatars = useMemo(() => Array.from({ length: setup.players }, (_, i) => (i === 0 ? myAvatar : '🤖')), [setup.players, myAvatar]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-4xl flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost shrink-0 whitespace-nowrap px-3" onClick={onExit} aria-label="Geri">←</button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{entry.name} <span className="font-normal text-fildisi/60">· {setup.difficulty}</span></h1>
        <div className="flex shrink-0 gap-1.5">
          {getModule(setup.engineId)?.resign && !g.over && <button className="btn-ghost whitespace-nowrap px-3 text-sm" onClick={() => g.act({ type: 'resign' })}>Teslim ol</button>}
          <button className="btn-ghost px-3" onClick={() => setRules(true)} aria-label="Kurallar">?</button>
        </div>
      </div>
      <div className="flex-1">
        <GameTable view={g.view} names={names} avatars={avatars} onAction={g.act} />
      </div>
      <Toast text={g.error} onClose={g.clearError} />
      <RulesModal open={rules} onClose={() => setRules(false)} engineId={setup.engineId} name={entry.name} />
      {g.over && g.result && (
        <ResultOverlay result={g.result} names={names} mySeat={0}>
          <button className="btn-brass" onClick={g.restart}>Yeniden oyna</button>
          <button className="btn-ghost" onClick={onExit}>Oyunlara dön</button>
        </ResultOverlay>
      )}
    </div>
  );
}
