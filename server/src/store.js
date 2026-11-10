// Cloud saves + leaderboards: one SQLite-backed Durable Object (free plan, strongly consistent, no extra API permission).
// Privacy: save codes are never stored, only SHA-256(pepper + code). No IPs, emails or free text are stored; rate limits
// are kept in memory only. Names are two indices into the client's preset word lists.
import TRAILS from './trails.json';
import { validateLevel, publicCodeOk, levelName, rateLevel, makeCode, ALPHA } from '../../level.js';

const SAVE_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/;
const ID_RE = /^[a-z0-9:_-]{1,40}$/;
const MAX_SPEED = 30;          // m/s: game.js hard-caps bike speed at 30 m/s (108 km/h); minimum plausible time = distance / MAX_SPEED
const MAX_AIR = 4.0;           // s: game.js respawns any jump longer than 4 s
const PTS_PER_S = 400;         // DOLLAHS per second of riding, generous ceiling (max trick haul ~1500 per 4 s jump)
// leaderboard categories: per = per-trail (else per-world [w] or global [g]); asc = lower is better; unit = stored integer scale
export const CATS = {
  time:   {per:'trail', asc:true,  scale:1000},   // seconds -> ms
  combo:  {per:'trail', asc:false, scale:1},      // DOLLAHS of tricks in one run of that trail
  tricks: {per:'g',     asc:false, scale:1},      // tricks in a single jump
  air:    {per:'g',     asc:false, scale:1000},   // seconds
  dist:   {per:'g',     asc:false, scale:100},    // metres
  speed:  {per:'g',     asc:false, scale:10},     // km/h
  earned: {per:'g',     asc:false, scale:1},      // lifetime DOLLAHS (from the cloud save)
  trails: {per:'g',     asc:false, scale:1},      // trails completed, both worlds (from the cloud save)
  park:   {per:'g',     asc:false, scale:1},      // dirt jump park best line score
};
const RUN_START = 18, RUN_END = 8;   // a run starts within 18 m of the top and finishes 8 m before the end (as in game.js)
const SETTINGS_KEYS = { tod: ['morning','noon','golden'], quality: ['low','med','high'], invertY: 'b', invertX: 'b', volume: 'n', musicVol: 'n', ambience: 'n', fpsCap: 'fps' };

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// ---- save validation + merge (same rules as the client): newest wins for scalars; owned things and unlocks are a union;
// best times keep the faster. Nothing that was ever owned/unlocked can be lost by a stale device.
export function cleanSave(d) {
  if (!d || typeof d !== 'object') return null;
  const ids = (a, n = 200) => Array.isArray(a) ? [...new Set(a.filter(x => typeof x === 'string' && ID_RE.test(x)))].slice(0, n) : [];
  const names = w => new Set(TRAILS[w].map(t => t.name));
  const unl = (a, w) => Array.isArray(a) ? [...new Set(a.filter(x => names(w).has(x)))] : [];
  const best = (o, w) => { const r = {}; if (o && typeof o === 'object') for (const t of TRAILS[w]) { const v = o[t.name]; if (typeof v === 'number' && v > 0 && v < 36000) r[t.name] = Math.round(v * 1000) / 1000; } return r; };
  const skins = {}; if (d.skins && typeof d.skins === 'object') for (const [b, s] of Object.entries(d.skins).slice(0, 20)) if (ID_RE.test(b) && s && typeof s === 'object') { const o = {}; for (const [k, v] of Object.entries(s).slice(0, 8)) if (ID_RE.test(k) && typeof v === 'string' && ID_RE.test(v)) o[k] = v; skins[b] = o; }
  const settings = {}; if (d.settings && typeof d.settings === 'object') {
    for (const [k, t] of Object.entries(SETTINGS_KEYS)) { const v = d.settings[k]; const fpsOk = t === 'fps' && typeof v === 'number' && [0, 30, 60, 90, 120, 144].includes(v); if (Array.isArray(t) ? t.includes(v) : t === 'b' ? typeof v === 'boolean' : fpsOk || (t === 'n' && typeof v === 'number' && v >= 0 && v <= 1)) settings[k] = v; }
    const span = (k, lo, hi) => { const v = d.settings[k]; if (typeof v === 'number' && v >= lo && v <= hi) settings[k] = v; };
    span('droneSpeed', 6, 24); span('droneTilt', 0, 35); span('droneDist', 4, 18); span('droneHeight', 2, 12);
    if (d.settings.droneFly === 'manual' || d.settings.droneFly === 'follow') settings.droneFly = d.settings.droneFly; }
  return {
    v: 1, updated: int(d.updated, 0, 9e15) ? d.updated : 0,
    dollahs: int(d.dollahs, 0, 1e9) ? d.dollahs : 0,
    owned: ids(d.owned, 40), bike: typeof d.bike === 'string' && ID_RE.test(d.bike) ? d.bike : 'hardtail',
    cosmetics: ids(d.cosmetics), skins, settings,
    unlocked: { mountain: unl(d.unlocked?.mountain, 'mountain'), rampage: unl(d.unlocked?.rampage, 'rampage') },
    best: { mountain: best(d.best?.mountain, 'mountain'), rampage: best(d.best?.rampage, 'rampage') },
    name: Array.isArray(d.name) && int(d.name[0], 0, 31) && int(d.name[1], 0, 31) ? d.name : [0, 0],
    earned: int(d.earned, 0, 1e9) ? d.earned : 0,
    pb: (() => { const r = {}; if (d.pb && typeof d.pb === 'object') for (const [k, v] of Object.entries(d.pb).slice(0, 200)) if (/^[a-z]{2,8}(:[01]:\d{1,2}(:[0-9a-z]{4,8})?)?$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9) r[k] = v; return r; })(),
  };
}
export function mergeSave(a, b) {   // a, b already cleaned
  if (!a) return b; if (!b) return a;
  const n = b.updated >= a.updated ? b : a, o = n === a ? b : a;
  const U = (x, y) => [...new Set([...x, ...y])];
  const B = (x, y) => { const r = { ...x }; for (const [k, v] of Object.entries(y)) if (!(r[k] <= v)) r[k] = v; return r; };
  const owned = U(n.owned, o.owned);
  return { ...n, owned, bike: owned.includes(n.bike) ? n.bike : 'hardtail', cosmetics: U(n.cosmetics, o.cosmetics),
    unlocked: { mountain: U(n.unlocked.mountain, o.unlocked.mountain), rampage: U(n.unlocked.rampage, o.unlocked.rampage) },
    best: { mountain: B(n.best.mountain, o.best.mountain), rampage: B(n.best.rampage, o.best.rampage) },
    earned: Math.max(n.earned || 0, o.earned || 0), pb: (() => { const r = { ...o.pb }; for (const [k, v] of Object.entries(n.pb)) r[k] = (k.startsWith('time') ? Math.min : Math.max)(r[k] ?? v, v); return r; })() };
}

export class Store {
  constructor(state, env) { this.state = state; this.env = env; this.sql = state.storage.sql; this.rl = new Map();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS saves (h TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS stats (c TEXT, w INTEGER, t INTEGER, h TEXT, na INTEGER, nb INTEGER, v INTEGER, at INTEGER, PRIMARY KEY (c, w, t, h))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS stats_rank ON stats (c, w, t, v)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS levels (code TEXT PRIMARY KEY, id TEXT, ver INTEGER, na INTEGER, nb INTEGER, nc INTEGER, diff TEXT, style TEXT, likes INTEGER, reports INTEGER, hidden INTEGER, data TEXT, created INTEGER, updated INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS level_likes (code TEXT, h TEXT, PRIMARY KEY (code, h))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS level_reports (code TEXT, h TEXT, PRIMARY KEY (code, h))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS level_times (code TEXT, ver INTEGER, h TEXT, ms INTEGER, at INTEGER, PRIMARY KEY (code, ver, h))`); }
  // upsert a stat if it beats the stored one (lower for asc categories)
  put(c, w, t, h, name, v) { const C = CATS[c], prev = this.sql.exec('SELECT v FROM stats WHERE c = ? AND w = ? AND t = ? AND h = ?', c, w, t, h).toArray()[0];
    const better = !prev || (C.asc ? v < prev.v : v > prev.v);
    if (better) this.sql.exec('INSERT INTO stats (c, w, t, h, na, nb, v, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(c, w, t, h) DO UPDATE SET v = excluded.v, at = excluded.at, na = excluded.na, nb = excluded.nb', c, w, t, h, name[0], name[1], v, Date.now());
    return better; }
  limit(key, perMin) { const now = Date.now(), r = this.rl.get(key) || { n: perMin, t: now }; r.n = Math.min(perMin, r.n + (now - r.t) / 60000 * perMin); r.t = now; this.rl.set(key, r);
    if (this.rl.size > 20000) this.rl.clear(); if (r.n < 1) return false; r.n -= 1; return true; }
  async fetch(req) {
    const url = new URL(req.url), ip = req.headers.get('CF-Connecting-IP') || 'x';
    if (!this.limit('ip:' + ip, 120)) return json({ error: 'slow down' }, 429);
    const cap = url.pathname.startsWith('/level') ? 70000 : 16000;
    let body; try { const t = await req.text(); if (t.length > cap) return json({ error: 'too big' }, 413); body = JSON.parse(t || '{}'); } catch { return json({ error: 'bad json' }, 400); }
    const code = typeof body.code === 'string' ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const h = SAVE_CODE_RE.test(code) ? await sha((this.env.PEPPER || 'gnr') + ':' + code) : null;
    const row = h ? this.sql.exec('SELECT data FROM saves WHERE h = ?', h).toArray()[0] : null;
    switch (url.pathname) {
      case '/save/put': {   // create or update (merge) a save; returns the merged save
        if (!h) return json({ error: 'badcode' }, 400);
        if (!this.limit('put:' + h, 20)) return json({ error: 'slow down' }, 429);
        const inc = cleanSave(body.data); if (!inc) return json({ error: 'bad save' }, 400);
        const old = row ? cleanSave(JSON.parse(row.data)) : null;
        if (old) {   // lifetime DOLLAHS can only grow as fast as riding allows since the last sync (+ slack)
          const prevAt = this.sql.exec('SELECT updated FROM saves WHERE h = ?', h).toArray()[0].updated, cap = old.earned + 20000 + (Date.now() - prevAt) / 1000 * PTS_PER_S;
          if (inc.earned > cap) inc.earned = Math.floor(cap); }
        else inc.earned = Math.min(inc.earned, 1e7);
        const merged = mergeSave(old, inc);
        this.sql.exec('INSERT INTO saves (h, data, updated) VALUES (?, ?, ?) ON CONFLICT(h) DO UPDATE SET data = excluded.data, updated = excluded.updated', h, JSON.stringify(merged), Date.now());
        this.sql.exec('UPDATE stats SET na = ?, nb = ? WHERE h = ?', merged.name[0], merged.name[1], h);
        if (merged.earned > 0) this.put('earned', 2, 0, h, merged.name, merged.earned);
        const nt = merged.unlocked.mountain.length + merged.unlocked.rampage.length; if (nt > 0) this.put('trails', 2, 0, h, merged.name, nt);
        return json({ ok: true, data: merged }); }
      case '/admin/purge': {   // moderation: remove leaderboard rows made before a time (needs the ADMIN secret; never exposed to players)
        if (!this.env.ADMIN || body.key !== this.env.ADMIN) return json({ error: 'not found' }, 404);
        const before = int(body.before, 0, 9e15) ? body.before : 0; this.sql.exec('DELETE FROM stats WHERE at < ?', before);
        if (body.saves) this.sql.exec('DELETE FROM saves WHERE updated < ?', before);
        return json({ ok: true }); }
      case '/save/delete': {   // "delete my cloud data": the save and every leaderboard entry made with it
        if (!h) return json({ error: 'badcode' }, 400);
        this.sql.exec('DELETE FROM saves WHERE h = ?', h); this.sql.exec('DELETE FROM stats WHERE h = ?', h);
        return json({ ok: true }); }
      case '/save/get': {
        if (!h) return json({ error: 'badcode' }, 400);
        if (!this.limit('get:' + ip, 10)) return json({ error: 'slow down' }, 429);   // slows code guessing
        if (!row) return json({ error: 'nosave' }, 404);
        return json({ ok: true, data: cleanSave(JSON.parse(row.data)) }); }
      case '/lb/submit': {
        if (!h || !row) return json({ error: 'nosave' }, 400);
        if (!this.limit('lb:' + h, 8)) return json({ error: 'slow down' }, 429);
        const w = body.world === 1 ? 1 : body.world === 0 ? 0 : -1, W = ['mountain', 'rampage'][w], tr = W && TRAILS[W][body.trail];
        if (!tr || body.name !== tr.name) return json({ error: 'unknown trail' }, 400);
        const time = body.time, cps = body.cps;
        if (typeof time !== 'number' || !(time > 0 && time < 3600)) return json({ error: 'bad time' }, 400);
        if (!Array.isArray(cps) || cps.length !== tr.cps.length || !cps.every(x => typeof x === 'number' && x >= 0)) return json({ error: 'missing checkpoints', rejected: true }, 422);
        // plausibility: every split (start -> cp1 -> ... -> finish) at most MAX_SPEED, checkpoints strictly in order
        const marks = [RUN_START, ...tr.cps, tr.len - RUN_END], times = [0, ...cps, time];
        for (let i = 1; i < marks.length; i++) { const dt = times[i] - times[i - 1], need = Math.max(0, marks[i] - marks[i - 1]) / MAX_SPEED;
          if (!(dt > 0) || dt + 0.05 < need) return json({ error: 'implausible time', rejected: true, split: i, min: +need.toFixed(2) }, 422); }
        // NOT DEPLOYED. The live worker ignores body.layout and stores t as the trail index, so old times stay on that board.
        // To reset a changed trail: when body.layout matches /^[0-9a-z]{4,8}$/, store and read
        // t = trailIndex + 64 * ((layoutHash % 40) + 1), and raise int(body.trail, 0, 63) in /lb/get to that range.
        // Plain trail indexes keep the old rows. The client already sends layout and versions the local PB key.
        const name = cleanSave(JSON.parse(row.data)).name, improved = this.put('time', w, body.trail, h, name, Math.round(time * 1000));
        let comboImproved = false; if (int(body.combo, 1, 1e7) && body.combo <= time * PTS_PER_S + 500) comboImproved = this.put('combo', w, body.trail, h, name, body.combo);
        return json({ ok: true, improved, comboImproved, ...this.board('time', w, body.trail, h) }); }
      case '/lb/stat': {   // single-jump / session stats, each checked against the physics caps
        if (!h || !row) return json({ error: 'nosave' }, 400);
        if (!this.limit('st:' + h, 30)) return json({ error: 'slow down' }, 429);
        const c = body.cat, v = body.val, air = body.air, name = cleanSave(JSON.parse(row.data)).name;
        const bad = why => json({ error: 'implausible ' + c + ': ' + why, rejected: true }, 422);
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return bad('value');
        let iv;
        switch (c) {
          case 'air': if (v > MAX_AIR) return bad('airtime over ' + MAX_AIR + ' s'); iv = Math.round(v * 1000); break;
          case 'dist': if (typeof air !== 'number' || air <= 0 || air > MAX_AIR) return bad('needs airtime'); if (v > MAX_SPEED * air + 1) return bad('farther than ' + MAX_SPEED + ' m/s x airtime'); iv = Math.round(v * 100); break;
          case 'tricks': if (!Number.isInteger(v) || typeof air !== 'number' || air <= 0 || air > MAX_AIR) return bad('needs airtime'); if (v > Math.min(16, 3 + Math.floor(air / 0.3))) return bad('more tricks than the airtime allows'); iv = v; break;
          case 'speed': if (v > MAX_SPEED * 3.6 + 0.5) return bad('over the ' + (MAX_SPEED * 3.6) + ' km/h physics cap'); iv = Math.round(v * 10); break;
          case 'park': { const dur = body.dur; if (!Number.isInteger(v) || typeof dur !== 'number' || dur <= 0 || dur > 900) return bad('needs line duration'); if (v > dur * PTS_PER_S + 300) return bad('score too high for the line duration'); iv = v; break; }
          default: return json({ error: 'unknown category' }, 400);
        }
        const improved = this.put(c, 2, 0, h, name, iv);
        return json({ ok: true, improved, ...this.board(c, 2, 0, h) }); }
      case '/lb/get': {
        const c = CATS[body.cat] ? body.cat : 'time', C = CATS[c], w = C.per === 'g' ? 2 : body.world === 1 ? 1 : 0, t = C.per === 'trail' && int(body.trail, 0, 63) ? body.trail : 0;
        if (!this.limit('lbget:' + ip, 90)) return json({ error: 'slow down' }, 429);
        return json({ ok: true, cat: c, ...this.board(c, w, t, h) }); }
      case '/level/publish': return this.publish(body, ip);
      case '/level/get': return this.levelGet(body);
      case '/level/list': return this.levelList(body);
      case '/level/search': return this.levelSearch(body);
      case '/level/like': return this.levelLike(body);
      case '/level/report': return this.levelReport(body);
      case '/level/time': return this.levelTime(body);
    }
    return json({ error: 'not found' }, 404);
  }
  deviceHash(device){ return typeof device === 'string' && [...device].every(c => ALPHA.includes(c)) && device.length === 16 ? sha((this.env.PEPPER || 'gnr') + ':dev:' + device) : Promise.resolve(null); }
  card(r){ return { code: r.code, id: r.id, version: r.ver, name: [r.na, r.nb, r.nc], title: levelName([r.na, r.nb, r.nc]), diff: r.diff, style: r.style, likes: r.likes, reports: r.reports }; }
  async publish(body, ip){
    if (!this.limit('lvpub:' + ip, 10)) return json({ error: 'slow down' }, 429);
    const check = validateLevel(body.level);
    if (!check.ok) return json({ error: 'invalid', reasons: check.errors }, 422);
    const lv = body.level, rated = rateLevel(lv);
    let code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const row = publicCodeOk(code) ? this.sql.exec('SELECT id, ver FROM levels WHERE code = ?', code).toArray()[0] : null;
    const ver = row ? row.ver + 1 : 1;
    const id = row ? row.id : (typeof lv.id === 'string' && lv.id.length >= 6 && lv.id.length <= 16 ? lv.id : makeCode());
    if (!row){ code = makeCode(); for (let n = 0; n < 8 && this.sql.exec('SELECT code FROM levels WHERE code = ?', code).toArray()[0]; n++) code = makeCode(); }
    const data = JSON.stringify({ ...lv, version: ver, id });
    if (data.length > 60000) return json({ error: 'too big' }, 413);
    const now = Date.now();
    if (row) this.sql.exec('UPDATE levels SET ver = ?, na = ?, nb = ?, nc = ?, diff = ?, style = ?, data = ?, updated = ?, hidden = 0 WHERE code = ?', ver, lv.name[0], lv.name[1], lv.name[2], rated.diff, rated.style, data, now, code);
    else this.sql.exec('INSERT INTO levels (code, id, ver, na, nb, nc, diff, style, likes, reports, hidden, data, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)', code, id, ver, lv.name[0], lv.name[1], lv.name[2], rated.diff, rated.style, data, now, now);
    return json({ ok: true, code, id, version: ver, title: levelName(lv.name), ...rated });
  }
  levelGet(body){
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    if (!publicCodeOk(code)) return json({ error: 'badcode' }, 400);
    const r = this.sql.exec('SELECT * FROM levels WHERE code = ?', code).toArray()[0];
    if (!r || r.hidden) return json({ error: r && r.hidden ? 'hidden' : 'missing' }, r && r.hidden ? 403 : 404);
    return json({ ok: true, ...this.card(r), level: JSON.parse(r.data) });
  }
  levelList(body){
    const liked = body.sort === 'liked';
    const rows = this.sql.exec(`SELECT * FROM levels WHERE hidden = 0 ORDER BY ${liked ? 'likes DESC, created DESC' : 'created DESC'} LIMIT 20`).toArray();
    return json({ ok: true, levels: rows.map(r => this.card(r)) });
  }
  levelSearch(body){
    const rows = this.sql.exec('SELECT * FROM levels WHERE hidden = 0 ORDER BY created DESC LIMIT 200').toArray();
    const words = Array.isArray(body.words) ? body.words.filter(n => Number.isInteger(n)) : [];
    const out = rows.filter(r => {
      if (body.diff && body.diff !== 'any' && r.diff !== body.diff) return false;
      if (body.style && body.style !== 'any' && r.style !== body.style) return false;
      if (words.length && !words.some(w => w === r.na || w === r.nb || w === r.nc)) return false;
      return true;
    }).slice(0, 20);
    return json({ ok: true, levels: out.map(r => this.card(r)) });
  }
  async levelLike(body){
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const h = await this.deviceHash(body.device);
    if (!publicCodeOk(code) || !h) return json({ error: 'bad' }, 400);
    const row = this.sql.exec('SELECT hidden FROM levels WHERE code = ?', code).toArray()[0];
    if (!row || row.hidden) return json({ error: 'missing' }, 404);
    const had = this.sql.exec('SELECT h FROM level_likes WHERE code = ? AND h = ?', code, h).toArray()[0];
    if (!had){ this.sql.exec('INSERT INTO level_likes (code, h) VALUES (?, ?)', code, h); this.sql.exec('UPDATE levels SET likes = likes + 1 WHERE code = ?', code); }
    const likes = this.sql.exec('SELECT likes FROM levels WHERE code = ?', code).toArray()[0].likes;
    return json({ ok: true, likes, already: !!had });
  }
  async levelReport(body){
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const h = await this.deviceHash(body.device);
    if (!publicCodeOk(code) || !h) return json({ error: 'bad' }, 400);
    const row = this.sql.exec('SELECT hidden, reports FROM levels WHERE code = ?', code).toArray()[0];
    if (!row) return json({ error: 'missing' }, 404);
    const had = this.sql.exec('SELECT h FROM level_reports WHERE code = ? AND h = ?', code, h).toArray()[0];
    let reports = row.reports, hidden = row.hidden;
    if (!had && !hidden){
      this.sql.exec('INSERT INTO level_reports (code, h) VALUES (?, ?)', code, h);
      reports += 1; hidden = reports >= 3 ? 1 : 0;
      this.sql.exec('UPDATE levels SET reports = ?, hidden = ? WHERE code = ?', reports, hidden, code);
    }
    return json({ ok: true, reports, hidden: !!hidden });
  }
  async levelTime(body){
    const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
    const h = await this.deviceHash(body.device);
    if (!publicCodeOk(code) || !h) return json({ error: 'bad' }, 400);
    const row = this.sql.exec('SELECT ver, hidden, data FROM levels WHERE code = ?', code).toArray()[0];
    if (!row || row.hidden) return json({ error: 'missing' }, 404);
    if (body.version !== row.ver) return json({ error: 'old version', version: row.ver }, 409);
    const time = body.time;
    if (typeof time !== 'number' || !(time > 1 && time < 3600)) return json({ error: 'bad time' }, 400);
    const ms = Math.round(time * 1000);
    const prev = this.sql.exec('SELECT ms FROM level_times WHERE code = ? AND ver = ? AND h = ?', code, row.ver, h).toArray()[0];
    const better = !prev || ms < prev.ms;
    if (better) this.sql.exec('INSERT INTO level_times (code, ver, h, ms, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code, ver, h) DO UPDATE SET ms = excluded.ms, at = excluded.at', code, row.ver, h, ms, Date.now());
    const top = this.sql.exec('SELECT ms FROM level_times WHERE code = ? AND ver = ? ORDER BY ms ASC LIMIT 20', code, row.ver).toArray().map((r, i) => ({ rank: i + 1, v: r.ms / 1000 }));
    return json({ ok: true, improved: better, version: row.ver, top });
  }
  board(c, w, t, h) {
    const C = CATS[c], ord = C.asc ? 'ASC' : 'DESC', cmp = C.asc ? '<' : '>';
    const top = this.sql.exec(`SELECT h, na, nb, v FROM stats WHERE c = ? AND w = ? AND t = ? ORDER BY v ${ord}, at ASC LIMIT 20`, c, w, t).toArray().map((r, i) => ({ rank: i + 1, name: [r.na, r.nb], v: r.v / C.scale, me: r.h === h }));
    const total = this.sql.exec('SELECT COUNT(*) AS n FROM stats WHERE c = ? AND w = ? AND t = ?', c, w, t).toArray()[0].n;
    let me = null; if (h) { const r = this.sql.exec('SELECT v FROM stats WHERE c = ? AND w = ? AND t = ? AND h = ?', c, w, t, h).toArray()[0];
      if (r) me = { v: r.v / C.scale, rank: this.sql.exec(`SELECT COUNT(*) AS n FROM stats WHERE c = ? AND w = ? AND t = ? AND v ${cmp} ?`, c, w, t, r.v).toArray()[0].n + 1 }; }
    return { top, total, me };
  }
}
