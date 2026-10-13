// Cloud save + leaderboards client. Local-first: everything lives in localStorage as before; the cloud copy is synced
// (debounced) when online and merged so owned items / unlocks / best times are never lost. The only text a player can
// type is a save code. Leaderboard names are the preset rider names.
import { MP_SERVER, NAME_A, NAME_B } from './net.js';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const fmtCode = c => (c || '').match(/.{1,4}/g)?.join('-') || '';
export const cleanSaveCode = s => (s || '').toUpperCase().split('').filter(c => ALPHA.includes(c)).join('').slice(0, 16);
const J = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const SETJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const CATS = [
  {id:'time',   label:'Fastest time',              per:'trail', fmt:v => `${Math.floor(v/60)}:${(v%60).toFixed(2).padStart(5,'0')}`},
  {id:'combo',  label:'Trick combo in one run',     per:'trail', fmt:v => `$${Math.round(v).toLocaleString()}`},
  {id:'tricks', label:'Most tricks in one jump',    fmt:v => `${v} tricks`},
  {id:'air',    label:'Biggest airtime',            fmt:v => `${v.toFixed(2)} s`},
  {id:'dist',   label:'Longest jump',               fmt:v => `${v.toFixed(1)} m`},
  {id:'speed',  label:'Top speed',                  fmt:v => `${v.toFixed(1)} km/h`},
  {id:'earned', label:'Most DOLLAHS earned',        fmt:v => `$${Math.round(v).toLocaleString()}`},
  {id:'trails', label:'Trails completed',           fmt:v => `${v}`},
  {id:'park',   label:'Dirt jump park best line',   fmt:v => `$${Math.round(v).toLocaleString()}`},
];
const post = async (path, body, ms = 8000) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(MP_SERVER + path, {method:'POST', body:JSON.stringify(body), signal:ac.signal, cache:'no-store'}); const j = await r.json().catch(() => ({})); return {status:r.status, ...j}; }
  finally { clearTimeout(t); } };

// ---- save <-> localStorage
export function collect(){ const st = J('trailDescent.settings', {}), settings = {};
  for (const k of ['tod','quality','invertY','invertX','volume','musicOn','musicVol']) if (st[k] !== undefined) settings[k] = st[k];
  return { updated: J('trailDescent.saveUpdated', 0), dollahs: J('trailDescent.dollahs', 0), owned: J('trailDescent.owned', ['hardtail']), bike: J('trailDescent.bike', 'hardtail'),
    cosmetics: J('trailDescent.cosmetics', []), skins: J('trailDescent.skins', {}), settings,
    unlocked: { mountain: J('trailDescent.unlocked', []), rampage: J('trailDescent.unlocked.rampage', []) },
    best: { mountain: J('trailDescent.best.mountain', {}), rampage: J('trailDescent.best.rampage', {}) },
    name: J('trailDescent.mpName', [0, 0]), earned: J('trailDescent.earned', 0), pb: J('trailDescent.pb', {}) }; }
export function apply(d){ SETJ('trailDescent.saveUpdated', d.updated || Date.now()); SETJ('trailDescent.dollahs', d.dollahs | 0); SETJ('trailDescent.owned', d.owned); SETJ('trailDescent.bike', d.bike);
  SETJ('trailDescent.cosmetics', d.cosmetics); SETJ('trailDescent.skins', d.skins); SETJ('trailDescent.settings', Object.assign(J('trailDescent.settings', {}), d.settings || {}));
  SETJ('trailDescent.unlocked', d.unlocked.mountain); SETJ('trailDescent.unlocked.rampage', d.unlocked.rampage);
  SETJ('trailDescent.best.mountain', d.best.mountain || {}); SETJ('trailDescent.best.rampage', d.best.rampage || {});
  SETJ('trailDescent.mpName', d.name); SETJ('trailDescent.earned', d.earned | 0); SETJ('trailDescent.pb', d.pb || {}); }
// same merge as the server: newest wins for scalars, union for owned/unlocks, faster/bigger personal bests
export function merge(a, b){ if (!a) return b; if (!b) return a;
  const n = (b.updated || 0) >= (a.updated || 0) ? b : a, o = n === a ? b : a, U = (x, y) => [...new Set([...(x || []), ...(y || [])])];
  const B = (x = {}, y = {}) => { const r = {...x}; for (const [k, v] of Object.entries(y)) if (!(r[k] <= v)) r[k] = v; return r; };
  const owned = U(n.owned, o.owned), pb = {...(o.pb || {})}; for (const [k, v] of Object.entries(n.pb || {})) pb[k] = (k.startsWith('time') ? Math.min : Math.max)(pb[k] ?? v, v);
  return {...n, owned, bike: owned.includes(n.bike) ? n.bike : 'hardtail', cosmetics: U(n.cosmetics, o.cosmetics),
    unlocked: {mountain: U(n.unlocked?.mountain, o.unlocked?.mountain), rampage: U(n.unlocked?.rampage, o.unlocked?.rampage)},
    best: {mountain: B(n.best?.mountain, o.best?.mountain), rampage: B(n.best?.rampage, o.best?.rampage)}, earned: Math.max(n.earned || 0, o.earned || 0), pb}; }

export function initCloud(g){   // g: {toast, worldIdx, onBoard(res), reload}
  const st = { code: J('trailDescent.saveCode', null), status:'idle', lastSync: J('trailDescent.lastSync', 0), dirty:false, queue: J('trailDescent.lbQueue', {}), listeners:new Set() };
  const emit = () => st.listeners.forEach(f => { try { f(st); } catch {} });
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => ALPHA[x % ALPHA.length]).join('');
  if (!st.code){ st.code = newCode(); SETJ('trailDescent.saveCode', st.code); st.fresh = true; if (!J('trailDescent.saveUpdated', 0)) SETJ('trailDescent.saveUpdated', Date.now()); }
  let lastSnap = JSON.stringify({...collect(), updated:0}), pushT = 0;
  // change watcher (cheap: every 2 s), debounced push 6 s after the last change
  setInterval(() => { const s = JSON.stringify({...collect(), updated:0}); if (s !== lastSnap){ lastSnap = s; SETJ('trailDescent.saveUpdated', Date.now()); st.dirty = true; pushT = 6; } }, 2000);
  setInterval(() => { if (pushT > 0 && (pushT -= 1) <= 0) push(); else if (st.dirty && st.status === 'offline' && Date.now() - st.lastTry > 30000) push(); }, 1000);
  async function push(){ st.lastTry = Date.now();
    try { const r = await post('/save/put', {code:st.code, data:collect()}); if (!r.ok) throw new Error(r.error || r.status);
      st.dirty = false; st.status = 'synced'; st.lastSync = Date.now(); SETJ('trailDescent.lastSync', st.lastSync); emit(); flushQueue(); return true; }
    catch (e){ st.status = 'offline'; st.dirty = true; emit(); return false; } }
  // startup: pull the cloud copy; if another device added things, merge them in (reload once so the game picks them up)
  setTimeout(async () => {
    try { const r = await post('/save/get', {code:st.code});
      if (r.ok){ const loc = collect(), m = merge(loc, r.data), cmp = x => JSON.stringify({...x, updated:0, settings:0});
        if (cmp(m) !== cmp(merge(loc, loc))){ apply({...m, updated:Math.max(m.updated || 0, loc.updated || 0)}); if (!sessionStorage.getItem('gnr.cloudReload')){ sessionStorage.setItem('gnr.cloudReload', '1'); g.toast('☁ Cloud save merged — reloading'); setTimeout(g.reload, 1200); return; } } }
      await push();   // first sync migrates existing local progress up
    } catch { st.status = 'offline'; emit(); } }, 2500);
  // ---- restore on a new browser
  async function restore(codeIn){ const code = cleanSaveCode(codeIn); if (code.length !== 16){ g.toast('Save codes have 16 letters/numbers'); return false; }
    try { const r = await post('/save/get', {code}); if (r.status === 404){ g.toast('No save with that code'); return false; } if (!r.ok) throw 0;
      const m = merge(collect(), {...r.data, updated:Number.MAX_SAFE_INTEGER}); apply({...m, updated:Date.now()}); SETJ('trailDescent.saveCode', code); st.code = code;   // restoring = take that save's DOLLAHS/settings, keep the union of items
      g.toast('☁ Save restored — reloading'); setTimeout(g.reload, 1000); return true; }
    catch { g.toast('📡 Cloud save server unreachable — try again later'); return false; } }
  async function wipe(){ try { const r = await post('/save/delete', {code:st.code}); if (!r.ok) throw 0; st.code = newCode(); SETJ('trailDescent.saveCode', st.code); g.toast('Cloud save and leaderboard entries deleted. A new save code was made.'); emit(); push(); }
    catch { g.toast('📡 Server unreachable — try again later'); } }
  // ---- personal bests + leaderboard submissions (queued while offline; only the best per board is kept)
  const pb = () => J('trailDescent.pb', {});
  function better(key, v, asc){ const p = pb(), o = p[key]; if (o !== undefined && (asc ? v >= o : v <= o)) return false; p[key] = v; SETJ('trailDescent.pb', p); return true; }
  function queue(key, path, body){ st.queue[key] = {path, body}; SETJ('trailDescent.lbQueue', st.queue); flushQueue(); }
  let flushing = false, needPush = false;
  async function flushQueue(){ if (flushing) return; flushing = true;
    try { for (let pass = 0; pass < 4 && Object.keys(st.queue).length; pass++) for (const [k, q] of Object.entries(st.queue)){ let r;
        try { r = await post(q.path, {code:st.code, ...q.body}); } catch { return; }
        if (r.status === 400 && r.error === 'nosave'){ needPush = true; return; }
        if (r.status === 429) continue;
        delete st.queue[k]; SETJ('trailDescent.lbQueue', st.queue);
        if (r.rejected) g.toast('Leaderboard: that result was not accepted (' + (r.error || 'invalid') + ')');
        else if (r.ok && q.body.show) g.onBoard({...r, cat:q.body.cat || 'time', label:q.body.label}); } }
    finally { flushing = false; if (needPush){ needPush = false; push(); } } }
  setInterval(() => { if (Object.keys(st.queue).length) flushQueue(); }, 15000);
  const NB = (label, txt) => g.toast(`⭐ NEW BEST! ${label}: ${txt}`);
  function stat(cat, val, extra = {}){ const C = CATS.find(c => c.id === cat); if (!(val > 0)) return; if (!better(cat, val, false)) return; NB(C.label, C.fmt(val)); queue(cat, '/lb/stat', {cat, val, ...extra}); }
  return { st, push, restore, wipe, on:f => st.listeners.add(f),
    jump(air, dist, tricks){ if (air > 0.35){ stat('air', +air.toFixed(3)); stat('dist', +dist.toFixed(2), {air:+air.toFixed(3)}); if (tricks > 0) stat('tricks', tricks, {air:+air.toFixed(3)}); } },
    speed(kmh){ stat('speed', +kmh.toFixed(1)); },
    park(score, dur){ if (score > 0) stat('park', Math.round(score), {dur:+dur.toFixed(2)}); },
    trail(w, t, name, time, cps, combo){   // finish: time board (+ combo) — submitted even when not a PB so the finish screen can show the board
      const tk = `time:${w}:${t}`, ck = `combo:${w}:${t}`, nt = better(tk, +time.toFixed(3), true), nc = combo > 0 && better(ck, Math.round(combo), false);
      if (nc) NB(`trick combo · ${name}`, `$${Math.round(combo)}`);
      queue(tk, '/lb/submit', {world:w, trail:t, name, time:+time.toFixed(3), cps:cps.map(x => +x.toFixed(3)), combo:Math.round(combo) || undefined, show:true, label:name});
      return nt; },
    async board(cat, world, trail){ try { return await post('/lb/get', {cat, world, trail, code:st.code}); } catch { return null; } },
    nameOf: n => `${NAME_A[n[0]] || '?'} ${NAME_B[n[1]] || '?'}` };
}
