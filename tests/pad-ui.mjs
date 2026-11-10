// Controllers in the real page with fake Gamepad objects: Xbox and PS5 (standard), a Switch Pro and a wired PowerA pad
// (non-standard, remapped by physical position), and an unknown pad set up through the wizard by keyboard.
// Checks that actions resolve, custom binds sit on top of the remap, and the prompts use the right button names.
import { spawn } from 'node:child_process';
const PORT = 8893, DBG = 9493;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', `--remote-debugging-port=${DBG}`, `--user-data-dir=/tmp/gnr-pad-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = [], passed = [];
const check = (n, ok, d = '') => { (ok ? passed : fail).push(n + (!ok && d ? ': ' + d : '')); };
let n = 0; const wait = new Map(), exceptions = [];
async function list(){ for (let i = 0; i < 60; i++){ try { const r = await fetch(`http://127.0.0.1:${DBG}/json/list`); if (r.ok) return await r.json(); } catch {} await sleep(200); } throw new Error('no chrome'); }
try {
  const page = (await list()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'error').slice(0, 300));
    if (m.id && wait.has(m.id)){ wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error('timeout ' + method)), 60000); wait.set(id, m => { clearTimeout(t); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  // A fake pad that the page reads through navigator.getGamepads. window.__fake(id, mapping, nb, na) then set buttons / axes.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('trailDescent.codeShown','true')}catch(e){}
    window.__fake = (id, mapping, nb, na) => { const gp = { index: 0, connected: true, id, mapping, timestamp: 1,
        buttons: Array.from({ length: nb }, () => ({ pressed: false, value: 0 })), axes: Array.from({ length: na }, () => 0) };
      if (na >= 10) gp.axes[9] = 1.2857;   // POV hat at rest
      gp.press = (i, on = true) => { gp.buttons[i] = { pressed: on, value: on ? 1 : 0 }; return gp; };
      gp.clear = () => { gp.buttons.forEach((_, i) => gp.press(i, false)); gp.axes.forEach((_, i) => gp.axes[i] = i === 9 && na >= 10 ? 1.2857 : (gp.rest && gp.rest[i]) || 0); return gp; };
      window.__pad = gp; navigator.getGamepads = () => [gp]; return gp; };
    navigator.getGamepads = () => [];` });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || 'eval').slice(0, 800)); return r.result.value; };
  for (let i = 0; i < 300; i++){ if (await ev(`!!window.__readInput && !!window.__padWiz && !!document.querySelector('#menuPanel li')`)) break; await sleep(200); }
  // Read twice so a press is an edge (pressed) and not stuck from the last pad.
  await ev(`window.__read = () => { const i = window.__readInput(); return { pressed: Object.keys(i.pressed), pedal: +(i.pedal||0).toFixed(2), brake: +(i.brake||0).toFixed(2), steer: +i.steer.toFixed(2), lean: +i.lean.toFixed(2), rsy: +(i.rsy||0).toFixed(2), bank: +(i.bank||0).toFixed(2), pad: i.pad || {} }; };
    window.__hint = () => document.getElementById('menuHint').textContent;
    window.__helpTh = () => document.querySelector('#help th:nth-child(2)')?.textContent;
    window.__help = () => document.querySelector('#help').textContent;
    window.__shopHint = () => document.getElementById('shopHint').textContent; true`);

  // ---- Xbox 360 (standard) ----
  const xb = await ev(`(() => { const gp = window.__fake('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard', 17, 4); window.__read();
    gp.press(0); const a = window.__read(); gp.clear(); gp.buttons[7] = { pressed: true, value: 1 }; const rt = window.__read(); gp.clear(); window.__read();
    return { a, rt, fam: window.__padFam || 'xbox', wiz: window.__padWiz.open, hint: window.__hint(), th: window.__helpTh(), shop: window.__shopHint() }; })()`);
  check('xbox: bottom button is A', xb.a.pressed.includes('A'), JSON.stringify(xb.a));
  check('xbox: RT pedals', xb.rt.pedal > 0.9, JSON.stringify(xb.rt));
  check('xbox: no setup wizard for a standard pad', !xb.wiz);
  check('xbox: prompts use Xbox letters', xb.hint.includes('A / Enter') && xb.th === 'Xbox controller' && xb.shop.includes('LB/RB'), JSON.stringify(xb));

  // ---- PS5 DualSense (standard) ----
  const ps = await ev(`(() => { const gp = window.__fake('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'standard', 17, 4); window.__read();
    gp.press(0); const a = window.__read(); gp.clear(); window.__read();
    return { a, fam: window.__padFam, wiz: window.__padWiz.open, hint: window.__hint(), th: window.__helpTh(), help: window.__help(), shop: window.__shopHint() }; })()`);
  check('ps5: cross is A', ps.a.pressed.includes('A'), JSON.stringify(ps.a));
  check('ps5: family', ps.fam === 'ps', ps.fam);
  check('ps5: prompts use PlayStation symbols', ps.hint.includes('✕ / Enter') && ps.shop.includes('○ / Esc') && ps.th === 'PlayStation controller' && ps.help.includes('R2') && ps.shop.includes('L1/R1'), JSON.stringify({ hint: ps.hint, th: ps.th, shop: ps.shop }));

  // ---- Nintendo Switch Pro, non-standard (raw 0 B bottom, 1 A right, 2 Y left, 3 X top, 6 ZL, 7 ZR, hat on axis 9) ----
  const sw = await ev(`(() => { const gp = window.__fake('Pro Controller (Vendor: 057e Product: 2009)', '', 16, 10); window.__read();
    const offered = window.__padWiz.state().mode; const blocked = (gp.press(0), window.__read()); gp.clear();
    window.__padWiz.key('Escape');   // "not now": the remap table already handles it
    window.__read();
    const r = {};
    gp.press(0); r.bottom = window.__read(); gp.clear(); window.__read();
    gp.press(1); r.right = window.__read(); gp.clear(); window.__read();
    gp.press(2); r.left = window.__read(); gp.clear(); window.__read();
    gp.press(3); r.top = window.__read(); gp.clear(); window.__read();
    gp.press(7); r.zr = window.__read(); gp.clear(); gp.press(6); r.zl = window.__read(); gp.clear(); window.__read();
    gp.press(9); r.plus = window.__read(); gp.clear(); window.__read();
    gp.axes[9] = -1; r.up = window.__read(); gp.clear(); window.__read();
    gp.axes[9] = 0.7143; r.leftHat = window.__read(); gp.clear(); window.__read();
    gp.axes[0] = -0.9; r.stick = window.__read(); gp.clear(); window.__read();
    gp.axes[3] = 0.9; r.rs = window.__read(); gp.clear(); window.__read();
    return { offered, blocked, r, fam: window.__padFam, open: window.__padWiz.open, asked: JSON.parse(localStorage.getItem('trailDescent.padAsked') || '{}'),
      hint: window.__hint(), th: window.__helpTh(), help: window.__help(), shop: window.__shopHint() }; })()`);
  check('switch: setup offered the first time', sw.offered === 'offer', sw.offered);
  check('switch: nothing reaches the game while the offer is open', !sw.blocked.pressed.length, JSON.stringify(sw.blocked));
  check('switch: offer is remembered per gamepad.id', sw.asked['Pro Controller (Vendor: 057e Product: 2009)'] === 1 && !sw.open);
  check('switch: bottom button (B) acts as A', sw.r.bottom.pressed.join() === 'A', JSON.stringify(sw.r.bottom));
  check('switch: right button (A) acts as B', sw.r.right.pressed.join() === 'B', JSON.stringify(sw.r.right));
  check('switch: left button (Y) acts as X', sw.r.left.pressed.join() === 'X', JSON.stringify(sw.r.left));
  check('switch: top button (X) acts as Y', sw.r.top.pressed.join() === 'Y', JSON.stringify(sw.r.top));
  check('switch: ZR pedals, ZL brakes', sw.r.zr.pedal > 0.9 && sw.r.zl.brake > 0.9, JSON.stringify([sw.r.zr, sw.r.zl]));
  check('switch: + is Start', sw.r.plus.pressed.join() === 'Start', JSON.stringify(sw.r.plus));
  check('switch: hat axis 9 is the d-pad', sw.r.up.pressed.join() === 'DU' && sw.r.leftHat.pressed.join() === 'DL', JSON.stringify([sw.r.up, sw.r.leftHat]));
  check('switch: sticks', sw.r.stick.steer < -0.8 && sw.r.rs.rsy > 0.8, JSON.stringify([sw.r.stick, sw.r.rs]));
  check('switch: family', sw.fam === 'switch', sw.fam);
  check('switch: prompts use Nintendo names in Nintendo spots', sw.hint.includes('B / Enter: select') && sw.shop.includes('B / Enter: buy') && sw.shop.includes('A / Esc: close') && sw.th === 'Switch controller' && sw.help.includes('ZR') && sw.shop.includes('L/R'), JSON.stringify({ hint: sw.hint, th: sw.th, shop: sw.shop }));

  // ---- custom binds sit on top of the remap: pedal on the bottom face button ----
  const cb = await ev(`(() => { const S = window.__settings, old = S.binds.pad.pedal; S.binds.pad.pedal = 'A'; const gp = window.__pad; gp.clear(); window.__read();
    gp.press(0); const bottom = window.__read(); gp.clear(); gp.press(7); const zr = window.__read(); gp.clear(); window.__read(); S.binds.pad.pedal = old; return { bottom, zr }; })()`);
  check('custom bind: pedal on A uses the Switch bottom button', cb.bottom.pedal > 0.9 && cb.zr.pedal < 0.1, JSON.stringify(cb));

  // ---- wired PowerA Switch pad (raw 0 Y, 1 B, 2 A, 3 X; right stick on axes 2 / 5) ----
  const pa = await ev(`(() => { localStorage.setItem('trailDescent.padAsked', JSON.stringify({ ...JSON.parse(localStorage.getItem('trailDescent.padAsked') || '{}'), 'Core Wired Controller (Vendor: 20d6 Product: a711)': 1 }));
    const gp = window.__fake('Core Wired Controller (Vendor: 20d6 Product: a711)', '', 14, 10); window.__read();
    const r = {}; gp.press(1); r.bottom = window.__read(); gp.clear(); window.__read(); gp.press(2); r.right = window.__read(); gp.clear(); window.__read();
    gp.axes[5] = -0.9; r.rsUp = window.__read(); gp.clear(); window.__read(); return { r, fam: window.__padFam, open: window.__padWiz.open }; })()`);
  check('powerA: bottom (raw 1) is A, right (raw 2) is B', pa.r.bottom.pressed.join() === 'A' && pa.r.right.pressed.join() === 'B', JSON.stringify(pa.r));
  check('powerA: right stick on axis 5', pa.r.rsUp.rsy < -0.8, JSON.stringify(pa.r.rsUp));
  check('powerA: switch family', pa.fam === 'switch', pa.fam);

  // ---- an unknown pad through the wizard, by keyboard. Its layout is scrambled on purpose. ----
  const ID = 'USB Gamepad (Vendor: 0079 Product: 0006)';
  const wz = await ev(`(async () => { const gp = window.__fake(${JSON.stringify(ID)}, '', 14, 10); gp.rest = { 3: -1, 4: -1 }; gp.clear(); window.__read();
    const W = window.__padWiz, log = [], st0 = W.state().mode;
    const key = c => document.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
    const tick = () => W.tick();
    const act = (f) => { gp.clear(); tick(); f(); tick(); const s = W.state(); log.push(s.step + ':' + s.msg); gp.clear(); tick(); };
    key('Enter'); key('KeyA');   // Set it up (selected first); the next key is ignored by the wizard
    const st1 = W.state().mode;
    act(() => gp.press(2));        // A bottom
    act(() => gp.press(1));        // B right
    act(() => gp.press(1));        // X: same as B -> "already used", stays on X
    const dupMsg = W.state().msg, dupStep = W.state().step;
    act(() => gp.press(3));        // X left
    act(() => gp.press(0));        // Y top
    act(() => gp.press(4)); act(() => gp.press(5));                 // LB RB
    act(() => { gp.axes[3] = 1; }); act(() => { gp.axes[4] = 1; }); // LT RT on axes resting at -1
    act(() => gp.press(8)); act(() => gp.press(9));                 // Back Start
    act(() => gp.press(12));       // LS: wrong button on purpose
    key('Backspace');              // redo it
    const redoStep = W.state().step;
    act(() => gp.press(10));       // LS
    key('KeyS');                   // skip RS
    act(() => { gp.axes[9] = -1; }); act(() => { gp.axes[9] = 0.1429; }); act(() => { gp.axes[9] = 0.7143; }); act(() => { gp.axes[9] = -0.4286; });  // hat U D L R
    act(() => { gp.axes[0] = -1; });  // left stick left
    act(() => { gp.axes[1] = 1; });   // left stick up reads +1 on this pad: inverted
    act(() => { gp.axes[2] = -1; }); act(() => { gp.axes[5] = -1; });
    const st2 = W.state().mode;
    for (let i = 0; i < 5; i++) key('ArrowUp');   // from Save up to Dead zone
    key('ArrowRight');                            // 15% -> 20%
    for (let i = 0; i < 5; i++) key('ArrowDown');
    key('Enter');                                 // Save
    const saved = JSON.parse(localStorage.getItem('trailDescent.padProfiles') || '{}')[${JSON.stringify(ID)}];
    await new Promise(r => setTimeout(r, 50));
    gp.clear(); window.__read();
    const r = {}; gp.press(2); r.bottom = window.__read(); gp.clear(); window.__read();
    gp.press(0); r.top = window.__read(); gp.clear(); window.__read();
    gp.axes[4] = 1; r.rt = window.__read(); gp.clear(); window.__read();
    gp.axes[1] = 1; r.up = window.__read(); gp.clear(); window.__read();
    gp.axes[1] = 0.18; r.dz = window.__read(); gp.clear(); window.__read();
    gp.axes[9] = -0.4286; r.hatR = window.__read(); gp.clear(); window.__read();
    gp.press(11); r.rs = window.__read(); gp.clear(); window.__read();
    return { st0, st1, st2, log, dupMsg, dupStep, redoStep, saved, r, open: W.open, fam: window.__padFam }; })()`);
  check('wizard: offered for an unknown pad', wz.st0 === 'offer', wz.st0);
  check('wizard: Enter starts it', wz.st1 === 'run', wz.st1);
  check('wizard: a button already used is refused', /already/.test(wz.dupMsg) && wz.dupStep === 2, JSON.stringify([wz.dupMsg, wz.dupStep]));
  check('wizard: redo goes back one step', wz.redoStep === 10, wz.redoStep);
  check('wizard: reaches the tune screen', wz.st2 === 'tune', wz.st2 + ' ' + wz.log.join(' | '));
  check('wizard: saved per gamepad.id with dead zone and inversion', wz.saved && wz.saved.dz === 0.2 && wz.saved.ax.ly.inv === true && wz.saved.ax.lx.inv === false && wz.saved.b.LT.a === 3 && wz.saved.b.DR.hat === 9, JSON.stringify(wz.saved));
  check('wizard: closed after save', !wz.open);
  check('wizard map: bottom is A, top is Y', wz.r.bottom.pressed.join() === 'A' && wz.r.top.pressed.join() === 'Y', JSON.stringify([wz.r.bottom, wz.r.top]));
  check('wizard map: trigger axis pedals', wz.r.rt.pedal > 0.9, JSON.stringify(wz.r.rt));
  check('wizard map: inverted stick up leans forward (negative)', wz.r.up.lean < -0.8, JSON.stringify(wz.r.up));
  check('wizard map: its own dead zone', wz.r.dz.lean === 0, JSON.stringify(wz.r.dz));
  check('wizard map: hat right', wz.r.hatR.pressed.join() === 'DR', JSON.stringify(wz.r.hatR));
  check('wizard map: skipped RS falls back to a guess (button 11)', wz.r.rs.pressed.join() === 'RS', JSON.stringify(wz.r.rs));

  // ---- Settings > Controls has the setup row, and the mouse can drive the wizard ----
  const clickLabel = async label => ev(`(() => { const li = [...document.querySelectorAll('#menuPanel li')].find(el => el.querySelector('.mLabel')?.textContent.startsWith(${JSON.stringify(label)})); if (!li) return 'missing'; li.click(); return 'ok'; })()`);
  await ev(`window.__fake('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard', 17, 4); window.__read(); true`);
  check('settings opens', await clickLabel('Settings') === 'ok'); await sleep(150);
  check('controls opens', await clickLabel('Controls') === 'ok'); await sleep(200);
  check('controls has Set up controller', await clickLabel('Set up controller') === 'ok');
  await sleep(100);
  const mouse = await ev(`(() => { const W = window.__padWiz, a = W.state().mode; const li = [...document.querySelectorAll('#padWiz li')].find(l => l.textContent.startsWith('Cancel')); li && li.click(); return { a, b: W.open, toast: (window.__toastLog || []).slice(-1)[0] }; })()`);
  check('setup from settings opens the wizard, mouse Cancel closes it', mouse.a === 'run' && !mouse.b, JSON.stringify(mouse));
  check('no page errors', !exceptions.length, exceptions.join(' | '));
  console.log(JSON.stringify({ passed: passed.length, fail }, null, 2));
  if (fail.length) process.exitCode = 1;
  ws.close();
} finally { chrome.kill(); server.kill(); }
