// Right-stick preload on a jump face must not kill the lip or teleport the bike.
import { spawn } from 'node:child_process';
const PORT = 8871;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9471',`--user-data-dir=/tmp/gnr-pre-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9471/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),40000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,700)); return r.result.value; };
  for (let i = 0; i < 450; i++){ if (await ev(`!!window.__game && !!window.__world`)) break; await sleep(200); }
  const out = await ev(`(() => {
    const S=window.__game, W=window.__world;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const f=W.features.find(f=>f.kind==='double' && f.park==='Intermediate Doubles');
    let lip=0, peak=-1; for (let t=0;t<=f.L;t+=0.05){ const h=f.p(t,0); if(h>=peak){ peak=h; lip=t; } }
    const yaw=Math.atan2(-f.dx,-f.dz);
    function ride(mode){
      window.__place(f.x-f.dx*1.5, f.z-f.dz*1.5, yaw);
      S.state='riding'; S.paused=false; S.speed=11; S.air=false; S.crashT=0; S.lastCrash=null;
      S.wheelie=false; S.wheelieArm=0; S.vy=0; S.popped=false; S.preload=0; S.fakie=false;
      const h=1/120; let took=null, apex=S.y, prevY=S.y, maxDy=0, wheelie=false, airT=0;
      for (let t=0;t<2.4 && !S.lastCrash; t+=h){
        const a=(S.x-f.x)*f.dx+(S.z-f.z)*f.dz;
        const steer=S.air?0:Math.max(-1,Math.min(1,-wrap(yaw-S.yaw)*2.2));
        const onLip=a>0.4 && a<lip+0.15;
        const pumpHold = mode!=='coast' && onLip && !S.air && (mode==='hold' || a<lip-0.12);
        const pop = mode==='pop' && !pumpHold && a>=lip-0.12 && a<lip+0.35;
        const lean = mode==='both' && onLip ? 0.9 : 0;
        const wheelieChord = mode==='both' && onLip;
        const was=S.air;
        window.__sim(h,{steer,pedal:0,brake:0,lean,pumpHold,pop,counter:!!pop,wheelieChord,tweak:0,rsy:pumpHold?0.9:0});
        const dy=Math.abs(S.y-prevY); if (!was && !S.air) maxDy=Math.max(maxDy, dy); prevY=S.y;
        if (S.wheelie) wheelie=true;
        if (!was && S.air && !took) took={vy:+S.vy.toFixed(2), y:+S.y.toFixed(2), spd:+S.speed.toFixed(2)};
        if (S.air) airT+=h; apex=Math.max(apex,S.y);
      }
      return {took, air:+airT.toFixed(2), rise:took?+(apex-took.y).toFixed(2):0, maxDy:+maxDy.toFixed(3), wheelie, crash:S.lastCrash};
    }
    return {lip:+lip.toFixed(2), coast:ride('coast'), hold:ride('hold'), pop:ride('pop'), both:ride('both')};
  })()`);
  const c = out.coast, hld = out.hold, p = out.pop, b = out.both;
  check('coast leaves the lip', c.took && c.air > 0.15, JSON.stringify(c));
  check('held preload still gets air', hld.took && hld.air + 0.02 >= c.air && hld.rise + 0.05 >= c.rise, JSON.stringify({c, hld}));
  check('held preload does not teleport', hld.maxDy < 0.08, JSON.stringify(hld));
  check('pop is at least the coast', p.took && p.rise + 0.02 >= c.rise && p.air + 0.02 >= c.air, JSON.stringify({c, p}));
  check('pop is modest', p.took && p.took.vy < c.took.vy + 2.4, JSON.stringify({c:c.took, p:p.took}));
  check('held preload is not a wheelie', !hld.wheelie, JSON.stringify(hld));
  check('both sticks on the face is not a wheelie', !b.wheelie && b.air + 0.02 >= c.air * 0.85, JSON.stringify({c, b}));
  console.log(JSON.stringify({fail, out}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
