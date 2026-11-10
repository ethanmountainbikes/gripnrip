// Settings list scrolls on a short window, the frame cap is saved and actually limits draws, and no music track plays.
import { spawn } from 'node:child_process';
const PORT = 8932;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9532',`--user-data-dir=/tmp/gnr-set-${Date.now()}`, '--window-size=1280,600', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); else console.log('ok', n); };
let n = 0, wait = new Map();
async function list(){ for (let i = 0; i < 40; i++){ try { const r = await fetch('http://127.0.0.1:9532/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
const medianGap = times => { if (!times || times.length < 4) return 0; const g = []; for (let i = 1; i < times.length; i++) g.push(times[i] - times[i-1]); g.sort((a,b) => a-b); return g[Math.floor(g.length/2)]; };
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}, ms = 40000) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), ms); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  const boot = async (w, h, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 900)); return r.result.value; };
    for (let i = 0; i < 50; i++){ if (await ev(`!!window.__settings && !!document.querySelector('#menuPanel')`)) break; await sleep(200); }
    return ev;
  };
  const openSettings = async ev => {
    const hit = await ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Settings'); if (!li) return 'missing'; li.click(); return 'ok'; })()`);
    await sleep(200);
    return hit;
  };
  const listBox = async ev => ev(`(() => { const ul = document.querySelector('#menuPanel .mItems'); const r = ul.getBoundingClientRect(); const cs = getComputedStyle(ul); return { scroll: ul.classList.contains('scroll'), sh: ul.scrollHeight, ch: ul.clientHeight, top: ul.scrollTop, oy: cs.overflowY, touch: cs.touchAction, x: r.x + r.width/2, y: r.y + Math.min(r.height/2, 80), items: ul.children.length }; })()`);

  let ev = await boot(1280, 600, false);
  check('settings opens at 1280x600', await openSettings(ev) === 'ok');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  let box = await listBox(ev);
  check('phone settings list can scroll', box.sh > box.ch + 20 && (box.oy === 'auto' || box.oy === 'scroll'), JSON.stringify(box));
  const touchBefore = await ev(`(() => { const ul = document.querySelector('#menuPanel .mItems'); ul.scrollTop = 0; return ul.scrollTop; })()`);
  const y0 = Math.min(box.y + Math.max(120, box.ch * 0.45), 640);
  console.log('touch from', box.x, y0, 'box', box.y, box.ch);
  try {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(box.x), y: Math.round(y0), id: 1 }] }, 8000);
    for (let i = 1; i <= 8; i++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(box.x), y: Math.round(y0 - i * 24), id: 1 }] }, 8000);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, 8000);
  } catch (e) { console.log('touch error', e.message); }
  await sleep(200);
  const touchAfter = await ev(`document.querySelector('#menuPanel .mItems').scrollTop`);
  console.log('touch', touchBefore, touchAfter);
  check('a touch drag scrolls the settings list', touchAfter > touchBefore + 8, `before ${touchBefore} after ${touchAfter}`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 600, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  box = await listBox(ev);
  check('settings list is a scroll container', box.scroll && (box.oy === 'auto' || box.oy === 'scroll') && box.sh > box.ch + 20, JSON.stringify(box));
  const wheeled = await ev(`(() => { const ul = document.querySelector('#menuPanel .mItems'); ul.scrollTop = 0; return ul.scrollTop; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await send('Input.synthesizeScrollGesture', { x: box.x, y: box.y, xDistance: 0, yDistance: -320, speed: 800, preventFling: true });
  await sleep(400);
  const afterWheel = await ev(`document.querySelector('#menuPanel .mItems').scrollTop`);
  console.log('wheel', wheeled, afterWheel);
  check('mouse wheel scrolls the settings list', afterWheel > wheeled + 10, `before ${wheeled} after ${afterWheel}`);
  const beforeSel = await ev(`(() => { const ul = document.querySelector('#menuPanel .mItems'); ul.scrollTop = 0; return { top: ul.scrollTop, sel: +ul.querySelector('li.sel')?.dataset.k }; })()`);
  for (let i = 0; i < 12; i++) await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await sleep(80);
  const afterSel = await ev(`(() => { const ul = document.querySelector('#menuPanel .mItems'); const s = ul.querySelector('li.sel'); const rel = s.offsetTop - ul.scrollTop; return { top: ul.scrollTop, sel: +s.dataset.k, rel, ch: ul.clientHeight, vis: rel >= -2 && rel < ul.clientHeight }; })()`);
  check('moving focus scrolls the selected setting into view', afterSel.sel > beforeSel.sel && afterSel.top > beforeSel.top && afterSel.vis, JSON.stringify({ beforeSel, afterSel }));

  const labels = await ev(`[...document.querySelectorAll('#menuPanel .mLabel')].map(el => el.textContent)`);
  check('music controls are gone', !labels.some(t => /music|skip song/i.test(t)), JSON.stringify(labels));
  check('ambience volume is in settings', labels.includes('Ambience volume'));
  check('frame rate is in settings', labels.includes('Frame rate'));
  let cap = '';
  for (let i = 0; i < 8 && !String(cap).includes('30'); i++){
    await ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Frame rate'); li.click(); return li.querySelector('.mVal').textContent; })()`);
    await sleep(40);
    cap = await ev(`[...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Frame rate').querySelector('.mVal').textContent`);
  }
  check('frame rate can be set to 30', String(cap).includes('30'), cap);
  const saved = await ev(`JSON.parse(localStorage.getItem('trailDescent.settings') || '{}')`);
  check('the 30 FPS cap is saved', saved.fpsCap === 30, JSON.stringify(saved.fpsCap));
  const paced = await ev(`new Promise(res => {
    const r = window.__renderer, draw = r.render.bind(r); let draws = 0; r.render = () => { draws++; };
    window.__calls = 0; window.__presents = 0; window.__presentAt = [];
    const t = setInterval(() => { window.__calls++; window.__frame(); if (window.__calls >= 36){ clearInterval(t); r.render = draw; res({ calls: window.__calls, presents: window.__presents, draws, at: window.__presentAt.slice() }); } }, 16);
  })`);
  const gap = medianGap(paced.at);
  check('a 30 FPS cap draws fewer frames than the loop', paced.presents > 6 && paced.presents < paced.calls * 0.75, JSON.stringify({ calls: paced.calls, presents: paced.presents, gap }));
  check('presented frames are at least ~30ms apart', gap >= 28, String(gap));
  const open = await ev(`new Promise(res => {
    const r = window.__renderer, draw = r.render.bind(r); r.render = () => {};
    window.__settings.fpsCap = 0; window.__saveSettings(); window.__calls = 0; window.__presents = 0;
    const t = setInterval(() => { window.__calls++; window.__frame(); if (window.__calls >= 16){ clearInterval(t); r.render = draw; res({ calls: window.__calls, presents: window.__presents, saved: JSON.parse(localStorage.getItem('trailDescent.settings')).fpsCap }); } }, 16);
  })`);
  check('unlimited is saved and draws on every frame', open.saved === 0 && open.presents >= open.calls - 1, JSON.stringify(open));
  const audio = await ev(`(() => { const els = [...document.querySelectorAll('audio')]; const songs = performance.getEntriesByType('resource').filter(e => /\\/music\\//.test(e.name)).map(e => e.name); return { audio: els.map(a => ({ src: a.currentSrc, paused: a.paused })), songs, playing: window.__musicPlaying() }; })()`);
  check('no music element is playing', audio.audio.length === 0 && audio.songs.length === 0 && audio.playing === false, JSON.stringify(audio));
  console.log(JSON.stringify({ fail, box, paced, gap, open, audio }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
