import { useState } from 'react';
import { CATALOG, type CatalogEntry } from '@kart/engine';
import { normalizeUrl, useOnline } from '../lib/net';
import { isNative } from '../lib/platform';

export function ServerForm() {
  const o = useOnline();
  const [url, setUrl] = useState(o.serverUrl);
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) o.setServerUrl(url); }}>
      <label className="text-sm text-fildisi/70" htmlFor="srv">Sunucu adresi</label>
      <div className="flex gap-2">
        <input id="srv" className="field" inputMode="url" placeholder="https://kart-arenasi.onrender.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn-brass" type="submit">Kaydet</button>
      </div>
      <p className="text-xs text-fildisi/60">Online oyun için Kart Arenası sunucusunun adresi gerekir. Kurulum kılavuzunda nasıl ücretsiz yayınlanacağı anlatılıyor.</p>
    </form>
  );
}

function Login() {
  const o = useOnline();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (m: 'login' | 'register' | 'guest') => {
    setBusy(true); setErr(null);
    try { await o.login(m, u, p); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <h2 className="text-xl font-bold">{mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}</h2>
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(mode); }}>
        <input className="field" autoComplete="username" placeholder="Kullanıcı adı" value={u} onChange={(e) => setU(e.target.value)} />
        <input className="field" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Şifre (en az 6 karakter)" value={p} onChange={(e) => setP(e.target.value)} />
        {err && <p role="alert" className="rounded-lg bg-cay/25 px-3 py-2 text-sm">{err}</p>}
        <button className="btn-brass" disabled={busy || !u || !p}>{mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}</button>
      </form>
      <button className="text-sm text-pirinc-300 underline-offset-2 hover:underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Hesabın yok mu? Hesap oluştur' : 'Hesabın var mı? Giriş yap'}
      </button>
      <div className="flex items-center gap-3 text-xs text-fildisi/50"><span className="h-px flex-1 bg-white/10" />ya da<span className="h-px flex-1 bg-white/10" /></div>
      <button className="btn-ghost" disabled={busy} onClick={() => run('guest')}>Misafir olarak devam et</button>
      <p className="text-xs text-fildisi/50">Misafir hesabı bu cihazda saklanır. Arkadaş listesi ve istatistikler için hesap oluşturman önerilir.</p>
    </div>
  );
}

export function OnlineScreen({ onCreate, initialCode }: { onCreate: (e: CatalogEntry) => void; initialCode: string }) {
  const o = useOnline();
  const [code, setCode] = useState(initialCode);
  const [pw, setPw] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const join = async (spectate = false) => {
    setErr(null);
    try { await o.call('room:join', { code, password: pw, spectate }); }
    catch (e: any) { setErr(e.message); if (/şifre/i.test(e.message)) setNeedPw(true); }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-8 pt-4">
      <h1 className="text-2xl font-black">Online oyna</h1>
      {!o.serverUrl ? (
        <div className="panel p-5"><ServerForm /></div>
      ) : !o.user ? (
        <>
          <Login />
          {isNative() && <details className="text-sm text-fildisi/60"><summary>Sunucu: {o.serverUrl}</summary><div className="mt-2"><ServerForm /></div></details>}
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${o.status === 'bağlı' ? 'bg-cuha-400' : o.status === 'bağlanıyor' ? 'bg-pirinc' : 'bg-cay'}`} />
            {o.status === 'bağlı' ? `${o.user.avatar} ${o.user.username} olarak bağlısın` : o.status === 'bağlanıyor' ? 'Sunucuya bağlanılıyor…' : o.error ?? 'Bağlantı koptu, yeniden deneniyor…'}
          </p>
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Masa koduyla katıl</h2>
            <input className="field text-center text-2xl font-bold tracking-[.3em] uppercase" maxLength={6} placeholder="ABC123" aria-label="Masa kodu"
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            {needPw && <input className="field" type="password" placeholder="Masa şifresi" value={pw} onChange={(e) => setPw(e.target.value)} />}
            {err && <p role="alert" className="rounded-lg bg-cay/25 px-3 py-2 text-sm">{err}</p>}
            <div className="flex gap-2">
              <button className="btn-brass flex-1" disabled={code.length !== 6 || o.status !== 'bağlı'} onClick={() => join(false)}>Masaya otur</button>
              <button className="btn-ghost" disabled={code.length !== 6 || o.status !== 'bağlı'} onClick={() => join(true)}>İzle</button>
            </div>
          </div>
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold">Yeni masa aç</h2>
            <div className="grid grid-cols-2 gap-2">
              {CATALOG.filter((c) => c.playable).map((c) => (
                <button key={c.id} className="btn-ghost justify-start py-3" disabled={o.status !== 'bağlı'} onClick={() => onCreate(c)}>{c.name}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
