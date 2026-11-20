// Rider-name rules shared by the game and the worker: shape, leetspeak, squashed repeats, decoration, false positives.
import assert from 'node:assert/strict';
import { checkName, nameProblem, unleet, collapse, nameParts, NAME_SAY } from '../names.js';

const ok = n => assert.equal(checkName(n).ok, true, `${n} should be allowed (${nameProblem(n)})`);
const no = (n, reason) => { const r = checkName(n); assert.equal(r.ok, false, `${n} should be refused`); if (reason) assert.equal(r.reason, reason, n); assert.ok(r.say); };

// shape: 3-12, ASCII letters and digits only
for (const n of ['Abc', 'GnarlyPine42', 'abcdefghijkl', 'X9Z', 'Rider007']) ok(n);
no('', 'empty'); no('ab', 'short'); no('abcdefghijklm', 'long');
for (const n of ['Gnarly Pine', 'Pine_42', 'Pine-42', 'Pine!', 'Piné', 'Pine😀', 'Pin\u200Be', 'Pi\u200Dne', 'Pine\u00A0', 'Ｐｉｎｅ', 'Рine', 'Pine\n', ' Pine']) no(n, 'chars');
no(null, 'empty'); no(42, 'empty');
assert.equal(checkName('Pine').say, undefined);
assert.equal(checkName('Pine 1').say, NAME_SAY.chars);

// normalization helpers
assert.deepEqual(unleet('Sh1t'), ['shit', 'shlt']);
assert.deepEqual(unleet('B00B5'), ['boobs']);
assert.equal(collapse('fuuuuck'), 'fuck');
assert.deepEqual(nameParts('BigAss99'), ['Big', 'Ass', '99']);

// caught: leetspeak, repeats, decoration, case, hidden inside
for (const n of ['sh1t', 'SH1T', 'Shiiit', 'fuuuck', 'Fuck', 'xXfuckXx', 'xXassXx', 'BigAss99', 'Assss', 'b00bs', '5lut', 'N1gga', 'F4gg0t',
  'P0rnStar', 'D1ckhead', 'Kunt', 'Cunt', 'C0ck', 'Wh0re', 'Rap3', 'Pedo', 'Tits', 'cum', 'SexyRider', 'Horny', 'Penis', 'Nazi88', 'Hitler',
  'KKKrew', 'Retard', 'Weed', 'Meth', 'Cocaine', 'Stoner', 'Xanax', 'Rider420', 'Rider69', 'Admin', 'Admin1', 'M0derat0r', 'Mod', 'ModRider',
  'Official', 'GripNRip', 'Gripnrip7', 'Staff', 'Support', 'Suicide', 'Kys', 'PeacockCock', 'ClassAss', 'ShitPeacock'])
  no(n, 'word');

// allowed: Scunthorpe-style real words and ordinary names
for (const n of ['Scunthorpe', 'Penistone', 'Peacock', 'Cockatoo', 'Hancock', 'Shiitake', 'Dickens', 'Arsenal', 'Therapist', 'Grape', 'Scrapes',
  'Basement', 'Button', 'Butterfly', 'Class', 'Classic', 'Grass', 'Bass', 'Compass', 'Assist', 'Assassin', 'Massive', 'Passion', 'Cassie',
  'Title', 'Titan', 'Cumulus', 'Cucumber', 'Document', 'Sussex', 'Analog', 'Canal', 'Shoe', 'Spoon', 'Spice', 'Raccoon', 'Cocoon', 'Mongoose',
  'Model', 'Modern', 'Method', 'Seaweed', 'Torpedo', 'Oxygen', 'Foxy', 'Hello', 'Bobby', 'Nigel', 'Devin', 'Devon', 'GnarlyPine42',
  'MuddyOtter', 'Sk8ter', 'Shred99', 'xXShredXx', 'Pine', 'Lilly', 'Willow', 'Puppy', 'Sparky', 'Rider007'])
  ok(n);

// digit runs: 4+ digits are a number (years, lucky numbers), shorter runs can be letters in disguise
for (const n of ['Ethan2015', 'Shredder1234', 'Rider1969', 'Ethan1999', 'Bike2020', 'Max123456', 'Tst123456', 'Zoe20162016', 'Rider1945'])
  ok(n);
for (const n of ['Ethan69', 'Rider690', 'Tst1488', 'Kid14888', 'Ethan8008', 'Rider58008', 'A55hole', 'B00bs', 'S3xy', 'BigA5569', 'A5512Kid', 'Ass2015', 'Sh1t1234'])
  no(n, 'word');
// nearly every generated CamelCase name that fits is allowed
const { NAME_A, NAME_B } = { NAME_A: ['Rapid','Turbo','Dusty','Rowdy','Sneaky','Mega','Gnarly','Flowy','Shreddy','Brave','Lucky','Swift','Muddy','Rad','Chill','Wild','Sunny','Rocky','Zippy','Epic','Steady','Bouncy','Speedy','Mighty','Sandy','Frosty','Pumped','Clever','Jolly','Sendy','Happy','Comet'],
  NAME_B: ['Marmot','Fox','Eagle','Goat','Lynx','Bear','Moose','Otter','Falcon','Badger','Coyote','Hawk','Ram','Wolf','Raven','Bison','Puma','Gecko','Owl','Hare','Elk','Beaver','Lizard','Viper','Yak','Panda','Tiger','Rhino','Koala','Bobcat','Heron','Orca'] };
const gen = NAME_A.flatMap(a => NAME_B.map(b => a + b)).filter(n => n.length <= 12);
assert.ok(gen.length > 900); const refused = gen.filter(n => !checkName(n).ok); assert.ok(refused.length <= 10, 'few generated names hit the filter (pumPEDOtter, comETHawk); the game skips those: ' + refused);
console.log('names.test ok');
