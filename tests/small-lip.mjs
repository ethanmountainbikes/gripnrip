// Small lips stay low at speed. Big jumps still launch with speed.
import { spawn } from 'node:child_process';
const PORT = 8878;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9478',`--user-data-dir=/tmp/gnr-small-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9478/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),50000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,800)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!window.__game`)) break; await sleep(200); }
  const out = await ev(`(() => {
    const S=window.__game, W=window.__world, g=window.__groundH;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    function lipOf(f){
      let peak=0, peakT=0;
      for (let t=0.05;t<=f.L;t+=f.L/40){ const h=f.p(t,0);
        if (h+0.02>=peak){ if (h>peak){ peak=h; peakT=t; } }
        else if (peak>0.12 && t>peakT+0.5) break; }
      return {h:peak, t:peakT};
    }
    function ride(f, speed){
      const yaw=Math.atan2(-f.dx,-f.dz);
      window.__place(f.x-f.dx*4, f.z-f.dz*4, yaw);
      S.state='riding'; S.paused=true; S.air=false; S.crashT=0; S.lastCrash=null; S.vy=0; S.preload=0; S.wheelie=false; S.fakie=false;
      window.__holdSpeed=speed; S.speed=speed;
      const lipT=lipOf(f).t;
      const step=1/120; let took=null, apex=-1e9, crest=null, land=null, airT=0, maxAbove=0;
      for (let t=0;t<5 && !S.lastCrash; t+=step){
        const was=S.air;
        const steer=Math.max(-1,Math.min(1,-wrap(yaw-S.yaw)*2.2));
        window.__sim(step,{steer,pedal:0,brake:0,lean:0,pumpHold:false,pop:false});
        const along=(S.x-f.x)*f.dx+(S.z-f.z)*f.dz;
        if (along>-1 && along<f.L+2){ const gh=g(S.x,S.z); crest = crest===null ? gh : Math.max(crest, gh); }
        if (crest!==null) maxAbove=Math.max(maxAbove, S.y-crest);
        if (!was && S.air && !took) took={vy:+S.vy.toFixed(2), y:+S.y.toFixed(2), spd:+S.speed.toFixed(1)};
        if (S.air){ airT+=step; apex=Math.max(apex, S.y); }
        if (was && !S.air && took && !land){
          const ah=g(S.x-Math.sin(S.yaw)*2, S.z-Math.cos(S.yaw)*2);
          land={slope:+((ah-g(S.x,S.z))/2).toFixed(3), fh:+W.featH(S.x,S.z).toFixed(2), along:+along.toFixed(1)};
        }
        if (!S.air && !land && along>lipT+0.4 && along<f.L+4){
          const ah=g(S.x-Math.sin(S.yaw)*2, S.z-Math.cos(S.yaw)*2);
          const slope=(ah-g(S.x,S.z))/2;
          if (slope<-0.05) land={slope:+slope.toFixed(3), fh:+W.featH(S.x,S.z).toFixed(2), along:+along.toFixed(1), skim:true};
        }
        if (along > f.L + 6 && !S.air && (land || t>0.4)) break;
      }
      const rise=took ? +Math.max(0, apex-took.y).toFixed(2) : +Math.max(0, maxAbove).toFixed(2);
      return {took, rise, air:+airT.toFixed(2), above:+Math.max(0,maxAbove).toFixed(2), land, crash:S.lastCrash};
    }
    const feats=W.features;
    let roller=null, rScore=1e9, kBest=null, kh=99;
    for (const f of feats){
      if (f.park || f.rollin) continue;
      const h=lipOf(f).h;
      if (f.kind==='roller' && h>0.25 && h<0.55 && f.L>7 && h+Math.abs((W.terrainH(f.x,f.z)-W.terrainH(f.x+f.dx*16,f.z+f.dz*16))/16)<rScore){ rScore=h; roller=f; }
      if (f.kind==='kicker' && h>0.35 && h<0.7 && h<kh){ kh=h; kBest=f; }
    }
    const dbl=feats.find(f=>f.kind==='double' && f.park==='Intermediate Doubles');
    const table=feats.find(f=>f.kind==='table' && f.park==='Pro Big Doubles');
    const pack=(f,speeds)=> f ? speeds.map(s=>({s, ...ride(f,s), lip:+lipOf(f).h.toFixed(2)})) : null;
    window.__holdSpeed=undefined;
    return { found:{roller:!!roller, kicker:!!kBest, dbl:!!dbl, table:!!table, n:feats.length}, roller:pack(roller,[8,20]), kicker:pack(kBest,[8,20]), dbl:pack(dbl,[8,20]), table:pack(table,[8,20]) };
  })()`);
  if (!out.roller || !out.kicker || !out.dbl || !out.table){ console.log(JSON.stringify(out.found)); process.exit(1); }
  const capOk = (row) => row.above <= row.lip * 1.5 + 0.08 && row.rise <= row.lip * 1.5 + 0.08;
  const landed = (row) => row.land && (row.land.slope < -0.05 || (row.land.fh > 0.05 && row.land.slope < 0.05));
  for (const row of [...out.roller, ...out.kicker]){
    check(row.s+' small stays under 1.5x lip', capOk(row), JSON.stringify(row));
    check(row.s+' small lands on a downslope', landed(row), JSON.stringify(row));
  }
  const r8=out.roller.find(r=>r.s===8), r20=out.roller.find(r=>r.s===20);
  const k8=out.kicker.find(r=>r.s===8), k20=out.kicker.find(r=>r.s===20);
  check('fast roller is not much higher than the slow one', r20.above <= r8.above + 0.35, JSON.stringify({r8,r20}));
  check('fast kicker is not much higher than the slow one', k20.above <= Math.max(k8.above, k20.lip*1.5) + 0.15, JSON.stringify({k8,k20}));
  for (const [name, rows] of [['double', out.dbl], ['table', out.table]]){
    const a=rows.find(r=>r.s===8), b=rows.find(r=>r.s===20);
    check(name+' still sends harder at speed', b.took && a.took && b.took.vy > a.took.vy * 1.45 && b.rise > a.rise + 0.15, JSON.stringify({a,b}));
    check(name+' is not on the small-lip cap', b.took && b.took.vy > Math.sqrt(2*9.81*1.35*b.lip*1.35) * 0.9, JSON.stringify(b));
  }
  console.log(JSON.stringify({fail, out}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
