// Helmet view and a close tree after the hotfix.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8916, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9516',`--user-data-dir=/tmp/gnr-hot-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9516/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
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
  await sleep(400);
  const info = await ev(`(() => {
    const S = window.__game, W = window.__world;
    const tr = W.trails[0];
    window.__place(tr.pts[30][0], tr.pts[30][1], tr.yaw[30]);
    S.state = 'riding'; S.paused = true; S.speed = 8; S.crashT = 0; S.air = false;
    window.__setCam(3);
    document.getElementById('mpAsk')?.remove();
    const v = window.__view;
    return { mode: v.mode, y: v.off.y, arms: v.arms, legs: v.legs, hands: v.hands, head: v.head, torso: v.torso };
  })()`);
  for (let i = 0; i < 6; i++) await ev(`new Promise(r => requestAnimationFrame(r))`);
  const view = await ev(`window.__view`);
  const fp = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/fp-hands-hotfix.png`, Buffer.from(fp.data, 'base64'));
  await ev(`(() => {
    const S = window.__game;
    window.__place(80, -80, 0.4);
    S.paused = true; S.state = 'riding';
    window.__camSide = { d: 7, h: 2.2, b: 1 };
    document.getElementById('hud').style.display = 'none';
    return true;
  })()`);
  for (let i = 0; i < 10; i++) await ev(`new Promise(r => requestAnimationFrame(r))`);
  const tree = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/trees-after.png`, Buffer.from(tree.data, 'base64'));
  console.log(JSON.stringify({ placed: info, view }));
  ws.close();
} finally { chrome.kill(); server.kill(); }
