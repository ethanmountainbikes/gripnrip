// Hotfix checks: two-stick wheelie, bunny hop, jump speed, lo-fi file, coast click gain.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const PORT = 8807;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9403',`--user-data-dir=/tmp/gnr-hot-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9403/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
let n=0, wait=new Map();
const fail = [];
function check(name, ok, detail){ if (!ok) fail.push(name + ': ' + detail); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),120000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2800);
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,900)); return r.result.value; };
  const out = await ev(`(() => {
    const S=window.__game, W=window.__world;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const f=W.features.find(f=>f.kind==='double' && f.park);
    const yaw=Math.atan2(-f.dx,-f.dz);
    const along=()=> (S.x-f.x)*f.dx+(S.z-f.z)*f.dz;
    let lipT=0, peakH=-1;
    for (let t=0;t<=f.L;t+=0.05){ const h=f.p(t,0); if (h>=peakH){ peakH=h; lipT=t; } }
    function ride(secs, speed, input, x0){
      const back = x0==null;
      window.__place(back ? f.x - f.dx*2 : f.x + f.dx*(lipT+2), back ? f.z - f.dz*2 : f.z + f.dz*(lipT+2), back ? yaw : yaw+Math.PI);
      S.state='riding'; S.paused=false; S.speed=speed; S.air=false; S.crashT=0; S.lastCrash=null;
      S.fakie=false; S.wheelie=false; S.vy=0; S.popped=false; S.preload=0; S.hopWin=0; S.lipHop=null;
      const h=1/120; let took=null, maxAirVy=-99, boosts=0, prevPopped=false;
      for (let t=0;t<secs && !S.lastCrash; t+=h){
        const a=along();
        const face=back?yaw:yaw+Math.PI;
        const steer=S.air?0:Math.max(-1,Math.min(1,-wrap(face-S.yaw)*2.2));
        const inp=Object.assign({steer,pedal:0,brake:0,lean:0,pumpHold:false,pop:false,counter:false,tweak:0,rsy:0}, typeof input==='function'?input(t,a,S):input);
        const was=S.air, wasPop=S.popped;
        window.__sim(h, inp);
        if (!was && S.air && !took) took={a:+a.toFixed(2), spd:+S.speed.toFixed(2), vy:+S.vy.toFixed(2)};
        if (S.air && S.airT<0.2) maxAirVy=Math.max(maxAirVy, S.vy);
        if (S.popped && !wasPop) boosts++;
        prevPopped=S.popped;
      }
      return {took, maxAirVy:+(maxAirVy<-90?0:maxAirVy).toFixed(2), boosts, crash:S.lastCrash, endSpd:+S.speed.toFixed(2), air:!!S.air};
    }
    const coast=ride(2.4, 14, {});
    const hop=ride(2.4, 14, (t,a,S)=>({pumpHold:a>lipT-1.6 && a<lipT-0.05 && !S.air, pop:a>=lipT-0.05 && a<lipT+0.25, counter:a>=lipT-0.05 && a<lipT+0.25}));
    const late=ride(2.4, 14, (t,a,S)=>({pumpHold:a>lipT-1.6 && !S.air, pop:!!S.air && S.airT<0.1, counter:!!S.air && S.airT<0.1}));
    const again=ride(2.4, 14, (t,a,S)=>({pumpHold:a>lipT-1.6 && !S.air, pop:!!S.air, counter:!!S.air}));
    const rev=ride(1.2, 10, {}, true);
    window.__place(W.PARK.x, W.PARK.z, 0);
    S.state='riding'; S.speed=8; S.air=false; S.crashT=0; S.lastCrash=null; S.vy=0; S.wheelie=false; S.preload=0;
    window.__sim(0.45,{pedal:0,brake:0,lean:0,steer:0,pumpHold:true});
    const pre=S.preload;
    window.__sim(1/120,{pedal:0,brake:0,lean:0,steer:0,pumpHold:false,pop:true,counter:true});
    const flatVy=S.vy; let peak=S.y, y0=S.y-S.vy/120; 
    for (let i=0;i<50;i++){ window.__sim(1/120,{pedal:0,brake:0,lean:0,steer:0}); peak=Math.max(peak,S.y); }
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.air=false; S.crashT=0; S.lastCrash=null; S.wheelie=false;
    window.__sim(0.4,{pumpHold:true,pedal:0,brake:0,lean:0,steer:0});
    S.lastVyG=-8;
    window.__sim(1/120,{pumpHold:false,pop:true,counter:true,pedal:0,brake:0,lean:0,steer:0});
    const dive={vy:+S.vy.toFixed(2), air:!!S.air};
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.state='riding'; S.air=false; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.wheelieArm=0;
    window.__sim(0.5,{lean:-1,lyRaw:-1,steer:0,pedal:0,brake:0,pumpHold:false});
    const leftOnly={wheelie:!!S.wheelie, pitch:+S.pitch.toFixed(2)};
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.wheelieArm=0;
    let jitter=false;
    for (let i=0;i<50;i++){ window.__sim(1/120,{lean:-1,lyRaw:-1,wheelieChord:i%2===0,pumpHold:false,ry:-1,pedal:0,brake:0,steer:0}); jitter=jitter||S.wheelie; }
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.wheelieArm=0; S.preload=0;
    window.__sim(0.25,{lean:-0.9,lyRaw:-0.9,wheelieChord:true,pumpHold:false,pop:false,pedal:0,brake:0,steer:0});
    const chord={wheelie:!!S.wheelie, pitch:+S.pitch.toFixed(2), pre:+S.preload.toFixed(2), air:!!S.air};
    window.__sim(0.35,{lean:-0.55,lyRaw:-0.55,wheelieChord:false,pumpHold:false,pop:false,pedal:0,brake:0,steer:0});
    const released={wheelie:!!S.wheelie, pitch:+S.pitch.toFixed(2)};
    window.__sim(0.5,{lean:0,wheelieChord:false,pedal:0,brake:0,steer:0});
    const lowered={wheelie:!!S.wheelie, pitch:+S.pitch.toFixed(2)};
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.wheelieArm=0;
    window.__sim(0.25,{lean:0.9,kbWheelie:true,pedal:0,brake:0,steer:0});
    window.__sim(0.4,{lean:0.9,kbWheelie:true,brake:1,pedal:0,steer:0});
    const braked={wheelie:!!S.wheelie, pitch:+S.pitch.toFixed(2), crash:S.lastCrash};
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.air=true; S.y=window.__groundH(W.PARK.x,W.PARK.z)+3; S.vy=2; S.vx=0; S.vz=-8; S.pitch=0; S.nose=0; S.crashT=0; S.wheelie=false;
    const p0=S.pitch, n0=S.nose||0;
    window.__sim(0.2,{lean:1,rsy:0.8,tweak:0.4,wheelieChord:true,pumpHold:true,pop:true,steer:0.3,pedal:0,brake:0});
    const air={wheelie:!!S.wheelie, dPitch:+(S.pitch-p0).toFixed(3), dNose:+((S.nose||0)-n0).toFixed(3), air:!!S.air};
    window.__place(W.PARK.x, W.PARK.z, 0); S.speed=8; S.air=false; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.preload=0; S.hopWin=0;
    window.__sim(0.3,{pumpHold:true,lean:0,steer:0,pedal:0,brake:0});
    const charged=S.preload;
    window.__sim(0.2,{wheelieChord:true,lean:-0.9,lyRaw:-0.9,pumpHold:false,pop:false,steer:0,pedal:0,brake:0});
    const during={pre:+S.preload.toFixed(2), hop:+(S.hopWin||0).toFixed(2), wheelie:!!S.wheelie};
    const yBefore=S.y;
    window.__sim(0.2,{wheelieChord:false,lean:0,pumpHold:false,pop:true,counter:true,steer:0,pedal:0,brake:0});
    const afterFlick={air:!!S.air, vy:+S.vy.toFixed(2), dy:+(S.y-yBefore).toFixed(2)};
    function pad(ly, ry, o){
      const buttons=Array.from({length:16},()=>({pressed:false,value:0}));
      if (o&&o.lb) buttons[4]={pressed:true,value:1};
      navigator.getGamepads=()=>[{index:0,connected:true,mapping:'standard',id:'mock',axes:[o&&o.lx||0, ly, o&&o.rx||0, ry],buttons,timestamp:1}];
      return window.__readInput();
    }
    const gate=()=>{ window.__stickGate.ready=true; window.__stickGate.downAt=0; };
    gate(); const both=pad(-1,-1);
    gate(); const left=pad(-1,0);
    gate(); const upAlone=pad(0,-1);
    gate(); const right=pad(0,1); const up=pad(0,-1);
    gate(); const deadStick=pad(0.12,0.12), mid=pad(0.6,0.6);
    gate(); const lb=pad(-1,-1,{lb:true});
    navigator.getGamepads=()=>[];
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyK',bubbles:true}));
    const key=window.__readInput();
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyK',bubbles:true}));
    return {lipT:+lipT.toFixed(2), peakH:+peakH.toFixed(2), coast, hop, late, again, rev, flat:{pre:+pre.toFixed(2), vy:+flatVy.toFixed(2), rise:+(peak-(S.y)).toFixed(2)}, dive, leftOnly, jitterOn:jitter, chord, released, lowered, braked, air, charged:+charged.toFixed(2), during, afterFlick,
      pad:{both:{lean:+both.lean.toFixed(2), ry:+both.ry.toFixed(2), chord:!!both.wheelieChord, pump:!!both.pumpHold, pop:!!both.pop, steer:+both.steer.toFixed(2)},
        left:{lean:+left.lean.toFixed(2), chord:!!left.wheelieChord, pump:!!left.pumpHold},
        right:{lean:+right.lean.toFixed(2), chord:!!right.wheelieChord, pump:!!right.pumpHold, pop:!!right.pop},
        upAlone:{pop:!!upAlone.pop, counter:!!upAlone.counter, chord:!!upAlone.wheelieChord},
        up:{pop:!!up.pop, counter:!!up.counter, pump:!!up.pumpHold, chord:!!up.wheelieChord},
        dead:{lean:+deadStick.lean.toFixed(2), chord:!!deadStick.wheelieChord, pump:!!deadStick.pumpHold},
        mid:{lean:+mid.lean.toFixed(2), ry:+mid.ry.toFixed(2), chord:!!mid.wheelieChord, pump:!!mid.pumpHold},
        lb:{trick:lb.trick, chord:!!lb.wheelieChord, pump:!!lb.pumpHold},
        key:{kb:!!key.kbWheelie, lean:+key.lean.toFixed(2), pump:!!key.pumpHold, pop:!!key.pop}}};
  })()`);
  const sfx = readFileSync('/workspace/sfx.js','utf8');
  check('coast gain 0.20', sfx.includes('click(0.20)'), 'missing');
  check('pedal click stays 0.12', sfx.includes('click(0.12)'), 'missing');
  check('tire gain unchanged', sfx.includes('set(roll, Math.min(0.5, sp/18)*0.5*surf[0])'), 'roll line changed');
  const mp3 = readFileSync('/workspace/music/lofi-switchback.mp3');
  check('lofi file', mp3.length > 40000 && mp3.length < 200000, String(mp3.length));
  const head = await fetch(`http://127.0.0.1:${PORT}/music/lofi-switchback.mp3`);
  const servedBytes = head.ok ? (await head.arrayBuffer()).byteLength : 0;
  check('lofi served', head.ok && servedBytes > 40000, String(head.status) + ' ' + servedBytes);
  check('coast faster than old 6.9', out.coast.took && out.coast.took.spd > 10, JSON.stringify(out.coast.took));
  check('coast still climbs', out.coast.took && out.coast.took.spd < 14, JSON.stringify(out.coast.took));
  check('coast launch up', out.coast.took && out.coast.took.vy > 0, JSON.stringify(out.coast.took));
  check('hop higher than coast', out.hop.maxAirVy > out.coast.maxAirVy + 0.4, JSON.stringify({hop:out.hop.maxAirVy, coast:out.coast.maxAirVy}));
  check('hop not a dive', out.hop.took && out.hop.took.vy > 0, JSON.stringify(out.hop.took));
  check('late hop adds and does not repeat every frame', out.late.maxAirVy > out.coast.maxAirVy + 0.4 && out.late.boosts <= 2, JSON.stringify(out.late));
  check('held pop does not keep boosting', out.again.boosts <= 2, JSON.stringify(out.again));
  check('flat hop up', out.flat.vy > 2, JSON.stringify(out.flat));
  check('negative ground follow does not dive the hop', out.dive.air && out.dive.vy > 1, JSON.stringify(out.dive));
  check('left stick does not wheelie', out.leftOnly.wheelie === false, JSON.stringify(out.leftOnly));
  check('jitter does not wheelie', out.jitterOn === false, '');
  check('chord wheelies without preload', out.chord.wheelie === true && out.chord.pre === 0 && out.chord.air === false, JSON.stringify(out.chord));
  check('release right stick keeps wheelie', out.released.wheelie === true, JSON.stringify(out.released));
  check('neutral left lowers wheelie', out.lowered.wheelie === false, JSON.stringify(out.lowered));
  check('brake cancels', out.braked.wheelie === false && !out.braked.crash, JSON.stringify(out.braked));
  check('air still pitches', Math.abs(out.air.dPitch) > 0.05 && out.air.wheelie === false && out.air.air, JSON.stringify(out.air));
  check('chord then stick-up does not hop', out.during.pre === 0 && out.afterFlick.air === false, JSON.stringify({during:out.during, after:out.afterFlick}));
  check('both sticks up is the chord', out.pad.both.chord && !out.pad.both.pump && !out.pad.both.pop && out.pad.both.lean < -0.9 && Math.abs(out.pad.both.steer) < 0.01, JSON.stringify(out.pad.both));
  check('left stick forward is not a wheelie', !out.pad.left.chord && out.pad.left.lean < -0.9 && !out.pad.left.pump, JSON.stringify(out.pad.left));
  check('right only pumps', !out.pad.right.chord && out.pad.right.pump && Math.abs(out.pad.right.lean) < 0.01, JSON.stringify(out.pad.right));
  check('right up alone is not a hop', !out.pad.upAlone.pop && out.pad.upAlone.counter && !out.pad.upAlone.chord, JSON.stringify(out.pad.upAlone));
  check('down then up hops and does not wheelie', out.pad.up.pop && out.pad.up.counter && !out.pad.up.chord && !out.pad.up.pump, JSON.stringify(out.pad.up));
  check('deadzone', !out.pad.dead.chord && !out.pad.dead.pump && Math.abs(out.pad.dead.lean) < 0.02, JSON.stringify(out.pad.dead));
  check('mid stick pumps but does not chord', out.pad.mid.pump && !out.pad.mid.chord, JSON.stringify(out.pad.mid));
  check('LB trick is not a wheelie chord', out.pad.lb.trick && !out.pad.lb.chord && !out.pad.lb.pump, JSON.stringify(out.pad.lb));
  check('K wheelies without pumping', out.pad.key.kb && out.pad.key.lean > 0.9 && !out.pad.key.pump && !out.pad.key.pop, JSON.stringify(out.pad.key));
  check('reverse did not crash', !out.rev.crash, JSON.stringify(out.rev));
  console.log(JSON.stringify({fail, coast:out.coast, hop:out.hop, late:out.late, againBoosts:out.again.boosts, dive:out.dive, flat:out.flat, chord:out.chord, air:out.air, rev:out.rev, pad:out.pad}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
