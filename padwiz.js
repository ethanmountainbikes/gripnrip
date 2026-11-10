// Controller setup wizard (the screen). The logic and saved format live in pad.js.
// It reads the raw pad itself while open, and it is fully usable with keyboard and mouse in case the pad is confused.
import { createWizard, wizardFeed, wizardSkip, wizardRedo, wizardStep, wizardProfile, readProfile, WIZARD_STEPS, padFamily, tableFor, GLYPHS } from './pad.js';

export function createPadWizard({ getPads, readStd, saveProfile, toast, lsGet, lsSet, onClose }) {
  const W = { open: false, mode: null, id: null, w: null, prof: null, sel: 0, msg: '', prev: {} };
  const el = document.createElement('div'); el.id = 'padWiz'; el.className = 'hidden'; document.body.appendChild(el);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = () => { for (const g of getPads()) if (g && g.connected && g.id === W.id) return g; return null; };
  const asked = () => lsGet('trailDescent.padAsked', {}) || {};
  function markAsked(id){ const a = asked(); a[id] = 1; lsSet('trailDescent.padAsked', a); }
  function show(){ W.open = true; el.classList.remove('hidden'); render(); }
  function close(msg){ W.open = false; W.mode = null; W.w = null; W.prof = null; el.classList.add('hidden'); if (msg) toast(msg); onClose && onClose(); }

  // First time a non-standard pad shows up.
  W.offer = gp => { if (W.open || asked()[gp.id]) return; W.id = gp.id; W.mode = 'offer'; W.sel = 0; W.prev = {}; W.fam = padFamily(gp); W.table = !!tableFor(gp); show(); };
  W.start = gp => { W.id = gp.id; W.fam = padFamily(gp); W.mode = 'run'; W.w = createWizard(gp); W.msg = ''; W.sel = 0; markAsked(gp.id); show(); };
  W.isAsked = id => !!asked()[id];

  function items(){
    if (W.mode === 'offer') return [
      { label: 'Set it up', act: () => { const g = pad(); if (g) W.start(g); else close('Controller unplugged'); } },
      { label: 'Not now', act: () => { markAsked(W.id); close(W.table ? 'OK! You can check it later in Settings → Controls → Set up controller' : 'You can do it later in Settings → Controls → Set up controller'); } } ];
    if (W.mode === 'run') return [
      { label: 'Skip this one', act: () => { wizardSkip(W.w); W.msg = ''; if (W.w.done) toTune(); } },
      { label: 'Redo the last one', act: () => { wizardRedo(W.w); W.msg = ''; } },
      { label: 'Cancel', act: () => close('Setup cancelled. Nothing changed.') } ];
    const p = W.prof, inv = k => p.ax[k] && p.ax[k].inv ? 'FLIPPED' : 'NORMAL';
    const flip = k => () => { p.ax[k] = { ...(p.ax[k] || { a: 0 }), inv: !(p.ax[k] && p.ax[k].inv) }; };
    return [
      { label: 'Dead zone', value: Math.round(p.dz * 100) + '%', sub: 'Bigger if the bike drifts when you let go of the sticks', adj: d => { p.dz = Math.max(0.05, Math.min(0.4, Math.round((p.dz + d * 0.05) * 100) / 100)); } },
      { label: 'Left stick ← →', value: inv('lx'), adj: flip('lx'), act: flip('lx') },
      { label: 'Left stick ↑ ↓', value: inv('ly'), adj: flip('ly'), act: flip('ly') },
      { label: 'Right stick ← →', value: inv('rx'), adj: flip('rx'), act: flip('rx') },
      { label: 'Right stick ↑ ↓', value: inv('ry'), adj: flip('ry'), act: flip('ry') },
      { label: 'Save', act: () => { saveProfile(W.id, p); close('🎮 Controller saved!'); } },
      { label: 'Start over', act: () => { const g = pad(); if (g) W.start(g); } },
      { label: 'Cancel', act: () => close('Setup cancelled. Nothing changed.') } ];
  }
  function toTune(){ W.mode = 'tune'; W.prof = wizardProfile(W.w, pad()); W.sel = 5; W.prev = {}; }

  function render(){
    if (!W.open) return;
    const its = items(); W.sel = Math.max(0, Math.min(its.length - 1, W.sel));
    let head = '', body = '';
    if (W.mode === 'offer'){
      head = '🎮 New controller!';
      body = W.table ? `<p>This looks like a <b>${esc(GLYPHS[W.fam].name)}</b>. Its buttons are already set up by where they sit, so the bottom button works like it does on other pads.</p><p>Want to check every button? It takes about a minute.</p>`
        : `<p>The game does not know this controller yet, so its buttons might be mixed up.</p><p>Let's set it up together. It takes about a minute.</p>`;
    } else if (W.mode === 'run'){
      const st = wizardStep(W.w), n = W.w.i + 1;
      head = `Controller setup · ${n} / ${WIZARD_STEPS.length}`;
      body = `<p class="pwSay">${esc(st.say)}</p><div class="pwBar"><i style="width:${Math.round(W.w.i / WIZARD_STEPS.length * 100)}%"></i></div>` +
        `<p class="pwMsg">${esc(W.msg || (W.w.armed ? 'Waiting for you…' : 'Let go of everything…'))}</p>` +
        `<p class="pwKeys">No button for this? Skip it. Keyboard: <b>S</b> skip · <b>Backspace</b> redo · <b>Esc</b> cancel</p>`;
    } else {
      head = 'Almost done!';
      const g = pad(), r = g ? readProfile(g, W.prof) : null, on = r ? Object.keys(r.btn).filter(k => r.btn[k]) : [];
      if (r && r.lt > 0.5) on.push('LT'); if (r && r.rt > 0.5) on.push('RT');
      const dzv = v => Math.abs(v) < W.prof.dz ? 0 : v;
      body = `<p>Try your controller now. Pressed: <b>${esc(on.length ? on.map(k => k + ' ').join('') : 'nothing')}</b></p>` +
        (r ? `<p>Left stick ${dzv(r.lx).toFixed(2)}, ${dzv(r.ly).toFixed(2)} · Right stick ${dzv(r.rx).toFixed(2)}, ${dzv(r.ry).toFixed(2)} <small>(left and up are minus)</small></p>` : '<p>Controller unplugged</p>') +
        `<p class="pwKeys">Bottom button / Enter picks · d-pad / arrows move · ← → change</p>`;
    }
    el.innerHTML = `<div class="pwBox"><h2>${esc(head)}</h2>${body}<ul>${its.map((it, i) => `<li data-k="${i}" class="${i === W.sel ? 'sel' : ''}"><span>${esc(it.label)}</span>${it.value ? `<b>${esc(it.value)}</b>` : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</li>`).join('')}</ul></div>`;
    el.querySelectorAll('li').forEach(li => { li.onclick = () => { W.sel = +li.dataset.k; activate(); }; });
  }
  function activate(){ const it = items()[W.sel]; if (it && it.act) it.act(); render(); }
  function adjust(d){ const it = items()[W.sel]; if (it && it.adj) it.adj(d); render(); }

  // Keyboard (and the game's mouse-free menu codes). Pad buttons never come here while the wizard runs.
  W.key = code => {
    if (!W.open) return;
    const n = items().length;
    if (code === 'Escape'){ if (W.mode === 'offer') markAsked(W.id); close(W.mode === 'offer' ? '' : 'Setup cancelled. Nothing changed.'); return; }
    if (W.mode === 'run'){ if (code === 'KeyS'){ wizardSkip(W.w); W.msg = ''; if (W.w.done) toTune(); } else if (code === 'Backspace'){ wizardRedo(W.w); W.msg = ''; } else if (code === 'Enter') activate(); render(); return; }
    if (code === 'ArrowUp' || code === 'DU') { W.sel = (W.sel - 1 + n) % n; render(); }
    else if (code === 'ArrowDown' || code === 'DD' || code === 'Tab') { W.sel = (W.sel + 1) % n; render(); }
    else if (code === 'ArrowLeft' || code === 'DL') adjust(-1);
    else if (code === 'ArrowRight' || code === 'DR') adjust(1);
    else if (code === 'Enter' || code === 'Space' || code === 'A') activate();
    else if (code === 'B' && W.mode === 'tune') close('Setup cancelled. Nothing changed.');
  };

  // Every frame while open.
  W.tick = () => {
    if (!W.open) return;
    const g = pad();
    if (W.mode === 'run' && g){
      const r = wizardFeed(W.w, g);
      if (r === 'got') W.msg = '✓ Got it!';
      else if (r === 'dup') W.msg = `That one is already ${W.w.last.dup === 'stick' ? 'used by another stick direction' : 'used for an earlier step'}. Try a different one, or skip.`;
      else if (r === 'done'){ toTune(); W.msg = ''; }
      render(); return;
    }
    if ((W.mode === 'tune' || W.mode === 'offer') && g){   // tune: the new map already works, so drive this screen with it. offer: the pad's best guess
      const r = W.mode === 'tune' ? readProfile(g, W.prof) : readStd(g), old = W.prev;
      W.prev = { ...r.btn, ly: r.ly, lx: r.lx, seen: true };
      if (!old.seen) return;   // whatever was held when the screen opened is not an answer
      const edge = k => r.btn[k] && !old[k];
      if (edge('A')) activate(); else if (edge('B')) W.key(W.mode === 'offer' ? 'Escape' : 'B');
      else if (edge('DU') || (r.ly < -0.7 && !(old.ly < -0.7))) W.key('ArrowUp');
      else if (edge('DD') || (r.ly > 0.7 && !(old.ly > 0.7))) W.key('ArrowDown');
      else if (W.mode === 'tune' && (edge('DL') || (r.lx < -0.7 && !(old.lx < -0.7)))) adjust(-1);
      else if (W.mode === 'tune' && (edge('DR') || (r.lx > 0.7 && !(old.lx > 0.7)))) adjust(1);
      if (W.open && W.mode === 'tune') render(); return;
    }
  };
  W.state = () => ({ open: W.open, mode: W.mode, id: W.id, step: W.w ? W.w.i : -1, msg: W.msg, prof: W.prof });
  return W;
}
