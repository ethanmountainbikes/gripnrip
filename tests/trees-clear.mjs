// Every tree stays off the riding line. Run with: node --experimental-default-type=module tests/trees-clear.mjs
import { treesInCell, trails, trailDist, featClear, connDist, CW, TCELL, HALF, spots, SHOP, liftLineDist, nearLiftStation } from '../world.js';

const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, lined = 0, worst = 99, bad = null;
const seen = new Set();
for (const tr of trails){
  for (let i = 0; i < tr.pts.length; i += 12){
    const [x, z] = tr.pts[i];
    const ci = Math.floor(x/TCELL), cj = Math.floor(z/TCELL);
    const id = ci+','+cj; if (seen.has(id)) continue; seen.add(id);
    for (const t of treesInCell(ci, cj)){
      n++; if (t.near) lined++;
      const td = trailDist(t.x, t.z), fd = featClear(t.x, t.z);
      if (td < 2.5 || fd < 2.5){ bad = {td, fd, x:t.x, z:t.z}; }
      worst = Math.min(worst, td, fd);
      if (connDist(t.x, t.z) < CW + 1.5) bad = bad || {conn: connDist(t.x, t.z)};
      if (Math.hypot(t.x-SHOP.x, t.z-SHOP.z) < 24) bad = bad || {shop: true};
      if (nearLiftStation(t.x, t.z, 14) || liftLineDist(t.x, t.z) < 7) bad = bad || {lift: true};
      if (spots.some(s => Math.hypot(t.x-s.x, t.z-s.z) < 12)) bad = bad || {spawn: true};
    }
  }
}
check('sampled trees exist', n > 200, String(n));
check('no tree inside 2.5 m of a trail, landing, path, lift, shop or spawn', !bad, JSON.stringify(bad));
// a few cells away from trails, for a density reading
let fill = 0, cells = 0;
for (let ci = -4; ci <= 4; ci++) for (let cj = -2; cj <= 6; cj++){ cells++; fill += treesInCell(ci, cj).length; }
console.log(JSON.stringify({ fail, sampled:n, lined, closest: +worst.toFixed(2), fillCells: cells, fillTrees: fill, perCell: +(fill/cells).toFixed(1) }, null, 2));
if (fail.length) process.exit(1);
