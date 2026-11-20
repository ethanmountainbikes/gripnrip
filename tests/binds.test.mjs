import assert from 'node:assert/strict';
import { loadBinds, proposeBind, swapBind, conflict, KB_DEFAULT, PAD_DEFAULT, spawnHold, spawnDenied, clearSpawn, respawnChoice, rankedRun, SPAWN_SLOW } from '../binds.js';

const fresh = () => loadBinds(null);
const rider = (over = {}) => ({ x: 10, z: 20, yaw: 1.25, speed: 0, air: false, lift: false, blocked: false, rideable: true, timed: false, ...over });

{
  const none = loadBinds(undefined);
  assert.equal(none.kb.pedal, KB_DEFAULT.pedal);
  assert.equal(none.kb.spawn, 'KeyN');
  assert.equal(none.pad.respawn, 'B');
  assert.equal(none.pad.spawnClick, 'LS');
  assert.equal(none.pad.spawnMod, 'LT');
  const partial = loadBinds({ kb: { brake: 'KeyL', pedal: '', marker: 'KeyH' }, pad: { respawn: 'A' }, extra: true });
  assert.equal(partial.kb.brake, 'KeyL');
  assert.equal(partial.kb.pedal, 'KeyW');
  assert.equal(partial.kb.spawn, 'KeyH');
  assert.equal(partial.pad.respawn, 'A');
  assert.equal(partial.pad.camera, PAD_DEFAULT.camera);
  assert.equal(JSON.parse(JSON.stringify(partial)).kb.brake, 'KeyL');
}

{
  const b = fresh();
  assert.equal(conflict(b, 'kb', 'spawn', 'KeyW'), 'pedal');
  const taken = proposeBind(b, 'kb', 'spawn', 'KeyW');
  assert.equal(taken.ok, false);
  assert.equal(taken.other, 'pedal');
  assert.equal(b.kb.spawn, 'KeyN');
  const again = proposeBind(b, 'kb', 'pedal', 'KeyW');
  assert.equal(again.ok, true);
  const shared = proposeBind(b, 'pad', 'spawnMod', 'LT');
  assert.equal(shared.ok, true);
  assert.equal(conflict(b, 'pad', 'spawnMod', 'LT'), null);
  const blocked = proposeBind(b, 'pad', 'respawn', 'Y');
  assert.equal(blocked.other, 'camera');
  const next = swapBind(b, 'kb', 'spawn', 'KeyW');
  assert.equal(next.kb.spawn, 'KeyW');
  assert.equal(next.kb.pedal, 'KeyN');
  assert.equal(b.kb.spawn, 'KeyN');
}

{
  let state = { point: null, latch: false };
  let r = spawnHold(state, false, rider());
  assert.equal(r.event, null);
  assert.equal(r.point, null);
  for (const [name, over] of [['air', { air: true }], ['lift', { lift: true }], ['speed', { speed: SPAWN_SLOW + 1 }], ['blocked', { blocked: true }], ['ground', { rideable: false }], ['timed', { timed: true }]]) {
    r = spawnHold(state, true, rider(over));
    assert.equal(r.event, 'reject', name);
    assert.equal(r.reason, name);
    assert.equal(r.point, null);
    assert.equal(spawnDenied(rider(over)), name);
    state.latch = false;
  }
  r = spawnHold(state, true, rider());
  assert.equal(r.event, 'set');
  assert.deepEqual(r.point, { x: 10, z: 20, yaw: 1.25 });
  r = spawnHold(state, true, rider());
  assert.equal(r.event, 'held');
  assert.deepEqual(r.point, { x: 10, z: 20, yaw: 1.25 });
  spawnHold(state, false, rider());
  r = spawnHold(state, true, rider({ x: 80, z: 20, yaw: 0.4 }));
  assert.equal(r.event, 'set');
  assert.deepEqual(r.point, { x: 80, z: 20, yaw: 0.4 });
  spawnHold(state, false, rider());
  const kept = spawnHold(state, true, rider({ x: 80, z: 20, timed: true }));
  assert.equal(kept.event, 'reject');
  assert.deepEqual(kept.point, { x: 80, z: 20, yaw: 0.4 });
  state.latch = false;
  r = spawnHold(state, true, rider({ x: 82, z: 21, yaw: 2 }));
  assert.equal(r.event, 'clear');
  assert.equal(r.point, null);
  spawnHold(state, false, rider());
  r = spawnHold(state, true, rider({ x: 0, z: 0, yaw: 0.2 }));
  assert.equal(r.event, 'set');
  clearSpawn(state);
  assert.equal(state.point, null);
}

{
  const cp = { x: 1, z: 2, yaw: 0, via: 'checkpoint' };
  const point = { x: 40, z: 80, yaw: 1.2 };
  const used = respawnChoice(point, cp, true);
  assert.equal(used.via, 'spawn');
  assert.equal(used.unranked, true);
  assert.deepEqual({ x: used.x, z: used.z, yaw: used.yaw }, point);
  const free = respawnChoice(point, cp, false);
  assert.equal(free.unranked, false);
  assert.equal(free.x, 40);
  const plain = respawnChoice(null, cp, true);
  assert.equal(plain.via, 'checkpoint');
  assert.equal(plain.unranked, false);
  assert.equal(plain.x, 1);
  const run = { unranked: false, spawnUsed: false };
  assert.equal(rankedRun(run, false), true);
  assert.equal(rankedRun({ ...run, spawnUsed: true }, false), false);
  assert.equal(rankedRun({ ...run, unranked: true }, false), false);
  assert.equal(rankedRun(run, true), false);
}

console.log('binds.test ok');
