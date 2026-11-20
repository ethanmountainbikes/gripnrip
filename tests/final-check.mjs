// Functional checks for the review branch. Does not publish. Prints no save or room codes.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';

const PORT = 8777;
const ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
mkdirSync(ART, { recursive: true });
for (const f of readdirSync(ART)) if (/\.(png|json)$/.test(f)) unlinkSync(`${ART}/${f}`);
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--remote-debugging-port=9344', `--user-data-dir=/tmp/gnr-final-${Date.now()}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jsonList() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:9344/json/list'); if (r.ok) return await r.json(); } catch {}
    await sleep(200);
  }
  throw new Error('chrome debug port did not open');
}
function cdp(ws) {
  let n = 0; const wait = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  return (method, params = {}) => new Promise((res, rej) => {
    const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 120000);
    wait.set(id, m => { clearTimeout(t); if (m.error) rej(new Error(method + ' ' + JSON.stringify(m.error))); else res(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
let ws;
try {
  const page = (await jsonList()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = cdp(ws);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[]; addEventListener('error', e => window.__errs.push(String(e.message))); const oe=console.error; console.error=(...a)=>{ window.__errs.push(a.map(x=>String(x&&x.message||x)).join(' | ')); oe(...a); };` });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails).slice(0, 700));
    return r.result.value;
  };
  const shot = async name => {
    const gone = await ev(`!document.getElementById('mpAsk')`);
    if (!gone) throw new Error('refusing screenshot while the save-code card is open');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${ART}/${name}.png`, Buffer.from(data, 'base64'));
  };
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2000);
  let dismissed = false;
  for (let i = 0; i < 40; i++) {
    const has = await ev(`!!document.getElementById('mpAsk')`);
    if (has) { await ev(`document.querySelector('#mpAsk #mpGo').click()`); dismissed = true; break; }
    await sleep(200);
  }
  await sleep(400);
  const cardGone = await ev(`!document.getElementById('mpAsk')`);
  await shot('clean-menu');

  const ridePrep = await ev(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter',bubbles:true}));
    const S=window.__game; S.state='riding'; S.paused=false; S.lift=null;
    return {state:S.state, paused:S.paused};
  })()`);
  await ev(`window.__setCam(3)`);
  await ev(`window.__place(window.__world.PARK.x, window.__world.PARK.z, 0); const S=window.__game; S.state='riding'; S.paused=false; S.speed=6; S.crashT=0; S.lastCrash=null;`);
  await sleep(600);
  const fp = await ev(`window.__fp`);
  await shot('clean-helmet');

  await ev(`window.__shop.open()`);
  await sleep(400);
  const shop = await ev(`(() => {
    const imgs=[...document.querySelectorAll('#shop .bikeThumb')];
    return {n:imgs.length, prices:[...document.querySelectorAll('#shop .pr')].map(e=>e.textContent), sel:[...document.querySelectorAll('#shop .bike')].findIndex(e=>e.classList.contains('sel')), jpeg:imgs.every(i=>i.src.startsWith('data:image/jpeg')), alts:imgs.map(i=>i.alt)};
  })()`);
  await shot('clean-shop');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowDown',bubbles:true}))`);
  const shopSel = await ev(`[...document.querySelectorAll('#shop .bike')].findIndex(e=>e.classList.contains('sel'))`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  const phone = await ev(`(() => { const r=document.getElementById('shop').getBoundingClientRect(); return {w:Math.round(r.width), left:Math.round(r.left), bottom:Math.round(r.bottom), vh:innerHeight}; })()`);
  await shot('clean-shop-phone');
  await send('Emulation.clearDeviceMetricsOverride');
  await ev(`window.__shop.close(); window.__game.paused=false; window.__game.state='riding'; window.__game.speed=0; window.__game.crashT=0;`);

  const emote = await ev(`(() => {
    const NET=window.__net, S=window.__game, keys=window.__keys;
    const sent=[]; NET.st.status='in'; NET.emote=i=>sent.push(i);
    S.state='riding'; S.paused=false; S.speed=0; S.lift=null; S.crashT=0;
    const spot0=window.__teleport ? null : null;
    const gear0=window.__drv.gear, pend0=window.__drv.pending;
    let forceT=false;
    Object.defineProperty(keys,'KeyT',{configurable:true, get(){return forceT;}, set(v){ if(!forceT) forceT=!!v; }});
    const frames=(n,hold)=>new Promise(res=>{ let i=0; const step=()=>{ keys.KeyT=hold; forceT=hold; i++; if(i>=n) res(window.__emote); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
    return frames(40, true).then(mid=>{
      const wheel=!!window.__emote.wheel, spotBefore=S.x;
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1',bubbles:true}));
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',bubbles:true}));
      const afterDigit={sent:sent.slice(), wheel:!!window.__emote.wheel, gear:window.__drv.gear, pending:window.__drv.pending, x:S.x};
      forceT=false; keys.KeyT=false;
      return {mid, afterDigit, gear0, pend0};
    });
  })()`);

  const pad = await ev(`(() => {
    const NET=window.__net, S=window.__game;
    S.speed=0; S.state='riding'; S.paused=false; S.crashT=0;
    const sent=[]; NET.emote=i=>sent.push(i); NET.st.status='in';
    let du=false;
    const buttons=()=>Array.from({length:16},(_,i)=>({pressed:du&&i===12, value:du&&i===12?1:0}));
    navigator.getGamepads=()=>[{index:0,connected:true,mapping:'standard',id:'mock',axes:[0,0,0,0],buttons:buttons(),timestamp:performance.now()}];
    const gear0=window.__drv.gear, pend0=window.__drv.pending;
    const run=(n,hold)=>new Promise(res=>{ let i=0; const step=()=>{ du=hold; i++; if(i>=n) res({...window.__emote, gear:window.__drv.gear, pending:window.__drv.pending}); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
    return run(8,true).then(short=>{
      du=false;
      return run(6,false).then(released=>({short, released, gear0, pend0, sent:sent.slice()}));
    }).then(tap=>run(50,true).then(held=>({tap, held, sent:sent.slice()})));
  })()`);

  const wheels = await ev(`(() => {
    const S=window.__game, gH=window.__groundH, P=window.__world.PARK;
    window.__place(P.pump.x, P.pump.z, 0); S.speed=6; S.state='riding'; S.air=false; S.crashT=0; S.wheelie=false; S.fakie=false;
    window.__sim(0.5,{pedal:0,brake:0,lean:0,steer:0,pumpHold:false});
    const yaw=S.yaw, fx=-Math.sin(yaw), fz=-Math.cos(yaw);
    const hf=gH(S.x+fx*0.66,S.z+fz*0.66), hr=gH(S.x-fx*0.59,S.z-fz*0.59);
    const expect=Math.asin(Math.max(-0.92,Math.min(0.92,(hf-hr)/1.25)));
    return {pitch:+S.pitch.toFixed(3), expect:+expect.toFixed(3), hf:+hf.toFixed(2), hr:+hr.toFixed(2), wheelie:!!S.wheelie, fakie:!!S.fakie};
  })()`);

  const pump = await ev(`(() => {
    const P=window.__world.PARK, gH=window.__groundH, S=window.__game;
    const d0=P.dir[0], d1=P.dir[1], sx=-d1, sz=d0, cx=P.pump.x, cz=P.pump.z, A=28, B=10;
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const ang=(x,z)=>{ const dx=x-cx, dz=z-cz; return Math.atan2((dx*sx+dz*sz)/B, (dx*d0+dz*d1)/A); };
    const pt=a=>{ const c=Math.cos(a), s=Math.sin(a); const tx=-d0*A*s+sx*B*c, tz=-d1*A*s+sz*B*c;
      return {x:cx+d0*A*c+sx*B*s, z:cz+d1*A*c+sz*B*s, yaw:Math.atan2(-tx,-tz)}; };
    function lap(mode){
      const start=pt(0.5); window.__place(start.x, start.z, start.yaw);
      S.state='riding'; S.paused=false; S.speed=7; S.crashT=0; S.lastCrash=null; S.air=false; S.fakie=false; S.wheelie=false;
      let prev=ang(S.x,S.z), prog=0, steps=0, held=0; const h=1/120;
      for (let t=0;t<16 && prog<Math.PI*2 && !S.lastCrash; t+=h){
        const a=ang(S.x,S.z); const da=wrap(a-prev); if (da>0 && da<0.4) prog+=da; prev=a;
        const des=pt(a+0.2).yaw, err=wrap(des-(S.yaw||0));
        const steer=Math.max(-1,Math.min(1,err*2));
        const fdx=-Math.sin(S.travel||S.yaw), fdz=-Math.cos(S.travel||S.yaw);
        const slope=(gH(S.x+fdx*0.7,S.z+fdz*0.7)-gH(S.x,S.z))/0.7;
        const pumpHold=mode==='held'||(mode==='timed'&&slope<-0.02);
        const counter=mode==='timed'&&slope>0.04;
        if (pumpHold) held++;
        window.__sim(h,{steer,pedal:0,brake:0,lean:0,pumpHold,counter,pop:false,tweak:0,rsy:counter?-0.7:0});
        steps++;
      }
      return {mode, kmh:+(S.speed*3.6).toFixed(2), progDeg:+(prog*180/Math.PI).toFixed(0), lap:prog>=Math.PI*2-0.2, crash:S.lastCrash, radius:+Math.hypot(S.x-cx,S.z-cz).toFixed(1), pumpFrac:+(held/Math.max(1,steps)).toFixed(2)};
    }
    return {passive:lap('passive'), held:lap('held'), timed:lap('timed')};
  })()`);

  const saveShape = await ev(`(() => {
    const keys=['trailDescent.dollahs','trailDescent.owned','trailDescent.bike','trailDescent.mpName','trailDescent.legacyRider'];
    const out={};
    for (const k of keys){ const v=localStorage.getItem(k); out[k]=v==null?null:(k.endsWith('mpName')?JSON.parse(v):String(v).slice(0,40)); }
    out.nameIsPair=Array.isArray(JSON.parse(localStorage.getItem('trailDescent.mpName')||'null'));
    out.noSaveCodeInKeys=!Object.keys(localStorage).some(k=>/email|chat|password/i.test(k));
    return out;
  })()`);

  const levels = {};
  for (const level of ['medium','high','max']) {
    await ev(`const s=JSON.parse(localStorage.getItem('trailDescent.settings')||'{}'); s.gfx='${level}'; localStorage.setItem('trailDescent.settings', JSON.stringify(s)); localStorage.setItem('trailDescent.codeShown','true');`);
    await send('Page.reload', { ignoreCache: true });
    await sleep(level==='medium'?8000:5000);
    levels[level] = await ev(`({gfx:window.__gfxLevel, hasGfx:!!window.__gfx, errs:(window.__errs||[]).slice(0,6), stats:window.__riderStats&&{legacy:window.__riderStats.legacy,triangles:window.__riderStats.triangles}})`);
    if (level==='medium') { const gone = await ev(`!document.getElementById('mpAsk')`); if (gone) await shot('clean-medium-menu'); }
  }

  await ev(`localStorage.setItem('trailDescent.legacyRider','true'); const s=JSON.parse(localStorage.getItem('trailDescent.settings')||'{}'); s.gfx='low'; localStorage.setItem('trailDescent.settings', JSON.stringify(s)); localStorage.setItem('trailDescent.codeShown','true');`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(2500);
  const classic = await ev(`({legacy:window.__riderStats&&window.__riderStats.legacy, triangles:window.__riderStats&&window.__riderStats.triangles, rider:window.__riderStats&&window.__riderStats.riderTriangles, errs:(window.__errs||[]).slice(0,4)})`);

  let net = { tried: false };
  try {
    const health = await ev(`fetch('https://gripnrip-rooms.gripnrip.workers.dev/health').then(r=>r.ok).catch(()=>false)`);
    net.health = health;
    if (health) {
      net.tried = true;
      const joined = await ev(`(() => new Promise(res => {
        const NET=window.__net; let n=0; const t=setTimeout(()=>res({timeout:true, peers:NET.st.peers.size, status:NET.st.status}), 8000);
        NET.on(()=>{ if (NET.st.status==='in' && ++n>2){ clearTimeout(t); res({status:NET.st.status, peers:NET.st.peers.size, locked:NET.st.locked}); } });
        fetch('https://gripnrip-rooms.gripnrip.workers.dev/new').then(r=>r.json()).then(({code})=>{ NET.join(code); setTimeout(()=>{ clearTimeout(t); res({status:NET.st.status, peers:NET.st.peers.size}); }, 4000); });
      }))()`);
      net.room = { status: joined.status, peers: joined.peers, timeout: !!joined.timeout };
      await ev(`window.__net && window.__net.leave && window.__net.leave()`);
    }
  } catch (e) { net.error = String(e).slice(0, 180); }

  const out = { cardDismissed: dismissed, cardGone, ridePrep, fp, shop, shopSel, phone, emote, pad, wheels, pump, saveShape, levels, classic, net, errs: await ev(`window.__errs`) };
  writeFileSync(`${ART}/final-check.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  ws.close();
} finally { try { chrome.kill(); } catch {} try { server.kill(); } catch {} }
