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
// once a day
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
