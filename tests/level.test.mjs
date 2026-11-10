import assert from 'node:assert/strict';
import { blankLevel, validateLevel, encodeLevel, decodeLevel, levelName, isPresetName, publicCodeOk, makeCode, startGate, ADJ, NOUN, VERB, LIMITS } from '../level.js';
import { fitLanding, aimOnTrail, loadEditorLevel, clearEditorLevel, featH, EDITOR_ORIGIN } from '../world.js';

const level = blankLevel('TESTLEVEL1');
level.objects.push({ kind: 'start', x: 0, z: 0, yaw: 0, size: 1 });
level.objects.push({ kind: 'jump', x: 12, z: 0, yaw: 0, size: 1.2 });
level.trails.push({ pts: [[0, 0], [20, 0], [40, 4]] });
assert.equal(validateLevel(level).ok, true);
assert.equal(isPresetName(levelName(level.name)), true);
assert.equal(isPresetName('My Custom Name'), false);
assert.equal(levelName([99, 0, 0]), null);
assert.ok(ADJ.every(w => typeof w === 'string' && !w.includes(' ')));
assert.ok(NOUN.every(w => typeof w === 'string'));
assert.ok(VERB.every(w => typeof w === 'string'));

const code = encodeLevel(level);
assert.ok(code.startsWith('GNR1'));
const back = decodeLevel(code);
assert.equal(back.objects.length, 2);
assert.equal(back.trails[0].pts.length, 3);
assert.deepEqual(back.name, level.name);
assert.equal(decodeLevel('GNR1NOTVALID'), null);

assert.equal(publicCodeOk('ABC23Z'), true);
assert.equal(publicCodeOk('FUCK12'), false);
assert.equal(publicCodeOk('ABC23I'), false);
assert.equal(publicCodeOk(makeCode(() => 0.1)), true);
for (let i = 0; i < 30; i++) assert.equal(publicCodeOk(makeCode()), true);

const huge = blankLevel('HUGELEVEL1');
for (let i = 0; i < LIMITS.objects + 1; i++) huge.objects.push({ kind: 'rock', x: i, z: 0, yaw: 0, size: 1 });
assert.equal(validateLevel(huge).ok, false);
assert.ok(validateLevel(huge).errors.includes('objects'));
assert.equal(encodeLevel(huge), null);

const gate = startGate(level);
assert.deepEqual(gate, { x: 0, z: 0, yaw: 0 });
const installed = loadEditorLevel(level);
assert.ok(installed.features > 0);
const jump = { kind: 'kicker', x: EDITOR_ORIGIN.x + 12, z: EDITOR_ORIGIN.z, yaw: 0, dx: 0, dz: -1, hw: 2, L: 6, p: t => t >= 0 && t <= 6 ? 1.4 * Math.pow(t / 6, 1.7) : 0 };
const before = jump.L;
fitLanding(jump, 10);
assert.ok(jump.L > before, 'landing extends the jump');
assert.equal(jump.landed, true);
const aimed = aimOnTrail({ ...jump, x: EDITOR_ORIGIN.x + 12, z: EDITOR_ORIGIN.z, yaw: 1, dx: -Math.sin(1), dz: -Math.cos(1), L: 8, hw: 2, p: jump.p }, [[EDITOR_ORIGIN.x, EDITOR_ORIGIN.z], [EDITOR_ORIGIN.x + 30, EDITOR_ORIGIN.z]]);
assert.ok(Math.abs(aimed.yaw + Math.PI / 2) < 0.2, 'yaw ' + aimed.yaw);
const h = featH(EDITOR_ORIGIN.x + 14, EDITOR_ORIGIN.z);
assert.ok(h > 0.05, 'placed jump has height ' + h);
clearEditorLevel();
assert.equal(featH(EDITOR_ORIGIN.x + 14, EDITOR_ORIGIN.z), 0);

console.log('level.test ok');
