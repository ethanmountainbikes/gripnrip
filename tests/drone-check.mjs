// FPV drone: toggle, settings, bounds, soft collision, and no fight with gear or lean.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
const PORT = 8886, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
try { (await import('node:fs')).mkdirSync(ART, { recursive: true }); } catch {}
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9486',`--user-data-dir=/tmp/gnr-drone-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9486/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={},ms=40000)=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),ms); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,800)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!window.__drone`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(400);
  const out = await ev(`(() => {
    const S=window.__game, P=window.__world.PARK, g=window.__groundH, D=window.__drone, ST=window.__settings;
    window.__place(P.x+36, P.z+24, 0); S.state='riding'; S.paused=false; S.speed=8; S.run=null; S.air=false; S.crashT=0;
    window.__drv.pending = 0;
    const gear0=window.__drv.gear;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyG',bubbles:true}));
    const gear1=window.__drv.pending || window.__drv.gear, droneAfterGear=D.on;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',bubbles:true}));
    const lean=window.__readInput();
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyQ',bubbles:true}));
    ST.droneFly='manual'; window.__saveSettings();
    const bike=S.x;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    const y0=D.y, x0=D.x;
    for (let i=0;i<40;i++) window.__droneFly(1/30, {steer:0, lyRaw:-1, bankRaw:0, rsy:-0.8});
    const climbed={dy:+(D.y-y0).toFixed(2), dx:+(D.x-x0).toFixed(2), bikeMoved:Math.abs(S.x-bike)>0.05, speed:S.speed, on:D.on, manual:D.manual};
    const yaw0=D.yaw;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true}));
    for (let i=0;i<8;i++) window.__droneFly(1/30, window.__readInput());
    const arrow={dyaw:+(D.yaw-yaw0).toFixed(3), roll:+D.roll.toFixed(3)};
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowLeft',bubbles:true}));
    const yawA0=D.yaw;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',bubbles:true}));
    for (let i=0;i<8;i++) window.__droneFly(1/30, window.__readInput());
    const yawA=+(D.yaw-yawA0).toFixed(3);
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA',bubbles:true}));
    const half=1380;
    D.x = half + 200; D.y = g(0,0) + 5;
    window.__droneFly(1/20, {steer:0, lyRaw:0, bankRaw:0, rsy:0});
    const bounded=Math.abs(D.x) <= half - 70;
    D.y = -50;
    window.__droneFly(1/20, {steer:0, lyRaw:0, bankRaw:0, rsy:0});
    const above=D.y >= g(D.x, D.z) + 0.4;
    const g0=g(D.x, D.z); D.y=g0+200;
    window.__droneFly(1/20, {steer:0, lyRaw:0, bankRaw:0, rsy:0});
    const ceiling=D.y <= g0 + 81;
    let tree=null;
    for (let ci=-2; ci<=6 && !tree; ci++) for (let cj=-2; cj<=6 && !tree; cj++){
      const cell=window.__world.treesInCell(ci, cj);
      if (cell && cell[0]){ const t=cell[0]; D.x=t.x; D.z=t.z; D.y=g(t.x,t.z)+3; window.__droneFly(1/20,{steer:0,lyRaw:0,bankRaw:0,rsy:0}); tree=+Math.hypot(D.x-t.x, D.z-t.z).toFixed(2); }
    }
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    const off=!D.on;
    S.run={t:0, start:0, s:0, cpt:[]};
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    const blocked=!D.on;
    S.run=null;
    ST.droneSpeed=18; ST.droneTilt=21; ST.droneDist=11; ST.droneHeight=6; ST.droneFly='follow'; window.__saveSettings();
    const saved=JSON.parse(localStorage.getItem('trailDescent.settings'));
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    const rx=S.x, rz=S.z;
    for (let i=0;i<30;i++) window.__droneFly(1/20, {steer:0, lyRaw:0, bankRaw:0, rsy:0});
    const follow={on:D.on, manual:D.manual, dist:+Math.hypot(D.x-rx, D.z-rz).toFixed(1), above:+(D.y-S.y).toFixed(1)};
    return {gear0, gear1, droneAfterGear, lean:lean.bank, climbed, arrow, yawA, bounded, above, ceiling, tree, off, blocked, saved:{speed:saved.droneSpeed, tilt:saved.droneTilt, dist:saved.droneDist, height:saved.droneHeight, fly:saved.droneFly}, follow, help:document.getElementById('help').textContent.includes('FPV drone')};
  })()`);
  check('G still shifts gear and does not launch the drone', out.gear1 === out.gear0 + 1 && out.droneAfterGear === false, JSON.stringify({gear0:out.gear0, gear1:out.gear1, drone:out.droneAfterGear}));
  check('Q still leans', out.lean < -0.5, JSON.stringify(out.lean));
  check('Z starts manual flight and the bike stays put', out.climbed.on && out.climbed.manual && out.climbed.dy > 0.4 && out.climbed.speed === 0 && !out.climbed.bikeMoved, JSON.stringify(out.climbed));
  check('arrow rolls the drone and A yaws it', Math.abs(out.arrow.dyaw) < 0.02 && out.arrow.roll < -0.15 && out.yawA < -0.2, JSON.stringify({arrow:out.arrow, yawA:out.yawA}));
  check('drone stays inside the map', out.bounded, '');
  check('drone sits above the ground', out.above, '');
  check('drone stays under the height ceiling', out.ceiling, '');
  check('drone does not stay inside a tree', out.tree === null || out.tree >= 1.4, JSON.stringify(out.tree));
  check('Z puts the drone away', out.off, '');
  check('a timed run refuses the drone', out.blocked, '');
  check('settings persist in the existing settings object', out.saved.speed === 18 && out.saved.tilt === 21 && out.saved.dist === 11 && out.saved.height === 6 && out.saved.fly === 'follow', JSON.stringify(out.saved));
  check('follow mode keeps the drone near the rider', out.follow.on && !out.follow.manual && out.follow.dist > 2 && out.follow.dist < 40 && out.follow.above > 1, JSON.stringify(out.follow));
  check('help mentions the drone', out.help, '');
  writeFileSync('/tmp/drone-out.json', JSON.stringify({fail, out}, null, 2));
  console.log(JSON.stringify({fail, out}, null, 2));
  await ev(`window.__gone=1; localStorage.setItem('trailDescent.settings', JSON.stringify({gfx:'low', tod:'noon', volume:0.33, invertY:true, musicOn:false})); localStorage.setItem('trailDescent.codeShown','true'); location.reload();`);
  let booted = false;
  for (let i=0;i<50;i++){ booted = await ev(`!window.__gone && !!window.__drone && !!window.__settings`).catch(()=>false); if (booted) break; await sleep(200); }
  if (!booted) throw new Error('reload did not finish');
  const compat = await ev(`(() => { const s=window.__settings; return {speed:s.droneSpeed, tilt:s.droneTilt, dist:s.droneDist, height:s.droneHeight, fly:s.droneFly, volume:s.volume, invertY:s.invertY, gfx:s.gfx}; })()`);
  check('an old settings save still loads and keeps its own keys', compat.speed === 12 && compat.tilt === 12 && compat.dist === 8 && compat.height === 4 && compat.fly === 'follow' && compat.volume === 0.33 && compat.invertY === true && compat.gfx === 'low', JSON.stringify(compat));
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(500);
  await ev(`document.getElementById('mpAsk')?.remove(); document.getElementById('help')?.classList.add('hidden');`);
  const shot = async (name) => {
    for (const extra of [{}, {fromSurface:true}]){
      try { const {data}=await send('Page.captureScreenshot',{format:'png', ...extra}, 20000); writeFileSync(`${ART}/${name}.png`, Buffer.from(data,'base64')); console.log('shot', name); return; }
      catch (e) { console.log('shot retry', name, e.message); }
    }
  };
  await ev(`(() => {
    const S=window.__game, P=window.__world.PARK, D=window.__drone;
    window.__place(P.x+20, P.z+8, 0.4); S.state='riding'; S.paused=true; S.run=null; S.speed=0;
    window.__settings.droneFly='manual'; window.__saveSettings();
    D.on=false;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    for (let i=0;i<24;i++) window.__droneFly(1/30, {lyRaw:-0.7, bankRaw:0, rsy:-0.35});
    S.paused=true;
  })()`);
  await sleep(400);
  await shot('drone-manual');
  await ev(`(() => {
    const S=window.__game, D=window.__drone;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    window.__settings.droneFly='follow'; window.__settings.droneDist=8; window.__settings.droneHeight=4; window.__saveSettings();
    S.speed=7; S.paused=false; S.run=null;
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyZ',bubbles:true}));
    for (let i=0;i<40;i++) window.__droneFly(1/20, {lyRaw:0, bankRaw:0, rsy:0});
    S.paused=false;
  })()`);
  await sleep(600);
  await shot('drone-follow');
  console.log(JSON.stringify({fail, out}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
