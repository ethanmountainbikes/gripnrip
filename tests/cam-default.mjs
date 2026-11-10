// Helmet cam is the default. A saved trailDescent.cam value is kept, including 0 (chase).
import { spawn } from 'node:child_process';
const PORT = 8884;
const dir = `/tmp/gnr-camdef-${Date.now()}`;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9484',`--user-data-dir=${dir}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9484/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),30000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,600)); return r.result.value; };
  const boot = async (setup) => {
    if (setup) await send('Page.addScriptToEvaluateOnNewDocument', { source: setup });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i=0;i<40;i++){ if (await ev(`!!window.__view`)) break; await sleep(200); }
    return ev(`({mode:window.__view.mode, saved:localStorage.getItem('trailDescent.cam')})`);
  };
  const fresh = await boot('');
  check('new player starts in helmet cam', fresh.mode === 3, JSON.stringify(fresh));
  check('default is not written until the player chooses', fresh.saved === null, JSON.stringify(fresh));
  await ev(`window.__setCam(0); window.__respawn();`);
  await sleep(200);
  const respawnFresh = await ev(`window.__view.mode`);
  check('respawn with no saved choice returns to helmet', respawnFresh === 3, String(respawnFresh));
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(250);
  const names = [await ev(`window.__view.mode`)];
  for (let i=0;i<7;i++){
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',bubbles:true})); document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyV',bubbles:true}));`);
    names.push(+(await ev(`localStorage.getItem('trailDescent.cam')`)));
  }
  await sleep(200);
  names.push(await ev(`window.__view.mode`));
  check('switching still visits every view', new Set(names.filter(v => v !== null)).size === 7, JSON.stringify(names));
  const savedAfterSwitch = await ev(`localStorage.getItem('trailDescent.cam')`);
  check('an explicit switch is saved', savedAfterSwitch !== null && savedAfterSwitch !== 'null', savedAfterSwitch);
  const chase = await boot(`localStorage.setItem('trailDescent.cam','0');`);
  check('saved chase stays chase', chase.mode === 0, JSON.stringify(chase));
  await ev(`window.__setCam(4); window.__respawn();`);
  await sleep(150);
  const respawnChase = await ev(`window.__view.mode`);
  check('respawn keeps the saved chase view', respawnChase === 0, String(respawnChase));
  const far = await boot(`localStorage.setItem('trailDescent.cam','1');`);
  check('saved far chase stays far chase', far.mode === 1, JSON.stringify(far));
  console.log(JSON.stringify({fail, fresh, names, chase, far, respawnFresh, respawnChase}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
