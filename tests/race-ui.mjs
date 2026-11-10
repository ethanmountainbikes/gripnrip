// The start gate is free ride until a race is chosen, and race stays locked until the trail is cleared.
import { spawn } from 'node:child_process';
const PORT = 8928;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9528',`--user-data-dir=/tmp/gnr-race-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9528/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
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
  for (let i = 0; i < 50; i++){ if (await ev(`!!window.__race`)) break; await sleep(200); }
  const click = async label => ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent.includes(${JSON.stringify(label)})); if (!li) return 'missing'; li.click(); return 'ok'; })()`);
  check('trails opens', await click('Trails') === 'ok');
  await sleep(250);
  const locked = await ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => !el.classList.contains('dis') && el.querySelector('small')?.textContent.includes('Complete this trail')); return li?.querySelector('small')?.textContent || ''; })()`);
  check('the trail list shows the race lock', locked.includes('Complete this trail to unlock racing'), locked);
  check('open the trail', await ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => !el.classList.contains('dis') && el.querySelector('small')?.textContent.includes('Complete this trail')); if (!li) return 'missing'; li.click(); return 'ok'; })()`) === 'ok');
  await sleep(200);
  const chooser = await ev(`(() => ({ title: document.querySelector('#menuPanel h2')?.textContent || '', race: [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Race')?.querySelector('small')?.textContent || '' }))()`);
  check('the trail menu offers free ride and a locked race', chooser.race.includes('Complete this trail to unlock racing'), JSON.stringify(chooser));
  check('free ride starts', await click('Free Ride') === 'ok');
  await sleep(300);
  await ev(`(() => {
    const tr = window.__world.trails.find(t => window.__game.free ? t.id === window.__game.free.t : true) || window.__world.trails[0];
    const S = window.__game;
    window.__place(tr.pts[3][0], tr.pts[3][1], tr.yaw[3]);
    S.paused = false; S.run = null; S.free = null; S.speed = 4; S.air = false; S.crashT = 0;
    window.__sim(0.3, { steer: 0, pedal: 0, brake: 0 });
    S.paused = true;
    return true;
  })()`);
  await sleep(400);
  const gate = await ev(`(() => {
    const S = window.__game, q = localStorage.getItem('trailDescent.lbQueue');
    return { run: S.run, free: S.free && S.free.t, at: S.atStart, queue: q, prompt: document.getElementById('gatePrompt')?.textContent || '' };
  })()`);
  check('riding the start does not start a race', gate.run == null, JSON.stringify(gate));
  check('free ride is recorded at the gate', typeof gate.free === 'number', JSON.stringify(gate));
  check('the gate says racing is locked', (gate.prompt || '').includes('Complete this trail to unlock racing'), gate.prompt);
  check('a free ride does not queue a leaderboard time', !gate.queue || gate.queue === '{}' || !String(gate.queue).includes('/lb/submit'), gate.queue);
  const opened = await ev(`(() => { window.__race.mark(0); return { open: window.__race.open(0), submitFree: window.__race.submit({ mode: 'free', cp: 9, cpCount: 3 }), submitRace: window.__race.submit({ mode: 'race', cp: 2, cpCount: 3 }) }; })()`);
  check('finishing the layout unlocks the race', opened.open === true, JSON.stringify(opened));
  check('only a clean race would submit', opened.submitFree === false && opened.submitRace === true, JSON.stringify(opened));
  console.log(JSON.stringify({ fail, gate, opened }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
