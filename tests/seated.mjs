// Shop, lift stations and (in Rampage) start decks sit on a flat pad. Corners and centre stay within 5 cm of that floor.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHOP, terrainH, LIFTS, spots, localXZ, trails, connectors, featH, trailDist, W } from '../world.js';

const LIM = 0.05;
const fail = [];
const gap = (x, z, floor) => Math.abs(terrainH(x, z) - floor);
function footprint(x, z, yaw, pts, floor){
  let worst = 0;
  for (const [lx, lz] of pts){
    const [wx, wz] = localXZ(x, z, yaw, lx, lz);
    worst = Math.max(worst, gap(wx, wz, floor));
  }
  return worst;
}
const shopPts = [[0, 0], [-6, -4.5], [6, -4.5], [-6, 4.5], [6, 4.5], [0, -8], [-9.5, 8], [9.5, -10], [0, -13]];
const shopFloor = terrainH(SHOP.x, SHOP.z);
const shopWorst = footprint(SHOP.x, SHOP.z, SHOP.yaw, shopPts, shopFloor);
if (shopWorst > LIM) fail.push('shop footprint ' + shopWorst.toFixed(3) + ' m');
const spot = spots.find(s => s.shop);
if (!spot || gap(spot.x, spot.z, shopFloor) > LIM) fail.push('shop teleport ' + (spot ? gap(spot.x, spot.z, shopFloor).toFixed(3) : 'missing'));

const deckPts = [[0, 0], [-4.5, -3.5], [4.5, -3.5], [-4.5, 3.5], [4.5, 3.5]];
for (const L of LIFTS) for (const [x, z, tag] of [[L.bx, L.bz, 'bottom'], [L.tx, L.tz, 'top']]){
  const worst = footprint(x, z, L.yaw, deckPts, terrainH(x, z));
  if (worst > LIM) fail.push('lift ' + L.short + ' ' + tag + ' ' + worst.toFixed(3) + ' m');
}

// Sign posts are sunk 0.4 m at their own sample. The ground within the post must stay above that.
let signWorst = 0;
for (const L of LIFTS){
  const ux = L.tx + L.dx * 7, uz = L.tz + L.dz * 7;
  let best = null;
  for (let r = 6; r <= 12; r += 1.5) for (let k = 0; k < 32; k++){
    const a = k / 32 * Math.PI * 2, x = ux + Math.cos(a) * r, z = uz + Math.sin(a) * r;
    const clear = Math.min(...connectors.map(c => c.pts.reduce((m, p) => Math.min(m, Math.hypot(p[0] - x, p[1] - z)), 1e9)));
    if (clear < 1.3 + 2.5 || trailDist(x, z) < W + 2.5 || featH(x, z) > 0.01) continue;
    if (!best) best = { x, z };
  }
  if (!best) best = { x: ux + 8, z: uz };
  const g0 = terrainH(best.x, best.z);
  for (let k = 0; k < 8; k++){
    const a = k / 8 * Math.PI * 2;
    signWorst = Math.max(signWorst, g0 - terrainH(best.x + Math.cos(a) * 0.15, best.z + Math.sin(a) * 0.15));
  }
}
if (signWorst > 0.35) fail.push('sign post exposed ' + signWorst.toFixed(3) + ' m');

const ramp = spawnSync(process.execPath, ['--experimental-default-type=module', '-e', `
globalThis.localStorage = { getItem: () => '"rampage"', setItem(){} };
const { SHOP, terrainH, LIFTS, spots, localXZ, trails } = await import('./world.js');
const LIM = 0.05;
const bad = [];
const fp = (x, z, yaw, pts) => {
  const floor = terrainH(x, z); let w = 0;
  for (const [lx, lz] of pts){ const [wx, wz] = localXZ(x, z, yaw, lx, lz); w = Math.max(w, Math.abs(terrainH(wx, wz) - floor)); }
  return w;
};
const sw = fp(SHOP.x, SHOP.z, SHOP.yaw, [[0,0],[-6,-4.5],[6,-4.5],[-6,4.5],[6,4.5],[0,-13]]);
if (sw > LIM) bad.push('ramp shop '+sw.toFixed(3));
const spot = spots.find(s => s.shop);
if (!spot || Math.abs(terrainH(spot.x, spot.z) - terrainH(SHOP.x, SHOP.z)) > LIM) bad.push('ramp teleport');
for (const L of LIFTS) for (const [x, z] of [[L.bx, L.bz], [L.tx, L.tz]]){
  const w = fp(x, z, L.yaw, [[0,0],[-4.5,-3.5],[4.5,-3.5],[-4.5,3.5],[4.5,3.5]]);
  if (w > LIM) bad.push('ramp lift '+w.toFixed(3));
}
for (const tr of trails){
  const yaw = tr.yaw[0], [x, z] = tr.pts[0], bx = x + Math.sin(yaw)*3.2, bz = z + Math.cos(yaw)*3.2;
  const w = fp(bx, bz, yaw, [[0,0],[-3,-3.2],[3,-3.2],[-3,3.2],[3,3.2]]);
  if (w > LIM) bad.push('ramp deck '+tr.name+' '+w.toFixed(3));
}
if (bad.length){ console.log(bad.join('\\n')); process.exit(1); }
console.log('rampage ok');
`], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
if (ramp.status !== 0) fail.push('rampage: ' + (ramp.stdout || ramp.stderr || ramp.status));

if (fail.length){ console.log(fail.join('\n')); process.exit(1); }
console.log('seated ok', { shop: +shopWorst.toFixed(4), signs: +signWorst.toFixed(3), lifts: LIFTS.length, trails: trails.length });
