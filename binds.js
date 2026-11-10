// Control bindings and the personal map marker. No Three.js, so the node tests can import it.
// A saved settings object may omit binds entirely. Missing actions use these defaults.

export const KB_DEFAULT = {
  steerLeft: 'KeyA', steerRight: 'KeyD',
  flipForward: 'KeyI', flipBack: 'KeyK',
  pedal: 'KeyW', brake: 'KeyS',
  pump: 'Space', counter: 'ShiftLeft',
  leanLeft: 'KeyQ', leanRight: 'KeyE',
  trick: 'KeyC', barspin: 'KeyU',
  respawn: 'KeyR', camera: 'KeyV', camReset: 'KeyX',
  gearUp: 'KeyG', gearDown: 'KeyF',
  pause: 'KeyP', map: 'KeyM', drone: 'KeyZ', help: 'KeyH', shop: 'KeyO',
  marker: 'KeyN', emote: 'KeyT',
  spotPrev: 'BracketLeft', spotNext: 'BracketRight',
};

export const PAD_DEFAULT = {
  respawn: 'B', camera: 'Y', camReset: 'X', pause: 'Start',
  map: 'Back', drone: 'Back', shop: 'X',
  gearUp: 'DU', gearDown: 'DD', spotPrev: 'DL', spotNext: 'DR', emote: 'DU',
  brake: 'LT', pedal: 'RT',
  markerClick: 'LS', markerMod: 'LT',
};

// Same physical control on purpose: tap versus hold, or a two-button combo.
const SHARE = [
  ['map', 'drone'], ['camReset', 'shop'], ['gearUp', 'emote'], ['brake', 'markerMod'],
];

export const ACTIONS = [
  ['steerLeft', 'Steer left'], ['steerRight', 'Steer right'],
  ['flipForward', 'Frontflip (stick up)'], ['flipBack', 'Backflip (stick down)'],
  ['pedal', 'Pedal'], ['brake', 'Brake'],
  ['pump', 'Pump / preload'], ['counter', 'Counter-pump'],
  ['leanLeft', 'Lean left'], ['leanRight', 'Lean right'],
  ['trick', 'Trick modifier'], ['barspin', 'Barspin'],
  ['respawn', 'Respawn'], ['camera', 'Next camera'], ['camReset', 'Reset camera'],
  ['gearUp', 'Shift up'], ['gearDown', 'Shift down'],
  ['pause', 'Pause'], ['map', 'Map'], ['drone', 'FPV drone'], ['help', 'Controls help'], ['shop', 'Bike shop'],
  ['marker', 'Map marker'], ['emote', 'Emote wheel'],
  ['spotPrev', 'Previous teleport'], ['spotNext', 'Next teleport'],
];

const PAD_ONLY = new Set(['markerClick', 'markerMod']);

export function loadBinds(saved) {
  const kb = {}, pad = {};
  for (const id of Object.keys(KB_DEFAULT)) kb[id] = typeof saved?.kb?.[id] === 'string' && saved.kb[id] ? saved.kb[id] : KB_DEFAULT[id];
  for (const id of Object.keys(PAD_DEFAULT)) pad[id] = typeof saved?.pad?.[id] === 'string' && saved.pad[id] ? saved.pad[id] : PAD_DEFAULT[id];
  return { kb, pad };
}

function shareOk(a, b) { return SHARE.some(([x, y]) => (x === a && y === b) || (x === b && y === a)); }

export function conflict(binds, device, id, code) {
  const bag = binds[device] || {};
  for (const other of Object.keys(bag)) {
    if (other !== id && bag[other] === code && !shareOk(id, other)) return other;
  }
  return null;
}

export function proposeBind(binds, device, id, code) {
  const other = conflict(binds, device, id, code);
  if (other) return { ok: false, other };
  const next = loadBinds(binds);
  next[device][id] = code;
  return { ok: true, binds: next };
}

export function swapBind(binds, device, id, code) {
  const other = conflict(binds, device, id, code);
  const next = loadBinds(binds);
  const prev = next[device][id];
  next[device][id] = code;
  if (other) next[device][other] = prev;
  return next;
}

const KEY_NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', BracketLeft: '[', BracketRight: ']', Escape: 'Esc', Enter: 'Enter' };
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
const PAD_NAMES = { LS: 'L3', RS: 'R3', LT: 'LT', RT: 'RT', Start: 'Menu', Back: 'View', DU: 'D-pad ↑', DD: 'D-pad ↓', DL: 'D-pad ←', DR: 'D-pad →' };
export function padLabel(code) { return PAD_NAMES[code] || code || '—'; }

export function actionLabel(id) {
  return (ACTIONS.find(([k]) => k === id) || [id, id])[1];
}

// One personal marker. Pressing again within `near` metres clears it. Farther away replaces it.
// `latch` stops a held combo from firing every frame. LT by itself never places a marker.
export function markerHold(state, click, mod, x, z, near = 18) {
  if (!state) state = { marker: null, latch: false };
  if (click && mod) {
    if (state.latch) return { marker: state.marker, event: 'held', state };
    state.latch = true;
    const had = state.marker;
    const close = had && Math.hypot(had.x - x, had.z - z) < near;
    state.marker = close ? null : { x, z };
    return { marker: state.marker, event: close ? 'remove' : 'place', state };
  }
  state.latch = false;
  return { marker: state.marker, event: null, state };
}

export function devicesFor(id) {
  return { kb: id in KB_DEFAULT, pad: id in PAD_DEFAULT || PAD_ONLY.has(id) };
}
