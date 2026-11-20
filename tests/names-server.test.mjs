// The worker's name routes against a real SQLite (node:sqlite) standing in for the Durable Object storage:
// claim / taken / case-insensitive uniqueness, once-a-day changes, release, reports (one per device, hidden at 3),
// boards showing the custom name only while it is valid and not hidden, level boards, and the reviewer route.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
// store.js imports trails.json the Wrangler way (no import attribute); teach node to load it.
register('data:text/javascript,' + encodeURIComponent(`import { readFileSync } from 'node:fs';
export async function load(url, ctx, next){ if (url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: 'export default ' + readFileSync(new URL(url), 'utf8') + ';' }; return next(url, ctx); }`));
const { Store, NAME_CHANGE_MS } = await import('../server/src/store.js');
const { ALPHA } = await import('../level.js');

const db = new DatabaseSync(':memory:');
const sql = { exec(q, ...p) { const st = db.prepare(q); const rows = /^\s*(SELECT|WITH)/i.test(q) ? st.all(...p) : (st.run(...p), []); return { toArray: () => rows }; } };
const store = new Store({ storage: { sql } }, { PEPPER: 'test', ADMIN: 'reviewer-secret' });
let ipN = 0;
const call = async (path, body) => { const r = await store.fetch(new Request('https://x' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'CF-Connecting-IP': '10.0.0.' + (ipN++ % 250) } })); return { status: r.status, ...(await r.json()) }; };
const SAVE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const saveCode = () => { let c = ''; while (c.length < 16) c += SAVE_ALPHA[Math.floor(Math.random() * SAVE_ALPHA.length)]; return c; };
const device = () => { let c = ''; while (c.length < 16) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return c; };
const player = async (name = [1, 2]) => { const code = saveCode(); const r = await call('/save/put', { code, data: { name, earned: 10 } }); assert.equal(r.ok, true); return code; };

const a = await player([6, 0]), b = await player([3, 4]), c = await player([2, 2]);
// no save, bad names
assert.equal((await call('/name/set', { code: saveCode(), name: 'Shredder' })).error, 'nosave');
assert.equal((await call('/name/set', { code: a, name: 'sh1t' })).error, 'word');
assert.equal((await call('/name/set', { code: a, name: 'Bad Name' })).error, 'chars');
assert.equal((await call('/name/set', { code: a, name: 'ab' })).error, 'short');
assert.equal((await call('/name/set', { code: a, name: 'Pine\u200B42' })).error, 'chars');
assert.equal((await call('/name/set', { code: a, name: 'Admin' })).error, 'word');
// claim, then taken (any case)
let r = await call('/name/set', { code: a, name: 'TrailBoss' }); assert.equal(r.ok, true); assert.equal(r.name, 'TrailBoss'); assert.ok(r.nextChange > Date.now());
assert.equal((await call('/name/set', { code: b, name: 'trailboss' })).error, 'taken');
assert.equal((await call('/name/set', { code: b, name: 'TRAILBOSS' })).status, 409);
assert.equal((await call('/name/get', { code: a })).name, 'TrailBoss');
// one change per 7 days
r = await call('/name/set', { code: a, name: 'OtherName' }); assert.equal(r.error, 'soon'); assert.ok(r.nextChange > Date.now());
db.prepare('UPDATE names SET changed = ? WHERE name = ?').run(Date.now() - NAME_CHANGE_MS - 1000, 'TrailBoss');
r = await call('/name/set', { code: a, name: 'OtherName' }); assert.equal(r.ok, true);
// the old spelling is free again
r = await call('/name/set', { code: b, name: 'TrailBoss' }); assert.equal(r.ok, true);
// back to generated releases it, and the limit still applies
r = await call('/name/clear', { code: b }); assert.equal(r.name, null); assert.ok(r.nextChange > Date.now());
r = await call('/name/set', { code: c, name: 'trailBOSS' }); assert.equal(r.ok, true);
assert.equal((await call('/name/set', { code: b, name: 'Another1' })).error, 'soon');

// boards: custom names when valid and visible
const sub = async (code, time) => call('/lb/stat', { code, cat: 'speed', val: time });
await sub(a, 50); await sub(b, 60); await sub(c, 70);
let board = await call('/lb/get', { cat: 'speed', code: a });
const byName = n => board.top.find(e => e.custom === n);
assert.equal(byName('OtherName').me, true);
assert.ok(byName('trailBOSS'));
assert.deepEqual(board.top.find(e => !e.custom).name, [3, 4], 'a released name shows the generated name');

// reports: one per device, hidden at 3, the player shows the generated name
const d1 = device(), d2 = device(), d3 = device();
r = await call('/name/report', { device: d1, name: 'otherNAME' }); assert.equal(r.ok, true); assert.equal(r.hidden, false);
r = await call('/name/report', { device: d1, name: 'OtherName' }); assert.equal(r.already, true); assert.equal(r.hidden, false);
r = await call('/name/report', { device: d2, name: 'OtherName' }); assert.equal(r.hidden, false);
assert.equal((await call('/name/report', { device: 'bad', name: 'OtherName' })).error, 'bad');
assert.equal((await call('/name/report', { device: d3, name: 'Nobody123' })).status, 404);
r = await call('/name/report', { device: d3, name: 'OtherName' }); assert.equal(r.hidden, true);
board = await call('/lb/get', { cat: 'speed', code: a });
assert.equal(byName('OtherName'), undefined, 'hidden after 3 reports');
assert.deepEqual(board.top.find(e => e.me).name, [6, 0]);
assert.equal((await call('/name/get', { code: a })).hidden, true);
// a hidden name stays claimed until review
assert.equal((await call('/name/set', { code: b, name: 'othername' })).error, 'soon');
db.prepare('UPDATE names SET changed = 0').run();
assert.equal((await call('/name/set', { code: b, name: 'othername' })).error, 'taken');

// reviewer: needs the secret
assert.equal((await call('/admin/names', { key: 'wrong', action: 'list' })).status, 404);
assert.equal((await call('/admin/names', { action: 'list' })).status, 404);
r = await call('/admin/names', { key: 'reviewer-secret', action: 'list' });
assert.deepEqual(r.names.map(n => [n.name, n.reports, n.hidden]), [['OtherName', 3, 1]]);
r = await call('/admin/names', { key: 'reviewer-secret', action: 'clear', name: 'OtherName' }); assert.equal(r.ok, true);
board = await call('/lb/get', { cat: 'speed', code: a }); assert.equal(byName('OtherName').me, true, 'cleared names show again');
await call('/admin/names', { key: 'reviewer-secret', action: 'remove', name: 'trailBOSS' });
assert.equal((await call('/name/get', { code: c })).name, null, 'removed by the reviewer');
assert.equal((await call('/name/set', { code: b, name: 'TrailBoss' })).ok, true, 'a removed name is free');

// level boards carry names when the racer sends their save code
const lv = { v: 1, name: [0, 1, 2], items: [] };
db.prepare("INSERT INTO levels (code, id, ver, na, nb, nc, diff, style, likes, reports, hidden, data, created, updated) VALUES ('ABCDEF', 'lvid01', 1, 0, 1, 2, 'easy', 'flow', 0, 0, 0, ?, 0, 0)").run(JSON.stringify(lv));
const lt = async (code, dev, time) => call('/level/time', { code: 'ABCDEF', version: 1, time, device: dev, ...(code ? { savecode: code } : {}) });
r = await lt(a, d1, 30); assert.equal(r.ok, true, JSON.stringify(r));
r = await lt(null, d2, 31);
assert.equal(r.top[0].custom, 'OtherName'); assert.deepEqual(r.top[0].name, [6, 0]);
assert.equal(r.top[1].custom, undefined); assert.equal(r.top[1].name, undefined, 'an anonymous level time has no name');
console.log('names-server.test ok');

// ---- rooms: the SERVER picks the shown name from the store; client-sent text is ignored
const { Room, roomCustomName } = await import('../server/src/index.js');
const env = { STORE: { idFromName: n => n, get: () => ({ fetch: (u, init) => store.fetch(new Request(u, init)) }) } };
const room = new Room({}, env); room.inited = true;
const sock = () => { const ws = { out: [], on: {}, closed: null, send(s) { this.out.push(JSON.parse(s)); }, close(c) { this.closed = c; }, addEventListener(t, f) { this.on[t] = f; } };
  room.onSocket(ws); ws.say = o => ws.on.message({ data: JSON.stringify(o) }); ws.last = t => [...ws.out].reverse().find(m => m.t === t); return ws; };
const hid = await player([9, 9]); assert.equal((await call('/name/set', { code: hid, name: 'Hidey9' })).ok, true);
for (const d of [device(), device(), device()]) await call('/name/report', { device: d, name: 'Hidey9' });
assert.equal((await call('/name/get', { code: hid })).hidden, true);
const w1 = sock(); await w1.say({ t: 'hello', name: [6, 0], skin: [0, 0, 0, 0, 0, 0], code: a });   // a = OtherName (visible)
assert.equal(w1.last('welcome').you, 'OtherName', 'a custom name shows in the room');
const w2 = sock(); await w2.say({ t: 'hello', name: [9, 9], skin: [0, 0, 0, 0, 0, 0], code: hid });
assert.equal(w2.last('welcome').you, undefined, 'a hidden (reported) name falls back');
assert.deepEqual(w1.last('join'), { t: 'join', id: 2, name: [9, 9], skin: [0, 0, 0, 0, 0, 0] });
const w3 = sock(); await w3.say({ t: 'hello', name: 'Hacker', custom: 'FakeName', you: 'FakeName', skin: [0, 0, 0, 0, 0, 0] });
assert.equal(w3.last('welcome').you, undefined, 'client-sent name text is ignored');
assert.deepEqual(w1.last('join').name, [0, 0]); assert.equal(w1.last('join').custom, undefined);
const w4 = sock(); await w4.say({ t: 'hello', name: [3, 4], skin: [0, 0, 0, 0, 0, 0], code: c });   // c has no custom name
assert.equal(w4.last('welcome').you, undefined, 'no custom name gives the generated one'); assert.deepEqual(w1.last('join').name, [3, 4]);
const w5 = sock(); await w5.say({ t: 'hello', name: [1, 1], skin: [0, 0, 0, 0, 0, 0], code: b, custom: 'Other' });   // b = TrailBoss
assert.equal(w5.last('welcome').you, 'TrailBoss'); assert.equal(w1.last('join').custom, 'TrailBoss');
const peers = w5.last('welcome').peers; assert.equal(peers.find(p => p.id === 1).custom, 'OtherName'); assert.equal(peers.filter(p => p.custom).length, 1);
assert.equal(JSON.stringify(w1.out).includes(b), false, 'save codes are never sent to other riders');
// a name the filter now refuses is not shown even if stored; lookups that fail give none
db.prepare("UPDATE names SET name = 'sh1t', lower = 'sh1t' WHERE h = (SELECT h FROM names WHERE name = 'TrailBoss')").run();
assert.equal(await roomCustomName(env, b), null);
assert.equal(await roomCustomName({ STORE: { idFromName: n => n, get: () => ({ fetch: async () => { throw new Error('down'); } }) } }, a), null);
assert.equal(await roomCustomName(env, 'NOTACODE'), null); assert.equal(await roomCustomName(env, 12345), null);
console.log('names-server.test rooms ok');

// ---- 7-day cooldown: the first save is free, then one change per 7 days, enforced here
assert.equal(NAME_CHANGE_MS, 7 * 24 * 3600 * 1000);
const fresh = await player([5, 5]);
r = await call('/name/set', { code: fresh, name: 'ZippyBison' }); assert.equal(r.ok, true, 'the first save is free'); 
assert.ok(Math.abs(r.nextChange - (Date.now() + NAME_CHANGE_MS)) < 5000, 'next change is 7 days out');
r = await call('/name/set', { code: fresh, name: 'SwiftOtter' }); assert.equal(r.error, 'soon'); assert.equal(r.status, 429);
db.prepare('UPDATE names SET changed = ? WHERE name = ?').run(Date.now() - 6.9 * 24 * 3600 * 1000, 'ZippyBison');
assert.equal((await call('/name/set', { code: fresh, name: 'SwiftOtter' })).error, 'soon', 'still waiting after 6.9 days');
assert.equal((await call('/name/get', { code: fresh })).nextChange > Date.now(), true);
// clearing does not skip the wait
assert.equal((await call('/name/clear', { code: fresh })).name, null);
assert.equal((await call('/name/set', { code: fresh, name: 'SwiftOtter' })).error, 'soon', 'clear keeps the change time');
db.prepare('UPDATE names SET changed = ? WHERE h = (SELECT h FROM names WHERE name IS NULL AND changed > ? LIMIT 1)').run(Date.now() - NAME_CHANGE_MS - 1000, Date.now() - 7 * 24 * 3600 * 1000);
assert.equal((await call('/name/set', { code: fresh, name: 'SwiftOtter' })).ok, true, 'allowed after 7 days');
// a generated-style name is claimed and unique like any other
const other = await player([5, 6]);
assert.equal((await call('/name/set', { code: other, name: 'swiftotter' })).error, 'taken');
console.log('names-server.test cooldown ok');
