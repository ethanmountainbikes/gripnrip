// Settings → Controls rebinds, conflict swap, and the personal map marker.
import { spawn } from 'node:child_process';
const PORT = 8921;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9521',`--user-data-dir=/tmp/gnr-binds-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9521/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const exceptions = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'error').slice(0, 300));
    if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 50000); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 800)); return r.result.value; };
  for (let i = 0; i < 50; i++){ if (await ev(`!!document.querySelector('#menuPanel li')`)) break; await sleep(200); }
  const clickLabel = async label => ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent.startsWith(${JSON.stringify(label)})); if (!li) return 'missing'; li.click(); return 'ok'; })()`);
  check('settings opens', await clickLabel('Settings') === 'ok');
  await sleep(200);
  check('controls opens', await clickLabel('Controls') === 'ok');
  await sleep(250);
  const before = await ev(`(() => {
    const row = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Map marker — keyboard');
    const help = document.querySelector('#help').textContent;
    return { value: row?.querySelector('.mVal')?.textContent || '', helpN: help.includes('Your marker is N'), helpL3: help.includes('L3+LT'), wheelie: [...document.querySelectorAll('#menuPanel li')].some(el => el.textContent.includes('BOTH STICKS UP')) };
  })()`);
  check('marker keyboard default is N', before.value.trim() === 'N', before.value);
  check('help lists the marker bind', before.helpN && before.helpL3, JSON.stringify(before));
  check('wheelie stays a fixed combo', before.wheelie);
  check('select marker row', await clickLabel('Map marker — keyboard') === 'ok');
  await sleep(100);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))`);
  await sleep(150);
  const mid = await ev(`(() => {
    const saved = JSON.parse(localStorage.getItem('trailDescent.settings') || '{}');
    return { toast: document.getElementById('toast')?.textContent || '', marker: saved.binds?.kb?.marker || null, sub: [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Map marker — keyboard')?.querySelector('small')?.textContent || '' };
  })()`);
  check('conflict warns and does not save', mid.marker !== 'KeyW' && /Pedal|used by/i.test(mid.toast + mid.sub), JSON.stringify(mid));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }))`);
  await sleep(200);
  const swapped = await ev(`(() => {
    const saved = JSON.parse(localStorage.getItem('trailDescent.settings') || '{}');
    const help = document.querySelector('#help').textContent;
    return { marker: saved.binds.kb.marker, pedal: saved.binds.kb.pedal, brake: saved.binds.kb.brake, help };
  })()`);
  check('swap persists inside the existing settings object', swapped.marker === 'KeyW' && swapped.pedal === 'KeyN' && swapped.brake === 'KeyS', JSON.stringify({ marker: swapped.marker, pedal: swapped.pedal, brake: swapped.brake }));
  check('help follows the new bind', swapped.help.includes('Your marker is W or L3+LT'));
  check('reset row', await clickLabel('Reset to defaults') === 'ok');
  await sleep(200);
  const reset = await ev(`JSON.parse(localStorage.getItem('trailDescent.settings')).binds.kb.marker`);
  check('reset restores the marker key', reset === 'KeyN', reset);

  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))`);
  await sleep(100);
  check('back to settings', await ev(`document.querySelector('#menuPanel h2')?.textContent`) === 'SETTINGS');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))`);
  await sleep(150);
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(400);
  const placed = await ev(`(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const pad = (ls, lt) => { buttons[10] = { pressed: ls, value: ls ? 1 : 0 }; buttons[6] = { pressed: lt, value: lt ? 1 : 0 };
      navigator.getGamepads = () => [{ index: 0, connected: true, mapping: 'standard', id: 'mock', axes: [0,0,0,0], buttons, timestamp: performance.now() }];
      return window.__readInput(); };
    const ltOnly = pad(false, true);
    const both = pad(true, true);
    navigator.getGamepads = () => [];
    window.__place(40, 80, 0);
    const S = window.__game; S.state = 'riding'; S.paused = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }));
    const first = JSON.parse(localStorage.getItem('trailDescent.marker'));
    window.__place(120, 80, 0);
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }));
    const moved = JSON.parse(localStorage.getItem('trailDescent.marker'));
    window.__place(128, 84, 0);
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }));
    const gone = localStorage.getItem('trailDescent.marker');
    return { ltBrake: ltOnly.brake, ltClick: !!ltOnly.markerClick, ltMod: !!ltOnly.markerMod, bothBrake: both.brake, bothClick: !!both.markerClick, bothMod: !!both.markerMod, first, moved, gone };
  })()`);
  check('LT alone brakes and does not arm the marker', placed.ltBrake > 0.4 && !placed.ltClick && placed.ltMod, JSON.stringify(placed));
  check('L3+LT still brakes', placed.bothBrake > 0.4 && placed.bothClick && placed.bothMod, JSON.stringify(placed));
  check('keyboard marker places at the rider', placed.first && Math.hypot(placed.first.x - 40, placed.first.z - 80) < 1, JSON.stringify(placed.first));
  check('a far press replaces the one marker', placed.moved && Math.hypot(placed.moved.x - 120, placed.moved.z - 80) < 1, JSON.stringify(placed.moved));
  check('a near press removes it', placed.gone === 'null', placed.gone);
  check('no page errors', exceptions.length === 0, exceptions.join(' | '));
  console.log(JSON.stringify({ fail, exceptions }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
