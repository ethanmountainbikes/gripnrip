// Side view of the bike shop on its pad.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8911, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9511',`--user-data-dir=/tmp/gnr-shop-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9511/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
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
  for (let i = 0; i < 40; i++){ if (await ev(`!!window.__place`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(500);
  const info = await ev(`(() => {
    const W = window.__world, S = window.__game, shop = W.spots.find(s => s.shop);
    window.__place(shop.x, shop.z, shop.yaw);
    S.state = 'riding'; S.paused = true; S.speed = 0; S.crashT = 0; S.run = null;
    document.getElementById('mpAsk')?.remove();
    document.getElementById('hud').style.display = 'none';
    const yaw = W.SHOP.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx, lz) => [W.SHOP.x + lx * c + lz * s, W.SHOP.z - lx * s + lz * c];
    const floor = W.terrainH(W.SHOP.x, W.SHOP.z);
    let worst = 0;
    for (const [lx, lz] of [[0,0],[-6,-4.5],[6,-4.5],[-6,4.5],[6,4.5],[0,-13]]) {
      const [x, z] = at(lx, lz);
      worst = Math.max(worst, Math.abs(W.terrainH(x, z) - floor));
    }
    window.__camSide = { d: 9, h: 2.4, b: 6 };
    return { worst: +worst.toFixed(4), floor: +floor.toFixed(2) };
  })()`);
  for (let i = 0; i < 8; i++) await ev(`new Promise(r => requestAnimationFrame(r))`);
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/shop-seated.png`, Buffer.from(data, 'base64'));
  console.log(JSON.stringify(info));
  ws.close();
} finally { chrome.kill(); server.kill(); }
