// Bail ragdoll: several speeds and slopes, no blow-up, joints stay limited, then it rests.
import { spawnRagdoll, stepRagdoll, ragdollReport } from '../ragdoll.js';

const fail = [];
const check = (n, ok, d = '') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
const grounds = {
  flat: () => 0,
  down: (x, z) => 0.22 * z,
  side: (x, z) => 0.35 * x,
};
function worldFor(name, tree){
  return {
    ground: grounds[name],
    half: 200,
    solids(x, z, out){
      out.length = 0;
      if (!tree) return;
      out.push({ k:'cap', x:1.2, z:-4, r:0.45, y0:0, y1:5 });
      out.push({ k:'sph', x:-1.5, y:0.4, z:-2.5, r:0.55 });
    },
  };
}
function run(label, S, groundName, secs, tree){
  const world = worldFor(groundName, tree);
  const rag = spawnRagdoll(S);
  const h = 1 / 120;
  let mid = null;
  for (let t = 0; t < secs; t += h){
    stepRagdoll(rag, h, world);
    if (!mid && t >= 0.35) mid = ragdollReport(rag, world.ground);
  }
  const end = ragdollReport(rag, world.ground);
  check(label + ' finite at mid tumble', mid.finite && mid.bikeFinite, JSON.stringify(mid));
  check(label + ' no explosion', mid.spread < 2.2 && end.spread < 2.2 && Math.abs(end.gap) < 8, JSON.stringify({ mid: mid.spread, end: end.spread, gap: end.gap }));
  check(label + ' joints stay limited', mid.slack < 0.2 && end.slack < 0.2, JSON.stringify({ mid: mid.slack, end: end.slack }));
  check(label + ' rider rests on the ground', end.speed < 1.6 && end.gap < 0.55 && end.gap > -0.05, JSON.stringify(end));
  check(label + ' bike rests', end.bikeFinite && end.bikeSpeed < 2.5 && end.bikeGap < 1.3 && end.bikeGap > -0.2, JSON.stringify({ bikeSpeed: end.bikeSpeed, bikeGap: end.bikeGap }));
  const pel = rag.parts.pelvis, b = rag.bike;
  check(label + ' bike separates from the rider', Math.hypot(b.x - pel.x, b.z - pel.z) > 0.35, JSON.stringify({ dx: +(b.x - pel.x).toFixed(2), dz: +(b.z - pel.z).toFixed(2) }));
  return { mid, end };
}

const speeds = [5, 12, 22];
const slopes = ['flat', 'down', 'side'];
for (const speed of speeds) for (const slope of slopes){
  const yaw = slope === 'side' ? Math.PI / 2 : 0;
  const vx = -Math.sin(yaw) * speed, vz = -Math.cos(yaw) * speed;
  run(`speed ${speed} ${slope}`, { x:0, y:0, z:0, yaw, pitch: speed > 15 ? -0.45 : 0.25, lean:0.3, vx, vy:0.4, vz, speed, spin: speed > 15 ? 2 : 0, wYaw:0.6 }, slope, 2.8, speed === 12 && slope === 'flat');
}

const sample = run('sample', { x:0, y:0, z:0, yaw:0, pitch:0.2, lean:0, vx:0, vy:1, vz:-10, speed:10, spin:0, wYaw:0 }, 'flat', 2.8, false);
console.log(JSON.stringify({ fail, sample }, null, 2));
if (fail.length) process.exit(1);
