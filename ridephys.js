// Riding rules shared by the game and the node checks.
// These are game-feel numbers, not measurements from Descenders or a lab.
export const G = 9.81;
export const MAX_SPEED = 30;
export const WHEEL_F = 0.66;   // front axle, metres ahead of the bike origin
export const WHEEL_R = 0.59;   // rear axle, metres behind
export const WB = WHEEL_F + WHEEL_R;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function axleXZ(x, z, yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return { fx: x + fx * WHEEL_F, fz: z + fz * WHEEL_F, rx: x - fx * WHEEL_R, rz: z - fz * WHEEL_R, fwx: fx, fwz: fz };
}

// Pitch that puts both tyre bottoms on hf (front ground) and hr (rear ground).
export function supportPitch(hf, hr) {
  const s = clamp((hf - hr) / WB, -0.92, 0.92);
  const pitch = Math.asin(s);
  const y = hf - Math.sin(pitch) * WHEEL_F;
  return { pitch, y };
}

// Speed change along travel. pedal at 0 adds no motor term.
// fakie + pedal slows the backward roll instead of driving it faster.
export function longAccel(o) {
  const slope = o.slope || 0, speed = o.speed || 0, pedal = o.pedal || 0, brake = o.brake || 0;
  const drag = o.drag == null ? 1 : o.drag, weight = o.weight || 0;
  let a = -G * slope / Math.sqrt(1 + slope * slope);
  if (o.fakie && pedal > 0.05) a -= pedal * 3.2;
  else if (pedal > 0.05) {
    const up = Math.max(0, slope);
    const cap = 15.28 + 2.78 * Math.min(1, up / 0.05);
    a += pedal * (2.5 + Math.min(3.5, up * 12)) * Math.max(0, 1 - speed / cap);
  }
  const wF = Math.max(0, -weight), wR = Math.max(0, weight);
  const brakeGain = 1 + 0.35 * wF - 0.25 * wR;
  a -= brake * 9 * brakeGain * Math.min(1, speed);
  a -= 0.0038 * drag * speed * speed + 0.2;
  a += o.pumpA || 0;
  return a;
}

// cr is the rider's preload change (compress > 0, extend < 0). A still suspension returns 0.
export function pumpAccel(cr, slope) {
  if (!cr) return 0;
  const pumpA = cr > 0
    ? cr * (Math.max(0, -slope) * 9 - Math.max(0, slope) * 4)
    : -cr * (Math.max(0, slope) * 3.5 - Math.max(0, -slope) * 1.5);
  return clamp(pumpA, -4, 6);
}

export function gripRate(o) {
  const brake = o.brake || 0, steer = o.steer || 0, speed = o.speed || 0, weight = o.weight || 0, slip = o.slip || 0;
  const agree = Math.max(-1, Math.min(1, steer * (o.bank || 0)));
  const sliding = (brake > 0.3 && Math.abs(steer) > 0.35 && speed > 5)
    || (brake > 0.45 && weight > 0.35 && Math.abs(steer) > 0.2 && speed > 5)
    || (agree < -0.28 && Math.abs(steer) > 0.35 && speed > 6);
  let grip = sliding ? 1.4 + Math.abs(slip) * 3 : ((o.onTrail ? 11 : 5) * (o.bikeGrip == null ? 1 : o.bikeGrip));
  if (!sliding) grip *= 1 + 0.2 * agree;
  return { sliding, grip };
}

// se: wrapped heading error vs travel. pe: pitch error vs the ground. Positive pe is nose-up.
export function landingCall(o) {
  const stab = o.stab == null ? 1 : o.stab;
  const sideLim = 0.85 * stab, pitchLim = 0.75 * stab;
  const absS = Math.abs(o.se || 0), pe = o.pe || 0, absP = Math.abs(pe);
  const hard = o.impact > 20, mid = !!o.trick, tweaked = Math.abs(o.tweak || 0) > 0.6;
  if (Math.abs(o.lean || 0) > 0.61) return { ok: false, reason: 'Leaned it over!' };
  const bad = hard ? 'Too hard a landing!' : mid ? 'Still mid-trick!' : tweaked ? "Didn't straighten the tweak!" : null;
  const fakie = absS > Math.PI - 0.6 && absP < pitchLim * 1.25;
  if (fakie) return bad ? { ok: false, reason: bad } : { ok: true, fakie: true, wheelie: false };
  // Rear wheel first: nose up, heading straight. Farther than this is a loop-out, not a landing.
  if (pe > pitchLim && pe < 1.05 && absS <= sideLim) return bad ? { ok: false, reason: bad } : { ok: true, fakie: false, wheelie: true };
  if (absS > sideLim) return { ok: false, reason: 'Landed sideways!' };
  if (absP > pitchLim) return { ok: false, reason: 'Over the bars!' };
  if (bad) return { ok: false, reason: bad };
  return { ok: true, fakie: false, wheelie: false };
}

export function wheelieStep(o) {
  const dt = o.dt || 1 / 120;
  const lean = o.lean || 0, brake = o.brake || 0, speed = o.speed || 0;
  // arm defaults on so the balance checks below still run. The game passes arm:false
  // until both sticks (or the keyboard key) have actually asked for a wheelie.
  const armed = o.arm !== false;
  const want = armed && !o.fakie && lean > 0.45 && brake < 0.35 && speed > 3.5 && o.rearOnGround;
  if (!o.active && !want) return { active: false, pitch: o.pitch || 0, tip: false };
  if (!o.rearOnGround || speed < 2.2 || o.fakie) return { active: false, pitch: (o.pitch || 0) * 0.85, tip: false };
  if (brake >= 0.35 || lean < 0.15) {
    let p = (o.pitch || 0) + (0 - (o.pitch || 0)) * Math.min(1, dt * 8);
    if (p < 0.08) return { active: false, pitch: p, tip: false };
    return { active: true, pitch: p, tip: false };
  }
  // Full lean-back aims past the balance point, so holding it loops out. A lighter lean holds.
  const target = 0.34 + Math.max(0, lean - 0.15) * 0.95;
  let p = (o.pitch || 0) + (target - (o.pitch || 0)) * Math.min(1, dt * 3.2);
  if (p > 1.05) return { active: false, pitch: p, tip: true };
  return { active: true, pitch: p, tip: false };
}

// Bike-space samples. Fatal points bail; bars are checked against rocks and trees, not the open trail.
export const BODY_POINTS = [
  { name: 'head', x: 0, y: 1.5, z: -0.42, fatal: true },
  { name: 'chest', x: 0, y: 1.05, z: -0.15, fatal: true },
  { name: 'bars', x: 0, y: 0.98, z: -0.62, fatal: false },
];

export function bodyPoint(x, y, z, yaw, pitch, p) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ly = p.y * cp - p.z * sp, lz = p.y * sp + p.z * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // three.js Y then the bike's forward (-Z) matches travel (-sin yaw, -cos yaw)
  return { x: x + p.x * cy + lz * sy, y: y + ly, z: z - p.x * sy + lz * cy, name: p.name, fatal: p.fatal };
}

export function fakieAim(yaw) { return wrap(yaw + Math.PI); }
