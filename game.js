import * as THREE from 'three';
import { buildBikeRider } from './rider.js';
import { DIFF, W, HALF, PARK, trails, features, spots, groundH, terrainH, featH, featAxis, base, isDirt, inPark, nearTrails, nearTrees, treesInCell, TCELL, LIFTS, connectors, CW, SHOP } from './world.js';

const G = 9.81;
// ---------- bikes (shop) ----------
const BIKES = [
  {id:'hardtail', name:'Starter Hardtail', price:0,    color:0xff2fa8, scale:[1,1,1],       drag:1.00, grip:1.00, pop:1.00, stab:1.00, desc:'The bike you know. Balanced.'},
  {id:'trail',    name:'Trail Bike',       price:800,  color:0x2f8cff, scale:[1,1,1.04],    drag:0.94, grip:1.06, pop:1.03, stab:1.05, desc:'A bit faster and grippier everywhere.'},
  {id:'dj',       name:'Dirt Jumper',      price:1500, color:0x22c55e, scale:[0.92,0.9,0.9],drag:1.05, grip:1.00, pop:1.22, stab:1.08, desc:'Small and poppy. Big bunny hops, slower top speed.'},
  {id:'enduro',   name:'Enduro Bike',      price:2500, color:0xff7a12, scale:[1,1.03,1.08], drag:0.88, grip:1.12, pop:1.05, stab:1.12, desc:'Fast and planted on rough descents.'},
  {id:'dh',       name:'DH Bike',          price:4000, color:0x222222, scale:[1.05,1.06,1.14],drag:0.80, grip:1.18, pop:0.95, stab:1.20, desc:'Fastest downhill, most stable landings, least pop.'},
];
const LS = { get:(k,d)=>{ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } }, set:(k,v)=>{ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
const owned = new Set(LS.get('trailDescent.owned', ['hardtail'])); owned.add('hardtail');
let BIKE = BIKES.find(b => b.id === LS.get('trailDescent.bike', 'hardtail') && owned.has(b.id)) || BIKES[0];
const EARN = 0.15;   // DOLLAHS earn rate vs. the old REP values (~15%)
const G_AIR = 9.81*1.35;   // heavier feel in the air: realistic MTB airtime (~0.6-1.0 s off a kicker at 30 km/h)
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
scene.fog = new THREE.Fog(0xbcd6e2, 200, 3800);   // fog fades into the sky's horizon colour
const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, 0.1, 6000);
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a6030, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera, {left:-35,right:35,top:35,bottom:-35,near:1,far:150});
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;   // no shadow acne / striping on the dirt
scene.add(sun, sun.target);

// sky gradient dome
{ const g = new THREE.SphereGeometry(4000, 24, 12);
  const m = new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, fog:false,
    vertexShader:`varying vec3 p; void main(){p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 p; void main(){float h=normalize(p).y; vec3 c=mix(vec3(.737,.839,.886),vec3(.35,.6,.88),pow(clamp(h*1.6,0.,1.),0.8)); gl_FragColor=vec4(c,1.);}`});
  var skyDome = new THREE.Mesh(g, m); skyDome.renderOrder = -1; scene.add(skyDome); }

// distant mountains (follow camera horizontally)
const mountains = new THREE.Group(); mountains.visible = false;   // replaced by real distant terrain
{ const mat = new THREE.MeshLambertMaterial({color:0x6f8aa3, flatShading:true, fog:false});
  const snow = new THREE.MeshLambertMaterial({color:0xeef3f7, flatShading:true, fog:false});
  for (let i=0;i<46;i++){ const a = i/46*Math.PI*2 + rnd()*0.1, r = 2300+rnd()*500, hgt = 300+rnd()*500;
    const m = new THREE.Mesh(new THREE.ConeGeometry(380+rnd()*300, hgt, 6+Math.floor(rnd()*3)), mat);
    m.position.set(Math.cos(a)*r, hgt/2-160, Math.sin(a)*r); m.rotation.y = rnd()*3; mountains.add(m);
    if (hgt > 560){ const c = new THREE.Mesh(new THREE.ConeGeometry(m.geometry.parameters.radius*0.25, hgt*0.25, 6), snow); c.position.copy(m.position); c.position.y += hgt*0.38; mountains.add(c);} }
  scene.add(mountains); }

// ---------- Open world: streamed terrain chunks ----------
const CH = TCELL, RES = 2, NV = CH/RES + 1, LOAD_R = 420, UNLOAD_R = 560;
const terrainMat = new THREE.MeshLambertMaterial({vertexColors:true});
const chunkIndex = (() => { const idx = []; for (let r=0;r<NV-1;r++) for (let k=0;k<NV-1;k++){ const a=r*NV+k, b=a+1, e=a+NV, f=e+1; idx.push(a,e,b, b,e,f); } return new THREE.BufferAttribute(new Uint32Array(idx),1); })();
const C_DIRT = new THREE.Color(0x8a6640), C_DIRT2 = new THREE.Color(0x6e4f30), C_GRASS = new THREE.Color(0x5d8a32), C_GRASS2 = new THREE.Color(0x7aa040),
      C_ROCK = new THREE.Color(0x857d72), C_SNOW = new THREE.Color(0xe9eef2), C_ALP = new THREE.Color(0x8c9a5a);
function groundColor(x, z, h, ny, dirt, c){
  const n = 0.5+0.5*Math.sin(x*0.7+z*0.3)*Math.cos(z*0.5);
  if (dirt) return c.copy(C_DIRT).lerp(C_DIRT2, n*0.7);
  const m = 0.5+0.5*Math.sin(x*0.013+Math.cos(z*0.011)*2)*Math.cos(z*0.017);
  c.copy(C_GRASS).lerp(C_GRASS2, n*0.5 + m*0.5);
  if (h > 210) c.lerp(C_ALP, Math.min(1,(h-210)/60));
  if (ny < 0.86) c.lerp(C_ROCK, Math.min(1, (0.86-ny)/0.12));
  if (h > 328 && ny > 0.8) c.lerp(C_SNOW, Math.min(0.8, (h-328)/18));
  return c;
}
// shared tree / grass geometry
const trunkG = new THREE.CylinderGeometry(0.18,0.32,1,6); trunkG.translate(0,0.5,0);
const coneG = new THREE.ConeGeometry(1,1,7); coneG.translate(0,0.5,0);
const trunkMat = new THREE.MeshLambertMaterial({color:0x5a3d26}), folMat = new THREE.MeshLambertMaterial({color:0xffffff});
const tuftG = new THREE.ConeGeometry(0.12,0.6,3); tuftG.translate(0,0.3,0);
const tuftMat = new THREE.MeshLambertMaterial({color:0xffffff});
const chunks = new Map();
const ckey = (i,j) => i+','+j;
function buildChunk(ci, cj){
  const x0 = ci*CH, z0 = cj*CH, grp = new THREE.Group();
  const E = NV+2, hs = new Float32Array(E*E);
  for (let r=0;r<E;r++) for (let k=0;k<E;k++) hs[r*E+k] = terrainH(x0+(k-1)*RES, z0+(r-1)*RES);
  const pos = new Float32Array(NV*NV*3), col = new Float32Array(NV*NV*3), nrm = new Float32Array(NV*NV*3), c = new THREE.Color();
  for (let r=0;r<NV;r++) for (let k=0;k<NV;k++){
    const i = r*NV+k, x = x0+k*RES, z = z0+r*RES, h = hs[(r+1)*E+k+1];
    const dx = hs[(r+1)*E+k+2]-hs[(r+1)*E+k], dz = hs[(r+2)*E+k+1]-hs[r*E+k+1], nl = Math.hypot(dx, 2*RES, dz);
    nrm[i*3] = -dx/nl; nrm[i*3+1] = 2*RES/nl; nrm[i*3+2] = -dz/nl;
    pos[i*3] = k*RES; pos[i*3+1] = h; pos[i*3+2] = r*RES;
    groundColor(x, z, h, 2*RES/nl, isDirt(x,z), c); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm,3)); g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.setIndex(chunkIndex); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, terrainMat); m.position.set(x0, 0, z0); m.receiveShadow = true; grp.add(m);
  // trees
  const ts = treesInCell(ci, cj);
  if (ts.length){
    const trunk = new THREE.InstancedMesh(trunkG, trunkMat, ts.length), f1 = new THREE.InstancedMesh(coneG, folMat, ts.length), f2 = new THREE.InstancedMesh(coneG, folMat, ts.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
    ts.forEach((t, i) => { const h = t.h, rr = h*0.19; q.setFromAxisAngle(up, t.rot);
      M.compose(p.set(t.x,t.y,t.z), q, s.set(1,h*0.45,1)); trunk.setMatrixAt(i,M);
      M.compose(p.set(t.x,t.y+h*0.25,t.z), q, s.set(rr,h*0.55,rr)); f1.setMatrixAt(i,M);
      M.compose(p.set(t.x,t.y+h*0.55,t.z), q, s.set(rr*0.7,h*0.45,rr*0.7)); f2.setMatrixAt(i,M);
      c.setHSL(0.28+t.hue*0.06, 0.45, 0.16+((t.hue*7)%1)*0.08); f1.setColorAt(i,c); c.offsetHSL(0,0,0.03); f2.setColorAt(i,c); });
    for (const im of [trunk,f1,f2]){ im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im); }
  }
  // grass tufts
  { const r = (() => { let a = (ci*73856093 ^ cj*19349663) >>> 0 || 1; return () => (a = (a*16807) % 2147483647) / 2147483647; })();
    const N = 260, tf = new THREE.InstancedMesh(tuftG, tuftMat, N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(); let n = 0;
    for (let i=0;i<N;i++){ const x = x0+r()*CH, z = z0+r()*CH; const h = terrainH(x,z); if (h > 300 || isDirt(x,z) || featH(x,z) > 0) continue;
      q.setFromAxisAngle(new THREE.Vector3(r()-.5,1,r()-.5).normalize(), r()*0.4); const sc = 0.6+r()*1.2;
      M.compose(p.set(x,h,z), q, s.set(sc,sc,sc)); tf.setMatrixAt(n,M); c.setHSL(0.22+r()*0.08,0.55,0.3+r()*0.15); tf.setColorAt(n++,c); }
    tf.count = n; if (n){ tf.computeBoundingSphere(); grp.add(tf); } }
  scene.add(grp); chunks.set(ckey(ci,cj), {grp, ci, cj});
}
function disposeChunk(k){ const ch = chunks.get(k); scene.remove(ch.grp);
  ch.grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.isMesh) o.geometry.dispose(); }); chunks.delete(k); }
let coveredR = 0;
function updateChunks(px, pz, budgetMs = 6, maxR = LOAD_R){
  const t0 = performance.now(), need = [];
  const R = Math.ceil(maxR/CH), pi = Math.floor(px/CH), pj = Math.floor(pz/CH);
  for (let i=pi-R;i<=pi+R;i++) for (let j=pj-R;j<=pj+R;j++){
    if (i*CH > HALF+CH || (i+1)*CH < -HALF-CH || j*CH > HALF+CH || (j+1)*CH < -HALF-CH) continue;
    const dx = Math.max(i*CH-px, 0, px-(i+1)*CH), dz = Math.max(j*CH-pz, 0, pz-(j+1)*CH), d = Math.hypot(dx,dz);
    if (d <= maxR && !chunks.has(ckey(i,j))) need.push([d,i,j]); }
  need.sort((a,b)=>a[0]-b[0]);
  let minMissing = maxR;
  for (const [d,i,j] of need){ if (performance.now()-t0 > budgetMs && d > 0){ minMissing = Math.min(minMissing, d); break; } buildChunk(i,j); }
  coveredR = Math.max(0, minMissing - 2);
  for (const [k,ch] of chunks){ const dx = Math.max(ch.ci*CH-px, 0, px-(ch.ci+1)*CH), dz = Math.max(ch.cj*CH-pz, 0, pz-(ch.cj+1)*CH); if (Math.hypot(dx,dz) > UNLOAD_R) disposeChunk(k); }
}
// low-detail terrain for the whole map, hidden wherever detailed chunks are loaded
const farU = { value: new THREE.Vector3(0,0,0) };
{ const FAR = 4200, S = 40, N = Math.round(2*FAR/S)+1, pos = new Float32Array(N*N*3), col = new Float32Array(N*N*3), c = new THREE.Color(), idx = [];
  for (let r=0;r<N;r++) for (let k=0;k<N;k++){ const x = -FAR+k*S, z = -FAR+r*S, h = terrainH(x,z), i = (r*N+k)*3;
    const dx = terrainH(x+S,z)-terrainH(x-S,z), dz = terrainH(x,z+S)-terrainH(x,z-S), ny = 2*S/Math.hypot(dx,2*S,dz);
    pos[i]=x; pos[i+1]=h-0.6; pos[i+2]=z; groundColor(x,z,h,ny,false,c); col[i]=c.r; col[i+1]=c.g; col[i+2]=c.b; }
  for (let r=0;r<N-1;r++) for (let k=0;k<N-1;k++){ const a=r*N+k, b=a+1, e=a+N, f=e+1; idx.push(a,e,b, b,e,f); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setAttribute('color', new THREE.BufferAttribute(col,3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({vertexColors:true});
  mat.onBeforeCompile = sh => { sh.uniforms.uFar = farU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;').replace('#include <project_vertex>', '#include <project_vertex>\nvWXZ = (modelMatrix*vec4(transformed,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ; uniform vec3 uFar;').replace('void main() {', 'void main() {\nif (distance(vWXZ, uFar.xy) < uFar.z) discard;'); };
  const far = new THREE.Mesh(g, mat); far.frustumCulled = false; scene.add(far); }

// ---------- features: wooden kickers/drops and dirt jumps (merged meshes) ----------
{ const plankTex = (() => { const cv = document.createElement('canvas'); cv.width=64; cv.height=64; const x = cv.getContext('2d');
    x.fillStyle='#b98450'; x.fillRect(0,0,64,64); x.fillStyle='#7a5230'; for(let i=0;i<64;i+=8) x.fillRect(0,i,64,1.5);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const woodMat = new THREE.MeshStandardMaterial({map:plankTex, roughness:0.9, flatShading:true, side:THREE.DoubleSide});
  const dirtMat = new THREE.MeshLambertMaterial({vertexColors:true, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-2});
  // height of the rendered terrain mesh itself (same 2 m grid and triangle split as the chunks), so jumps sit exactly on it with no z-fighting
  const meshH = (x, z) => { const k = Math.floor(x/RES), r = Math.floor(z/RES), fx = x/RES-k, fz = z/RES-r;
    const ha = terrainH(k*RES, r*RES), hb = terrainH((k+1)*RES, r*RES), he = terrainH(k*RES, (r+1)*RES);
    if (fx + fz <= 1) return ha + (hb-ha)*fx + (he-ha)*fz;
    const hf = terrainH((k+1)*RES, (r+1)*RES); return hf + (he-hf)*(1-fx) + (hb-hf)*(1-fz); };
  const wv=[], wuv=[], wi=[], dv=[], dc=[], di=[]; const c = new THREE.Color();
  for (const f of features){
    const at = (t,u) => [f.x + f.dx*t + f.dz*u, f.z + f.dz*t - f.dx*u];
    if (f.wood){
      const N = Math.max(8, Math.ceil(f.L/0.5)), b0 = wv.length/3, P = (t,u,top) => { const [x,z] = at(t,u), h = terrainH(x,z); wv.push(x, top ? h+f.p(Math.min(t,f.L-1e-3))+0.02 : h-0.3, z); wuv.push(u*0.5, t*0.8); return wv.length/3-1; };
      const tl=[], tr=[], bl=[], br=[];
      for (let i=0;i<=N;i++){ const t = i/N*f.L; tl.push(P(t,-f.hw,1)); tr.push(P(t,f.hw,1)); bl.push(P(t,-f.hw,0)); br.push(P(t,f.hw,0)); }
      for (let i=0;i<N;i++){ wi.push(tl[i],tr[i],tl[i+1], tr[i],tr[i+1],tl[i+1], bl[i],tl[i],bl[i+1], tl[i],tl[i+1],bl[i+1], tr[i],br[i],br[i+1], tr[i],br[i+1],tr[i+1]); }
      wi.push(tl[N],tr[N],bl[N], tr[N],br[N],bl[N]);
    } else {
      const NT = Math.ceil(f.L/0.4), UW = f.hw+1.3, NU = Math.ceil(2*UW/0.4), b0 = dv.length/3;
      for (let i=0;i<=NT;i++) for (let k=0;k<=NU;k++){ const t = i/NT*f.L, u = -UW + k/NU*2*UW, [x,z] = at(t,u), fh = featH(x,z);
        const edge = k === 0 || k === NU || i === 0 || i === NT;      // outer rim tucks just under the ground
        dv.push(x, meshH(x,z) + fh + (edge ? -0.04 : 0.02), z);
        c.copy(C_DIRT).lerp(C_DIRT2, 0.3 + 0.4*Math.sin(t*1.7+u)*Math.sin(u*2.1)); if (f.rock && fh > 0.06) c.copy(C_ROCK).lerp(C_DIRT2, 0.2+0.3*Math.sin(t*3.1+u*2.7)); if (f.road && fh < 0.05 && Math.abs(u) < f.hw+0.6) c.setRGB(0.16,0.16,0.17); /* road in the gap */ if (fh < 0.05) c.lerp(C_GRASS, 0.0); dc.push(c.r,c.g,c.b); }
      // wind triangles so faces point up (correct normals -> no black sides)
      const up = (() => { const [x0,z0] = at(0,-UW), [x1,z1] = at(0,UW), [x2,z2] = at(1,-UW); return ((x1-x0)*(z2-z0) - (z1-z0)*(x2-x0)) < 0; })();
      for (let i=0;i<NT;i++) for (let k=0;k<NU;k++){ const a = b0+i*(NU+1)+k, b = a+1, e = a+NU+1, g = e+1; if (up) di.push(a,b,e, b,g,e); else di.push(a,e,b, b,e,g); }
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wv,3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv,2)); wg.setIndex(wi); wg.computeVertexNormals();
  const wm = new THREE.Mesh(wg, woodMat); wm.castShadow = wm.receiveShadow = true; scene.add(wm);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dv,3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(dc,3)); dg.setIndex(di); dg.computeVertexNormals();
  const dm = new THREE.Mesh(dg, dirtMat); dm.castShadow = dm.receiveShadow = true; scene.add(dm); }

// ---------- trail markers, start/finish banners ----------
{ const poleG = new THREE.CylinderGeometry(0.06,0.06,1.3,6); poleG.translate(0,0.65,0);
  let total = 0; for (const tr of trails) total += 2*Math.ceil(tr.pts.length/8);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({color:0xffffff}), total), M = new THREE.Matrix4(), c = new THREE.Color(); let n = 0;
  for (const tr of trails){ c.set(tr.color);
    for (let i=4;i<tr.pts.length;i+=8) for (const side of [-1,1]){ const yw = tr.yaw[i], x = tr.pts[i][0] + Math.cos(yw)*side*(W+0.9), z = tr.pts[i][1] - Math.sin(yw)*side*(W+0.9);
      M.makeTranslation(x, terrainH(x,z), z); poles.setMatrixAt(n, M); poles.setColorAt(n++, c); } }
  poles.count = n; poles.computeBoundingSphere(); scene.add(poles);
  const banner = (x, z, yaw, color, label, half = W+1, sub = null) => { const grp = new THREE.Group(), pm = new THREE.MeshLambertMaterial({color:0x333333});
    for (const s of [-1,1]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.25,4.5,0.25),pm); p.position.set(s*half,2.25,0); grp.add(p); }
    const cv = document.createElement('canvas'); cv.width=512; cv.height=96; const cx2 = cv.getContext('2d'); cx2.fillStyle=color; cx2.fillRect(0,0,512,96);
    cx2.fillStyle='#fff'; cx2.textAlign='center';
    if (sub){ cx2.font='bold 40px Arial'; cx2.fillText(label,256,42,490); cx2.font='bold 28px Arial'; cx2.fillText(sub,256,84,490); }
    else { cx2.font='bold 52px Arial'; cx2.fillText(label,256,68,490); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2*half,1.2), new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide})); b.position.y=4; grp.add(b);
    grp.position.set(x, terrainH(x,z), z); grp.rotation.y = yaw; scene.add(grp); };
  for (const tr of trails){ const i0 = 1, i1 = tr.pts.length-3;
    banner(tr.pts[i0][0], tr.pts[i0][1], tr.yaw[i0], tr.color === '#111111' ? '#333' : tr.color, 'START · ' + tr.name.toUpperCase(), W+1, `${DIFF[tr.diff].icon} ${DIFF[tr.diff].label.toUpperCase()} · ${tr.type.toUpperCase()}`);
    banner(tr.pts[i1][0], tr.pts[i1][1], tr.yaw[i1], '#1c9c3a', 'FINISH · ' + tr.name.toUpperCase()); }
  for (const tr of trails) tr.cps.forEach((cp, k) => banner(cp.x, cp.z, cp.yaw, '#f2b800', `CHECKPOINT ${k+1}/${tr.cps.length}`, W+1, tr.name.toUpperCase()));
  const pyaw = Math.atan2(-PARK.dir[0], -PARK.dir[1]);
  banner(PARK.x - PARK.dir[0]*(PARK.r-12), PARK.z - PARK.dir[1]*(PARK.r-12), pyaw, '#ff7a00', 'DIRT JUMP PARK', 42, `${DIFF.pro.icon} PRO LINE · DIRT JUMP`); }
// ---------- Bike + rider ----------
const frameMat = new THREE.MeshStandardMaterial({color:0xff2fa8, roughness:0.4, metalness:0.3});
const bike = new THREE.Group();          // position + heading yaw (+ spin)
const pitchG = new THREE.Group(); bike.add(pitchG);
const leanG = new THREE.Group(); pitchG.add(leanG);
const rig = new THREE.Group(); leanG.add(rig);        // preload compression
const BR = buildBikeRider(frameMat); rig.add(BR.root); const wheels = BR.wheels;   // detailed procedural bike + skeletal rider (rider.js)
scene.add(bike);
bike.traverse(o=>{ if(o.isMesh) o.castShadow=true; });

// ---------- Input ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code]=true; if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); onPress(e.code); });
addEventListener('keyup', e => { keys[e.code]=false; });
const toastEl = document.getElementById('toast'); let toastT;
function toast(msg){ toastEl.textContent = msg; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(()=>toastEl.style.opacity=0, 2500); }
addEventListener('gamepadconnected', e => { knownPads[e.gamepad.index]=true; toast('🎮 Controller connected: ' + e.gamepad.id.slice(0,40)); });
addEventListener('gamepaddisconnected', e => { delete knownPads[e.gamepad.index]; toast('Controller disconnected'); });
setTimeout(()=>{ if (!Object.keys(knownPads).length) toast(window.isSecureContext ? '🎮 Using a controller? Press any button on it to connect' : 'Controllers need https (or localhost)'); }, 800);
const dz = (v, z=0.15) => Math.abs(v)<z ? 0 : (v - Math.sign(v)*z)/(1-z);
let prevBtn = {};
const knownPads = {};
// Gamepad mapping. Chrome/Edge report mapping==='standard' for Xbox pads.
// Firefox (esp. Windows) often reports an Xbox One pad with mapping '' in XInput order:
// axes 0,1 left stick; 2 LT; 3,4 right stick; 5 RT (triggers rest at -1, full at +1, sometimes 0 until first touched);
// buttons 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 View/Back, 7 Menu/Start, 8 LS, 9 RS.
const trigSeenNeg = {};
function trigAxis(gp, i){ const v = gp.axes[i]; if (v === undefined) return 0; const k = gp.index+'_'+i;
  if (v < -0.05) trigSeenNeg[k] = true;
  const t = trigSeenNeg[k] ? (v+1)/2 : v; return t < 0.04 ? 0 : Math.min(1, t); }
// D-pad on non-standard layouts: a hat on axes 6/7 (Firefox on Linux/macOS), a single POV-hat axis (axis 9, DirectInput),
// or plain buttons (the given left/right indices) when the pad has that many buttons.
function dpadNS(gp, bv, li, ri){
  let l = false, r = false;
  if (gp.axes.length >= 8){ const h = gp.axes[6] || 0; if (h < -0.5) l = true; if (h > 0.5) r = true; }
  if (gp.axes.length >= 10){ const p = gp.axes[9]; if (p !== undefined && p >= -1.05 && p <= 1.05 && Math.abs(p) > 0.05){ const dir = Math.round((p+1)/(2/7));   // 0 up .. 7 up-left
      if (dir >= 1 && dir <= 3) r = true; if (dir >= 5 && dir <= 7) l = true; } }
  if (gp.buttons.length > ri){ if (bv(li) > 0.5) l = true; if (bv(ri) > 0.5) r = true; }
  return {DL:l, DR:r};
}
function padMap(gp){
  const bv = i => { const b = gp.buttons[i]; if (!b) return 0; if (typeof b !== 'object') return b; return (b.pressed && !b.value) ? 1 : b.value; };
  const ax = i => gp.axes[i] || 0;
  if (gp.mapping === 'standard'){
    return { lx:ax(0), rx:ax(2), ry:ax(3), lt:bv(6), rt:bv(7),
      ly:ax(1), btn:{A:bv(0)>0.5, B:bv(1)>0.5, X:bv(2)>0.5, Y:bv(3)>0.5, LB:bv(4)>0.5, RS:bv(11)>0.5, Back:bv(8)>0.5, Start:bv(9)>0.5, DL:bv(14)>0.5, DR:bv(15)>0.5, DU:bv(12)>0.5, DD:bv(13)>0.5} };
  }
  if (gp.axes.length >= 6){   // Firefox XInput-style: triggers on axes 2 & 5
    return { lx:ax(0), rx:ax(3), ry:ax(4), lt:trigAxis(gp,2), rt:trigAxis(gp,5),
      ly:ax(1), btn:{A:bv(0)>0.5, B:bv(1)>0.5, X:bv(2)>0.5, Y:bv(3)>0.5, LB:bv(4)>0.5, RS:bv(9)>0.5, Back:bv(6)>0.5, Start:bv(7)>0.5, ...dpadNS(gp, bv, 13, 14)} };
  }
  // other non-standard layouts: right stick on 2,3, triggers as buttons 6,7
  return { lx:ax(0), rx:ax(2), ry:ax(3), lt:Math.max(bv(6), 0), rt:Math.max(bv(7), 0),
    ly:ax(1), btn:{A:bv(0)>0.5, B:bv(1)>0.5, X:bv(2)>0.5, Y:bv(3)>0.5, LB:bv(4)>0.5, RS:bv(11)>0.5, Back:bv(8)>0.5, Start:bv(9)>0.5, ...dpadNS(gp, bv, 14, 15)} };
}

// Descenders default Xbox layout:
// LS steer (x) / lean fwd-back (y) · RT pedal · LT brake · RS down = pump/preload, RS down->up = bunny hop,
// RS up = counter-pump · RS left/right in air = tweak · LB + RS direction = trick · B respawn · Y switch camera
// X reset camera · Menu pause. (View toggles the help panel; A starts/restarts from menus.)
let kbSpacePrev = false;
function readInput(){
  const inp = {rsy:0, counter:false, steer:0, lean:0, pedal:0, brake:0, pumpHold:false, pop:false, tweak:0, trick:null, kbFlip:0, pressed:{}};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads){ if (!gp || !gp.connected) continue;
    if (!knownPads[gp.index]){ knownPads[gp.index]=true; toast('🎮 Controller connected: ' + gp.id.slice(0,40)); }
    const m = padMap(gp), rx = dz(m.rx), ry = dz(m.ry);
    inp.steer += dz(m.lx); inp.lean += dz(m.ly);
    inp.pedal = Math.max(inp.pedal, m.rt); inp.brake = Math.max(inp.brake, m.lt);
    if (m.btn.LB){ const mag = Math.hypot(rx,ry);   // LB + right stick: 8 directions (diagonals = tuck no-hander, X-up, nac-nac, tailwhip), RS click = barspin; stick amount = trick strength
      if (m.btn.RS){ inp.trick = 'bar'; inp.trickAmt = 1; }
      else if (mag > 0.35){ const sec = Math.round(Math.atan2(ry, rx)/(Math.PI/4)); inp.trick = {0:'right', 1:'dr', 2:'down', 3:'dl', 4:'left', '-4':'left', '-3':'ul', '-2':'up', '-1':'ur'}[sec]; inp.trickAmt = Math.min(1, (mag-0.35)/0.6); } }
    else { if (ry > 0.5) inp.pumpHold = true; if (ry < -0.5){ inp.pop = true; inp.counter = true; } inp.tweak = rx; inp.rsy = ry; }
    inp.dpx = (m.btn.DR?1:0) - (m.btn.DL?1:0); inp.dpy = (m.btn.DD?1:0) - (m.btn.DU?1:0); inp.lsx = dz(m.lx); inp.lsy = dz(m.ly);
    for (const name of ['A','B','X','Y','Start','Back','DL','DR','DU','DD']){ const now=!!m.btn[name], key=gp.index+'_'+name; if(now && !prevBtn[key]) inp.pressed[name]=true; prevBtn[key]=now; }
    break; }
  if (keys.KeyA||keys.ArrowLeft) inp.steer -= 1; if (keys.KeyD||keys.ArrowRight) inp.steer += 1;
  if (keys.KeyW||keys.ArrowUp) inp.pedal = 1; if (keys.KeyS||keys.ArrowDown) inp.brake = 1;
  if (keys.KeyI) inp.kbFlip -= 1; if (keys.KeyK) inp.kbFlip += 1;
  if (keys.KeyJ) inp.steer -= 1; if (keys.KeyL) inp.steer += 1;
  if (keys.ShiftLeft||keys.ShiftRight) inp.counter = true;
  if (keys.KeyQ) inp.tweak -= 1; if (keys.KeyE) inp.tweak += 1;
  if (keys.KeyC){ const u = keys.KeyI||keys.ArrowUp, d = keys.KeyK||keys.ArrowDown, l = keys.KeyJ||keys.ArrowLeft, r = keys.KeyL||keys.ArrowRight;
    const t = keys.KeyU ? 'bar' : u && l ? 'ul' : u && r ? 'ur' : d && l ? 'dl' : d && r ? 'dr' : u ? 'up' : d ? 'down' : l ? 'left' : r ? 'right' : null; if (t){ inp.trick = t; inp.trickAmt = 1; } }
  if (keys.Space) inp.pumpHold = true;
  if (!keys.Space && kbSpacePrev) inp.pop = true;
  kbSpacePrev = !!keys.Space;
  inp.steer = THREE.MathUtils.clamp(inp.steer,-1,1); inp.lean = THREE.MathUtils.clamp(inp.lean + inp.kbFlip,-1,1);
  inp.tweak = THREE.MathUtils.clamp(inp.tweak,-1,1);
  return inp;
}

// ---------- Game state ----------
const S = { x:0,y:0,z:0, yaw:0, speed:0, vy:0, vx:0, vz:0, air:false, airT:0, pitch:0, spin:0, takeoffPitch:0, lean:0,
  preload:0, lives:3, score:0, bestAir:0, totalAir:0, crashT:0, time:0, state:'menu', paused:false, lastVyG:0, trickMsgT:0,
  maxKmh:0, clean:0, spins:0, flips:0, finishes:0 };
const $ = id => document.getElementById(id);
const trickEl = $('trick'), centerEl = $('center');
function flash(msg, t=1.2){ centerEl.textContent = msg; S.flashT = t; }
function placeAt(x, z, yaw){
  S.x = x; S.z = z; S.y = groundH(S.x,S.z); S.yaw = yaw;
  S.speed = 0; S.vy = 0; S.air = false; S.travel = S.yaw; S.wYaw = S.wPitch = 0; S.nose = 0; S.susp = S.suspV = 0; S.pitch = 0; S.spin = 0; S.lean = 0; S.preload = 0; S.crashT = 0; S.tweak = 0; S.trick = null; S.landCool = 0.3;
}
function resetGame(){
  Object.assign(S,{lives:3,bestAir:0,totalAir:0,time:0,maxKmh:0,clean:0,spins:0,flips:0,finishes:0,parkClean:0,state:'riding',paused:false});
  teleport(spotI, true); $('overlay').classList.add('hidden'); setTimeout(()=>$('help').classList.add('hidden'), 12000);
}
function crash(reason){ S.lastCrash = reason;
  if (S.crashT>0) return;
  S.crashT = 2.0; S.air = false; trickEl.textContent = reason;
  // health only counts during a trail run; in free roam a crash just respawns you
  if (S.run){ S.lives--;
    if (S.lives <= 0){ const tr = trails[S.run.t]; S.failedRun = S.run.t; S.run = null; flash('RUN OVER', 2); toast(`💀 Out of health — ${tr.name} run ended. Back to the start.`); }
    else flash('BAIL!', 2); }
  else flash('BAIL!', 1.5);
}
function showOverlay(title,msg){ $('overlay').classList.remove('hidden'); $('overlayBox').querySelector('h1').textContent=title; $('overlayMsg').innerHTML=msg; }
function togglePause(){ if (S.state!=='riding' || shopOpen) return; S.paused=!S.paused; if (S.paused) showOverlay('PAUSED','Press <b>Menu</b> / <b>P</b> to resume<br><small>Press <b>X</b> / <b>O</b> for the 🚲 Bike Shop · <b>Y</b> / <b>H</b> controls help · <b>View</b> / <b>M</b> full map</small>'); else $('overlay').classList.add('hidden'); }
function onPress(code){
  if (S.lift){ if (code==='A'||code==='Enter'||code==='Space') S.lift.d = 1e9; return; }   // skip the chairlift ride
  if (shopOpen){ shopKey(code); return; }
  if (bigMap.open){ mapKey(code); return; }
  if ((code==='Back'||code==='KeyM') && S.state==='riding' && !S.lift){ openMap(); return; }
  if (code==='Y' && S.paused){ $('help').classList.toggle('hidden'); return; }   // help moved into the pause menu on the controller
  if ((code==='X'||code==='KeyO') && (S.state==='menu' || S.paused)){ openShop(); return; }
  if (code==='KeyO' && S.state==='riding'){ openShop(); return; }
  if (code==='Enter' || code==='A'){ if (S.state==='menu'||S.state==='over'||S.state==='finished'){ resetGame(); return; } }
  if (code==='Space' && (S.state==='menu'||S.state==='over'||S.state==='finished')) { resetGame(); return; }
  if (code==='KeyP'||code==='Escape'||code==='Start') togglePause();
  if (code==='KeyV'||code==='Y'){ camMode = (camMode+1)%3; toast(['Camera: chase','Camera: far','Camera: close'][camMode]); }
  if (code==='KeyX'||code==='X') camInit = false;
  if (code==='KeyH') $('help').classList.toggle('hidden');
  if ((code==='KeyR'||code==='B') && S.state==='riding' && !S.paused) { respawnSafe(); flash('RESPAWN',0.8); }
  // teleport between spots: D-pad ← → on the controller, [ ] / , . or 1-8 on the keyboard
  if (S.state==='riding' && !S.paused){
    if (code==='DL'||code==='BracketLeft'||code==='Comma') teleport(nextOpen(spotI,-1));
    if (code==='DR'||code==='BracketRight'||code==='Period') teleport(nextOpen(spotI,1));
    const m = /^Digit([0-9])$/.exec(code), num = m ? (+m[1]||10) + (keys.ShiftLeft||keys.ShiftRight ? 10 : 0) : 0; if (m && num <= spots.length){ const j = num-1; /* 1-9,0 = spots 1-10; Shift+1-5 = spots 11-15 */ if (isOpen(j)) teleport(j); else toast(`🔒 ${spots[j].name} is locked — finish ${spotTrail(j).name} once to unlock it`); }
  } else if (S.state==='menu' && (code==='DL'||code==='DR'||code==='BracketLeft'||code==='BracketRight')){
    spotI = nextOpen(spotI, code==='DL'||code==='BracketLeft' ? -1 : 1); $('overlayMsg').innerHTML = menuMsg(); }
}
let camMode = 0;
// ---------- open world: spots, safe respawn, trail runs ----------
// teleport unlocks: a trail's spot unlocks after you finish that trail once. Flow Line, the park and the meadow are always open.
const UKEY = 'trailDescent.unlocked';
const unlocked = new Set((() => { try { return JSON.parse(localStorage.getItem(UKEY) || '[]'); } catch(e){ return []; } })());
function saveUnlocks(){ try { localStorage.setItem(UKEY, JSON.stringify([...unlocked])); } catch(e){} }
const spotTrail = i => i < trails.length ? trails[i] : null;
const ALWAYS = new Set(['Flow Line']);
const isOpen = i => { const tr = spotTrail(i); return !tr || ALWAYS.has(tr.name) || unlocked.has(tr.name); };
const nextOpen = (from, dir) => { for (let k=1;k<=spots.length;k++){ const j = ((from + dir*k) % spots.length + spots.length) % spots.length; if (isOpen(j)) return j; } return from; };
let spotI = 1;   // spawn at Flow Line
const spotTag = i => { const tr = spots[i].trail !== undefined ? trails[spots[i].trail] : (spots[i].name.startsWith('Dirt') ? PARK : null); return tr ? ` ${DIFF[tr.diff].icon} ${DIFF[tr.diff].label} ${tr.type}` : ' free roam'; };
const menuMsg = () => `<small>Press <b>X</b> / <b>O</b> for the 🚲 Bike Shop · $${S.score.toLocaleString()} DOLLAHS</small><br>Press <b>A</b> / <b>Enter</b> to drop in at <b>${spots[spotI].name}</b> <small>(${spotTag(spotI).trim()})</small><br><small>D-pad ← → / [ ] to pick a spot</small>`;
function teleport(i, quiet){
  if (S.lift){ S.lift = null; $('liftRide').style.display = 'none'; myChair.visible = false; }
  spotI = (i + spots.length) % spots.length; const s = spots[spotI];
  updateChunks(s.x, s.z, 1e9, 160);      // build the ground around the spot right away
  placeAt(s.x, s.z, s.yaw); S.crumbs = []; S.crumbT = 0; S.run = null; camInit = false;
  if (!quiet){ flash(s.name, 1.6); } toast(`📍 ${spotI+1}/${spots.length} ${s.name} ·${spotTag(spotI)}  ·  ${spots.filter((_,j)=>isOpen(j)).length} spots unlocked  ·  D-pad ← → to teleport`);
}
const OOB = HALF - 60, inside = (x,z) => Math.max(Math.abs(x), Math.abs(z)) < OOB - 90;
function respawnSafe(){
  if (S.failedRun !== undefined && S.failedRun !== null){ const tr = trails[S.failedRun]; S.failedRun = null;   // failed run: back to just above that trail's START arch
    placeAt(tr.pts[0][0], tr.pts[0][1], tr.yaw[0]); S.crumbs = []; S.crumbT = 0; camInit = false; return; }
  if (S.run){ const tr = trails[S.run.t], cp = S.run.cp != null ? tr.cps[S.run.cp] : {x:tr.pts[3][0], z:tr.pts[3][1], yaw:tr.yaw[3]};   // run: last checkpoint (or the start), timer keeps going
    updateChunks(cp.x, cp.z, 1e9, 160); placeAt(cp.x, cp.z, cp.yaw); S.speed = 3.5; S.crumbs = []; S.crumbT = 0; camInit = false; return; }
  // back to where you were riding safely ~1.5 s ago (Mavrix-style), facing the way you were going
  const ok = (S.crumbs||[]).filter(c => inside(c.x, c.z));
  const c = ok.find(c => S.time - c.t >= 1.5) || ok[0];
  if (c) placeAt(c.x, c.z, c.yaw);
  else if (!inside(S.x, S.z)){ const L = OOB - 120, x = Math.max(-L, Math.min(L, S.x)), z = Math.max(-L, Math.min(L, S.z)); placeAt(x, z, Math.atan2(x, z)); camInit = false; }   // face the middle of the map
  else placeAt(S.x, S.z, S.travel ?? S.yaw);
  S.crumbs = []; S.crumbT = 0;
}
function trackWorld(dt){
  // breadcrumbs for respawn (only while rolling cleanly on the ground)
  S.crumbT = (S.crumbT||0) + dt;
  if (!S.air && S.crashT <= 0 && S.crumbT > 0.25){ S.crumbT = 0; (S.crumbs ||= []).unshift({x:S.x, z:S.z, yaw:S.travel ?? S.yaw, t:S.time}); if (S.crumbs.length > 16) S.crumbs.pop(); }
  // trail runs: ride through a trail's START arch to start the clock, its FINISH arch to finish
  const near = nearTrails(S.x, S.z); let cur = null;
  for (const n of near) if (n.d <= W+1.5 && (!cur || n.d < cur.d)) cur = n;
  S.onTrailName = cur ? trails[cur.t].name : inPark(S.x,S.z) ? 'Dirt Jump Park' : '';
  if (cur){ const tr = trails[cur.t];
    if (cur.s < 18 && (!S.run || S.run.t !== cur.t)) { S.run = {t:cur.t, start:S.time, s:cur.s}; S.lives = 3; trickEl.textContent = `⏱ ${tr.name} — run started`; S.trickMsgT = 2; }
    if (S.run && S.run.t === cur.t){ S.run.s = Math.max(S.run.s, cur.s);
      const cps = tr.cps || []; while ((S.run.cp ?? -1) + 1 < cps.length && cur.s >= cps[(S.run.cp ?? -1) + 1].s - 2 && cur.s < cps[(S.run.cp ?? -1) + 1].s + 25){ S.run.cp = (S.run.cp ?? -1) + 1; toast(`🚩 Checkpoint ${S.run.cp+1}/${cps.length} · ${tr.name}`); flash('CHECKPOINT', 1.0); }
      if (cur.s > tr.len - 8){ const time = S.time - S.run.start, bonus = Math.round((1000 + tr.len/2)*EARN);
        S.finishes++; S.score += bonus; flash('FINISH!', 2.5); trickEl.textContent = `${tr.name} in ${fmtTime(time)}  +$${bonus}`; S.trickMsgT = 3.5;
        S.best ||= {}; if (!S.best[tr.name] || time < S.best[tr.name]){ S.best[tr.name] = time; toast(`🏁 New best on ${tr.name}: ${fmtTime(time)}`); }
        if (!unlocked.has(tr.name)){ unlocked.add(tr.name); saveUnlocks(); setTimeout(()=>toast(`🔓 Unlocked: ${tr.name} — teleport there any time`), 1200); }
        S.run = null; } } }
  // map boundary: warning as you approach, then a bail + respawn at your last safe spot inside (counts as a crash only during a trail run)
  const edge = Math.max(Math.abs(S.x), Math.abs(S.z));
  if (S.crashT <= 0){
    if (edge > OOB){ S.oob = true; crash('Out of bounds!'); }
    else if (edge > OOB - 70){ if ((S.oobWarnT||0) <= 0){ flash('⚠ OUT OF BOUNDS — TURN BACK', 1.2); S.oobWarnT = 1.5; } }
  }
  S.oobWarnT = (S.oobWarnT||0) - dt;
}
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

const INP0 = {steer:0, lean:0, pedal:0, brake:0, pumpHold:false, pop:false, counter:false, tweak:0, rsy:0, trick:null};
function step(dt, inp){
  inp = Object.assign({}, INP0, inp);
  if (S.crashT > 0){ S.crashT -= dt;
    S.speed *= Math.pow(0.2,dt); S.x += -Math.sin(S.yaw)*S.speed*dt; S.z += -Math.cos(S.yaw)*S.speed*dt; S.y = groundH(S.x,S.z);
    S.lean = THREE.MathUtils.lerp(S.lean, 1.4, dt*4);
    if (S.crashT <= 0 && S.state==='riding') respawnSafe();
    return; }
  const onTrail = isDirt(S.x, S.z);
  if (S.travel === undefined) S.travel = S.yaw;
  // suspension: visual spring-damper, never pushes the body back up (no rebound)
  const sTarget = S.preload*0.16 + Math.max(0, S.weightLoad||0);
  S.suspV = (S.suspV||0) + (-320*((S.susp||0)-sTarget) - 32*(S.suspV||0))*dt; S.susp = THREE.MathUtils.clamp((S.susp||0) + S.suspV*dt, -0.05, 0.3);
  if (!S.air){
    const tx_ = -Math.sin(S.travel), tz_ = -Math.cos(S.travel);
    const h0 = groundH(S.x,S.z), h1 = groundH(S.x+tx_*0.5, S.z+tz_*0.5);
    const slope = (h1-h0)/0.5;
    let a = -G*slope/Math.sqrt(1+slope*slope);
    // pedalling: ~2.5 m/s² from a standstill, fading to zero at 55 km/h (65 uphill); above that speed only comes from gravity and pumping
    { const up = Math.max(0, slope), cap = 15.28 + 2.78*Math.min(1, up/0.05);   // 55 km/h on the flat, 65 km/h uphill
      a += inp.pedal * (2.5 + Math.min(3.5, up*12)) * Math.max(0, 1 - S.speed/cap); }   // stronger stroke uphill so typical grades are climbable
    a -= inp.brake * 9 * Math.min(1,S.speed);
    a -= 0.0038*BIKE.drag*S.speed*S.speed + 0.2;
    // (grass rolls like dirt: no off-trail speed penalty; grip off-trail is still lower)
    // pumping: compress into backsides (downslope) and extend over faces (upslope) to gain speed; wrong timing costs speed
    const prevPre = S.preload;
    if (inp.pumpHold) { S.preload = Math.min(1, S.preload + dt*2.2); S.hopWin = 0.35; }
    let pop = 0;
    if (!inp.pumpHold){ S.hopWin = (S.hopWin||0) - dt;
      if (inp.pop && S.preload > 0.05 && S.hopWin > 0){ pop = (1.2 + S.preload*2.0)*BIKE.pop; /* bunny hop ~0.3-0.5 m */ S.preload = 0; }
      else S.preload = Math.max(0, S.preload - dt*3); }
    const cr = (S.preload - prevPre)/dt;           // >0 compressing, <0 extending
    const pumpA = cr > 0 ? cr*(Math.max(0,-slope)*9 - Math.max(0,slope)*4) : -cr*(Math.max(0,slope)*3.5 - Math.max(0,-slope)*1.5);
    a += THREE.MathUtils.clamp(pumpA, -4, 6); S.pumpGain = pumpA;
    // slides: steering + braking breaks rear traction; the travel direction lags the bike heading
    const sliding = inp.brake > 0.3 && Math.abs(inp.steer) > 0.35 && S.speed > 5;
    const grip = sliding ? 1.4 + Math.abs(S.slip||0)*3 : (onTrail ? 11 : 5)*BIKE.grip;
    const turn = 1.9 * Math.min(1, 0.25 + S.speed/8) / (1 + S.speed*0.03) * (sliding ? 1.7 : 1) * (1 + 0.15*Math.max(0,-inp.lean));
    S.yaw -= inp.steer * turn * dt;
    const slipPrev = S.travel; S.travel += wrapA(S.yaw - S.travel) * Math.min(1, grip*dt);
    const slip = wrapA(S.yaw - S.travel);
    a -= Math.abs(Math.sin(slip)) * S.speed * 2.2;
    S.slip = slip; S.sliding = Math.abs(slip) > 0.12;
    S.speed = Math.max(0, S.speed + a*dt);
    // carve lean from actual cornering (v * yaw-rate / g)
    const yawRate = wrapA(S.travel - slipPrev)/dt;
    S.lean = THREE.MathUtils.lerp(S.lean, THREE.MathUtils.clamp(Math.atan(-yawRate*S.speed/G), -0.85, 0.85), Math.min(1,dt*8));
    S.weight = THREE.MathUtils.lerp(S.weight||0, THREE.MathUtils.clamp(inp.lean + inp.brake*0.5 - inp.pedal*0.2, -1, 1), Math.min(1, dt*6));
    S.vx = -Math.sin(S.travel)*S.speed; S.vz = -Math.cos(S.travel)*S.speed;
    let nx = S.x + S.vx*dt, nz = S.z + S.vz*dt, ng = groundH(nx,nz);
    // jump collision: only a feature's ramp face (along its forward axis) adds launch speed. Its sides are climbed
    // (rounded dirt) or block/deflect you with a speed loss (steep / wooden walls), never launch you.
    let vyFeat = null;
    { const fa = featAxis(nx, nz) || featAxis(S.x, S.z);
      if (fa){ const mx = nx - S.x, mz = nz - S.z, dA = mx*fa.dx + mz*fa.dz;
        const ax = S.x + fa.dx*dA, az = S.z + fa.dz*dA, f0 = featH(S.x, S.z), fAlong = featH(ax, az), f1 = featH(nx, nz);
        const latRise = f1 - fAlong, latLen = Math.hypot(mx - fa.dx*dA, mz - fa.dz*dA) + 1e-6;
        const rise = f1 - f0, moveLen = Math.hypot(mx, mz) + 1e-6;
        if (rise > 0.06 && rise/moveLen > 2.5){   // a vertical face (back of a wooden jump, front of a step-down deck): a wall, not a ramp
          S.speed *= 0.3; S.travel += Math.PI*0.5*Math.sign(wrapA(S.travel - Math.atan2(-fa.dx,-fa.dz)) || 1); S.yaw = S.travel;
          S.vx = -Math.sin(S.travel)*S.speed; S.vz = -Math.cos(S.travel)*S.speed; nx = S.x; nz = S.z; ng = groundH(nx, nz); vyFeat = 0; S.sideHits = (S.sideHits||0) + 1;
        } else if (latRise > 0.06 && latRise/latLen > 1.2){
         // wall-steep side face: bounce off sideways, lose speed
          const t1 = Math.atan2(-fa.dx, -fa.dz), cand = [t1, t1 + Math.PI];
          const tgt = Math.abs(wrapA(cand[0]-S.travel)) < Math.abs(wrapA(cand[1]-S.travel)) ? cand[0] : cand[1];
          const dYaw = wrapA(tgt - S.travel); S.travel += dYaw; S.yaw += dYaw*0.7; S.speed *= 0.45;
          S.vx = -Math.sin(S.travel)*S.speed; S.vz = -Math.cos(S.travel)*S.speed;
          nx = S.x; nz = S.z; ng = groundH(nx, nz); S.sideHits = (S.sideHits||0) + 1; vyFeat = 0;
        } else vyFeat = (fAlong - f0)/dt; } }
    // vertical speed from ground-following never exceeds slope x horizontal speed along the travel direction
    const fdx = -Math.sin(S.travel), fdz = -Math.cos(S.travel), g0 = groundH(S.x, S.z);
    const gradeF = Math.max(0, (groundH(S.x + fdx*0.5, S.z + fdz*0.5) - g0)/0.5, (g0 - groundH(S.x - fdx*0.5, S.z - fdz*0.5))/0.5, (ng - g0)/Math.max(0.05, S.speed*dt));
    let vyG = vyFeat === null ? (ng - S.y)/dt : (terrainH(nx,nz) - (S.y - featH(S.x,S.z)))/dt + vyFeat;
    vyG = Math.max(-1.5*S.speed - 3, Math.min(vyG, (vyFeat !== null ? 1.5 : Math.min(1.0, gradeF))*S.speed + 0.3));   // ramp faces keep their full lip speed
    S.landCool = Math.max(0, (S.landCool||0) - dt);
    S.gf = (S.gf||0) + 1;
    const crestG = inp.counter ? G*2.2 : G*1.15;   // counter-pump (RS up) keeps you glued over rollers
    let crest = S.gf > 3 && S.landCool <= 0 && (S.lastVyG - vyG)/dt > crestG && S.speed > 4;
    const edge = (ng - S.y) < -0.12 && (S.lastVyG - vyG)/dt > G_AIR*3 && S.speed > 1.5;   // rolling off a ledge/lip: the ground drops away faster than you can fall
    if (edge && !crest) crest = true;
    if (crest){ // only leave the ground if the ballistic path really clears the terrain (no micro-hops)
      let clear = 0; for (let t=0.03; t<=0.18; t+=0.03){ const bx=S.x+S.vx*t, bz=S.z+S.vz*t, by=S.y+S.lastVyG*t-0.5*G_AIR*t*t; clear=Math.max(clear, by-groundH(bx,bz)); }
      if (clear < 0.4) crest = false; }
    if (pop > 0 || crest){
      S.air = true; S.airT = 0; S.vy = S.lastVyG + pop; S.takeoffPitch = S.pitch; S.spin = 0; S.popped = pop > 0;
      S.tweakT = 0; S.tricksDone = new Set(); S.wYaw = 0; S.wPitch = 0; S.yaw = S.travel + slip*0.5; S.travel = S.yaw; S.nose = 0;
      // scrub: laying the bike over (right stick sideways) at takeoff keeps you low and fast
      const lay = Math.abs(inp.tweak);
      S.scrub = S.vy > 2 ? lay : 0;
      if (S.scrub > 0.2){ S.vy *= 1 - 0.45*S.scrub; S.tweak = inp.tweak; S.speed *= 1.02; S.vx = -Math.sin(S.travel)*S.speed; S.vz = -Math.cos(S.travel)*S.speed; }
      S.x = nx; S.z = nz; S.y += S.vy*dt;
    } else { S.x = nx; S.z = nz; S.y = ng; S.vy = vyG; S.lastVyG = vyG;
      S.pitch = THREE.MathUtils.lerp(S.pitch, Math.atan(slope), Math.min(1,dt*12)); }
    // came up short against a face too steep to roll up: that's a case, not a place to get stuck
    S.stuckT = (S.speed < 0.6 && slope > 0.25 && featH(S.x, S.z) > 0.05) ? (S.stuckT||0) + dt : 0;
    if (S.stuckT > 1.2 && S.crashT <= 0){ S.stuckT = 0; crash('Cased it!'); }
    S.spin *= Math.exp(-dt*12); S.tweak = (S.tweak||0)*Math.exp(-dt*10); S.nose = (S.nose||0)*Math.exp(-dt*10);
    S.dust = (S.sliding ? 1 : 0) + (inp.brake > 0.5 && S.speed > 6 ? 0.5 : 0) + (!onTrail && S.speed > 4 ? 0.6 : 0);
    if (S.speed > 4) for (const t of nearTrees(S.x, S.z)) if ((t.x-S.x)**2 + (t.z-S.z)**2 < 0.55) { crash('Hit a tree!'); return; }
  } else {
    S.airT += dt; S.vy -= G_AIR*dt;
    S.x += S.vx*dt; S.z += S.vz*dt; S.y += S.vy*dt;
    // left stick: analog spin / flip with rotational inertia
    const spinIn = inp.steer, ty = inp.lean;
    S.wYaw = (S.wYaw||0) + (spinIn*6.0 - (S.wYaw||0)) * Math.min(1, dt*7);
    S.wPitch = (S.wPitch||0) + (ty*5.5 - (S.wPitch||0)) * Math.min(1, dt*7);
    S.spin += S.wYaw*dt; S.pitch += S.wPitch*dt;
    // right stick: proportional whip/tweak (x) and nose angle (y), sprung so it follows the stick
    S.tweak = THREE.MathUtils.lerp(S.tweak||0, inp.tweak, Math.min(1, dt*9));
    S.nose = THREE.MathUtils.lerp(S.nose||0, -inp.rsy*0.6, Math.min(1, dt*8));
    if (Math.abs(S.tweak) > 0.6) S.tweakT = (S.tweakT||0) + dt;
    if (inp.trick){ S.trick = inp.trick; S.trickAmt = inp.trickAmt ?? 1; S.trickT = (S.trickT||0) + dt; if (S.trickT > 0.3) S.tricksDone.add(inp.trick); } else { S.trick = null; S.trickT = 0; }
    S.lean = THREE.MathUtils.lerp(S.lean, 0, dt*3); S.weight = THREE.MathUtils.lerp(S.weight||0, ty, dt*5);
    const gh = groundH(S.x,S.z), gs = (groundH(S.x+S.vx*0.05, S.z+S.vz*0.05)-gh)/(Math.hypot(S.vx,S.vz)*0.05+1e-3);
    const gp = Math.atan(gs);
    if (Math.abs(ty) < 0.2){ const e = wrapA(S.pitch-gp); if (Math.abs(e) < 1.3){ S.pitch -= e*Math.min(1,dt*2.5); } }
    if (Math.abs(spinIn) < 0.3){ const e = wrapA(S.spin); if (Math.abs(e) < 1.0) S.spin -= e*Math.min(1,dt*4); }
    S.dust = 0;
    const gvy = Math.min((groundH(S.x+S.vx*dt, S.z+S.vz*dt) - gh)/dt, 1.5*Math.hypot(S.vx,S.vz) + 0.3);
    if (S.y <= gh) land(gh, gp);
    else if (!S.popped && S.airT < 0.25 && S.y - gh < 0.3 && S.vy - gvy < 1.5){ S.y = gh; S.air = false; S.lastVyG = gvy; S.gf = 0; S.spin = 0; S.pitch = gp; S.tweak = 0; S.nose = 0; S.trick = null; S.wYaw = S.wPitch = 0; }
  }
  // failsafe: no NaN/Inf, bounded velocities, never stuck in the air or under the ground
  if (S.air && !S.popped) S.vy = Math.min(S.vy, 25);
  if (!S.air) S.lastVyG = Math.min(S.lastVyG||0, 1.5*S.speed + 0.3);
  S.speed = Math.min(S.speed, 30); S.vy = Math.max(-40, Math.min(40, S.vy||0));
  if (S.air){ const hs = Math.hypot(S.vx,S.vz); if (hs > 30){ S.vx *= 30/hs; S.vz *= 30/hs; } }
  if (![S.x,S.y,S.z,S.vx,S.vy,S.vz,S.speed,S.pitch,S.yaw].every(Number.isFinite) || (S.air && S.airT > 4)){ respawnSafe(); S.vy = 0; S.air = false; S.airT = 0; }
  else { const g = groundH(S.x,S.z); if (S.y < g - 1){ S.y = g; if (S.air){ S.air = false; S.airT = 0; S.vy = 0; S.lastVyG = 0; } } }
  S.time += dt;
}
const _eY = new THREE.Euler(), _qT = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function land(gh, gp){
  S.y = gh; S.air = false;
  S.air = false; const pe = wrapA(S.pitch + (S.nose||0)*0.5 - gp), se = wrapA(S.spin);
  S.wYaw = 0; S.wPitch = 0; S.travel = Math.atan2(-S.vx, -S.vz);
  const flips = Math.round((S.pitch - S.takeoffPitch)/(Math.PI*2)), spins = Math.round(S.spin/(Math.PI*2));
  // project velocity onto the terrain tangent plane using the real terrain normal (works on and off trail)
  const e = 0.25, nx = -(groundH(S.x+e,S.z)-groundH(S.x-e,S.z))/(2*e), nz = -(groundH(S.x,S.z+e)-groundH(S.x,S.z-e))/(2*e);
  const nl = Math.hypot(nx,1,nz), n = [nx/nl, 1/nl, nz/nl];
  const vn = S.vx*n[0] + S.vy*n[1] + S.vz*n[2];
  const tvx = S.vx - vn*n[0], tvy = S.vy - vn*n[1], tvz = S.vz - vn*n[2];
  const fwd = Math.hypot(tvx, tvz) * Math.max(0, Math.cos(wrapA(S.yaw - S.travel)));   // keep the along-heading part
  S.speed = Math.max(0, fwd)*0.96;
  { const gr = (groundH(S.x - Math.sin(S.yaw)*S.speed/120, S.z - Math.cos(S.yaw)*S.speed/120) - gh)*120; S.vy = Math.min(tvy, gr); S.lastVyG = S.vy; } S.gf = 0; S.landCool = 0.3;
  const impact = -vn; S.suspV = (S.suspV||0) + Math.min(impact,15)*0.12; S.dustBurst = Math.min(1, impact/8);
  if (Math.abs(pe) > 0.75*BIKE.stab || Math.abs(se) > 0.85*BIKE.stab){ crash(Math.abs(se)>0.85*BIKE.stab ? 'Landed sideways!' : 'Over the bars!'); return; }
  if (impact > 20){ crash('Too hard a landing!'); return; }
  if (S.trick){ crash('Still mid-trick!'); return; }
  if (Math.abs(S.tweak||0) > 0.6){ crash('Didn\'t straighten the tweak!'); return; }
  // within tolerance: keep current orientation and let the ground solver damp it smoothly to the surface
  S.spin = se; S.trick = null;
  S.pitch = gp + wrapA(S.pitch - gp);   // drop whole flip turns so the bike settles by the shortest way (no unwinding a full loop)
  if (S.airT > 0.35){
    const parts = []; let pts = Math.round(S.airT*120);
    if (flips){ parts.push((Math.abs(flips)>1? `${Math.abs(flips)}x `:'') + (flips<0?'Frontflip':'Backflip')); pts += 600*Math.abs(flips); S.flips += Math.abs(flips); }
    if (spins){ parts.push(`${Math.abs(spins)*360}`); pts += 350*Math.abs(spins); S.spins += Math.abs(spins); }
    const TN = {up:'No Hander', down:'No Footer', left:'Superman', right:'Can-Can', ul:'Tuck No Hander', ur:'X-Up', dl:'Nac-Nac', dr:'Tailwhip', bar:'Barspin'};
    for (const t of (S.tricksDone||[])){ parts.push(TN[t]); pts += 400; }
    if ((S.scrub||0) > 0.5){ parts.push('Scrub'); pts += 250; }
    if ((S.tweakT||0) > 0.15){ parts.push('Tweak'); pts += Math.round(150 + S.tweakT*300); }
    parts.push(`${S.airT.toFixed(1)}s air`);
    if (Math.abs(pe) < 0.2 && Math.abs(se) < 0.2){ parts.push('Perfect!'); pts = Math.round(pts*1.25); }
    pts = Math.max(1, Math.round(pts*EARN)); S.score += pts; S.clean++; if (inPark(S.x,S.z)) S.parkClean = (S.parkClean||0) + 1; S.totalAir += S.airT; S.bestAir = Math.max(S.bestAir, S.airT);
    trickEl.textContent = parts.join(' + ') + `  +$${pts}`; S.trickMsgT = 2.5;
  }
}
const fmtTime = t => `${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;

// ---------- Main loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); let camInit = false;
const clock = new THREE.Clock(); let acc = 0;
const arc = $('speedArc'), arcLen = arc.getTotalLength();
let fpsT=0, fpsN=0, camRoll = 0;
// dust particles (slides, hard braking, off-trail, landings)
const DN = 400, dustPos = new Float32Array(DN*3), dustVel = new Float32Array(DN*3), dustLife = new Float32Array(DN); let dustI = 0;
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({color:0xb89a72, size:0.22, transparent:true, opacity:0.45, depthWrite:false, map:(()=>{ const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d'); const g=x.createRadialGradient(16,16,0,16,16,16); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,32,32); return new THREE.CanvasTexture(c); })()}));
dustPts.frustumCulled = false; scene.add(dustPts);
function spawnDust(dt){
  let n = Math.floor((S.dust||0)*S.speed*dt*6 + Math.random()); if (!S.dust) n = 0;
  if (S.dustBurst){ n += Math.floor(S.dustBurst*40); S.dustBurst = 0; }
  const rx = S.x + Math.sin(S.yaw)*0.55, rz = S.z + Math.cos(S.yaw)*0.55;
  for (let i=0;i<n;i++){ const j = dustI = (dustI+1)%DN;
    dustPos[j*3]=rx+(Math.random()-.5)*0.4; dustPos[j*3+1]=S.y+0.1; dustPos[j*3+2]=rz+(Math.random()-.5)*0.4;
    dustVel[j*3]=(Math.random()-.5)*2 + S.vx*0.3; dustVel[j*3+1]=Math.random()*1.5+0.3; dustVel[j*3+2]=(Math.random()-.5)*2 + S.vz*0.3; dustLife[j]=0.6+Math.random()*0.6; }
  for (let j=0;j<DN;j++){ if (dustLife[j] <= 0){ dustPos[j*3+1] = -1e4; continue; } dustLife[j] -= dt;
    dustPos[j*3]+=dustVel[j*3]*dt; dustPos[j*3+1]+=dustVel[j*3+1]*dt; dustPos[j*3+2]+=dustVel[j*3+2]*dt; dustVel[j*3+1]-=0.8*dt; }
  dustGeo.attributes.position.needsUpdate = true;
}
function frame(){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const inp = readInput();
  for (const k in inp.pressed) onPress(k);
  if (S.state==='riding' && !S.paused && S.lift){ liftRide(dt, inp); }
  else if (S.state==='riding' && !S.paused){
    acc += dt; const h = 1/120; while (acc >= h){ step(h, inp); acc -= h; }
    trackWorld(dt); shopProximity(dt); liftProximity(dt);
  } else if (S.state!=='riding' && S.state!=='menu') { step(dt, {steer:0,pedal:0,brake:1,jump:false,tx:0,ty:0}); }
  animateLifts(dt); updateChunks(S.x, S.z); farU.value.set(S.x, S.z, coveredR);
  // pose bike
  bike.position.set(S.x, S.y, S.z);
  // whole-bike orientation as one quaternion (yaw * pitch * lean/tweak); after a landing it slerps to the target over ~0.15 s instead of snapping
  _eY.set(0, S.yaw + S.spin, 0); _qT.setFromEuler(_eY); _eY.set(S.pitch + (S.nose||0)*0.5, 0, 0); _qT.multiply(_q2.setFromEuler(_eY));
  _eY.set(0, (S.tweak||0)*0.45, -S.lean + (S.tweak||0)*0.7, 'YXZ'); _qT.multiply(_q2.setFromEuler(_eY)); _eY.order = 'XYZ';
  if (S.air) S.landBlend = 0.15; else if (S.landBlend > 0) S.landBlend -= dt;
  if (!S.air && S.landBlend > 0) bike.quaternion.slerp(_qT, 1 - Math.exp(-dt/0.04)); else bike.quaternion.copy(_qT);
  pitchG.rotation.set(0,0,0); leanG.rotation.set(0,0,0);   // whip/scrub: stick right = bike whips right
  BR.update(S, inp, dt);                                       // rider pose: IK on grips/pedals, blended trick keyframes, barspin/tailwhip bike parts
  rig.position.z = (S.weight||0)*0.12;                         // visible fore/aft weight transfer
  rig.position.y = -(S.susp||0)*0.8; rig.scale.y = 1 - (S.susp||0)*0.5;
  spawnDust(dt);
  for (const w of wheels) w.rotation.x -= S.speed*dt/0.36;
  // camera
  const ch = S.travel ?? S.yaw; const fx = -Math.sin(ch), fz = -Math.cos(ch);
  const back = [5.2,8,3.4][camMode] + S.speed*0.04;
  const fov = 66 + Math.min(14, S.speed*0.45); if (Math.abs(camera.fov-fov) > 0.05){ camera.fov += (fov-camera.fov)*Math.min(1,dt*3); camera.updateProjectionMatrix(); }
  const tp = new THREE.Vector3(S.x - fx*back, 0, S.z - fz*back);
  tp.y = Math.max(groundH(tp.x,tp.z), S.y) + [2.3,3.4,1.7][camMode];
  const tl = new THREE.Vector3(S.x + fx*4, S.y + 1.0, S.z + fz*4);
  if (!camInit || camPos.distanceTo(tp) > 40){ camPos.copy(tp); camLook.copy(tl); camInit = true; }
  const k = 1 - Math.exp(-dt*6);
  camPos.lerp(tp, k); camLook.lerp(tl, 1 - Math.exp(-dt*10));
  camera.position.copy(camPos);
  camRoll = THREE.MathUtils.lerp(camRoll, -S.lean*0.18 + (S.sliding ? S.slip*0.1 : 0), Math.min(1, dt*4));
  camera.up.set(Math.sin(camRoll)*Math.cos(ch), Math.cos(camRoll), -Math.sin(camRoll)*Math.sin(ch)); camera.lookAt(camLook);
  if (window.__camSide){ const o = window.__camSide, c = Math.cos(S.yaw), s_ = Math.sin(S.yaw); camera.position.set(S.x + c*o.d + Math.sin(S.yaw)*(o.b||0), S.y + (o.h||1.2), S.z - s_*o.d + Math.cos(S.yaw)*(o.b||0)); camera.up.set(0,1,0); camera.lookAt(S.x, S.y + 0.9, S.z); }   // test hook: side camera for pose screenshots
  mountains.position.set(camera.position.x, 0, camera.position.z);
  skyDome.position.copy(camera.position);
  sun.position.set(S.x+30, S.y+60, S.z+20); sun.target.position.set(S.x, S.y, S.z-10);
  renderer.render(scene, camera);
  // HUD
  const kmh = S.speed*3.6; S.maxKmh = Math.max(S.maxKmh, kmh);
  const shownKmh = Math.max(0, kmh - 5);   // HUD only: display reads 5 km/h under the real speed
  $('speedVal').textContent = Math.round(shownKmh);
  arc.style.strokeDasharray = `${Math.min(1,shownKmh/90)*arcLen} 1000`;
  $('airVal').textContent = (S.air && S.airT > 0.1 ? S.airT : 0).toFixed(1)+'s';
  $('airBest').textContent = `best ${S.bestAir.toFixed(1)}s`;
  $('scoreVal').textContent = '$' + S.score.toLocaleString();
  if (S.score !== S.savedScore){ S.savedScore = S.score; LS.set('trailDescent.dollahs', S.score); }
  $('lives').style.display = S.run ? '' : 'none';
  $('livesVal').textContent = S.lives>0 ? '♥ '.repeat(S.lives).trim() : '—';
  const run = S.run && trails[S.run.t];
  $('progressBar').style.width = run ? Math.min(100, S.run.s/run.len*100) + '%' : '0%';
  $('progressBar').style.background = run ? run.color : '#fff';
  $('timer').textContent = run ? `${run.name}  ${fmtTime(S.time - S.run.start)}` : (S.onTrailName || 'Free roam');
  drawMinimap(); updateWaypoints(dt); if (bigMap.open) mapFrame(dt, inp);
  if (S.trickMsgT > 0){ S.trickMsgT -= dt; if (S.trickMsgT<=0) trickEl.textContent=''; }
  if (S.flashT > 0){ S.flashT -= dt; if (S.flashT<=0) centerEl.textContent=''; }
  fpsN++; fpsT+=dt; if (fpsT>1){ window.__fps = fpsN/fpsT; fpsN=0; fpsT=0; }
}
// ---------- minimap ----------
const mm = $('minimap'), mmx = mm.getContext('2d'), MMS = mm.width, mmBg = document.createElement('canvas');
{ mmBg.width = mmBg.height = MMS; const x = mmBg.getContext('2d'), img = x.createImageData(MMS, MMS), sc = 2*HALF/MMS;
  for (let j=0;j<MMS;j++) for (let i=0;i<MMS;i++){ const wx = -HALF+(i+.5)*sc, wz = -HALF+(j+.5)*sc, h = base(wx,wz), dh = base(wx+sc,wz)-h, k = (j*MMS+i)*4;
    const v = 70 + Math.min(150, Math.max(0, h*0.45)) + dh*4, band = (Math.floor(h/25)&1) ? 8 : 0;
    img.data[k] = v*0.75+band; img.data[k+1] = v*0.95+band; img.data[k+2] = v*0.7; img.data[k+3] = 255; }
  x.putImageData(img, 0, 0);
  const P = (wx,wz) => [(wx+HALF)/sc, (wz+HALF)/sc];
  for (const tr of trails){ const pa = new Path2D(); tr.pts.forEach((p,i)=>{ if (i%3 && i < tr.pts.length-1) return; const [a,b] = P(p[0],p[1]); i ? pa.lineTo(a,b) : pa.moveTo(a,b); }); tr.mmPath = pa; }
  x.fillStyle = 'rgba(160,110,60,.9)'; { const [a,b] = P(PARK.x,PARK.z); x.beginPath(); x.arc(a,b,PARK.r/sc,0,7); x.fill(); }
  x.fillStyle = '#f2b800'; x.strokeStyle = '#000'; x.lineWidth = 1; for (const tr of trails) for (const cp of tr.cps){ const [a,b] = P(cp.x, cp.z); x.beginPath(); x.moveTo(a, b-4); x.lineTo(a+3.5, b+2.5); x.lineTo(a-3.5, b+2.5); x.closePath(); x.fill(); x.stroke(); }   // checkpoints
  x.strokeStyle = 'rgba(235,215,170,.85)'; x.lineWidth = 1; x.setLineDash([]); for (const c of connectors){ x.beginPath(); c.pts.forEach((p,i)=>{ if (i%4 && i < c.pts.length-1) return; const [a,b] = P(p[0],p[1]); i ? x.lineTo(a,b) : x.moveTo(a,b); }); x.stroke(); }   // connector paths
  for (const L of LIFTS){ const [a,b] = P(L.bx,L.bz), [c,d] = P(L.tx,L.tz); x.strokeStyle = '#111'; x.lineWidth = 3; x.beginPath(); x.moveTo(a,b); x.lineTo(c,d); x.stroke(); x.strokeStyle = L.color; x.lineWidth = 1.6; x.setLineDash([3,2]); x.stroke(); x.setLineDash([]);
    for (const [p,q] of [[a,b],[c,d]]){ x.fillStyle = L.color; x.fillRect(p-3.5,q-3.5,7,7); x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect(p-3.5,q-3.5,7,7); }
    x.font = 'bold 10px sans-serif'; x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 3; const lbl = 'Lift ' + L.short; x.strokeText(lbl, a+6, b+4); x.fillText(lbl, a+6, b+4); }
  if (PARK.drop){ const D = PARK.drop, [a,b] = P(D.x + D.dx*D.lip, D.z + D.dz*D.lip); x.fillStyle = '#5a3418'; x.fillRect(a-3,b-3,6,6); x.strokeStyle = '#ffd36b'; x.lineWidth = 1.5; x.strokeRect(a-3,b-3,6,6); x.fillStyle = '#ffd36b'; x.font = 'bold 9px sans-serif'; x.fillText('DROP', a+5, b+3); }
}
function drawMinimap(){
  mmx.drawImage(mmBg, 0, 0); const sc = 2*HALF/MMS, a = (S.x+HALF)/sc, b = (S.z+HALF)/sc, yw = S.yaw + (S.spin||0);
  for (const [i,tr] of trails.entries()){ const open = isOpen(i);   // every trail is always shown; locked ones dashed and dimmed
    mmx.globalAlpha = open ? 1 : 0.55; mmx.setLineDash(open ? [] : [4,3]); mmx.strokeStyle = tr.color; mmx.lineWidth = open ? 2.4 : 1.8; mmx.stroke(tr.mmPath); }
  mmx.globalAlpha = 1; mmx.setLineDash([]);
  mmx.font = 'bold 10px Arial'; mmx.textAlign = 'center';
  spots.forEach((s,i)=>{ const px = (s.x+HALF)/sc, pz = (s.z+HALF)/sc, open = isOpen(i);      // unlocked spots: white numbered dot; locked: grey with a lock
    mmx.fillStyle = open ? '#fff' : 'rgba(60,60,60,.85)'; mmx.beginPath(); mmx.arc(px, pz, 6, 0, 7); mmx.fill();
    mmx.fillStyle = open ? '#000' : '#bbb'; mmx.fillText(open ? String(i+1) : '🔒', px, pz+3.5);
    const tr = s.trail !== undefined ? trails[s.trail] : s.name.startsWith('Dirt') ? PARK : null;     // difficulty icon next to each spot
    if (tr){ const d = DIFF[tr.diff]; mmx.font = 'bold 9px Arial'; mmx.lineWidth = 2; mmx.strokeStyle = '#fff'; mmx.fillStyle = d.color; mmx.globalAlpha = open ? 1 : 0.6;
      mmx.strokeText(d.icon, px+12, pz+3); mmx.fillText(d.icon, px+12, pz+3); mmx.globalAlpha = 1; mmx.font = 'bold 10px Arial'; } });
  waypoints.forEach(w => { const px = (w.x+HALF)/sc, pz = (w.z+HALF)/sc; mmx.fillStyle = '#3ef0ff'; mmx.strokeStyle = '#003'; mmx.lineWidth = 1.5; mmx.beginPath(); mmx.moveTo(px, pz-6); mmx.lineTo(px+5, pz); mmx.lineTo(px, pz+6); mmx.lineTo(px-5, pz); mmx.closePath(); mmx.fill(); mmx.stroke(); });
  mmx.textAlign = 'start';
  mmx.save(); mmx.translate(a,b); mmx.rotate(-yw); mmx.fillStyle = '#ffd84d'; mmx.strokeStyle = '#000'; mmx.lineWidth = 1;
  mmx.beginPath(); mmx.moveTo(0,-7); mmx.lineTo(4.5,5); mmx.lineTo(-4.5,5); mmx.closePath(); mmx.fill(); mmx.stroke(); mmx.restore();
}
// ---------- full-screen map (View / M) + waypoints ----------
const bigMap = { open:false, cx:0, cz:0, wasPaused:false, mouse:false };
const WP_KEY = 'trailDescent.waypoints', WP_MAX = 3;
const waypoints = (LS.get(WP_KEY, []) || []).filter(w => Number.isFinite(w.x) && Number.isFinite(w.z)).slice(0, WP_MAX);
const wpBeacons = [];
const beaconMat = new THREE.MeshBasicMaterial({color:0x3ef0ff, transparent:true, opacity:0.45, blending:THREE.AdditiveBlending, depthWrite:false, fog:false});
const beaconCore = new THREE.MeshBasicMaterial({color:0xbaffff, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending, depthWrite:false, fog:false});
function syncBeacons(){ for (const b of wpBeacons) scene.remove(b.g); wpBeacons.length = 0; $('wpMarkers').innerHTML = '';
  waypoints.forEach((w, i) => { const g = new THREE.Group(), y = terrainH(w.x, w.z);
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 260, 16, 1, true), beaconMat); outer.position.y = 130; g.add(outer);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 260, 8, 1, true), beaconCore); core.position.y = 130; g.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 6, 32), beaconCore); ring.rotation.x = Math.PI/2; ring.position.y = 0.4; g.add(ring);
    g.position.set(w.x, y, w.z); scene.add(g);
    const el = document.createElement('div'); el.className = 'wpMarker'; el.innerHTML = `<b>◆ ${i+1}</b><span></span>`; $('wpMarkers').appendChild(el);
    wpBeacons.push({g, ring, el, w}); }); LS.set(WP_KEY, waypoints); }
function toggleWaypointAt(x, z){ const scr = mapScale(); const hit = waypoints.findIndex(w => Math.hypot(w.x-x, w.z-z)*scr.s < 14);
  if (hit >= 0){ waypoints.splice(hit, 1); toast('◆ Waypoint removed'); }
  else { if (waypoints.length >= WP_MAX) waypoints.shift(); waypoints.push({x, z}); toast(`◆ Waypoint set (${waypoints.length}/${WP_MAX})`); }
  syncBeacons(); }
const _wv = new THREE.Vector3();
function updateWaypoints(dt){ const W_ = innerWidth, H_ = innerHeight;
  for (let i = wpBeacons.length-1; i >= 0; i--){ const b = wpBeacons[i], d = Math.hypot(S.x-b.w.x, S.z-b.w.z);
    if (d < 12 && S.state === 'riding' && !S.lift){ waypoints.splice(waypoints.indexOf(b.w), 1); toast('◆ Waypoint reached!'); syncBeacons(); return; }
    b.ring.rotation.z += dt; b.ring.scale.setScalar(1 + 0.15*Math.sin(performance.now()/300));
    _wv.set(b.w.x, terrainH(b.w.x, b.w.z) + 4, b.w.z).project(camera);
    let x = (_wv.x*0.5 + 0.5)*W_, y = (-_wv.y*0.5 + 0.5)*H_; const behind = _wv.z > 1, m = 40;
    if (behind){ x = W_ - x; y = H_ - m; }
    const off = behind || x < m || x > W_-m || y < m || y > H_-m; x = Math.max(m, Math.min(W_-m, x)); y = Math.max(m, Math.min(H_-m, y));
    b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%)`; b.el.classList.toggle('edge', off); b.el.style.display = bigMap.open || S.state !== 'riding' ? 'none' : '';
    b.el.querySelector('span').textContent = d >= 1000 ? (d/1000).toFixed(1) + ' km' : Math.round(d) + ' m'; } }
const bm = $('bigmap'), bmx = bm.getContext('2d'); let bigBg = null;
function makeBigBg(){ const N = 640, cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), img = x.createImageData(N, N), sc = 2*HALF/N;
  for (let j=0;j<N;j++) for (let i=0;i<N;i++){ const wx = -HALF+(i+.5)*sc, wz = -HALF+(j+.5)*sc, h = base(wx,wz), dh = base(wx+sc,wz)-h, k = (j*N+i)*4;
    const v = 70 + Math.min(150, Math.max(0, h*0.45)) + dh*8, band = (Math.floor(h/25)&1) ? 8 : 0; img.data[k] = v*0.75+band; img.data[k+1] = v*0.95+band; img.data[k+2] = v*0.7; img.data[k+3] = 255; }
  x.putImageData(img, 0, 0); return cv; }
const mapScale = () => { const sz = Math.min(innerWidth - 300, innerHeight - 40), s = sz/(2*HALF); return {s, ox: 20 + (innerWidth - 300 - sz)/2, oy: (innerHeight - sz)/2, sz}; };
function openMap(){ bigMap.open = true; bigMap.wasPaused = S.paused; S.paused = true; bigMap.cx = S.x; bigMap.cz = S.z; bm.width = innerWidth; bm.height = innerHeight; $('bigmapWrap').classList.remove('hidden'); }
function closeMap(){ bigMap.open = false; S.paused = bigMap.wasPaused; $('bigmapWrap').classList.add('hidden'); }
function mapTeleport(){ const {s} = mapScale(); let best = -1, bd = 1e9; spots.forEach((p, i) => { const d = Math.hypot(p.x-bigMap.cx, p.z-bigMap.cz)*s; if (d < 22 && d < bd){ bd = d; best = i; } });
  if (best < 0){ toast('Move the cursor onto a spot to teleport'); return; }
  if (!isOpen(best)){ toast(`🔒 ${spots[best].name} is locked — finish ${spotTrail(best).name} once to unlock it`); return; }
  closeMap(); teleport(best); }
function mapKey(code){
  if (code==='B'||code==='KeyM'||code==='Back'||code==='Escape') closeMap();
  else if (code==='A'||code==='Enter'||code==='Space') mapTeleport();
  else if (code==='X'||code==='KeyW') toggleWaypointAt(bigMap.cx, bigMap.cz); }
bm.addEventListener('mousemove', e => { const {s, ox, oy} = mapScale(); bigMap.cx = (e.clientX - ox)/s - HALF; bigMap.cz = (e.clientY - oy)/s - HALF; bigMap.mouse = true; });
bm.addEventListener('click', e => { if (bigMap.open) toggleWaypointAt(bigMap.cx, bigMap.cz); });
bm.addEventListener('dblclick', e => { if (bigMap.open) mapTeleport(); });
function mapFrame(dt, inp){
  if (bm.width !== innerWidth || bm.height !== innerHeight){ bm.width = innerWidth; bm.height = innerHeight; }
  const kx = (keys.ArrowRight?1:0) - (keys.ArrowLeft?1:0) + (keys.KeyD?1:0) - (keys.KeyA?1:0), ky = (keys.ArrowDown?1:0) - (keys.ArrowUp?1:0) + (keys.KeyS?1:0);
  const vx = (inp.lsx||0) + (inp.dpx||0) + kx, vz = (inp.lsy||0) + (inp.dpy||0) + ky, sp = 600;
  bigMap.cx = Math.max(-HALF, Math.min(HALF, bigMap.cx + vx*sp*dt)); bigMap.cz = Math.max(-HALF, Math.min(HALF, bigMap.cz + vz*sp*dt));
  const {s, ox, oy, sz} = mapScale(), P = (x, z) => [ox + (x+HALF)*s, oy + (z+HALF)*s], c = bmx;
  c.clearRect(0, 0, bm.width, bm.height); c.fillStyle = 'rgba(8,14,20,.88)'; c.fillRect(0, 0, bm.width, bm.height);
  c.imageSmoothingEnabled = true; c.drawImage(bigBg || (bigBg = makeBigBg()), ox, oy, sz, sz); c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(ox, oy, sz, sz);
  // connectors, park, shop
  c.strokeStyle = 'rgba(235,215,170,.9)'; c.lineWidth = 1.5; for (const k of connectors){ c.beginPath(); k.pts.forEach((p, i) => { if (i%3 && i < k.pts.length-1) return; const [a,b] = P(p[0],p[1]); i ? c.lineTo(a,b) : c.moveTo(a,b); }); c.stroke(); }
  { const [a,b] = P(PARK.x, PARK.z); c.fillStyle = 'rgba(160,110,60,.9)'; c.beginPath(); c.arc(a, b, PARK.r*s, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText('🏁 Dirt Jump Park', a, b - PARK.r*s - 6); }
  { const [a,b] = P(SHOP.x, SHOP.z); c.font = '18px sans-serif'; c.textAlign = 'center'; c.fillText('🚲', a, b+6); c.font = 'bold 12px sans-serif'; c.fillStyle = '#ffe08a'; c.fillText('Bike Shop', a, b+20); }
  // trails (locked = dashed + dim) with checkpoints
  for (const [i, tr] of trails.entries()){ const open = isOpen(i); c.globalAlpha = open ? 1 : 0.55; c.setLineDash(open ? [] : [6,4]);
    c.strokeStyle = '#000'; c.lineWidth = 5; c.beginPath(); tr.pts.forEach((p, j) => { if (j%3 && j < tr.pts.length-1) return; const [a,b] = P(p[0],p[1]); j ? c.lineTo(a,b) : c.moveTo(a,b); }); c.stroke();
    c.strokeStyle = tr.color === '#111111' ? '#444' : tr.color; c.lineWidth = 3; c.stroke(); c.setLineDash([]);
    for (const cp of tr.cps){ const [a,b] = P(cp.x, cp.z); c.fillStyle = '#f2b800'; c.beginPath(); c.moveTo(a, b-5); c.lineTo(a+4, b+3); c.lineTo(a-4, b+3); c.closePath(); c.fill(); } c.globalAlpha = 1; }
  // lifts with served trails
  c.textAlign = 'left';
  for (const L of LIFTS){ const [a,b] = P(L.bx,L.bz), [e,f] = P(L.tx,L.tz); c.strokeStyle = '#111'; c.lineWidth = 4; c.beginPath(); c.moveTo(a,b); c.lineTo(e,f); c.stroke(); c.strokeStyle = L.color; c.lineWidth = 2; c.setLineDash([5,3]); c.stroke(); c.setLineDash([]);
    for (const [p,q] of [[a,b],[e,f]]){ c.fillStyle = L.color; c.fillRect(p-5,q-5,10,10); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(p-5,q-5,10,10); }
    c.font = 'bold 12px sans-serif'; c.lineWidth = 3; c.strokeStyle = '#000'; c.fillStyle = '#fff'; const t = `🚡 ${L.short}: ${L.serves.join(', ')}`; c.strokeText(t, a+8, b+4); c.fillText(t, a+8, b+4); }
  // trail labels at the start: name, difficulty icon, type, lock state
  for (const [i, tr] of trails.entries()){ const open = isOpen(i), [a,b] = P(tr.pts[0][0], tr.pts[0][1]), d = DIFF[tr.diff];
    c.font = 'bold 12px sans-serif'; c.lineWidth = 3; c.strokeStyle = '#000'; c.fillStyle = open ? '#fff' : '#aaa'; const t = `${open ? '' : '🔒 '}${tr.name}`; c.strokeText(t, a+9, b-4); c.fillText(t, a+9, b-4);
    c.font = '11px sans-serif'; c.fillStyle = /^#(000|111|222)/.test(d.color) || d.color==='black' ? '#eee' : d.color; const t2 = `${d.icon} ${d.label} · ${tr.type}`; c.strokeText(t2, a+9, b+9); c.fillText(t2, a+9, b+9); }
  // spots
  c.textAlign = 'center'; c.font = 'bold 11px sans-serif';
  spots.forEach((p, i) => { const [a,b] = P(p.x, p.z), open = isOpen(i); c.fillStyle = open ? '#fff' : 'rgba(60,60,60,.9)'; c.beginPath(); c.arc(a, b, 8, 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); c.fillStyle = open ? '#000' : '#bbb'; c.fillText(open ? String(i+1) : '🔒', a, b+4); });
  // waypoints
  waypoints.forEach((w, i) => { const [a,b] = P(w.x, w.z); c.fillStyle = '#3ef0ff'; c.strokeStyle = '#003'; c.lineWidth = 2; c.beginPath(); c.moveTo(a, b-9); c.lineTo(a+7, b); c.lineTo(a, b+9); c.lineTo(a-7, b); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#003'; c.fillText(String(i+1), a, b+4); });
  // rider position + heading
  { const [a,b] = P(S.x, S.z); c.save(); c.translate(a, b); c.rotate(-(S.yaw + (S.spin||0))); c.fillStyle = '#ffd84d'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0,-11); c.lineTo(7,8); c.lineTo(-7,8); c.closePath(); c.fill(); c.stroke(); c.restore(); }
  // cursor + hover info
  { const [a,b] = P(bigMap.cx, bigMap.cz); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(a, b, 10, 0, 7); c.moveTo(a-18, b); c.lineTo(a-6, b); c.moveTo(a+6, b); c.lineTo(a+18, b); c.moveTo(a, b-18); c.lineTo(a, b-6); c.moveTo(a, b+6); c.lineTo(a, b+18); c.stroke();
    let hov = -1; spots.forEach((p, i) => { if (Math.hypot(p.x-bigMap.cx, p.z-bigMap.cz)*s < 22) hov = i; });
    const dist = Math.round(Math.hypot(bigMap.cx - S.x, bigMap.cz - S.z)); c.textAlign = 'left'; c.font = 'bold 13px sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
    const t = hov >= 0 ? `${spots[hov].name} — ${isOpen(hov) ? 'A / Enter: teleport' : '🔒 locked'}` : `${dist} m away`; c.strokeText(t, a+16, b-14); c.fillText(t, a+16, b-14); }
  // legend
  const lx = innerWidth - 270, rows = [['━', '#fff', 'Trail (dashed + 🔒 = locked)'], ['▲', '#f2b800', 'Checkpoint'], ['■', '#e53935', 'Lift station (dashed line = lift)'], ['─', '#ebd7aa', 'Connector path'], ['●', '#a06e3c', 'Dirt Jump Park'], ['🚲', '#fff', 'Bike Shop'], ['①', '#fff', 'Teleport spot'], ['◆', '#3ef0ff', `Waypoint (max ${WP_MAX})`], ['▲', '#ffd84d', 'You']];
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(lx-12, 20, 262, 46 + rows.length*20 + 140); c.textAlign = 'left'; c.font = 'bold 16px sans-serif'; c.fillStyle = '#fff'; c.fillText('MAP', lx, 44);
  c.font = '13px sans-serif'; rows.forEach(([ic, col, label], k) => { c.fillStyle = col; c.fillText(ic, lx, 70 + k*20); c.fillStyle = '#ddd'; c.fillText(label, lx + 26, 70 + k*20); });
  let y = 80 + rows.length*20; c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText('Difficulty', lx, y); c.font = '13px sans-serif';
  for (const k of ['green','blue','black','dblack']){ y += 18; c.fillStyle = /^#(000|111|222)/.test(DIFF[k].color) || DIFF[k].color==='black' ? '#eee' : DIFF[k].color; c.fillText(`${DIFF[k].icon} ${DIFF[k].label}`, lx, y); }
  y += 26; c.fillStyle = '#bbb'; c.font = '12px sans-serif';
  for (const l of ['Stick / D-pad / arrows / mouse: move cursor', 'A / Enter / double-click: teleport', 'X / W / click: set or remove waypoint', 'B / M / View: close']){ c.fillText(l, lx, y); y += 16; }
}
syncBeacons();
// ---------- bike shop ----------
let shopOpen = false, shopSel = 0, shopWasPaused = false;
function applyBike(){ frameMat.color.set(BIKE.color); leanG.scale.set(...BIKE.scale); }
function openShop(){ shopOpen = true; shopWasPaused = S.paused; if (S.state==='riding') S.paused = true; shopSel = BIKES.indexOf(BIKE); renderShop(); $('shop').classList.remove('hidden'); }
function closeShop(){ shopOpen = false; $('shop').classList.add('hidden'); if (S.state==='riding'){ S.paused = shopWasPaused; if (!S.paused) $('overlay').classList.add('hidden'); } S.shopCool = 3; }
function bar(v){ const p = Math.round(50 + (v-1)*250); return `<span class="sbar"><i style="width:${Math.max(8,Math.min(100,p))}%"></i></span>`; }
function renderShop(){
  $('shopBal').textContent = '$' + S.score.toLocaleString() + ' DOLLAHS';
  $('shopList').innerHTML = BIKES.map((b,i) => { const own = owned.has(b.id), eq = BIKE === b;
    return `<div class="bike${i===shopSel?' sel':''}"><div class="sw" style="background:#${b.color.toString(16).padStart(6,'0')}"></div><div class="bn"><b>${b.name}</b><small>${b.desc}</small></div>
      <div class="st">Speed ${bar(2-b.drag)} Grip ${bar(b.grip)}<br>Pop ${bar(b.pop)} Stability ${bar(b.stab)}</div>
      <div class="pr">${eq ? 'EQUIPPED' : own ? 'OWNED · equip' : b.price ? '$'+b.price.toLocaleString() : 'FREE'}</div></div>`; }).join('');
}
function shopKey(code){
  if (['DL','ArrowUp','ArrowLeft','KeyW','KeyA','BracketLeft'].includes(code)) shopSel = (shopSel+BIKES.length-1)%BIKES.length;
  else if (['DR','ArrowDown','ArrowRight','KeyS','KeyD','BracketRight'].includes(code)) shopSel = (shopSel+1)%BIKES.length;
  else if (code==='A'||code==='Enter'||code==='Space'){ const b = BIKES[shopSel];
    if (!owned.has(b.id)){ if (S.score >= b.price){ S.score -= b.price; owned.add(b.id); LS.set('trailDescent.owned', [...owned]); toast(`🛒 Bought the ${b.name}!`); } else { toast(`Not enough DOLLAHS: need $${(b.price-S.score).toLocaleString()} more`); renderShop(); return; } }
    BIKE = b; LS.set('trailDescent.bike', b.id); applyBike(); toast(`🚲 Riding the ${b.name}`); }
  else if (code==='B'||code==='Escape'||code==='KeyO'||code==='X'||code==='Start'||code==='KeyP') { closeShop(); return; }
  renderShop();
}
// shop building in the valley: ride up to the door to open the shop
const SHOP_POS = {x:SHOP.x, z:SHOP.z, yaw:SHOP.yaw};   // placed in world.js >= 10 m clear of every path, trail and lift; a spur path runs to the porch
// detailed cabin: every part is baked into one merged geometry per material (≈8 draw calls for the whole yard)
{ const parts = new Map(), M = (c, e) => { const k = c + (e ? 'e' : ''); if (!parts.has(k)) parts.set(k, {mat: e ? new THREE.MeshBasicMaterial({color:c}) : new THREE.MeshLambertMaterial({color:c}), geos: []}); return parts.get(k); };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const put = (geo, col, x, y, z, rx=0, ry=0, rz=0, emissive=false) => { _e.set(rx, ry, rz); _m.compose(new THREE.Vector3(x,y,z), _q.setFromEuler(_e), new THREE.Vector3(1,1,1)); const gg = (geo.index ? geo.toNonIndexed() : geo.clone()); gg.applyMatrix4(_m); gg.deleteAttribute('uv'); M(col, emissive).geos.push(gg); };
  const box = (w,h,d,col,x,y,z,ry=0,rx=0,rz=0) => put(new THREE.BoxGeometry(w,h,d), col, x, y, z, rx, ry, rz);
  const cyl = (r,h,col,x,y,z,rx=0,ry=0,rz=0,seg=8) => put(new THREE.CylinderGeometry(r,r,h,seg), col, x, y, z, rx, ry, rz);
  const LOG = 0x8a5a33, LOG2 = 0x7a4e2c, ROOF = 0x4a3326, TRIM = 0xd9c7a0, DARK = 0x2b1d12, GLASS = 0x9fd3ef, METAL = 0x555a60, TIRE = 0x1b1b1b, FENCE = 0x9b7a52;
  const Wd = 12, Dp = 9, Hw = 4.2;   // cabin footprint; front (door) side is local -z
  for (let i = 0; i < 9; i++){ const y = 0.25 + i*0.47, c = i%2 ? LOG : LOG2;     // stacked log walls with crossed corners
    cyl(0.25, Wd+0.8, c, 0, y, -Dp/2, 0, 0, Math.PI/2); cyl(0.25, Wd+0.8, c, 0, y, Dp/2, 0, 0, Math.PI/2);
    cyl(0.25, Dp+0.8, c, -Wd/2, y+0.23, 0, Math.PI/2); cyl(0.25, Dp+0.8, c, Wd/2, y+0.23, 0, Math.PI/2); }
  box(Wd-0.3, Hw, Dp-0.3, 0x6e4526, 0, Hw/2, 0);   // inner fill so there are no gaps between logs
  // gables + pitched roof (ridge along x), overhanging the porch
  const gab = new THREE.BufferGeometry(); gab.setAttribute('position', new THREE.Float32BufferAttribute([-Dp/2,0,0, Dp/2,0,0, 0,2.8,0],3)); gab.computeVertexNormals();
  for (const s of [-1,1]){ put(new THREE.BufferGeometry().copy(gab), LOG, s*Wd/2*0.98, Hw, 0, 0, Math.PI/2*(s>0?1:-1)); put(new THREE.BufferGeometry().copy(gab), LOG, s*Wd/2*0.98, Hw, 0, 0, Math.PI/2*(s>0?-1:1)); }
  const pitch = Math.atan2(2.8, Dp/2), rl = Math.hypot(2.8, Dp/2) + 2.6;
  box(Wd+1.6, 0.25, rl, ROOF, 0, Hw + 1.4 + 0.15, -Dp/4 - 0.9, 0, -pitch);   // front slope runs out over the porch
  box(Wd+1.6, 0.25, rl-2.4, ROOF, 0, Hw + 1.4 + 0.15, Dp/4 + 0.3, 0, pitch);
  cyl(0.18, Wd+1.8, LOG2, 0, Hw+2.85, 0, 0, 0, Math.PI/2);
  box(0.7, 2.6, 0.7, 0x777068, Wd/2-2, Hw+1.8, 1.5);   // stone chimney
  // porch: deck, posts, rail, steps
  box(Wd+1, 0.3, 3.2, 0x9c7449, 0, 0.35, -Dp/2-1.6);
  for (const px of [-Wd/2, -2, 2, Wd/2]) cyl(0.14, 3.4, LOG2, px, 2.0, -Dp/2-3.0);
  for (const px of [-Wd/2+2, Wd/2-2]) { box(3.4, 0.12, 0.12, TRIM, px*0.78 + (px<0?-0.6:0.6), 1.3, -Dp/2-3.0); }
  box(3.2, 0.15, 0.6, 0x9c7449, 0, 0.12, -Dp/2-3.5);
  // door + windows with frames and warm glass
  box(1.6, 2.6, 0.12, DARK, 0, 1.6, -Dp/2-0.27); box(1.9, 0.15, 0.14, TRIM, 0, 2.95, -Dp/2-0.28);
  for (const wx of [-3.6, 3.6]){ box(2.0, 1.4, 0.1, GLASS, wx, 2.2, -Dp/2-0.27); box(2.2, 0.14, 0.14, TRIM, wx, 2.95, -Dp/2-0.3); box(2.2, 0.14, 0.14, TRIM, wx, 1.45, -Dp/2-0.3); box(0.12, 1.5, 0.14, TRIM, wx, 2.2, -Dp/2-0.3); }
  for (const wz of [-1.5, 1.5]){ box(0.1, 1.3, 1.8, GLASS, -Wd/2-0.27, 2.2, wz); box(0.1, 1.3, 1.8, GLASS, Wd/2+0.27, 2.2, wz); }
  // lanterns either side of the door (glowing)
  for (const lx of [-1.4, 1.4]){ put(new THREE.BoxGeometry(0.28,0.4,0.28), 0xffc86b, lx, 3.0, -Dp/2-0.5, 0,0,0, true); box(0.34, 0.06, 0.34, DARK, lx, 3.23, -Dp/2-0.5); }
  // bike racks with parked bikes
  const bikeAt = (x, z, ry, col) => { for (const s of [-0.55, 0.55]) put(new THREE.TorusGeometry(0.34, 0.06, 6, 16), TIRE, x + Math.sin(ry)*s, 0.4, z + Math.cos(ry)*s, 0, ry + Math.PI/2);
    box(0.06, 0.06, 1.0, col, x, 0.62, z, ry, 0.35); box(0.06, 0.5, 0.06, col, x - Math.sin(ry)*0.1, 0.65, z - Math.cos(ry)*0.1, ry); box(0.5, 0.05, 0.05, DARK, x + Math.sin(ry)*0.5, 0.95, z + Math.cos(ry)*0.5, ry); };
  for (const [rx, cols] of [[-Wd/2+0.5, [0xd8382f, 0x2f7bd8, 0x3fb04a]], [Wd/2-3.0, [0xf0b429, 0x222222, 0xe0e0e0]]]){
    box(3.0, 0.08, 0.08, METAL, rx + 1.25, 0.5, -Dp/2-5.6); box(0.08, 0.5, 0.08, METAL, rx-0.2, 0.25, -Dp/2-5.6); box(0.08, 0.5, 0.08, METAL, rx+2.7, 0.25, -Dp/2-5.6);
    cols.forEach((c, i) => bikeAt(rx + i*1.0, -Dp/2-5.6, 0, c)); }
  // work stand with a bike clamped on it, tyre stack, tool board
  box(0.08, 1.5, 0.08, METAL, Wd/2+2.2, 0.75, -Dp/2-1.2); box(0.9, 0.06, 0.06, METAL, Wd/2+2.2, 0.03, -Dp/2-1.2); box(0.06, 0.06, 0.9, METAL, Wd/2+2.2, 0.03, -Dp/2-1.2);
  bikeAt(Wd/2+2.2, -Dp/2-1.2, Math.PI/2, 0x8e44ad);
  for (let i = 0; i < 4; i++) put(new THREE.TorusGeometry(0.36, 0.11, 6, 16), TIRE, -Wd/2-1.6, 0.12 + i*0.22, -1.5, Math.PI/2);
  for (let i = 0; i < 3; i++) put(new THREE.TorusGeometry(0.36, 0.11, 6, 16), TIRE, -Wd/2-1.6, 0.12 + i*0.22, 0.2, Math.PI/2);
  box(0.08, 1.6, 2.4, 0xb08a5a, -Wd/2-0.35, 2.0, 2.4);
  for (let i = 0; i < 5; i++) box(0.06, 0.5 - i*0.05, 0.08, METAL, -Wd/2-0.42, 2.1, 1.5 + i*0.45);
  box(1.6, 0.9, 0.8, 0xc0392b, Wd/2+1.0, 0.45, 2.6);   // tool chest
  // small fenced yard behind and around the sides, open at the front
  const yd = [-Wd/2-3.5, Wd/2+3.5, -Dp/2-1, Dp/2+3.5];
  const fence = (ax, az, bx, bz) => { const l = Math.hypot(bx-ax, bz-az), ry = Math.atan2(bx-ax, bz-az), n = Math.ceil(l/2.2);
    for (let i = 0; i <= n; i++) box(0.14, 1.1, 0.14, FENCE, ax + (bx-ax)*i/n, 0.55, az + (bz-az)*i/n);
    for (const h of [0.45, 0.9]) box(0.06, 0.1, l, FENCE, (ax+bx)/2, h, (az+bz)/2, ry); };
  fence(yd[0], yd[2], yd[0], yd[3]); fence(yd[1], yd[2], yd[1], yd[3]); fence(yd[0], yd[3], yd[1], yd[3]);
  // sign board on the porch roof edge
  const cv = document.createElement('canvas'); cv.width=512; cv.height=128; const c2 = cv.getContext('2d'); c2.fillStyle='#5a3a1e'; c2.fillRect(0,0,512,128); c2.strokeStyle='#e9d29a'; c2.lineWidth=8; c2.strokeRect(6,6,500,116);
  c2.fillStyle='#ffe08a'; c2.font='bold 80px Georgia'; c2.textAlign='center'; c2.fillText('BIKE SHOP',256,92);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(), y = terrainH(SHOP_POS.x, SHOP_POS.z);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5,1.25), new THREE.MeshBasicMaterial({map:tx, side:THREE.DoubleSide})); sign.position.set(0, Hw+0.2, -Dp/2-3.1); sign.rotation.y = Math.PI; g.add(sign);
  for (const {mat, geos} of parts.values()){ let n = 0; for (const q of geos) n += q.attributes.position.count;
    const pos = new Float32Array(n*3), nor = new Float32Array(n*3); let o = 0; for (const q of geos){ if (!q.attributes.normal) q.computeVertexNormals(); pos.set(q.attributes.position.array, o*3); nor.set(q.attributes.normal.array, o*3); o += q.attributes.position.count; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos,3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor,3));
    const mesh = new THREE.Mesh(bg, mat); mesh.castShadow = mesh.receiveShadow = !(mat.isMeshBasicMaterial); g.add(mesh); }
  const lamp = new THREE.PointLight(0xffb85c, 6, 14, 2); lamp.position.set(0, 3.0, -Dp/2-1.2); g.add(lamp);
  g.position.set(SHOP_POS.x, y-0.15, SHOP_POS.z); g.rotation.y = SHOP_POS.yaw; scene.add(g); }
// ---------- connector paths (narrow gravel ribbons draped on the terrain) ----------
{ const v = [], idx = [], col = []; const c1 = new THREE.Color(0xb59a6e), c2 = new THREE.Color(0x9c845c);
  for (const c of connectors){ const P = c.pts, b0 = v.length/3;
    for (let i=0;i<P.length;i++){ const a = P[Math.max(0,i-1)], b = P[Math.min(P.length-1,i+1)], dx = b[0]-a[0], dz = b[1]-a[1], l = Math.hypot(dx,dz)||1, nx = -dz/l, nz = dx/l;
      for (const sd of [-1,1]){ const x = P[i][0] + nx*CW*sd, z = P[i][1] + nz*CW*sd; v.push(x, terrainH(x,z) + 0.07, z); const cc = (i%7<3) ? c1 : c2; col.push(cc.r, cc.g, cc.b); } }
    for (let i=0;i<P.length-1;i++){ const a = b0+i*2; idx.push(a, a+2, a+1, a+1, a+2, a+3); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v,3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col,3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors:true, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2})); m.receiveShadow = true; scene.add(m); }
// ---------- chairlifts: towers, cable, moving chairs; ride from the bottom station to the top ----------
const liftObjs = [];
{ const steel = new THREE.MeshLambertMaterial({color:0x6b7078}), wood = new THREE.MeshLambertMaterial({color:0x7a5534}), roofM = new THREE.MeshLambertMaterial({color:0x2f3b4a});
  const cableM = new THREE.LineBasicMaterial({color:0x222222});
  const station = (x, z, yaw, L, top) => { const g = new THREE.Group(), y = terrainH(x,z);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9,0.5,7), wood); deck.position.y = 0.25; g.add(deck);
    for (const [px,pz] of [[-4,-3],[4,-3],[-4,3],[4,3]]){ const p = new THREE.Mesh(new THREE.BoxGeometry(0.35,6,0.35), steel); p.position.set(px,3,pz); g.add(p); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10,0.4,8), roofM); roof.position.y = 6.2; g.add(roof);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,0.4,20), steel); wheel.position.y = 6.9; g.add(wheel);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c2 = cv.getContext('2d'); c2.fillStyle = L.color; c2.fillRect(0,0,512,128); c2.fillStyle = '#fff'; c2.textAlign = 'center';
    c2.font = 'bold 50px Arial'; c2.fillText(`🚡 ${L.name.toUpperCase()}`, 256, 56, 490); c2.font = 'bold 26px Arial'; c2.fillText(top ? 'TOP · ' + L.serves.join(' · ') : 'RIDE IN TO GO UP · ' + L.serves.join(' · '), 256, 104, 490);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; const sign = new THREE.Mesh(new THREE.PlaneGeometry(9,2.25), new THREE.MeshBasicMaterial({map:tx, side:THREE.DoubleSide})); sign.position.set(0,7.6,0); g.add(sign);
    g.traverse(o=>{ if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g); };
  for (const L of LIFTS){ station(L.bx, L.bz, L.yaw, L, false); station(L.tx, L.tz, L.yaw, L, true);
    // towers and cable heights come from world.js (placed clear of trails, jumps and paths; see liftLayoutProblems)
    for (const t of L.towers.slice(1, -1)){ const g0 = terrainH(t.x, t.z), top = g0 + t.h;
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.5,t.h,8), steel); tw.position.set(t.x, g0 + t.h/2, t.z); tw.castShadow = true; scene.add(tw);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(5,0.3,0.3), steel); bar.position.set(t.x, top, t.z); bar.rotation.y = L.yaw; scene.add(bar); }
    const nT = Math.max(2, L.towers.length - 1), cableY = u => L.cableAt(u*L.len);
    const off = 2.2, sx = Math.cos(L.yaw), sz = -Math.sin(L.yaw);   // up cable on one side, down on the other
    for (const sd of [-1,1]){ const pts = []; for (let i=0;i<=nT*8;i++){ const u = i/(nT*8); pts.push(new THREE.Vector3(L.bx + (L.tx-L.bx)*u + sx*off*sd, cableY(u), L.bz + (L.tz-L.bz)*u + sz*off*sd)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableM)); }
    // chairs: one instanced mesh per lift, spaced ~30 m, moving round the loop
    const nC = Math.max(4, Math.round(L.len*2/30)), chairG = new THREE.BoxGeometry(1.8,0.2,0.7);
    const chairs = new THREE.InstancedMesh(chairG, new THREE.MeshLambertMaterial({color:new THREE.Color(L.color)}), nC); scene.add(chairs);
    const hangers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08,2.2,0.08), steel, nC); scene.add(hangers);
    liftObjs.push({L, cableY, chairs, hangers, nC, off, sx, sz, phase:0}); } }
const myChair = new THREE.Group(); { const m = new THREE.MeshLambertMaterial({color:0x333a44}); const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.15,0.7), m); seat.position.y = 0.55; myChair.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.8,0.12), m); back.position.set(0,0.95,0.35); myChair.add(back); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08,1.9,0.08), m); bar.position.set(0,1.5,0.35); myChair.add(bar); myChair.visible = false; scene.add(myChair); }
const LIFT_SPEED = 5;   // m/s along the cable
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1,1,1);
function liftPos(o, d){ // d = distance round the loop (0..2*len): up on one side, back down on the other
  const L = o.L, len = L.len, up = d < len, u = up ? d/len : 1 - (d-len)/len, sd = up ? -1 : 1;
  return [L.bx + (L.tx-L.bx)*u + o.sx*o.off*sd, o.cableY(u), L.bz + (L.tz-L.bz)*u + o.sz*o.off*sd, up]; }
function animateLifts(dt){ for (const o of liftObjs){ o.phase = (o.phase + dt*LIFT_SPEED) % (2*o.L.len);
    for (let i=0;i<o.nC;i++){ const [x,y,z,up] = liftPos(o, (o.phase + i*2*o.L.len/o.nC) % (2*o.L.len));
      _q.setFromEuler(_e.set(0, o.L.yaw + (up ? 0 : Math.PI), 0)); _m4.compose(_v.set(x, y-2.3, z), _q, _s); o.chairs.setMatrixAt(i, _m4);
      _m4.compose(_v.set(x, y-1.15, z), _q, _s); o.hangers.setMatrixAt(i, _m4); }
    o.chairs.instanceMatrix.needsUpdate = true; o.hangers.instanceMatrix.needsUpdate = true; } }
{ const el = document.getElementById('liftLegend'); el.innerHTML = LIFTS.map(L => `<div><b style="background:${L.color}"></b>Lift ${L.short}: ${L.serves.join(', ')}</div>`).join(''); }
function liftProximity(dt){ S.liftCool = Math.max(0, (S.liftCool||0) - dt); if (S.lift || S.liftCool > 0 || S.air || S.crashT > 0) return;
  for (let i=0;i<LIFTS.length;i++){ const L = LIFTS[i]; if (Math.hypot(S.x-L.bx, S.z-L.bz) < 4.5){ startLift(i); return; } } }
function startLift(i){ const L = LIFTS[i]; S.lift = {i, d:0}; S.run = null; S.speed = 0; S.vy = 0; S.air = false; S.crumbs = []; S.liftWas = S.yaw;
  $('liftRide').style.display = 'block'; $('liftRide').textContent = `🚡 ${L.name} → ${L.serves.join(' · ')}   (A / Enter to skip)`; camInit = false; }
function liftRide(dt, inp){ const o = liftObjs[S.lift.i], L = o.L;
  S.lift.d += dt*LIFT_SPEED*6;   // the ride itself is sped up so it takes ~10-25 s
  if (S.lift.d >= L.len){ endLift(); return; }
  const [x,y,z] = liftPos(o, S.lift.d); S.x = x; S.z = z; S.y = y - 2.2; S.yaw = S.travel = L.yaw; S.pitch = 0; S.lean = 0; S.speed = 0; myChair.visible = true; myChair.position.set(x, y - 2.95, z); myChair.rotation.y = L.yaw; }
function endLift(){ const L = LIFTS[S.lift.i]; S.lift = null; myChair.visible = false; $('liftRide').style.display = 'none';
  // step off at the top station, facing the first trail it serves
  const tr = trails.find(t => t.name === L.serves[0]), x = L.tx + L.dx*7, z = L.tz + L.dz*7, yaw = Math.atan2(-(tr.pts[0][0]-x), -(tr.pts[0][1]-z));
  updateChunks(x, z, 1e9, 160); placeAt(x, z, yaw); S.liftCool = 3; camInit = false; toast(`🚡 ${L.name} — top station · ${L.serves.join(' · ')}`); }
function shopProximity(dt){ S.shopCool = Math.max(0, (S.shopCool||0) - dt);
  const dx = S.x - (SHOP_POS.x - Math.sin(SHOP_POS.yaw)*8), dz = S.z - (SHOP_POS.z - Math.cos(SHOP_POS.yaw)*8);   // porch steps
  if (!shopOpen && S.shopCool <= 0 && !S.air && dx*dx + dz*dz < 9) openShop(); }
S.score = LS.get('trailDescent.dollahs', 0); S.savedScore = S.score; applyBike();
showOverlay('TRAIL DESCENT', menuMsg());
teleport(spotI, true);
window.__game = S; window.__readInput = readInput; window.__groundH = groundH; window.__lift = i => startLift(i); window.__world = { LIFTS, connectors, trails, features, spots, PARK, SHOP, terrainH, featH, isDirt, nearTrails, base, inPark };
window.__BR = BR; window.__teleport = i => teleport(i); window.__unlocked = unlocked; window.__isOpen = isOpen; window.__chunks = () => chunks.size; window.__renderer = renderer;
window.__sim = (secs, inp) => { const h=1/120; const base={steer:0,pedal:0,brake:0,jump:false,tx:0,ty:0}; for(let t=0;t<secs;t+=h){ step(h, Object.assign({}, base, typeof inp==='function'?inp(t):inp)); trackWorld(h); } return {x:S.x, z:S.z, kmh:S.speed*3.6, air:S.air, lives:S.lives, clean:S.clean, score:S.score}; };
frame();