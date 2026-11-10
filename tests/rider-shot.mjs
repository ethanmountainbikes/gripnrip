import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PORT = 8813, ART = process.env.ARTIFACTS || '/opt/cursor/artifacts';
try { (await import('node:fs')).mkdirSync(ART, { recursive: true }); } catch {}
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--remote-debugging-port=9417',`--user-data-dir=/tmp/gnr-shot-${Date.now()}`,'--window-size=1280,800','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function list(){ for (let i=0;i<40;i++){ try { const r=await fetch('http://127.0.0.1:9417/json/list'); if (r.ok) return await r.json(); } catch {} await sleep(200);} throw new Error('no chrome'); }
let n=0, wait=new Map();
try {
  const page=(await list()).find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.addEventListener('open',res); ws.addEventListener('error',rej); });
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if (m.id&&wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id);} });
  const send=(method,params={})=>new Promise((res,rej)=>{ const id=++n; const t=setTimeout(()=>rej(new Error('timeout '+method)),60000); wait.set(id,m=>{ clearTimeout(t); m.error?rej(new Error(JSON.stringify(m.error))):res(m.result); }); ws.send(JSON.stringify({id,method,params})); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev=async expr=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description||'eval').slice(0,700)); return r.result.value; };
  for (let i=0;i<40;i++){ if (await ev(`!!document.getElementById('mpAsk')`)) { await ev(`document.querySelector('#mpAsk #mpGo').click()`); break; } await sleep(200); }
  await ev(`document.querySelector('#menuPanel li[data-k="0"]').click()`);
  await sleep(800);
  await ev(`(() => { const S=window.__game, P=window.__world.PARK; window.__place(P.x+8, P.z+6, 0.8); S.state='riding'; S.paused=false; S.speed=0; S.crashT=0; const ask=document.getElementById('mpAsk'); if(ask) ask.remove(); document.getElementById('help')?.classList.add('hidden'); return true; })()`);
  await sleep(500);
  const card = await ev(`!!document.getElementById('mpAsk') || !document.getElementById('menu').classList.contains('hidden')`);
  if (card) throw new Error('menu or save card still up');
  async function shot(name){ const {data}=await send('Page.captureScreenshot',{format:'png'}); writeFileSync(`${ART}/${name}.png`, Buffer.from(data,'base64')); }
  await ev(`window.__setCam(0)`);
  await shot('rider-chase');
  await ev(`window.__setCam(3)`);
  await sleep(350);
  await shot('rider-helmet');
  await ev(`window.__setCam(5)`);
  await sleep(350);
  const stats = await ev(`({stats:window.__riderStats, fp:window.__fp, menu:document.getElementById('menu').classList.contains('hidden'), errs:(window.__errs||[])})`);
  await shot('rider-side');
  console.log(JSON.stringify(stats));
  ws.close();
} finally { chrome.kill(); server.kill(); }
