// Dirt-jump lines and the pump track are one packed surface. Takeoffs face along the line.
import { PARK, features, featH, parkLayoutTag } from '../world.js';
const d = PARK.dir, sx = -d[1], sz = d[0];
const along = (x, z) => (x - PARK.x) * d[0] + (z - PARK.z) * d[1];
const latOf = (x, z) => (x - PARK.x) * -d[1] + (z - PARK.z) * d[0];
const XZ = (t, lat) => [PARK.x + d[0] * t + sx * lat, PARK.z + d[1] * t + sz * lat];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const fail = [];
const names = ['Beginner Tables', 'Intermediate Doubles', 'Pro Big Doubles', 'Slopestyle Mix'];
const lineYaw = Math.atan2(-d[0], -d[1]);
for (const name of names) {
  const jumps = features.filter(f => f.park === name && !f.groom && !f.rollin);
  if (!jumps.length) { fail.push(name + ' missing'); continue; }
  for (const f of jumps) if (Math.abs(wrap(f.yaw - lineYaw)) > 0.08) fail.push(name + ' ' + f.kind + ' yaw ' + f.yaw.toFixed(2));
  const lat = latOf(jumps[0].x, jumps[0].z);
  let t0 = 1e9, t1 = -1e9;
  for (const f of jumps) { t0 = Math.min(t0, along(f.x, f.z)); t1 = Math.max(t1, along(f.x + f.dx * f.L, f.z + f.dz * f.L)); }
  let low = 0;
  for (let t = t0; t <= t1; t += 1) { const [x, z] = XZ(t, lat); if (featH(x, z) < 0.05) low++; }
  if (low) fail.push(name + ' has ' + low + ' flat samples between the jumps');
}
const feet = names.map(name => features.find(f => f.park === name && f.rollin));
for (const f of feet) if (!f || featH(f.x, f.z) < 0.05) fail.push('drop-in has no tread');
let linkLow = 0;
for (const f of features) if (f.park === 'Park link' || f.park === 'Park return' || f.park === 'Park access') {
  const x = f.x + f.dx * f.L * 0.5, z = f.z + f.dz * f.L * 0.5;
  if (featH(x, z) < 0.05) linkLow++;
}
if (linkLow) fail.push('link/return/access gaps ' + linkLow);
const A = PARK.pump.A, B = PARK.pump.B, cx = PARK.pump.x, cz = PARK.pump.z;
let pumpLow = 0, pumpMin = 99;
for (let k = 0; k < 90; k++) {
  const a = k / 90 * Math.PI * 2;
  const x = cx + d[0] * A * Math.cos(a) + sx * B * Math.sin(a);
  const z = cz + d[1] * A * Math.cos(a) + sz * B * Math.sin(a);
  const h = featH(x, z);
  if (h < pumpMin) pumpMin = h;
  if (h < 0.1) pumpLow++;
}
if (pumpLow) fail.push('pump loop flat samples ' + pumpLow + ' min ' + pumpMin.toFixed(3));
const tag = parkLayoutTag();
if (!/^[0-9a-z]{4,8}$/.test(tag)) fail.push('layout tag ' + tag);
console.log(JSON.stringify({ fail, tag, groom: features.filter(f => f.groom).length, pumpMin: +pumpMin.toFixed(3) }));
if (fail.length) process.exit(1);
