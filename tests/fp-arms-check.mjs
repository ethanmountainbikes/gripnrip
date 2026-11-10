// Helmet arms, stable cameras, and lip launch. Serves the working tree.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8841, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
try { (await import('node:fs')).mkdirSync(ART, { recursive: true }); } catch {}
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9441',`--user-data-dir=/tmp/gnr-cam-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n = 0, wait = new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r = await fetch('http://127.0.0.1:9441/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params={}) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 60000); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[]; const oe=console.error; console.error=(...a)=>{ window.__errs.push(a.map(x=>String(x&&x.message||x)).join(' ')); oe(...a); }; addEventListener('error', e=>window.__errs.push(String(e.message)));` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 700)); return r.result.value; };
  const boot = async () => {
    for (let i=0;i<40;i++){ if (await ev(`!!window.__view && !!window.__riderStats`)) break; await sleep(200); }
    for (let i=0;i<25;i++){ if (await ev(`!!document.getElementById('mpAsk')`)) { await ev(`document.querySelector('#mpAsk #mpGo').click()`); break; } await sleep(150); }
    await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
    await sleep(400);
    await ev(`(() => { const S=window.__game, P=window.__world.PARK; window.__place(P.x+6, P.z+4, 0.2); S.state='riding'; S.paused=true; S.speed=2; S.air=false; S.crashT=0; const a=document.getElementById('mpAsk'); if(a) a.remove(); return true; })()`);
    await sleep(350);
  };
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await boot();
  const card = await ev(`!!document.getElementById('mpAsk')`);
  check('save card gone', !card);
  const cams = [];
  const pressV = async () => {
    const before = await ev(`window.__view.mode`);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV',bubbles:true})); document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyV',bubbles:true}));`);
    for (let i=0;i<20;i++){ await sleep(40); const m = await ev(`window.__view.mode`); if (m !== before) return m; }
    return before;
  };
  const sample = async () => {
    for (let attempt=0; attempt<3; attempt++){
      await ev(`window.__game.speed=2; window.__game.paused=true;`);
      await sleep(200);
      const slow = await ev(`window.__view`);
      await ev(`window.__game.speed=22;`);
      await sleep(200);
      const fast = await ev(`window.__view`);
      await ev(`window.__game.speed=2;`);
      await sleep(160);
      const back = await ev(`window.__view`);
      if (slow.mode === fast.mode && fast.mode === back.mode) return { mode: slow.mode, slow, fast, back };
    }
    const slow = await ev(`window.__view`);
    return { mode: slow.mode, slow, fast: slow, back: slow };
  };
  for (let step=0; step<7; step++){
    const row = await sample();
    cams.push(row);
    if (row.mode === 3 && !card){ const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(ART + '/fp-hands.png', Buffer.from(data, 'base64')); }
    await pressV();
  }
  const byMode = Object.fromEntries(cams.map(c => [c.mode, c]));
  for (const m of [0,1,2,3,4,5]){
    const c = byMode[m];
    check('mode ' + m + ' present', !!c);
    if (!c) continue;
    check('mode ' + m + ' fov stable', Math.abs(c.slow.fov - c.fast.fov) < 0.6 && Math.abs(c.back.fov - c.slow.fov) < 0.6, JSON.stringify({s:c.slow.fov,f:c.fast.fov,b:c.back.fov}));
    if (m < 3 || m === 4 || m === 5) check('mode ' + m + ' distance stable', Math.abs(c.slow.dist - c.fast.dist) < 0.35, JSON.stringify({s:c.slow.dist,f:c.fast.dist}));
  }
  check('chase fov stays 66', byMode[0] && Math.abs(byMode[0].fast.fov - 66) < 0.6, JSON.stringify(byMode[0] && byMode[0].fast.fov));
  check('helmet fov stays 78', byMode[3] && Math.abs(byMode[3].fast.fov - 78) < 0.6, JSON.stringify(byMode[3] && byMode[3].fast.fov));
  check('far cam is farther than chase', byMode[0] && byMode[1] && byMode[1].slow.dist > byMode[0].slow.dist + 1.5, '');
  const helm = byMode[3] && byMode[3].slow;
  check('helmet hides arms', helm && helm.arms.every(v => v === false), JSON.stringify(helm && helm.arms));
  check('helmet keeps hands', helm && helm.hands.every(v => v === true), JSON.stringify(helm && helm.hands));
  check('helmet hides head and torso', helm && helm.head === false && helm.torso === false, JSON.stringify(helm && {head:helm.head, torso:helm.torso}));
  check('helmet hides legs and feet', helm && helm.legs && helm.legs.every(v => v === false), JSON.stringify(helm && helm.legs));
  const chase = byMode[0] && byMode[0].slow;
  check('chase shows arms and hands', chase && chase.arms.every(Boolean) && chase.hands.every(Boolean), JSON.stringify(chase && {arms:chase.arms, hands:chase.hands}));
  check('chase shows legs', chase && chase.legs && chase.legs.every(Boolean), JSON.stringify(chase && chase.legs));
  const chest = byMode[4] && byMode[4].slow;
  check('chest shows arms', chest && chest.arms.every(Boolean), JSON.stringify(chest && chest.arms));
  const jumps = await ev(`(() => {
    const S=window.__game, W=window.__world;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    function one(pred, speed, hop){
      const f=W.features.find(pred); if(!f) return null;
      let lip=0, peak=-1; for (let t=0;t<=f.L;t+=0.05){ const h=f.p(t,0); if(h>=peak){ peak=h; lip=t; } }
      const yaw=Math.atan2(-f.dx,-f.dz);
      window.__place(f.x-f.dx*1.2, f.z-f.dz*1.2, yaw);
      S.state='riding'; S.paused=false; S.speed=speed; S.air=false; S.crashT=0; S.lastCrash=null; S.vy=0; S.popped=false; S.preload=0; S.wheelie=false;
      const h=1/120; let took=null, apex=S.y, boosts=0, wasPop=false;
      for (let t=0;t<2.8 && !S.lastCrash; t+=h){
        const a=(S.x-f.x)*f.dx+(S.z-f.z)*f.dz;
        const steer=S.air?0:Math.max(-1,Math.min(1,-wrap(yaw-S.yaw)*2.2));
        const pumpHold=hop && a>lip-1.4 && a<lip-0.08 && !S.air;
        const pop=hop && !pumpHold && a>=lip-0.08 && a<lip+0.35;
        const was=S.air;
        window.__sim(h,{steer,pedal:0,brake:0,lean:0,pumpHold,pop,counter:!!pop});
        if(!was && S.air && !took) took={vy:+S.vy.toFixed(2), spd:+S.speed.toFixed(2), y:+S.y.toFixed(2)};
        if(S.popped && !wasPop) boosts++;
        wasPop=!!S.popped; apex=Math.max(apex,S.y);
      }
      return {took, rise:took?+(apex-took.y).toFixed(2):null, boosts, crash:S.lastCrash, endSpd:+S.speed.toFixed(2), endA:+((S.x-f.x)*f.dx+(S.z-f.z)*f.dz).toFixed(2), air:!!S.air};
    }
    const tab=f=>f.kind==='table' && f.park==='Beginner Tables';
    const dub=f=>f.kind==='double' && f.park==='Intermediate Doubles';
    return { coast:one(tab,11,false), hop:one(tab,11,true), dub:one(dub,11,false), dubHop:one(dub,11,true) };
  })()`);
  const coastVy = jumps.coast && jumps.coast.took ? jumps.coast.took.vy : 0;
  check('beginner coast is not a cannon', jumps.coast && !jumps.coast.crash && (!jumps.coast.took || (jumps.coast.took.vy < 6 && jumps.coast.rise < 2.5)), JSON.stringify(jumps.coast));
  check('beginner hop still adds height', jumps.hop && jumps.hop.took && jumps.hop.took.vy > coastVy + 0.8 && jumps.hop.took.vy < 8 && jumps.hop.rise < 4 && jumps.hop.boosts === 1, JSON.stringify(jumps.hop));
  check('double still leaves the lip', jumps.dub && jumps.dub.took && jumps.dub.took.vy > 2 && jumps.dub.took.vy < 8 && jumps.dub.rise < 3, JSON.stringify(jumps.dub));
  check('double hop is one assist', jumps.dubHop && jumps.dubHop.took && jumps.dub && jumps.dub.took && jumps.dubHop.took.vy > jumps.dub.took.vy && jumps.dubHop.boosts === 1, JSON.stringify(jumps.dubHop));
  const errs = await ev(`(window.__errs||[]).slice(0,4)`);
  check('no console errors', !errs.length, JSON.stringify(errs));
  await ev(`localStorage.setItem('trailDescent.legacyRider','true'); localStorage.setItem('trailDescent.cam','3'); localStorage.setItem('trailDescent.codeShown','1');`);
  await send('Page.reload', { ignoreCache: true });
  let classic = null;
  for (let i=0;i<40;i++){
    classic = await ev(`window.__riderStats&&window.__view?{legacy:window.__riderStats.legacy, view:window.__view, state:window.__game.state, errs:(window.__errs||[]).slice(0,3)}:null`);
    if (classic && classic.legacy && classic.state==='riding' && classic.view.mode===3 && classic.view.fov>70) break;
    if (classic && classic.legacy && classic.state!=='riding') await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
    await sleep(200);
  }
  check('classic helmet hides arms', classic && classic.legacy && classic.view.mode===3 && classic.view.fov>70 && classic.view.arms.every(v=>v===false) && classic.view.hands.every(Boolean) && classic.view.head===false, JSON.stringify(classic));
  console.log(JSON.stringify({ fail, jumps, cams: cams.map(c=>({mode:c.mode, fov:[c.slow.fov,c.fast.fov], dist:[c.slow.dist,c.fast.dist], arms:c.slow.arms, hands:c.slow.hands})), classic: {legacy:classic.legacy, mode:classic.view.mode, arms:classic.view.arms, hands:classic.view.hands} }, null, 2));
  ws.close();
} finally { chrome.kill(); server.kill(); }
if (fail.length) process.exitCode = 1;
