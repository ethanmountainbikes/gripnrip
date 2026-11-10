// Custom rider names in the browser, against a stubbed worker (no network):
//  A) the live worker without name routes (404 "not found"): Settings says "Custom names coming soon", boards keep
//     generated names and show no report buttons.
//  B) a worker with the routes: live filter feedback, "name taken", setting a name, Back to generated name,
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
    if (path === '/name/set') { if (body.name.toLowerCase() === 'takenone') return J({ error: 'taken' }, 409);
      state.name = body.name; return J({ ok: true, name: state.name, hidden: false, nextChange: Date.now() + 72e6 }); }
    if (path === '/name/clear') { state.name = null; return J({ ok: true, name: null, hidden: false, nextChange: Date.now() + 72e6 }); }
    if (path === '/name/report') return J({ ok: true, already: false, hidden: false });
    return J({ error: 'not found' }, 404);
  };
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

  // ---- A: live worker without the routes
  await boot('old');
  await toMain(); check('A settings opens', await click('Settings')); await sleep(200);
  let cn = await row('Custom name');
  check('A custom name says coming soon', cn && cn.val === 'SOON' && /Custom names coming soon/.test(cn.sub), JSON.stringify(cn));
  check('A no Back to generated row', !(await row('Back to generated name')));
  const gen = await row('Generated name'), rider = await row('Rider name');
  check('A rider name is the generated name', rider && gen && rider.val === gen.val && gen.val.length > 3, JSON.stringify({ rider, gen }));
  await click('Custom name'); await sleep(200);
  check('A selecting it toasts coming soon (no dialog)', (await toasts()).includes('Custom names coming soon') && !(await ev(`!!document.querySelector('#mpName')`)));
  await toMain(); await click('Leaderboards'); await sleep(1500);
  let names = await boardNames();
  check('A board shows generated names', names.length === 3 && names.every(x => / /.test(x.text) && !x.rep), JSON.stringify(names));
  check('A board has no report item', !(await row('Report a name')));

  // ---- B: worker with the routes
  await boot('new');
  await toMain(); await click('Settings'); await sleep(200);
  cn = await row('Custom name');
  check('B custom name is available', cn && cn.val === 'NONE', JSON.stringify(cn));
  await click('Custom name'); await sleep(200);
  check('B dialog opens', await ev(`!!document.querySelector('#mpName')`));
  const typeIn = async v => ev(`(() => { const i = document.querySelector('#mpName'); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input')); return { v: i.value, say: document.querySelector('#mpNameSay').textContent, dis: document.querySelector('#mpGo').disabled }; })()`);
  let t = await typeIn('fuuuck'); check('B live filter: fuuuck', t.say === 'Try a different name' && t.dis, JSON.stringify(t));
  t = await typeIn('xXsh1tXx'); check('B live filter: xXsh1tXx', t.say === 'Try a different name' && t.dis, JSON.stringify(t));
  t = await typeIn('Hi there!'); check('B field strips spaces and symbols', t.v === 'Hithere' && t.say === '✓ Looks good' && !t.dis, JSON.stringify(t));
  t = await typeIn('ab'); check('B too short', /at least 3/i.test(t.say) || t.dis, JSON.stringify(t));
  t = await typeIn('Scunthorpe'); check('B Scunthorpe is fine', t.say === '✓ Looks good', JSON.stringify(t));
  await typeIn('TakenOne'); await ev(`document.querySelector('#mpGo').click()`); await sleep(400);
  t = await ev(`document.querySelector('#mpNameSay')?.textContent`); check('B name taken', t === 'That name is taken. Try another one!', t);
  await typeIn('TrailBoss'); await ev(`document.querySelector('#mpGo').click()`); await sleep(500);
  check('B dialog closes on success', !(await ev(`!!document.querySelector('#mpName')`)));
  check('B saved on device', (await ev(`localStorage.getItem('trailDescent.customName')`)) === '"TrailBoss"');
  check('B rider name shows it', (await row('Rider name'))?.val === 'TRAILBOSS');
  cn = await row('Custom name'); check('B once-a-day note', /tomorrow/.test(cn?.sub || ''), JSON.stringify(cn));
  check('B back-to-generated row', !!(await row('Back to generated name')));
  await toMain(); await click('Leaderboards'); await sleep(1500);
  names = await boardNames();
  check('B board shows valid custom names', names[0]?.text.startsWith('ShredQueen') && names[0].rep, JSON.stringify(names));
  check('B a name the client filter refuses shows the generated name', !/sh1t/.test(names[1]?.text) && / /.test(names[1]?.text) && !names[1].rep, JSON.stringify(names));
  check('B own row shows your custom name, no report', names[2]?.text.startsWith('TrailBoss (you)') && !names[2].rep, JSON.stringify(names));
  const rp = await row('Report a name'); check('B pad-friendly report item', rp && rp.val === 'ShredQueen', JSON.stringify(rp));
  await ev(`document.querySelector('#menuPanel button.nameRep').click()`); await sleep(400);
  let reps = await ev(`__stubCalls.filter(c => c.path === '/name/report')`);
  check('B report sent once with the device id', reps.length === 1 && reps[0].body.name === 'ShredQueen' && /^[A-Za-z0-9]{16}$/.test(reps[0].body.device), JSON.stringify(reps));
  names = await boardNames(); check('B reported name shows as reported', names[0]?.done && !names[0].rep, JSON.stringify(names));
  check('B no report item left', !(await row('Report a name')));
  await ev(`__cloud.reportName('ShredQueen')`); reps = await ev(`__stubCalls.filter(c => c.path === '/name/report')`);
  check('B one report per device per name', reps.length === 1);
  await toMain(); await click('Settings'); await sleep(200);
  await click('Back to generated name'); await sleep(400);
  check('B back to generated', (await row('Custom name'))?.val === 'NONE' && (await row('Rider name'))?.val === (await row('Generated name'))?.val);
} catch (e) { fail.push('crash: ' + e.message); }
server.kill(); chrome.kill();
if (fail.length){ console.log('FAILED\n' + fail.join('\n')); process.exit(1); }
console.log('names-ui ok'); process.exit(0);
