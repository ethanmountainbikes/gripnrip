// Settings → Controls rebinds, and the personal respawn point.
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
    const row = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Respawn point — keyboard');
    const help = document.querySelector('#help').textContent;
    return { value: row?.querySelector('.mVal')?.textContent || '', helpN: help.includes('Respawn point is N'), helpL3: help.includes('L3+LT'), wheelie: [...document.querySelectorAll('#menuPanel li')].some(el => el.textContent.includes('BOTH STICKS UP')) };
  })()`);
  check('respawn-point key default is N', before.value.trim() === 'N', before.value);
  check('help lists the respawn bind', before.helpN && before.helpL3, JSON.stringify(before));
  check('wheelie stays a fixed combo', before.wheelie);
  check('select respawn row', await clickLabel('Respawn point — keyboard') === 'ok');
  await sleep(100);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))`);
  await sleep(150);
  const mid = await ev(`(() => {
    const saved = JSON.parse(localStorage.getItem('trailDescent.settings') || '{}');
    return { toast: document.getElementById('toast')?.textContent || '', spawn: saved.binds?.kb?.spawn || null, sub: [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Respawn point — keyboard')?.querySelector('small')?.textContent || '' };
  })()`);
  check('conflict warns and does not save', mid.spawn !== 'KeyW' && /Pedal|used by/i.test(mid.toast + mid.sub), JSON.stringify(mid));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }))`);
  await sleep(200);
  const swapped = await ev(`(() => {
    const saved = JSON.parse(localStorage.getItem('trailDescent.settings') || '{}');
    const help = document.querySelector('#help').textContent;
    return { spawn: saved.binds.kb.spawn, pedal: saved.binds.kb.pedal, brake: saved.binds.kb.brake, help };
  })()`);
  check('swap persists inside the existing settings object', swapped.spawn === 'KeyW' && swapped.pedal === 'KeyN' && swapped.brake === 'KeyS', JSON.stringify({ spawn: swapped.spawn, pedal: swapped.pedal, brake: swapped.brake }));
  check('help follows the new bind', swapped.help.includes('Respawn point is W or L3+LT'));
  check('reset row', await clickLabel('Reset to defaults') === 'ok');
  await sleep(200);
  const reset = await ev(`JSON.parse(localStorage.getItem('trailDescent.settings')).binds.kb.spawn`);
  check('reset restores the respawn key', reset === 'KeyN', reset);

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
    const spot = window.__world.spots[1];
    window.__place(spot.x, spot.z, 1.2);
    const S = window.__game;
    S.state = 'riding'; S.paused = true; S.air = false; S.lift = null; S.run = null; S.crashT = 0; S.speed = 12; S.yaw = 1.2;
    const press = () => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', bubbles: true })); };
    press();
    const fast = localStorage.getItem('trailDescent.spawn');
    S.speed = 0; S.air = true; press();
    const airy = localStorage.getItem('trailDescent.spawn');
    S.air = false; S.lift = { i: 0 }; press();
    const lifted = localStorage.getItem('trailDescent.spawn');
    S.lift = null; press();
    const first = JSON.parse(localStorage.getItem('trailDescent.spawn'));
    const home = { x: spot.x, z: spot.z };
    window.__place(spot.x + 160, spot.z + 40, 0.2);
    S.paused = true; S.speed = 0; S.air = false; S.run = null;
    window.__respawn();
    const back = { x: S.x, z: S.z, yaw: S.yaw };
    S.run = { mode: 'race', t: 0, start: 0, s: 30, cp: 0, cpt: [1], unranked: false, spawnUsed: false };
    const beforeTimed = localStorage.getItem('trailDescent.spawn');
    window.__place(spot.x + 160, spot.z + 40, 0);
    S.speed = 0; S.air = false; S.paused = true;
    press();
    const during = localStorage.getItem('trailDescent.spawn');
    const tr0 = window.__world.trails[0];
    const checkpoint = (tr0.cps && tr0.cps[0]) ? tr0.cps[0] : { x: tr0.pts[3][0], z: tr0.pts[3][1] };
    window.__respawn();
    const ranked = { unranked: !!S.run.unranked, used: !!S.run.spawnUsed, x: S.x, z: S.z, kept: localStorage.getItem('trailDescent.spawn') === beforeTimed };
    window.__place(spot.x, spot.z, 1.2);
    S.speed = 0; S.air = false; S.run = null; S.paused = true;
    press();
    const gone = localStorage.getItem('trailDescent.spawn');
    window.__place(checkpoint.x + 80, checkpoint.z + 80, 0);
    S.run = { t: 0, start: 0, s: 30, cp: (tr0.cps && tr0.cps[0]) ? 0 : null, cpt: [1] };
    S.speed = 0; S.paused = true;
    window.__respawn();
    return { ltBrake: ltOnly.brake, ltClick: !!ltOnly.spawnClick, ltMod: !!ltOnly.spawnMod, bothBrake: both.brake, bothClick: !!both.spawnClick, bothMod: !!both.spawnMod, fast, airy, lifted, first, home, back, beforeTimed, during, ranked, gone, afterClear: { x: S.x, z: S.z }, checkpoint, toast: document.getElementById('toast')?.textContent || '' };
  })()`);
  check('LT alone brakes and does not arm the respawn combo', placed.ltBrake > 0.4 && !placed.ltClick && placed.ltMod, JSON.stringify(placed));
  check('L3+LT still brakes', placed.bothBrake > 0.4 && placed.bothClick && placed.bothMod, JSON.stringify(placed));
  check('moving, airborne, or on a lift does not set a point', placed.fast === null && placed.airy === null && placed.lifted === null, JSON.stringify({ fast: placed.fast, airy: placed.airy, lifted: placed.lifted }));
  check('stopped on the ground saves position and facing', placed.first && Math.hypot(placed.first.x - placed.home.x, placed.first.z - placed.home.z) < 1 && Math.abs(placed.first.yaw - 1.2) < 0.05, JSON.stringify(placed.first));
  check('respawn uses the point', placed.back && Math.hypot(placed.back.x - placed.home.x, placed.back.z - placed.home.z) < 1 && Math.abs(placed.back.yaw - 1.2) < 0.05, JSON.stringify(placed.back));
  check('a timed run cannot set a point', placed.during === placed.beforeTimed, placed.during);
  check('a race ignores the personal point and stays ranked', !placed.ranked.unranked && !placed.ranked.used && placed.ranked.kept && Math.hypot(placed.ranked.x - placed.checkpoint.x, placed.ranked.z - placed.checkpoint.z) < 2, JSON.stringify(placed.ranked));
  check('pressing it again on the point clears it', placed.gone === 'null', placed.gone);
  check('with no point, a timed run respawns at the checkpoint', Math.hypot(placed.afterClear.x - placed.checkpoint.x, placed.afterClear.z - placed.checkpoint.z) < 2, JSON.stringify({ after: placed.afterClear, cp: placed.checkpoint }));
  check('no page errors', exceptions.length === 0, exceptions.join(' | '));
  console.log(JSON.stringify({ fail, exceptions }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
