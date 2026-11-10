import assert from 'node:assert/strict';
import { loadBinds, proposeBind, swapBind, conflict, KB_DEFAULT, PAD_DEFAULT, markerHold } from '../binds.js';

const fresh = () => loadBinds(null);

// Old saves have no binds key. Missing and blank actions stay on the defaults.
{
  const none = loadBinds(undefined);
  assert.equal(none.kb.pedal, KB_DEFAULT.pedal);
  assert.equal(none.kb.marker, 'KeyN');
  assert.equal(none.pad.respawn, 'B');
  assert.equal(none.pad.markerClick, 'LS');
  assert.equal(none.pad.markerMod, 'LT');
  const partial = loadBinds({ kb: { brake: 'KeyL', pedal: '' }, pad: { respawn: 'A' }, extra: true });
  assert.equal(partial.kb.brake, 'KeyL');
  assert.equal(partial.kb.pedal, 'KeyW');
  assert.equal(partial.kb.marker, 'KeyN');
  assert.equal(partial.pad.respawn, 'A');
  assert.equal(partial.pad.camera, PAD_DEFAULT.camera);
  assert.equal(JSON.parse(JSON.stringify(partial)).kb.brake, 'KeyL');
}

// A taken key is a conflict. The same key on the same action is not. Shared pairs are not.
{
  const b = fresh();
  assert.equal(conflict(b, 'kb', 'marker', 'KeyW'), 'pedal');
  const taken = proposeBind(b, 'kb', 'marker', 'KeyW');
  assert.equal(taken.ok, false);
  assert.equal(taken.other, 'pedal');
  assert.equal(b.kb.marker, 'KeyN', 'a rejected bind does not change the saved mapping');
  const again = proposeBind(b, 'kb', 'pedal', 'KeyW');
  assert.equal(again.ok, true);
  assert.equal(again.binds.kb.pedal, 'KeyW');
  const shared = proposeBind(b, 'pad', 'markerMod', 'LT');
  assert.equal(shared.ok, true);
  assert.equal(conflict(b, 'pad', 'markerMod', 'LT'), null);
  assert.equal(conflict(b, 'pad', 'drone', 'Back'), null);
  const blocked = proposeBind(b, 'pad', 'respawn', 'Y');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.other, 'camera');
}

// Swap exchanges the two actions and leaves the rest alone.
{
  const b = fresh();
  const next = swapBind(b, 'kb', 'marker', 'KeyW');
  assert.equal(next.kb.marker, 'KeyW');
  assert.equal(next.kb.pedal, 'KeyN');
  assert.equal(next.kb.brake, 'KeyS');
  assert.equal(b.kb.marker, 'KeyN');
  const back = loadBinds(next);
  assert.equal(back.kb.marker, 'KeyW');
  assert.equal(back.pad.brake, 'LT');
}

// L3+LT places one marker. LT alone does nothing. Near removes, far replaces.
{
  let state = { marker: null, latch: false };
  let r = markerHold(state, false, true, 10, 20);
  assert.equal(r.event, null);
  assert.equal(r.marker, null);
  r = markerHold(state, true, false, 10, 20);
  assert.equal(r.event, null);
  r = markerHold(state, true, true, 10, 20);
  assert.equal(r.event, 'place');
  assert.deepEqual(r.marker, { x: 10, z: 20 });
  r = markerHold(state, true, true, 10, 20);
  assert.equal(r.event, 'held');
  assert.deepEqual(r.marker, { x: 10, z: 20 });
  r = markerHold(state, false, false, 10, 20);
  assert.equal(r.event, null);
  assert.equal(state.latch, false);
  r = markerHold(state, true, true, 80, 20);
  assert.equal(r.event, 'place');
  assert.deepEqual(r.marker, { x: 80, z: 20 });
  assert.equal(state.marker, r.marker);
  r = markerHold(state, false, true, 80, 20);
  assert.equal(state.latch, false);
  r = markerHold(state, true, true, 90, 20);
  assert.equal(r.event, 'remove');
  assert.equal(r.marker, null);
  r = markerHold(state, true, true, 0, 0);
  assert.equal(r.event, 'held');
  assert.equal(r.marker, null);
}

console.log('binds.test ok');
