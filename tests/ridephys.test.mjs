import assert from 'node:assert/strict';
import { longAccel, pumpAccel, landingCall, wheelieStep, bodyPoint } from '../ridephys.js';
import { BOULDERS, trails, features, rockTop, rockContact } from '../world.js';

const flat = longAccel({ slope: 0, speed: 8, pedal: 0, brake: 0, drag: 1, weight: 0, pumpA: 0 });
const up = longAccel({ slope: 0.12, speed: 8, pedal: 0, brake: 0, drag: 1, weight: 0, pumpA: 0 });
const down = longAccel({ slope: -0.12, speed: 8, pedal: 0, brake: 0, drag: 1, weight: 0, pumpA: 0 });
assert.ok(flat < 0, 'flat coast slows');
assert.ok(up < flat, 'uphill coast slows more than flat');
assert.ok(down > flat, 'downhill coast is faster than flat');
assert.ok(down > 0, 'this downhill grade overcomes drag at 8 m/s');
const motor = longAccel({ slope: 0, speed: 8, pedal: 0, brake: 0, drag: 1, weight: 0, pumpA: 0 });
const ped = longAccel({ slope: 0, speed: 8, pedal: 1, brake: 0, drag: 1, weight: 0, pumpA: 0 });
assert.ok(ped > motor, 'pedal adds speed the coast does not');
assert.equal(pumpAccel(0, -0.4), 0, 'still suspension does not pump');
assert.ok(pumpAccel(2, -0.3) > 0, 'compressing on a backside adds speed');
assert.ok(pumpAccel(-2, 0.3) > 0, 'extending on a face adds speed');
assert.ok(pumpAccel(2, 0.3) < 0, 'compressing on a face costs speed');

const fakie = landingCall({ se: Math.PI, pe: 0.1, stab: 1, impact: 4, trick: null, tweak: 0 });
assert.equal(fakie.ok && fakie.fakie, true);
const side = landingCall({ se: 1.2, pe: 0, stab: 1, impact: 4, trick: null, tweak: 0 });
assert.equal(side.ok, false);
assert.equal(side.reason, 'Landed sideways!');
const nose = landingCall({ se: 0, pe: -1.1, stab: 1, impact: 4, trick: null, tweak: 0 });
assert.equal(nose.reason, 'Over the bars!');
const rear = landingCall({ se: 0.1, pe: 0.9, stab: 1, impact: 6, trick: null, tweak: 0 });
assert.equal(rear.ok && rear.wheelie, true);
const endo = landingCall({ se: 0, pe: -0.2, stab: 1, impact: 4, trick: 'up', tweak: 0 });
assert.equal(endo.reason, 'Still mid-trick!');

let w = wheelieStep({ active: false, pitch: 0.1, lean: 0.8, brake: 0, speed: 7, dt: 1 / 30, rearOnGround: true, fakie: false });
assert.equal(w.active, true);
let pitch = 0.7, tip = false;
for (let i = 0; i < 80 && !tip; i++) { const s = wheelieStep({ active: true, pitch, lean: 1, brake: 0, speed: 7, dt: 1 / 30, rearOnGround: true, fakie: false }); pitch = s.pitch; tip = s.tip; }
assert.equal(tip, true, 'holding full lean-back loops out');
pitch = 0.3; tip = false;
for (let i = 0; i < 80; i++) { const s = wheelieStep({ active: true, pitch, lean: 0.5, brake: 0, speed: 7, dt: 1 / 30, rearOnGround: true, fakie: false }); pitch = s.pitch; tip = s.tip; }
assert.equal(tip, false, 'a moderate lean holds the wheelie');
w = wheelieStep({ active: false, pitch: 0, lean: 0.8, brake: 0, speed: 7, dt: 1 / 30, rearOnGround: true, fakie: true });
assert.equal(w.active, false, 'no wheelie while fakie');
w = wheelieStep({ active: false, pitch: 0.1, lean: 1, brake: 0, speed: 7, dt: 1 / 30, rearOnGround: true, fakie: false, arm: false });
assert.equal(w.active, false, 'lean alone does not start a wheelie');
let braked = 0.6;
for (let i = 0; i < 20; i++) { const s = wheelieStep({ active: true, pitch: braked, lean: 0.8, brake: 0.8, speed: 7, dt: 1 / 30, rearOnGround: true, fakie: false }); braked = s.pitch; if (!s.active) break; }
assert.ok(braked < 0.2, 'brake brings the front wheel down');

const fwd = bodyPoint(0, 0, 0, 0, 0, { x: 0, y: 0, z: -1, name: 'f', fatal: false });
assert.ok(Math.abs(fwd.x) < 1e-6 && Math.abs(fwd.z + 1) < 1e-6, 'yaw 0 faces -Z');
const yaw = Math.PI / 2;
const p = bodyPoint(0, 0, 0, yaw, 0, { x: 0, y: 0, z: -1, name: 'f', fatal: false });
assert.ok(Math.abs(p.x + Math.sin(yaw)) < 1e-6 && Math.abs(p.z + Math.cos(yaw)) < 1e-6, 'forward matches travel');

const rg = trails.find(t => t.name === 'Rock Garden');
const gardenFeats = features.filter(f => f.trail === rg.id);
const rockFeats = gardenFeats.filter(f => f.kind === 'rocks');
const dirtFeats = gardenFeats.filter(f => f.kind !== 'rocks');
const ang = BOULDERS.filter(b => b.ang);
assert.ok(ang.length > 8, 'rock garden has angular rocks');
assert.ok(dirtFeats.length > 0, 'rock garden keeps some non-rock features');
assert.ok(rockFeats.length > dirtFeats.length, 'most Rock Garden features are rocks');
let mismatch = 0;
for (const b of ang.slice(0, 12)) {
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  const mid = rockTop(b, b.x + b.r * 0.5 * c, b.z + b.r * 0.5 * s);
  if (Math.abs(mid - b.h * 0.5) > 0.02) mismatch++;
  const outside = rockTop(b, b.x + b.r * 1.2 * c, b.z + b.r * 1.2 * s);
  if (outside !== 0) mismatch++;
  const hit = rockContact(b, b.x, b.z);
  if (!hit) mismatch++;
  if (rockContact(b, b.x + b.r * 2, b.z)) mismatch++;
}
assert.equal(mismatch, 0, 'angular height matches the pyramid');
const smooth = BOULDERS.find(b => !b.ang);
assert.ok(smooth && rockTop(smooth, smooth.x, smooth.z) > 0, 'other gardens stay rideable domes');
console.log(JSON.stringify({ flat:+flat.toFixed(3), up:+up.toFixed(3), down:+down.toFixed(3), ped:+ped.toFixed(3), angular: ang.length, rockFeatures: rockFeats.length, otherFeatures: dirtFeats.length }, null, 2));
