// All audio is synthesized in the browser with Web Audio. No music files and no recorded samples.
let ctx = null, master, amb, noiseBuf, roll, rollF, wind, windF, skid, skidF, lift, liftG, leaves, leavesF, creek, creekF;
let vol = 0.8, ambVol = 0.45, crankPrev = 0, coastAt = 0, birdAt = 0, birdGap = 3;
const MIX = 0.4;
function loop(src, filterType, f){ const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl).connect(g).connect(master); s.start(); return [g, fl]; }
export function initSfx(){ if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC();
  master = ctx.createGain(); master.gain.value = vol*MIX; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++){ const w = Math.random()*2 - 1; b = 0.97*b + 0.03*w; d[i] = w*0.5 + b*3; }
  [roll, rollF] = loop(null, 'lowpass', 280); [wind, windF] = loop(null, 'lowpass', 420); windF.Q.value = 0.4; [skid, skidF] = loop(null, 'bandpass', 900); skidF.Q.value = 0.7;
  amb = ctx.createGain(); amb.gain.value = ambVol; amb.connect(master);
  const leafSrc = ctx.createBufferSource(); leafSrc.buffer = noiseBuf; leafSrc.loop = true; leavesF = ctx.createBiquadFilter(); leavesF.type = 'bandpass'; leavesF.frequency.value = 900; leavesF.Q.value = 0.5; leaves = ctx.createGain(); leaves.gain.value = 0; leafSrc.connect(leavesF).connect(leaves).connect(amb); leafSrc.start();
  const creekSrc = ctx.createBufferSource(); creekSrc.buffer = noiseBuf; creekSrc.loop = true; creekF = ctx.createBiquadFilter(); creekF.type = 'lowpass'; creekF.frequency.value = 520; creek = ctx.createGain(); creek.gain.value = 0; creekSrc.connect(creekF).connect(creek).connect(amb); creekSrc.start();
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 70; const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 140; liftG = ctx.createGain(); liftG.gain.value = 0; o.connect(lf).connect(liftG).connect(master); o.start();
  birdAt = ctx.currentTime + 2;
}
export function setSfxVolume(v){ vol = v; if (master) master.gain.setTargetAtTime(v*MIX, ctx.currentTime, 0.05); }
export function setAmbience(v){ ambVol = Math.max(0, Math.min(1, v)); if (amb) amb.gain.setTargetAtTime(ambVol, ctx.currentTime, 0.08); }
export function musicPlaying(){ return false; }
const set = (g, v) => g.gain.setTargetAtTime(v, ctx.currentTime, 0.06);
function burst(dur, f, type, gain, q = 1){ const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
function thump(f0, dur, gain){ const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0*0.4, t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05); }
function softTick(gain){ const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = 'sine'; o.frequency.setValueAtTime(700 + Math.random()*280, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.03); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035); o.connect(g).connect(master); o.start(t); o.stop(t + 0.05); }
function chirp(){ const t = ctx.currentTime, notes = 2 + Math.floor(Math.random()*3), pan = ctx.createStereoPanner(); pan.pan.value = Math.random()*1.4 - 0.7; pan.connect(amb);
  for (let i = 0; i < notes; i++){ const o = ctx.createOscillator(), g = ctx.createGain(), f = 1700 + Math.random()*2100, at = t + i*0.09; o.type = 'sine'; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f*(0.75+Math.random()*0.4), at+0.07); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.045, at+0.015); g.gain.exponentialRampToValueAtTime(0.0001, at+0.09); o.connect(g).connect(pan); o.start(at); o.stop(at+0.1); } }
// per-frame continuous sounds. st: {speed m/s, air, surface, sliding, brake, crank angle rad, lift, riding, coasting}
export function updateSfx(st){ if (!ctx) return; const on = st.riding;
  const sp = on && !st.air && !st.lift ? st.speed : 0;
  const surf = { dirt:[1, 500], rock:[1.4, 1400], grass:[0.7, 300] }[st.surface] || [1, 500];
  set(roll, Math.min(0.16, sp/22)*0.55*surf[0]); rollF.frequency.setTargetAtTime(Math.min(900, surf[1]*0.55 + sp*8), ctx.currentTime, 0.15);
  const ws = on && !st.lift ? st.speed : 0; set(wind, Math.min(0.12, (ws/28)**2*0.16 + (st.air ? 0.04 : 0))); windF.frequency.setTargetAtTime(220 + ws*8, ctx.currentTime, 0.3);
  const sk = on && !st.air && sp > 3 ? (st.sliding ? 0.08 : st.brake > 0.5 ? 0.04*st.brake : 0) : 0; set(skid, sk);
  set(liftG, on && st.lift ? 0.03 : 0);
  const step = Math.PI/4; if (!st.coasting && Math.floor(st.crank/step) !== Math.floor(crankPrev/step) && on && !st.lift) softTick(0.05); crankPrev = st.crank;
  if (on && st.coasting && sp > 1.2){ const now = ctx.currentTime, gap = Math.max(0.11, 1.15 / sp); if (now - coastAt >= gap){ coastAt = now; softTick(0.035); } }
  const trees = st.trees || 0, now = ctx.currentTime;
  set(leaves, ambVol > 0 ? Math.min(0.05, 0.008 + trees*0.004 + ws*0.0008) : 0);
  leavesF.frequency.setTargetAtTime(700 + Math.sin(now*0.3)*120, now, 0.4);
  set(creek, ambVol > 0 && st.water ? 0.015 : 0);
  if (ambVol > 0 && now >= birdAt){ chirp(); birdGap = (trees > 1 ? 1.6 : 4) + Math.random()*(trees > 1 ? 2.5 : 6); birdAt = now + birdGap; }
}
export function sfxLand(impact){ if (!ctx) return; const k = Math.min(1, impact/14); thump(90, 0.18 + k*0.15, 0.25 + k*0.6); burst(0.12 + k*0.15, 700, 'lowpass', 0.2 + k*0.4); if (k > 0.5) burst(0.08, 2500, 'bandpass', 0.15, 3); }
export function sfxCrash(){ if (!ctx) return; thump(70, 0.4, 0.9); burst(0.6, 900, 'lowpass', 0.7); setTimeout(() => { burst(0.3, 1800, 'bandpass', 0.35, 2); thump(110, 0.2, 0.4); }, 160); setTimeout(() => burst(0.15, 4000, 'highpass', 0.25), 300); }
export function sfxLiftStart(){ if (!ctx) return; thump(140, 0.25, 0.4); burst(0.2, 3000, 'bandpass', 0.2, 4); }
