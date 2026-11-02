/**
 * Socket.IO'nun bu projede kullanılan küçük alt kümesi: odalar, yayın, onaylı mesajlar.
 * Taşıma bağımsızdır: Node'da `ws`, Cloudflare'de Durable Object WebSocket'leri kullanır.
 * Tel protokolü (JSON): istemci → {e, p, i?}; sunucu → {e, p} olay ya da {a: i, r} onay.
 */
export interface Transport { send(text: string): void; close(code: number, reason: string): void }
type Handler = (payload: any, ack?: (r: any) => void) => void;

export class Conn {
  data: Record<string, any> = {};
  private handlers = new Map<string, Handler>();
  private rooms = new Set<string>();
  private alive = true;
  constructor(private io: MiniIO, private t: Transport) {}
  join(room: string) { this.rooms.add(room); this.io._add(room, this); }
  leave(room: string) { this.rooms.delete(room); this.io._remove(room, this); }
  emit(e: string, p?: unknown) { this.raw(JSON.stringify({ e, p })); }
  on(e: string, fn: Handler) { this.handlers.set(e, fn); }
  raw(text: string) { if (this.alive) { try { this.t.send(text); } catch { /* kopmuş */ } } }
  receive(text: string) {
    let m: any;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.e !== 'string' || m.e === 'disconnect') return;
    const ack = Number.isInteger(m.i) ? (r: any) => this.raw(JSON.stringify({ a: m.i, r })) : undefined;
    const h = this.handlers.get(m.e);
    if (h) h(m.p, ack);
    else ack?.({ ok: false, error: 'Bilinmeyen işlem' });
  }
  /** Taşıma kapandığında çağrılır. */
  disconnect() {
    if (!this.alive) return;
    this.alive = false;
    for (const r of this.rooms) this.io._remove(r, this);
    this.rooms.clear();
    this.io.conns.delete(this);
    this.handlers.get('disconnect')?.(undefined);
  }
  close(code = 1000, reason = '') { try { this.t.close(code, reason); } catch { /* */ } this.disconnect(); }
}

export class MiniIO {
  conns = new Set<Conn>();
  private rooms = new Map<string, Set<Conn>>();
  create(t: Transport) { const c = new Conn(this, t); this.conns.add(c); return c; }
  to(room: string) {
    return { emit: (e: string, p?: unknown) => { const msg = JSON.stringify({ e, p }); for (const c of this.rooms.get(room) ?? []) c.raw(msg); } };
  }
  _add(room: string, c: Conn) { let s = this.rooms.get(room); if (!s) this.rooms.set(room, (s = new Set())); s.add(c); }
  _remove(room: string, c: Conn) { const s = this.rooms.get(room); if (s) { s.delete(c); if (!s.size) this.rooms.delete(room); } }
  closeAll() { for (const c of [...this.conns]) c.close(1001, 'Sunucu kapanıyor'); }
}
