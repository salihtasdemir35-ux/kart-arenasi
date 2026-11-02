import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { registerDictionary } from '@kart/engine';
import { createHub, type ServerOptions } from './hub';
import type { Persister } from './store';

export { serverRng, type ServerOptions } from './hub';

/** Dosyaya kaydeden depo (geçici dosya + yeniden adlandırma ile güvenli yazım). */
function filePersister(file: string): Persister {
  const write = (data: any) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return { load: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null), save: write, flush: write };
}

/** Node.js sunucusu: Express (API + web uygulaması) ve WebSocket (/ws) üzerinde aynı oyun çekirdeği. */
export function createKartServer(opts: ServerOptions = {}) {
  const readDict = (lang: 'tr' | 'en') => {
    const f = opts.dictDir ? path.join(opts.dictDir, `${lang}.txt`) : null;
    return f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : null;
  };
  for (const lang of ['tr', 'en'] as const) { const w = readDict(lang); if (w) registerDictionary(lang, w); }
  const hub = createHub({ ...opts, persister: opts.dataFile ? filePersister(opts.dataFile) : null, dictLoader: async (lang) => readDict(lang) });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.all(/^\/api\//, async (req, res) => {
    const r = await hub.api(req.method, req.path, req.body, req.ip ?? 'x');
    res.status(r.status).json(r.body);
  });
  if (opts.clientDist && fs.existsSync(opts.clientDist)) {
    app.use(express.static(opts.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(path.join(opts.clientDist!, 'index.html')));
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 50_000 });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url ?? '/', 'http://x').searchParams.get('token');
    const conn = hub.connect(token, { send: (t) => { if (ws.readyState === ws.OPEN) ws.send(t); }, close: (c, r) => ws.close(c, r) });
    if (!conn) return;
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (d) => conn.receive(String(d)));
    ws.on('close', () => conn.disconnect());
    ws.on('error', () => conn.disconnect());
  });
  // Ölü bağlantıları yakala (telefon uykuya geçti, ağ koptu…)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) { ws.terminate(); continue; }
      alive.set(ws, false);
      try { ws.ping(); } catch { /* */ }
    }
  }, 15_000);

  return {
    app, store: hub.store, rooms: hub.rooms, hub,
    listen(port = opts.port ?? 3000) {
      return new Promise<number>((resolve) => server.listen(port, () => resolve((server.address() as any).port)));
    },
    async close() {
      clearInterval(heartbeat);
      hub.close();
      wss.close();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
