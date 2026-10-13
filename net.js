// Multiplayer client (Phase 1): private rooms by 6-character code, remote riders with snapshot interpolation, skins,
// name tags and preset emotes. No free text exists anywhere: names and emotes are indices into the fixed lists below,
// and the server rejects anything else. If the server can't be reached the game simply stays single-player.
export const MP_SERVER = 'https://gripnrip-rooms.gripnrip.workers.dev';
export const NAME_A = ['Rapid','Turbo','Dusty','Rowdy','Sneaky','Mega','Gnarly','Flowy','Shreddy','Brave','Lucky','Swift','Muddy','Rad','Chill','Wild','Sunny','Rocky','Zippy','Epic','Steady','Bouncy','Speedy','Mighty','Sandy','Frosty','Pumped','Clever','Jolly','Sendy','Happy','Comet'];
export const NAME_B = ['Marmot','Fox','Eagle','Goat','Lynx','Bear','Moose','Otter','Falcon','Badger','Coyote','Hawk','Ram','Wolf','Raven','Bison','Puma','Gecko','Owl','Hare','Elk','Beaver','Lizard','Viper','Yak','Panda','Tiger','Rhino','Koala','Bobcat','Heron','Orca'];
export const EMOTES = ['👍 Nice!', '🔥 Sick line!', '😂 Haha', '⏳ Wait for me', '🏁 Race?', '👋 Hi!'];
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const cleanCode = s => (s || '').toUpperCase().split('').filter(c => CODE_ALPHA.includes(c)).join('').slice(0, 6);
const SEND_HZ = 15, DELAY = 0.12, EXTRA = 0.15;

export function initNet(g){   // g: {THREE, scene, camera, S, bike, buildBikeRider, skinTo, mySkin, myName, worldIdx, onWorld, toast, trickKeys, drive}
  const { THREE } = g;
  const st = { ws:null, code:null, id:0, host:0, locked:false, status:'off', peers:new Map(), sendT:0, err:null, listeners:new Set() };
  const emit = () => st.listeners.forEach(f => { try { f(st); } catch {} });
  // ---- hud: room badge + emote bubbles
  const hud = document.createElement('div'); hud.id = 'mpHud'; hud.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:55;font:600 13px/1.35 "Barlow Condensed",sans-serif;color:#fff;background:rgba(20,24,20,0.6);padding:6px 10px;border-radius:6px;display:none;pointer-events:none;text-align:center;max-width:320px'; document.body.appendChild(hud);
  const renderHud = () => { if (!st.ws || st.status !== 'in'){ hud.style.display = 'none'; return; } hud.style.display = 'block';
    const me = `${NAME_A[g.myName()[0]]} ${NAME_B[g.myName()[1]]}`;
    hud.innerHTML = `ROOM <b style="letter-spacing:2px">${st.code}</b>${st.locked ? ' 🔒' : ''} · ${st.peers.size + 1}/8<br><small>${me}${st.id === st.host ? ' (host)' : ''} + ${[...st.peers.values()].map(p => p.label).join(", ")} · Emotes: keys 1–6</small>`; };
  // ---- remote riders
  const tagTex = (text, sub) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.roundRect ? c.roundRect(4, 8, 248, 48, 12) : c.rect(4, 8, 248, 48); c.fill();
    c.font = '600 28px "Barlow Condensed", sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 33);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const mkSprite = (tex, w, h) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false, transparent:true, fog:false})); s.scale.set(w, h, 1); s.renderOrder = 999; return s; };
  function addPeer(id, name, skin){
    if (st.peers.has(id)) return st.peers.get(id);
    const grp = new THREE.Group(), lean = new THREE.Group(); grp.add(lean);
    const BRx = g.buildBikeRider(new THREE.MeshStandardMaterial({color:0xff2fa8, roughness:0.4, metalness:0.3})); lean.add(BRx.root);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const label = `${NAME_A[name[0]] || '?'} ${NAME_B[name[1]] || '?'}`;
    const tag = mkSprite(tagTex(label), 2.4, 0.6); tag.position.y = 2.3; grp.add(tag);
    const p = { id, name, label, skin, grp, lean, BRx, tag, buf:[], fakeS:{air:false, crashT:0, trick:null, trickAmt:1, speed:0, susp:0, tweak:0, wPitch:0, wYaw:0}, inp:{cadence:0, standing:0, steer:0}, bubble:null, bubbleT:0 };
    try { g.skinTo(BRx, lean, skin); } catch (e) { console.warn('skin', e); }
    grp.visible = false; g.scene.add(grp); st.peers.set(id, p); renderHud(); return p; }
  function dropPeer(id){ const p = st.peers.get(id); if (!p) return; g.scene.remove(p.grp); p.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); st.peers.delete(id); renderHud(); }
  function bubble(p, e){ if (p.bubble){ p.grp.remove(p.bubble); p.bubble.material.map.dispose(); } p.bubble = mkSprite(tagTex(EMOTES[e] || ''), 2.6, 0.65); p.bubble.position.y = 2.95; p.grp.add(p.bubble); p.bubbleT = 4; }
  // ---- connection
  function clearRoom(){ for (const id of [...st.peers.keys()]) dropPeer(id); st.ws = null; st.code = null; st.id = 0; st.status = 'off'; renderHud(); emit(); }
  function leave(){ const ws = st.ws; clearRoom(); try { ws && ws.close(1000, 'bye'); } catch {} try { sessionStorage.removeItem('gnr.room'); } catch {} }
  async function create(){
    st.status = 'connecting'; emit();
    try { const r = await fetch(MP_SERVER + '/new', {cache:'no-store'}); if (!r.ok) throw new Error('http ' + r.status); const { code } = await r.json(); return join(code); }
    catch (e){ st.status = 'off'; st.err = 'unreachable'; emit(); g.toast('📡 Multiplayer server unreachable — riding solo'); return false; } }
  function join(codeIn){
    const code = cleanCode(codeIn); if (code.length !== 6){ g.toast('Room codes have 6 letters/numbers'); return false; }
    if (st.ws) leave();
    st.status = 'connecting'; st.code = code; emit();
    let ws; try { ws = new WebSocket(MP_SERVER.replace(/^http/, 'ws') + '/room/' + code); } catch { st.status = 'off'; g.toast('📡 Multiplayer server unreachable — riding solo'); emit(); return false; }
    st.ws = ws; let welcomed = false;
    const to = setTimeout(() => { if (!welcomed){ try { ws.close(); } catch {} if (st.ws === ws){ clearRoom(); g.toast('📡 Could not reach the room — riding solo'); } } }, 7000);
    ws.onopen = () => ws.send(JSON.stringify({ t:'hello', name:g.myName(), skin:g.mySkin(), world:g.worldIdx() }));
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (st.ws !== ws) return;
      switch (m.t){
        case 'welcome': welcomed = true; clearTimeout(to); st.id = m.id; st.host = m.host; st.locked = m.locked; st.status = 'in';
          try { sessionStorage.setItem('gnr.room', code); } catch {}
          if (m.world !== g.worldIdx()){ g.onWorld(m.world, code); return; }   // host's world wins: reload into it, then auto-rejoin
          for (const p of m.peers){ const q = addPeer(p.id, p.name, p.skin); if (p.s) snap(q, p.s); }
          g.toast(`🤝 In room ${code} — share the code with a friend`); renderHud(); emit(); break;
        case 'join': addPeer(m.id, m.name, m.skin); g.toast(`👋 ${st.peers.get(m.id).label} joined`); emit(); break;
        case 'leave': { const p = st.peers.get(m.id); if (p) g.toast(`${p.label} left`); dropPeer(m.id); emit(); break; }
        case 's': { const p = st.peers.get(m.id); if (p) snap(p, m); break; }
        case 'e': { const p = st.peers.get(m.id); if (p){ bubble(p, m.e); g.toast(`${p.label}: ${EMOTES[m.e]}`); } break; }
        case 'skin': { const p = st.peers.get(m.id); if (p){ p.skin = m.skin; try { g.skinTo(p.BRx, p.lean, m.skin); } catch {} } break; }
        case 'host': st.host = m.id; if (m.id === st.id) g.toast('⭐ You are now the room host'); renderHud(); emit(); break;
        case 'locked': st.locked = m.on; g.toast(m.on ? '🔒 Room locked — no one else can join' : '🔓 Room unlocked'); renderHud(); emit(); break;
        case 'kicked': g.toast('You were removed from the room'); leave(); break;
        case 'err': g.toast({full:'That room is full (8 riders)', locked:'That room is locked', noroom:'No room with that code', badcode:'Bad room code'}[m.m] || 'Room error'); st.err = m.m; break;
      } };
    ws.onclose = () => { clearTimeout(to); if (st.ws === ws){ const was = st.status === 'in'; clearRoom(); if (was) g.toast('📡 Disconnected — riding solo'); } };
    ws.onerror = () => {};
    return true; }
  function snap(p, m){ const t = performance.now()/1000; p.buf.push({t, p:m.p, q:m.q, v:m.v, a:m.a, k:m.k, f:m.f}); if (p.buf.length > 30) p.buf.shift(); }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function update(dt){
    if (!st.ws || st.status !== 'in') return;
    // send my state at 15 Hz
    st.sendT -= dt;
    if (st.sendT <= 0 && st.ws.readyState === 1){ st.sendT = 1/SEND_HZ; const S = g.S, q = g.bike.quaternion;
      if (S.state === 'riding' || S.state === 'finished' || S.lift){
        const k = S.trick ? g.trickKeys.indexOf(S.trick) + 1 : 0;
        st.ws.send(JSON.stringify({ t:'s', p:[+g.bike.position.x.toFixed(2), +g.bike.position.y.toFixed(2), +g.bike.position.z.toFixed(2)], q:[+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.w.toFixed(3)], v:Math.min(59, Math.max(0, S.speed || 0)), a:S.air ? 1 : 0, k:Math.max(0, Math.min(31, k)), f:Math.min(1, (g.drive().cadence || 0)/120) })); } }
    // remote riders: render DELAY seconds in the past, interpolating between the two bracketing snapshots
    const now = performance.now()/1000, rt = now - DELAY;
    for (const p of st.peers.values()){ const b = p.buf; if (!b.length){ p.grp.visible = false; continue; } p.grp.visible = true;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      let A = b[0], B = b[1] || b[0], u = B === A ? 0 : (rt - A.t)/(B.t - A.t);
      if (u > 1){ u = Math.min(1 + EXTRA/Math.max(0.03, B.t - A.t), u); }   // short extrapolation on a late packet
      u = Math.max(0, u);
      p.grp.position.set(A.p[0] + (B.p[0]-A.p[0])*u, A.p[1] + (B.p[1]-A.p[1])*u, A.p[2] + (B.p[2]-A.p[2])*u);
      if (Math.hypot(B.p[0]-A.p[0], B.p[2]-A.p[2]) > 25) p.grp.position.set(...B.p);   // teleport (respawn / lift): snap
      qa.set(...A.q).normalize(); qb.set(...B.q).normalize(); p.grp.quaternion.copy(qa).slerp(qb, Math.min(1, u));
      const F = p.fakeS; F.speed = B.v; F.air = !!B.a; F.trick = B.k ? g.trickKeys[B.k - 1] : null; p.inp.cadence = B.f*120; p.inp.standing = B.f > 0 ? 1 : 0;
      try { p.BRx.update(F, p.inp, dt); } catch {}
      const d = g.camera.position.distanceTo(p.grp.position); p.tag.visible = d < 150; const sc = Math.max(1, d/18); p.tag.scale.set(2.4*sc, 0.6*sc, 1);
      if (p.bubble){ p.bubbleT -= dt; p.bubble.scale.set(2.6*sc, 0.65*sc, 1); if (p.bubbleT <= 0){ p.grp.remove(p.bubble); p.bubble.material.map.dispose(); p.bubble = null; } } } }
  function emote(e){ if (st.ws && st.status === 'in' && e >= 0 && e < EMOTES.length){ st.ws.send(JSON.stringify({t:'e', e})); g.toast(`You: ${EMOTES[e]}`); } }
  function lock(on){ if (st.ws && st.id === st.host) st.ws.send(JSON.stringify({t:'lock', on})); }
  function kick(id){ if (st.ws && st.id === st.host) st.ws.send(JSON.stringify({t:'kick', id})); }
  function sendSkin(){ if (st.ws && st.status === 'in') st.ws.send(JSON.stringify({t:'skin', skin:g.mySkin()})); }
  // auto-rejoin after a world reload
  try { const c = sessionStorage.getItem('gnr.room'); if (c) setTimeout(() => join(c), 1500); } catch {}
  return { st, create, join, leave, update, emote, lock, kick, sendSkin, on:f => st.listeners.add(f) };
}
