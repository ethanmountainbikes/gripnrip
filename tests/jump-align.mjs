// Every trail jump's centreline stays in the tread and points along the trail.
import { features, trails, W } from '../world.js';
const JUMP = new Set(['kicker', 'table', 'double', 'gap', 'stepup', 'stepdown', 'drop', 'rockdrop']);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const bad = [];
for (const f of features){
  if (!(f.trail >= 0) || f.mega || !JUMP.has(f.kind)) continue;
  const tr = trails[f.trail];
  for (let t = 0; t <= f.L + 1e-6; t += 1.5){
    const x = f.x + f.dx * t, z = f.z + f.dz * t;
    let bi = 0, bd = 1e9;
    for (let i = 0; i < tr.pts.length; i++){ const d = (tr.pts[i][0] - x) ** 2 + (tr.pts[i][1] - z) ** 2; if (d < bd){ bd = d; bi = i; } }
    const dist = Math.sqrt(bd), ang = Math.abs(wrap(Math.atan2(-f.dx, -f.dz) - tr.yaw[bi]));
    if (dist > W + 0.4 || ang > 10 * Math.PI / 180){
      bad.push(`${tr.name} ${f.kind} off ${dist.toFixed(1)} m / ${(ang * 180 / Math.PI).toFixed(1)}°`);
      break;
    }
  }
}
if (bad.length){ console.log(bad.slice(0, 12).join('\n')); process.exit(1); }
console.log('jumps aligned', features.filter(f => f.trail >= 0 && JUMP.has(f.kind) && !f.mega).length);
