// Grip 'N Rip sound effects: 100% synthesized with Web Audio (no sample files), mixed under the music.
let ctx = null, master, noiseBuf, roll, rollF, wind, windF, skid, skidF, lift, liftG, vol = 0.8, crankPrev = 0;
const MIX = 0.55;   // overall SFX trim so effects sit under the music
function loop(src, filterType, f){ const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl).connect(g).connect(master); s.start(); return [g, fl]; }
export function initSfx(){ if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC();
  master = ctx.createGain(); master.gain.value = vol*MIX; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++){ const w = Math.random()*2 - 1; b = 0.97*b + 0.03*w; d[i] = w*0.5 + b*3; }
  [roll, rollF] = loop(null, 'lowpass', 400); [wind, windF] = loop(null, 'bandpass', 600); windF.Q.value = 0.6; [skid, skidF] = loop(null, 'bandpass', 2200); skidF.Q.value = 1.5;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 220; liftG = ctx.createGain(); liftG.gain.value = 0; o.connect(lf).connect(liftG).connect(master); o.start();
}
export function setSfxVolume(v){ vol = v; if (master) master.gain.setTargetAtTime(v*MIX, ctx.currentTime, 0.05); }
const set = (g, v) => g.gain.setTargetAtTime(v, ctx.currentTime, 0.06);
function burst(dur, f, type, gain, q = 1){ const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
function thump(f0, dur, gain){ const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0*0.4, t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05); }
function click(){ burst(0.025, 3500 + Math.random()*800, 'highpass', 0.12); }
// per-frame continuous sounds. st: {speed m/s, air, surface:'dirt'|'rock'|'grass', sliding, brake 0..1, crank angle rad, lift bool, riding bool}
export function updateSfx(st){ if (!ctx) return; const on = st.riding;
  const sp = on && !st.air && !st.lift ? st.speed : 0;
  const surf = { dirt:[1, 500], rock:[1.4, 1400], grass:[0.7, 300] }[st.surface] || [1, 500];
  set(roll, Math.min(0.5, sp/18)*0.5*surf[0]); rollF.frequency.setTargetAtTime(surf[1] + sp*25, ctx.currentTime, 0.1);
  if (st.surface === 'rock' && sp > 2 && Math.random() < sp*0.02) burst(0.05, 900, 'bandpass', 0.15*Math.min(1, sp/8), 2);
  const ws = on && !st.lift ? st.speed : 0; set(wind, Math.min(0.45, (ws/25)**2*0.35 + (st.air ? 0.12 : 0))); windF.frequency.setTargetAtTime(400 + ws*30 + (st.air ? 300 : 0), ctx.currentTime, 0.2);
  const sk = on && !st.air && sp > 3 ? (st.sliding ? 0.35 : st.brake > 0.4 ? 0.18*st.brake : 0) : 0; set(skid, sk);
  set(liftG, on && st.lift ? 0.08 : 0);
  // chain/freehub clicks: one per 1/8 crank turn while the crank moves (cadence)
  const step = Math.PI/4; if (Math.floor(st.crank/step) !== Math.floor(crankPrev/step) && on && !st.lift) click(); crankPrev = st.crank;
}
export function sfxLand(impact){ if (!ctx) return; const k = Math.min(1, impact/14); thump(90, 0.18 + k*0.15, 0.25 + k*0.6); burst(0.12 + k*0.15, 700, 'lowpass', 0.2 + k*0.4); if (k > 0.5) burst(0.08, 2500, 'bandpass', 0.15, 3); }
export function sfxCrash(){ if (!ctx) return; thump(70, 0.4, 0.9); burst(0.6, 900, 'lowpass', 0.7); setTimeout(() => { burst(0.3, 1800, 'bandpass', 0.35, 2); thump(110, 0.2, 0.4); }, 160); setTimeout(() => burst(0.15, 4000, 'highpass', 0.25), 300); }
export function sfxLiftStart(){ if (!ctx) return; thump(140, 0.25, 0.4); burst(0.2, 3000, 'bandpass', 0.2, 4); }
