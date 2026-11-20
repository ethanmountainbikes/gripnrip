// Side trails, roads and connectors stay out of the jump park, the pump track and feature footprints.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connectors, features, PARK, pathsRerouted } from '../world.js';

function hits(world){
  const bad = [];
  const entry = (x, z) => {
    if (!PARK.lines) return false;
    for (const ln of PARK.lines){ if (!ln.rampFoot) continue;
      const dx = x - ln.rampFoot.x, dz = z - ln.rampFoot.z;
      const back = -(dx * PARK.dir[0] + dz * PARK.dir[1]);
      const lat = Math.abs(dx * -PARK.dir[1] + dz * PARK.dir[0]);
      if (back > -6 && back < 26 && lat < 7) return true;
    }
    return false;
  };
  for (const c of connectors) for (const p of c.pts){
    if (entry(p[0], p[1])) continue;
    if (Math.hypot(p[0] - PARK.x, p[1] - PARK.z) < PARK.r + 2) bad.push('park');
    if (PARK.pump){ const dx = p[0] - PARK.pump.x, dz = p[1] - PARK.pump.z;
      const along = dx * PARK.dir[0] + dz * PARK.dir[1], lat = dx * -PARK.dir[1] + dz * PARK.dir[0];
      if ((along / 36) ** 2 + (lat / 18) ** 2 < 1) bad.push('pump'); }
    for (const f of features){ if (f.kind === 'berm' || f.rollin || f.groom) continue;
      const t = (p[0] - f.x) * f.dx + (p[1] - f.z) * f.dz, u = Math.abs((p[0] - f.x) * f.dz - (p[1] - f.z) * f.dx);
      if (t > 1 && t < (f.L || 0) - 1 && u < (f.hw || 2) + 1) bad.push(f.kind); }
  }
  return { world, rerouted: pathsRerouted, bad: bad.length, sample: bad.slice(0, 6) };
}
const mountain = hits('mountain');
const ramp = spawnSync(process.execPath, ['--input-type=module', '-e', `
globalThis.localStorage = { getItem: () => '"rampage"', setItem(){} };
const { connectors, features, PARK, pathsRerouted } = await import('./world.js');
let bad = 0;
for (const c of connectors) for (const p of c.pts){
  for (const f of features){ if (f.kind==='berm'||f.rollin||f.groom) continue;
    const t=(p[0]-f.x)*f.dx+(p[1]-f.z)*f.dz, u=Math.abs((p[0]-f.x)*f.dz-(p[1]-f.z)*f.dx);
    if (t>1 && t<(f.L||0)-1 && u<(f.hw||2)+1) bad++; }
}
console.log(JSON.stringify({ rerouted: pathsRerouted, bad, park: PARK.x }));
`], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
const rampage = ramp.status === 0 ? JSON.parse(ramp.stdout) : { error: ramp.stderr || ramp.stdout, status: ramp.status };
console.log(JSON.stringify({ mountain, rampage }, null, 2));
if (mountain.bad || ramp.status !== 0 || rampage.bad) process.exit(1);
