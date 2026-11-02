import { useEffect, useState } from 'react';
import { catalogById } from '@kart/engine';
import { useOnline } from '../lib/net';
import { getLocalStats } from '../lib/stats';
import { ServerForm } from './Online';
import { prefs } from '../lib/platform';

const AVATARS = ['🦊', '🐻', '🦉', '🐢', '🦁', '🐺', '🐙', '🦅', '🐝', '🐬', '🦄', '🐯'];

function StatTable({ stats }: { stats: Record<string, { played: number; won: number }> }) {
  const rows = Object.entries(stats);
  if (!rows.length) return <p className="text-sm text-fildisi/60">Henüz oyun yok. İlk masana otur!</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-fildisi/60"><th className="py-1 font-medium">Oyun</th><th className="font-medium">Maç</th><th className="font-medium">Galibiyet</th><th className="font-medium">Oran</th></tr></thead>
      <tbody>
        {rows.map(([id, s]) => (
          <tr key={id} className="border-t border-white/5">
            <td className="py-1.5">{catalogById(id)?.name ?? id}</td><td>{s.played}</td><td>{s.won}</td><td>%{s.played ? Math.round((s.won / s.played) * 100) : 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ProfileScreen({ localAvatar, setLocalAvatar }: { localAvatar: string; setLocalAvatar: (a: string) => void }) {
  const o = useOnline();
  const [p, setP] = useState<any>(null);
  const local = getLocalStats();
  useEffect(() => {
    if (o.status === 'bağlı') o.call<{ profile: any }>('profile:get').then((r) => setP(r.profile)).catch(() => {});
  }, [o.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAvatar = (a: string) => {
    setLocalAvatar(a);
    prefs.set('avatar', a);
    if (o.status === 'bağlı') o.call<{ user: any }>('profile:avatar', { avatar: a }).then(() => o.call<{ profile: any }>('profile:get').then((r) => setP(r.profile))).catch(() => {});
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-8 pt-4">
      <h1 className="text-2xl font-black">Profil</h1>
      <section className="panel flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-4xl">{p?.avatar ?? localAvatar}</span>
          <div>
            <p className="text-xl font-bold">{p?.username ?? 'Bu cihaz'}</p>
            {p && <p className="text-sm text-fildisi/70">Seviye {p.level} · {p.league} ligi · {p.friendCount} arkadaş</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Avatar seç">
          {AVATARS.map((a) => (
            <button key={a} onClick={() => pickAvatar(a)} aria-pressed={(p?.avatar ?? localAvatar) === a}
              className={`h-10 w-10 rounded-xl text-xl ${(p?.avatar ?? localAvatar) === a ? 'bg-pirinc' : 'bg-white/5'}`}>{a}</button>
          ))}
        </div>
      </section>
      {p && (
        <section className="panel flex flex-col gap-3 p-4">
          <h2 className="font-bold">Online istatistikler</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-black/20 p-2"><p className="text-2xl font-black">{p.played}</p><p className="text-xs text-fildisi/60">oyun</p></div>
            <div className="rounded-xl bg-black/20 p-2"><p className="text-2xl font-black">{p.won}</p><p className="text-xs text-fildisi/60">galibiyet</p></div>
            <div className="rounded-xl bg-black/20 p-2"><p className="text-2xl font-black">%{p.winRate}</p><p className="text-xs text-fildisi/60">kazanma</p></div>
          </div>
          {p.favorite && <p className="text-sm">En çok oynadığın: <b>{catalogById(p.favorite)?.name}</b></p>}
          {p.badges.length > 0 && <div className="flex flex-wrap gap-1.5">{p.badges.map((b: string) => <span key={b} className="chip bg-pirinc/20 text-pirinc-300">🏅 {b}</span>)}</div>}
          <StatTable stats={p.stats} />
          {p.recent.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {p.recent.slice(0, 6).map((m: any, i: number) => (
                <li key={i} className="flex justify-between rounded-lg bg-black/20 px-3 py-1.5">
                  <span>{catalogById(m.gameId)?.name} · {m.won ? 'Kazandı' : 'Kaybetti'}</span>
                  <span className="text-fildisi/50">{new Date(m.at).toLocaleDateString('tr-TR')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-bold">Bilgisayara karşı</h2>
        <StatTable stats={local.games} />
      </section>
      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-bold">Ayarlar</h2>
        <ServerForm />
        {o.user && <button className="btn-ghost self-start" onClick={o.logout}>Çıkış yap ({o.user.username})</button>}
      </section>
      <p className="text-center text-xs text-fildisi/40">Kart Arenası 1.0 · 31 oyun · Gerçek para ile oynanmaz.</p>
    </div>
  );
}
