// Controllers: which family a pad is, how its raw buttons and axes map onto the standard (Xbox-position) layout,
// the button names to show for it, and the setup wizard that builds a map for any pad.
// No Three.js and no DOM, so the node tests can import it with fake Gamepad objects.
//
// Everything in the game reads the STANDARD layout by physical position:
//   A = bottom face button, B = right, X = left, Y = top (Xbox letters), LB/RB bumpers, LT/RT triggers,
//   Back/Start the small middle buttons, LS/RS stick clicks, DU/DD/DL/DR the d-pad.
// A Switch pad's bottom button is labelled B, so it is read as standard A and shown as "B".

export const STD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'DU', 'DD', 'DL', 'DR'];
export const STD_AXES = ['lx', 'ly', 'rx', 'ry'];

// ---------- which controller is this ----------
export function padIds(id) {
  const s = String(id || '');
  let m = s.match(/vendor:\s*([0-9a-f]{4}).*?product:\s*([0-9a-f]{4})/i);   // Chrome / Edge
  if (m) return { vendor: m[1].toLowerCase(), product: m[2].toLowerCase() };
  m = s.match(/^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i);                        // Firefox
  if (m) return { vendor: m[1].toLowerCase().padStart(4, '0'), product: m[2].toLowerCase().padStart(4, '0') };
  return { vendor: '', product: '' };
}
// Licensed wired Switch pads. PowerA, PDP and HORI also make Xbox pads, so the vendor alone is not enough.
const SWITCH_PRODUCTS = {
  '20d6': ['a711', 'a712', 'a713', 'a714', 'a715', 'a716', 'a717', 'a718', 'a719'],   // PowerA wired / enhanced wired
  '0e6f': ['0180', '0181', '0184', '0185', '0186', '0187', '0188'],                    // PDP Faceoff / Rock Candy for Switch
  '0f0d': ['0092', '00aa', '00c1', '00dc', '00f6'],                                    // HORI Pokken, HORIPAD for Switch
};
const THIRD_PARTY = new Set(Object.keys(SWITCH_PRODUCTS));
export function padFamily(gp) {
  const id = String(gp && gp.id || ''), { vendor, product } = padIds(id), std = gp && gp.mapping === 'standard';
  const xboxName = /xbox|xinput|x-box/i.test(id);
  if (/nintendo|switch|pro controller|joy-?con|pokken/i.test(id) || vendor === '057e') return 'switch';
  if (THIRD_PARTY.has(vendor) && SWITCH_PRODUCTS[vendor].includes(product)) return 'switch';
  if (/054c|playstation|dualsense|dualshock|ps[345]\b/i.test(id) || vendor === '054c') return 'ps';
  if (xboxName || vendor === '045e') return 'xbox';
  if (THIRD_PARTY.has(vendor) && !std) return 'switch';   // a non-XInput PowerA / PDP / HORI pad is almost always a Switch pad
  return std ? 'xbox' : 'generic';
}

// ---------- raw -> standard remap tables ----------
// A source is {b:i} (button i), {a:i, rest, sign} (axis i pushed from rest toward sign), or {hat:i, dir} (POV hat on axis i).
// Axes are {a:i, inv}. These are the DirectInput / HID layouts Chrome and Edge report on Windows when mapping is ''.
const b = i => ({ b: i }), hat = (i, dir) => ({ hat: i, dir });
const hatPad = i => ({ DU: hat(i, 'U'), DD: hat(i, 'D'), DL: hat(i, 'L'), DR: hat(i, 'R') });
const btnPad = { DU: b(12), DD: b(13), DL: b(14), DR: b(15) };
export const REMAPS = {
  // Nintendo Pro Controller over USB without Chrome's built-in mapping. Raw: 0 B, 1 A, 2 Y, 3 X.
  switchPro: { name: 'Nintendo Pro Controller', b: { A: b(0), B: b(1), X: b(2), Y: b(3), LB: b(4), RB: b(5), LT: b(6), RT: b(7),
    Back: b(8), Start: b(9), LS: b(10), RS: b(11), ...hatPad(9) }, ax: { lx: { a: 0 }, ly: { a: 1 }, rx: { a: 2 }, ry: { a: 3 } } },
  // Wired PowerA / PDP / HORI Switch pads (HID "Pokken" layout). Raw: 0 Y, 1 B, 2 A, 3 X; right stick on Z / Rz (axes 2, 5).
  switchWired: { name: 'Wired Switch controller', b: { A: b(1), B: b(2), X: b(0), Y: b(3), LB: b(4), RB: b(5), LT: b(6), RT: b(7),
    Back: b(8), Start: b(9), LS: b(10), RS: b(11), ...hatPad(9) }, ax: { lx: { a: 0 }, ly: { a: 1 }, rx: { a: 2 }, ry: { a: 5 } } },
};
export function tableFor(gp) {
  if (!gp || gp.mapping === 'standard' || padFamily(gp) !== 'switch') return null;
  const pro = padIds(gp.id).vendor === '057e' || /pro controller/i.test(gp.id), n = (gp.axes || []).length;
  let t = pro ? REMAPS.switchPro : REMAPS.switchWired;
  // Fewer than 6 axes: the right stick is on 2, 3. No axis 9: the d-pad is buttons 12-15 (otherwise 12 and 13 are Home and Capture).
  if (!pro && n < 6) t = { ...t, ax: { ...t.ax, ry: { a: 3 } } };
  if (n < 10) t = { ...t, b: { ...t.b, ...btnPad } };
  return t;
}

// ---------- reading ----------
const bval = (gp, i) => { const x = gp.buttons && gp.buttons[i]; if (!x) return 0; if (typeof x !== 'object') return +x || 0; return (x.pressed && !x.value) ? 1 : (x.value || 0); };
const aval = (gp, i) => { const v = gp.axes && gp.axes[i]; return Number.isFinite(v) ? v : 0; };
// POV hat on one axis: -1 up, then clockwise in 1/7 steps, up-left at +1. Anything past ±1.05 (1.28, 3.28) is centred.
export function hatDirs(v) {
  const o = { U: false, D: false, L: false, R: false };
  if (!Number.isFinite(v) || v < -1.05 || v > 1.05) return o;
  const dir = Math.round((v + 1) / (2 / 7));
  if (dir >= 1 && dir <= 3) o.R = true; if (dir >= 5 && dir <= 7) o.L = true;
  if (dir === 0 || dir === 1 || dir === 7) o.U = true; if (dir >= 3 && dir <= 5) o.D = true;
  return o;
}
function srcVal(gp, s) {
  if (!s) return 0;
  if (Array.isArray(s)) return Math.max(0, ...s.map(x => srcVal(gp, x)));
  if (s.b !== undefined) return bval(gp, s.b);
  if (s.hat !== undefined) return hatDirs(aval(gp, s.hat))[s.dir] ? 1 : 0;
  if (s.a !== undefined) {   // a trigger or d-pad direction on an axis: 0 at rest, 1 at the far end toward sign
    const rest = s.rest || 0, sign = s.sign || 1, span = sign > 0 ? 1 - rest : rest + 1;
    return Math.max(0, Math.min(1, (aval(gp, s.a) - rest) * sign / (span || 1)));
  }
  return 0;
}
const axVal = (gp, s) => s ? aval(gp, s.a) * (s.inv ? -1 : 1) : 0;
// Apply a profile (table or wizard). A wizard profile carries its own stick dead zone in out.dz.
export function readProfile(gp, p) {
  const out = { btn: {} };
  if (Number.isFinite(p.dz)) out.dz = p.dz;
  for (const k of STD_AXES) out[k] = axVal(gp, p.ax && p.ax[k]);
  for (const k of STD_BUTTONS) { const v = srcVal(gp, p.b && p.b[k]); if (k === 'LT' || k === 'RT') out[k.toLowerCase()] = v; else out.btn[k] = v > 0.5; }
  return out;
}

// Older fallbacks for pads with no table and no wizard profile (kept from before).
// Firefox (esp. Windows) often reports an Xbox One pad with mapping '' in XInput order:
// axes 0,1 left stick; 2 LT; 3,4 right stick; 5 RT (triggers rest at -1, full at +1, sometimes 0 until first touched).
function dpadNS(gp, li, ri) {
  let l = false, r = false, u = false, d = false;
  if (gp.axes.length >= 8) { const h = aval(gp, 6), v = aval(gp, 7); if (h < -0.5) l = true; if (h > 0.5) r = true; if (v < -0.5) u = true; if (v > 0.5) d = true; }
  if (gp.axes.length >= 10) { const o = hatDirs(gp.axes[9]); l ||= o.L; r ||= o.R; u ||= o.U; d ||= o.D; }
  if (gp.buttons.length > ri) { if (bval(gp, li) > 0.5) l = true; if (bval(gp, ri) > 0.5) r = true; if (bval(gp, li - 2) > 0.5) u = true; if (bval(gp, li - 1) > 0.5) d = true; }
  return { DL: l, DR: r, DU: u, DD: d };
}
export function makeTrigState() { return {}; }
function trigAxis(gp, i, seen) { const v = gp.axes[i]; if (v === undefined) return 0; const k = gp.index + '_' + i;
  if (v < -0.05) seen[k] = true;
  const t = seen[k] ? (v + 1) / 2 : v; return t < 0.04 ? 0 : Math.min(1, t); }

// Standard reading for any pad: {lx, ly, rx, ry, lt, rt, btn:{A..DR}, src, dz?}. Sticks are raw; the game applies
// the dead zone (a wizard profile's own one when it has it). `profiles` is the saved wizard maps keyed by gamepad.id.
export function readPad(gp, profiles, trig = {}) {
  const bv = i => bval(gp, i), ax = i => aval(gp, i);
  const prof = profiles && profiles[gp.id];
  if (prof && prof.b) return { ...readProfile(gp, prof), src: 'wizard' };
  if (gp.mapping === 'standard') {
    return { lx: ax(0), ly: ax(1), rx: ax(2), ry: ax(3), lt: bv(6), rt: bv(7), src: 'standard',
      btn: { A: bv(0) > 0.5, B: bv(1) > 0.5, X: bv(2) > 0.5, Y: bv(3) > 0.5, LB: bv(4) > 0.5, RB: bv(5) > 0.5, LS: bv(10) > 0.5, RS: bv(11) > 0.5,
        Back: bv(8) > 0.5, Start: bv(9) > 0.5, DL: bv(14) > 0.5, DR: bv(15) > 0.5, DU: bv(12) > 0.5, DD: bv(13) > 0.5 } };
  }
  const t = tableFor(gp);
  if (t) return { ...readProfile(gp, t), src: 'table' };
  if (gp.axes.length >= 6) {   // Firefox XInput-style: triggers on axes 2 & 5
    return { lx: ax(0), ly: ax(1), rx: ax(3), ry: ax(4), lt: trigAxis(gp, 2, trig), rt: trigAxis(gp, 5, trig), src: 'fallback',
      btn: { A: bv(0) > 0.5, B: bv(1) > 0.5, X: bv(2) > 0.5, Y: bv(3) > 0.5, LB: bv(4) > 0.5, RB: bv(5) > 0.5, LS: bv(8) > 0.5, RS: bv(9) > 0.5, Back: bv(6) > 0.5, Start: bv(7) > 0.5, ...dpadNS(gp, 13, 14) } };
  }
  // other non-standard layouts: right stick on 2,3, triggers as buttons 6,7
  return { lx: ax(0), ly: ax(1), rx: ax(2), ry: ax(3), lt: Math.max(bv(6), 0), rt: Math.max(bv(7), 0), src: 'fallback',
    btn: { A: bv(0) > 0.5, B: bv(1) > 0.5, X: bv(2) > 0.5, Y: bv(3) > 0.5, LB: bv(4) > 0.5, RB: bv(5) > 0.5, RS: bv(11) > 0.5, Back: bv(8) > 0.5, Start: bv(9) > 0.5, ...dpadNS(gp, 14, 15) } };
}
// A pad the wizard should be offered for: not standard, and either unknown or a known non-standard pad.
export function needsSetup(gp, profiles) {
  return !!gp && gp.mapping !== 'standard' && !(profiles && profiles[gp.id]);
}

// ---------- button names ----------
const DPAD = { DU: 'D-pad ↑', DD: 'D-pad ↓', DL: 'D-pad ←', DR: 'D-pad →' };
export const GLYPHS = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', LS: 'L3', RS: 'R3', Back: 'View', Start: 'Menu', ...DPAD, name: 'Xbox controller' },
  ps: { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', LS: 'L3', RS: 'R3', Back: 'Create', Start: 'Options', ...DPAD, name: 'PlayStation controller' },
  // Nintendo letters in Nintendo positions: the bottom button (standard A) is B, the right one is A, left Y, top X.
  switch: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', LS: 'L-stick click', RS: 'R-stick click', Back: '−', Start: '+', ...DPAD, name: 'Switch controller' },
};
GLYPHS.generic = { ...GLYPHS.xbox, name: 'Controller' };
export function glyph(code, family) { const g = GLYPHS[family] || GLYPHS.xbox; return g[code] || code || '—'; }
// Replace {A}, {LB}, {Start}… in a hint string with the names for this family.
export function padText(s, family) { return String(s).replace(/\{(A|B|X|Y|LB|RB|LT|RT|LS|RS|Back|Start|DU|DD|DL|DR)\}/g, (_, c) => glyph(c, family)); }

// ---------- setup wizard ----------
// Kid-friendly steps. kind 'btn' takes a button, a trigger axis or a hat / axis direction; 'stick' takes an axis.
export const WIZARD_STEPS = [
  { k: 'A', kind: 'btn', say: 'Press the BOTTOM face button. It picks things in menus.' },
  { k: 'B', kind: 'btn', say: 'Press the RIGHT face button. It is BACK and RESPAWN.' },
  { k: 'X', kind: 'btn', say: 'Press the LEFT face button. It resets the camera.' },
  { k: 'Y', kind: 'btn', say: 'Press the TOP face button. It changes the camera.' },
  { k: 'LB', kind: 'btn', say: 'Press the LEFT bumper (the top button on the left shoulder). Hold it for TRICKS.' },
  { k: 'RB', kind: 'btn', say: 'Press the RIGHT bumper (the top button on the right shoulder).' },
  { k: 'LT', kind: 'btn', say: 'Squeeze the LEFT trigger. That is the BRAKE.' },
  { k: 'RT', kind: 'btn', say: 'Squeeze the RIGHT trigger. That is PEDAL.' },
  { k: 'Back', kind: 'btn', say: 'Press the small LEFT middle button. It opens the MAP.' },
  { k: 'Start', kind: 'btn', say: 'Press the small RIGHT middle button. It is PAUSE.' },
  { k: 'LS', kind: 'btn', say: 'Push the LEFT stick straight down until it clicks.' },
  { k: 'RS', kind: 'btn', say: 'Push the RIGHT stick straight down until it clicks.' },
  { k: 'DU', kind: 'btn', say: 'Press the d-pad UP.' },
  { k: 'DD', kind: 'btn', say: 'Press the d-pad DOWN.' },
  { k: 'DL', kind: 'btn', say: 'Press the d-pad LEFT.' },
  { k: 'DR', kind: 'btn', say: 'Press the d-pad RIGHT.' },
  { k: 'lx', kind: 'stick', want: -1, say: 'Push the LEFT stick LEFT. That steers.' },
  { k: 'ly', kind: 'stick', want: -1, say: 'Push the LEFT stick UP.' },
  { k: 'rx', kind: 'stick', want: -1, say: 'Push the RIGHT stick LEFT. That leans the bike.' },
  { k: 'ry', kind: 'stick', want: -1, say: 'Push the RIGHT stick UP.' },
];
const PRESS = 0.6, CALM = 0.25;
const isHatRest = v => Number.isFinite(v) && Math.abs(v) > 1.05;
export function snapshot(gp) { return { axes: Array.from(gp.axes || [], v => +v || 0), buttons: Array.from(gp.buttons || [], (_, i) => bval(gp, i)) }; }
export function createWizard(gp, opts = {}) {
  return { id: gp.id, rest: snapshot(gp), i: 0, map: { b: {}, ax: {} }, used: [], armed: false, dz: opts.dz ?? 0.15, done: false, last: null };
}
// Is everything back at rest? A new input only counts after the previous one was let go.
function calm(w, gp) {
  const s = snapshot(gp);
  if (s.buttons.some((v, i) => v > 0.3 && !(w.rest.buttons[i] > 0.3))) return false;
  return s.axes.every((v, i) => { const r = w.rest.axes[i] ?? 0; return isHatRest(r) ? (isHatRest(v) || Math.abs(v - r) < 0.05) : Math.abs(v - r) < CALM; });
}
function detect(w, gp, step) {
  const s = snapshot(gp);
  if (step.kind === 'btn') {
    for (let i = 0; i < s.buttons.length; i++) if (s.buttons[i] > PRESS && !(w.rest.buttons[i] > 0.3)) return { b: i };
    let best = null, bd = PRESS;
    for (let i = 0; i < s.axes.length; i++) { const r = w.rest.axes[i] ?? 0, v = s.axes[i];
      if (isHatRest(r)) { if (!isHatRest(v)) { const d = hatDirs(v), dir = ['U', 'D', 'L', 'R'].find(k => d[k] && Object.values(d).filter(Boolean).length === 1); if (dir) return { hat: i, dir }; } continue; }
      const dv = Math.abs(v - r); if (dv > bd) { bd = dv; best = { a: i, rest: +r.toFixed(3), sign: v > r ? 1 : -1 }; } }
    return best;
  }
  let best = null, bd = PRESS;
  for (let i = 0; i < s.axes.length; i++) { const r = w.rest.axes[i] ?? 0, v = s.axes[i]; if (isHatRest(r)) continue;
    if (Math.abs(r) > 0.5) continue;   // a trigger resting at -1 is not a stick
    const dv = Math.abs(v - r); if (dv > bd) { bd = dv; best = { a: i, inv: Math.sign(v - r) !== step.want }; } }
  return best;
}
const sameSrc = (x, y) => x && y && x.b === y.b && x.a === y.a && x.hat === y.hat && x.dir === y.dir && x.sign === y.sign;
// Feed the current gamepad each frame. Returns 'wait' | 'got' | 'dup' | 'done'.
export function wizardFeed(w, gp) {
  if (w.done) return 'done';
  if (!w.armed) { if (calm(w, gp)) w.armed = true; return 'wait'; }
  const step = WIZARD_STEPS[w.i], got = detect(w, gp, step);
  if (!got) return 'wait';
  w.armed = false;
  if (step.kind === 'btn') {
    const other = Object.entries(w.map.b).find(([k, v]) => k !== step.k && sameSrc(v, got));
    if (other) { w.last = { dup: other[0] }; return 'dup'; }
    w.map.b[step.k] = got;
  } else {
    if (Object.entries(w.map.ax).some(([k, v]) => k !== step.k && v.a === got.a)) { w.last = { dup: 'stick' }; return 'dup'; }
    w.map.ax[step.k] = got;
  }
  w.last = { got: step.k }; w.i++;
  if (w.i >= WIZARD_STEPS.length) w.done = true;
  return w.done ? 'done' : 'got';
}
export function wizardSkip(w) { if (w.done) return; delete w.map.b[WIZARD_STEPS[w.i].k]; delete w.map.ax[WIZARD_STEPS[w.i].k]; w.i++; w.armed = false; if (w.i >= WIZARD_STEPS.length) w.done = true; }
export function wizardRedo(w) { if (w.i > 0) w.i--; const k = WIZARD_STEPS[w.i].k; delete w.map.b[k]; delete w.map.ax[k]; w.done = false; w.armed = false; }
export function wizardStep(w) { return WIZARD_STEPS[Math.min(w.i, WIZARD_STEPS.length - 1)]; }
// The saved profile. Steps that were skipped fall back to the pad's table (or the generic guess) when read.
export function wizardProfile(w, gp) {
  const base = (gp && tableFor(gp)) || { b: { A: b(0), B: b(1), X: b(2), Y: b(3), LB: b(4), RB: b(5), LT: b(6), RT: b(7), Back: b(8), Start: b(9), LS: b(10), RS: b(11), DU: b(12), DD: b(13), DL: b(14), DR: b(15) }, ax: { lx: { a: 0 }, ly: { a: 1 }, rx: { a: 2 }, ry: { a: 3 } } };
  return { v: 1, id: w.id, dz: w.dz, b: { ...base.b, ...w.map.b }, ax: { ...base.ax, ...w.map.ax }, at: Date.now() };
}
export function loadProfiles(raw) { if (!raw || typeof raw !== 'object') return {}; const o = {}; for (const [k, v] of Object.entries(raw)) if (v && v.b && v.ax) o[k] = v; return o; }
