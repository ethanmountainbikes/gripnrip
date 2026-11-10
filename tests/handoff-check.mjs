// Local validation for the review branch. Does not publish.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 8771;
const ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
mkdirSync(ART, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--remote-debugging-port=9333', '--user-data-dir=/tmp/gnr-handoff-' + Date.now(), '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jsonList() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:9333/json/list'); if (r.ok) return await r.json(); } catch {}
    await sleep(200);
  }
  throw new Error('chrome debug port did not open');
}
function cdp(ws) {
  let n = 0; const wait = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  return (method, params = {}) => new Promise((res, rej) => {
    const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 25000);
    wait.set(id, m => { clearTimeout(t); if (m.error) rej(new Error(method + ' ' + JSON.stringify(m.error))); else res(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const key = (send, code) => send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},bubbles:true}))`, returnByValue: true });

let ws;
try {
  const page = (await jsonList()).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = cdp(ws);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[]; addEventListener('error', e => window.__errs.push(String(e.message))); const oe=console.error; console.error=(...a)=>{ window.__errs.push(a.map(x=>String(x&&x.message||x)).join(' ')); oe(...a); };` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result.value;
  };
  // wait for the game to finish loading (three.js from the CDN + shader compile can take a while on swiftshader)
  for (let i = 0; i < 450; i++){ if (await ev(`!!(window.__game && window.__world && document.querySelector('#menuPanel li'))`).catch(() => false)) break; await sleep(200); }
  await sleep(1500);
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${ART}/${name}.png`, Buffer.from(data, 'base64'));
  };
  await ev(`const b=document.getElementById('mpGo'); if (b) b.click();`);
  await sleep(300);
  await shot('menu-desktop');
  const before = await ev(`JSON.parse(localStorage.getItem('trailDescent.mpName')||'null')`);
  for (let i = 0; i < 6; i++) await key(send, 'ArrowDown');
  await key(send, 'Enter');
  await sleep(200);
  for (let i = 0; i < 9; i++) await key(send, 'ArrowDown');
  await key(send, 'ArrowRight');
  await sleep(200);
  const settings = await ev(`({
    title: document.querySelector('#menuPanel h2') && document.querySelector('#menuPanel h2').textContent,
    hasInput: !!document.querySelector('#menuPanel input, #menuPanel textarea'),
    row: (document.querySelector('#menuPanel li.sel')||{}).innerText || '',
    name: JSON.parse(localStorage.getItem('trailDescent.mpName')||'null'),
    legacy: JSON.parse(localStorage.getItem('trailDescent.legacyRider')||'false')
  })`);
  await shot('settings-name');
  await key(send, 'Escape');
  for (let i = 0; i < 6; i++) await key(send, 'ArrowUp');
  await key(send, 'Enter');
  await sleep(500);
  const ride = await ev(`(() => {
    const S = window.__game, gH = window.__groundH, P = window.__world.PARK;
    window.__place(P.x, P.z, 0); S.state='riding'; S.paused=false; S.speed=8; S.air=false; S.crashT=0; S.fakie=false; S.wheelie=false;
    const flat = window.__sim(2, {pedal:0,brake:0,lean:0,steer:0,pumpHold:false});
    window.__place(P.x, P.z, 0); S.speed=8; S.crashT=0;
    const pumped = window.__sim(2, {pedal:0,brake:0,lean:0,steer:0,pumpHold:true});
    window.__place(P.x, P.z, 0); S.speed=7; S.air=true; S.y=gH(P.x,P.z)+0.7; S.vy=-1; S.pitch=0.05; S.spin=Math.PI; S.yaw=0; S.vx=0; S.vz=-7; S.crashT=0; S.trick=null; S.tweak=0; S.nose=0; S.fakie=false; S.airT=0.4; S.lastCrash=null;
    let g=0; while (S.air && S.crashT<=0 && g++<400) window.__sim(1/120,{pedal:0,brake:0,lean:0,steer:0,pumpHold:false});
    const fakie = {fakie:!!S.fakie, kmh:+(S.speed*3.6).toFixed(2), crash:S.lastCrash||null};
    const roll = S.fakie ? window.__sim(1,{pedal:0,brake:0,lean:0,steer:0,pumpHold:false}) : null;
    window.__place(P.x, P.z, 0); S.speed=8; S.crashT=0; S.lastCrash=null; S.wheelie=false;
    window.__sim(1.2,{pedal:0,brake:0,lean:0.55,steer:0,pumpHold:false,kbWheelie:true});
    const wheelie = {on:!!S.wheelie, pitch:+S.pitch.toFixed(2), crash:S.lastCrash||null};
    window.__place(P.x, P.z, 0); S.speed=8; S.crashT=0; S.lastCrash=null;
    window.__sim(2.4,{pedal:0,brake:0,lean:1,steer:0,pumpHold:false,kbWheelie:true});
    const loop = S.lastCrash||null;
    window.__place(P.x, P.z, 0); S.speed=6; S.air=true; S.y=gH(P.x,P.z)+0.4; S.vy=-2; S.pitch=0.9; S.spin=0; S.yaw=0; S.vx=0; S.vz=-6; S.crashT=0; S.lastCrash=null; S.trick=null; S.tweak=0; S.nose=0; S.airT=0.5; S.fakie=false;
    g=0; while (S.air && S.crashT<=0 && g++<200) window.__sim(1/120,{lean:0.2,pedal:0,brake:0,steer:0});
    const one = {crash:S.lastCrash||null, wheelie:!!S.wheelie};
    window.__place(P.x, P.z, 0); S.speed=6; S.pitch=-1.45; S.air=true; S.popped=true; S.airT=1; S.y=gH(P.x,P.z)+0.2; S.vy=1; S.vx=0; S.vz=-6; S.spin=0; S.yaw=0; S.crashT=0; S.lastCrash=null; S.trick=null; S.tweak=0; S.nose=0;
    window.__sim(1/60,{pedal:0,brake:0,lean:0,steer:0});
    return {errs:window.__errs, stats:window.__riderStats, flat:+flat.kmh.toFixed(2), pumped:+pumped.kmh.toFixed(2), fakie:{...fakie, still:!!S.fakie, roll:roll?+roll.kmh.toFixed(2):null}, wheelie, loop, one, body:S.lastCrash||null};
  })()`);
  await ev(`window.__game.state='riding'; window.__game.paused=false; window.__game.crashT=0; window.__game.lift=null;`);
  await ev(`window.__setCam(3)`);
  await sleep(120);
  await ev(`window.__place(window.__world.PARK.x, window.__world.PARK.z, 0); window.__game.speed=6; window.__game.state='riding'; window.__game.paused=false;`);
  await sleep(800);
  const fp = await ev(`({fp:window.__fp, toast:document.getElementById('toast').textContent})`);
  await shot('helmet-cam');
  await ev(`window.__game.state='riding'; window.__game.paused=false;`);
  await key(send, 'KeyO');
  await sleep(900);
  const shop = await ev(`(() => {
    const imgs=[...document.querySelectorAll('#shop .bikeThumb')];
    const prices=[...document.querySelectorAll('#shop .pr')].map(e=>e.textContent);
    const sel=[...document.querySelectorAll('#shop .bike')].findIndex(e=>e.classList.contains('sel'));
    const src=imgs[0]&&imgs[0].src||'';
    return {open:!document.getElementById('shop').classList.contains('hidden'), n:imgs.length, sel, prices, srcLen:src.length, jpeg:src.startsWith('data:image/jpeg'), alts:imgs.map(i=>i.alt)};
  })()`);
  await shot('shop-desktop');
  await key(send, 'ArrowDown');
  await sleep(250);
  const shop2 = await ev(`([...document.querySelectorAll('#shop .bike')].findIndex(e=>e.classList.contains('sel')))`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const phone = await ev(`(() => { const s=getComputedStyle(document.getElementById('shop')); const r=document.getElementById('shop').getBoundingClientRect(); return {width:s.width, bottom:Math.round(r.bottom), vh:innerHeight, left:Math.round(r.left)}; })()`);
  await shot('shop-phone');
  await send('Emulation.clearDeviceMetricsOverride');
  await ev(`window.__shop && window.__shop.close(); window.__game.paused=false; window.__game.state='riding'; window.__game.speed=0;`);
  await sleep(200);
  const emote = await ev(`(() => {
    const NET=window.__net; if (!NET) return {skipped:'no net object'};
    window.__sent=[]; NET.st.status='in'; const real=NET.emote; NET.emote=i=>window.__sent.push(i);
    const S=window.__game; S.state='riding'; S.paused=false; S.speed=0; S.lift=null;
    return {stub:true};
  })()`);
  for (let i = 0; i < 20; i++) { await key(send, 'KeyT'); await sleep(200); }
  const wheel = await ev(`({shown:!document.getElementById('emoteWheel').hidden, text:document.getElementById('emoteWheel').textContent})`);
  await key(send, 'Digit2');
  await sleep(150);
  const sent = await ev(`({sent:window.__sent||null, shopHidden:document.getElementById('shop').classList.contains('hidden'), menuHidden:document.getElementById('menu').classList.contains('hidden'), paused:window.__game.paused, speed:window.__game.speed})`);
  const gearBefore = await ev(`({gear:window.__drv.gear, pending:window.__drv.pending, emote:window.__emote})`);
  await key(send, 'KeyG');
  await sleep(2500);
  const gearAfter = await ev(`({gear:window.__drv.gear, pending:window.__drv.pending, emote:window.__emote})`);
  const out = { settings, before, ride, fp, shop, shopAfterDown: shop2, phone, emote, wheel, sent, gearBefore, gearAfter, errs: await ev(`window.__errs`) };
  writeFileSync(`${ART}/handoff-check.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  ws.close();
} finally { try { chrome.kill(); } catch {} try { server.kill(); } catch {} }
