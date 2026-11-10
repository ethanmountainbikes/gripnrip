// In the air, stick down / K is a backflip (nose up). Stick up / I is a frontflip (nose down).
// A wheelie still only happens on the ground, and the right-stick hop is unchanged.
import { spawn } from 'node:child_process';
const PORT = 8918;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9518',`--user-data-dir=/tmp/gnr-flip-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9518/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
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
  for (let i = 0; i < 40; i++){ if (await ev(`!!window.__sim`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(250);
  const out = await ev(`(() => {
    const S = window.__game, P = window.__world.PARK, g = window.__groundH;
    function air(inp){
      window.__place(P.x, P.z, 0);
      S.state = 'riding'; S.paused = true; S.speed = 8; S.air = true; S.crashT = 0; S.lastCrash = null;
      S.wheelie = false; S.wheelieArm = 0; S.pitch = 0; S.nose = 0; S.wPitch = 0; S.spin = 0;
      S.y = g(P.x, P.z) + 4; S.vy = 3; S.vx = 0; S.vz = -8;
      const p0 = S.pitch, n0 = S.nose || 0;
      window.__sim(0.28, Object.assign({ steer: 0, pedal: 0, brake: 0, pumpHold: false, pop: false }, inp));
      return { dPitch: +(S.pitch - p0).toFixed(3), dNose: +((S.nose || 0) - n0).toFixed(3), wheelie: !!S.wheelie, air: !!S.air, pop: !!S.popped };
    }
    function pad(ly, ry){
      const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
      navigator.getGamepads = () => [{ index: 0, connected: true, mapping: 'standard', id: 'mock', axes: [0, ly, 0, ry], buttons, timestamp: 1 }];
      return window.__readInput();
    }
    const gate = () => { window.__stickGate.ready = true; window.__stickGate.downAt = 0; };
    gate(); const bothUp = pad(-1, -1);
    gate(); const downThen = pad(0, 1); const upFlick = pad(0, -1);
    navigator.getGamepads = () => [];
    const key = code => { document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); const inp = window.__readInput(); document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); window.__readInput(); return inp; };
    const K = key('KeyK'), I = key('KeyI');
    return {
      down: air({ lean: 1, rsy: 0.8 }),
      up: air({ lean: -1, rsy: -0.8 }),
      both: air({ lean: -1, rsy: -1, ry: -1, wheelieChord: true }),
      bothUp: { chord: !!bothUp.wheelieChord, pop: !!bothUp.pop, lean: +bothUp.lean.toFixed(2) },
      hop: { pop: !!upFlick.pop, chord: !!upFlick.wheelieChord, pump: !!upFlick.pumpHold },
      hadDown: !!downThen.pumpHold,
      K: { lean: +K.lean.toFixed(2), kb: !!K.kbWheelie },
      I: { lean: +I.lean.toFixed(2) }
    };
  })()`);
  check('stick down is nose up / backflip', out.down.dPitch > 0.2 && out.down.dNose > 0.05 && out.down.air && !out.down.wheelie, JSON.stringify(out.down));
  check('stick up is nose down / frontflip', out.up.dPitch < -0.2 && out.up.dNose < -0.05 && out.up.air && !out.up.wheelie, JSON.stringify(out.up));
  check('both sticks up in the air is a frontflip, not a wheelie', out.both.dPitch < -0.2 && !out.both.wheelie && out.both.air, JSON.stringify(out.both));
  check('both sticks up still arms a wheelie on the input', out.bothUp.chord && !out.bothUp.pop && out.bothUp.lean < -0.9, JSON.stringify(out.bothUp));
  check('right stick down then up still hops', out.hadDown && out.hop.pop && !out.hop.chord, JSON.stringify(out.hop));
  check('K is the backflip key', out.K.lean > 0.9 && out.K.kb, JSON.stringify(out.K));
  check('I is the frontflip key', out.I.lean < -0.9, JSON.stringify(out.I));
  console.log(JSON.stringify({ fail, out }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
