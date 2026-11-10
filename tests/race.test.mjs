import assert from 'node:assert/strict';
import { isRaceUnlocked, migrateCleared, advanceCheckpoint, checkpointsDone, shouldSubmit, clearKey, timeKey } from '../race.js';

const world = 0, id = 2, layout = 'ab12cd', other = 'zz99qq';
const gates = [{ s: 100 }, { s: 240 }, { s: 400 }];

assert.equal(isRaceUnlocked(null, null, world, id, layout), false);
assert.equal(isRaceUnlocked({}, {}, world, id, layout), false);
assert.equal(isRaceUnlocked({ [clearKey(world, id, other)]: 1 }, {}, world, id, layout), false);
assert.equal(isRaceUnlocked({}, { [timeKey(world, id, other)]: 84.2 }, world, id, layout), false);
assert.equal(isRaceUnlocked({}, { [timeKey(world, id, layout)]: 91.5 }, world, id, layout), true);
assert.equal(isRaceUnlocked({ [clearKey(world, id, layout)]: 1 }, {}, world, id, layout), true);

const migrated = migrateCleared(undefined, { [timeKey(world, id, layout)]: 70, [timeKey(world, 4, other)]: 80, 'time:0:2': 60 }, world, [
  { id, layout },
  { id: 4, layout: 'fresh1' },
]);
assert.equal(migrated[clearKey(world, id, layout)], 1);
assert.equal(migrated[clearKey(world, 4, 'fresh1')], undefined);
assert.equal(isRaceUnlocked(migrated, {}, world, id, layout), true);

let cp = -1;
cp = advanceCheckpoint(cp, 50, gates);
assert.equal(cp, -1);
cp = advanceCheckpoint(cp, 102, gates);
assert.equal(cp, 0);
cp = advanceCheckpoint(cp, 410, gates);
assert.equal(cp, 0, 'a later gate does not count while the middle one is open');
cp = advanceCheckpoint(cp, 250, gates);
assert.equal(cp, 1);
cp = advanceCheckpoint(cp, 405, gates);
assert.equal(cp, 2);
assert.equal(checkpointsDone(cp, gates.length), true);
assert.equal(checkpointsDone(-1, 0), true);

assert.equal(shouldSubmit(null, false), false);
assert.equal(shouldSubmit({ mode: 'free', cp: 2, cpCount: 3 }, false), false);
assert.equal(shouldSubmit({ mode: 'race', cp: 1, cpCount: 3 }, false), false);
assert.equal(shouldSubmit({ mode: 'race', cp: 2, cpCount: 3, spawnUsed: true }, false), false);
assert.equal(shouldSubmit({ mode: 'race', cp: 2, cpCount: 3 }, true), false);
assert.equal(shouldSubmit({ mode: 'race', cp: 2, cpCount: 3, unranked: true }, false), false);
assert.equal(shouldSubmit({ mode: 'race', cp: 2, cpCount: 3 }, false), true);

console.log('race.test ok');
