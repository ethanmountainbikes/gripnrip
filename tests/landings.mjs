// Ride every named trail at a slow, typical and fast speed. A real jump must touch down on a downslope or a deck.
import { spawn } from 'node:child_process';
const PORT = 8876;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9476',`--user-data-dir=/tmp/gnr-land-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9476/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),180000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,800)); return r.result.value; };
  for (let i = 0; i < 150; i++){ if (await ev(`!!window.__sim && !!window.__world`)) break; await sleep(200); }
  const out = await ev(`(() => {
    const S=window.__game, W=window.__world, g=window.__groundH;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const speeds={green:[7,9,11], blue:[9,12,15], black:[11,14,16], dblack:[12,15,17], pro3:[12,15,17]};
    const rows=[];
    for (const tr of W.trails){
      const row={name:tr.name, jumps:0, bad:0, crash:null, samples:[]};
      for (const spd of (speeds[tr.diff]||[10,13,16])){
        const i0=8, p=tr.pts[i0];
        window.__place(p[0], p[1], tr.yaw[i0]);
        S.state='riding'; S.paused=true; S.crashT=0; S.lastCrash=null; S.lives=3;
        window.__holdSpeed=spd; S.speed=spd;
        let idx=i0, airing=false, t0=0;
        const dur=tr.len/Math.max(6,spd)+4;
        window.__sim(dur, () => {
          if (S.lastCrash && !row._hit){ let nt=99; const ci=Math.floor(S.x/100), cj=Math.floor(S.z/100); for (let a=ci-1;a<=ci+1;a++) for (let b=cj-1;b<=cj+1;b++) for (const t of W.treesInCell(a,b)) nt=Math.min(nt, Math.hypot(t.x-S.x,t.z-S.z)); row._hit=true; row.crash=S.lastCrash+' @'+spd+' pos '+S.x.toFixed(0)+','+S.z.toFixed(0)+' tree '+nt.toFixed(1)+' trail '+W.trailDist(S.x,S.z).toFixed(1); }
          if (S.lastCrash || S.crashT>0) return {steer:0};
          const fx=-Math.sin(S.yaw), fz=-Math.cos(S.yaw);
          let bi=idx, bd=1e9;
          for (let i=Math.max(0,idx-2); i<Math.min(tr.pts.length, idx+40); i++){
            const dx=tr.pts[i][0]-S.x, dz=tr.pts[i][1]-S.z, along=dx*fx+dz*fz, d=dx*dx+dz*dz;
            if (along>-1 && along<16 && d<bd){ bd=d; bi=i; }
          }
          idx=Math.max(idx, bi);
          const look=tr.pts[Math.min(tr.pts.length-1, bi+5)];
          const want=Math.atan2(-(look[0]-S.x), -(look[1]-S.z));
          const steer=S.air?0:Math.max(-1,Math.min(1, -wrap(want-S.yaw)*2.2));
          if (!airing && S.air && S.airT>0.02){ airing=true; t0=W.featH(S.x,S.z); }
          if (airing && !S.air){
            airing=false;
            if (t0>0.8 && (S.airT||0)>0.45){
              const ahead=g(S.x-Math.sin(S.yaw)*2, S.z-Math.cos(S.yaw)*2);
              const slope=(ahead-g(S.x,S.z))/2;
              const fh=W.featH(S.x,S.z);
              const down=slope<-0.28, deck=fh>0.2;
              row.jumps++;
              if (!(down||deck)){ row.bad++; if (row.samples.length<3) row.samples.push({spd, slope:+slope.toFixed(2), fh:+fh.toFixed(2), air:+(S.airT||0).toFixed(2), lip:+t0.toFixed(2)}); }
            }
          }
          return {steer, pedal:0, brake:0};
        });
        if (S.lastCrash) break;
      }
      rows.push(row);
    }
    window.__holdSpeed=undefined;
    return rows;
  })()`);
  const bad = out.filter(r => r.bad);
  console.log(JSON.stringify({ bad: bad.length, out }, null, 2));
  if (bad.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
