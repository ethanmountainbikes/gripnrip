// Ride Rock Garden at slow, typical and fast speed with the real physics.
import { spawn } from 'node:child_process';
const PORT = 8902;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9502',`--user-data-dir=/tmp/gnr-rr-${Date.now()}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9502/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={},ms=120000)=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),ms); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,900)); return r.result.value; };
  for (let i = 0; i < 450; i++){ if (await ev(`!!window.__sim && !!window.__world`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(400);
  const out = await ev(`(() => {
    const S=window.__game, W=window.__world, g=window.__groundH;
    const tr=W.trails.find(t=>t.name==='Rock Garden');
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    let cN=0,cHit=0,wN=0,wHit=0;
    for (let i=1;i<tr.pts.length-1;i++){
      const [x,z]=tr.pts[i], yaw=tr.yaw[i];
      const hit=u=>W.featH(x+Math.cos(yaw)*u, z-Math.sin(yaw)*u)>0.02;
      cN++; if (hit(0)) cHit++;
      for (const u of [-1.6,-0.8,0,0.8,1.6]){ wN++; if (hit(u)) wHit++; }
    }
    function ride(target){
      const [x,z]=tr.pts[2];
      window.__place(x,z,tr.yaw[2]);
      S.state='riding'; S.paused=true; S.speed=target; S.vx=-Math.sin(tr.yaw[2])*target; S.vz=-Math.cos(tr.yaw[2])*target;
      S.air=false; S.crashT=0; S.lastCrash=null; S.run=null; S.wheelie=false; S.lives=3;
      const h=1/120; let prog=0, crash=null, off=0, maxOff=0;
      for (let t=0;t<300 && !crash; t+=h){
        let best=1e9, s=0, nearI=2;
        for (let i=0;i<tr.pts.length;i+=2){ const d=(tr.pts[i][0]-S.x)**2+(tr.pts[i][1]-S.z)**2; if (d<best){ best=d; s=i*2; nearI=i; } }
        const look=tr.pts[Math.min(tr.pts.length-1, nearI+6)];
        const aim=Math.atan2(-(look[0]-S.x), -(look[1]-S.z));
        const offT=Math.sqrt(best);
        maxOff=Math.max(maxOff, offT); if (offT>14){ off=offT; break; }
        prog=Math.max(prog, s);
        if (s>tr.len-16) break;
        let steer=Math.max(-1, Math.min(1, -wrap(aim-S.yaw)*1.15));
        let pedal=0, brake=0;
        if (S.air) steer=Math.max(-0.2, Math.min(0.2, -wrap((S.travel??S.yaw)-S.yaw)*2));
        else if (S.speed>target*1.05){
          brake=Math.abs(steer)>0.32 ? 0.28 : 0.9;
          if (brake>0.3) steer=Math.max(-0.28, Math.min(0.28, steer));
        } else if (S.speed<target*0.9) pedal=1;
        window.__sim(h,{steer,pedal,brake,lean:0,pumpHold:false,pop:false});
        if (S.lastCrash) crash=S.lastCrash+' @'+s.toFixed(0)+'m '+((S.speed||0)*3.6).toFixed(0)+'km/h';
      }
      return { target, prog:+prog.toFixed(0), len:+tr.len.toFixed(0), crash, off:+off.toFixed(1), maxOff:+maxOff.toFixed(1), done: prog>tr.len-16 && !crash };
    }
    const runs=[4.5, 9, 14].map(ride);
    return { cover:{center:+(cHit/cN).toFixed(3), tread:+(wHit/wN).toFixed(3)}, runs, drops:window.__features.filter(f=>f.trail===tr.id && f.rockDrop).map(f=>+f.rockDrop.toFixed(2)), rolls:window.__features.filter(f=>f.trail===tr.id && f.rockRoll).length };
  })()`);
  check('tread is mostly rock', out.cover.tread >= 0.85 && out.cover.center >= 0.85, JSON.stringify(out.cover));
  check('has rock drops in range', out.drops.length >= 2 && out.drops.every(h => h >= 0.5 && h <= 1.5), JSON.stringify(out.drops));
  check('has rock rolls', out.rolls >= 2, String(out.rolls));
  for (const r of out.runs) check('ride '+r.target+' m/s finishes', r.done, JSON.stringify(r));
  console.log(JSON.stringify({ fail, out }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
