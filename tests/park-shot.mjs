// Overhead shots of the dirt-jump lines and the pump track.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8924, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
const tag = process.argv[2] || 'before';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9524',`--user-data-dir=/tmp/gnr-park-${Date.now()}`,'--window-size=1400,900','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9524/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}, ms = 40000) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), ms); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 700)); return r.result.value; };
  for (let i = 0; i < 50; i++){ if (await ev(`!!window.__place`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(500);
  await ev(`(() => {
    const P = window.__world.PARK;
    window.__place(P.x - 20, P.z - 20, -1.57);
    const S = window.__game; S.state = 'riding'; S.paused = true; S.speed = 0; S.air = false; S.crashT = 0;
    window.__camSide = { d: 42, h: 28, b: -18 };
    document.getElementById('mpAsk')?.remove();
    document.getElementById('hud').style.display = 'none';
    return true;
  })()`);
  await sleep(2500);
  const lines = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/park-lines-${tag}.png`, Buffer.from(lines.data, 'base64'));
  await ev(`(() => {
    const P = window.__world.PARK;
    window.__place(P.pump.x, P.pump.z, 0);
    const S = window.__game; S.paused = true; S.speed = 0;
    window.__camSide = { d: 34, h: 26, b: 0 };
    return true;
  })()`);
  await sleep(1800);
  const pump = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/pump-track-${tag}.png`, Buffer.from(pump.data, 'base64'));
  console.log('shot', tag);
  ws.close();
} finally { chrome.kill(); server.kill(); }
