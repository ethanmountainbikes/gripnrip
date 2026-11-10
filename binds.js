// Control bindings and the personal respawn point. No Three.js, so the node tests can import it.
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
  spawn: 'KeyN', emote: 'KeyT',
  editorUndo: 'F6', editorRedo: 'F7', editorTest: 'F8', editorRotate: 'F9',
  editorBigger: 'Equal', editorSmaller: 'Minus',
  spotPrev: 'BracketLeft', spotNext: 'BracketRight',
};

export const PAD_DEFAULT = {
  respawn: 'B', camera: 'Y', camReset: 'X', pause: 'Start',
  map: 'Back', drone: 'Back', shop: 'X',
  gearUp: 'DU', gearDown: 'DD', spotPrev: 'DL', spotNext: 'DR', emote: 'DU',
  brake: 'LT', pedal: 'RT',
  spawnClick: 'LS', spawnMod: 'LT',
  editorBigger: 'LB', editorSmaller: 'RB', editorRotate: 'RS',
};

// Same physical control on purpose: tap versus hold, or a two-button combo.
const SHARE = [
  ['map', 'drone'], ['camReset', 'shop'], ['gearUp', 'emote'], ['brake', 'spawnMod'],
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
  ['spawn', 'Respawn point'], ['emote', 'Emote wheel'],
  ['editorUndo', 'Editor undo'], ['editorRedo', 'Editor redo'], ['editorTest', 'Editor test ride'],
  ['editorRotate', 'Editor rotate'], ['editorBigger', 'Editor bigger'], ['editorSmaller', 'Editor smaller'],
  ['spotPrev', 'Previous teleport'], ['spotNext', 'Next teleport'],
];

const PAD_ONLY = new Set(['spawnClick', 'spawnMod']);
const LEGACY = { spawn: 'marker', spawnClick: 'markerClick', spawnMod: 'markerMod' };

function savedCode(bag, id) {
  const v = bag?.[id];
  if (typeof v === 'string' && v) return v;
  const old = bag?.[LEGACY[id]];
  return typeof old === 'string' && old ? old : '';
}

export function loadBinds(saved) {
  const kb = {}, pad = {};
  for (const id of Object.keys(KB_DEFAULT)) kb[id] = savedCode(saved?.kb, id) || KB_DEFAULT[id];
  for (const id of Object.keys(PAD_DEFAULT)) pad[id] = savedCode(saved?.pad, id) || PAD_DEFAULT[id];
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

// Stopped or rolling slower than this can set a respawn point. Faster than this is still riding.
export const SPAWN_SLOW = 3;

// Why a point cannot be set, or null when the rider is stopped on rideable ground.
export function spawnDenied(rider) {
  if (!rider || rider.air) return 'air';
  if (rider.lift) return 'lift';
  if ((rider.speed || 0) > SPAWN_SLOW) return 'speed';
  if (rider.blocked) return 'blocked';
  if (rider.rideable === false) return 'ground';
  if (rider.timed) return 'timed';
  return null;
}

// One personal respawn point. `pressed` is the whole combo (L3+LT, or the keyboard key).
// Pressing again while standing on it clears it. A held combo fires once.
// A timed run cannot set one. LT by itself is not `pressed`.
export function spawnHold(state, pressed, rider, near = 4) {
  if (!state) state = { point: null, latch: false };
  if (!pressed) { state.latch = false; return { point: state.point, event: null, state }; }
  if (state.latch) return { point: state.point, event: 'held', state };
  state.latch = true;
  const reason = spawnDenied(rider);
  if (reason) return { point: state.point, event: 'reject', reason, state };
  const had = state.point;
  const close = had && Math.hypot(had.x - rider.x, had.z - rider.z) <= near;
  if (close) { state.point = null; return { point: null, event: 'clear', state }; }
  state.point = { x: rider.x, z: rider.z, yaw: rider.yaw || 0 };
  return { point: state.point, event: 'set', state };
}

export function clearSpawn(state) {
  if (!state) state = { point: null, latch: false };
  state.point = null;
  state.latch = false;
  return { point: null, event: 'clear', state };
}

// A set point replaces the checkpoint. Using it during a timed run is unranked.
export function respawnChoice(spawn, fallback, timed) {
  if (spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.z) && Number.isFinite(spawn.yaw)) {
    return { x: spawn.x, z: spawn.z, yaw: spawn.yaw, via: 'spawn', unranked: !!timed };
  }
  return { x: fallback.x, z: fallback.z, yaw: fallback.yaw, via: fallback.via || 'checkpoint', unranked: false };
}

// Cloud and local bests. A drone run is already unranked. A respawn point makes it unranked too.
export function rankedRun(run, droneOut) {
  return !!run && !droneOut && !run.unranked && !run.spawnUsed;
}

export function devicesFor(id) {
  return { kb: id in KB_DEFAULT, pad: id in PAD_DEFAULT || PAD_ONLY.has(id) };
}
