// Right stick left/right leans. Left stick still steers. Hop, wheelie and emotes are unchanged.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const PORT = 8882;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9482',`--user-data-dir=/tmp/gnr-lean-${Date.now()}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (n, ok, d='') => { if (!ok) fail.push(n + (d ? ': ' + d : '')); };
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9482/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),40000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,800)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!window.__readInput`)) break; await sleep(200); }
  const out = await ev(`(() => {
    const S=window.__game, P=window.__world.PARK, g=window.__groundH;
    function pad(o){
      const buttons=Array.from({length:16},()=>({pressed:false,value:0}));
      if (o.lb) buttons[4]={pressed:true,value:1};
      if (o.du) buttons[12]={pressed:true,value:1};
      navigator.getGamepads=()=>[{index:0,connected:true,mapping:'standard',id:'mock',axes:[o.lx||0, o.ly||0, o.rx||0, o.ry||0],buttons,timestamp:1}];
      return window.__readInput();
    }
    const reset=()=>{ window.__stickGate.ready=true; window.__stickGate.downAt=0; pad({}); };
    reset();
    const right=pad({rx:0.85}), left=pad({rx:-0.85}), dead=pad({rx:0.12});
    reset();
    const down=pad({ry:0.9}), downRight=pad({rx:0.8, ry:0.9});
    reset();
    const upAlone=pad({ry:-0.9});
    const downThen=pad({ry:0.9});
    const up=pad({ry:-0.9});
    reset();
    const steer=pad({lx:0.8}), forward=pad({ly:-0.9});
    reset();
    const both=pad({ly:-0.9, ry:-0.9, rx:0.7}), back=pad({ly:0.9, ry:0.9});
    reset();
    const lb=pad({rx:0.9, ry:-0.9, lb:true});
    navigator.getGamepads=()=>[];
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true}));
    const keyE=window.__readInput();
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',bubbles:true}));
    const keyQ=window.__readInput();
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyQ',bubbles:true}));
    const emoIn=pad({rx:0.4, ry:0.1});
    window.__forceEmote='du';
    window.__emoteFrame(0.05, emoIn);
    const emo={bank:+emoIn.bank.toFixed(2), pump:!!emoIn.pumpHold, pop:!!emoIn.pop, wheel:!!window.__emote.wheel};
    window.__forceEmote=null;
    window.__emoteFrame(0.05, emoIn);
    function yawOf(bank){
      window.__place(P.x+40, P.z+30, 0);
      S.state='riding'; S.paused=true; S.speed=12; S.air=false; S.crashT=0; S.lastCrash=null; S.wheelie=false; S.lean=0;
      window.__holdSpeed=12;
      for (let i=0;i<80;i++) window.__sim(1/120,{steer:1, bank, pedal:0, brake:0, lean:0, pumpHold:false, pop:false});
      return S.yaw;
    }
    const into=yawOf(1), against=yawOf(-1), straight=yawOf(0);
    function slipOf(bank){
      window.__place(P.x+40, P.z+30, 0);
      S.paused=true; S.speed=10; S.air=false; S.crashT=0; S.lastCrash=null; S.lean=0; S.slip=0;
      window.__holdSpeed=10;
      let slid=0, peak=0;
      for (let i=0;i<70;i++){ window.__sim(1/120,{steer:1, bank, brake:0.1, pedal:0, lean:0}); if (S.sliding) slid++; peak=Math.max(peak, Math.abs(S.slip||0)); }
      return {slip:+peak.toFixed(3), slid};
    }
    const good=slipOf(1), bad=slipOf(-1);
    window.__holdSpeed=undefined;
    window.__place(P.x+40, P.z+30, 0);
    S.paused=true; S.air=true; S.y=g(S.x,S.z)+1.2; S.vy=-6; S.vx=0; S.vz=-8; S.speed=8; S.pitch=0; S.spin=0; S.lean=0.7; S.crashT=0; S.lastCrash=null; S.trick=null; S.tweak=0; S.nose=0; S.airT=0.5;
    for (let i=0;i<40 && !S.lastCrash;i++) window.__sim(1/120,{bank:1, steer:0, lean:0, pedal:0, brake:0});
    const bailed=S.lastCrash;
    window.__place(P.x+40, P.z+30, 0);
    S.paused=true; S.air=true; S.y=g(S.x,S.z)+0.8; S.vy=-5; S.vx=0; S.vz=-8; S.speed=8; S.pitch=0; S.spin=0; S.lean=0.2; S.crashT=0; S.lastCrash=null; S.trick=null; S.tweak=0; S.nose=0; S.airT=0.4;
    for (let i=0;i<40 && !S.lastCrash;i++) window.__sim(1/120,{bank:0.3, steer:0, lean:0, pedal:0, brake:0});
    const safe=S.lastCrash;
    const num=o=>({bank:+(o.bank||0).toFixed(2), steer:+(o.steer||0).toFixed(2), lean:+(o.lean||0).toFixed(2), pump:!!o.pumpHold, pop:!!o.pop, chord:!!o.wheelieChord, trick:o.trick||null, tweak:+(o.tweak||0).toFixed(2)});
    return {right:num(right), left:num(left), dead:num(dead), down:num(down), downRight:num(downRight), upAlone:num(upAlone), up:num(up), steer:num(steer), forward:num(forward), both:num(both), back:num(back), lb:num(lb), keyE:num(keyE), keyQ:num(keyQ), emo,
      yaw:{into:+into.toFixed(3), against:+against.toFixed(3), straight:+straight.toFixed(3)}, slip:{good, bad}, bailed, safe};
  })()`);
  const help = readFileSync(new URL('../index.html', import.meta.url),'utf8');
  check('help lists Q / E lean', help.includes('Right stick ← →') && help.includes('Q / E'), 'missing');
  check('stick right leans right and does not steer', out.right.bank > 0.4 && out.right.steer === 0 && !out.right.pump && !out.right.pop && !out.right.chord, JSON.stringify(out.right));
  check('stick left leans left', out.left.bank < -0.4 && out.left.steer === 0, JSON.stringify(out.left));
  check('horizontal deadzone', out.dead.bank === 0, JSON.stringify(out.dead));
  check('stick down still pumps and does not lean', out.down.pump && !out.down.pop && out.down.bank === 0 && !out.down.chord, JSON.stringify(out.down));
  check('down and sideways pumps and leans, no hop', out.downRight.pump && out.downRight.bank > 0.3 && !out.downRight.pop && !out.downRight.chord, JSON.stringify(out.downRight));
  check('stick up alone does not hop or wheelie', !out.upAlone.pop && !out.upAlone.chord && out.upAlone.bank === 0, JSON.stringify(out.upAlone));
  check('down then up still hops and does not wheelie', out.up.pop && !out.up.pump && !out.up.chord, JSON.stringify(out.up));
  check('left stick still steers', out.steer.steer > 0.4 && out.steer.bank === 0 && !out.steer.chord, JSON.stringify(out.steer));
  check('left stick forward alone does not wheelie', out.forward.lean < -0.6 && !out.forward.chord && !out.forward.pop, JSON.stringify(out.forward));
  check('both sticks up together is the wheelie, and a sideways right stick does not cancel it', out.both.chord && !out.both.pump && !out.both.pop && out.both.bank > 0.2 && out.both.lean < -0.6, JSON.stringify(out.both));
  check('both sticks down is a pump, not a wheelie', !out.back.chord && out.back.pump && out.back.lean > 0.6, JSON.stringify(out.back));
  check('LB still takes the right stick for a trick', !!out.lb.trick && out.lb.bank === 0 && !out.lb.pump, JSON.stringify(out.lb));
  check('Q and E lean, and do not hop or tweak', out.keyE.bank > 0.5 && out.keyQ.bank < -0.5 && out.keyE.tweak === 0 && !out.keyE.pump, JSON.stringify({keyE:out.keyE, keyQ:out.keyQ}));
  check('emote wheel eats the lean', out.emo.wheel && out.emo.bank === 0 && !out.emo.pump && !out.emo.pop, JSON.stringify(out.emo));
  check('leaning in turns tighter than leaning out', out.yaw.into < out.yaw.against - 0.02, JSON.stringify(out.yaw));
  check('leaning the wrong way slides more', out.slip.bad.slid > out.slip.good.slid, JSON.stringify(out.slip));
  check('landing past about 30 degrees bails', out.bailed === 'Leaned it over!', JSON.stringify(out.bailed));
  check('a small air lean does not bail', !out.safe, JSON.stringify(out.safe));
  console.log(JSON.stringify({fail, out}, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
