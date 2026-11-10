// Fork and bars follow the head-tube axis. Hands stay on the grips, including the pose used in first person.
import { spawn } from 'node:child_process';
const PORT = 8874;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9474',`--user-data-dir=/tmp/gnr-steer-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9474/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),30000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,500)); return r.result.value; };
  for (let i = 0; i < 450; i++){ if (await ev(`!!window.__BR`)) break; await sleep(200); }
  const out = await ev(`(() => {
    const BR=window.__BR, THREE=window.__THREE || null;
    const hold=(speed, steer)=>{ const S={air:false,crashT:0,speed,yaw:0,pitch:0,lean:0,susp:0,wheelie:false,fakie:false,tweak:0,jolt:0,landBlend:0,wPitch:0,wYaw:0,spin:0};
      for (let i=0;i<50;i++) BR.update(S,{steer,cadence:0,standing:0},1/60); return BR.steer(); };
    const low=hold(2,1), high=hold(25,1), mid=hold(8,-1);
    const hands=()=>{ let worst=0; const names=['handL','handR'];
      names.forEach((nm,i)=>{ const h=BR.root.getObjectByName(nm); const g=BR.grips[i].clone().applyMatrix4(BR.steerG.matrix); worst=Math.max(worst, h.position.distanceTo(g)); });
      return worst; };
    hold(6, 0.8);
    const gap=hands();
    const arms=['armUpperL','armUpperR','armForeL','armForeR'].map(n=>!!BR.root.getObjectByName(n));
    return {low:+low.toFixed(3), high:+high.toFixed(3), mid:+mid.toFixed(3), handM:+gap.toFixed(4), arms, stats:BR.stats, lowDeg:+(low*180/Math.PI).toFixed(1), highDeg:+(high*180/Math.PI).toFixed(1)};
  })()`);
  check('low speed steer is at least 23 deg', Math.abs(out.low) > 0.40, JSON.stringify(out));
  check('low speed steer stays under 32 deg', Math.abs(out.low) < 0.56, JSON.stringify(out));
  check('high speed steer is between 8 and 12 deg', Math.abs(out.high) > 0.14 && Math.abs(out.high) < 0.21, JSON.stringify(out));
  check('hands stay within 2 cm of the grips', out.handM < 0.02, JSON.stringify(out));
  check('arm meshes still exist for the helmet cam', out.arms.every(Boolean), JSON.stringify(out.arms));
  check('rider under 15k tris', out.stats.riderTriangles <= 15000, JSON.stringify(out.stats));
  check('bike under 10k tris', out.stats.bikeTriangles <= 10000, JSON.stringify(out.stats));
  console.log(JSON.stringify({fail, out}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
