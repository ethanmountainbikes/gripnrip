globalThis.localStorage = { getItem: (k) => process.argv[2] === 'rampage' && k === 'trailDescent.world' ? '"rampage"' : null };
const w = await import('../world.js');
console.log(JSON.stringify({ world: w.WORLD, ...w.exploreStats(), trails: w.trails.length }));
