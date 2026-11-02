/**
 * Kart Arenası WebSocket istemcisi (Socket.IO yerine; Cloudflare Workers ile uyumlu).
 * Protokol: istemci → {e, p, i?}; sunucu → {e, p} olay ya da {a: i, r} onay.
 * Olaylar: 'connect', 'disconnect', 'connect_error' ve sunucunun yaydığı tüm olaylar.
 */
type Listener = (payload?: any) => void;
interface Options { WebSocket?: any; reconnect?: boolean }

export class KartSocket {
  connected = false;
  private ws: any = null;
  private listeners = new Map<string, Set<Listener>>();
  private acks = new Map<number, (r: any) => void>();
  private seq = 0;
  private stopped = false;
  private authFailed = false;
  private retry = 0;
  private pinger: ReturnType<typeof setInterval> | null = null;

  constructor(private baseUrl: string, private token: string, private opts: Options = {}) {
    this.open();
  }

  private open() {
    const W = this.opts.WebSocket ?? (globalThis as any).WebSocket;
    const url = this.baseUrl.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/ws?token=' + encodeURIComponent(this.token);
    let ws: any;
    try { ws = new W(url); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onmessage = (ev: any) => {
      let m: any;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      if (m.a !== undefined) { const f = this.acks.get(m.a); this.acks.delete(m.a); f?.(m.r); return; }
      if (m.e === 'hello') {
        this.connected = true;
        this.retry = 0;
        this.pinger = setInterval(() => this.emit('ping', {}), 25_000);
        this.fire('connect');
        return;
      }
      if (m.e === 'connect_error') { this.authFailed = true; this.fire('connect_error', new Error(m.p)); return; }
      this.fire(m.e, m.p);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const was = this.connected;
      this.connected = false;
      if (this.pinger) clearInterval(this.pinger);
      this.pinger = null;
      for (const f of this.acks.values()) f({ ok: false, error: 'Bağlantı koptu' });
      this.acks.clear();
      if (was) this.fire('disconnect');
      else if (!this.authFailed) this.fire('connect_error', new Error('Sunucuya ulaşılamıyor'));
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose ardından gelir */ };
  }

  private scheduleReconnect() {
    if (this.stopped || this.authFailed || this.opts.reconnect === false) return;
    const delay = Math.min(5000, 500 * 2 ** this.retry++);
    setTimeout(() => { if (!this.stopped) this.open(); }, delay);
  }

  private fire(e: string, p?: any) { for (const f of this.listeners.get(e) ?? []) f(p); }

  on(e: string, f: Listener) {
    let s = this.listeners.get(e);
    if (!s) this.listeners.set(e, (s = new Set()));
    s.add(f);
    return this;
  }

  emit(e: string, p?: unknown, ack?: (r: any) => void) {
    if (!this.connected || !this.ws) { ack?.({ ok: false, error: 'Sunucuya bağlı değilsiniz' }); return; }
    const msg: any = { e, p };
    if (ack) { msg.i = ++this.seq; this.acks.set(msg.i, ack); }
    try { this.ws.send(JSON.stringify(msg)); } catch { if (ack) { this.acks.delete(msg.i); ack({ ok: false, error: 'Gönderilemedi' }); } }
  }

  close() {
    this.stopped = true;
    if (this.pinger) clearInterval(this.pinger);
    try { this.ws?.close(); } catch { /* */ }
    this.connected = false;
  }
}
