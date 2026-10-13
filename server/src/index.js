// Grip 'N Rip multiplayer room server (Cloudflare Worker + Durable Objects).
// Safety by construction: the server only understands a fixed set of message types made of small numbers;
// there is no text field anywhere, so chat is impossible even from a modified client. Nothing is stored.
//
//   GET  /new                 -> {code}   creates a private room (6 chars, no look-alikes)
//   GET  /room/<CODE> (WS)    -> join; first message must be {t:'hello', ...}
//   GET  /health              -> ok
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const MAX_PLAYERS = 8, MAX_RATE = 30;          // msgs per second per rider
// preset lists live in the client; the server only checks index ranges
export const LIMITS = { nameA: 32, nameB: 32, emote: 12, skinCat: 6, skinVal: 32, trick: 32, world: 2 };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Cache-Control': 'no-store' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/health') return json({ ok: true });
    if (parts[0] === 'new') {
      for (let tries = 0; tries < 5; tries++) {
        const b = crypto.getRandomValues(new Uint8Array(6)); let code = ''; for (const x of b) code += ALPHA[x % ALPHA.length];
        const r = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room/init', { method: 'POST' });
        if (r.status === 200) return json({ code });
      }
      return json({ error: 'busy' }, 503);
    }
    if (parts[0] === 'room' && parts[1]) {
      const code = parts[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'badcode' }, 400);
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket only' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    return json({ error: 'not found' }, 404);
  }
};

const int = (v, max) => Number.isInteger(v) && v >= 0 && v < max;
const num = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

export class Room {
  constructor(state) { this.state = state; this.inited = false; this.locked = false; this.host = 0; this.nextId = 1; this.world = 0;
    this.players = new Map();   // id -> {ws, name:[a,b], skin:[..], last:{}, tokens, t}
    this.idleTimer = null; }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') { if (this.inited) return new Response('taken', { status: 409 }); this.inited = true; this.armIdle(); return new Response('ok'); }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    server.accept(); this.onSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
  armIdle() { clearTimeout(this.idleTimer); if (this.players.size === 0) this.idleTimer = setTimeout(() => { this.inited = false; this.locked = false; this.host = 0; }, 10 * 60 * 1000); }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch {} }
  bcast(o, except) { const s = JSON.stringify(o); for (const [id, p] of this.players) if (id !== except) { try { p.ws.send(s); } catch {} } }
  onSocket(ws) {
    let me = 0;
    const close = (code, why) => { try { ws.close(code, why); } catch {} };
    if (!this.inited) { this.send(ws, { t: 'err', m: 'noroom' }); close(4004, 'noroom'); return; }
    const hello = setTimeout(() => { if (!me) close(4000, 'no hello'); }, 5000);
    ws.addEventListener('message', ev => {
      if (typeof ev.data !== 'string' || ev.data.length > 400) return close(4001, 'bad');
      let m; try { m = JSON.parse(ev.data); } catch { return close(4001, 'bad'); }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      if (!me) {   // ---- join
        if (m.t !== 'hello') return close(4001, 'bad');
        if (this.players.size >= MAX_PLAYERS) { this.send(ws, { t: 'err', m: 'full' }); return close(4003, 'full'); }
        if (this.locked) { this.send(ws, { t: 'err', m: 'locked' }); return close(4003, 'locked'); }
        const name = Array.isArray(m.name) && m.name.length === 2 && int(m.name[0], LIMITS.nameA) && int(m.name[1], LIMITS.nameB) ? m.name : [0, 0];
        const skin = Array.isArray(m.skin) && m.skin.length === LIMITS.skinCat && m.skin.every(v => int(v, LIMITS.skinVal)) ? m.skin : [0, 0, 0, 0, 0, 0];
        me = this.nextId++; clearTimeout(hello); clearTimeout(this.idleTimer);
        if (this.players.size === 0) { this.host = me; this.world = int(m.world, LIMITS.world) ? m.world : 0; }
        this.players.set(me, { ws, name, skin, last: null, tokens: MAX_RATE, t: Date.now() });
        this.send(ws, { t: 'welcome', id: me, host: this.host, world: this.world, locked: this.locked,
          peers: [...this.players].filter(([id]) => id !== me).map(([id, p]) => ({ id, name: p.name, skin: p.skin, s: p.last })) });
        this.bcast({ t: 'join', id: me, name, skin }, me); return;
      }
      const p = this.players.get(me); if (!p) return;
      const now = Date.now(); p.tokens = Math.min(MAX_RATE, p.tokens + (now - p.t) / 1000 * MAX_RATE); p.t = now;
      if (p.tokens < 1) return; p.tokens -= 1;   // over the rate limit: silently dropped
      switch (m.t) {
        case 's': {   // state: p[3] position, q[4] quaternion, v speed, a air(0/1), k trick, f cadence-ish 0..1
          if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(v => num(v, 20000))) return;
          if (!Array.isArray(m.q) || m.q.length !== 4 || !m.q.every(v => num(v, 1.01))) return;
          const s = { t: 's', id: me, p: m.p.map(v => Math.round(v * 100) / 100), q: m.q.map(v => Math.round(v * 1000) / 1000),
            v: num(m.v, 60) ? Math.round(m.v * 10) / 10 : 0, a: m.a ? 1 : 0, k: int(m.k, LIMITS.trick) ? m.k : 0, f: num(m.f, 1) ? Math.round(m.f * 100) / 100 : 0 };
          p.last = s; this.bcast(s, me); return; }
        case 'e': if (int(m.e, LIMITS.emote)) this.bcast({ t: 'e', id: me, e: m.e }, me); return;
        case 'skin': if (Array.isArray(m.skin) && m.skin.length === LIMITS.skinCat && m.skin.every(v => int(v, LIMITS.skinVal))) { p.skin = m.skin; this.bcast({ t: 'skin', id: me, skin: m.skin }, me); } return;
        case 'lock': if (me === this.host) { this.locked = !!m.on; this.bcast({ t: 'locked', on: this.locked }); } return;
        case 'kick': if (me === this.host && Number.isInteger(m.id) && m.id !== me) { const k = this.players.get(m.id); if (k) { this.send(k.ws, { t: 'kicked' }); try { k.ws.close(4005, 'kicked'); } catch {} this.leave(m.id); } } return;
        case 'ping': this.send(ws, { t: 'pong', c: num(m.c, 1e13) ? m.c : 0 }); return;
        default: return;   // unknown types are ignored
      }
    });
    const bye = () => { clearTimeout(hello); if (me) this.leave(me); me = -1; };
    ws.addEventListener('close', bye); ws.addEventListener('error', bye);
  }
  leave(id) {
    if (!this.players.delete(id)) return;
    this.bcast({ t: 'leave', id });
    if (id === this.host && this.players.size) { this.host = this.players.keys().next().value; this.bcast({ t: 'host', id: this.host }); }
    if (!this.players.size) this.armIdle();
  }
}
