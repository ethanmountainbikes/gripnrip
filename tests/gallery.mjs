import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8890, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
try { (await import('node:fs')).mkdirSync(ART, { recursive: true }); } catch {}
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9490',`--user-data-dir=/tmp/gnr-gal-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n=0, wait=new Map();
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9490/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),40000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,500)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!document.getElementById('mpAsk')`)) { await ev(`document.querySelector('#mpAsk #mpGo').click()`); break; } await sleep(150); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]')?.click()`);
  await sleep(600);
  await ev(`(() => { const S=window.__game; S.state='riding'; S.paused=true; const ask=document.getElementById('mpAsk'); if(ask) ask.remove(); document.getElementById('help')?.classList.add('hidden'); document.getElementById('menu')?.classList.add('hidden'); return true; })()`);
  async function shot(name){ await sleep(400); const {data}=await send('Page.captureScreenshot',{format:'png'}); writeFileSync(`${ART}/${name}.png`, Buffer.from(data,'base64')); }
  const place = async (x,z,yaw,cam) => ev(`(() => { const S=window.__game; window.__place(${x},${z},${yaw}); S.paused=true; S.speed=0; S.crashT=0; window.__camSide=${cam ? JSON.stringify(cam) : 'null'}; window.__setCam && window.__setCam(0); return true; })()`);
  await place(-220, 580, 0.4, {d:4.5,h:1.15});
  await shot('rider-side');
  await place(-220, 580, 0.5, {d:3.6,h:1.7,b:2.4});
  await shot('rider-three-quarter');
  await place(-220, 580, 0.2, {d:2.6,h:0.85,b:0.4});
  await shot('bike-side');
  await ev(`(() => { window.__camSide=null; window.__setCam(3); window.__forceInp={steer:1}; const S=window.__game; S.paused=false; S.speed=2; return true; })()`);
  await sleep(700);
  await shot('fp-steering');
  await ev(`window.__forceInp=null`);
  const forest = await ev(`(() => { const t=window.__world.trails.find(t=>t.name==='Forest Singletrack'); const p=t.pts[40]; return {x:p[0], z:p[1], yaw:t.yaw[40]}; })()`);
  await place(forest.x, forest.z, forest.yaw, {d:14,h:6,b:8});
  await shot('forest-corridor');
  const hip = await ev(`(() => { const f=window.__world.features.find(f=>f.hip && f.kind==='kicker'); return {x:f.x-f.dx*2, z:f.z-f.dz*2, yaw:f.yaw, sx:f.x, sz:f.z}; })()`);
  await place(hip.x, hip.z, hip.yaw, null);
  await ev(`window.__camSide=${JSON.stringify({d:12,h:5,b:7})}`);
  await shot('hip-jump');
  const table = await ev(`(() => { const f=window.__world.features.find(f=>f.kind==='table' && f.L>12); return f?{x:f.x-f.dx*1, z:f.z-f.dz*1, yaw:f.yaw}:{x:-220,z:580,yaw:0}; })()`);
  await place(table.x, table.z, table.yaw, {d:16,h:7,b:6});
  await shot('table-top');
  const road = await ev(`(() => { const c=window.__world.connectors.find(c=>c.explore && c.half>2); const p=c.pts[Math.floor(c.pts.length/2)]; return {x:p[0], z:p[1]}; })()`);
  await place(road.x, road.z, 0.6, {d:10,h:4,b:6});
  await shot('fire-road');
  const stats = await ev(`window.__riderStats`);
  console.log(JSON.stringify({stats, forest, hip, table, road}));
  ws.close();
} finally { chrome.kill(); server.kill(); }
