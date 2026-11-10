// Level editor. Builds on the same jump profiles, landing fit, and trail aim as the mountain.
import { ADJ, NOUN, VERB, blankLevel, validateLevel, levelName, encodeLevel, decodeLevel, rateLevel, startGate, loadLocal, saveLocal, makeCode, publicCodeOk, ALPHA, DIFFS, STYLES } from './level.js';
import { EDITOR_ORIGIN, loadEditorLevel, clearEditorLevel, fitLanding } from './world.js';
import { MP_SERVER } from './net.js';

const TOOLS = [
  ['jump', 'Jump'], ['table', 'Table'], ['hip', 'Hip'], ['drop', 'Drop'], ['ramp', 'Ramp'],
  ['trail', 'Trail'], ['rock', 'Rock'], ['tree', 'Tree'], ['log', 'Log'],
  ['raise', 'Raise'], ['lower', 'Lower'], ['smooth', 'Smooth'], ['start', 'Start'], ['finish', 'Finish'],
];

export function createEditor(api){
  const { THREE, scene, toast, getS, placeAt, updateChunks } = api;
  let doc = blankLevel();
  let past = [], future = [];
  let tool = 'jump';
  let open = false, riding = false, selected = -1, sealed = false, race = false, raceT = 0;
  let cursor = { x: 0, z: 8 };
  let drawing = null;
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const ui = document.createElement('div');
  ui.id = 'editor'; ui.style.cssText = 'display:none;position:fixed;left:12px;top:12px;z-index:40;width:280px;max-height:86vh;overflow:auto;background:rgba(16,20,16,.92);color:#f3e9d2;font:600 15px/1.35 "Barlow Condensed",sans-serif;padding:12px;border-radius:8px';
  document.body.appendChild(ui);
  const rideBar = document.createElement('div');
  rideBar.style.cssText = 'display:none;position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:40;background:rgba(16,20,16,.9);color:#f3e9d2;padding:8px 14px;border-radius:6px;font:700 18px "Barlow Condensed",sans-serif';
  rideBar.textContent = 'TEST RIDE  ·  Esc or the test-ride bind returns to the editor';
  document.body.appendChild(rideBar);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshLambertMaterial({ color: 0xc4a574 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(EDITOR_ORIGIN.x, 48, EDITOR_ORIGIN.z); group.add(pad);
  const cursorMesh = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 20), new THREE.MeshBasicMaterial({ color: 0xffe08a, side: THREE.DoubleSide }));
  cursorMesh.rotation.x = -Math.PI / 2; cursorMesh.position.y = 48.3; group.add(cursorMesh);

  function snapshot(){ past.push(JSON.stringify(doc)); if (past.length > 40) past.shift(); future = []; }
  function restore(raw){ doc = JSON.parse(raw); selected = -1; rebuild(); }
  function undo(){ if (!past.length) return; future.push(JSON.stringify(doc)); restore(past.pop()); }
  function redo(){ if (!future.length) return; past.push(JSON.stringify(doc)); restore(future.pop()); }

  function rebuild(){
    const check = validateLevel(doc);
    if (!check.ok){ toast('This level is not valid'); return; }
    loadEditorLevel(doc);
    while (group.children.length > 2) group.remove(group.children[group.children.length - 1]);
    const add = (mesh) => { mesh.position.y += 0.05; group.add(mesh); };
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    for (const tr of doc.trails){
      for (let i = 1; i < tr.pts.length; i++){
        const a = tr.pts[i - 1], b = tr.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.3) continue;
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, len), mat(0x6a4328));
        m.position.set(EDITOR_ORIGIN.x + (a[0] + b[0]) / 2, 48.1, EDITOR_ORIGIN.z + (a[1] + b[1]) / 2);
        m.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); add(m);
      }
    }
    doc.objects.forEach((o, i) => {
      const col = o.kind === 'start' ? 0x3ddc6a : o.kind === 'finish' ? 0xf0c040 : o.kind === 'tree' ? 0x2f6b32 : o.kind === 'rock' ? 0x8d867c : o.kind === 'log' ? 0x6b4a2a : 0x8a4b24;
      const s = o.size || 1;
      const geo = o.kind === 'tree' ? new THREE.ConeGeometry(1.1 * s, 6 * s, 7) : o.kind === 'rock' ? new THREE.DodecahedronGeometry(1.1 * s) : o.kind === 'log' ? new THREE.BoxGeometry(0.7, 0.45, 5 * s) : new THREE.BoxGeometry(3.2 * s, Math.max(0.4, 1.1 * s), (o.kind === 'ramp' ? 9 : 6) * s);
      const m = new THREE.Mesh(geo, mat(col));
      m.position.set(EDITOR_ORIGIN.x + o.x, 48 + (o.kind === 'tree' ? 3 * s : Math.max(0.3, 0.5 * s)), EDITOR_ORIGIN.z + o.z);
      m.rotation.y = o.yaw || 0;
      if (i === selected) m.material = mat(0xffe08a);
      add(m);
    });
    paint();
  }

  const pl = c => (api.padLabel ? api.padLabel(c) : c);
  function paint(){
    const title = levelName(doc.name) || 'Level';
    const rated = rateLevel(doc);
    const local = loadLocal(api.lsGet);
    ui.innerHTML = `<b style="font:700 22px 'Bebas Neue',sans-serif;letter-spacing:.04em">${title}</b>
      <div style="opacity:.8;margin-bottom:6px">${rated.diff} · ${rated.style} · v${doc.version}${doc.published ? ' · ' + doc.published : ''}</div>
      <div id="edTools" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px"></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
        <button data-act="undo">Undo</button><button data-act="redo">Redo</button>
        <button data-act="rot">Rotate</button><button data-act="big">Bigger</button><button data-act="small">Smaller</button>
        <button data-act="del">Delete</button>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:8px">
        <button data-act="nameA">◀</button><span>${ADJ[doc.name[0]]}</span><button data-act="nameA2">▶</button>
        <button data-act="nameN">◀</button><span>${NOUN[doc.name[1]]}</span><button data-act="nameN2">▶</button>
        <button data-act="nameV">◀</button><span>${VERB[doc.name[2]]}</span><button data-act="nameV2">▶</button>
      </div>
      <div style="margin-bottom:6px">Difficulty <button data-act="diff">${doc.diff}</button> · Style <button data-act="style">${doc.style}</button></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
        <button data-act="save">Save</button><button data-act="ride">Test ride</button><button data-act="race">Race</button>
        <button data-act="export">Share code</button><button data-act="publish">Publish</button>
        <button data-act="browse">Browse</button><button data-act="exit">Exit</button>
      </div>
      <div id="edExtra"></div>
      <div style="opacity:.75;margin-top:6px">Click the ground to place. Drag for a trail. Left stick moves the cursor, ${pl('A')} places, ${pl('X')} rotates, ${pl('LB')}/${pl('RB')} resize, ${pl('Y')} changes tool. Test ride: ${api.bindLabel('editorTest')} or ${pl('Start')}.</div>
      <div style="margin-top:6px">${local.map(l => `<button data-load="${l.id}">${levelName(l.name)}</button>`).join(' ') || 'No saved levels yet.'}</div>`;
    const tools = ui.querySelector('#edTools');
    for (const [id, label] of TOOLS){ const b = document.createElement('button'); b.textContent = label; b.style.outline = id === tool ? '2px solid #ffe08a' : ''; b.onclick = () => { tool = id; paint(); }; tools.appendChild(b); }
    ui.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => act(b.dataset.act));
    ui.querySelectorAll('button[data-load]').forEach(b => b.onclick = () => { const l = loadLocal(api.lsGet).find(x => x.id === b.dataset.load); if (l){ snapshot(); doc = l; rebuild(); } });
  }

  function act(name){
    if (name === 'undo') return undo();
    if (name === 'redo') return redo();
    if (name === 'rot') return rotate(0.35);
    if (name === 'big') return resize(0.15);
    if (name === 'small') return resize(-0.15);
    if (name === 'del') return removeSelected();
    if (name === 'nameA' || name === 'nameA2') return cycleName(0, name.endsWith('2') ? 1 : -1);
    if (name === 'nameN' || name === 'nameN2') return cycleName(1, name.endsWith('2') ? 1 : -1);
    if (name === 'nameV' || name === 'nameV2') return cycleName(2, name.endsWith('2') ? 1 : -1);
    if (name === 'diff'){ const i = ['auto', ...DIFFS].indexOf(doc.diff); doc.diff = ['auto', ...DIFFS][(i + 1) % 4]; return paint(); }
    if (name === 'style'){ const i = ['auto', ...STYLES].indexOf(doc.style); doc.style = ['auto', ...STYLES][(i + 1) % 4]; return paint(); }
    if (name === 'save') return saveHere();
    if (name === 'ride') return testRide(false);
    if (name === 'race') return testRide(true);
    if (name === 'export') return showCode(encodeLevel(doc));
    if (name === 'publish') return publish();
    if (name === 'browse') return browse();
    if (name === 'exit') return close();
  }
  function cycleName(i, d){ const n = [ADJ, NOUN, VERB][i].length; doc.name[i] = (doc.name[i] + d + n) % n; if (doc.published) doc.version += 0; paint(); }
  function saveHere(){
    const check = validateLevel(doc); if (!check.ok){ toast('Can’t save: ' + check.errors.join(', ')); return; }
    const all = loadLocal(api.lsGet).filter(l => l.id !== doc.id); all.unshift(doc); saveLocal(all, api.lsSet); toast('Saved ' + levelName(doc.name)); paint();
  }
  function showCode(code){
    const box = ui.querySelector('#edExtra'); if (!box) return;
    box.innerHTML = code ? `<div style="word-break:break-all;font:12px ui-monospace,monospace;background:#111;padding:6px;border-radius:4px">${code}</div><button id="edImport">Load a code</button><input id="edCode" maxlength="8000" autocomplete="off" spellcheck="false" style="width:100%;margin-top:4px">` : '<div>This level can’t be shared yet.</div>';
    const btn = box.querySelector('#edImport'); if (!btn) return;
    btn.onclick = () => {
      const raw = (box.querySelector('#edCode').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const level = raw.startsWith('GNR1') ? decodeLevel('GNR1' + raw.slice(4)) : null;
      if (!level){ toast('That code is not a level'); return; }
      snapshot(); doc = level; rebuild(); toast('Loaded ' + levelName(level.name));
    };
  }

  function touch(){ if (sealed){ doc.version += 1; sealed = false; doc.published = null; } }
  function clearedKey(){ return doc.id + ':' + doc.version; }
  function raceOpen(){ const c = api.lsGet('trailDescent.levelCleared', {}); return !!(c && c[clearedKey()]); }
  function place(kind, x, z){
    snapshot(); touch();
    if (kind === 'trail') return;
    if ((kind === 'start' || kind === 'finish') && doc.objects.some(o => o.kind === kind)) doc.objects = doc.objects.filter(o => o.kind !== kind);
    doc.objects.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), yaw: 0, size: 1 });
    selected = doc.objects.length - 1;
    rebuild();
  }
  function rotate(d){ const o = doc.objects[selected]; if (!o) return; snapshot(); touch(); o.yaw = (o.yaw || 0) + d; rebuild(); }
  function resize(d){ const o = doc.objects[selected]; if (!o) return; snapshot(); touch(); o.size = Math.max(0.4, Math.min(2.4, (o.size || 1) + d)); rebuild(); }
  function removeSelected(){ if (selected < 0) return; snapshot(); touch(); doc.objects.splice(selected, 1); selected = -1; rebuild(); }
  function sculpt(x, z, mode){
    touch();
    const ix = Math.round(x / 4), iz = Math.round(z / 4);
    const hit = doc.sculpt.findIndex(c => c[0] === ix && c[1] === iz);
    const cur = hit >= 0 ? doc.sculpt[hit][2] : 0;
    let v = cur;
    if (mode === 'raise') v = Math.min(6, cur + 0.35);
    else if (mode === 'lower') v = Math.max(-6, cur - 0.35);
    else { const nb = doc.sculpt.filter(c => Math.abs(c[0] - ix) <= 1 && Math.abs(c[1] - iz) <= 1); v = nb.length ? nb.reduce((s, c) => s + c[2], 0) / nb.length : 0; }
    if (hit >= 0) doc.sculpt[hit][2] = +v.toFixed(2); else doc.sculpt.push([ix, iz, +v.toFixed(2)]);
    if (doc.sculpt.length > 400) doc.sculpt.shift();
    rebuild();
  }
  function commitTrail(pts){
    if (pts.length < 2) return;
    snapshot(); touch();
    doc.trails.push({ pts: pts.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]) });
    if (doc.trails.length > 4) doc.trails.shift();
    rebuild();
  }

  function world(x, z){ return [EDITOR_ORIGIN.x + x, EDITOR_ORIGIN.z + z]; }
  function testRide(asRace){
    const g = startGate(doc);
    if (!g){ toast('Place a start gate first'); return; }
    if (asRace && !raceOpen()){ toast('Complete this level to unlock racing'); return; }
    const check = validateLevel(doc); if (!check.ok){ toast('Fix the level before riding'); return; }
    riding = true; race = !!asRace; raceT = 0; ui.style.display = 'none'; rideBar.style.display = ''; group.visible = true;
    rideBar.textContent = asRace ? 'RACE  ·  Esc returns to the editor' : 'TEST RIDE  ·  Esc or the test-ride bind returns to the editor';
    const [x, z] = world(g.x, g.z);
    updateChunks(x, z, 1e9, 200);
    placeAt(x, z, g.yaw || 0);
    const S = getS(); S.state = 'riding'; S.paused = false; S.run = null; S.free = null; S.editorRide = true; S.speed = 0;
    toast('Test ride — ' + levelName(doc.name));
  }
  function stopRide(){
    riding = false; race = false; rideBar.style.display = 'none'; ui.style.display = '';
    const S = getS(); S.editorRide = false; S.paused = true; S.run = null; S.speed = 0;
    toast('Back to editing');
  }

  async function post(path, body){
    try {
      const r = await fetch(MP_SERVER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { offline: r.status === 404 || r.status === 405, status: r.status, ...j };
      return j;
    } catch { return { offline: true }; }
  }
  function device(){
    let id = api.lsGet('trailDescent.device', '');
    if (typeof id !== 'string' || id.length !== 16 || [...id].some(c => !ALPHA.includes(c))) { id = makeCode() + makeCode() + makeCode().slice(0, 4); api.lsSet('trailDescent.device', id.slice(0, 16)); id = id.slice(0, 16); }
    return id;
  }
  async function publish(){
    const check = validateLevel(doc); if (!check.ok){ toast('Can’t publish: ' + check.errors.join(', ')); return; }
    saveHere();
    const res = await post('/level/publish', { code: doc.published, device: device(), level: doc });
    if (!res || res.offline || !res.ok){ toast('Online lists are coming soon. Use Share code to pass this level around.'); showCode(encodeLevel(doc)); return; }
    doc.published = res.code; doc.version = res.version; doc.id = res.id; sealed = true; saveHere();
    toast('Published ' + res.code); paint();
  }
  async function browse(){
    const box = ui.querySelector('#edExtra'); if (!box) return;
    box.innerHTML = '<div>Newest and most liked…</div>';
    const list = await post('/level/list', { sort: 'newest', device: device() });
    if (!list || list.offline || !list.ok){ box.innerHTML = '<div>Online lists are coming soon. Saved levels on this device are above. Share codes still load.</div>'; return; }
    box.innerHTML = (list.levels || []).map(l => `<div>${l.title} · ${l.diff} · ${l.style} · ${l.likes || 0} likes <button data-get="${l.code}">Load</button> <button data-like="${l.code}">Like</button> <button data-report="${l.code}">Report</button></div>`).join('') || '<div>No shared levels yet.</div>';
    box.querySelectorAll('button[data-get]').forEach(b => b.onclick = () => loadCode(b.dataset.get));
    box.querySelectorAll('button[data-like]').forEach(b => b.onclick = () => like(b.dataset.like));
    box.querySelectorAll('button[data-report]').forEach(b => b.onclick = () => report(b.dataset.report, b.parentElement));
  }
  async function loadCode(code){
    if (!publicCodeOk(code)){ toast('Bad share code'); return; }
    const res = await post('/level/get', { code });
    if (!res || res.offline || !res.ok){ toast('Online lists are coming soon'); return; }
    if (!validateLevel(res.level).ok){ toast('The server sent a level that failed the checks'); return; }
    snapshot(); doc = res.level; doc.published = code; rebuild(); toast('Loaded ' + levelName(doc.name));
  }
  async function like(code){
    const likes = api.lsGet('trailDescent.levelLikes', []);
    if (Array.isArray(likes) && likes.includes(code)){ toast('You already liked this one'); return; }
    const res = await post('/level/like', { code, device: device() });
    const next = Array.isArray(likes) ? likes : []; next.push(code); api.lsSet('trailDescent.levelLikes', next.slice(-200));
    if (!res || res.offline) toast('Like saved on this device. Online lists are coming soon.');
    else toast(res.already ? 'You already liked this one' : 'Liked');
  }
  async function report(code, row){
    const res = await post('/level/report', { code, device: device() });
    if (row) row.remove();
    if (!res || res.offline) toast('Report saved on this device. Online review is coming soon.');
    else toast(res.hidden ? 'Hidden pending review' : 'Reported');
  }

  function openEditor(){
    open = true; riding = false; group.visible = true; ui.style.display = '';
    const S = getS(); S.editor = true; S.editorRide = false; S.paused = true; S.state = 'riding'; S.run = null;
    if (api.closeMenu) api.closeMenu();
    const [x, z] = world(cursor.x, cursor.z);
    updateChunks(x, z, 1e9, 200);
    rebuild();
    toast('Level editor — ' + levelName(doc.name));
  }
  function close(){
    open = false; riding = false; group.visible = false; ui.style.display = 'none'; rideBar.style.display = 'none';
    clearEditorLevel();
    const S = getS(); S.editor = false; S.editorRide = false;
    if (api.mainMenu) api.mainMenu();
  }

  function tick(dt, inp){
    if (!open) return;
    cursorMesh.position.set(EDITOR_ORIGIN.x + cursor.x, 48.3, EDITOR_ORIGIN.z + cursor.z);
    if (riding){ if (race) raceT += dt; watchFinish(); return; }
    const nx = (inp.lsx || 0), nz = (inp.lsy || 0);
    if (nx || nz){ cursor.x = Math.max(-160, Math.min(160, cursor.x + nx * 18 * dt)); cursor.z = Math.max(-160, Math.min(160, cursor.z + nz * 18 * dt)); }
    if (inp.pressed?.A) atCursor();
    if (inp.pressed?.X) rotate(0.25);
    if (inp.pressed?.LB) resize(0.1);
    if (inp.pressed?.RB) resize(-0.1);
    if (inp.pressed?.Y){ const i = TOOLS.findIndex(t => t[0] === tool); tool = TOOLS[(i + 1) % TOOLS.length][0]; paint(); }
  }
  function watchFinish(){
    const fin = doc.objects.find(o => o.kind === 'finish'); if (!fin) return;
    const S = getS();
    if (Math.hypot(S.x - (EDITOR_ORIGIN.x + fin.x), S.z - (EDITOR_ORIGIN.z + fin.z)) > 6) return;
    const key = clearedKey();
    const cleared = api.lsGet('trailDescent.levelCleared', {}) || {};
    const first = !cleared[key];
    cleared[key] = 1; api.lsSet('trailDescent.levelCleared', cleared);
    if (race){
      const times = api.lsGet('trailDescent.levelTimes', {}) || {};
      const best = times[key];
      if (!(best <= raceT)) { times[key] = +raceT.toFixed(3); api.lsSet('trailDescent.levelTimes', times); toast('Race ' + raceT.toFixed(2) + 's'); }
      if (doc.published) post('/level/time', { code: doc.published, version: doc.version, time: raceT, device: device() });
    } else if (first) toast('Level complete — racing unlocked');
    stopRide();
  }
  function atCursor(){
    if (tool === 'raise' || tool === 'lower' || tool === 'smooth'){ snapshot(); sculpt(cursor.x, cursor.z, tool); return; }
    if (tool === 'trail'){ commitTrail([[cursor.x, cursor.z], [cursor.x, cursor.z + 8], [cursor.x + 6, cursor.z + 16]]); return; }
    place(tool, cursor.x, cursor.z);
  }
  function onPress(code){
    if (api.hit('editorUndo', code)) return undo();
    if (api.hit('editorRedo', code)) return redo();
    if (api.hit('editorRotate', code)) return rotate(0.35);
    if (api.hit('editorBigger', code)) return resize(0.15);
    if (api.hit('editorSmaller', code)) return resize(-0.15);
    if (api.hit('editorTest', code)) return riding ? stopRide() : testRide();
    if (code === 'Escape') return riding ? stopRide() : close();
    if (code === 'Digit1') tool = 'jump';
    if (code === 'Digit2') tool = 'table';
    if (code === 'Digit3') tool = 'trail';
  }
  function pointer(e, kind){
    if (!open || riding || e.button !== 0) return;
    const rect = api.view(); if (!rect) return;
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, api.camera());
    if (e.target && e.target.closest && e.target.closest('#editor')) return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -48);
    const hit = new THREE.Vector3(); if (!ray.ray.intersectPlane(plane, hit)) return;
    const x = hit.x - EDITOR_ORIGIN.x, z = hit.z - EDITOR_ORIGIN.z;
    if (Math.hypot(x, z) > 170) return;
    cursor.x = x; cursor.z = z;
    if (kind === 'down' && tool === 'trail'){ drawing = [[x, z]]; return; }
    if (kind === 'move' && drawing){ const last = drawing[drawing.length - 1]; if (Math.hypot(x - last[0], z - last[1]) > 3) drawing.push([x, z]); return; }
    if (kind === 'up' && drawing){ const pts = drawing; drawing = null; commitTrail(pts); return; }
    if (kind === 'down'){
      if (tool === 'raise' || tool === 'lower' || tool === 'smooth'){ snapshot(); sculpt(x, z, tool); return; }
      place(tool, x, z);
    }
  }
  addEventListener('pointerdown', e => pointer(e, 'down'));
  addEventListener('pointermove', e => pointer(e, 'move'));
  addEventListener('pointerup', e => pointer(e, 'up'));

  function ownsCamera(){ return open && !riding; }
  function applyCamera(camera){
    const x = EDITOR_ORIGIN.x + cursor.x, z = EDITOR_ORIGIN.z + cursor.z;
    camera.position.set(x - 8, 70, z + 18);
    camera.up.set(0, 1, 0);
    camera.lookAt(x, 50, z);
  }

  return { open: openEditor, close, tick, onPress, ownsCamera, applyCamera, isOpen: () => open, isRiding: () => riding, stopRide, testRide, refresh: () => { if (open && !riding) paint(); },
    place: (kind, x, z) => { cursor.x = x; cursor.z = z; place(kind, x, z); },
    doc: () => doc, gate: () => startGate(doc), landed: () => fitLanding };
}
