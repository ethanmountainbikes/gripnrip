// Open the level editor, place a start gate and a jump, and test-ride from the gate.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8930, ART = '/opt/cursor/artifacts';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9530',`--user-data-dir=/tmp/gnr-ed-${Date.now()}`,'--window-size=1400,900','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9530/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}, ms = 40000) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), ms); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 900)); return r.result.value; };
  for (let i = 0; i < 50; i++){ if (await ev(`!!window.__editor`)) break; await sleep(200); }
  check('editor is on the menu', await ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.textContent.includes('Level Editor')); if (!li) return 'missing'; li.click(); return 'ok'; })()`) === 'ok');
  await sleep(800);
  const placed = await ev(`(() => {
    const ed = window.__editor;
    ed.place('start', -6, 0);
    ed.place('jump', 10, 0);
    ed.place('finish', 28, 0);
    const gate = ed.gate();
    const before = { x: window.__game.x, z: window.__game.z };
    ed.testRide();
    const S = window.__game;
    return { gate, x: S.x, z: S.z, before, name: ed.doc().name, objects: ed.doc().objects.map(o => o.kind) };
  })()`);
  check('test ride spawns at the start gate', placed.gate && Math.hypot(placed.x - (2400 + placed.gate.x), placed.z - (2400 + placed.gate.z)) < 1.5, JSON.stringify(placed));
  check('the level has the placed objects', placed.objects.includes('start') && placed.objects.includes('jump') && placed.objects.includes('finish'), placed.objects.join(','));
  await ev(`document.getElementById('hud').style.display='none'`);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/level-editor.png`, Buffer.from(shot.data, 'base64'));
  await ev(`window.__editor.stopRide()`);
  await sleep(400);
  const edit = await send('Page.captureScreenshot', { format: 'png' }, 25000);
  writeFileSync(`${ART}/level-editor-build.png`, Buffer.from(edit.data, 'base64'));
  console.log(JSON.stringify({ fail, placed }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
