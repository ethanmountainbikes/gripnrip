import * as THREE from 'three';

// ---------- Trail / terrain math ----------
const W = 3.6;               // trail half width
const LENGTH = 2000;         // finish distance (m)
const G = 9.81;
const cx = d => 38*Math.sin(d*0.0045) + 14*Math.sin(d*0.013+1) + 5*Math.sin(d*0.031);
const cxd = d => (cx(d+0.5)-cx(d-0.5));
const baseH = d => -0.2*d + 3*Math.sin(d*0.017+2) + 1.2*Math.sin(d*0.043+2) + 0.4*Math.sin(d*0.11+2);
const kickers = [];
for (let d = 90; d < LENGTH-60; d += 110 + (d%3)*15) kickers.push(d);
const KL = 5.5, KH = 1.5, KW = 2.3;
function kickAt(d, u){
  if (Math.abs(u) > KW) return 0;
  for (const k of kickers){ const t = d-k; if (t>=0 && t<=KL) return KH*Math.pow(t/KL,1.7); }
  return 0;
}
function terrainH(x, z){
  const d = -z, u = x - cx(d), au = Math.abs(u);
  let h = baseH(d);
  if (au > W){ const e = au-W; const s = Math.min(1, e/4);
    h += e*0.12 + s*(0.7*Math.sin(x*0.31)*Math.sin(z*0.27) + 0.35*Math.sin(x*0.9+z*0.7));
    if (au > 60) h += (au-60)*0.9; }
  return h;
}
const groundH = (x,z) => terrainH(x,z) + kickAt(-z, x - cx(-z));
let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = 0xa9cfe6;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xbcd6e2, 40, 330);
const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, 0.1, 3000);
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a6030, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera, {left:-35,right:35,top:35,bottom:-35,near:1,far:150});
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// sky gradient dome
{ const g = new THREE.SphereGeometry(1500, 24, 12);
  const m = new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, fog:false,
    vertexShader:`varying vec3 p; void main(){p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 p; void main(){float h=normalize(p).y; vec3 c=mix(vec3(.78,.86,.9),vec3(.35,.6,.88),clamp(h*2.5,0.,1.)); gl_FragColor=vec4(c,1.);}`});
  var skyDome = new THREE.Mesh(g, m); skyDome.renderOrder = -1; scene.add(skyDome); }

// distant mountains (follow camera horizontally)
const mountains = new THREE.Group();
{ const mat = new THREE.MeshLambertMaterial({color:0x6f8aa3, flatShading:true, fog:false});
  const snow = new THREE.MeshLambertMaterial({color:0xeef3f7, flatShading:true, fog:false});
  for (let i=0;i<46;i++){ const a = i/46*Math.PI*2 + rnd()*0.1, r = 900+rnd()*250, hgt = 160+rnd()*260;
    const m = new THREE.Mesh(new THREE.ConeGeometry(180+rnd()*160, hgt, 6+Math.floor(rnd()*3)), mat);
    m.position.set(Math.cos(a)*r, hgt/2-140, Math.sin(a)*r); m.rotation.y = rnd()*3; mountains.add(m);
    if (hgt > 300){ const c = new THREE.Mesh(new THREE.ConeGeometry((180)*0.28, hgt*0.25, 6), snow); c.position.copy(m.position); c.position.y += hgt*0.38; mountains.add(c);} }
  scene.add(mountains); }

// terrain mesh following the trail
{ const us = [-150,-110,-80,-60,-45,-34,-26,-20,-15,-11,-8,-6,-4.8,-4.1,-3.6,-3,-2,-1,0];
  for (let i=us.length-2;i>=0;i--) us.push(-us[i]);
  const step = 2, rows = Math.ceil((LENGTH+260)/step), cols = us.length;
  const pos = new Float32Array(rows*cols*3), col = new Float32Array(rows*cols*3);
  const dirt = new THREE.Color(0x8a6640), dirt2 = new THREE.Color(0x6e4f30), grass = new THREE.Color(0x5d8a32), grass2 = new THREE.Color(0x7aa040), c = new THREE.Color();
  for (let r=0;r<rows;r++){ const d = -80 + r*step;
    for (let k=0;k<cols;k++){ const u = us[k], x = cx(d)+u, z = -d, i = (r*cols+k)*3;
      pos[i]=x; pos[i+1]=terrainH(x,z); pos[i+2]=z;
      const n = 0.5+0.5*Math.sin(x*0.7+z*0.3)*Math.cos(z*0.5);
      if (Math.abs(u) <= W) c.copy(dirt).lerp(dirt2, n*0.7 + (Math.abs(u)<1?0.3:0));
      else if (Math.abs(u) <= 4.1) c.copy(dirt).lerp(grass, 0.5);
      else c.copy(grass).lerp(grass2, n);
      col[i]=c.r; col[i+1]=c.g; col[i+2]=c.b; } }
  const idx = [];
  for (let r=0;r<rows-1;r++) for (let k=0;k<cols-1;k++){ const a=r*cols+k, b=a+1, e=a+cols, f=e+1; idx.push(a,b,e, b,f,e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors:true}));
  m.receiveShadow = true; scene.add(m); }

// kickers (wooden ramps)
{ const mat = new THREE.MeshStandardMaterial({color:0xb07a45, roughness:0.9, flatShading:true});
  const plankTex = (() => { const cv = document.createElement('canvas'); cv.width=64; cv.height=64; const x = cv.getContext('2d');
    x.fillStyle='#b98450'; x.fillRect(0,0,64,64); x.fillStyle='#7a5230'; for(let i=0;i<64;i+=8) x.fillRect(0,i,64,1.5);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  mat.map = plankTex; mat.color.set(0xffffff);
  for (const k of kickers){
    const N=10, verts=[], uv=[], idx=[];
    const P = (t,u,top) => { const d=k+t, x=cx(d)+u, z=-d; const y=terrainH(x,z)+(top?KH*Math.pow(t/KL,1.7):-0.3); verts.push(x,y+(top?0.02:0),z); uv.push(u*0.5,t*0.8); return verts.length/3-1; };
    const topL=[], topR=[], botL=[], botR=[];
    for (let i=0;i<=N;i++){ const t=i/N*KL; topL.push(P(t,-KW,1)); topR.push(P(t,KW,1)); botL.push(P(t,-KW,0)); botR.push(P(t,KW,0)); }
    for (let i=0;i<N;i++){ idx.push(topL[i],topR[i],topL[i+1], topR[i],topR[i+1],topL[i+1]);
      idx.push(botL[i],topL[i],botL[i+1], topL[i],topL[i+1],botL[i+1]);
      idx.push(topR[i],botR[i],botR[i+1], topR[i],botR[i+1],topR[i+1]); }
    idx.push(topL[N],topR[N],botL[N], topR[N],botR[N],botL[N]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; scene.add(m);
  } }

// trees (instanced pines)
const trees = []; // collision list {x,z,d}
{ const N = 2600;
  const trunkG = new THREE.CylinderGeometry(0.18,0.32,1,6); trunkG.translate(0,0.5,0);
  const c1 = new THREE.ConeGeometry(1,1,7); c1.translate(0,0.5,0);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({color:0x5a3d26}), N);
  const fol1 = new THREE.InstancedMesh(c1, new THREE.MeshLambertMaterial({color:0xffffff}), N);
  const fol2 = new THREE.InstancedMesh(c1, new THREE.MeshLambertMaterial({color:0xffffff}), N);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
  for (let i=0;i<N;i++){
    const d = -60 + rnd()*(LENGTH+200), side = rnd()<0.5?-1:1, u = side*(W+2.5+Math.pow(rnd(),1.6)*95);
    const x = cx(d)+u, z = -d, y = terrainH(x,z)-0.2, h = 9+rnd()*13, r = h*(0.17+rnd()*0.05);
    q.setFromAxisAngle(new THREE.Vector3(0,1,0), rnd()*6);
    M.compose(p.set(x,y,z), q, s.set(1,h*0.45,1)); trunk.setMatrixAt(i,M);
    M.compose(p.set(x,y+h*0.25,z), q, s.set(r,h*0.55,r)); fol1.setMatrixAt(i,M);
    M.compose(p.set(x,y+h*0.55,z), q, s.set(r*0.7,h*0.45,r*0.7)); fol2.setMatrixAt(i,M);
    cc.setHSL(0.28+rnd()*0.06, 0.45, 0.16+rnd()*0.08); fol1.setColorAt(i,cc); cc.offsetHSL(0,0,0.03); fol2.setColorAt(i,cc);
    if (Math.abs(u) < 30) trees.push({x,z,d});
  }
  for (const m of [trunk,fol1,fol2]){ m.castShadow = true; m.receiveShadow = true; scene.add(m); } }
trees.sort((a,b)=>a.d-b.d);

// grass tufts & flowers
{ const N = 7000, g = new THREE.ConeGeometry(0.12,0.6,3); g.translate(0,0.3,0);
  const grass = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({color:0xffffff}), N);
  const fg = new THREE.IcosahedronGeometry(0.11,0); fg.translate(0,0.35,0);
  const NF = 1500, flowers = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({color:0xffffff}), NF);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
  for (let i=0;i<N;i++){ const d = rnd()*LENGTH, u = (rnd()<0.5?-1:1)*(W+0.3+Math.pow(rnd(),2)*30), x=cx(d)+u, z=-d;
    q.setFromAxisAngle(new THREE.Vector3(rnd()-.5,1,rnd()-.5).normalize(), rnd()*0.4);
    const sc = 0.6+rnd()*1.2; M.compose(p.set(x,terrainH(x,z),z), q, s.set(sc,sc,sc)); grass.setMatrixAt(i,M);
    cc.setHSL(0.22+rnd()*0.08,0.55,0.3+rnd()*0.15); grass.setColorAt(i,cc); }
  const fc = [0xffe14a,0xd65cff,0xffffff,0xff5a8a];
  for (let i=0;i<NF;i++){ const d = rnd()*LENGTH, u = (rnd()<0.5?-1:1)*(W+0.6+rnd()*18), x=cx(d)+u, z=-d;
    M.compose(p.set(x,terrainH(x,z),z), q.identity(), s.set(1,1,1)); flowers.setMatrixAt(i,M); flowers.setColorAt(i, cc.set(fc[i%4])); }
  scene.add(grass, flowers); }

// trail edges: striped poles + caution tape
{ const stripe = (a,b,vert) => { const cv=document.createElement('canvas'); cv.width=cv.height=64; const x=cv.getContext('2d');
    x.fillStyle=a; x.fillRect(0,0,64,64); x.fillStyle=b;
    if (vert) for(let i=0;i<64;i+=32) x.fillRect(0,i,64,16);
    else { x.beginPath(); for(let i=-64;i<128;i+=32){ x.moveTo(i,0);x.lineTo(i+16,0);x.lineTo(i+80,64);x.lineTo(i+64,64);} x.fill(); }
    const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; return t; };
  const poleTex = stripe('#ffffff','#e0222a',true); poleTex.repeat.set(1,3);
  const tapeMat = new THREE.MeshLambertMaterial({map:stripe('#f5d000','#111111',false), side:THREE.DoubleSide});
  const poleG = new THREE.CylinderGeometry(0.05,0.05,1.2,6); poleG.translate(0,0.6,0);
  const SP = 9, nP = Math.floor(LENGTH/SP)*2;
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({map:poleTex}), nP);
  const M = new THREE.Matrix4(); let pi = 0;
  for (const side of [-1,1]){
    const v=[], uv=[], idx=[]; let dist=0, prev=null;
    for (let d=0; d<LENGTH; d+=SP){ const u = side*(W+0.9), x=cx(d)+u, z=-d, y=terrainH(x,z);
      M.makeTranslation(x,y,z); poles.setMatrixAt(pi++,M);
      for (let j=0;j<3;j++){ const dd = d + j*SP/3, xx=cx(dd)+u, zz=-dd, sag = Math.sin(j/3*Math.PI)*0.12;
        const yy = terrainH(xx,zz)+1.0 - sag; if (prev) dist += Math.hypot(xx-prev[0], zz-prev[1]); prev=[xx,zz];
        v.push(xx,yy,zz, xx,yy+0.12,zz); uv.push(dist*1.2,0, dist*1.2,1); } }
    for (let i=0;i<v.length/6-1;i++){ const a=i*2; idx.push(a,a+2,a+1, a+1,a+2,a+3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(v,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g,tapeMat)); }
  poles.count = pi; scene.add(poles);
  // start & finish banners
  const banner = (d, color, label) => { const grp = new THREE.Group(), x=cx(d), z=-d, y=terrainH(x,z);
    const pm = new THREE.MeshLambertMaterial({color:0x333333});
    for (const s of [-1,1]){ const p=new THREE.Mesh(new THREE.BoxGeometry(0.25,4.5,0.25),pm); p.position.set(s*(W+1),2.25,0); grp.add(p); }
    const cv=document.createElement('canvas'); cv.width=512; cv.height=96; const c=cv.getContext('2d'); c.fillStyle=color; c.fillRect(0,0,512,96);
    c.fillStyle='#fff'; c.font='bold 64px Arial'; c.textAlign='center'; c.fillText(label,256,72);
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
    const b=new THREE.Mesh(new THREE.PlaneGeometry(2*W+2,1.2), new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide})); b.position.y=4; grp.add(b);
    grp.position.set(x,y,z); grp.rotation.y = Math.atan2(-cxd(d),1); scene.add(grp); };
  banner(4,'#ff7a00','START'); banner(LENGTH,'#1c9c3a','FINISH'); }

// ---------- Bike + rider ----------
const bike = new THREE.Group();          // position + heading yaw (+ spin)
const pitchG = new THREE.Group(); bike.add(pitchG);
const leanG = new THREE.Group(); pitchG.add(leanG);
const rig = new THREE.Group(); leanG.add(rig);        // preload compression
const wheels = [];
{ const pink = new THREE.MeshStandardMaterial({color:0xff2fa8, roughness:0.4, metalness:0.3});
  const black = new THREE.MeshStandardMaterial({color:0x1a1a1a, roughness:0.8});
  const silver = new THREE.MeshStandardMaterial({color:0xbbbbbb, metalness:0.8, roughness:0.3});
  const orange = new THREE.MeshStandardMaterial({color:0xff7a12, roughness:0.7});
  const navy = new THREE.MeshStandardMaterial({color:0x22283a, roughness:0.8});
  const white = new THREE.MeshStandardMaterial({color:0xf4f4f4, roughness:0.4});
  const skin = new THREE.MeshStandardMaterial({color:0xd9a27a});
  const bar = (a,b,r,mat) => { const A=new THREE.Vector3(...a), B=new THREE.Vector3(...b), L=A.distanceTo(B);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,8),mat); m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), B.clone().sub(A).normalize()); m.castShadow=true; rig.add(m); return m; };
  const R = 0.36;
  for (const zz of [-0.58, 0.55]){ const w = new THREE.Group(); w.position.set(0,R,zz);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R-0.04,0.06,8,20), black); tire.rotation.y=Math.PI/2; tire.castShadow=true; w.add(tire);
    for (let i=0;i<6;i++){ const sp = new THREE.Mesh(new THREE.BoxGeometry(0.015,2*(R-0.08),0.02), silver); sp.rotation.x = i*Math.PI/6; w.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.12,8), pink); hub.rotation.z=Math.PI/2; w.add(hub);
    rig.add(w); wheels.push(w); }
  // frame (front = -z)
  const BB=[0,0.33,0.05], seat=[0,0.95,0.25], head=[0,0.9,-0.38];
  bar(BB,seat,0.04,pink); bar(BB,head,0.05,pink); bar(seat,head,0.04,pink);
  bar(BB,[0,R,0.55],0.03,pink); bar(seat,[0,R,0.55],0.03,pink);
  bar(head,[0.08,R,-0.58],0.03,silver); bar(head,[-0.08,R,-0.58],0.03,silver);
  bar([0,0.9,-0.38],[0,1.05,-0.42],0.03,black); bar([-0.38,1.06,-0.42],[0.38,1.06,-0.42],0.02,black);
  bar([0,0.95,0.25],[0,1.0,0.3],0.02,black); const s=bar([0,1.0,0.22],[0,1.0,0.42],0.05,black);
  // rider
  const box = (w,h,d,mat,x,y,z,rx=0) => { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.x=rx; m.castShadow=true; rig.add(m); return m; };
  box(0.36,0.55,0.24,orange,0,1.42,0.02,-0.75);                  // torso leaning forward
  box(0.37,0.2,0.25,white,0,1.48,0.0,-0.75).scale.set(0.3,0.3,1.02); // jersey stripe
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15,12,10), white); helm.position.set(0,1.7,-0.24); helm.scale.set(1,0.95,1.2); helm.castShadow=true; rig.add(helm);
  box(0.22,0.08,0.12,navy,0,1.66,-0.36);   // goggles/visor
  const peak = box(0.22,0.02,0.12,white,0,1.79,-0.36,-0.2);
  bar([-0.18,1.55,-0.1],[-0.36,1.08,-0.42],0.05,orange); bar([0.18,1.55,-0.1],[0.36,1.08,-0.42],0.05,orange); // arms
  for (const sx of [-0.12,0.12]){ bar([sx,1.15,0.2],[sx*1.6,0.9,-0.12],0.07,navy); bar([sx*1.6,0.9,-0.12],[sx*1.4,0.42,0.06],0.06,navy);
    box(0.09,0.06,0.2,black,sx*1.4,0.4,0.02); }
  box(0.3,0.22,0.22,navy,0,1.17,0.22);
}
scene.add(bike);
bike.traverse(o=>{ if(o.isMesh) o.castShadow=true; });

// ---------- Input ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code]=true; if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); onPress(e.code); });
addEventListener('keyup', e => { keys[e.code]=false; });
const toastEl = document.getElementById('toast'); let toastT;
function toast(msg){ toastEl.textContent = msg; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(()=>toastEl.style.opacity=0, 2500); }
addEventListener('gamepadconnected', e => toast('🎮 Controller connected: ' + e.gamepad.id.slice(0,40)));
addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));
const dz = (v, z=0.15) => Math.abs(v)<z ? 0 : (v - Math.sign(v)*z)/(1-z);
let prevBtn = [];
function readInput(){
  const inp = {steer:0, pedal:0, brake:0, jump:false, tx:0, ty:0, pressed:{}};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads){ if (!gp) continue;
    const b = i => gp.buttons[i] ? gp.buttons[i].value : 0;
    inp.steer += dz(gp.axes[0]||0); inp.tx += dz(gp.axes[2]||0); inp.ty += dz(gp.axes[3]||0);
    inp.pedal = Math.max(inp.pedal, b(7)); inp.brake = Math.max(inp.brake, b(6));
    if (b(0)>0.5) inp.jump = true;
    for (const [i,name] of [[0,'A'],[3,'Y'],[9,'Start'],[8,'Back']]){ const now=b(i)>0.5; if(now && !prevBtn[gp.index+'_'+i]) inp.pressed[name]=true; prevBtn[gp.index+'_'+i]=now; }
    break; }
  if (keys.KeyA||keys.ArrowLeft) inp.steer -= 1; if (keys.KeyD||keys.ArrowRight) inp.steer += 1;
  const up = keys.KeyW||keys.ArrowUp, down = keys.KeyS||keys.ArrowDown;
  if (up) inp.pedal = 1; if (down) inp.brake = 1;
  if (keys.Space) inp.jump = true;
  if (keys.KeyJ) inp.tx -= 1; if (keys.KeyL) inp.tx += 1; if (keys.KeyI) inp.ty -= 1; if (keys.KeyK) inp.ty += 1;
  inp.kbUp = up; inp.kbDown = down;
  inp.steer = THREE.MathUtils.clamp(inp.steer,-1,1);
  return inp;
}

// ---------- Game state ----------
const S = { x:0,y:0,z:0, yaw:0, speed:0, vy:0, vx:0, vz:0, air:false, airT:0, pitch:0, spin:0, takeoffPitch:0, lean:0,
  preload:0, lives:3, score:0, bestAir:0, totalAir:0, crashT:0, time:0, state:'menu', paused:false, lastVyG:0, trickMsgT:0,
  maxKmh:0, clean:0, spins:0, flips:0, checkpointD:0 };
const objectives = [
  {text:'Get 1 clean landing(s)', n:1, val:()=>S.clean},
  {text:'Reach 50 km/h', n:50, val:()=>Math.floor(S.maxKmh)},
  {text:'Land a 360 spin', n:1, val:()=>S.spins},
  {text:'Get 5 clean landing(s)', n:5, val:()=>S.clean},
  {text:'Land a flip', n:1, val:()=>S.flips},
  {text:'Reach the finish line', n:1, val:()=>S.state==='finished'?1:0},
];
let objI = 0;
const $ = id => document.getElementById(id);
const trickEl = $('trick'), centerEl = $('center');
function flash(msg, t=1.2){ centerEl.textContent = msg; S.flashT = t; }
function placeOnTrail(d){
  S.x = cx(d); S.z = -d; S.y = groundH(S.x,S.z); S.yaw = Math.atan2(-cxd(d),1);
  S.speed = 0; S.vy = 0; S.air = false; S.pitch = 0; S.spin = 0; S.lean = 0; S.preload = 0; S.crashT = 0;
}
function resetGame(){
  Object.assign(S,{lives:3,score:0,bestAir:0,totalAir:0,time:0,maxKmh:0,clean:0,spins:0,flips:0,state:'riding',paused:false});
  objI = 0; placeOnTrail(8); $('overlay').classList.add('hidden');
}
function crash(reason){
  if (S.crashT>0) return;
  S.lives--; S.crashT = 2.0; S.air = false; flash(S.lives>0 ? 'BAIL!' : 'GAME OVER', 2);
  trickEl.textContent = reason;
  if (S.lives <= 0){ S.state='over'; setTimeout(()=>{ showOverlay('GAME OVER', `Rep: ${S.score}<br>Press <b>A</b> / <b>Enter</b> to try again`); }, 1600); }
}
function showOverlay(title,msg){ $('overlay').classList.remove('hidden'); $('overlayBox').querySelector('h1').textContent=title; $('overlayMsg').innerHTML=msg; }
function togglePause(){ if (S.state!=='riding') return; S.paused=!S.paused; if (S.paused) showOverlay('PAUSED','Press <b>Start</b> / <b>P</b> to resume'); else $('overlay').classList.add('hidden'); }
function onPress(code){
  if (code==='Enter' || code==='A'){ if (S.state==='menu'||S.state==='over'||S.state==='finished'){ resetGame(); return; } }
  if (code==='Space' && (S.state==='menu'||S.state==='over'||S.state==='finished')) { resetGame(); return; }
  if (code==='KeyP'||code==='Escape'||code==='Start') togglePause();
  if (code==='KeyH'||code==='Back') $('help').classList.toggle('hidden');
  if ((code==='KeyR'||code==='Y') && S.state==='riding' && !S.paused) { placeOnTrail(Math.max(8,-S.z-3)); flash('RESPAWN',0.8); }
}
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

function step(dt, inp){
  if (S.crashT > 0){ S.crashT -= dt;
    S.speed *= Math.pow(0.2,dt); S.x += -Math.sin(S.yaw)*S.speed*dt; S.z += -Math.cos(S.yaw)*S.speed*dt; S.y = groundH(S.x,S.z);
    S.lean = THREE.MathUtils.lerp(S.lean, 1.4, dt*4);
    if (S.crashT <= 0 && S.state==='riding') placeOnTrail(Math.max(8,-S.z-5));
    return; }
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
  const d = -S.z, u = S.x - cx(d), onTrail = Math.abs(u) <= W+0.3;
  if (!S.air){
    // slope along heading
    const h0 = groundH(S.x,S.z), h1 = groundH(S.x+fx*0.5, S.z+fz*0.5);
    const slope = (h1-h0)/0.5;
    let a = -G*slope/Math.sqrt(1+slope*slope);
    a += inp.pedal * (S.speed < 12 ? 6 : 6*12/S.speed);
    a -= inp.brake * 11 * Math.min(1,S.speed);
    a -= 0.0045*S.speed*S.speed + 0.25;
    if (!onTrail) a -= 0.35*S.speed + 1.5;
    S.speed = Math.max(0, S.speed + a*dt);
    const turn = 1.9 * Math.min(1, 0.25 + S.speed/8) / (1 + S.speed*0.03);
    S.yaw -= inp.steer * turn * dt;
    S.lean = THREE.MathUtils.lerp(S.lean, inp.steer*Math.min(0.55, S.speed*0.04), Math.min(1,dt*6));
    S.vx = -Math.sin(S.yaw)*S.speed; S.vz = -Math.cos(S.yaw)*S.speed;
    // preload / pop
    if (inp.jump) S.preload = Math.min(1, S.preload + dt*1.8);
    const nx = S.x + S.vx*dt, nz = S.z + S.vz*dt, ng = groundH(nx,nz);
    const vyG = (ng - S.y)/dt;
    let pop = 0;
    if (!inp.jump && S.preload > 0.05){ pop = 2.5 + S.preload*4.5; S.preload = 0; }
    else if (!inp.jump) S.preload = 0;
    S.gf = (S.gf||0) + 1;
    const crest = S.gf > 3 && (S.lastVyG - vyG)/dt > G*1.15 && S.speed > 6;
    if (pop > 0 || crest){
      S.air = true; S.airT = 0; if(window.__dbg) console.log('takeoff', (-S.z).toFixed(1), (S.x-cx(-S.z)).toFixed(2), pop>0?'pop':'crest', S.lastVyG.toFixed(2), vyG.toFixed(2)); S.vy = S.lastVyG + pop; S.takeoffPitch = S.pitch; S.spin = 0;
      S.x = nx; S.z = nz; S.y += S.vy*dt;
    } else { S.x = nx; S.z = nz; S.y = ng; S.vy = vyG; S.lastVyG = vyG;
      S.pitch = THREE.MathUtils.lerp(S.pitch, Math.atan(slope), Math.min(1,dt*12)); }
    // trees
    if (S.speed > 4) for (const t of nearTrees(d)) if ((t.x-S.x)**2 + (t.z-S.z)**2 < 0.55) { crash('Hit a tree!'); return; }
  } else {
    S.airT += dt; S.vy -= G*dt;
    S.x += S.vx*dt; S.z += S.vz*dt; S.y += S.vy*dt;
    let tx = inp.tx, ty = inp.ty;
    const spinIn = tx || inp.steer*0.4;
    S.spin += spinIn * 6.5 * dt;
    S.pitch += ty * 5.5 * dt;
    S.lean = THREE.MathUtils.lerp(S.lean, 0, dt*3);
    const gh = groundH(S.x,S.z), gs = (groundH(S.x+S.vx*0.05, S.z+S.vz*0.05)-gh)/(Math.hypot(S.vx,S.vz)*0.05+1e-3);
    const gp = Math.atan(gs);
    if (Math.abs(ty) < 0.2){ const e = wrapA(S.pitch-gp); if (Math.abs(e) < 1.3) S.pitch -= e*Math.min(1,dt*2.5); }
    if (Math.abs(spinIn) < 0.45){ const e = wrapA(S.spin); if (Math.abs(e) < 1.0) S.spin -= e*Math.min(1,dt*4); }
    if (S.y <= gh){ land(gh, gp); }
  }
  S.time += dt;
  if (-S.z >= LENGTH && S.state==='riding'){ S.state='finished'; flash('FINISH!',3);
    setTimeout(()=>showOverlay('FINISH!', `Time ${fmtTime(S.time)} &nbsp; Rep ${S.score}<br>Clean landings ${S.clean} · Best air ${S.bestAir.toFixed(1)}s<br>Press <b>A</b> / <b>Enter</b> to ride again`), 1500); }
}
function land(gh, gp){
  S.y = gh; S.air = false;
  const pe = wrapA(S.pitch - gp), se = wrapA(S.spin);
  const flips = Math.round((S.pitch - S.takeoffPitch)/(Math.PI*2)), spins = Math.round(S.spin/(Math.PI*2));
  // keep horizontal momentum, lose some on impact
  const hs = Math.hypot(S.vx,S.vz); S.speed = hs*0.95;
  S.lastVyG = 0; S.gf = 0;
  if (Math.abs(pe) > 0.75 || Math.abs(se) > 0.85){ crash(Math.abs(se)>0.85 ? 'Landed sideways!' : 'Over the bars!'); return; }
  if (S.vy < -24){ crash('Too hard a landing!'); return; }
  S.pitch = gp; S.spin = 0;
  if (S.airT > 0.35){
    const parts = []; let pts = Math.round(S.airT*120);
    if (flips){ parts.push((Math.abs(flips)>1? `${Math.abs(flips)}x `:'') + (flips<0?'Frontflip':'Backflip')); pts += 600*Math.abs(flips); S.flips += Math.abs(flips); }
    if (spins){ parts.push(`${Math.abs(spins)*360}`); pts += 350*Math.abs(spins); S.spins += Math.abs(spins); }
    parts.push(`${S.airT.toFixed(1)}s air`);
    if (Math.abs(pe) < 0.2 && Math.abs(se) < 0.2){ parts.push('Perfect!'); pts = Math.round(pts*1.25); }
    S.score += pts; S.clean++; S.totalAir += S.airT; S.bestAir = Math.max(S.bestAir, S.airT);
    trickEl.textContent = parts.join(' + ') + `  +${pts}`; S.trickMsgT = 2.5;
  }
}
function nearTrees(d){ // binary search window
  let lo=0, hi=trees.length; while(lo<hi){ const m=(lo+hi)>>1; if(trees[m].d < d-3) lo=m+1; else hi=m; }
  const out=[]; for(let i=lo;i<trees.length && trees[i].d<d+3;i++) out.push(trees[i]); return out;
}
const fmtTime = t => `${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;

// ---------- Main loop ----------
placeOnTrail(8);
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camInit = false;
const clock = new THREE.Clock(); let acc = 0;
const arc = $('speedArc'), arcLen = arc.getTotalLength();
let fpsT=0, fpsN=0;
function frame(){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const inp = readInput();
  for (const k in inp.pressed) onPress(k);
  if (S.state==='riding' && !S.paused){
    acc += dt; const h = 1/120; while (acc >= h){ step(h, inp); acc -= h; }
  } else if (S.state!=='riding' && S.state!=='menu') { step(dt, {steer:0,pedal:0,brake:1,jump:false,tx:0,ty:0}); }
  // pose bike
  bike.position.set(S.x, S.y, S.z);
  bike.rotation.y = S.yaw + S.spin;
  pitchG.rotation.x = S.pitch; leanG.rotation.z = -S.lean;
  rig.position.y = -S.preload*0.12; rig.scale.y = 1 - S.preload*0.08;
  for (const w of wheels) w.rotation.x -= S.speed*dt/0.36;
  // camera
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
  const back = 5.2 + S.speed*0.04;
  const tp = new THREE.Vector3(S.x - fx*back, 0, S.z - fz*back);
  tp.y = Math.max(groundH(tp.x,tp.z), S.y) + 2.3;
  const tl = new THREE.Vector3(S.x + fx*4, S.y + 1.0, S.z + fz*4);
  if (!camInit || camPos.distanceTo(tp) > 40){ camPos.copy(tp); camLook.copy(tl); camInit = true; }
  const k = 1 - Math.exp(-dt*6);
  camPos.lerp(tp, k); camLook.lerp(tl, 1 - Math.exp(-dt*10));
  camera.position.copy(camPos); camera.lookAt(camLook);
  mountains.position.set(camera.position.x, S.y*0.85, camera.position.z);
  skyDome.position.copy(camera.position);
  sun.position.set(S.x+30, S.y+60, S.z+20); sun.target.position.set(S.x, S.y, S.z-10);
  renderer.render(scene, camera);
  // HUD
  const kmh = S.speed*3.6; S.maxKmh = Math.max(S.maxKmh, kmh);
  $('speedVal').textContent = Math.round(kmh);
  arc.style.strokeDasharray = `${Math.min(1,kmh/90)*arcLen} 1000`;
  $('airVal').textContent = (S.air ? S.airT : 0).toFixed(1)+'s';
  $('airBest').textContent = `best ${S.bestAir.toFixed(1)}s`;
  $('scoreVal').textContent = S.score.toLocaleString();
  $('livesVal').textContent = S.lives>0 ? '♥ '.repeat(S.lives).trim() : '—';
  $('timer').textContent = fmtTime(S.time);
  $('progressBar').style.width = Math.min(100, Math.max(0,-S.z/LENGTH*100)) + '%';
  while (objI < objectives.length && objectives[objI].val() >= objectives[objI].n){ objI++; if (objI<objectives.length) toast('✔ Objective complete!'); }
  if (objI < objectives.length){ const o = objectives[objI]; $('objText').textContent = o.n>1 && o.text.includes('km/h') ? `${o.text} ${Math.min(o.val(),o.n)}/${o.n}` : `${o.text} ${Math.min(o.val(),o.n)}/${o.n}`; }
  else $('objText').textContent = 'All objectives complete!';
  if (S.trickMsgT > 0){ S.trickMsgT -= dt; if (S.trickMsgT<=0) trickEl.textContent=''; }
  if (S.flashT > 0){ S.flashT -= dt; if (S.flashT<=0) centerEl.textContent=''; }
  fpsN++; fpsT+=dt; if (fpsT>1){ window.__fps = fpsN/fpsT; fpsN=0; fpsT=0; }
}
window.__game = S;
window.__sim = (secs, inp) => { const h=1/120; const base={steer:0,pedal:0,brake:0,jump:false,tx:0,ty:0}; for(let t=0;t<secs;t+=h) step(h, Object.assign({}, base, typeof inp==='function'?inp(t):inp)); return {d:-S.z, kmh:S.speed*3.6, air:S.air, lives:S.lives, clean:S.clean, score:S.score, u:S.x-cx(-S.z)}; };
frame();
