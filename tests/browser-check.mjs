// Headless ride checks against the local static server. Not a publish step.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 8765;
const ART = '/opt/cursor/artifacts';
mkdirSync(ART, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: '/workspace', stdio: 'ignore' });
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
  '--remote-debugging-port=9222', '--user-data-dir=/tmp/gnr-chrome-' + Date.now(), '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jsonList() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:9222/json/list'); if (r.ok) return await r.json(); } catch {}
    await sleep(200);
  }
  throw new Error('chrome debug port did not open');
}

function cdp(ws) {
  let n = 0; const wait = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  return (method, params = {}) => new Promise((res, rej) => {
    const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 20000);
    wait.set(id, m => { clearTimeout(t); if (m.error) rej(new Error(method + ' ' + JSON.stringify(m.error))); else res(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

let targets;
try {
targets = await jsonList();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const send = cdp(ws);
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[]; addEventListener('error', e => window.__errs.push(String(e.message))); const oe=console.error; console.error=(...a)=>{ window.__errs.push(a.map(x=>String(x&&x.message||x)).join(' ')); oe(...a); };` });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(2500);
const evalJs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
};
const shot = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${ART}/${name}.png`, Buffer.from(data, 'base64'));
};

const boot = await evalJs(`({
  errs: window.__errs,
  stats: window.__riderStats,
  legacy: JSON.parse(localStorage.getItem('trailDescent.legacyRider') || 'false'),
  gfx: (JSON.parse(localStorage.getItem('trailDescent.settings') || '{}').gfx) || 'low',
  ready: !!window.__game
})`);
await shot('01-menu-desktop');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(300);
await shot('02-menu-phone');
await send('Emulation.clearDeviceMetricsOverride');
await sleep(200);

const ride = await evalJs(`(() => {
  const errs = () => window.__errs.slice();
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
  const S = window.__game, gH = window.__groundH, featH = window.__world.featH;
  const yaw = 0, P = window.__world.PARK;
  const slopeAt = (x, z) => (gH(x, z - 2) - gH(x, z + 2)) / 4;
  const flat = { x: P.x, z: P.z, s: +slopeAt(P.x, P.z).toFixed(3), feat: featH(P.x, P.z) };
  let up = null, down = null;
  for (let x = P.x - 400; x <= P.x + 500; x += 20) for (let z = P.z - 400; z <= P.z + 200; z += 20) {
    if (featH(x, z) > 0.05) continue;
    const s = slopeAt(x, z), rec = { x, z, s: +s.toFixed(3) };
    if (s > 0.06 && s < 0.14 && (!up || Math.abs(s - 0.09) < Math.abs(up.s - 0.09))) up = rec;
    if (s < -0.06 && s > -0.14 && (!down || Math.abs(s + 0.09) < Math.abs(down.s + 0.09))) down = rec;
  }
  const coast = (spot, secs) => {
    window.__place(spot.x, spot.z, yaw); S.state = 'riding'; S.paused = false; S.speed = 8; S.air = false; S.fakie = false; S.wheelie = false; S.crashT = 0;
    const r = window.__sim(secs, { steer: 0, lean: 0, pedal: 0, brake: 0, pumpHold: false, pop: false, counter: false, tweak: 0, rsy: 0, trick: null });
    return { kmh: +r.kmh.toFixed(2), air: r.air, crash: S.lastCrash || null, y: +S.y.toFixed(2) };
  };
  const flatCoast = coast(flat, 2);
  const upCoast = coast(up, 2);
  const downCoast = coast(down, 2);
  window.__place(flat.x, flat.z, yaw); S.speed = 8; S.crashT = 0; S.air = false;
  const pumped = window.__sim(2, { pedal: 0, brake: 0, lean: 0, steer: 0, pumpHold: true, pop: false, counter: false, tweak: 0, rsy: 0, trick: null });
  window.__place(flat.x, flat.z, yaw); S.speed = 8; S.state = 'riding'; S.air = true; S.y = gH(flat.x, flat.z) + 0.7; S.vy = -1; S.pitch = 0.05; S.spin = Math.PI; S.yaw = yaw; S.vx = 0; S.vz = -7; S.speed = 7; S.crashT = 0; S.trick = null; S.tweak = 0; S.nose = 0; S.fakie = false; S.airT = 0.4;
  let guard = 0; while (S.air && S.crashT <= 0 && guard++ < 400) window.__sim(1/120, { pedal: 0, brake: 0, lean: 0, steer: 0, pumpHold: false });
  const landed = { fakie: !!S.fakie, kmh: +(S.speed*3.6).toFixed(2), crash: S.lastCrash || null };
  const rolled = S.fakie ? window.__sim(1, { pedal: 0, brake: 0, lean: 0, steer: 0, pumpHold: false }) : null;
  const fakie = { ...landed, still: !!S.fakie, rollKmh: rolled ? +rolled.kmh.toFixed(2) : null };
  window.__place(flat.x, flat.z, yaw); S.speed = 8; S.crashT = 0; S.lastCrash = null;
  const held = window.__sim(1.2, { pedal: 0, brake: 0, lean: 0.55, steer: 0, pumpHold: false, kbWheelie: true });
  const wheelie = { on: !!S.wheelie, crash: S.lastCrash || null, pitch: +S.pitch.toFixed(2) };
  window.__place(flat.x, flat.z, yaw); S.speed = 8; S.crashT = 0; S.lastCrash = null; S.wheelie = false;
  window.__sim(2.4, { pedal: 0, brake: 0, lean: 1, steer: 0, pumpHold: false, kbWheelie: true });
  const loop = { crash: S.lastCrash || null, wheelie: !!S.wheelie };
  window.__place(flat.x, flat.z, yaw); S.speed = 6; S.air = true; S.y = gH(flat.x, flat.z) + 0.4; S.vy = -2; S.pitch = 0.9; S.spin = 0; S.yaw = yaw; S.vx = 0; S.vz = -6; S.crashT = 0; S.lastCrash = null; S.trick = null; S.tweak = 0; S.nose = 0; S.airT = 0.5; S.fakie = false;
  guard = 0; while (S.air && S.crashT <= 0 && guard++ < 200) window.__sim(1/120, { lean: 0.2, pedal: 0, brake: 0, steer: 0 });
  const oneWheel = { crash: S.lastCrash || null, wheelie: !!S.wheelie, air: S.air };
  window.__place(flat.x, flat.z, yaw); S.speed = 6; S.pitch = -1.45; S.air = true; S.popped = true; S.airT = 1; S.y = gH(flat.x, flat.z) + 0.2; S.vy = 1; S.vx = 0; S.vz = -6; S.spin = 0; S.yaw = yaw; S.crashT = 0; S.lastCrash = null; S.trick = null; S.tweak = 0; S.nose = 0;
  window.__sim(1/60, { pedal: 0, brake: 0, lean: 0, steer: 0 });
  const body = { crash: S.lastCrash || null };
  const rg = window.__world.trails.findIndex(t => t.name === 'Rock Garden');
  return { errs: errs(), spots: { flat, up, down }, flatCoast, upCoast, downCoast, pumped: +pumped.kmh.toFixed(2), fakie, wheelie, loop, oneWheel, body, rockSpot: rg, stats: window.__riderStats };
})()`);

await evalJs(`window.__teleport(${ride.rockSpot}); window.__game.state='riding';`);
await sleep(400);
await shot('03-rock-garden');
await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyV'})); document.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyV'})); document.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyV'}));`);
await sleep(250);
await shot('04-helmet-cam');

writeFileSync(`${ART}/browser-check.json`, JSON.stringify({ boot, ride }, null, 2));
console.log(JSON.stringify({ boot, ride }, null, 2));
ws.close();
} finally { chrome.kill(); server.kill(); }
