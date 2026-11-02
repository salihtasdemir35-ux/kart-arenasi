/**
 * Kart Arenası — Cloudflare Workers sunucusu (ücretsiz plan, kart gerektirmez).
 * - Worker: /api/* ve /ws isteklerini tek bir Durable Object'e yönlendirir, diğer her şey için web uygulamasını sunar.
 * - KartHub (Durable Object): Node sürümüyle aynı oyun çekirdeğini çalıştırır; hesapları kalıcı depoda saklar.
 */
import { createHub } from '../../server/src/hub';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

export class KartHub {
  private hub: ReturnType<typeof createHub> | null = null;

  constructor(private state: any, private env: any) {
    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get('db');
      const persist = (data: any) => { state.storage.put('db', JSON.stringify(data)); };
      this.hub = createHub({
        persister: { load: () => (saved ? JSON.parse(saved) : null), save: persist, flush: persist },
        dictLoader: async (lang) => {
          const r = await env.ASSETS.fetch(new Request(`https://assets.local/dict/${lang}.txt`));
          return r.ok ? (await r.text()).split('\n') : null;
        },
      });
    });
  }

  async fetch(req: Request): Promise<Response> {
    const hub = this.hub!;
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket bekleniyor', { status: 426 });
      const pair = new (globalThis as any).WebSocketPair();
      const [client, server] = Object.values(pair) as any[];
      server.accept();
      const conn = hub.connect(url.searchParams.get('token'), {
        send: (t) => { try { server.send(t); } catch { /* kapalı */ } },
        close: (c, r) => { try { server.close(c, r); } catch { /* */ } },
      });
      if (conn) {
        server.addEventListener('message', (e: any) => conn.receive(typeof e.data === 'string' ? e.data : ''));
        server.addEventListener('close', () => conn.disconnect());
        server.addEventListener('error', () => conn.disconnect());
      }
      return new Response(null, { status: 101, webSocket: client } as any);
    }
    let body: any = {};
    if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
    const r = await hub.api(req.method, url.pathname, body, req.headers.get('CF-Connecting-IP') ?? 'x');
    return json(r.status, r.body);
  }
}

export default {
  async fetch(req: Request, env: any): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
      const stub = env.HUB.get(env.HUB.idFromName('ana-salon'));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
