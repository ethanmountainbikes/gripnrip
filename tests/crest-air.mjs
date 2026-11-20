// Hilltop and hillside crests never launch. Every trail (and on the mountain every side trail and road) is ridden
// at slow, normal and fast held speeds with no input. Each takeoff is checked:
//  - away from a real jump lip, the bike may only leave with the vertical speed it already had (a float), never more,
//    and that float must stay low and short;
//  - on a real lip, the vertical speed may not exceed what the lip face allows at that speed.
// Real lips must still launch, so the test cannot pass by never leaving the ground.
import { spawn } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname;
const SPEEDS = { slow: 6, normal: 11, fast: 17 };   // m/s: about 22, 40 and 61 km/h
const fail = [];
const check = (n, ok, d = '') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); else console.log('ok', n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runWorld(world, PORT, DBG){
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader',`--remote-debugging-port=${DBG}`,`--user-data-dir=/tmp/gnr-crest-${world}-${Date.now()}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
  let n = 0; const wait = new Map();
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++){ try { const r = await fetch(`http://127.0.0.1:${DBG}/json/list`); if (r.ok) targets = await r.json(); } catch {} if (!targets) await sleep(200); }
    if (!targets) throw new Error('no chrome');
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
    const send = (method, params = {}, ms = 240000) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), ms); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 1000)); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true');localStorage.setItem('trailDescent.world', ${JSON.stringify(JSON.stringify(world))})}catch(e){}` });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 80; i++){ if (await ev(`!!window.__sim && !!window.__world`)) break; await sleep(250); }
    await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
    await sleep(300);
    // Helpers live in the page. The lip rule is written out here on purpose, from the feature geometry, not read from game.js.
    await ev(`(() => {
      const S = window.__game, W = window.__world, G = 9.81 * 1.35;
      const NOT_LIP = new Set(['berm','rocks','roll','crashrocks','camber','rock','log','tree']);
      const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      function firstCrest(f){ let peak = 0, peakT = 0; const n = 28;
        for (let i = 1; i <= n; i++){ const t = f.L * i / n, h = f.p(t, 0);
          if (h + 0.02 >= peak){ if (h > peak){ peak = h; peakT = t; } } else if (peak > 0.12 && t > peakT + 0.5) break; }
        return { peak, peakT }; }
      // A real lip near (x, z): the bike is on the last couple of metres of a jump face, or just past its crest.
      function lipNear(x, z){
        let best = null;
        for (const f of W.features){
          if (!f.p || !(f.L > 0) || NOT_LIP.has(f.kind) || f.groom || f.cut || f.boulders) continue;
          const rx = x - f.x, rz = z - f.z, t = rx * f.dx + rz * f.dz, u = Math.abs(rx * f.dz - rz * f.dx);
          if (t < -1 || t > f.L + 1 || u > (f.hw || 2) + 1.4) continue;
          const c = firstCrest(f); if (c.peak < 0.08) continue;
          const d = c.peakT - t; if (d > 2.4 || d < -1.6) continue;
          // steepest half metre of the face on the way up to the crest
          let face = 0.12; for (let s = 0.25; s <= c.peakT + 0.01; s += 0.25){ const g = (f.p(s, 0) - f.p(Math.max(0, s - 0.5), 0)) / 0.5; if (g > face) face = g; }
          if (!best || Math.abs(d) < Math.abs(best.d)) best = { kind: f.kind, d: +d.toFixed(2), h: +c.peak.toFixed(2), face: +face.toFixed(2) };
        }
        return best;
      }
      window.__crestRide = (pts, target, label) => {
        let i0 = 2; while (i0 < pts.length - 2 && Math.hypot(pts[i0][0] - pts[0][0], pts[i0][1] - pts[0][1]) < 3) i0++;
        const yaw0 = Math.atan2(-(pts[i0 + 1][0] - pts[i0][0]), -(pts[i0 + 1][1] - pts[i0][1]));
        window.__holdSpeed = target;
        window.__place(pts[i0][0], pts[i0][1], yaw0);
        S.state = 'riding'; S.paused = true; S.speed = target; S.air = false; S.crashT = 0; S.lastCrash = null;
        S.vy = 0; S.lastVyG = 0; S.wheelie = false; S.fakie = false; S.lives = 99; S.run = null; S.preload = 0; S.gf = 0;
        S.vx = -Math.sin(yaw0) * target; S.vz = -Math.cos(yaw0) * target;
        let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const h = 1 / 120, maxT = Math.min(200, len / target + 8);
        const out = { label, target, len: Math.round(len), lip: 0, float: 0, bad: [], crashes: 0, end: 'time' };
        let near = i0, took = null;
        for (let t = 0; t < maxT; t += h){
          let bd = 1e9; const a = Math.max(0, near - 6), b = Math.min(pts.length - 1, near + 40);
          for (let i = a; i <= b; i++){ const d = (pts[i][0] - S.x) ** 2 + (pts[i][1] - S.z) ** 2; if (d < bd){ bd = d; near = i; } }
          if (near >= pts.length - 3){ out.end = 'finish'; break; }
          if (Math.sqrt(bd) > 25){ out.end = 'lost'; break; }
          const look = pts[Math.min(pts.length - 1, near + 5)];
          const aim = Math.atan2(-(look[0] - S.x), -(look[1] - S.z));
          const steer = S.air ? 0 : Math.max(-1, Math.min(1, -wrap(aim - S.yaw) * 1.3));
          // What the ground can give: the grade the wheels were just riding (over the last half metre and metre), times the speed.
          const was = S.air, y0 = S.y, fx = -Math.sin(S.travel), fz = -Math.cos(S.travel), g0 = window.__groundH(S.x, S.z);
          const grade = Math.max((g0 - window.__groundH(S.x - fx * 0.5, S.z - fz * 0.5)) / 0.5, (g0 - window.__groundH(S.x - fx, S.z - fz)) / 1.0);
          const carried = grade * target;
          window.__sim(h, { steer, pedal: 0, brake: 0, lean: 0, pumpHold: false, pop: false });
          if (S.lastCrash){   // a crash is reported, then the ride goes on from where the bike stopped
            out.crashes++; if (out.crashes > 6){ out.end = 'crashes'; break; }
            S.lastCrash = null; S.crashT = 0; S.state = 'riding'; S.air = false; S.speed = target; took = null; continue; }
          if (!was && S.air){
            took = { at: Math.round(near * 2), x: +S.x.toFixed(1), z: +S.z.toFixed(1), y0, vy: +S.vy.toFixed(2), carried: +carried.toFixed(2), follow: +S.lastVyG.toFixed(2), lip: lipNear(S.x, S.z), apex: S.y, air: 0 };
          }
          if (took){
            if (S.air){ took.air += h; took.apex = Math.max(took.apex, S.y); }
            else {
              const rise = took.apex - took.y0, r = { ...took, air: +took.air.toFixed(2), rise: +rise.toFixed(2) }; delete r.apex; delete r.y0;
              if (r.air >= 0.15){
                if (r.lip){
                  out.lip++;
                  // vertical speed the lip can give: its face grade times the speed, or what the bike already carried
                  // (plus a little for the face being sampled a bit differently here than in the game)
                  const allow = Math.max(r.carried, r.lip.face * target) + 0.9;
                  if (r.vy > allow) out.bad.push({ why: 'lip launch faster than its face', allow: +allow.toFixed(2), ...r });
                  else if (r.air > 4.2) out.bad.push({ why: 'lip launch hung too long', ...r });
                } else {
                  out.float++;
                  // Off a lip: no added upward speed, no climbing above the takeoff, and no long hang.
                  const floatRise = Math.max(0, r.carried) ** 2 / (2 * G) + 0.35;
                  if (r.vy > r.carried + 0.5) out.bad.push({ why: 'crest added upward speed', ...r });
                  else if (rise > floatRise) out.bad.push({ why: 'crest float rose too high', limit: +floatRise.toFixed(2), ...r });
                  // A long hang off flat or downhill ground is a seam the bike was thrown off, not a float.
                  else if (r.carried < 2 && r.air > 2.5) out.bad.push({ why: 'crest float hung too long', ...r });
                }
              }
              took = null;
            }
          }
        }
        window.__holdSpeed = undefined;
        out.bad = out.bad.slice(0, 4);
        return out;
      };
      return true;
    })()`);
    const list = await ev(`(() => {
      const W = window.__world, L = [];
      W.trails.forEach((tr, i) => L.push({ kind: 'trail', i, name: tr.name }));
      (W.connectors || []).forEach((c, i) => { if (c.pts.length > 8) L.push({ kind: c.explore ? (c.half > 2 ? 'road' : 'side trail') : 'path', i, name: (c.explore ? (c.half > 2 ? 'road' : 'side trail') : 'path') + ' ' + i }); });
      return L;
    })()`);
    // The trail bench itself has no sharp hill tops left: the slope steepens by at most 0.035 per 2 m sample.
    if (world === 'mountain'){
      const k = await ev(`(() => { let m = 0, at = ''; for (const tr of window.__world.trails){ const h = tr.h; if (tr.shape) continue;
        for (let i = 1; i < h.length - 1; i++){ const d = (2 * h[i] - h[i - 1] - h[i + 1]) / 2; if (d > m){ m = d; at = tr.name + ' ' + i * 2 + ' m'; } } } return { m, at }; })()`);
      check('mountain trail crests are rounded (no hard seam)', k.m <= 0.0352, JSON.stringify(k));
    }
    const rows = [];
    for (const item of list){
      for (const [sp, v] of Object.entries(SPEEDS)){
        const pts = item.kind === 'trail' ? `window.__world.trails[${item.i}].pts` : `window.__world.connectors[${item.i}].pts`;
        // Paths are ridden both ways round: their ends meet lifts and trails at either end.
        const ways = item.kind === 'trail' ? [`${pts}`] : [`${pts}`, `${pts}.slice().reverse()`];
        for (const [k, w] of ways.entries()){
          const r = await ev(`window.__crestRide(${w}, ${v}, ${JSON.stringify(`${world} ${item.name}${k ? ' (reverse)' : ''} ${sp}`)})`);
          rows.push({ ...r, kind: item.kind });
        }
      }
    }
    ws.close();
    return rows;
  } finally { chrome.kill(); server.kill(); }
}

const rows = [...await runWorld('mountain', 8942, 9542), ...await runWorld('rampage', 8943, 9543)];
const trailRows = rows.filter(r => r.kind === 'trail');
const lips = rows.reduce((s, r) => s + r.lip, 0), floats = rows.reduce((s, r) => s + r.float, 0);
for (const r of rows) check(`${r.label}: no launch away from a lip, no lip launch past its face`, r.bad.length === 0, JSON.stringify(r.bad));
check('real lips still launch on the trails', trailRows.reduce((s, r) => s + r.lip, 0) >= 40, `${lips} lip takeoffs`);
const finished = rows.filter(r => r.end === 'finish').length;
check('most rides reach the end of the line', finished >= rows.length * 0.6, `${finished}/${rows.length}`);
console.log(JSON.stringify({ rides: rows.length, trails: trailRows.length, finished, lipTakeoffs: lips, floats, lost: rows.filter(r => r.end !== 'finish').map(r => `${r.label}:${r.end}`).slice(0, 30) }));
if (fail.length){ console.log('FAIL\n' + fail.join('\n')); process.exitCode = 1; } else console.log('PASS');
