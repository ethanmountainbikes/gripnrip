// Camera-to-rider offset at 2 m/s vs 25 m/s, flat and downhill. The bike must actually move.
import { spawn } from 'node:child_process';
const PORT = 8863;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9463',`--user-data-dir=/tmp/gnr-off-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9463/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),40000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,600)); return r.result.value; };
  for (let i = 0; i < 450; i++){ if (await ev(`!!window.__view`)) break; await sleep(200); }
  for (let i=0;i<20;i++){ if (await ev(`!!document.getElementById('mpAsk')`)) { await ev(`document.querySelector('#mpAsk #mpGo').click()`); break; } await sleep(120); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(400);
  const spot = await ev(`(() => {
    const W=window.__world, g=W.terrainH || window.__groundH;
    const slope=(x,z)=> (window.__groundH(x,z-4)-window.__groundH(x,z+4))/8;
    let flat=null, down=null;
    for (let x=-400;x<=200;x+=20) for (let z=200;z<=700;z+=20){
      if (W.featH(x,z)>0.02 || W.inPark(x,z)) continue;
      if (W.trails && false) continue;
      const s=slope(x,z);
      if (Math.abs(s)<0.015 && !flat) flat={x,z,s:+s.toFixed(3), yaw:0};
      if (s<-0.07 && s>-0.14 && (!down || Math.abs(s+0.1)<Math.abs(down.s+0.1))) down={x,z,s:+s.toFixed(3), yaw:0};
    }
    return { flat, down };
  })()`);
  const settle = async (place, speed, mode) => {
    await ev(`(() => { const S=window.__game; window.__setCam(${mode}); window.__place(${place.x}, ${place.z}, ${place.yaw||0}); S.state='riding'; S.paused=false; S.air=false; S.crashT=0; S.lift=null; S.lastCrash=null; window.__holdSpeed=${speed}; S.speed=${speed}; S.vx=-Math.sin(${place.yaw||0})*${speed}; S.vz=-Math.cos(${place.yaw||0})*${speed}; return true; })()`);
    let v = null;
    for (let i=0;i<25;i++){
      await sleep(80);
      v = await ev(`window.__view`);
      if (v && v.mode===mode && Math.abs(v.spd-speed)<0.4) return v;
    }
    return v;
  };
  const rows = [];
  for (const mode of [0,1,2,3,4,5]){
    const flatLo = await settle(spot.flat, 2, mode);
    const flatHi = await settle(spot.flat, 25, mode);
    const downLo = spot.down ? await settle(spot.down, 2, mode) : null;
    const downHi = spot.down ? await settle(spot.down, 25, mode) : null;
    const df = (a,b) => a && b ? { f:+(a.off.f-b.off.f).toFixed(3), r:+(a.off.r-b.off.r).toFixed(3), y:+(a.off.y-b.off.y).toFixed(3) } : null;
    const gap = (d) => d && Math.max(Math.abs(d.f), Math.abs(d.r), Math.abs(d.y));
    const flat = df(flatHi, flatLo), hill = df(downHi, downLo);
    rows.push({ mode, flatLo: flatLo.off, flatHi: flatHi.off, spd:[flatLo.spd, flatHi.spd], flat, hill, down: spot.down });
    check('mode '+mode+' flat offset', gap(flat) < 0.15, JSON.stringify(flat));
    if (hill) check('mode '+mode+' downhill offset', gap(hill) < 0.15, JSON.stringify(hill));
    if (mode === 3){
      check('helmet vertical flat', flat && Math.abs(flat.y) < 0.05, JSON.stringify(flat));
      if (hill) check('helmet vertical downhill', Math.abs(hill.y) < 0.05, JSON.stringify(hill));
    }
  }
  console.log(JSON.stringify({ fail, spot, rows }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
