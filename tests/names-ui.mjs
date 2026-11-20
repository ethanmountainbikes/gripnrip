// Custom rider names in the browser, against a stubbed worker (no network):
//  A) the live worker without name routes (404 "not found"): Settings says "Custom names coming soon", boards keep
//     generated names and show no report buttons.
//  B) a worker with the routes: ONE Rider name row that opens the RIDER NAME pop-up, live filter feedback, Generate name,
//     "name taken", claiming a generated name, the 7-day wait, keyboard and controller access,
//     boards showing valid custom names (a name the client filter refuses falls back), and one report per name.
import { spawn } from 'node:child_process';
const PORT = 8941, DBG = 9541;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader',`--remote-debugging-port=${DBG}`,`--user-data-dir=/tmp/gnr-names-${Date.now()}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d = '') => { if (!ok) { fail.push(n + (d ? ': ' + d : '')); console.log('FAIL', n, d); } else console.log('ok', n); };
let n = 0; const wait = new Map();
async function list(){ for (let i = 0; i < 60; i++){ try { const r = await fetch(`http://127.0.0.1:${DBG}/json/list`); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
// in-page fake worker. mode 'old' = today's live worker (no /name routes); 'new' = this branch's worker.
const STUB = `(() => {
  try { localStorage.setItem('trailDescent.codeShown', 'true'); } catch (e) {}
  window.__cloudTest = true;
  const mode = localStorage.getItem('gnrStub') || 'old';
  const calls = window.__stubCalls = [];
  const state = { name: null };
  const real = window.fetch.bind(window);
  const J = (o, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } }));
  window.fetch = (url, opt) => {
    const u = String(url); if (!u.startsWith('https://gripnrip-rooms.gripnrip.workers.dev')) return real(url, opt);
    const path = new URL(u).pathname, body = opt && opt.body ? JSON.parse(opt.body) : {};
    calls.push({ path, body });
    if (path === '/save/get') return J({ ok: true, data: null });
    if (path === '/save/put') return J({ ok: true });
    if (path === '/lb/get') {
      const top = [ { rank: 1, name: [1, 2], v: 99.5, ...(mode === 'new' ? { custom: 'ShredQueen' } : {}) },
                    { rank: 2, name: [3, 4], v: 90.1, ...(mode === 'new' ? { custom: 'sh1t' } : {}) },
                    { rank: 3, name: [5, 6], v: 80.2, me: true, ...(mode === 'new' && state.name ? { custom: state.name } : {}) } ];
      return J({ ok: true, cat: body.cat, top, total: 3, me: { rank: 3, v: 80.2 } }); }
    if (path.startsWith('/name/') && mode === 'old') return J({ error: 'not found' }, 404);
    if (path === '/name/get') return J({ ok: true, name: state.name, hidden: false, nextChange: 0 });
    if (path === '/name/set') { if (body.name.toLowerCase() === 'takenone' || window.__takeNext) { window.__takeNext = false; return J({ error: 'taken' }, 409); }
      if (state.name) return J({ error: 'soon', nextChange: Date.now() + 7 * 864e5 }, 429);
      state.name = body.name; return J({ ok: true, name: state.name, hidden: false, nextChange: Date.now() + 7 * 864e5 }); }
    if (path === '/name/clear') { state.name = null; return J({ ok: true, name: null, hidden: false, nextChange: Date.now() + 72e6 }); }
    if (path === '/name/report') return J({ ok: true, already: false, hidden: false });
    return J({ error: 'not found' }, 404);
  };
  // fake room socket (mode 'new'): records what the game sends; the "server" answers with server-picked names, including
  // one the client filter must refuse (sh1t) and one rider with no custom name
  // fake standard controller: window.__padPress(i) holds button i (0 A, 1 B, 2 X, 12-15 D-pad) for a few frames
  const pad = { index: 0, connected: true, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard', timestamp: 1, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => window.__padOn ? [pad] : [];
  // held / released for 3 game frames each (headless frames can be slow)
  const frames = n => new Promise(r => { const f0 = window.__rafs || 0, t0 = Date.now(); const w = () => ((window.__rafs || 0) - f0 >= n || Date.now() - t0 > 8000) ? r() : setTimeout(w, 20); w(); });
  window.__padPress = async i => { window.__padOn = true; await frames(3); pad.buttons[i] = { pressed: true, value: 1 }; await frames(3); pad.buttons[i] = { pressed: false, value: 0 }; await frames(3); };
  const sent = window.__wsSent = [];
  window.WebSocket = class { constructor(u){ this.url = u; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 30); }
    send(s){ const m = JSON.parse(s); sent.push(m); if (m.t === 'hello') setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ t: 'welcome', id: 1, host: 1, world: m.world, locked: false,
      ...(m.code && state.name ? { you: state.name } : {}), peers: [ { id: 2, name: [1, 2], custom: 'ShredQueen', skin: [0,0,0,0,0,0] }, { id: 3, name: [3, 4], custom: 'sh1t', skin: [0,0,0,0,0,0] }, { id: 4, name: [5, 6], skin: [0,0,0,0,0,0] } ] }) }), 30); }
    close(){ this.readyState = 3; this.onclose && this.onclose(); } };
})();`;
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}, ms = 60000) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), ms); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 900)); return r.result.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  const boot = async mode => {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(500);
    await ev(`localStorage.setItem('gnrStub', ${JSON.stringify(mode)}); localStorage.removeItem('trailDescent.customName'); localStorage.removeItem('trailDescent.nameReports'); true`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 450; i++){ if (await ev(`!!(window.__cloud && window.__game && document.querySelector('#menuPanel li'))`).catch(() => false)) break; await sleep(200); }
    await sleep(4500);   // the name check runs 4 s after start
  };
  const click = label => ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === ${JSON.stringify(label)}); if (!li) return false; li.click(); return true; })()`);
  const row = label => ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === ${JSON.stringify(label)}); return li ? { val: (li.querySelector('.mVal')?.textContent || '').replace(/[‹›]/g, '').trim(), sub: li.querySelector('.mSub')?.textContent || li.textContent } : null; })()`);
  const toasts = () => ev(`(window.__toastLog || []).slice()`);
  const toMain = async () => { for (let i = 0; i < 4 && !(await row('Settings')); i++){ await click('‹ Back'); await sleep(150); } };
  const boardNames = () => ev(`[...document.querySelectorAll('#menuPanel .lbT tr td:nth-child(2)')].map(td => ({ text: td.textContent, rep: !!td.querySelector('button.nameRep'), done: !!td.querySelector('.nameRep.done') }))`);

  const dlg = () => ev(`(() => { const o = document.querySelector('#mpAsk'); if (!o || !document.querySelector('#mpName')) return null; const i = o.querySelector('#mpName');
    return { title: o.querySelector('h3').textContent, v: i.value, say: o.querySelector('#mpNameSay').textContent, wait: o.querySelector('#mpNameWait').style.display === 'none' ? '' : o.querySelector('#mpNameWait').textContent,
      go: !o.querySelector('#mpGo').disabled, gen: !!o.querySelector('#mpGen'), focus: document.activeElement && document.activeElement.id }; })()`);
  const key = async (k, code, vk, text) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(150); };
  const CAMEL = /^[A-Z][a-z]+[A-Z][a-z]+$/;
  const nameLabels = () => ev(`[...document.querySelectorAll('#menuPanel .mLabel')].map(e => e.textContent).filter(t => /name/i.test(t))`);

  // ---- A: live worker without the routes
  await boot('old');
  await toMain(); check('A settings opens', await click('Settings')); await sleep(200);
  check('A one name row', JSON.stringify(await nameLabels()) === '["Rider name"]', JSON.stringify(await nameLabels()));
  let rider = await row('Rider name');
  check('A rider name is the generated name and says coming soon', rider && / /.test(rider.val) && /Custom names coming soon/.test(rider.sub), JSON.stringify(rider));
  await click('Rider name'); await sleep(200);
  check('A selecting it toasts coming soon (no pop-up)', (await toasts()).includes('Custom names coming soon') && !(await dlg()));
  await toMain(); await click('Leaderboards'); await sleep(1500);
  let names = await boardNames();
  check('A board shows generated names', names.length === 3 && names.every(x => / /.test(x.text) && !x.rep), JSON.stringify(names));
  check('A board has no report item', !(await row('Report a name')));

  // ---- B: worker with the routes
  await boot('new');
  await toMain(); await click('Settings'); await sleep(200);
  check('B one name row', JSON.stringify(await nameLabels()) === '["Rider name"]', JSON.stringify(await nameLabels()));
  rider = await row('Rider name');
  check('B row shows the generated name and invites a change', rider && / /.test(rider.val) && /type your own name or generate one/.test(rider.sub), JSON.stringify(rider));
  await click('Rider name'); await sleep(200);
  let d = await dlg(); check('B pop-up opens as RIDER NAME with a Generate button', d && d.title === 'RIDER NAME' && d.gen && d.focus === 'mpName', JSON.stringify(d));
  const typeIn = async v => ev(`(() => { const i = document.querySelector('#mpName'); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input')); return { v: i.value, say: document.querySelector('#mpNameSay').textContent, dis: document.querySelector('#mpGo').disabled }; })()`);
  let t = await typeIn('fuuuck'); check('B live filter: fuuuck', t.say === 'Try a different name' && t.dis, JSON.stringify(t));
  t = await typeIn('xXsh1tXx'); check('B live filter: xXsh1tXx', t.say === 'Try a different name' && t.dis, JSON.stringify(t));
  t = await typeIn('Hi there!'); check('B field strips spaces and symbols', t.v === 'Hithere' && t.say === '✓ Looks good' && !t.dis, JSON.stringify(t));
  t = await typeIn('ab'); check('B too short', /at least 3/i.test(t.say) || t.dis, JSON.stringify(t));
  t = await typeIn('Scunthorpe'); check('B Scunthorpe is fine', t.say === '✓ Looks good', JSON.stringify(t));
  t = await typeIn('Ethan2015'); check('B Ethan2015 is fine', t.say === '✓ Looks good', JSON.stringify(t));
  await typeIn('TakenOne'); await ev(`document.querySelector('#mpGo').click()`); await sleep(400);
  t = await ev(`document.querySelector('#mpNameSay')?.textContent`); check('B name taken', /^That name is taken\. Try another one!/.test(t), t);
  // Generate (mouse)
  await ev(`document.querySelector('#mpGen').click()`); d = await dlg();
  check('B Generate fills a CamelCase name', CAMEL.test(d.v) && d.v.length <= 12 && d.say === '✓ Looks good' && d.go, JSON.stringify(d));
  const g1 = d.v; await ev(`document.querySelector('#mpGen').click()`); d = await dlg();
  check('B Generate again makes another', CAMEL.test(d.v) && d.v !== g1, JSON.stringify({ g1, d }));
  // a generated name that is taken: message, then Generate again
  await ev(`window.__takeNext = true; document.querySelector('#mpGo').click()`); await sleep(400); d = await dlg();
  check('B taken generated name says so and stays open', d && /taken/.test(d.say) && /Generate/.test(d.say), JSON.stringify(d));
  // keyboard: arrows move from the box to the buttons, Enter presses, Esc cancels
  await ev(`document.querySelector('#mpName').focus(); true`);
  await key('ArrowDown', 'ArrowDown', 40); d = await dlg(); check('B keyboard: ↓ moves to Generate', d.focus === 'mpGen', JSON.stringify(d));
  const before = d.v; await key('Enter', 'Enter', 13, '\r'); d = await dlg();
  check('B keyboard: Enter on Generate makes a name', CAMEL.test(d.v) && d.v !== before, JSON.stringify(d));
  await key('ArrowRight', 'ArrowRight', 39); await key('ArrowRight', 'ArrowRight', 39); d = await dlg(); check('B keyboard: → reaches Cancel', d.focus === 'mpNo', JSON.stringify(d));
  await key('Escape', 'Escape', 27); check('B keyboard: Esc closes, Settings stays', !(await dlg()) && !!(await row('Rider name')));
  // controller: select the row with A, X generates, D-pad moves, B closes (without leaving Settings)
  await ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent === 'Rider name'); li.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); return true; })()`); await sleep(100);
  await ev(`__padPress(0)`); d = await dlg(); check('B pad: A on the row opens the pop-up', !!d, JSON.stringify(d));
  const pv = d && d.v; await ev(`__padPress(2)`); d = await dlg(); check('B pad: X generates', d && CAMEL.test(d.v) && d.v !== pv, JSON.stringify(d));
  await ev(`__padPress(13)`); d = await dlg(); check('B pad: D-pad down moves focus', d && d.focus === 'mpGen', JSON.stringify(d));
  const pv2 = d.v; await ev(`__padPress(0)`); d = await dlg(); check('B pad: A presses the focused Generate button', d && d.v !== pv2 && CAMEL.test(d.v), JSON.stringify(d));
  await ev(`__padPress(1)`); check('B pad: B closes the pop-up only', !(await dlg()) && !!(await row('Rider name')));
  // claim a generated name (first save: no wait)
  await click('Rider name'); await sleep(200); await ev(`document.querySelector('#mpGen').click()`); const myName = (await dlg()).v;
  await ev(`document.querySelector('#mpGo').click()`); await sleep(500);
  let sets = await ev(`__stubCalls.filter(c => c.path === '/name/set').map(c => c.body.name)`);
  check('B the generated name is claimed through /name/set', sets[sets.length - 1] === myName && !(await dlg()), JSON.stringify(sets));
  check('B saved on device', (await ev(`localStorage.getItem('trailDescent.customName')`)) === JSON.stringify(myName));
  rider = await row('Rider name');
  check('B row shows it with the 7-day wait', rider?.val === myName.toUpperCase() && /You can change your name in 7 days/.test(rider.sub), JSON.stringify(rider));
  await click('Rider name'); await sleep(200); await ev(`document.querySelector('#mpGen').click()`); d = await dlg();
  check('B during the wait Use is disabled with the message', d && !d.go && d.wait === 'You can change your name in 7 days', JSON.stringify(d));
  await key('Escape', 'Escape', 27);
  await toMain(); await click('Leaderboards'); await sleep(1500);
  names = await boardNames();
  check('B board shows valid custom names', names[0]?.text.startsWith('ShredQueen') && names[0].rep, JSON.stringify(names));
  check('B a name the client filter refuses shows the generated name', !/sh1t/.test(names[1]?.text) && / /.test(names[1]?.text) && !names[1].rep, JSON.stringify(names));
  check('B own row shows your name, no report', names[2]?.text.startsWith(myName + ' (you)') && !names[2].rep, JSON.stringify(names));
  const rp = await row('Report a name'); check('B pad-friendly report item', rp && rp.val === 'ShredQueen', JSON.stringify(rp));
  await ev(`document.querySelector('#menuPanel button.nameRep').click()`); await sleep(400);
  let reps = await ev(`__stubCalls.filter(c => c.path === '/name/report')`);
  check('B report sent once with the device id', reps.length === 1 && reps[0].body.name === 'ShredQueen' && /^[A-Za-z0-9]{16}$/.test(reps[0].body.device), JSON.stringify(reps));
  names = await boardNames(); check('B reported name shows as reported', names[0]?.done && !names[0].rep, JSON.stringify(names));
  check('B no report item left', !(await row('Report a name')));
  await ev(`__cloud.reportName('ShredQueen')`); reps = await ev(`__stubCalls.filter(c => c.path === '/name/report')`);
  check('B one report per device per name', reps.length === 1);
  // ---- C: rooms show server-picked custom names (myName is set; ShredQueen was reported from the board above)
  await toMain(); await click('Settings'); await sleep(200);
  const riderC = await row('Rider name'); check('C settings says rooms show the custom name', /Leaderboards and rooms show it/.test(riderC?.sub || ''), JSON.stringify(riderC));
  check('C no "rooms always use" text left', !(await ev(`document.querySelector('#menuPanel').textContent.includes('Rooms always use')`)));
  await ev(`localStorage.removeItem('trailDescent.nameReports'); __cloud.st.name.reported.clear(); true`);
  await ev(`__net.join('ABCDEF')`); await sleep(800);
  const hello = (await ev(`__wsSent.filter(m => m.t === 'hello')`))[0] || {};
  check('C hello sends the save code, no name text', /^[A-Z0-9]{16}$/.test(hello.code || '') && Array.isArray(hello.name) && !('custom' in hello), JSON.stringify(hello));
  const labels = await ev(`[...__net.st.peers.values()].map(p => p.label)`);
  check('C room peers: custom, filtered fallback, generated', labels[0] === 'ShredQueen' && labels[1] !== 'sh1t' && / /.test(labels[1]) && / /.test(labels[2]), JSON.stringify(labels));
  const hud = await ev(`document.querySelector('#mpHud').textContent`);
  check('C room badge shows my custom name', hud.includes(myName) && hud.includes('ShredQueen') && !hud.includes('sh1t'), hud);
  await toMain(); await click('Multiplayer'); await sleep(200);
  check('C room report item for the custom name only', !!(await row('Report ShredQueen')) && !(await row('Report sh1t')));
  { const yr = await row('Your rider name'); check('C multiplayer name row matches Settings', yr?.val === myName.toUpperCase() && /Leaderboards and rooms show it/.test(yr.sub), JSON.stringify(yr)); }
  if (process.env.SHOT) { const sh = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(process.env.SHOT, Buffer.from(sh.data, 'base64')); }
  await click('Report ShredQueen'); await sleep(500);
  reps = await ev(`__stubCalls.filter(c => c.path === '/name/report')`);
  check('C room report sent', reps.length === 2 && reps[1].body.name === 'ShredQueen', JSON.stringify(reps));
  check('C shows as reported', !!(await row('Reported ShredQueen')));
  await click('Leave room'); await sleep(200);
} catch (e) { fail.push('crash: ' + e.message); }
server.kill(); chrome.kill();
if (fail.length){ console.log('FAILED\n' + fail.join('\n')); process.exit(1); }
console.log('names-ui ok'); process.exit(0);
