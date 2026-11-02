import { useEffect, useState } from 'react';
import { useOnline } from '../lib/net';

export function FriendsScreen({ goOnline }: { goOnline: () => void }) {
  const o = useOnline();
  const [data, setData] = useState<{ friends: any[]; incoming: any[] }>({ friends: [], incoming: [] });
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const load = () => o.call<{ friends: any[]; incoming: any[] }>('friends:list').then(setData).catch(() => {});
  useEffect(() => { if (o.status === 'bağlı') load(); }, [o.status, o.friendsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o.user || o.status !== 'bağlı') {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4">
        <h1 className="text-2xl font-black">Arkadaşlar</h1>
        <p className="text-fildisi/70">Arkadaş eklemek ve davet göndermek için online giriş yapmalısın.</p>
        <button className="btn-brass self-start" onClick={goOnline}>Online sekmesine git</button>
      </div>
    );
  }
  const act = (ev: string, p: any, ok?: string) =>
    o.call<{ friends: any[]; incoming: any[] }>(ev, p).then((r) => { setData(r); if (ok) setMsg({ t: ok, ok: true }); }).catch((e) => setMsg({ t: e.message, ok: false }));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-8 pt-4">
      <h1 className="text-2xl font-black">Arkadaşlar</h1>
      <form className="panel flex flex-col gap-2 p-4" onSubmit={(e) => { e.preventDefault(); act('friends:request', { username: name }, 'İstek gönderildi'); setName(''); }}>
        <label htmlFor="fn" className="text-sm text-fildisi/70">Kullanıcı adıyla ekle</label>
        <div className="flex gap-2"><input id="fn" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Zeynep" /><button className="btn-brass" disabled={!name.trim()}>Ekle</button></div>
        {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-cuha-200' : 'text-cay-300'}`}>{msg.t}</p>}
        <p className="text-xs text-fildisi/50">Senin kullanıcı adın: <b>{o.user.username}</b></p>
      </form>
      {data.incoming.length > 0 && (
        <section className="panel p-4">
          <h2 className="mb-2 font-bold">Gelen istekler</h2>
          <ul className="flex flex-col gap-2">
            {data.incoming.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <span>{u.avatar} {u.username}</span>
                <span className="flex gap-1.5">
                  <button className="btn-brass px-3 py-1.5 text-sm" onClick={() => act('friends:accept', { userId: u.id }, 'Arkadaş eklendi')}>Kabul et</button>
                  <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => act('friends:accept', { userId: u.id, accept: false })}>Reddet</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel p-4">
        <h2 className="mb-2 font-bold">Arkadaş listesi</h2>
        {data.friends.length === 0 ? <p className="text-sm text-fildisi/60">Henüz arkadaşın yok. Yukarıdan kullanıcı adıyla ekleyebilirsin.</p> : (
          <ul className="flex flex-col gap-2">
            {[...data.friends].sort((a, b) => Number(b.online) - Number(a.online)).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${f.online ? 'bg-cuha-400' : 'bg-duman/50'}`} />
                  {f.avatar} {f.username}
                  <span className="text-xs text-fildisi/50">{f.inRoom ? 'masada' : f.online ? 'çevrim içi' : 'çevrim dışı'}</span>
                </span>
                <span className="flex gap-1.5">
                  {o.room?.status === 'lobby' && f.online && <button className="btn-brass px-3 py-1.5 text-sm" onClick={() => act('friends:invite', { userId: f.id }, 'Davet gönderildi').then(load)}>Davet et</button>}
                  <button className="btn-ghost px-2.5 py-1.5 text-sm" aria-label={`${f.username} arkadaşlıktan çıkar`} onClick={() => act('friends:remove', { userId: f.id })}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
