import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CatalogEntry } from '@kart/engine';
import { useOnline } from './lib/net';
import { prefs } from './lib/platform';
import type { LocalSetup } from './lib/local';
import { Home } from './screens/Home';
import { SetupModal, type OnlineSetup } from './screens/Setup';
import { LocalGame } from './screens/LocalGame';
import { OnlineScreen } from './screens/Online';
import { RoomScreen } from './screens/Room';
import { FriendsScreen } from './screens/Friends';
import { ProfileScreen } from './screens/Profile';
import { Toast } from './components/ui';

type Tab = 'oyunlar' | 'online' | 'arkadaslar' | 'profil';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'oyunlar', label: 'Oyunlar', icon: '♠' },
  { id: 'online', label: 'Online', icon: '◉' },
  { id: 'arkadaslar', label: 'Arkadaşlar', icon: '☺' },
  { id: 'profil', label: 'Profil', icon: '★' },
];

const linkCode = (() => {
  try { return (new URLSearchParams(location.search).get('masa') ?? '').toUpperCase().slice(0, 6); } catch { return ''; }
})();

export default function App() {
  const o = useOnline();
  const [tab, setTab] = useState<Tab>(linkCode ? 'online' : 'oyunlar');
  const [setup, setSetup] = useState<{ entry: CatalogEntry; mode: 'local' | 'online' } | null>(null);
  const [local, setLocal] = useState<LocalSetup | null>(null);
  const [avatar, setAvatar] = useState(() => prefs.get('avatar', '🦊'));
  const [err, setErr] = useState<string | null>(null);
  const onlineReady = !!o.user && o.status === 'bağlı';

  useEffect(() => {
    const onBack = (e: Event) => {
      if (setup) { setSetup(null); e.preventDefault(); }
      else if (local) { setLocal(null); e.preventDefault(); }
      else if (o.room) { e.preventDefault(); } // masadan çıkış yalnızca "Çık" düğmesiyle (onaylı)
      else if (tab !== 'oyunlar') { setTab('oyunlar'); e.preventDefault(); }
    };
    window.addEventListener('ka-back', onBack);
    return () => window.removeEventListener('ka-back', onBack);
  }, [setup, local, o.room, tab]);

  const createOnline = async (s: OnlineSetup) => {
    try {
      await o.call('room:create', s);
      setSetup(null);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const invites = (
    <AnimatePresence>
      {o.invites.slice(0, 1).map((inv) => (
        <motion.div key={inv.code} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
          className="fixed left-1/2 top-3 z-[55] flex w-[94%] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl bg-pirinc p-3 text-ceviz shadow-2xl" role="alert">
          <span className="text-2xl">{inv.from.avatar}</span>
          <span className="flex-1 text-sm"><b>{inv.from.username}</b> seni {inv.gameName} masasına çağırıyor</span>
          <button className="btn bg-ceviz px-3 py-1.5 text-fildisi" disabled={!!o.room}
            onClick={() => o.call('room:join', { code: inv.code }).then(() => o.dismissInvite(inv.code)).catch((e) => { setErr(e.message); o.dismissInvite(inv.code); })}>Katıl</button>
          <button className="px-1 text-lg" aria-label="Daveti kapat" onClick={() => o.dismissInvite(inv.code)}>✕</button>
        </motion.div>
      ))}
    </AnimatePresence>
  );

  if (o.room) return <>{invites}<RoomScreen /></>;
  if (local) return <LocalGame key={JSON.stringify(local) + Date.now()} setup={local} onExit={() => setLocal(null)} myAvatar={o.user?.avatar ?? avatar} />;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {invites}
      <main className="flex-1 pb-24">
        {tab === 'oyunlar' && <Home onPick={(entry) => setSetup({ entry, mode: 'local' })} />}
        {tab === 'online' && <OnlineScreen initialCode={linkCode} onCreate={(entry) => setSetup({ entry, mode: 'online' })} />}
        {tab === 'arkadaslar' && <FriendsScreen goOnline={() => setTab('online')} />}
        {tab === 'profil' && <ProfileScreen localAvatar={avatar} setLocalAvatar={setAvatar} />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-ceviz/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Ana menü">
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {TABS.map((t) => (
            <li key={t.id}>
              <button onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${tab === t.id ? 'text-pirinc' : 'text-fildisi/55 hover:text-fildisi'}`}>
                <span className="text-xl leading-none">{t.icon}</span>{t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {setup && (
        <SetupModal key={setup.entry.id + setup.mode} entry={setup.entry} mode={setup.mode} onlineReady={onlineReady} onClose={() => setSetup(null)}
          onLocal={(s) => { setSetup(null); setLocal(s); }} onOnline={createOnline} />
      )}
      <Toast text={err} onClose={() => setErr(null)} />
    </div>
  );
}
