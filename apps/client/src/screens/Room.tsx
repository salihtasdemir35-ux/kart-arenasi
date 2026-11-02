import { useEffect, useMemo, useState } from 'react';
import { catalogById, getModule } from '@kart/engine';
import { shareLink, useOnline } from '../lib/net';
import { GameTable } from '../games/GameTable';
import { Modal, Toast } from '../components/ui';
import { ResultOverlay } from './Result';
import { RulesModal } from './Rules';

function Chat({ compact }: { compact?: boolean }) {
  const o = useOnline();
  const [text, setText] = useState('');
  const room = o.room!;
  const send = (t: string) => { if (t.trim()) o.call('chat:send', { code: room.code, text: t }).catch(() => {}); };
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-col gap-1 overflow-y-auto rounded-xl bg-black/25 p-2 ${compact ? 'h-40' : 'h-56'}`} aria-live="polite">
        {room.chat.length === 0 && <p className="m-auto text-sm text-fildisi/50">Henüz mesaj yok</p>}
        {room.chat.map((m, i) => (
          <p key={i} className="text-sm"><span className={`font-semibold ${m.from === o.user?.id ? 'text-pirinc-300' : ''}`}>{m.name}:</span> {m.text}</p>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {room.quick.map((q) => <button key={q} className="chip whitespace-nowrap bg-white/5 px-3 py-1.5 ring-1 ring-white/10" onClick={() => send(q)}>{q}</button>)}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); setText(''); }}>
        <input className="field" maxLength={200} placeholder="Mesaj yaz" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-brass" disabled={!text.trim()}>Gönder</button>
      </form>
    </div>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  if (!deadline) return null;
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`chip ${s <= 5 ? 'bg-cay' : 'bg-black/35'}`}>⏱ {s} sn</span>;
}

function Clocks({ names }: { names: string[] }) {
  const o = useOnline();
  const room = o.room!;
  const [, setTick] = useState(0);
  const [at, setAt] = useState(Date.now());
  useEffect(() => { setAt(Date.now()); }, [room.clock]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 250); return () => clearInterval(t); }, []);
  if (!room.clock) return null;
  const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  return (
    <div className="flex justify-center gap-2" aria-label="Oyun saati">
      {room.clock.ms.map((ms, i) => {
        const left = room.clock!.seat === i && room.status === 'playing' ? ms - (Date.now() - at) : ms;
        return <span key={i} className={`chip px-3 py-1.5 font-mono text-sm ${room.clock!.seat === i ? (left < 20000 ? 'bg-cay' : 'bg-pirinc text-ceviz') : 'bg-black/35'}`}>{names[i]} {fmt(left)}</span>;
      })}
    </div>
  );
}

export function RoomScreen() {
  const o = useOnline();
  const room = o.room!;
  const entry = catalogById(room.gameId)!;
  const [err, setErr] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [rules, setRules] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const me = room.seats.findIndex((s) => s.userId === o.user?.id && !s.takenOver);
  const host = room.hostId === o.user?.id;
  const names = room.seats.map((s) => s.name);
  const avatars = room.seats.map((s) => s.avatar || '🙂');
  const offline = room.seats.map((s) => !!s.userId && !s.connected && !s.takenOver);
  const run = (ev: string, p: any = {}) => o.call(ev, p).catch((e) => setErr(e.message));

  useEffect(() => {
    if (room.status !== 'lobby') return;
    o.call<{ friends: any[] }>('friends:list').then((r) => setFriends(r.friends)).catch(() => {});
  }, [room.status, o.friendsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async () => {
    await o.call('room:leave', { code: room.code }).catch(() => {});
    o.clearRoom();
  };
  const link = shareLink(o.serverUrl, room.code);
  const share = async () => {
    const text = `Kart Arenası'nda ${entry.name} masam hazır. Masa kodu: ${room.code}`;
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: 'Kart Arenası', text, url: link });
      else { await navigator.clipboard.writeText(`${text}\n${link}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* paylaşım iptal edildi */ }
  };
  const view = o.game?.view;
  const allReady = useMemo(() => room.seats.every((s) => s.bot || (s.userId && s.ready)), [room.seats]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-4xl flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost px-3" onClick={() => (room.status === 'playing' && me >= 0 ? setConfirmLeave(true) : leave())}>← Çık</button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-bold">{entry.name}</h1>
          <span className="chip bg-black/35 font-mono tracking-widest">{room.code}</span>
          {room.status === 'playing' && <Countdown deadline={room.turnDeadline} />}
        </div>
        <div className="flex gap-1.5">
          <button className="btn-ghost px-3" onClick={() => setRules(true)} aria-label="Kurallar">?</button>
          {room.status !== 'lobby' && <button className="btn-ghost px-3" onClick={() => setChat(true)} aria-label="Sohbet">💬</button>}
        </div>
      </div>

      {room.status === 'lobby' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="panel flex flex-col gap-3 p-4">
            <h2 className="font-bold">Koltuklar</h2>
            <ul className="flex flex-col gap-2">
              {room.seats.map((s, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-black/20 p-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg">{s.bot ? '🤖' : s.userId ? s.avatar : '·'}</span>
                  <span className="flex-1">
                    <span className="block font-semibold">{s.userId || s.bot ? s.name : 'Boş koltuk'}</span>
                    <span className="block text-xs text-fildisi/60">
                      {s.bot ? `Bilgisayar · ${s.difficulty}` : s.userId ? (s.userId === room.hostId ? 'Masa sahibi' : s.ready ? 'Hazır' : 'Hazır değil') + (s.connected ? '' : ' · bağlantı yok') : 'Arkadaş bekleniyor'}
                    </span>
                  </span>
                  {host && !s.userId && (
                    <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => run('room:seat', { index: i, bot: !s.bot, difficulty: 'orta' })}>
                      {s.bot ? 'Botu çıkar' : 'Bot ekle'}
                    </button>
                  )}
                  {s.userId && !s.bot && <span className={`h-2.5 w-2.5 rounded-full ${s.ready ? 'bg-cuha-400' : 'bg-duman'}`} />}
                </li>
              ))}
            </ul>
            {me >= 0 && !host && (
              <button className={room.seats[me].ready ? 'btn-ghost' : 'btn-brass'} onClick={() => run('room:ready', { ready: !room.seats[me].ready })}>
                {room.seats[me].ready ? 'Hazır değilim' : 'Hazırım'}
              </button>
            )}
            {host && (
              <button className="btn-brass py-3 text-lg" disabled={!allReady} onClick={() => run('room:start')}>
                {allReady ? 'Oyunu başlat' : 'Herkesin hazır olması bekleniyor'}
              </button>
            )}
            {me < 0 && <p className="text-center text-sm text-fildisi/70">Seyirci olarak izliyorsun.</p>}
          </div>
          <div className="flex flex-col gap-3">
            <div className="panel flex flex-col gap-2 p-4">
              <h2 className="font-bold">Arkadaşlarını çağır</h2>
              <p className="text-sm text-fildisi/70">Masa kodu <b className="font-mono tracking-widest text-pirinc-300">{room.code}</b>{room.hasPassword ? ' · şifreli masa' : ''}</p>
              <button className="btn-brass" onClick={share}>{copied ? 'Bağlantı kopyalandı' : 'Davet bağlantısını paylaş'}</button>
              {friends.filter((f) => f.online).length > 0 && (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {friends.filter((f) => f.online).map((f) => (
                    <li key={f.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
                      <span>{f.avatar} {f.username}</span>
                      <button className="btn-ghost px-3 py-1 text-sm" disabled={!!f.inRoom} onClick={() => run('friends:invite', { userId: f.id })}>{f.inRoom ? 'Masada' : 'Davet et'}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel p-4"><Chat /></div>
          </div>
        </div>
      ) : (
        <>
          <Clocks names={names} />
          <div className="flex-1">
            {view ? <GameTable view={view} names={names} avatars={avatars} offline={offline} onAction={(a) => run('game:action', { action: a })} /> : <p className="p-8 text-center">Masa hazırlanıyor…</p>}
          </div>
          {room.status === 'playing' && me >= 0 && getModule(room.engineId)?.resign && (
            <button className="btn-ghost self-center px-4 py-1.5 text-sm" onClick={() => run('game:action', { action: { type: 'resign' } })}>Teslim ol</button>
          )}
          {room.spectators.length > 0 && <p className="text-center text-xs text-fildisi/50">İzleyenler: {room.spectators.join(', ')}</p>}
        </>
      )}

      {(room.status === 'finished' || room.status === 'abandoned') && room.result && (
        <ResultOverlay result={room.result} names={names} mySeat={me >= 0 ? me : null}>
          {host && room.status === 'finished' && <button className="btn-brass" onClick={() => run('room:rematch', { code: room.code })}>Rövanş</button>}
          <button className="btn-ghost" onClick={leave}>Masadan çık</button>
        </ResultOverlay>
      )}

      <Modal open={chat} onClose={() => setChat(false)} title="Masa sohbeti"><Chat compact /></Modal>
      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Masadan çıkılsın mı?">
        <p className="mb-4 text-fildisi/80">{room.botOnLeave ? 'Yerine bilgisayar oynamaya devam edecek.' : 'Bu masada yedek bot kapalı: çıkarsan oyun herkes için sona erer.'}</p>
        <div className="flex gap-2"><button className="btn-red flex-1" onClick={leave}>Çık</button><button className="btn-ghost flex-1" onClick={() => setConfirmLeave(false)}>Kal</button></div>
      </Modal>
      <RulesModal open={rules} onClose={() => setRules(false)} engineId={room.engineId} name={entry.name} />
      <Toast text={err} onClose={() => setErr(null)} />
    </div>
  );
}
