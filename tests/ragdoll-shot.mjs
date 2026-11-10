// In-game bail: ragdoll stays finite, helmet cam pulls back, respawn restores the rider, follow drone keeps filming.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8894, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9494',`--user-data-dir=/tmp/gnr-rag-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9494/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={},ms=40000)=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),ms); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,900)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!window.__bail`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(400);
  await ev(`(() => {
    const S=window.__game, P=window.__world.PARK, g=window.__groundH;
    document.getElementById('mpAsk')?.remove(); document.getElementById('help')?.classList.add('hidden');
    window.__place(P.x+18, P.z+4, 0.5); S.state='riding'; S.paused=true; S.run=null; S.crashT=0; S.air=true;
    S.speed=12; S.pitch=0.35; S.vy=2.2; S.vx=-Math.sin(0.5)*12; S.vz=-Math.cos(0.5)*12; S.y=g(S.x,S.z)+1.6; S.lean=0.4;
    window.__setCam(3); window.__bail(); window.__sim(0.42, {steer:0});
    return true;
  })()`);
  await sleep(200);
  const shotInfo = await ev(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { const v=window.__view, rep=window.__ragdollReport(); resolve({ on:window.__ragdoll.on, mode:v.mode, dist:v.dist, up:v.off.y, gap:rep&&rep.gap, speed:rep&&rep.speed }); })))`);
  check('mid tumble is still the bail', shotInfo.on === true, JSON.stringify(shotInfo));
  check('helmet cam switches to a nearby third person view', shotInfo.dist > 2.5 && shotInfo.up > 1, JSON.stringify(shotInfo));
  const {data}=await send('Page.captureScreenshot',{format:'png'}, 25000);
  writeFileSync(`${ART}/ragdoll-tumble.png`, Buffer.from(data,'base64'));
  const out = await ev(`(() => {
    const S=window.__game, P=window.__world.PARK, g=window.__groundH, BR=window.__BR;
    const cases=[];
    const speeds=[[6,0],[14,0.35],[20,-0.4]];
    for (const [speed, pitch] of speeds){
      window.__place(P.x+16, P.z+6, 0.2);
      S.state='riding'; S.paused=true; S.run=null; S.crashT=0; S.lastCrash=null;
      S.speed=speed; S.pitch=pitch; S.vy=1.2; S.vx=-Math.sin(0.2)*speed; S.vz=-Math.cos(0.2)*speed; S.air=true; S.y=g(S.x,S.z)+1.2;
      window.__setCam(3); window.__bail();
      window.__sim(0.45, {steer:0,pedal:0,brake:0});
      const mid=window.__ragdollReport();
      const head=window.__ragdoll.parts.head, cam=window.__renderer.domElement && {x:0};
      const view=window.__view;
      window.__sim(3, {steer:0,pedal:0,brake:0});
      cases.push({ speed, mid, on:window.__ragdoll.on, crashT:+S.crashT.toFixed(2), parent:BR.parts.torso.parent===BR.root, headParent:BR.parts.head.parent===BR.root, view });
    }
    window.__place(P.x+16, P.z+6, 0.2); S.state='riding'; S.paused=true; S.run=null; S.crashT=0; S.speed=10; S.vx=0; S.vz=-10; S.vy=1; S.pitch=0.2; S.y=g(S.x,S.z)+1;
    window.__bail(); window.__sim(0.25, {steer:0});
    const early=window.__ragdoll.on;
    window.__respawn();
    const button=!window.__ragdoll.on && S.crashT<=0 && BR.parts.torso.parent===BR.root;
    window.__settings.droneFly='follow'; window.__saveSettings();
    window.__place(P.x+16, P.z+6, 0.2); S.state='riding'; S.paused=true; S.run=null; S.crashT=0; S.speed=8; S.vx=0; S.vz=-8; S.vy=0;
    if (!window.__drone.on) window.__droneToggle();
    window.__bail(); window.__sim(0.3, {steer:0});
    const drone={on:!!window.__drone.on, manual:!!window.__drone.manual, rag:!!window.__ragdoll.on};
    window.__sim(3, {steer:0});
    return { cases, early, button, drone };
  })()`);
  for (const c of out.cases){
    check(`speed ${c.speed} stays finite`, c.mid && c.mid.finite && c.mid.bikeFinite && c.mid.spread < 2.2, JSON.stringify(c.mid));
    check(`speed ${c.speed} joints limited`, c.mid && c.mid.slack < 0.25, JSON.stringify(c.mid && c.mid.slack));
    check(`speed ${c.speed} respawns`, c.on === false && c.crashT <= 0 && c.parent && c.headParent, JSON.stringify({ on:c.on, crashT:c.crashT, parent:c.parent }));
  }
  check('button respawn ends the bail', out.early === true && out.button === true, JSON.stringify({ early:out.early, button:out.button }));
  check('follow drone keeps filming during the bail', out.drone.on && out.drone.manual === false && out.drone.rag, JSON.stringify(out.drone));
  console.log(JSON.stringify({ fail, shotInfo, out: { cases: out.cases.map(c => ({ speed:c.speed, mid:c.mid, on:c.on, parent:c.parent })), early:out.early, button:out.button, drone:out.drone } }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
