// Medium and large jumps launch in a neutral stance. Preload is only a modest extra.
import { spawn } from 'node:child_process';
const PORT = 8914;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9514',`--user-data-dir=/tmp/gnr-lip-${Date.now()}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9514/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}, ms = 90000) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), ms); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 800)); return r.result.value; };
  for (let i = 0; i < 40; i++){ if (await ev(`!!window.__sim`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(300);
  const out = await ev(`(() => {
    const S = window.__game, W = window.__world;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const lipOf = f => { let peak = 0, peakT = 0; for (let t = 0.2; t <= f.L; t += 0.4){ const h = f.p(t, 0); if (h >= peak){ peak = h; peakT = t; } if (peak > 0.5 && t > peakT + 2 && h < peak * 0.5) break; } return { h: peak, t: peakT }; };
    const picks = [];
    for (const kind of ['table', 'kicker', 'stepdown', 'gap']){
      const f = W.features.find(f => f.trail >= 0 && !f.mega && f.kind === kind && f.p && lipOf(f).h > 0.85 && f.L > 10);
      if (f) picks.push(f);
    }
    function ride(f, kmh, preload){
      const speed = kmh / 3.6, yaw = Math.atan2(-f.dx, -f.dz), lip = lipOf(f);
      window.__place(f.x - f.dx * 8, f.z - f.dz * 8, yaw);
      S.state = 'riding'; S.paused = true; S.air = false; S.crashT = 0; S.lastCrash = null;
      S.vy = 0; S.preload = 0; S.wheelie = false; S.fakie = false; S.speed = speed;
      S.vx = -Math.sin(yaw) * speed; S.vz = -Math.cos(yaw) * speed;
      const h = 1/120; let air = 0, took = null, before = null, snap = 0, prevY = null;
      for (let t = 0; t < 8 && !S.lastCrash; t += h){
        const along = (S.x - f.x) * f.dx + (S.z - f.z) * f.dz;
        const steer = S.air ? 0 : Math.max(-1, Math.min(1, -wrap(yaw - S.yaw) * 1.4));
        const pumpHold = preload && !S.air && along > lip.t - 4 && along < lip.t - 0.15;
        const pop = preload && !pumpHold && along >= lip.t - 0.15 && along < lip.t + 0.4;
        const was = S.air;
        if (!S.air) before = S.speed;
        window.__sim(h, { steer, pedal: 0, brake: 0, lean: 0, pumpHold, pop });
        if (!was && S.air && !took) took = { spd: +S.speed.toFixed(2), before: before == null ? null : +before.toFixed(2) };
        if (S.air) air += h;
        if (!took && prevY != null && !S.air && prevY - S.y > 0.45) snap++;
        prevY = S.y;
        if (along > f.L + 8) break;
      }
      const drop = took && took.before ? (took.before - took.spd) / took.before : 1;
      return { kind: f.kind, kmh, preload, air: +air.toFixed(2), drop: +drop.toFixed(3), snap, crash: S.lastCrash, took: !!took };
    }
    const rows = [];
    for (const f of picks) for (const kmh of [35, 45, 55]) for (const preload of [false, true]) rows.push(ride(f, kmh, preload));
    return { n: picks.length, kinds: picks.map(f => f.kind), rows };
  })()`);
  check('found jumps', out.n >= 2, JSON.stringify(out.kinds));
  for (const r of out.rows){
    check(r.kind + ' ' + r.kmh + (r.preload ? ' preload' : ' neutral') + ' air', r.took && r.air > 0.4 && !r.crash, JSON.stringify(r));
    check(r.kind + ' ' + r.kmh + (r.preload ? ' preload' : ' neutral') + ' speed', r.drop < 0.08, JSON.stringify(r));
    check(r.kind + ' ' + r.kmh + ' no snap', r.snap === 0, JSON.stringify(r));
  }
  console.log(JSON.stringify({ fail, out }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
