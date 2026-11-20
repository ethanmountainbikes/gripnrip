// pad.js on its own: family detection, remap tables, glyph sets and the wizard, with fake Gamepad objects.
import assert from 'node:assert/strict';
import { padFamily, padIds, readPad, tableFor, glyph, padText, hatDirs, needsSetup, createWizard, wizardFeed, wizardSkip, wizardRedo, wizardProfile, WIZARD_STEPS, loadProfiles } from '../pad.js';

const fake = (id, mapping, nb = 16, na = 4) => { const gp = { index: 0, id, mapping, connected: true,
  buttons: Array.from({ length: nb }, () => ({ pressed: false, value: 0 })), axes: Array.from({ length: na }, (_, i) => i === 9 ? 1.2857 : 0) };
  gp.press = (i, on = true) => { gp.buttons[i] = { pressed: on, value: on ? 1 : 0 }; return gp; }; return gp; };
const pressedOf = m => Object.keys(m.btn).filter(k => m.btn[k]);

// ids and families
assert.deepEqual(padIds('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), { vendor: '057e', product: '2009' });
assert.deepEqual(padIds('57e-2009-Pro Controller'), { vendor: '057e', product: '2009' });
assert.equal(padFamily(fake('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard')), 'xbox');
assert.equal(padFamily(fake('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'standard')), 'ps');
assert.equal(padFamily(fake('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'standard')), 'ps');
assert.equal(padFamily(fake('Pro Controller (Vendor: 057e Product: 2009)', '')), 'switch');
assert.equal(padFamily(fake('Core Wired Controller (Vendor: 20d6 Product: a711)', '')), 'switch');
assert.equal(padFamily(fake('HORIPAD S (Vendor: 0f0d Product: 00c1)', '')), 'switch');
assert.equal(padFamily(fake('Faceoff Wired Pro Controller for Nintendo Switch (Vendor: 0e6f Product: 0180)', '')), 'switch');
// PDP and PowerA also make Xbox pads: an XInput one stays Xbox
assert.equal(padFamily(fake('Afterglow (XInput STANDARD GAMEPAD) Vendor: 0e6f Product: 02a8', 'standard')), 'xbox');
assert.equal(padFamily(fake('Some Pad (STANDARD GAMEPAD Vendor: 20d6 Product: 2001)', 'standard')), 'xbox');
assert.equal(padFamily(fake('USB Gamepad (Vendor: 0079 Product: 0006)', '')), 'generic');
assert.equal(padFamily(fake('USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0006)', 'standard')), 'xbox');

// tables only for non-standard Switch pads; Chrome's own standard mapping is already positional
assert.equal(tableFor(fake('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'standard')), null);
const pro = fake('Pro Controller (Vendor: 057e Product: 2009)', '', 16, 10);
assert.deepEqual(pressedOf(readPad(pro.press(0), {})), ['A']); pro.press(0, false);
assert.deepEqual(pressedOf(readPad(pro.press(1), {})), ['B']); pro.press(1, false);
assert.equal(readPad(pro.press(7), {}).rt, 1); pro.press(7, false);
pro.axes[9] = -0.7143; assert.deepEqual(pressedOf(readPad(pro, {})).sort(), ['DR', 'DU']); pro.axes[9] = 1.2857;
assert.equal(readPad(pro, {}).src, 'table');
// a wired pad with no hat axis reads the d-pad from buttons 12-15 instead
const wired4 = fake('Core Wired Controller (Vendor: 20d6 Product: a711)', '', 16, 4);
assert.deepEqual(pressedOf(readPad(wired4.press(13), {})), ['DD']);
const wired10 = fake('Core Wired Controller (Vendor: 20d6 Product: a711)', '', 16, 10);
assert.deepEqual(pressedOf(readPad(wired10.press(12), {})), [], 'Home is not d-pad up when the d-pad is a hat');

// hat decoding
assert.deepEqual(hatDirs(1.2857), { U: false, D: false, L: false, R: false });
assert.deepEqual(hatDirs(-1), { U: true, D: false, L: false, R: false });
assert.deepEqual(hatDirs(0.1429), { U: false, D: true, L: false, R: false });

// glyphs
assert.equal(glyph('A', 'xbox'), 'A'); assert.equal(glyph('A', 'ps'), '✕'); assert.equal(glyph('A', 'switch'), 'B');
assert.equal(glyph('B', 'switch'), 'A'); assert.equal(glyph('X', 'switch'), 'Y'); assert.equal(glyph('Y', 'switch'), 'X');
assert.equal(glyph('RT', 'switch'), 'ZR'); assert.equal(glyph('LB', 'switch'), 'L'); assert.equal(glyph('Start', 'switch'), '+'); assert.equal(glyph('Back', 'switch'), '−');
assert.equal(glyph('Y', 'ps'), '△'); assert.equal(glyph('RT', 'ps'), 'R2'); assert.equal(glyph('Start', 'xbox'), 'Menu');
assert.equal(padText('{A} / Enter · {B} back · {LB}/{RB}', 'switch'), 'B / Enter · A back · L/R');

// wizard: setup needed for non-standard pads only, and a full run with one skip and one redo
const pad = fake('USB Gamepad (Vendor: 0079 Product: 0006)', '', 14, 10);
assert.equal(needsSetup(pad, {}), true);
assert.equal(needsSetup(fake('x', 'standard'), {}), false);
const w = createWizard(pad);
const clear = () => { pad.buttons.forEach((_, i) => pad.press(i, false)); pad.axes.forEach((_, i) => pad.axes[i] = i === 9 ? 1.2857 : 0); };
const step = f => { clear(); assert.equal(wizardFeed(w, pad), 'wait'); f(); const r = wizardFeed(w, pad); clear(); return r; };
assert.equal(step(() => pad.press(3)), 'got');            // A
assert.equal(step(() => pad.press(3)), 'dup');            // B: same button again is refused
assert.equal(step(() => pad.press(2)), 'got');            // B
wizardRedo(w); assert.equal(w.i, 1);                      // redo B
assert.equal(step(() => pad.press(1)), 'got');            // B
for (const i of [0, 4, 5, 6, 7, 8, 9, 10, 11, 12]) assert.equal(step(() => pad.press(i)), 'got');   // X..RS
for (const v of [-1, 0.1429, 0.7143, -0.4286]) assert.equal(step(() => { pad.axes[9] = v; }), 'got');   // d-pad hat
assert.equal(step(() => { pad.axes[0] = -1; }), 'got');
wizardSkip(w);                                            // skip ly
assert.equal(step(() => { pad.axes[2] = 1; }), 'got');   // rx pushed left reads +1: inverted
assert.equal(step(() => { pad.axes[3] = -1; }), 'done');
const prof = wizardProfile(w, pad);
assert.deepEqual(prof.b.A, { b: 3 }); assert.deepEqual(prof.b.B, { b: 1 }); assert.deepEqual(prof.b.DL, { hat: 9, dir: 'L' });
assert.equal(prof.ax.rx.inv, true); assert.equal(prof.ax.lx.inv, false); assert.deepEqual(prof.ax.ly, { a: 1 }, 'a skipped stick keeps the guess');
const profiles = loadProfiles({ [pad.id]: prof, junk: 5 });
assert.deepEqual(Object.keys(profiles), [pad.id]);
assert.deepEqual(pressedOf(readPad(pad.press(3), profiles)), ['A']); clear();
pad.axes[2] = 0.8; assert.ok(readPad(pad, profiles).rx < -0.7); clear();
assert.equal(WIZARD_STEPS.length, 20);
console.log('pad.test ok');
