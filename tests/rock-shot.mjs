// Side view of a Rock Garden rock patch. Pass a filename stem.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const name = process.argv[2] || 'rock-garden';
const PORT = 8898, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9498',`--user-data-dir=/tmp/gnr-rock-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9498/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={},ms=40000)=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),ms); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,700)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!window.__world`)) break; await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(600);
  const info = await ev(`(() => {
    const tr=window.__world.trails.find(t=>t.name==='Rock Garden');
    const feats=window.__features.filter(f=>f.trail===tr.id);
    const rock=feats.find(f=>f.garden && f.boulders && f.boulders.length) || feats.find(f=>f.boulders && f.boulders.length) || feats[Math.floor(feats.length/2)];
    const S=window.__game;
    window.__place(rock.x + rock.dx*Math.min(6, rock.L*0.4), rock.z + rock.dz*Math.min(6, rock.L*0.4), rock.yaw||0);
    S.state='riding'; S.paused=true; S.speed=0; S.crashT=0; S.run=null;
    window.__setCam(5);
    window.__camSide = null;
    document.getElementById('mpAsk')?.remove();
    document.getElementById('help')?.classList.add('hidden');
    const drops = feats.filter(f=>f.rockDrop).map(f=>{
      let bi=0,bd=1e9; tr.pts.forEach((p,i)=>{ const d=(p[0]-f.x)**2+(p[1]-f.z)**2; if(d<bd){bd=d;bi=i;} });
      return { s: bi*2, H: f.rockDrop, L:+f.L.toFixed(1) };
    });
    return { kind: rock.kind, n: rock.boulders ? rock.boulders.length : 0, L:+rock.L.toFixed(1), feats: feats.length, drops };
  })()`);
  await ev(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const {data}=await send('Page.captureScreenshot',{format:'png'}, 25000);
  writeFileSync(`${ART}/${name}.png`, Buffer.from(data,'base64'));
  await ev(`(() => { const hud=document.getElementById('hud'); if (hud) hud.style.display='none'; window.__camSide={d:3.4,h:0.55,b:1.1}; })()`);
  await ev(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const close=await send('Page.captureScreenshot',{format:'png'}, 25000);
  writeFileSync(`${ART}/${name}-close.png`, Buffer.from(close.data,'base64'));
  const dropRide = await ev(`(() => {
    const S=window.__game, W=window.__world, g=window.__groundH;
    const tr=W.trails.find(t=>t.name==='Rock Garden');
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const drop=window.__features.filter(f=>f.trail===tr.id && f.rockDrop).sort((a,b)=>b.rockDrop-a.rockDrop)[0];
    let bi=0, bd=1e9; tr.pts.forEach((p,i)=>{ const d=(p[0]-drop.x)**2+(p[1]-drop.z)**2; if(d<bd){bd=d;bi=i;} });
    const start=Math.max(2, bi-8);
    const shape=[]; for (const u of [0, 0.35, 0.55, 0.75, 1]) shape.push(+drop.p(drop.L*u, 0).toFixed(2));
    function pass(target){
      const [x,z]=tr.pts[start];
      window.__place(x,z,tr.yaw[start]);
      S.state='riding'; S.paused=true; S.speed=target;
      S.vx=-Math.sin(tr.yaw[start])*target; S.vz=-Math.cos(tr.yaw[start])*target;
      S.air=false; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.lives=3;
      const h=1/120; let air=0, landed=null, crash=null, minS=0;
      for (let t=0;t<30 && !crash; t+=h){
        let best=1e9, s=0, nearI=start;
        for (let i=0;i<tr.pts.length;i+=2){ const d=(tr.pts[i][0]-S.x)**2+(tr.pts[i][1]-S.z)**2; if(d<best){best=d;s=i*2;nearI=i;} }
        if (s>bi*2+drop.L+10) break;
        const look=tr.pts[Math.min(tr.pts.length-1, nearI+6)];
        const aim=Math.atan2(-(look[0]-S.x), -(look[1]-S.z));
        let steer=Math.max(-1, Math.min(1, -wrap(aim-S.yaw)*1.15));
        let pedal=0, brake=0;
        if (S.air) steer=Math.max(-0.2, Math.min(0.2, -wrap((S.travel??S.yaw)-S.yaw)*2));
        else if (S.speed>target*1.05){ brake=Math.abs(steer)>0.32?0.28:0.9; if (brake>0.3) steer=Math.max(-0.28, Math.min(0.28, steer)); }
        else if (S.speed<target*0.9) pedal=1;
        const was=S.air;
        window.__sim(h,{steer,pedal,brake,lean:0,pumpHold:false,pop:false});
        if (S.air) air+=h;
        const e=0.6, gh=g(S.x,S.z), ahead=g(S.x-Math.sin(S.yaw)*e, S.z-Math.cos(S.yaw)*e);
        const slope=(ahead-gh)/e; if (slope<minS) minS=slope;
        if (was && !S.air && !landed) landed={s:+s.toFixed(1), slope:+slope.toFixed(3), air:+air.toFixed(2)};
        if (S.lastCrash) crash=S.lastCrash+' @'+s.toFixed(0);
      }
      return {target, air:+air.toFixed(2), landed, crash, minSlope:+minS.toFixed(3)};
    }
    return {H:drop.rockDrop, at:bi*2, shape, passes:[4.5,9,14].map(pass)};
  })()`);
  console.log(JSON.stringify({ info, dropRide }, null, 2));
  ws.close();
} finally { chrome.kill(); server.kill(); }
