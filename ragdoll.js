// Lightweight bail ragdoll. Verlet particles and a few distance / bend constraints.
// No physics library. The rider meshes are posed from these points; the bike is one rigid body.

const G = 9.81;
const NAMES = ['pelvis','chest','head','shL','elL','haL','shR','elR','haR','hpL','knL','ftL','hpR','knR','ftR'];
const LOCAL = {
  pelvis:[0, 1.02, 0.20], chest:[0, 1.46, 0.02], head:[0, 1.72, -0.06],
  shL:[-0.20, 1.44, 0.00], elL:[-0.34, 1.18, -0.18], haL:[-0.22, 1.00, -0.40],
  shR:[0.20, 1.44, 0.00], elR:[0.34, 1.18, -0.18], haR:[0.22, 1.00, -0.40],
  hpL:[-0.12, 0.98, 0.18], knL:[-0.16, 0.58, 0.02], ftL:[-0.14, 0.18, -0.16],
  hpR:[0.12, 0.98, 0.18], knR:[0.16, 0.58, 0.02], ftR:[0.14, 0.18, -0.16],
};
const RADIUS = { pelvis:0.16, chest:0.16, head:0.13, shL:0.07, elL:0.06, haL:0.05, shR:0.07, elR:0.06, haR:0.05, hpL:0.08, knL:0.07, ftL:0.06, hpR:0.08, knR:0.07, ftR:0.06 };
const LINKS = [
  ['pelvis','chest'], ['chest','head'],
  ['chest','shL'], ['shL','elL'], ['elL','haL'],
  ['chest','shR'], ['shR','elR'], ['elR','haR'],
  ['pelvis','hpL'], ['hpL','knL'], ['knL','ftL'],
  ['pelvis','hpR'], ['hpR','knR'], ['knR','ftR'],
  ['shL','shR'], ['hpL','hpR'], ['pelvis','shL'], ['pelvis','shR'],
];
const DEG = Math.PI / 180;
// Bend: dot(incoming, outgoing). Straight is 1. min is the deepest fold, max blocks hyperextension.
const BENDS = [
  { a:'pelvis', b:'chest', c:'head', min:Math.cos(58 * DEG), max:1 },
  { a:'shL', b:'elL', c:'haL', min:Math.cos(150 * DEG), max:Math.cos(8 * DEG) },
  { a:'shR', b:'elR', c:'haR', min:Math.cos(150 * DEG), max:Math.cos(8 * DEG) },
  { a:'hpL', b:'knL', c:'ftL', min:Math.cos(145 * DEG), max:Math.cos(6 * DEG) },
  { a:'hpR', b:'knR', c:'ftR', min:Math.cos(145 * DEG), max:Math.cos(6 * DEG) },
];
const CONE = [
  { origin:'shL', point:'elL', max:115 * DEG, arm:true, side:-1 },
  { origin:'shR', point:'elR', max:115 * DEG, arm:true, side:1 },
  { origin:'hpL', point:'knL', max:78 * DEG, arm:false },
  { origin:'hpR', point:'knR', max:78 * DEG, arm:false },
  { origin:'chest', point:'head', max:55 * DEG, neck:true },
];

const hypot3 = (x, y, z) => Math.hypot(x, y, z);
function norm(x, y, z){ const l = hypot3(x, y, z) || 1e-6; return [x / l, y / l, z / l, l]; }
function dot(a, b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b){ return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]; }

function bikeToWorld(S, x, y, z){
  const pitch = S.pitch || 0, yaw = S.yaw || 0;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return { x: S.x + x * cy + z1 * sy, y: S.y + y1, z: S.z - x * sy + z1 * cy };
}

function quatYawPitch(yaw, pitch){
  const hy = yaw * 0.5, hp = pitch * 0.5;
  const sy = Math.sin(hy), cy = Math.cos(hy), sp = Math.sin(hp), cp = Math.cos(hp);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}
function qnorm(q){
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
}
function qrot(q, x, y, z){
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}
function qspin(q, wx, wy, wz, dt){
  const hx = wx * dt * 0.5, hy = wy * dt * 0.5, hz = wz * dt * 0.5;
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  q[0] = qx + hx * qw + hy * qz - hz * qy;
  q[1] = qy - hx * qz + hy * qw + hz * qx;
  q[2] = qz + hx * qy - hy * qx + hz * qw;
  q[3] = qw - hx * qx - hy * qy - hz * qz;
  qnorm(q);
}

function torsoAxes(parts){
  const pel = parts.pelvis, ch = parts.chest;
  const up = norm(ch.x - pel.x, ch.y - pel.y, ch.z - pel.z);
  const side = norm(parts.shR.x - parts.shL.x, parts.shR.y - parts.shL.y, parts.shR.z - parts.shL.z);
  const s = norm(side[0] - up[0] * dot(side, up), side[1] - up[1] * dot(side, up), side[2] - up[2] * dot(side, up));
  const fwd = norm(...cross(up, s));
  return { up, side: s, fwd };
}

function keepDist(a, b, rest){
  let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const d = hypot3(dx, dy, dz) || 1e-6;
  let corr = (d - rest) / d * 0.5;
  const mag = Math.abs(corr) * d;
  if (mag > 0.2) corr *= 0.2 / mag;
  a.x += dx * corr; a.y += dy * corr; a.z += dz * corr;
  b.x -= dx * corr; b.y -= dy * corr; b.z -= dz * corr;
}

function keepBend(parent, joint, child, minDot, maxDot){
  const u = norm(joint.x - parent.x, joint.y - parent.y, joint.z - parent.z);
  const v = norm(child.x - joint.x, child.y - joint.y, child.z - joint.z);
  let d = dot(u, v);
  if (d > 1) d = 1; else if (d < -1) d = -1;
  if (d >= minDot && d <= maxDot) return 0;
  const target = d < minDot ? minDot : maxDot;
  let px = v[0] - u[0] * d, py = v[1] - u[1] * d, pz = v[2] - u[2] * d;
  let pl = hypot3(px, py, pz);
  if (pl < 1e-5){
    const ax = Math.abs(u[0]) < 0.8 ? 1 : 0, ay = ax ? 0 : 1;
    px = u[1] * 0 - u[2] * ay; py = u[2] * ax - u[0] * 0; pz = u[0] * ay - u[1] * ax;
    pl = hypot3(px, py, pz) || 1;
  }
  px /= pl; py /= pl; pz /= pl;
  const s = Math.sqrt(Math.max(0, 1 - target * target));
  const nx = u[0] * target + px * s, ny = u[1] * target + py * s, nz = u[2] * target + pz * s;
  const vl = v[3];
  child.x += (joint.x + nx * vl - child.x) * 0.75;
  child.y += (joint.y + ny * vl - child.y) * 0.75;
  child.z += (joint.z + nz * vl - child.z) * 0.75;
  return Math.max(0, minDot - d, d - maxDot);
}

function keepCone(origin, point, ax, ay, az, maxAng){
  const minDot = Math.cos(maxAng);
  const v = norm(point.x - origin.x, point.y - origin.y, point.z - origin.z);
  const d = v[0] * ax + v[1] * ay + v[2] * az;
  if (d >= minDot) return 0;
  let px = v[0] - ax * d, py = v[1] - ay * d, pz = v[2] - az * d;
  let pl = hypot3(px, py, pz);
  if (pl < 1e-5){ px = ay; py = -ax; pz = 0; pl = hypot3(px, py, pz) || 1; }
  px /= pl; py /= pl; pz /= pl;
  const s = Math.sin(maxAng);
  const nx = ax * minDot + px * s, ny = ay * minDot + py * s, nz = az * minDot + pz * s;
  point.x = origin.x + nx * v[3];
  point.y = origin.y + ny * v[3];
  point.z = origin.z + nz * v[3];
  return minDot - d;
}

function hitGround(p, gy, bounce, grip){
  const r = p.r;
  const floor = gy + r;
  if (p.y > floor + 0.05) return;
  const vy = p.y - p.py;
  if (p.y < floor) p.y = floor;
  if (vy < -0.03) p.py = p.y + vy * bounce;
  else p.py = p.y;
  const horiz = Math.hypot(p.x - p.px, p.z - p.pz);
  const keep = horiz < 0.01 ? grip : 0.86;
  p.px = p.x - (p.x - p.px) * keep;
  p.pz = p.z - (p.z - p.pz) * keep;
}

function pushOut(p, nx, ny, nz, pen, bounce){
  p.x += nx * pen; p.y += ny * pen; p.z += nz * pen;
  const vx = p.x - p.px, vy = p.y - p.py, vz = p.z - p.pz;
  const vn = vx * nx + vy * ny + vz * nz;
  if (vn < 0){
    p.px += nx * vn * (1 + bounce);
    p.py += ny * vn * (1 + bounce);
    p.pz += nz * vn * (1 + bounce);
    p.px = p.x - (p.x - p.px) * 0.9;
    p.pz = p.z - (p.z - p.pz) * 0.9;
  }
}

function hitSolid(p, s){
  if (s.k === 'sph'){
    const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
    const d = hypot3(dx, dy, dz) || 1e-6;
    const min = s.r + p.r;
    if (d < min) pushOut(p, dx / d, dy / d, dz / d, min - d, 0.2);
    return;
  }
  const y = Math.max(s.y0, Math.min(s.y1, p.y));
  const dx = p.x - s.x, dy = p.y - y, dz = p.z - s.z;
  const d = hypot3(dx, dy, dz) || 1e-6;
  const min = s.r + p.r;
  if (d < min) pushOut(p, dx / d, dy / d, dz / d, min - d, 0.18);
}

const _solids = [];
function collide(parts, world){
  const pel = parts.pelvis;
  _solids.length = 0;
  if (world.solids) world.solids(pel.x, pel.z, _solids);
  const half = world.half || 0;
  for (const name of NAMES){
    const p = parts[name];
    if (half){
      const lim = half - 4;
      if (p.x > lim){ p.x = lim; p.px = Math.max(p.px, p.x); }
      if (p.x < -lim){ p.x = -lim; p.px = Math.min(p.px, p.x); }
      if (p.z > lim){ p.z = lim; p.pz = Math.max(p.pz, p.z); }
      if (p.z < -lim){ p.z = -lim; p.pz = Math.min(p.pz, p.z); }
    }
    hitGround(p, world.ground(p.x, p.z), 0.22, 0.82);
    for (let i = 0; i < _solids.length; i++) hitSolid(p, _solids[i]);
  }
}

function solve(rag){
  const parts = rag.parts;
  let slack = 0;
  for (let n = 0; n < 4; n++) for (let i = 0; i < rag.links.length; i++){ const L = rag.links[i]; keepDist(parts[L.a], parts[L.b], L.rest); }
  const axes = torsoAxes(parts);
  for (let i = 0; i < BENDS.length; i++){ const b = BENDS[i]; slack = Math.max(slack, keepBend(parts[b.a], parts[b.b], parts[b.c], b.min, b.max)); }
  for (let i = 0; i < CONE.length; i++){
    const c = CONE[i];
    let ax, ay, az;
    if (c.neck){ ax = axes.up[0]; ay = axes.up[1]; az = axes.up[2]; }
    else if (c.arm){
      const r = c.side < 0 ? rag.armL : rag.armR;
      ax = axes.side[0] * r[0] + axes.up[0] * r[1] + axes.fwd[0] * r[2];
      ay = axes.side[1] * r[0] + axes.up[1] * r[1] + axes.fwd[1] * r[2];
      az = axes.side[2] * r[0] + axes.up[2] * r[1] + axes.fwd[2] * r[2];
    } else {
      ax = -axes.up[0]; ay = -axes.up[1]; az = -axes.up[2];
    }
    slack = Math.max(slack, keepCone(parts[c.origin], parts[c.point], ax, ay, az, c.max));
  }
  for (let i = 0; i < rag.links.length; i++){ const L = rag.links[i]; keepDist(parts[L.a], parts[L.b], L.rest); }
  rag.slack = slack;
}

function finiteP(p){ return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.px) && Number.isFinite(p.py) && Number.isFinite(p.pz); }

export function spawnRagdoll(S){
  const parts = {};
  for (const name of NAMES){
    const w = bikeToWorld(S, LOCAL[name][0], LOCAL[name][1], LOCAL[name][2]);
    parts[name] = { x:w.x, y:w.y, z:w.z, px:w.x, py:w.y, pz:w.z, r:RADIUS[name] };
  }
  const vx = Number.isFinite(S.vx) ? S.vx : -Math.sin(S.yaw || 0) * (S.speed || 0);
  const vz = Number.isFinite(S.vz) ? S.vz : -Math.cos(S.yaw || 0) * (S.speed || 0);
  const vy = (Number.isFinite(S.vy) ? S.vy : 0) + 1.4;
  const sp = Math.min(28, hypot3(vx, vy, vz));
  const wx = 1.5 + Math.min(3.5, sp * 0.08) * ((S.pitch || 0) >= 0 ? 1 : -1);
  const wy = (S.wYaw || 0) * 0.35 + (S.spin || 0) * 0.4;
  const wz = 2.1 + Math.min(2, Math.abs(S.lean || 0));
  const pel = parts.pelvis;
  for (const name of NAMES){
    const p = parts[name];
    const rx = p.x - pel.x, ry = p.y - pel.y, rz = p.z - pel.z;
    const tx = wy * rz - wz * ry, ty = wz * rx - wx * rz, tz = wx * ry - wy * rx;
    const dt = 1 / 120;
    p.px = p.x - (vx + tx) * dt;
    p.py = p.y - (vy + ty) * dt;
    p.pz = p.z - (vz + tz) * dt;
  }
  const links = LINKS.map(([a, b]) => {
    const A = parts[a], B = parts[b];
    return { a, b, rest: hypot3(B.x - A.x, B.y - A.y, B.z - A.z) };
  });
  const axes = torsoAxes(parts);
  const armDir = (sh, el) => {
    const v = norm(el.x - sh.x, el.y - sh.y, el.z - sh.z);
    return [dot(v, axes.side), dot(v, axes.up), dot(v, axes.fwd)];
  };
  const yaw = S.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const bike = {
    x: S.x + cy * 0.45, y: S.y + 0.2, z: S.z - sy * 0.45,
    q: quatYawPitch(yaw, S.pitch || 0),
    vx: vx + cy * 2.4, vy: vy * 0.35 + 0.6, vz: vz - sy * 2.4,
    wx: wx + 2.2, wy: 1.3, wz: -3.4,
  };
  return { on:true, parts, links, bike, armL: armDir(parts.shL, parts.elL), armR: armDir(parts.shR, parts.elR), slack:0, dt:1/120 };
}

export function stepRagdoll(rag, dt, world){
  dt = Math.max(0.001, Math.min(0.05, dt));
  rag.dt = dt;
  const damp = Math.pow(0.55, dt);
  const parts = rag.parts;
  for (const name of NAMES){
    const p = parts[name];
    let vx = (p.x - p.px) * damp;
    let vy = (p.y - p.py) * damp - G * dt * dt;
    let vz = (p.z - p.pz) * damp;
    const m = hypot3(vx, vy, vz), cap = 40 * dt;
    if (m > cap){ const s = cap / m; vx *= s; vy *= s; vz *= s; }
    p.px = p.x; p.py = p.y; p.pz = p.z;
    p.x += vx; p.y += vy; p.z += vz;
  }
  collide(parts, world);
  solve(rag);
  collide(parts, world);
  for (const name of NAMES){
    const p = parts[name];
    if (!finiteP(p)){ p.x = p.px = parts.pelvis.px; p.y = p.py = parts.pelvis.py; p.z = p.pz = parts.pelvis.pz; }
  }
  stepBike(rag.bike, dt, world);
}

function stepBike(b, dt, world){
  b.vy -= G * dt;
  b.vx *= Math.pow(0.45, dt); b.vy *= Math.pow(0.7, dt); b.vz *= Math.pow(0.45, dt);
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  qspin(b.q, b.wx, b.wy, b.wz, dt);
  if (![b.x, b.y, b.z, b.q[0], b.q[1], b.q[2], b.q[3]].every(Number.isFinite)){
    b.q = [0, 0, 0, 1]; b.wx = b.wy = b.wz = 0; b.vx = b.vy = b.vz = 0;
  }
  const wheels = [[0, 0.36, -0.62], [0, 0.36, 0.55], [0, 0.85, 0.05]];
  let hit = 0;
  for (let i = 0; i < wheels.length; i++){
    const w = wheels[i];
    const r = qrot(b.q, w[0], w[1], w[2]);
    const x = b.x + r[0], y = b.y + r[1], z = b.z + r[2];
    const gy = world.ground(x, z) + 0.04;
    if (y < gy){
      hit++;
      b.y += gy - y;
      if (b.vy < 0) b.vy = -b.vy * 0.28;
      b.vx *= 0.9; b.vz *= 0.9;
      b.wx *= 0.82; b.wz *= 0.82;
    }
  }
  const ang = hit ? 0.94 : 0.992;
  b.wx *= ang; b.wy *= hit ? 0.96 : 0.996; b.wz *= ang;
  const capA = 14;
  b.wx = Math.max(-capA, Math.min(capA, b.wx));
  b.wy = Math.max(-capA, Math.min(capA, b.wy));
  b.wz = Math.max(-capA, Math.min(capA, b.wz));
  if (world.half){
    const lim = world.half - 4;
    if (b.x > lim){ b.x = lim; b.vx = Math.min(0, b.vx); }
    if (b.x < -lim){ b.x = -lim; b.vx = Math.max(0, b.vx); }
    if (b.z > lim){ b.z = lim; b.vz = Math.min(0, b.vz); }
    if (b.z < -lim){ b.z = -lim; b.vz = Math.max(0, b.vz); }
  }
}

export function ragdollReport(rag, ground){
  const pel = rag.parts.pelvis;
  let finite = finiteP(pel), spread = 0;
  for (const name of NAMES){
    const p = rag.parts[name];
    if (!finiteP(p)) finite = false;
    spread = Math.max(spread, hypot3(p.x - pel.x, p.y - pel.y, p.z - pel.z));
  }
  const dt = rag.dt || 1 / 120;
  const speed = hypot3(pel.x - pel.px, pel.y - pel.py, pel.z - pel.pz) / dt;
  let slack = 0;
  for (let i = 0; i < BENDS.length; i++){
    const b = BENDS[i], A = rag.parts[b.a], J = rag.parts[b.b], C = rag.parts[b.c];
    const u = norm(J.x - A.x, J.y - A.y, J.z - A.z), v = norm(C.x - J.x, C.y - J.y, C.z - J.z);
    let d = dot(u, v); if (d > 1) d = 1; else if (d < -1) d = -1;
    slack = Math.max(slack, min0(b.min - d), min0(d - b.max));
  }
  const axes = torsoAxes(rag.parts);
  for (let i = 0; i < CONE.length; i++){
    const c = CONE[i], O = rag.parts[c.origin], P = rag.parts[c.point];
    const v = norm(P.x - O.x, P.y - O.y, P.z - O.z);
    let ax, ay, az;
    if (c.neck){ ax = axes.up[0]; ay = axes.up[1]; az = axes.up[2]; }
    else if (c.arm){
      const r = c.side < 0 ? rag.armL : rag.armR;
      ax = axes.side[0] * r[0] + axes.up[0] * r[1] + axes.fwd[0] * r[2];
      ay = axes.side[1] * r[0] + axes.up[1] * r[1] + axes.fwd[1] * r[2];
      az = axes.side[2] * r[0] + axes.up[2] * r[1] + axes.fwd[2] * r[2];
    } else { ax = -axes.up[0]; ay = -axes.up[1]; az = -axes.up[2]; }
    const d = v[0] * ax + v[1] * ay + v[2] * az;
    slack = Math.max(slack, min0(Math.cos(c.max) - d));
  }
  const b = rag.bike;
  const bikeSpeed = hypot3(b.vx, b.vy, b.vz);
  const gap = pel.y - ground(pel.x, pel.z);
  const bikeGap = b.y - ground(b.x, b.z);
  return {
    finite, spread:+spread.toFixed(3), speed:+speed.toFixed(2), gap:+gap.toFixed(2),
    slack:+slack.toFixed(3), bikeSpeed:+bikeSpeed.toFixed(2), bikeGap:+bikeGap.toFixed(2),
    bikeFinite: [b.x, b.y, b.z, b.vx, b.vy, b.vz].every(Number.isFinite),
  };
}
function min0(v){ return v > 0 ? v : 0; }
