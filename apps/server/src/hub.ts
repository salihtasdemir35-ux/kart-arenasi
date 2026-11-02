import { randomInt, randomHex, hashSecret, safeEqual } from './portable';
import { MiniIO, type Conn, type Transport } from './mini-io';
import { CATALOG, getModule, IllegalMoveError, registerDictionary, hasDictionary, type Difficulty, type GameModule, type Rng } from '@kart/engine';
import { Store, profileOf, publicUser, AVATARS, type User, type Persister } from './store';

/** Sunucu tarafı kriptografik güvenli rastgelelik: kart dağıtımı, karıştırma, çekiş. */
export const serverRng: Rng = { int: (n) => randomInt(n) };

export interface ServerOptions {
  port?: number;
  dataFile?: string | null;
  clientDist?: string | null;
  botDelayMs?: number;
  graceMs?: number;
  /** Oyun saatinde bir dakikanın ms karşılığı (yalnızca testlerde kısaltılır). */
  msPerMinute?: number;
  /** Soket başına 5 saniyede izin verilen olay sayısı. */
  rateLimit?: number;
  /** IP başına dakikada izin verilen giriş/kayıt denemesi. */
  authLimit?: number;
  /** Scrabble sözlüklerinin (tr.txt, en.txt) bulunduğu klasör. */
  dictDir?: string | null;
}

interface Seat {
  userId: string | null;
  name: string;
  avatar: string;
  bot: boolean;
  /** Oyuncu ayrıldığı için bot devraldı. */
  takenOver: boolean;
  difficulty: Difficulty;
  ready: boolean;
  connected: boolean;
}

interface ChatMsg { from: string; name: string; text: string; at: number }

interface Room {
  code: string;
  gameId: string;
  engineId: string;
  module: GameModule;
  options: Record<string, unknown>;
  hostId: string;
  passSalt: string | null;
  passHash: string | null;
  seats: Seat[];
  spectators: Set<string>;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned';
  state: any;
  chat: ChatMsg[];
  botOnLeave: boolean;
  allowSpectators: boolean;
  turnSeconds: number;
  turnDeadline: number | null;
  /** Oyun saati (satranç/tavla): koltuk başına kalan ms; null = saat yok. */
  clock: { ms: number[]; seat: number | null; since: number } | null;
  clockMinutes: number;
  timers: { bot?: ReturnType<typeof setTimeout>; turn?: ReturnType<typeof setTimeout>; clock?: ReturnType<typeof setTimeout>; grace: Map<string, ReturnType<typeof setTimeout>> };
  result: any;
  createdAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QUICK = ['Merhaba!', 'İyi oyunlar', 'Tebrikler!', 'Çok iyiydi 👏', 'Hadi bakalım', 'Bir dakika lütfen', 'Rövanş?', 'Teşekkürler'];

const hashPass = (p: string, salt: string) => hashSecret(p, salt, 5000);

export interface HubOptions extends Omit<ServerOptions, 'port' | 'dataFile' | 'clientDist' | 'dictDir'> {
  persister?: Persister | null;
  /** Scrabble sözlüğü gerektiğinde yüklenir (Node: dosya, Cloudflare: statik dosya). */
  dictLoader?: (lang: 'tr' | 'en') => Promise<string[] | null>;
}
export interface ApiResult { status: number; body: unknown }

/** Taşımadan bağımsız oyun sunucusu çekirdeği: hesaplar, arkadaşlar, odalar, oyunlar. */
export function createHub(opts: HubOptions = {}) {
  const botDelay = opts.botDelayMs ?? 700;
  const grace = opts.graceMs ?? 60_000;
  const msPerMinute = opts.msPerMinute ?? 60_000;
  const rateLimit = opts.rateLimit ?? 40;
  const store = new Store(opts.persister ?? null);
  const io = new MiniIO();

  // Giriş denemeleri için IP başına hız sınırı
  const authHits = new Map<string, number[]>();
  const authLimited = (ip: string) => {
    const now = Date.now();
    const arr = (authHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    arr.push(now);
    authHits.set(ip, arr);
    return arr.length > (opts.authLimit ?? 20);
  };
  /** HTTP API: /api/register, /api/login, /api/guest, /api/health */
  async function api(method: string, path: string, body: any, ip: string): Promise<ApiResult> {
    if (method === 'GET' && path === '/api/health') return { status: 200, body: { ok: true, name: 'Kart Arenası', rooms: rooms.size } };
    const routes: Record<string, (b: any) => unknown> = {
      '/api/register': (b) => store.register(b.username, b.password),
      '/api/login': (b) => store.login(b.username, b.password),
      '/api/guest': () => store.guest(),
    };
    const fn = method === 'POST' ? routes[path] : undefined;
    if (!fn) return { status: 404, body: { error: 'Bulunamadı' } };
    if (authLimited(ip || 'x')) return { status: 429, body: { error: 'Çok fazla deneme. Bir dakika sonra tekrar deneyin.' } };
    try { return { status: 200, body: await fn(body ?? {}) }; } catch (e: any) { return { status: 400, body: { error: e.message } }; }
  }

  const rooms = new Map<string, Room>();
  const online = new Map<string, number>(); // userId -> bağlı bağlantı sayısı

  const newCode = () => {
    let c = '';
    do { c = ''; for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]; } while (rooms.has(c));
    return c;
  };

  const roomOfUser = (uid: string) => [...rooms.values()].find((r) => (r.status === 'lobby' || r.status === 'playing') && r.seats.some((s) => s.userId === uid && !s.takenOver));

  function roomInfo(r: Room) {
    return {
      code: r.code, gameId: r.gameId, engineId: r.engineId, options: r.options, hostId: r.hostId, hasPassword: !!r.passHash,
      status: r.status, botOnLeave: r.botOnLeave, allowSpectators: r.allowSpectators, turnSeconds: r.turnSeconds,
      turnDeadline: r.turnDeadline, clockMinutes: r.clockMinutes,
      clock: r.clock ? { ms: r.clock.ms.map((m, i) => (i === r.clock!.seat ? m - (Date.now() - r.clock!.since) : m)), seat: r.clock.seat } : null,
      seats: r.seats.map((s) => ({ userId: s.userId, name: s.name, avatar: s.avatar, bot: s.bot, takenOver: s.takenOver, difficulty: s.difficulty, ready: s.ready, connected: s.connected })),
      spectators: [...r.spectators].map((id) => store.users.get(id)?.username ?? '?'),
      chat: r.chat.slice(-50), result: r.result, quick: QUICK,
    };
  }

  function broadcast(r: Room) {
    io.to('room:' + r.code).emit('room:update', roomInfo(r));
    if (!r.state) return;
    r.seats.forEach((s, i) => {
      if (s.userId && !s.takenOver) io.to('user:' + s.userId).emit('game:state', { code: r.code, seat: i, view: r.module.view(r.state, i) });
    });
    for (const id of r.spectators) io.to('user:' + id).emit('game:state', { code: r.code, seat: null, view: r.module.view(r.state, null) });
  }

  function finish(r: Room) {
    clearTimeout(r.timers.turn);
    clearTimeout(r.timers.clock);
    if (r.clock) { chargeClock(r); r.clock.seat = null; }
    r.turnDeadline = null;
    r.status = 'finished';
    const res = r.module.result(r.state)!;
    r.result = res;
    r.seats.forEach((s, i) => {
      if (s.userId && !s.takenOver) store.recordMatch(s.userId, r.gameId, res.winners.includes(i), res.summary);
    });
  }

  function seatControlledByBot(s: Seat) { return s.bot || s.takenOver; }

  /** Hamle yapan oyuncunun saatinden geçen süreyi düşer. */
  function chargeClock(r: Room) {
    if (!r.clock || r.clock.seat === null) return;
    r.clock.ms[r.clock.seat] -= Date.now() - r.clock.since;
    r.clock.since = Date.now();
  }

  function step(r: Room) {
    clearTimeout(r.timers.bot);
    clearTimeout(r.timers.turn);
    clearTimeout(r.timers.clock);
    r.turnDeadline = null;
    if (r.status !== 'playing') return;
    if (r.module.isOver(r.state)) { finish(r); return; }
    // Aynı anda birden çok oyuncunun sırası olabilir (ör. Amiral Battı yerleştirme): önce botlar oynasın
    const acting = r.module.toAct(r.state);
    const seat = acting.find((p) => seatControlledByBot(r.seats[p])) ?? acting[0];
    if (r.clock) {
      r.clock.seat = seat;
      r.clock.since = Date.now();
      r.timers.clock = setTimeout(() => {
        if (r.status !== 'playing' || !r.module.resign) return;
        r.clock!.ms[seat] = 0;
        r.state = r.module.resign(r.state, seat, 'Süresi bitti');
        finish(r);
        broadcast(r);
      }, Math.max(0, r.clock.ms[seat]));
    }
    const s = r.seats[seat];
    if (seatControlledByBot(s)) {
      r.timers.bot = setTimeout(() => {
        if (r.status !== 'playing') return;
        try {
          const a = r.module.ai(r.module.view(r.state, seat), seat, s.difficulty, serverRng);
          doAction(r, seat, a);
        } catch (e) {
          console.error('Bot hamlesi başarısız', r.code, e);
        }
      }, botDelay);
    } else if (r.turnSeconds > 0) {
      r.turnDeadline = Date.now() + r.turnSeconds * 1000;
      r.timers.turn = setTimeout(() => {
        if (r.status !== 'playing') return;
        // Süre doldu: sistem oyuncu adına otomatik hamle yapar
        try {
          doAction(r, seat, r.module.ai(r.module.view(r.state, seat), seat, 'kolay', serverRng));
        } catch (e) {
          console.error('Süre aşımı hamlesi başarısız', r.code, e);
        }
      }, r.turnSeconds * 1000);
    }
  }

  function doAction(r: Room, seat: number, action: unknown) {
    chargeClock(r);
    r.state = r.module.apply(r.state, seat, action, serverRng);
    if (r.module.isOver(r.state)) finish(r);
    else step(r);
    broadcast(r);
  }

  function startGame(r: Room) {
    r.state = r.module.setup({ players: r.seats.length, options: r.options }, serverRng);
    r.status = 'playing';
    r.result = null;
    r.clock = r.clockMinutes > 0 && r.module.resign ? { ms: r.seats.map(() => r.clockMinutes * msPerMinute), seat: null, since: Date.now() } : null;
    step(r);
    broadcast(r);
  }

  function leaveSeat(r: Room, uid: string) {
    const i = r.seats.findIndex((s) => s.userId === uid && !s.takenOver);
    if (i < 0) return;
    const s = r.seats[i];
    clearTimeout(r.timers.grace.get(uid));
    r.timers.grace.delete(uid);
    if (r.status === 'lobby') {
      r.seats[i] = emptySeat();
    } else if (r.status === 'playing') {
      if (r.botOnLeave) {
        s.takenOver = true;
        s.connected = false;
        s.name = `${s.name} (bot)`;
        s.difficulty = 'orta';
        step(r);
      } else {
        r.status = 'abandoned';
        clearTimeout(r.timers.bot);
        clearTimeout(r.timers.turn);
        r.result = { winners: [], scores: [], summary: `${s.name} oyundan ayrıldı, oyun sona erdi` };
      }
    } else {
      r.seats[i] = emptySeat();
    }
    if (r.hostId === uid) {
      const next = r.seats.find((x) => x.userId && !x.takenOver && !x.bot && x.userId !== uid);
      if (next) r.hostId = next.userId!;
    }
    const humansLeft = r.seats.some((x) => x.userId && !x.takenOver && !x.bot);
    if (!humansLeft && r.spectators.size === 0) { closeRoom(r); return; }
    broadcast(r);
  }

  function closeRoom(r: Room) {
    clearTimeout(r.timers.bot);
    clearTimeout(r.timers.turn);
    clearTimeout(r.timers.clock);
    r.timers.grace.forEach((t) => clearTimeout(t));
    rooms.delete(r.code);
  }

  const emptySeat = (): Seat => ({ userId: null, name: 'Boş', avatar: '', bot: false, takenOver: false, difficulty: 'orta', ready: false, connected: false });
  const botSeat = (d: Difficulty, i: number): Seat => ({ userId: null, name: `Bilgisayar ${i + 1}`, avatar: '🤖', bot: true, takenOver: false, difficulty: d, ready: true, connected: true });

  function friendsPayload(u: User) {
    return {
      friends: u.friends.map((id) => store.users.get(id)).filter(Boolean).map((f) => ({ ...publicUser(f!), online: (online.get(f!.id) ?? 0) > 0, inRoom: roomOfUser(f!.id)?.code ?? null })),
      incoming: u.incoming.map((id) => store.users.get(id)).filter(Boolean).map((f) => publicUser(f!)),
    };
  }
  const notifyFriends = (u: User) => { for (const f of u.friends) io.to('user:' + f).emit('friends:changed'); };

  /** Yeni bir bağlantıyı doğrular ve kabul eder; oturum geçersizse kapatır. */
  function connect(token: string | null, t: Transport): Conn | null {
    const u = store.userByToken(token);
    if (!u) {
      try { t.send(JSON.stringify({ e: 'connect_error', p: 'Oturum geçersiz' })); t.close(4001, 'Oturum geçersiz'); } catch { /* */ }
      return null;
    }
    const socket = io.create(t);
    socket.data.uid = u.id;
    onConnection(socket);
    socket.emit('hello', { user: publicUser(u) });
    return socket;
  }

  function onConnection(socket: Conn) {
    const uid: string = socket.data.uid;
    const me = () => store.users.get(uid)!;
    socket.join('user:' + uid);
    online.set(uid, (online.get(uid) ?? 0) + 1);
    notifyFriends(me());

    // Hız sınırı: 5 saniyede en fazla 40 olay
    let bucket: number[] = [];
    const limited = () => {
      const now = Date.now();
      bucket = bucket.filter((t) => now - t < 5000);
      bucket.push(now);
      return bucket.length > rateLimit;
    };

    const on = (ev: string, fn: (p: any) => unknown) => {
      socket.on(ev, async (payload: any, ack?: (r: any) => void) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (limited()) return reply({ ok: false, error: 'Çok hızlı işlem yapıyorsunuz, biraz bekleyin' });
        try {
          const data = await fn(payload ?? {});
          reply({ ok: true, ...(data && typeof data === 'object' ? data : {}) });
        } catch (e: any) {
          reply({ ok: false, error: e instanceof IllegalMoveError || e instanceof Error ? e.message : 'Hata' });
        }
      });
    };

    // Yeniden bağlanma: kullanıcının aktif masası varsa geri oturt
    const existing = roomOfUser(uid);
    if (existing) {
      const seat = existing.seats.find((s) => s.userId === uid)!;
      seat.connected = true;
      clearTimeout(existing.timers.grace.get(uid));
      existing.timers.grace.delete(uid);
      socket.join('room:' + existing.code);
      broadcast(existing);
    }
    for (const r of rooms.values()) if (r.spectators.has(uid)) socket.join('room:' + r.code);

    // İstemci bağlandığında (veya yeniden bağlandığında) güncel masa ve oyun durumunu ister
    on('room:sync', () => {
      const r = roomOfUser(uid) ?? [...rooms.values()].find((x) => x.spectators.has(uid) || x.seats.some((s) => s.userId === uid && !s.takenOver));
      if (!r) return { code: null };
      socket.join('room:' + r.code);
      socket.emit('room:update', roomInfo(r));
      if (r.state) {
        const seat = r.seats.findIndex((s) => s.userId === uid && !s.takenOver);
        socket.emit('game:state', { code: r.code, seat: seat >= 0 ? seat : null, view: r.module.view(r.state, seat >= 0 ? seat : null) });
      }
      return { code: r.code };
    });

    on('me', () => ({ user: publicUser(me()), room: roomOfUser(uid)?.code ?? null }));
    on('profile:get', (p) => {
      const u = p.userId ? store.users.get(String(p.userId)) : me();
      if (!u) throw new Error('Kullanıcı bulunamadı');
      return { profile: profileOf(u) };
    });
    on('profile:avatar', (p) => {
      if (!AVATARS.includes(p.avatar)) throw new Error('Geçersiz avatar');
      me().avatar = p.avatar;
      store.save();
      return { user: publicUser(me()) };
    });

    on('room:create', async (p) => {
      if (roomOfUser(uid)) throw new Error('Zaten bir masadasınız. Önce ondan çıkın.');
      const entry = CATALOG.find((c) => c.id === p.gameId);
      if (!entry || !entry.playable) throw new Error('Bu oyun henüz hazır değil');
      const engineId = entry.engine ?? entry.id;
      const module = getModule(engineId)!;
      const lang = (entry.presetOptions as any)?.lang;
      if (engineId === 'scrabble' && !hasDictionary(lang)) {
        const words = opts.dictLoader ? await opts.dictLoader(lang) : null;
        if (words) registerDictionary(lang, words);
        if (!hasDictionary(lang)) throw new Error('Sözlük sunucuda yüklü değil');
      }
      const players = Number(entry.presetPlayers ?? p.players ?? module.playerCounts[0]);
      if (!module.playerCounts.includes(players)) throw new Error(`Bu oyun ${module.playerCounts.join(', ')} kişiyle oynanır`);
      const bots = Math.max(0, Math.min(players - 1, Number(p.bots ?? 0) | 0));
      const options: Record<string, unknown> = { ...(entry.presetOptions ?? {}) };
      for (const o of module.options) {
        if (entry.presetOptions && o.key in entry.presetOptions) continue;
        const v = p.options?.[o.key];
        options[o.key] = o.choices.some((c) => c.value === v) ? v : o.default;
      }
      if (engineId === 'scrabble') options.learning = false; // online maçta ipucu yok
      const diff: Difficulty = ['kolay', 'orta', 'zor'].includes(p.difficulty) ? p.difficulty : 'orta';
      const u = me();
      const seats: Seat[] = Array.from({ length: players }, (_, i) => (i >= players - bots ? botSeat(diff, i) : emptySeat()));
      seats[0] = { userId: uid, name: u.username, avatar: u.avatar, bot: false, takenOver: false, difficulty: 'orta', ready: true, connected: true };
      let passSalt: string | null = null;
      let passHash: string | null = null;
      if (typeof p.password === 'string' && p.password.length) {
        if (p.password.length > 40) throw new Error('Şifre çok uzun');
        passSalt = randomHex(8);
        passHash = await hashPass(p.password, passSalt);
      }
      const r: Room = {
        code: newCode(), gameId: entry.id, engineId, module, options, hostId: uid, passSalt, passHash, seats,
        spectators: new Set(), status: 'lobby', state: null, chat: [], botOnLeave: p.botOnLeave !== false,
        allowSpectators: p.allowSpectators !== false, turnSeconds: [0, 20, 30, 60].includes(Number(p.turnSeconds)) ? Number(p.turnSeconds) : 0,
        turnDeadline: null, clock: null, clockMinutes: [0, 3, 5, 10, 15].includes(Number(p.clockMinutes)) && module.resign ? Number(p.clockMinutes) : 0,
        timers: { grace: new Map() }, result: null, createdAt: Date.now(),
      };
      rooms.set(r.code, r);
      socket.join('room:' + r.code);
      broadcast(r);
      return { code: r.code };
    });

    on('room:join', async (p) => {
      const code = String(p.code ?? '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) throw new Error('Bu kodla açık masa bulunamadı');
      const mySeat = r.seats.findIndex((s) => s.userId === uid && !s.takenOver);
      if (mySeat >= 0) { socket.join('room:' + code); r.seats[mySeat].connected = true; broadcast(r); return { code, seat: mySeat }; }
      const other = roomOfUser(uid);
      if (other) throw new Error('Zaten başka bir masadasınız. Önce ondan çıkın.');
      if (r.passHash) {
        const ok = typeof p.password === 'string' && safeEqual(await hashPass(p.password, r.passSalt!), r.passHash);
        if (!ok) throw new Error('Masa şifresi hatalı');
      }
      const free = r.seats.findIndex((s) => !s.userId && !s.bot);
      if (!p.spectate && r.status === 'lobby' && free >= 0) {
        const u = me();
        r.seats[free] = { userId: uid, name: u.username, avatar: u.avatar, bot: false, takenOver: false, difficulty: 'orta', ready: false, connected: true };
        socket.join('room:' + code);
        broadcast(r);
        return { code, seat: free };
      }
      if (!r.allowSpectators) throw new Error('Masa dolu ve seyirci kabul etmiyor');
      r.spectators.add(uid);
      socket.join('room:' + code);
      broadcast(r);
      return { code, seat: null };
    });

    const myRoom = () => {
      const r = roomOfUser(uid);
      if (!r) throw new Error('Bir masada değilsiniz');
      return r;
    };

    on('room:leave', (p) => {
      const code = String(p.code ?? '');
      const r = rooms.get(code) ?? roomOfUser(uid);
      if (!r) return {};
      socket.leave('room:' + r.code);
      if (r.spectators.delete(uid)) { broadcast(r); return {}; }
      leaveSeat(r, uid);
      return {};
    });

    on('room:ready', (p) => {
      const r = myRoom();
      if (r.status !== 'lobby') throw new Error('Oyun zaten başladı');
      r.seats.find((s) => s.userId === uid)!.ready = !!p.ready;
      broadcast(r);
    });

    on('room:seat', (p) => {
      const r = myRoom();
      if (r.hostId !== uid) throw new Error('Bunu yalnızca masa sahibi yapabilir');
      if (r.status !== 'lobby') throw new Error('Oyun başladıktan sonra koltuk değiştirilemez');
      const i = Number(p.index);
      const s = r.seats[i];
      if (!s || s.userId) throw new Error('Bu koltuk değiştirilemez');
      const d: Difficulty = ['kolay', 'orta', 'zor'].includes(p.difficulty) ? p.difficulty : 'orta';
      r.seats[i] = p.bot ? botSeat(d, i) : emptySeat();
      broadcast(r);
    });

    on('room:start', () => {
      const r = myRoom();
      if (r.hostId !== uid) throw new Error('Oyunu yalnızca masa sahibi başlatabilir');
      if (r.status !== 'lobby') throw new Error('Oyun zaten başladı');
      if (r.seats.some((s) => !s.userId && !s.bot)) throw new Error('Boş koltuk var: arkadaş davet edin ya da bilgisayar ekleyin');
      if (r.seats.some((s) => s.userId && !s.ready)) throw new Error('Tüm oyuncular hazır olmalı');
      startGame(r);
    });

    on('room:rematch', (p) => {
      const r = rooms.get(String(p.code ?? ''));
      if (!r || r.status !== 'finished') throw new Error('Rövanş için biten bir oyun gerekli');
      if (r.hostId !== uid) throw new Error('Rövanşı masa sahibi başlatır');
      r.seats.forEach((s, i) => { if (s.takenOver) r.seats[i] = botSeat(s.difficulty, i); });
      if (r.seats.some((s) => !s.userId && !s.bot)) throw new Error('Bir oyuncu masadan ayrıldı, rövanş için yeni masa açın');
      startGame(r);
    });

    on('game:action', (p) => {
      const r = myRoom();
      if (r.status !== 'playing') throw new Error('Oyun devam etmiyor');
      const seat = r.seats.findIndex((s) => s.userId === uid && !s.takenOver);
      if (p.action?.type === 'resign') {
        if (!r.module.resign) throw new Error('Bu oyunda teslim olunamaz');
        chargeClock(r);
        r.state = r.module.resign(r.state, seat, 'Teslim oldu');
        finish(r);
        broadcast(r);
        return;
      }
      if (!r.module.toAct(r.state).includes(seat)) throw new IllegalMoveError('Sıra sizde değil');
      doAction(r, seat, p.action);
    });

    on('chat:send', (p) => {
      const code = String(p.code ?? '');
      const r = rooms.get(code);
      if (!r || !(r.seats.some((s) => s.userId === uid) || r.spectators.has(uid))) throw new Error('Bu masada değilsiniz');
      const text = String(p.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
      if (!text) throw new Error('Boş mesaj');
      r.chat.push({ from: uid, name: me().username, text, at: Date.now() });
      r.chat = r.chat.slice(-100);
      io.to('room:' + r.code).emit('room:update', roomInfo(r));
    });

    on('friends:list', () => friendsPayload(me()));
    on('friends:request', (p) => {
      const target = store.byName(String(p.username ?? ''));
      const u = me();
      if (!target) throw new Error('Bu kullanıcı adı bulunamadı');
      if (target.id === uid) throw new Error('Kendinizi ekleyemezsiniz');
      if (u.friends.includes(target.id)) throw new Error('Zaten arkadaşsınız');
      if (u.incoming.includes(target.id)) {
        // Karşı taraf zaten istek göndermiş: doğrudan kabul et
        u.incoming = u.incoming.filter((x) => x !== target.id);
        u.friends.push(target.id);
        target.friends.push(uid);
      } else if (!target.incoming.includes(uid)) target.incoming.push(uid);
      store.save();
      io.to('user:' + target.id).emit('friends:changed');
      return friendsPayload(u);
    });
    on('friends:accept', (p) => {
      const u = me();
      const id = String(p.userId ?? '');
      const other = store.users.get(id);
      if (!other || !u.incoming.includes(id)) throw new Error('Arkadaşlık isteği bulunamadı');
      u.incoming = u.incoming.filter((x) => x !== id);
      if (p.accept !== false) {
        u.friends.push(id);
        other.friends.push(uid);
      }
      store.save();
      io.to('user:' + id).emit('friends:changed');
      return friendsPayload(u);
    });
    on('friends:remove', (p) => {
      const u = me();
      const id = String(p.userId ?? '');
      u.friends = u.friends.filter((x) => x !== id);
      const o = store.users.get(id);
      if (o) o.friends = o.friends.filter((x) => x !== uid);
      store.save();
      io.to('user:' + id).emit('friends:changed');
      return friendsPayload(u);
    });
    on('friends:invite', (p) => {
      const u = me();
      const id = String(p.userId ?? '');
      if (!u.friends.includes(id)) throw new Error('Yalnızca arkadaşlarınızı davet edebilirsiniz');
      const r = roomOfUser(uid);
      if (!r) throw new Error('Önce bir masa açın');
      const entry = CATALOG.find((c) => c.id === r.gameId)!;
      io.to('user:' + id).emit('invite', { from: publicUser(u), code: r.code, gameName: entry.name });
    });

    on('ping', () => ({}));

    socket.on('disconnect', () => {
      const left = (online.get(uid) ?? 1) - 1;
      if (left > 0) { online.set(uid, left); return; }
      online.delete(uid);
      notifyFriends(me());
      const r = roomOfUser(uid);
      if (!r) return;
      const seat = r.seats.find((s) => s.userId === uid)!;
      seat.connected = false;
      broadcast(r);
      clearTimeout(r.timers.grace.get(uid));
      r.timers.grace.set(uid, setTimeout(() => {
        r.timers.grace.delete(uid);
        if ((online.get(uid) ?? 0) === 0 && rooms.has(r.code)) leaveSeat(r, uid);
      }, grace));
    });
  }

  // Uzun süre boş kalan bitmiş masaları temizle
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      const anyoneOnline = r.seats.some((s) => s.userId && (online.get(s.userId) ?? 0) > 0) || [...r.spectators].some((id) => (online.get(id) ?? 0) > 0);
      if (!anyoneOnline && now - r.createdAt > 10 * 60_000) closeRoom(r);
    }
  }, 60_000);

  return {
    io, store, rooms, api, connect,
    close() {
      clearInterval(sweeper);
      for (const r of rooms.values()) closeRoom(r);
      io.closeAll();
      store.flush();
    },
  };
}
