// Ride a dirt-jump line and the pump-track straight at a normal speed. The surface under the wheels stays packed.
import { spawn } from 'node:child_process';
const PORT = 8926;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9526',`--user-data-dir=/tmp/gnr-ride-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9526/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 50000); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 800)); return r.result.value; };
  for (let i = 0; i < 50; i++){ if (await ev(`!!window.__sim`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(400);
  const out = await ev(`(() => {
    const P = window.__world.PARK, S = window.__game, fh = window.__world.featH;
    const d = P.dir, sx = -d[1], sz = d[0];
    const XZ = (t, lat) => [P.x + d[0]*t + sx*lat, P.z + d[1]*t + sz*lat];
    const along = (x, z) => (x-P.x)*d[0] + (z-P.z)*d[1];
    const latOf = (x, z) => (x-P.x)*-d[1] + (z-P.z)*d[0];
    function ride(t, lat, yaw, speed, secs, pedal) {
      const [x, z] = XZ(t, lat);
      window.__place(x, z, yaw);
      S.state = 'riding'; S.paused = true; S.crashT = 0; S.air = false; S.speed = speed; S.travel = yaw;
      S.vx = -Math.sin(yaw)*speed; S.vz = -Math.cos(yaw)*speed;
      const rows = [];
      for (let i = 0; i < secs / 0.2; i++) {
        window.__sim(0.2, { steer: 0, pedal, brake: 0 });
        rows.push({ t: +along(S.x, S.z).toFixed(1), lat: +latOf(S.x, S.z).toFixed(2), h: +fh(S.x, S.z).toFixed(3), air: !!S.air, kmh: +(S.speed*3.6).toFixed(1), crash: S.crashT > 0 });
      }
      return rows;
    }
    const line = ride(-72, -30, Math.atan2(-d[0], -d[1]), 9, 7, 0.35);
    const pa = Math.PI / 2;
    const px = P.pump.x + d[0]*P.pump.A*Math.cos(pa) + sx*P.pump.B*Math.sin(pa);
    const pz = P.pump.z + d[1]*P.pump.A*Math.cos(pa) + sz*P.pump.B*Math.sin(pa);
    const tx = -d[0]*P.pump.A*Math.sin(pa) + sx*P.pump.B*Math.cos(pa);
    const tz = -d[1]*P.pump.A*Math.sin(pa) + sz*P.pump.B*Math.cos(pa);
    window.__place(px, pz, Math.atan2(-tx, -tz));
    S.speed = 7; S.travel = Math.atan2(-tx, -tz); S.vx = -Math.sin(S.travel)*7; S.vz = -Math.cos(S.travel)*7; S.air = false; S.crashT = 0;
    const pump = [];
    for (let i = 0; i < 8; i++) { window.__sim(0.15, { steer: 0, pedal: 0.2, brake: 0 }); pump.push({ h: +window.__world.featH(S.x, S.z).toFixed(3), air: !!S.air, kmh: +(S.speed*3.6).toFixed(1) }); }
    const grounded = line.filter(r => !r.air && !r.crash && Math.abs(r.lat + 30) < 3.2);
    const flat = grounded.filter(r => r.h < 0.04);
    return { line: line.filter((_, i) => i % 3 === 0), advanced: line[line.length-1].t - line[0].t, flat: flat.length, grounded: grounded.length, crashed: line.some(r => r.crash), pump };
  })()`);
  check('the line ride stays on packed dirt between jumps', out.flat === 0 && out.grounded > 8, JSON.stringify({ flat: out.flat, grounded: out.grounded, advanced: out.advanced }));
  check('the line ride moves down the jumps', out.advanced > 35 && !out.crashed, JSON.stringify({ advanced: out.advanced, crashed: out.crashed, line: out.line }));
  check('the pump track holds the wheels', out.pump.every(p => p.air || p.h >= 0.08), JSON.stringify(out.pump));
  console.log(JSON.stringify({ fail, advanced: out.advanced, flat: out.flat, pump: out.pump }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
