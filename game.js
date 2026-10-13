import * as THREE from 'three';
import { buildBikeRider } from './rider.js';
import { makeTextures, triplanar } from './textures.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DIFF, W, HALF, PARK, trails, features, spots, groundH, terrainH, featH, featBase, featAxis, BOULDERS, boulderH, bigBouldersNear, base, isDirt, inPark, nearTrails, nearTrees, treesInCell, TCELL, LIFTS, connectors, CW, SHOP, WORLD, RAMPAGE, trailDist } from './world.js';
import { initSfx, setSfxVolume, updateSfx, sfxLand, sfxCrash, sfxLiftStart } from './sfx.js';
const RAMP = WORLD === 'rampage';   // Red Bull Rampage-inspired desert world

const G = 9.81;
// ---------- bikes (shop) ----------
const BIKES = [
  {id:'hardtail', name:'Starter Hardtail', price:0,    color:0xff2fa8, scale:[1,1,1],       drag:1.00, grip:1.00, pop:1.00, stab:1.00, desc:'The bike you know. Balanced.'},
  {id:'trail',    name:'Trail Bike',       price:800,  color:0x2f8cff, scale:[1,1,1.04],    drag:0.94, grip:1.06, pop:1.03, stab:1.05, desc:'A bit faster and grippier everywhere.'},
  {id:'dj',       name:'Dirt Jumper',      price:1500, color:0x22c55e, scale:[0.92,0.9,0.9],drag:1.05, grip:1.00, pop:1.22, stab:1.08, desc:'Small and poppy. Big bunny hops, slower top speed.'},
  {id:'enduro',   name:'Enduro Bike',      price:2500, color:0xff7a12, scale:[1,1.03,1.08], drag:0.88, grip:1.12, pop:1.05, stab:1.12, desc:'Fast and planted on rough descents.'},
  {id:'dh',       name:'DH Bike',          price:4000, color:0x222222, scale:[1.05,1.06,1.14],drag:0.80, grip:1.18, pop:0.95, stab:1.20, desc:'Fastest downhill, most stable landings, least pop.'},
  {id:'bean',     name:'Buckle Bean',      price:5000, color:0x9a5a2e, scale:[1,1.02,1.06], drag:0.86, grip:1.15, pop:1.12, stab:1.15, desc:'The legendary bean bike. Brown frame, blue cape accents, gold buckle hardware.'},
];
const LS = { get:(k,d)=>{ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } }, set:(k,v)=>{ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
const owned = new Set(LS.get('trailDescent.owned', ['hardtail'])); owned.add('hardtail');
let BIKE = BIKES.find(b => b.id === LS.get('trailDescent.bike', 'hardtail') && owned.has(b.id)) || BIKES[0];
const EARN = 0.15;   // DOLLAHS earn rate vs. the old REP values (~15%)
const G_AIR = 9.81*1.35;   // heavier feel in the air: realistic MTB airtime (~0.6-1.0 s off a kicker at 30 km/h)
let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;

// ---------- settings (quality, inverts, volume) ----------
const SETTINGS = Object.assign({quality:'med', invertY:false, invertX:false, volume:0.8, musicOn:true, musicVol:0.5}, LS.get('trailDescent.settings', {}));
const saveSettings = () => LS.set('trailDescent.settings', SETTINGS);
const QUALITY = { low:{pr:0.75, shadow:0, tex:256, grassR:0, grassCell:2, post:false, rocks:10, bushes:10},
                  med:{pr:1.0, shadow:1024, tex:256, grassR:38, grassCell:1.0, post:false, rocks:22, bushes:26},
                  high:{pr:1.5, shadow:2048, tex:512, grassR:55, grassCell:0.75, post:true, rocks:34, bushes:40} };
let Q = QUALITY[SETTINGS.quality] || QUALITY.med;
// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = RAMP ? 0x9cc4e4 : 0xa9cfe6;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(RAMP ? 0xe6d2b4 : 0xc4d7e0, RAMP ? 220 : 180, RAMP ? 3200 : 3800);   // fog fades into the sky's horizon colour (atmospheric haze)
const camera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, 0.1, 6000);
const TEX = makeTextures(Q.tex, RAMP);
scene.add(new THREE.HemisphereLight(0xdff0ff, RAMP ? 0x9a5534 : 0x4a6030, 0.9));
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.3).normalize();
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = Q.shadow > 0; sun.shadow.mapSize.set(Math.max(512, Q.shadow), Math.max(512, Q.shadow)); sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, {left:-40,right:40,top:40,bottom:-40,near:1,far:160});
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;   // no shadow acne / striping on the dirt
scene.add(sun, sun.target);
// post (High): SSAO + subtle bloom; Low/Med render directly
let composer = null;
function setupPost(){ composer = null; if (!Q.post) return;
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const ao = new SSAOPass(scene, camera, innerWidth, innerHeight); ao.kernelRadius = 0.6; ao.minDistance = 0.0004; ao.maxDistance = 0.02; composer.addPass(ao);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.92)); composer.addPass(new OutputPass()); }
setupPost();
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); });
function applyQuality(name){ SETTINGS.quality = name; saveSettings(); Q = QUALITY[name];
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = sun.castShadow = Q.shadow > 0; if (Q.shadow){ sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  setupPost(); grassField.rebuild(true); toast(`Quality: ${name.toUpperCase()} (texture detail applies after reload)`); }
// sky: gradient dome with atmospheric haze toward the horizon, a sun disc and glow (fog matches the horizon colour)
{ const g = new THREE.SphereGeometry(4000, 32, 16);
  const m = new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, fog:false, uniforms:{uSun:{value:SUN_DIR}},
    vertexShader:`varying vec3 p; void main(){p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 p; uniform vec3 uSun; void main(){ vec3 d=normalize(p); float h=d.y;
      vec3 zen=vec3(.22,.45,.82), hor=vec3(.77,.84,.88); vec3 c=mix(hor,zen,pow(clamp(h*1.4,0.,1.),0.6));
      float s=max(dot(d,uSun),0.); c+=vec3(1.,.85,.6)*(pow(s,8.)*0.25+pow(s,64.)*0.5) + vec3(1.,.97,.9)*smoothstep(.9994,.9997,s)*2.;
      c=mix(c,hor,smoothstep(0.08,-0.02,h)*0.9); gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
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
// terrain: per-vertex splat weights (grass, dirt, rock, snow) blend tiled PBR textures sampled in world space at two scales (no visible tiling)
const terrainMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, metalness:0});
terrainMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, {tG:{value:TEX.grass.map}, tD:{value:TEX.dirt.map}, tR:{value:TEX.rock.map}, tS:{value:TEX.snow.map}, nG:{value:TEX.grass.normal}, nD:{value:TEX.dirt.normal}, nR:{value:TEX.rock.normal}, nS:{value:TEX.snow.normal}});
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vTWP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvSplat = splat; vTWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSplat; varying vec3 vTWP; uniform sampler2D tG, tD, tR, tS, nG, nD, nR, nS;\nvec3 tex2(sampler2D t, vec2 p){ return mix(texture2D(t, p*0.33).rgb, texture2D(t, p*0.061).rgb, 0.45); }')
    .replace('#include <map_fragment>', `#include <map_fragment>
      vec4 w = vSplat / max(1e-3, vSplat.x + vSplat.y + vSplat.z + vSplat.w); vec2 P = vTWP.xz;
      vec3 alb = tex2(tG, P)*w.x + tex2(tD, P*1.3)*w.y + tex2(tR, P*0.6)*w.z + tex2(tS, P*0.5)*w.w;
      diffuseColor.rgb *= alb*1.7;`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec4 w2 = vSplat / max(1e-3, vSplat.x + vSplat.y + vSplat.z + vSplat.w); vec2 P2 = vTWP.xz*0.33;
        vec2 tn = (texture2D(nG, P2).xy*w2.x + texture2D(nD, P2*1.3).xy*w2.y + texture2D(nR, P2*0.6).xy*w2.z + texture2D(nS, P2*0.5).xy*w2.w)*2.0 - 1.0;
        normal = normalize(normal + (viewMatrix*vec4(tn.x, 0.0, tn.y, 0.0)).xyz*0.7); }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.55, vSplat.w);'); };
const chunkIndex = (() => { const idx = []; for (let r=0;r<NV-1;r++) for (let k=0;k<NV-1;k++){ const a=r*NV+k, b=a+1, e=a+NV, f=e+1; idx.push(a,e,b, b,e,f); } return new THREE.BufferAttribute(new Uint32Array(idx),1); })();
const C_DIRT = new THREE.Color(RAMP ? 0xb07a52 : 0x8a6640), C_DIRT2 = new THREE.Color(RAMP ? 0x93603e : 0x6e4f30), C_GRASS = new THREE.Color(RAMP ? 0xb5603a : 0x5d8a32), C_GRASS2 = new THREE.Color(RAMP ? 0xc98552 : 0x7aa040),
      C_ROCK = new THREE.Color(RAMP ? 0x9c5136 : 0x857d72), C_SNOW = new THREE.Color(0xe9eef2), C_ALP = new THREE.Color(0x8c9a5a);
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
// shared tree / rock / bush geometry (instanced per chunk)
const mergeGeos = gs => { let n = 0; const ps = gs.map(g => g.index ? g.toNonIndexed() : g); for (const g of ps) n += g.attributes.position.count;
  const P = new Float32Array(n*3), N = new Float32Array(n*3), U = new Float32Array(n*2); let o = 0;
  for (const g of ps){ if (!g.attributes.normal) g.computeVertexNormals(); P.set(g.attributes.position.array, o*3); N.set(g.attributes.normal.array, o*3); if (g.attributes.uv) U.set(g.attributes.uv.array, o*2); o += g.attributes.position.count; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(P,3)); r.setAttribute('normal', new THREE.BufferAttribute(N,3)); r.setAttribute('uv', new THREE.BufferAttribute(U,2)); return r; };
const trunkG = new THREE.CylinderGeometry(0.16,0.34,1,8,1); trunkG.translate(0,0.5,0);
// conifer: 5 layered, drooping tiers with ragged needle edges (spans y 0..1, radius 1)
const coneG = (() => { const tiers = []; for (let k = 0; k < 5; k++){ const r = 1 - k*0.18, hgt = 0.34 - k*0.03, y0 = k*0.17;
    const g = new THREE.ConeGeometry(r, hgt, 14, 2, true); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rad = Math.hypot(x, z); if (y < -hgt*0.45 && rad > 0.01){ const a = Math.atan2(z, x), jag = 1 + 0.16*Math.sin(a*7 + k) + 0.08*Math.sin(a*13 + k*2); p.setXYZ(i, x*jag, y - 0.05*r*(jag-0.9), z*jag); } }
    g.translate(0, y0 + hgt/2, 0); g.computeVertexNormals(); tiers.push(g); }
  tiers.push(new THREE.ConeGeometry(0.2, 0.25, 8).translate(0, 0.9, 0)); return mergeGeos(tiers); })();
const trunkMat = new THREE.MeshStandardMaterial({map:TEX.bark.map, normalMap:TEX.bark.normal, roughness:0.95});
TEX.bark.map.repeat.set(2, 5); TEX.bark.normal.repeat.set(2, 5);
const folMat = new THREE.MeshStandardMaterial({map:TEX.needles.map, normalMap:TEX.needles.normal, roughness:0.85, side:THREE.DoubleSide});
TEX.needles.map.repeat.set(6, 2); TEX.needles.normal.repeat.set(6, 2);
const rockG = (() => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++){ const v = new THREE.Vector3().fromBufferAttribute(p, i), n = 1 + 0.18*Math.sin(v.x*3.1 + v.y*2.3) + 0.12*Math.sin(v.z*5.3 - v.x*1.7) + 0.07*Math.sin(v.y*9.1); v.multiplyScalar(n); v.y *= 0.7; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g; })();
const rockMat = triplanar(new THREE.MeshStandardMaterial({color:RAMP ? 0xd09070 : 0xb8b2a8, roughness:0.9, flatShading:true}), TEX.rock, 0.45, 0.9);
const bushG = (() => { const parts = []; for (let k = 0; k < 4; k++){ const g = new THREE.IcosahedronGeometry(0.55 + 0.2*Math.sin(k*2.1), 1); g.translate(Math.cos(k*1.9)*0.45, 0.35 + 0.15*(k%2), Math.sin(k*1.9)*0.45); parts.push(g); } return mergeGeos(parts); })();
const bushMat = triplanar(new THREE.MeshStandardMaterial({color:RAMP ? 0xc8c79a : 0xffffff, roughness:0.9, flatShading:true}), TEX.needles, 1.2, 0.6);
// wind-swayed grass: one instanced field of blade clumps that follows the rider (cells are world-anchored, so nothing swims)
const windU = {value:0};
const grassField = (() => {
  const blades = []; for (let k = 0; k < 6; k++){ const a = k*1.05 + 0.3, ox = Math.cos(a*2.3)*0.12, oz = Math.sin(a*1.7)*0.12, w = 0.018, h = 0.24 + 0.18*((k*37)%10)/10, lx = Math.cos(a)*w, lz = Math.sin(a)*w, tipx = ox + Math.cos(a+1.2)*0.08, tipz = oz + Math.sin(a+1.2)*0.08;
    blades.push([ox-lx,0,oz-lz, ox+lx,0,oz+lz, tipx,h,tipz]); }
  const P = new Float32Array(blades.flat()), C = new Float32Array(P.length);
  for (let i = 0; i < P.length/3; i++){ const t = P[i*3+1]/0.42; C[i*3] = 0.25 + 0.45*t; C[i*3+1] = 0.38 + 0.42*t; C[i*3+2] = 0.12 + 0.18*t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P,3)); g.setAttribute('color', new THREE.BufferAttribute(C,3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(P.length).map((_, i) => i%3 === 1 ? 1 : 0), 3));
  const mat = new THREE.MeshLambertMaterial({vertexColors:true, side:THREE.DoubleSide});
  mat.onBeforeCompile = sh => { sh.uniforms.uTime = windU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 gw = modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.); float bend = position.y*position.y*3.0, gust = 0.6 + 0.4*sin(uTime*0.6 + gw.x*0.02);
      transformed.x += sin(uTime*1.9 + gw.x*0.23 + gw.z*0.11)*0.09*bend*gust; transformed.z += sin(uTime*1.4 + gw.z*0.19 + gw.x*0.05)*0.06*bend*gust;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz); vec3 nonPerturbedNormal = normal;'); };   /* blades lit like the ground: no dark back faces */
  const MAXN = 22000, mesh = new THREE.InstancedMesh(g, mat, MAXN); mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
  const cache = new Map(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color(), UPV = new THREE.Vector3(0,1,0);
  let cx = 1e9, cz = 1e9;
  function cell(i, j, cs){ const k = i + ',' + j + ',' + cs; let e = cache.get(k); if (e !== undefined) return e;
    let a = (i*73856093 ^ j*19349663 ^ 0x5bd1e995) >>> 0; const r = () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0)/4294967296;
    const x = (i + r())*cs, z = (j + r())*cs, h = terrainH(x, z);
    e = (r() < 0.2 || h > 335 || isDirt(x, z) || featH(x, z) > 0 || Math.hypot(x-SHOP.x, z-SHOP.z) < 14) ? null : {x, z, h, rot: r()*6.28, s: 0.7 + r()*0.8, t: r()};
    if (cache.size > 250000) cache.clear(); cache.set(k, e); return e; }
  function rebuild(force){ const R = RAMP ? 0 : Q.grassR, cs = Q.grassCell; mesh.visible = R > 0; if (!R){ mesh.count = 0; return; }
    let n = 0; const i0 = Math.floor((S.x - R)/cs), i1 = Math.floor((S.x + R)/cs), j0 = Math.floor((S.z - R)/cs), j1 = Math.floor((S.z + R)/cs);
    for (let i = i0; i <= i1 && n < MAXN; i++) for (let j = j0; j <= j1 && n < MAXN; j++){ const e = cell(i, j, cs); if (!e) continue; const d = Math.hypot(e.x - S.x, e.z - S.z); if (d > R) continue;
      const fade = Math.min(1, (R - d)/8); q.setFromAxisAngle(UPV, e.rot); M.compose(pv.set(e.x, e.h - 0.02, e.z), q, sv.set(e.s, e.s*fade, e.s)); mesh.setMatrixAt(n, M); col.setHSL(0.22 + e.t*0.07, 0.5, 0.42 + e.t*0.2); mesh.setColorAt(n++, col); }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; cx = S.x; cz = S.z; }
  window.__dbgGrass = () => ({count: mesh.count, vis: mesh.visible, cache: cache.size});
  return { rebuild, update(){ if (Math.hypot(S.x - cx, S.z - cz) > 4) rebuild(); } };
})();
const chunks = new Map();
const ckey = (i,j) => i+','+j;
function buildChunk(ci, cj){
  const x0 = ci*CH, z0 = cj*CH, grp = new THREE.Group();
  const E = NV+2, hs = new Float32Array(E*E);
  for (let r=0;r<E;r++) for (let k=0;k<E;k++) hs[r*E+k] = terrainH(x0+(k-1)*RES, z0+(r-1)*RES);
  const pos = new Float32Array(NV*NV*3), col = new Float32Array(NV*NV*3), nrm = new Float32Array(NV*NV*3), spl = new Float32Array(NV*NV*4), c = new THREE.Color();
  for (let r=0;r<NV;r++) for (let k=0;k<NV;k++){
    const i = r*NV+k, x = x0+k*RES, z = z0+r*RES, h = hs[(r+1)*E+k+1];
    const dx = hs[(r+1)*E+k+2]-hs[(r+1)*E+k], dz = hs[(r+2)*E+k+1]-hs[r*E+k+1], nl = Math.hypot(dx, 2*RES, dz);
    nrm[i*3] = -dx/nl; nrm[i*3+1] = 2*RES/nl; nrm[i*3+2] = -dz/nl;
    pos[i*3] = k*RES; pos[i*3+1] = h; pos[i*3+2] = r*RES;
    const ny = 2*RES/nl, dirt = isDirt(x,z) ? 1 : 0, m = 0.5+0.5*Math.sin(x*0.013+Math.cos(z*0.011)*2)*Math.cos(z*0.017);
    const rock = dirt ? 0 : Math.min(1, Math.max(0, ((RAMP ? 0.9 : 0.83)-ny)/0.1)), snow = (dirt || RAMP) ? 0 : (h > 328 && ny > 0.78 ? Math.min(0.9, (h-328)/18) : 0), alp = Math.min(1, Math.max(0, (h-210)/60));
    spl[i*4] = (1-dirt)*(1-rock)*(1-snow); spl[i*4+1] = dirt; spl[i*4+2] = rock*(1-snow); spl[i*4+3] = snow;
    if (RAMP){ const band = 0.5 + 0.5*Math.sin(h*0.55 + Math.sin(x*0.02)*1.5); c.setRGB(0.95 + 0.15*m - 0.08*band, 0.9 + 0.1*m - 0.1*band, 0.86 + 0.08*m - 0.08*band); } else
    c.setRGB(0.9 + 0.2*m - 0.1*alp, 0.95 + 0.12*m - 0.12*alp, 0.88 + 0.1*m - 0.05*alp); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm,3)); g.setAttribute('color', new THREE.BufferAttribute(col,3)); g.setAttribute('splat', new THREE.BufferAttribute(spl,4));
  g.setIndex(chunkIndex); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, terrainMat); m.position.set(x0, 0, z0); m.receiveShadow = true; grp.add(m);
  // trees: textured bark, layered needle foliage, varied height/width/tint
  const ts = treesInCell(ci, cj);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
  if (ts.length){
    const trunk = new THREE.InstancedMesh(trunkG, trunkMat, ts.length), fol = new THREE.InstancedMesh(coneG, folMat, ts.length);
    ts.forEach((t, i) => { const h = t.h, wv = 0.85 + ((t.hue*13.7)%1)*0.4, rr = h*0.2*wv; q.setFromAxisAngle(up, t.rot);
      M.compose(p.set(t.x,t.y,t.z), q, sv.set(0.8+h*0.03, h*0.5, 0.8+h*0.03)); trunk.setMatrixAt(i,M);
      M.compose(p.set(t.x,t.y+h*0.16,t.z), q, sv.set(rr, h*0.86, rr)); fol.setMatrixAt(i,M);
      c.setHSL(0.27+t.hue*0.07, 0.35+((t.hue*3.3)%1)*0.2, 0.55+((t.hue*7)%1)*0.3); fol.setColorAt(i,c); });
    for (const im of [trunk,fol]){ im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im); }
  }
  // rocks and bushes (kept off trails, paths and jumps)
  { const r = (() => { let a = (ci*73856093 ^ cj*19349663) >>> 0 || 1; return () => (a = (a*16807) % 2147483647) / 2147483647; })();
    const rk = new THREE.InstancedMesh(rockG, rockMat, Q.rocks), bu = new THREE.InstancedMesh(bushG, bushMat, Q.bushes); let nr = 0, nb = 0;
    for (let i = 0; i < Q.rocks + Q.bushes; i++){ const x = x0+r()*CH, z = z0+r()*CH, h = terrainH(x,z), sc = r(), rot = r()*6.28, rough = r();
      if (isDirt(x,z) || featH(x,z) > 0 || Math.hypot(x-SHOP.x, z-SHOP.z) < 22 || LIFTS.some(L => Math.hypot(x-L.bx, z-L.bz) < 14 || Math.hypot(x-L.tx, z-L.tz) < 14)) continue;
      if (i < Q.rocks){ if (h > 330 && rough < 0.5) continue; const s0 = 0.3 + sc*sc*1.6; q.setFromEuler(new THREE.Euler(rough*0.5, rot, sc*0.4)); M.compose(p.set(x, h - s0*0.25, z), q, sv.set(s0*(0.8+rough*0.6), s0, s0)); rk.setMatrixAt(nr++, M); }
      else { if (h > 300) continue; const s0 = 0.5 + sc*0.9; q.setFromAxisAngle(up, rot); M.compose(p.set(x, h - 0.1, z), q, sv.set(s0, s0*(0.7+rough*0.5), s0)); bu.setMatrixAt(nb, M); c.setHSL(0.24 + rough*0.08, 0.45, 0.55 + sc*0.25); bu.setColorAt(nb++, c); } }
    rk.count = nr; bu.count = nb; for (const im of [rk, bu]) if (im.count){ im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im); } }
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
  const woodMat = new THREE.MeshStandardMaterial({map:TEX.planks.map, normalMap:TEX.planks.normal, roughness:0.85, flatShading:true, side:THREE.DoubleSide});   // procedural plank albedo + normal map
  const dirtMat = triplanar(new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-2}), TEX.dirt, 0.4, 0.8);
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
      for (let i=0;i<=NT;i++) for (let k=0;k<=NU;k++){ const t = i/NT*f.L, u = -UW + k/NU*2*UW, [x,z] = at(t,u), fh = featBase(x,z);
        const edge = k === 0 || k === NU || i === 0 || i === NT;      // outer rim tucks just under the ground
        dv.push(x, meshH(x,z) + fh + (edge ? -0.04 : 0.02), z);
        c.copy(C_DIRT).lerp(C_DIRT2, 0.3 + 0.4*Math.sin(t*1.7+u)*Math.sin(u*2.1)); if (f.rock && !f.boulders && fh > 0.06) c.copy(C_ROCK).lerp(C_DIRT2, 0.2+0.3*Math.sin(t*3.1+u*2.7)); if (f.road && fh < 0.05 && Math.abs(u) < f.hw+0.6) c.setRGB(0.16,0.16,0.17); /* road in the gap */ if (fh < 0.05) c.lerp(C_GRASS, 0.0); dc.push(c.r,c.g,c.b); }
      // wind triangles so faces point up (correct normals -> no black sides)
      const up = (() => { const [x0,z0] = at(0,-UW), [x1,z1] = at(0,UW), [x2,z2] = at(1,-UW); return ((x1-x0)*(z2-z0) - (z1-z0)*(x2-x0)) < 0; })();
      for (let i=0;i<NT;i++) for (let k=0;k<NU;k++){ const a = b0+i*(NU+1)+k, b = a+1, e = a+NU+1, g = e+1; if (up) di.push(a,b,e, b,g,e); else di.push(a,e,b, b,e,g); }
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wv,3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv,2)); wg.setIndex(wi); wg.computeVertexNormals();
  const wm = new THREE.Mesh(wg, woodMat); wm.castShadow = wm.receiveShadow = true; scene.add(wm);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dv,3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(dc,3)); dg.setIndex(di); dg.computeVertexNormals();
  const dm = new THREE.Mesh(dg, dirtMat); dm.castShadow = dm.receiveShadow = true; scene.add(dm); }

// ---------- 3D boulders (rock gardens): each mesh is the exact collider shape (lathe of its height profile) + small surface detail
{ const mk = big => { const pts = []; const b = {h:1, r:1, big}; for (let i = 0; i <= 10; i++){ const d = 1 - i/10; pts.push(new THREE.Vector2(d, boulderH(b, Math.min(d, 0.999)))); }
    pts[0].y = 0; const g = new THREE.LatheGeometry(pts, 11); g.translate(0, -0.02, 0); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), y = p.getY(i), n = 1 + 0.06*Math.sin(x*7.1 + z*3.3) + 0.05*Math.sin(z*9.7 - x*4.1 + y*5);
      p.setXYZ(i, x*n, y > 0.05 ? y*(1 + 0.04*Math.sin(x*11 + z*6)) : y, z*n); }
    g.computeVertexNormals(); return g; };
  const bmat = triplanar(new THREE.MeshStandardMaterial({color:0xa9a39a, roughness:0.85, flatShading:true}), TEX.rock, 0.6, 1.0);
  for (const big of [false, true]){ const list = BOULDERS.filter(b => b.big === big); if (!list.length) continue;
    const im = new THREE.InstancedMesh(mk(big), bmat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((b, i) => { M.compose(new THREE.Vector3(b.x, terrainH(b.x, b.z) + 0.015, b.z), q.setFromEuler(e.set(0, b.rot, 0)), new THREE.Vector3(b.r, b.h, b.r)); im.setMatrixAt(i, M); });
    im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); } }
// ---------- Rampage: finish corral fence + flags, wooden start platforms with scaffold towers ----------
if (RAMP){ const C0 = RAMPAGE.corral, wood = new THREE.MeshStandardMaterial({color:0x9a7048, roughness:0.85}), steel = new THREE.MeshStandardMaterial({color:0x8d939a, roughness:0.4, metalness:0.7});
  const post = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), rail = new THREE.BoxGeometry(0.06, 0.1, 1), flagG = new THREE.PlaneGeometry(0.9, 2.6);
  const N = 64, posts = new THREE.InstancedMesh(post, wood, N), rails = new THREE.InstancedMesh(rail, wood, N*2), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < N; i++){ const a = i/N*Math.PI*2, b = (i+1)/N*Math.PI*2, x = C0.x + Math.cos(a)*C0.r, z = C0.z + Math.sin(a)*C0.r, x2 = C0.x + Math.cos(b)*C0.r, z2 = C0.z + Math.sin(b)*C0.r, h = terrainH(x, z);
    M.compose(new THREE.Vector3(x, h + 0.6, z), q.identity(), new THREE.Vector3(1,1,1)); posts.setMatrixAt(i, M);
    const L = Math.hypot(x2-x, z2-z), yaw = Math.atan2(x2-x, z2-z), gap = Math.abs(Math.abs(Math.sin(a)) - 1) < 0.08, gapPrev = Math.abs(Math.abs(Math.sin(a - Math.PI*2/N)) - 1) < 0.08;   // openings uphill (lines in) and downhill (exit path)   // opening at the uphill side where the lines come in
    if (gap && gapPrev){ M.compose(new THREE.Vector3(x, -999, z), q.identity(), new THREE.Vector3(0,0,0)); posts.setMatrixAt(i, M); }
    for (const [k, y] of [[0, 0.5], [1, 1.0]]){ M.compose(new THREE.Vector3((x+x2)/2, (h + terrainH(x2, z2))/2 + y, (z+z2)/2), q.setFromEuler(e.set(0, yaw, 0)), new THREE.Vector3(1, 1, gap ? 0.001 : L)); rails.setMatrixAt(i*2+k, M); } }
  scene.add(posts, rails);
  const cols = [0xd9772b, 0x1f3d27, 0xe8dcc0, 0xc0392b];
  for (let i = 0; i < 16; i++){ const a = i/16*Math.PI*2 + 0.1, x = C0.x + Math.cos(a)*(C0.r+3), z = C0.z + Math.sin(a)*(C0.r+3), h = terrainH(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.6, 6), steel); pole.position.set(x, h + 2.3, z); scene.add(pole);
    const fl = new THREE.Mesh(flagG, new THREE.MeshStandardMaterial({color:cols[i%4], side:THREE.DoubleSide, roughness:0.8})); fl.position.set(x + 0.45, h + 3.2, z); fl.rotation.y = a; scene.add(fl); }
  for (const tr of trails){ const [x, z] = tr.pts[0], yaw = tr.yaw[0], h = terrainH(x, z);
    const bx = x - Math.sin(yaw)*-3.2, bz = z - Math.cos(yaw)*-3.2, hb = Math.max(h, terrainH(bx, bz));   // deck butts onto the start of the ribbon and sits on the ground (no scaffold towers)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 6.4), wood); deck.position.set(bx, hb + 0.02, bz); deck.rotation.y = yaw; deck.receiveShadow = true; scene.add(deck);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6.4), wood); skirt.position.set(bx, hb - 1.05, bz); skirt.rotation.y = yaw; scene.add(skirt); } }
// ---------- trail markers, start/finish banners ----------
window.__gates = []; let lastBanner = null;
const tanYaw = (tr, i) => { const n = tr.pts.length, a = tr.pts[Math.max(0, i-2)], b = tr.pts[Math.min(n-1, i+2)]; return Math.atan2(-(b[0]-a[0]), -(b[1]-a[1])); };   // travel heading: forward = (-sin, -cos)
{ const poleG = new THREE.CylinderGeometry(0.06,0.06,1.3,6); poleG.translate(0,0.65,0);
  let total = 0; for (const tr of trails) total += 2*Math.ceil(tr.pts.length/8);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshLambertMaterial({color:0xffffff}), total), M = new THREE.Matrix4(), c = new THREE.Color(); let n = 0;
  for (const tr of trails){ c.set(tr.color); if (RAMP) continue;   // Rampage: no marker poles
    for (let i=4;i<tr.pts.length;i+=8) for (const side of [-1,1]){ const yw = tanYaw(tr, i), x = tr.pts[i][0] + Math.cos(yw)*side*(W+0.9), z = tr.pts[i][1] - Math.sin(yw)*side*(W+0.9);
      M.makeTranslation(x, terrainH(x,z), z); poles.setMatrixAt(n, M); poles.setColorAt(n++, c); } }
  poles.count = n; poles.computeBoundingSphere(); scene.add(poles);
  const banner = (x, z, yaw, color, label, half = W+1, sub = null) => { const grp = new THREE.Group(), pm = new THREE.MeshLambertMaterial({color:0x333333});
    // vertical posts, each sunk at its own ground height; level banner at one common height across both
    const c_ = Math.cos(yaw), s_ = Math.sin(yaw), hp = [-1, 1].map(s => terrainH(x + c_*s*half, z - s_*s*half)), h0 = terrainH(x, z), top = Math.max(...hp, h0) + 4.6;
    [-1, 1].forEach((s, k) => { const bot = hp[k] - 0.6, L = top - bot; const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, L, 0.25), pm); p.position.set(s*half, (bot + top)/2 - h0, 0); grp.add(p); });
    const cv = document.createElement('canvas'); cv.width=512; cv.height=96; const cx2 = cv.getContext('2d'); cx2.fillStyle=color; cx2.fillRect(0,0,512,96);
    cx2.fillStyle='#fff'; cx2.textAlign='center';
    if (sub){ cx2.font='bold 40px Arial'; cx2.fillText(label,256,42,490); cx2.font='bold 28px Arial'; cx2.fillText(sub,256,84,490); }
    else { cx2.font='bold 52px Arial'; cx2.fillText(label,256,68,490); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    for (const r of [0, Math.PI]){ const b = new THREE.Mesh(new THREE.PlaneGeometry(2*half,1.2), new THREE.MeshBasicMaterial({map:t})); b.position.set(0, top - h0 - 0.6, r ? -0.01 : 0.01); b.rotation.y = r; grp.add(b); }   // two single-sided faces back to back so the text reads correctly from both sides
    grp.position.set(x, terrainH(x,z), z); grp.rotation.y = yaw; scene.add(grp); lastBanner = {half, posts: [-1, 1].map((s, k) => ({x: x + c_*s*half, z: z - s_*s*half, bot: hp[k] - 0.6, top, ground: hp[k]})), bannerY: top - 0.6, grp}; };
  // gates sit ON the trail centreline and face along the local tangent measured from the points themselves
  const gate = (tr, i, color, label, sub, kind) => { const yaw = tanYaw(tr, i), [x, z] = tr.pts[i]; banner(x, z, yaw, color, label, W+1, sub); window.__gates.push({trail: tr.name, kind, i, x, z, yaw, ...lastBanner}); };
  for (const tr of trails){ const i0 = Math.min(3, tr.pts.length-1), i1 = tr.pts.length-3;
    gate(tr, i0, tr.color === '#111111' ? '#333' : tr.color, 'START · ' + tr.name.toUpperCase(), `${DIFF[tr.diff].icon} ${DIFF[tr.diff].label.toUpperCase()} · ${tr.type.toUpperCase()}`, 'start');
    gate(tr, i1, '#1c9c3a', 'FINISH · ' + tr.name.toUpperCase(), null, 'finish'); }
  for (const tr of trails) tr.cps.forEach((cp, k) => { const i = Math.max(2, Math.min(tr.pts.length-3, Math.round(cp.s/2))); cp.yaw = tanYaw(tr, i); gate(tr, i, '#f2b800', `CHECKPOINT ${k+1}/${tr.cps.length}`, tr.name.toUpperCase(), 'cp'); });
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
addEventListener('keydown', e => { keys[e.code]=true; if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault(); onPress(e.code); });
addEventListener('keyup', e => { keys[e.code]=false; });
// focus loss (alt-tab, clicking outside, Cmd-shortcuts) swallows keyup: clear every held key so W can't stay stuck and pedal forever
const releaseKeys = () => { for (const k in keys) keys[k] = false; };
addEventListener('blur', releaseKeys); document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
addEventListener('keyup', e => { if (e.key === 'Meta') releaseKeys(); });
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
  let l = false, r = false, u = false, d = false;
  if (gp.axes.length >= 8){ const h = gp.axes[6] || 0, v = gp.axes[7] || 0; if (h < -0.5) l = true; if (h > 0.5) r = true; if (v < -0.5) u = true; if (v > 0.5) d = true; }
  if (gp.axes.length >= 10){ const p = gp.axes[9]; if (p !== undefined && p >= -1.05 && p <= 1.05 && Math.abs(p) > 0.05){ const dir = Math.round((p+1)/(2/7));   // 0 up .. 7 up-left
      if (dir >= 1 && dir <= 3) r = true; if (dir >= 5 && dir <= 7) l = true; if (dir === 0 || dir === 1 || dir === 7) u = true; if (dir >= 3 && dir <= 5) d = true; } }
  if (gp.buttons.length > ri){ if (bv(li) > 0.5) l = true; if (bv(ri) > 0.5) r = true; if (bv(li-2) > 0.5) u = true; if (bv(li-1) > 0.5) d = true; }
  return {DL:l, DR:r, DU:u, DD:d};
}
function padMap(gp){
  const bv = i => { const b = gp.buttons[i]; if (!b) return 0; if (typeof b !== 'object') return b; return (b.pressed && !b.value) ? 1 : b.value; };
  const ax = i => gp.axes[i] || 0;
  if (gp.mapping === 'standard'){
    return { lx:ax(0), rx:ax(2), ry:ax(3), lt:bv(6), rt:bv(7),
      ly:ax(1), btn:{A:bv(0)>0.5, B:bv(1)>0.5, X:bv(2)>0.5, Y:bv(3)>0.5, LB:bv(4)>0.5, RB:bv(5)>0.5, RS:bv(11)>0.5, Back:bv(8)>0.5, Start:bv(9)>0.5, DL:bv(14)>0.5, DR:bv(15)>0.5, DU:bv(12)>0.5, DD:bv(13)>0.5} };
  }
  if (gp.axes.length >= 6){   // Firefox XInput-style: triggers on axes 2 & 5
    return { lx:ax(0), rx:ax(3), ry:ax(4), lt:trigAxis(gp,2), rt:trigAxis(gp,5),
      ly:ax(1), btn:{A:bv(0)>0.5, B:bv(1)>0.5, X:bv(2)>0.5, Y:bv(3)>0.5, LB:bv(4)>0.5, RB:bv(5)>0.5, RS:bv(9)>0.5, Back:bv(6)>0.5, Start:bv(7)>0.5, ...dpadNS(gp, bv, 13, 14)} };
  }
  // other non-standard layouts: right stick on 2,3, triggers as buttons 6,7
  return { lx:ax(0), rx:ax(2), ry:ax(3), lt:Math.max(bv(6), 0), rt:Math.max(bv(7), 0),
    ly:ax(1), btn:{A:bv(0)>0.5, B:bv(1)>0.5, X:bv(2)>0.5, Y:bv(3)>0.5, LB:bv(4)>0.5, RB:bv(5)>0.5, RS:bv(11)>0.5, Back:bv(8)>0.5, Start:bv(9)>0.5, ...dpadNS(gp, bv, 14, 15)} };
}

// Descenders default Xbox layout:
// LS steer (x) / lean fwd-back (y) · RT pedal · LT brake · RS down = pump/preload, RS down->up = bunny hop,
// RS up = counter-pump · RS left/right in air = tweak · LB + RS direction = trick · B respawn · Y switch camera
// X reset camera · Menu pause. (View toggles the help panel; A starts/restarts from menus.)
let kbSpacePrev = false;
// ---------- drivetrain: 1x12 (32T ring, 10-51T cassette), 29er wheel (2.3 m roll-out). Visual only: physics speed is untouched ----------
const DRV = (() => { const COGS = [51,45,39,33,28,24,21,18,16,14,12,10], RING = 32, CIRC = 2.3, SHIFT_T = 0.28;   // gear 1 = 51T (easiest) .. 12 = 10T
  const D = { gear: 4, cadence: 0, standing: 0, pending: 0, shiftT: 0, manualT: 0, crankRpm: 0, COGS, RING, CIRC };
  D.rpmAt = (speed, g) => speed/CIRC*60 * COGS[g-1]/RING;          // crank rpm = wheel rpm x cog / ring
  D.manual = dir => { D.pending = Math.max(1, Math.min(12, (D.pending || D.gear) + dir)); D.shiftT = SHIFT_T; D.manualT = 4; };
  D.update = (S, inp, dt) => { const sp = S.speed || 0, pedal = !S.air && S.crashT <= 0 && !S.lift && (inp.pedal || 0) > 0.05, up = Math.max(0, S.slope || 0);
    D.manualT = Math.max(0, D.manualT - dt);
    if (!D.pending && D.manualT <= 0){   // auto-shift one cog at a time toward ~80 rpm (85-90 when climbing); only while pedalling or rolling
      const tgt = up > 0.06 ? 88 : 78; let best = D.gear, bd = 1e9; for (let g = 1; g <= 12; g++){ const dd = Math.abs(D.rpmAt(Math.max(sp, 1.2), g) - tgt); if (dd < bd){ bd = dd; best = g; } }
      if (up > 0.12) best = Math.min(best, 6);                   // steep climbs: stay in the big cogs
      const cad = D.rpmAt(sp, D.gear); if (best !== D.gear && (cad < 68 || cad > 92 || Math.abs(best - D.gear) > 1)){ D.pending = D.gear + Math.sign(best - D.gear); D.shiftT = SHIFT_T; } }
    if (D.pending){ D.shiftT -= dt * (pedal ? 1 : 0.6); if (D.shiftT <= 0){ D.gear = D.pending; D.pending = 0; } }
    D.crankRpm = D.rpmAt(sp, D.gear);
    // spun out (>125 rpm in top gear) -> stop pedalling and coast; from a standstill the crank turns at least ~40 rpm while pushing off
    D.cadence = pedal ? (D.crankRpm > 125 ? 0 : Math.max(D.crankRpm, 40*(inp.pedal || 0))) : 0;
    D.standing = D.cadence > 0 ? 1 : 0;   // rider pose: standing pedalling vs standing attack (coasting); rider.js eases between them
    const el = document.getElementById('gearVal'); if (el){ const t = `${D.gear}/12`; if (el.textContent !== t) el.textContent = t; el.classList.toggle('shifting', !!D.pending); } };
  return D; })();
window.__drv = DRV;
function readInput(){
  const inp = {rsy:0, counter:false, steer:0, lean:0, pedal:0, brake:0, pumpHold:false, pop:false, tweak:0, trick:null, kbFlip:0, pressed:{}};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads){ if (!gp || !gp.connected) continue;
    if (!knownPads[gp.index]){ knownPads[gp.index]=true; toast('🎮 Controller connected: ' + gp.id.slice(0,40)); }
    const m = padMap(gp), rx = dz(m.rx), ry = dz(m.ry);
    inp.steer += dz(m.lx); inp.lean += dz(m.ly);
    inp.pedal = Math.max(inp.pedal, dz(m.rt, 0.12)); inp.brake = Math.max(inp.brake, dz(m.lt, 0.12));   // trigger deadzone: a resting trigger that reads 0.05-0.1 must not pedal
    if (m.btn.LB){ const mag = Math.hypot(rx,ry);   // LB + right stick: 8 directions (diagonals = tuck no-hander, X-up, nac-nac, tailwhip), RS click = barspin; stick amount = trick strength
      if (m.btn.RS){ inp.trick = 'bar'; inp.trickAmt = 1; }
      else if (mag > 0.35){ const sec = Math.round(Math.atan2(ry, rx)/(Math.PI/4)); inp.trick = {0:'right', 1:'dr', 2:'down', 3:'dl', 4:'left', '-4':'left', '-3':'ul', '-2':'up', '-1':'ur'}[sec]; inp.trickAmt = Math.min(1, (mag-0.35)/0.6); } }
    else { if (ry > 0.5) inp.pumpHold = true; if (ry < -0.5){ inp.pop = true; inp.counter = true; } inp.tweak = rx; inp.rsy = ry; }
    inp.dpx = (m.btn.DR?1:0) - (m.btn.DL?1:0); inp.dpy = (m.btn.DD?1:0) - (m.btn.DU?1:0); inp.lsx = dz(m.lx); inp.lsy = dz(m.ly);
    for (const name of ['A','B','X','Y','Start','Back','DL','DR','DU','DD','LB','RB']){ const now=!!m.btn[name], key=gp.index+'_'+name; if(now && !prevBtn[key]) inp.pressed[name]=true; prevBtn[key]=now; }
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
  if (SETTINGS.invertY) inp.lean = -inp.lean; if (SETTINGS.invertX) inp.tweak = -inp.tweak;   // Settings: invert options (input mapping only)
  return inp;
}

// ---------- Game state ----------
const S = { x:0,y:0,z:0, yaw:0, speed:0, vy:0, vx:0, vz:0, air:false, airT:0, pitch:0, spin:0, takeoffPitch:0, lean:0,
  preload:0, lives:3, score:0, bestAir:0, totalAir:0, crashT:0, time:0, state:'menu', paused:false, lastVyG:0, trickMsgT:0,
  maxKmh:0, clean:0, spins:0, flips:0, finishes:0 };
const $ = id => document.getElementById(id);
const trickEl = $('trick'), centerEl = $('center');
function flash(msg, t=1.2){ centerEl.textContent = msg; centerEl.style.opacity = 1; S.flashT = t; }
function placeAt(x, z, yaw){
  S.x = x; S.z = z; S.y = groundH(S.x,S.z); S.yaw = yaw;
  S.speed = 0; S.vy = 0; S.air = false; S.travel = S.yaw; S.wYaw = S.wPitch = 0; S.nose = 0; S.susp = S.suspV = 0; S.pitch = 0; S.spin = 0; S.lean = 0; S.preload = 0; S.crashT = 0; S.tweak = 0; S.trick = null; S.landCool = 0.3;
}
function resetGame(){
  Object.assign(S,{lives:3,bestAir:0,totalAir:0,time:0,maxKmh:0,clean:0,spins:0,flips:0,finishes:0,parkClean:0,state:'riding',paused:false});
  teleport(spotI, true); $('overlay').classList.add('hidden'); closeMenu();
}
function crash(reason){ S.lastCrash = reason; sfxCrash();
  if (S.crashT>0) return;
  S.crashT = 2.0; S.air = false; trickEl.textContent = reason;
  // health only counts during a trail run; in free roam a crash just respawns you
  if (S.run){ S.lives--;
    if (S.lives <= 0){ const tr = trails[S.run.t]; S.failedRun = S.run.t; S.run = null; flash('RUN OVER', 2); toast(`💀 Out of health — ${tr.name} run ended. Back to the start.`); }
    else flash('BAIL!', 2); }
  else flash('BAIL!', 1.5);
}
function showOverlay(title,msg){ $('overlay').classList.remove('hidden'); $('overlayBox').querySelector('h1').textContent=title; $('overlayMsg').innerHTML=msg; }
function togglePause(){ if (S.state!=='riding' || shopOpen || bigMap.open) return; S.paused=!S.paused; if (S.paused) openMenu('pause'); else closeMenu(); }
function onPress(code){
  if (S.lift){ if (code==='A'||code==='Enter'||code==='Space') S.lift.d = 1e9; return; }   // skip the chairlift ride
  if (shopOpen){ shopKey(code); return; }
  if (bigMap.open){ mapKey(code); return; }
  if (menu.open){ menuKey(code); return; }
  if ((code==='Back'||code==='KeyM') && S.state==='riding' && !S.lift){ openMap(); return; }
  if (code==='Y' && S.paused){ $('help').classList.toggle('hidden'); return; }   // help moved into the pause menu on the controller
  if ((code==='X'||code==='KeyO') && (S.state==='menu' || S.paused)){ openShop(); return; }
  if (code==='KeyO' && S.state==='riding'){ openShop(); return; }
  if (code==='Enter' || code==='A'){ if (S.state==='menu'||S.state==='over'||S.state==='finished'){ resetGame(); return; } }
  if (code==='Space' && (S.state==='menu'||S.state==='over'||S.state==='finished')) { resetGame(); return; }
  if (code==='KeyP'||code==='Escape'||code==='Start') togglePause();
  if (code==='KeyV'||code==='Y'){   // (C is the keyboard trick modifier, so the camera stays on V)
  camMode = (camMode+1)%CAM_NAMES.length; LS.set('trailDescent.cam', camMode); camInit = false; drone.t = 0; toast('🎥 Camera: ' + CAM_NAMES[camMode]); }
  if (code==='KeyX'||code==='X') camInit = false;
  if (code==='KeyH') $('help').classList.toggle('hidden');
  if ((code==='KeyR'||code==='B') && S.state==='riding' && !S.paused) { respawnSafe(); flash('RESPAWN',0.8); }
  // teleport between spots: D-pad ← → on the controller, [ ] / , . or 1-8 on the keyboard
  if (S.state==='riding' && !S.paused && (code==='DU'||code==='KeyG')) DRV.manual(+1);
  if (S.state==='riding' && !S.paused && (code==='DD'||code==='KeyF')) DRV.manual(-1);
  if (S.state==='riding' && !S.paused){
    if (code==='DL'||code==='BracketLeft'||code==='Comma') teleport(nextOpen(spotI,-1));
    if (code==='DR'||code==='BracketRight'||code==='Period') teleport(nextOpen(spotI,1));
    const m = /^Digit([0-9])$/.exec(code), num = m ? (+m[1]||10) + (keys.ShiftLeft||keys.ShiftRight ? 10 : 0) : 0; if (m && num <= spots.length){ const j = num-1; /* 1-9,0 = spots 1-10; Shift+1-5 = spots 11-15 */ if (isOpen(j)) teleport(j); else toast(`🔒 ${spots[j].name} is locked — ${lockMsg(spotTrail(j))}`); }
  } else if (S.state==='menu' && (code==='DL'||code==='DR'||code==='BracketLeft'||code==='BracketRight')){
    spotI = nextOpen(spotI, code==='DL'||code==='BracketLeft' ? -1 : 1); $('overlayMsg').innerHTML = menuMsg(); }
}
const CAM_NAMES = ['Chase', 'Far chase', 'Low chase', 'Helmet cam', 'GoPro chest', 'Side tracking', 'Trackside drone'];
let camMode = Math.min(CAM_NAMES.length-1, LS.get('trailDescent.cam', 0) | 0); const drone = {t: 0, p: new THREE.Vector3()};
// ---------- open world: spots, safe respawn, trail runs ----------
// teleport unlocks: a trail's spot unlocks after you finish that trail once. Flow Line, the park and the meadow are always open.
const UKEY = RAMP ? 'trailDescent.unlocked.rampage' : 'trailDescent.unlocked';
const unlocked = new Set((() => { try { return JSON.parse(localStorage.getItem(UKEY) || '[]'); } catch(e){ return []; } })());
function saveUnlocks(){ try { localStorage.setItem(UKEY, JSON.stringify([...unlocked])); } catch(e){} }
const spotTrail = i => i < trails.length ? trails[i] : null;
const ALWAYS = new Set(['Flow Line', 'Formation Ridge']);
const anyOtherDone = tr => trails.some(o => o !== tr && o.kind === tr.kind && !o.pro && unlocked.has(o.name));   // BONE CRUSHER: opens once any other Rampage line is done
const isOpen = i => { const tr = spotTrail(i); return !tr || ALWAYS.has(tr.name) || unlocked.has(tr.name) || (tr.unlockAny && anyOtherDone(tr)); };
const lockMsg = tr => tr.unlockAny ? `finish any other Rampage line to unlock ${tr.name}` : `finish ${tr.name} once to unlock it`;
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
  // inside the dirt jump park: back to the top of the roll-in of the line you were on (nearest by lateral offset), facing down it, stopped
  if (!RAMP && PARK.lines && inPark(S.x, S.z)){ const d = PARK.dir, sx = -d[1], sz = d[0], lat = (S.x-PARK.x)*sx + (S.z-PARK.z)*sz;
    const opts = [...PARK.lines.map(l => ({off:l.off, t:l.start})), ...(PARK.drop ? [{off:PARK.drop.off, x:PARK.drop.x + PARK.drop.dx*3, z:PARK.drop.z + PARK.drop.dz*3}] : [])];
    const o = opts.reduce((a, b) => Math.abs(b.off - lat) < Math.abs(a.off - lat) ? b : a);
    const x = o.x ?? PARK.x + d[0]*o.t + sx*o.off, z = o.z ?? PARK.z + d[1]*o.t + sz*o.off;
    placeAt(x, z, Math.atan2(-d[0], -d[1])); S.speed = 0; S.crumbs = []; S.crumbT = 0; camInit = false; S.parkRespawn = o.off; return; }
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
        if (!unlocked.has(tr.name)){ const pro = trails.find(o => o.unlockAny && o !== tr), wasPro = pro && anyOtherDone(pro); unlocked.add(tr.name); saveUnlocks(); setTimeout(()=>toast(`🔓 Unlocked: ${tr.name} — teleport there any time`), 1200);
          if (pro && !wasPro && anyOtherDone(pro)) setTimeout(()=>toast(`☠ ${pro.name} UNLOCKED — the hardest line on the mountain. PRO only.`), 4200); }
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
// big boulders are solid: head-on = crash, glancing = deflect off with a speed loss; hop high enough and you clear them
function hitBoulders(){ for (const b of bigBouldersNear(S.x, S.z)){
    const dx = S.x - b.x, dz = S.z - b.z, d = Math.hypot(dx, dz), R = b.r*0.95 + 0.12;
    if (d >= R) continue; const top = terrainH(b.x, b.z) + boulderH(b, Math.min(d, b.r*0.999));
    if (S.y > top - 0.05) continue;                                             // above the rock (hopped / rolled onto it from the air)
    const nxv = dx/(d||1), nzv = dz/(d||1), vx = -Math.sin(S.travel), vz = -Math.cos(S.travel), into = -(vx*nxv + vz*nzv);   // 1 = straight at it
    if (into > 0.75 && S.speed > 3){ S.x = b.x + nxv*R; S.z = b.z + nzv*R; S.y = groundH(S.x, S.z); S.air = false; crash('Hit a boulder!'); return true; }
    // glance: slide round the rock, lose some speed
    const tx = -nzv, tz = nxv, s = Math.sign(vx*tx + vz*tz) || 1; S.travel = Math.atan2(-tx*s, -tz*s); S.yaw = S.travel + wrapA(S.yaw - S.travel)*0.3;
    S.speed *= into > 0 ? 0.75 - 0.3*into : 0.95; S.x = b.x + nxv*R; S.z = b.z + nzv*R; if (!S.air) S.y = groundH(S.x, S.z);
    S.vx = -Math.sin(S.travel)*S.speed; S.vz = -Math.cos(S.travel)*S.speed; S.boulderHits = (S.boulderHits||0) + 1; return false; }
  return false; }
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
    const slope = (h1-h0)/0.5; S.slope = slope;
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
    let vyFeat = null, backFeat = false;
    { const fa = featAxis(nx, nz) || featAxis(S.x, S.z);
      if (fa) backFeat = (S.vx*fa.dx + S.vz*fa.dz) < -0.2*S.speed;   // riding a jump the wrong way (up a landing / over the back of a lip)
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
        } else if (!backFeat) vyFeat = (fAlong - f0)/dt; } }   // backwards: no ramp lip speed, it's just a hill
    // vertical speed from ground-following never exceeds slope x horizontal speed along the travel direction
    const fdx = -Math.sin(S.travel), fdz = -Math.cos(S.travel), g0 = groundH(S.x, S.z);
    const gradeF = Math.max(0, (groundH(S.x + fdx*0.5, S.z + fdz*0.5) - g0)/0.5, (g0 - groundH(S.x - fdx*0.5, S.z - fdz*0.5))/0.5, (ng - g0)/Math.max(0.05, S.speed*dt));
    let vyG = vyFeat === null ? (ng - S.y)/dt : (terrainH(nx,nz) - (S.y - featH(S.x,S.z)))/dt + vyFeat;
    vyG = Math.max(-1.5*S.speed - 3, Math.min(vyG, (vyFeat !== null ? 1.5 : Math.min(1.0, gradeF))*S.speed + 0.3));   // ramp faces keep their full lip speed
    S.landCool = Math.max(0, (S.landCool||0) - dt);
    S.gf = (S.gf||0) + 1;
    const crestG = inp.counter ? G*2.2 : G*1.15;   // counter-pump (RS up) keeps you glued over rollers
    // small boulders: wheels follow the real rock shape; each climb costs speed and jolts the bike, never launches
    const rockH = featH(nx, nz) - featBase(nx, nz), onRock = rockH > 0.005 || (featH(S.x, S.z) - featBase(S.x, S.z)) > 0.005;
    if (onRock){ const climb = Math.max(0, ng - S.y); S.speed = Math.max(0, S.speed - climb*(2.2 + S.speed*0.25)); S.suspV = (S.suspV||0) + climb*25; S.jolt = Math.min(1, (S.jolt||0) + climb*4);
      vyG = THREE.MathUtils.clamp(vyG, -2, 2); S.rockT = 0.25; }
    S.rockT = Math.max(0, (S.rockT||0) - dt);
    let crest = S.gf > 3 && S.landCool <= 0 && (S.lastVyG - vyG)/dt > crestG && S.speed > 4 && S.rockT <= 0;
    const edge = (ng - S.y) < -0.12 && (S.lastVyG - vyG)/dt > G_AIR*3 && S.speed > 1.5;   // rolling off a ledge/lip: the ground drops away faster than you can fall
    if (backFeat && !edge) crest = false;   // wrong-way over a jump: roll over it, never pop off its crest
    if (edge && !crest && S.rockT <= 0 && S.landCool <= 0) crest = true;   // never re-launch right after touching down (no landing bounce)
    if (crest){ // only leave the ground if the ballistic path really clears the terrain (no micro-hops)
      let clear = 0; for (let t=0.03; t<=0.18; t+=0.03){ const bx=S.x+S.vx*t, bz=S.z+S.vz*t, by=S.y+S.lastVyG*t-0.5*G_AIR*t*t; const gap_=by-groundH(bx,bz); if (t < 0.065 && gap_ < 0.03){ clear = 0; break; } clear=Math.max(clear, gap_); }   // must actually separate right away (no 1-frame micro-hops)
      if (clear < 0.4) crest = false; }
    if (pop > 0 || crest){
      S.air = true; S.airT = 0; S.vy = (backFeat ? Math.min(S.lastVyG, 0.1*S.speed) : S.lastVyG) + pop; S.takeoffPitch = S.pitch; S.spin = 0; S.popped = pop > 0;
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
    if (hitBoulders()) return;
    if (S.speed > 4) for (const t of nearTrees(S.x, S.z)) if ((t.x-S.x)**2 + (t.z-S.z)**2 < 0.55) { crash('Hit a tree!'); return; }
  } else {
    S.airT += dt; S.vy -= G_AIR*dt;
    S.x += S.vx*dt; S.z += S.vz*dt; S.y += S.vy*dt;
    if (hitBoulders()) return;
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
  const impact = -vn; S.suspV = (S.suspV||0) + Math.min(impact,15)*0.12; S.dustBurst = Math.min(1, impact/8); sfxLand(impact);
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
  const inp = readInput(); if (Object.keys(inp.pressed).length) startMusic();
  for (const k in inp.pressed) onPress(k);
  if (S.state==='riding' && !S.paused && S.lift){ liftRide(dt, inp); }
  else if (S.state==='riding' && !S.paused){
    acc += dt; const h = 1/120; while (acc >= h){ step(h, inp); acc -= h; }
    trackWorld(dt); shopProximity(dt); liftProximity(dt);
  } else if (S.state!=='riding' && S.state!=='menu') { step(dt, {steer:0,pedal:0,brake:1,jump:false,tx:0,ty:0}); }
  updateSfx({riding: S.state==='riding' && !S.paused, speed:S.speed||0, air:!!S.air && S.crashT<=0, lift:!!S.lift, sliding:!!S.sliding, brake:inp.brake||0, crank:BR.crank(), surface: S.rockT > 0 ? 'rock' : isDirt(S.x,S.z) ? 'dirt' : 'grass'});
  windU.value += dt; grassField.update();
  if (menu.open) menuFrame(dt, inp);
  const flyF = S.state === 'menu' ? flyover(dt) : null, fX = flyF ? flyF[0] : S.x, fZ = flyF ? flyF[1] : S.z;
  animateLifts(dt); updateChunks(fX, fZ); farU.value.set(fX, fZ, coveredR);
  // pose bike
  bike.position.set(S.x, S.y, S.z);
  // whole-bike orientation as one quaternion (yaw * pitch * lean/tweak); after a landing it slerps to the target over ~0.15 s instead of snapping
  _eY.set(0, S.yaw + S.spin, 0); _qT.setFromEuler(_eY); _eY.set(S.pitch + (S.nose||0)*0.5, 0, 0); _qT.multiply(_q2.setFromEuler(_eY));
  _eY.set(0, (S.tweak||0)*0.45, -S.lean + (S.tweak||0)*0.7, 'YXZ'); _qT.multiply(_q2.setFromEuler(_eY)); _eY.order = 'XYZ';
  if (S.air) S.landBlend = 0.15; else if (S.landBlend > 0) S.landBlend -= dt;
  if (!S.air && S.landBlend > 0) bike.quaternion.slerp(_qT, 1 - Math.exp(-dt/0.04)); else bike.quaternion.copy(_qT);
  pitchG.rotation.set(0,0,0); leanG.rotation.set(0,0,0);   // whip/scrub: stick right = bike whips right
  DRV.update(S, inp, dt); inp.cadence = DRV.cadence; inp.standing = DRV.standing;
  BR.update(S, inp, dt);                                       // rider pose: IK on grips/pedals, blended trick keyframes, barspin/tailwhip bike parts
  rig.position.z = (S.weight||0)*0.12;                         // visible fore/aft weight transfer
  { // sag 25% at rest; susp (-0.05..0.3) maps onto the rest of the travel; bottom-out at full travel
    const tr_ = THREE.MathUtils.clamp(0.25 + (S.susp||0)/0.3*0.75, 0, 1), [df, dr] = BR.setSusp(tr_, tr_*0.97);
    rig.position.y = -(df + dr)/2 + 0.04; rig.scale.y = 1;
    if (tr_ >= 0.995 && !S.bottomed){ S.bottomed = true; sfxLand(18); } else if (tr_ < 0.8) S.bottomed = false; }
  spawnDust(dt);
  for (const w of wheels) w.rotation.x -= S.speed*dt/0.36;
  // camera
  const ch = S.travel ?? S.yaw; const fx = -Math.sin(ch), fz = -Math.cos(ch);
  const cm = camMode < 3 ? camMode : 0, back = [5.2,8,3.4][cm] + S.speed*0.04;
  const fov = 66 + Math.min(14, S.speed*0.45); if (Math.abs(camera.fov-fov) > 0.05){ camera.fov += (fov-camera.fov)*Math.min(1,dt*3); camera.updateProjectionMatrix(); }
  const tp = new THREE.Vector3(S.x - fx*back, 0, S.z - fz*back);
  tp.y = Math.max(groundH(tp.x,tp.z), S.y) + [2.3,3.4,1.7][cm];
  const tl = new THREE.Vector3(S.x + fx*4, S.y + 1.0, S.z + fz*4);
  if (!camInit || camPos.distanceTo(tp) > 40){ camPos.copy(tp); camLook.copy(tl); camInit = true; }
  const k = 1 - Math.exp(-dt*6);
  camPos.lerp(tp, k); camLook.lerp(tl, 1 - Math.exp(-dt*10));
  camera.position.copy(camPos);
  camRoll = THREE.MathUtils.lerp(camRoll, -S.lean*0.18 + (S.sliding ? S.slip*0.1 : 0), Math.min(1, dt*4));
  camera.up.set(Math.sin(camRoll)*Math.cos(ch), Math.cos(camRoll), -Math.sin(camRoll)*Math.sin(ch)); camera.lookAt(camLook);
  BR.head.visible = !(camMode === 3 && !S.lift && S.state === 'riding');
  if (camMode >= 3 && !S.lift && S.state === 'riding'){ const sx = -fz, sz = fx, up = 1;
    if (camMode === 3 || camMode === 4){   // first person: helmet (bars in view) / chest mount
      const hy = camMode === 3 ? 1.78 : 1.32, fw = camMode === 3 ? 0.32 : 0.36, pitchDn = camMode === 3 ? 0.55 : 0.35;
      camera.position.set(S.x + fx*fw, S.y + hy, S.z + fz*fw); camera.up.set(0,1,0); camera.lookAt(S.x + fx*6, S.y + hy - 6*pitchDn*0.4 + (S.vy||0)*0.05, S.z + fz*6);
      if (camera.near !== 0.05){ camera.near = 0.05; camera.updateProjectionMatrix(); } }
    else if (camMode === 5){ const t = new THREE.Vector3(S.x + sx*5 - fx*1, Math.max(groundH(S.x + sx*5, S.z + sz*5), S.y) + 1.2, S.z + sz*5 - fz*1);   // side tracking
      camPos.lerp(t, 1 - Math.exp(-dt*5)); camera.position.copy(camPos); camera.up.set(0,1,0); camera.lookAt(S.x, S.y + 0.9, S.z); }
    else { // drone: parks ahead beside the trail, pans as you pass, then leapfrogs ahead
      const d = Math.hypot(drone.p.x - S.x, drone.p.z - S.z); drone.t -= dt;
      if (drone.t <= 0 || d > 55){ const side = Math.random() < 0.5 ? -1 : 1, ax = S.x + fx*35 + sx*side*12, az = S.z + fz*35 + sz*side*12; drone.p.set(ax, Math.max(groundH(ax, az), S.y - 8) + 9, az); drone.t = 6; }
      camera.position.copy(drone.p); camera.up.set(0,1,0); camera.lookAt(S.x, S.y + 0.8, S.z); } }
  else if (camera.near !== 0.1){ camera.near = 0.1; camera.updateProjectionMatrix(); }
  if (window.__camSide){ const o = window.__camSide, c = Math.cos(S.yaw), s_ = Math.sin(S.yaw); camera.position.set(S.x + c*o.d + Math.sin(S.yaw)*(o.b||0), S.y + (o.h||1.2), S.z - s_*o.d + Math.cos(S.yaw)*(o.b||0)); camera.up.set(0,1,0); camera.lookAt(S.x, S.y + 0.9, S.z); }   // test hook: side camera for pose screenshots
  if (flyF) flyover(0);
  else if (shopOpen) shopCam(dt);   // main menu: flyover camera replaces the chase cam
  mountains.position.set(camera.position.x, 0, camera.position.z);
  skyDome.position.copy(camera.position);
  if (!flyF){ sun.position.set(S.x+30, S.y+60, S.z+20); sun.target.position.set(S.x, S.y, S.z-10); }
  if (composer) composer.render(); else renderer.render(scene, camera);
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
  if (S.flashT > 0){ S.flashT -= dt; if (S.flashT<=0) centerEl.style.opacity = 0; }   // fade out (text stays until the next message)
  fpsN++; fpsT+=dt; if (fpsT>1){ window.__fps = fpsN/fpsT; fpsN=0; fpsT=0; }
}
// ---------- minimap ----------
const mm = $('minimap'), mmx = mm.getContext('2d'), MMS = mm.width, mmBg = document.createElement('canvas');
{ mmBg.width = mmBg.height = MMS; const x = mmBg.getContext('2d'), img = x.createImageData(MMS, MMS), sc = 2*HALF/MMS;
  for (let j=0;j<MMS;j++) for (let i=0;i<MMS;i++){ const wx = -HALF+(i+.5)*sc, wz = -HALF+(j+.5)*sc, h = base(wx,wz), dh = base(wx+sc,wz)-h, k = (j*MMS+i)*4;
    const v = 70 + Math.min(150, Math.max(0, h*0.45)) + dh*4, band = (Math.floor(h/25)&1) ? 8 : 0;
    if (RAMP){ img.data[k] = v*1.05+band; img.data[k+1] = v*0.66+band; img.data[k+2] = v*0.46; } else { img.data[k] = v*0.75+band; img.data[k+1] = v*0.95+band; img.data[k+2] = v*0.7; } img.data[k+3] = 255; }
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
    const v = 70 + Math.min(150, Math.max(0, h*0.45)) + dh*8, band = (Math.floor(h/25)&1) ? 8 : 0; if (RAMP){ img.data[k] = v*1.05+band; img.data[k+1] = v*0.66+band; img.data[k+2] = v*0.46; } else { img.data[k] = v*0.75+band; img.data[k+1] = v*0.95+band; img.data[k+2] = v*0.7; } img.data[k+3] = 255; }
  x.putImageData(img, 0, 0); return cv; }
const mapScale = () => { const sz = Math.min(innerWidth - 300, innerHeight - 40), s = sz/(2*HALF); return {s, ox: 20 + (innerWidth - 300 - sz)/2, oy: (innerHeight - sz)/2, sz}; };
function openMap(){ bigMap.open = true; bigMap.wasPaused = S.paused; S.paused = true; bigMap.cx = S.x; bigMap.cz = S.z; bm.width = innerWidth; bm.height = innerHeight; $('bigmapWrap').classList.remove('hidden'); }
function closeMap(){ bigMap.open = false; S.paused = bigMap.wasPaused; $('bigmapWrap').classList.add('hidden'); }
function mapTeleport(){ const {s} = mapScale(); let best = -1, bd = 1e9; spots.forEach((p, i) => { const d = Math.hypot(p.x-bigMap.cx, p.z-bigMap.cz)*s; if (d < 22 && d < bd){ bd = d; best = i; } });
  if (best < 0){ toast('Move the cursor onto a spot to teleport'); return; }
  if (!isOpen(best)){ toast(`🔒 ${spots[best].name} is locked — ${lockMsg(spotTrail(best))}`); return; }
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
  c.clearRect(0, 0, bm.width, bm.height); c.fillStyle = 'rgba(20,26,18,.92)'; c.fillRect(0, 0, bm.width, bm.height);
  c.imageSmoothingEnabled = true; c.drawImage(bigBg || (bigBg = makeBigBg()), ox, oy, sz, sz); c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(ox, oy, sz, sz);
  // connectors, park, shop
  c.strokeStyle = 'rgba(235,215,170,.9)'; c.lineWidth = 1.5; for (const k of connectors){ c.beginPath(); k.pts.forEach((p, i) => { if (i%3 && i < k.pts.length-1) return; const [a,b] = P(p[0],p[1]); i ? c.lineTo(a,b) : c.moveTo(a,b); }); c.stroke(); }
  if (RAMP){ const [a,b] = P(RAMPAGE.corral.x, RAMPAGE.corral.z); c.strokeStyle = '#d9772b'; c.lineWidth = 3; c.beginPath(); c.arc(a, b, RAMPAGE.corral.r*s, 0, 7); c.stroke(); }
  if (!RAMP) { const [a,b] = P(PARK.x, PARK.z); c.fillStyle = 'rgba(160,110,60,.9)'; c.beginPath(); c.arc(a, b, PARK.r*s, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 13px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.fillText('🏁 Dirt Jump Park', a, b - PARK.r*s - 6); }
  { const [a,b] = P(SHOP.x, SHOP.z); c.font = '18px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.fillText('🚲', a, b+6); c.font = 'bold 12px "Barlow Condensed", sans-serif'; c.fillStyle = '#ffe08a'; c.fillText('Bike Shop', a, b+20); }
  // trails (locked = dashed + dim) with checkpoints
  for (const [i, tr] of trails.entries()){ const open = isOpen(i); c.globalAlpha = open ? 1 : 0.55; c.setLineDash(open ? [] : [6,4]);
    c.strokeStyle = '#000'; c.lineWidth = 5; c.beginPath(); tr.pts.forEach((p, j) => { if (j%3 && j < tr.pts.length-1) return; const [a,b] = P(p[0],p[1]); j ? c.lineTo(a,b) : c.moveTo(a,b); }); c.stroke();
    c.strokeStyle = tr.color === '#111111' ? '#444' : tr.color; c.lineWidth = 3; c.stroke(); c.setLineDash([]);
    for (const cp of tr.cps){ const [a,b] = P(cp.x, cp.z); c.fillStyle = '#f2b800'; c.beginPath(); c.moveTo(a, b-5); c.lineTo(a+4, b+3); c.lineTo(a-4, b+3); c.closePath(); c.fill(); } c.globalAlpha = 1; }
  // lifts with served trails
  c.textAlign = 'left';
  for (const L of LIFTS){ const [a,b] = P(L.bx,L.bz), [e,f] = P(L.tx,L.tz); c.strokeStyle = '#111'; c.lineWidth = 4; c.beginPath(); c.moveTo(a,b); c.lineTo(e,f); c.stroke(); c.strokeStyle = L.color; c.lineWidth = 2; c.setLineDash([5,3]); c.stroke(); c.setLineDash([]);
    for (const [p,q] of [[a,b],[e,f]]){ c.fillStyle = L.color; c.fillRect(p-5,q-5,10,10); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(p-5,q-5,10,10); }
    c.font = 'bold 12px "Barlow Condensed", sans-serif'; c.lineWidth = 3; c.strokeStyle = '#000'; c.fillStyle = '#fff'; const t = `🚡 ${L.short}: ${L.serves.join(', ')}`; c.strokeText(t, a+8, b+4); c.fillText(t, a+8, b+4); }
  // trail labels at the start: name, difficulty icon, type, lock state
  for (const [i, tr] of trails.entries()){ const open = isOpen(i), [a,b] = P(tr.pts[0][0], tr.pts[0][1]), d = DIFF[tr.diff];
    c.font = 'bold 12px "Barlow Condensed", sans-serif'; c.lineWidth = 3; c.strokeStyle = '#000'; c.fillStyle = open ? '#fff' : '#aaa'; const t = `${open ? '' : '🔒 '}${tr.name}`; c.strokeText(t, a+9, b-4); c.fillText(t, a+9, b-4);
    c.font = '11px "Barlow Condensed", sans-serif'; c.fillStyle = /^#(000|111|222)/.test(d.color) || d.color==='black' ? '#eee' : d.color; const t2 = `${d.icon} ${d.label} · ${tr.type}`; c.strokeText(t2, a+9, b+9); c.fillText(t2, a+9, b+9); }
  // spots
  c.textAlign = 'center'; c.font = 'bold 11px "Barlow Condensed", sans-serif';
  spots.forEach((p, i) => { const [a,b] = P(p.x, p.z), open = isOpen(i); c.fillStyle = open ? '#fff' : 'rgba(60,60,60,.9)'; c.beginPath(); c.arc(a, b, 8, 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); c.fillStyle = open ? '#000' : '#bbb'; c.fillText(open ? String(i+1) : '🔒', a, b+4); });
  // waypoints
  waypoints.forEach((w, i) => { const [a,b] = P(w.x, w.z); c.fillStyle = '#3ef0ff'; c.strokeStyle = '#003'; c.lineWidth = 2; c.beginPath(); c.moveTo(a, b-9); c.lineTo(a+7, b); c.lineTo(a, b+9); c.lineTo(a-7, b); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#003'; c.fillText(String(i+1), a, b+4); });
  // rider position + heading
  { const [a,b] = P(S.x, S.z); c.save(); c.translate(a, b); c.rotate(-(S.yaw + (S.spin||0))); c.fillStyle = '#ffd84d'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0,-11); c.lineTo(7,8); c.lineTo(-7,8); c.closePath(); c.fill(); c.stroke(); c.restore(); }
  // cursor + hover info
  { const [a,b] = P(bigMap.cx, bigMap.cz); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(a, b, 10, 0, 7); c.moveTo(a-18, b); c.lineTo(a-6, b); c.moveTo(a+6, b); c.lineTo(a+18, b); c.moveTo(a, b-18); c.lineTo(a, b-6); c.moveTo(a, b+6); c.lineTo(a, b+18); c.stroke();
    let hov = -1; spots.forEach((p, i) => { if (Math.hypot(p.x-bigMap.cx, p.z-bigMap.cz)*s < 22) hov = i; });
    const dist = Math.round(Math.hypot(bigMap.cx - S.x, bigMap.cz - S.z)); c.textAlign = 'left'; c.font = 'bold 13px "Barlow Condensed", sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
    const t = hov >= 0 ? `${spots[hov].name} — ${isOpen(hov) ? 'A / Enter: teleport' : '🔒 locked'}` : `${dist} m away`; c.strokeText(t, a+16, b-14); c.fillText(t, a+16, b-14); }
  // legend
  const lx = innerWidth - 270, rows = [['━', '#fff', 'Trail (dashed + 🔒 = locked)'], ['▲', '#f2b800', 'Checkpoint'], ['■', '#e53935', 'Lift station (dashed line = lift)'], ['─', '#ebd7aa', 'Connector path'], ...(RAMP ? [['◯', '#d9772b', 'Finish corral']] : [['●', '#a06e3c', 'Dirt Jump Park']]), ['🚲', '#fff', 'Bike Shop'], ['①', '#fff', 'Teleport spot'], ['◆', '#3ef0ff', `Waypoint (max ${WP_MAX})`], ['▲', '#ffd84d', 'You']];
  c.fillStyle = 'rgba(26,22,15,.88)'; c.fillRect(lx-12, 20, 262, 46 + rows.length*20 + 140); c.textAlign = 'left'; c.font = '28px "Bebas Neue", sans-serif'; c.fillStyle = '#d9772b'; c.fillText('MAP', lx, 44);
  c.font = '13px "Barlow Condensed", sans-serif'; rows.forEach(([ic, col, label], k) => { c.fillStyle = col; c.fillText(ic, lx, 70 + k*20); c.fillStyle = '#ddd'; c.fillText(label, lx + 26, 70 + k*20); });
  let y = 80 + rows.length*20; c.fillStyle = '#fff'; c.font = 'bold 13px "Barlow Condensed", sans-serif'; c.fillText('Difficulty', lx, y); c.font = '13px "Barlow Condensed", sans-serif';
  for (const k of ['green','blue','black','dblack', ...(trails.some(t => t.diff === 'pro3') ? ['pro3'] : [])]){ y += 18; c.fillStyle = /^#(000|111|222)/.test(DIFF[k].color) || DIFF[k].color==='black' ? '#eee' : DIFF[k].color; c.fillText(`${DIFF[k].icon} ${DIFF[k].label}`, lx, y); }
  y += 26; c.fillStyle = '#bbb'; c.font = '12px "Barlow Condensed", sans-serif';
  for (const l of ['Stick / D-pad / arrows / mouse: move cursor', 'A / Enter / double-click: teleport', 'X / W / click: set or remove waypoint', 'B / M / View: close']){ c.fillText(l, lx, y); y += 16; }
}
syncBeacons();
// ---------- music: shuffled CC0 playlist (starts after the first user input, per browser autoplay rules) ----------
const TRACKS = [
  {file:'music/actiontrack.mp3', title:'Action Track', artist:'LushoGames', src:'opengameart.org/content/action-track'},
  {file:'music/simplebeat.mp3', title:'Simple Action Beat', artist:'LushoGames', src:'opengameart.org/content/simple-action-beat'},
  {file:'music/rock-theme-3.mp3', title:'Rock Theme 3', artist:'Umplix', src:'opengameart.org/content/rock-theme-3'},
  {file:'music/fastsong.mp3', title:'Fast Cheerful Punk Rock Lo-fi', artist:'annandistance', src:'opengameart.org/content/fast-cheerful-punk-rock-lo-fi'},
];
const music = { el: new Audio(), order: [], i: -1, started: false };
music.el.preload = 'auto';
const shuffle = a => { for (let i = a.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function musicVol(){ music.el.volume = SETTINGS.musicOn ? SETTINGS.musicVol : 0; }
function nextSong(){ if (!SETTINGS.musicOn) return; if (++music.i >= music.order.length){ music.order = shuffle(TRACKS.map((_, k) => k)); music.i = 0; }
  const t = TRACKS[music.order[music.i]]; music.el.src = t.file; musicVol(); music.el.play().then(() => toast(`♪ Now playing: ${t.title} — ${t.artist} (CC0)`)).catch(() => {}); }
music.el.addEventListener('ended', nextSong);
function startMusic(){ initSfx(); setSfxVolume(SETTINGS.volume); if (music.started || !SETTINGS.musicOn) return; music.started = true; nextSong(); }
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, startMusic, {once:false});
function setMusicOn(on){ SETTINGS.musicOn = on; saveSettings(); if (on){ if (!music.started){ music.started = true; nextSong(); } else if (music.el.paused){ musicVol(); music.el.play().catch(()=>{}); } } else music.el.pause(); }

// ---------- menus: main menu (flyover), trails, settings, credits, pause ----------
const menu = { open:false, page:'main', sel:0, stack:[], repeatT:0, fly:0 };
const ON = v => v ? 'ON' : 'OFF', PCT = v => Math.round(v*100) + '%';
function trailItems(){ return trails.map((tr, i) => { const d = DIFF[tr.diff], open = isOpen(i);
  return {label:`<span class="dIcon" style="color:${d.color === '#111' ? '#e8e2d0' : d.color}">${d.icon}</span> ${open ? '' : '🔒 '}${tr.name}`, sub:`${d.label} · ${tr.type}${open ? '' : tr.unlockAny ? ' · finish any other Rampage line to unlock' : ' · finish it once to unlock'}`, disabled:!open, act:() => { spotI = i; startRide(); }}; }); }
const PAGES = {
  main: () => ({title:null, items:[
    {label:'Ride', sub:RAMP ? 'Free roam from the Valley Overlook' : 'Free roam from the base plaza', act:() => { spotI = spots.findIndex(s => s.name.startsWith(RAMP ? 'Valley Overlook' : 'Valley Base')); startRide(); }},
    {label:'World', value:RAMP ? 'RAMPAGE' : 'MOUNTAIN', sub:RAMP ? 'Utah desert freeride venue (Red Bull Rampage style)' : 'Alpine bike park', adj:() => switchWorld(), act:() => switchWorld()},
    {label:'Trails', sub:`${trails.filter((_, i) => isOpen(i)).length}/${trails.length} unlocked — drop in at a trail start`, act:() => go('trails')},
    {label:'Bike Shop', sub:`$${S.score.toLocaleString()} DOLLAHS`, act:() => openShop()},
    {label:'Settings', sub:'Quality, music, controls, invert', act:() => go('settings')},
    {label:'Credits', act:() => go('credits')} ]}),
  trails: () => ({title:RAMP ? 'RAMPAGE LINES' : 'TRAILS', items:[...trailItems(), ...(RAMP ? [] : [{label:'Dirt Jump Park', sub:'Pro line · always open', act:() => { spotI = spots.findIndex(s => s.name === 'Dirt Jump Park'); startRide(); }}]), {label:'‹ Back', act:back}]}),
  settings: () => ({title:'SETTINGS', items:[
    {label:'Quality', value:SETTINGS.quality.toUpperCase(), adj:d => { const q = ['low','med','high'], k = Math.max(0, Math.min(2, q.indexOf(SETTINGS.quality) + d)); if (q[k] !== SETTINGS.quality) applyQuality(q[k]); }, act:() => { const q = ['low','med','high']; applyQuality(q[(q.indexOf(SETTINGS.quality)+1)%3]); }},
    {label:'Music', value:ON(SETTINGS.musicOn), adj:() => setMusicOn(!SETTINGS.musicOn), act:() => setMusicOn(!SETTINGS.musicOn)},
    {label:'Music volume', value:PCT(SETTINGS.musicVol), adj:d => { SETTINGS.musicVol = Math.max(0, Math.min(1, Math.round((SETTINGS.musicVol + d*0.1)*10)/10)); saveSettings(); musicVol(); }},
    {label:'Sound volume', value:PCT(SETTINGS.volume), sub:'sound effects (0% = mute)', adj:d => { SETTINGS.volume = Math.max(0, Math.min(1, Math.round((SETTINGS.volume + d*0.1)*10)/10)); saveSettings(); setSfxVolume(SETTINGS.volume); }},
    {label:'Invert lean / flip (left stick ↕)', value:ON(SETTINGS.invertY), adj:() => { SETTINGS.invertY = !SETTINGS.invertY; saveSettings(); }, act:() => { SETTINGS.invertY = !SETTINGS.invertY; saveSettings(); }},
    {label:'Invert whip / tweak (right stick ↔)', value:ON(SETTINGS.invertX), adj:() => { SETTINGS.invertX = !SETTINGS.invertX; saveSettings(); }, act:() => { SETTINGS.invertX = !SETTINGS.invertX; saveSettings(); }},
    {label:'Controls / help', value:$('help').classList.contains('hidden') ? 'SHOW' : 'HIDE', act:() => $('help').classList.toggle('hidden')},
    {label:'‹ Back', act:back} ]}),
  credits: () => ({title:'CREDITS', html:`<div class="credits"><p><b>Grip 'N Rip</b> — an open-world mountain bike game in the browser.</p>
    <p><b>Game, code, world, rider and bike models, textures:</b> made procedurally for this project (Three.js r160).</p>
    <p><b>Music (CC0, from OpenGameArt.org):</b><br>${TRACKS.map(t => `${t.title} — ${t.artist} <small>(${t.src})</small>`).join('<br>')}</p>
    <p><b>Fonts:</b> Bebas Neue & Barlow Condensed (SIL Open Font License, Google Fonts).</p>
    <p><b>Trick references:</b> Red Bull slopestyle trick dictionary, X Games BMX Tricktionary, riding.guide.</p>
    <p><b>Engine:</b> three.js (MIT).</p></div>`, items:[{label:'‹ Back', act:back}]}),
  pause: () => ({title:'PAUSED', items:[
    {label:'Resume', act:() => togglePause()},
    {label:'Map', sub:'View / M', act:() => { closeMenu(); openMap(); bigMap.wasPaused = false; }},
    {label:'Bike Shop', act:() => openShop()},
    {label:'Skip song', sub: music.started && SETTINGS.musicOn && music.i >= 0 ? `Now: ${TRACKS[music.order[music.i]].title} — ${TRACKS[music.order[music.i]].artist}` : 'Music is off or not started', act:() => { if (!music.started){ music.started = true; } nextSong(); }},
    {label:'Settings', act:() => go('settings')},
    {label:'Controls / help', act:() => $('help').classList.toggle('hidden')},
    {label:'Main Menu', sub:'Leave the ride (progress and DOLLAHS are saved)', act:() => toMainMenu()} ]}),
};
function renderMenu(){ const P = PAGES[menu.page](), el = $('menuPanel');
  menu.items = P.items; menu.sel = Math.max(0, Math.min(menu.sel, P.items.length-1));
  el.innerHTML = (P.title ? `<h2>${P.title}</h2>` : '') + (P.html || '') + `<ul class="mItems${menu.page === 'trails' ? ' scroll' : ''}">` + P.items.map((it, k) =>
    `<li data-k="${k}" class="${k === menu.sel ? 'sel' : ''}${it.disabled ? ' dis' : ''}"><span class="mLabel">${it.label}</span>${it.value !== undefined ? `<span class="mVal">${it.adj ? '‹ ' : ''}${it.value}${it.adj ? ' ›' : ''}</span>` : ''}${it.sub ? `<small>${it.sub}</small>` : ''}</li>`).join('') + '</ul>';
  $('menuLogo').style.display = menu.page === 'main' ? '' : 'none';
  el.querySelectorAll('li').forEach(li => { const k = +li.dataset.k; li.onmouseenter = () => { if (menu.sel !== k){ menu.sel = k; renderMenu(); } }; li.onclick = () => { menu.sel = k; menuKey('Enter'); }; });
  const s = el.querySelector('li.sel'); if (s && s.scrollIntoView) s.scrollIntoView({block:'nearest'});
  $('menuHint').textContent = menu.page === 'main' ? 'D-pad / stick / arrows: choose · A / Enter: select' : 'D-pad / stick / arrows: choose · ← → change · A / Enter: select · B / Esc: back'; }
function openMenu(page){ menu.open = true; menu.page = page; menu.sel = 0; menu.stack = []; $('menu').classList.remove('hidden'); $('menu').classList.toggle('pause', page === 'pause'); document.body.classList.toggle('inmenu', page !== 'pause'); renderMenu(); }
function closeMenu(){ menu.open = false; document.body.classList.remove('inmenu'); $('menu').classList.add('hidden'); }
function go(page){ menu.stack.push([menu.page, menu.sel]); menu.page = page; menu.sel = 0; renderMenu(); }
function back(){ if (!menu.stack.length){ if (menu.page === 'pause') togglePause(); return; } [menu.page, menu.sel] = menu.stack.pop(); renderMenu(); }
function switchWorld(){ LS.set('trailDescent.world', RAMP ? 'mountain' : 'rampage'); $('loading').classList.remove('done'); $('loading').textContent = RAMP ? 'LOADING THE MOUNTAIN…' : 'LOADING RAMPAGE…'; setTimeout(() => location.reload(), 50); }
function startRide(){ closeMenu(); resetGame(); }
function toMainMenu(){ S.paused = false; S.state = 'menu'; S.run = null; S.lift = null; myChair.visible = false; $('liftRide').style.display = 'none'; camInit = false; openMenu('main'); $('loading').classList.add('done'); }
function menuKey(code){ const it = menu.items[menu.sel];
  if (['DU','ArrowUp','KeyW'].includes(code)){ do { menu.sel = (menu.sel - 1 + menu.items.length) % menu.items.length; } while (menu.items[menu.sel].disabled && menu.items.some(i => !i.disabled) && false); renderMenu(); }
  else if (['DD','ArrowDown','KeyS'].includes(code)){ menu.sel = (menu.sel + 1) % menu.items.length; renderMenu(); }
  else if (['DL','ArrowLeft','KeyA','DR','ArrowRight','KeyD'].includes(code)){ if (it.adj){ it.adj(['DL','ArrowLeft','KeyA'].includes(code) ? -1 : 1); renderMenu(); } }
  else if (['A','Enter','Space'].includes(code)){ if (it.disabled){ toast('🔒 Locked — finish that trail once (ride there or take a lift) to unlock it'); return; } it.act && it.act(); if (menu.open) renderMenu(); }
  else if (['B','Escape','Backspace'].includes(code)) back();
  else if ((code === 'Start' || code === 'KeyP') && menu.page === 'pause') togglePause(); }
function menuFrame(dt, inp){ // analog stick navigation with repeat
  const y = inp.lsy || 0; menu.repeatT -= dt;
  if (Math.abs(y) > 0.6 && menu.repeatT <= 0){ menuKey(y > 0 ? 'DD' : 'DU'); menu.repeatT = 0.22; } else if (Math.abs(y) < 0.3) menu.repeatT = 0;
  const x = inp.lsx || 0; if (Math.abs(x) > 0.7 && (menu.xT = (menu.xT || 0) - dt) <= 0){ menuKey(x > 0 ? 'DR' : 'DL'); menu.xT = 0.3; } else if (Math.abs(x) < 0.3) menu.xT = 0; }
// slow camera flyover of the mountain behind the main menu
function flyover(dt){ menu.fly += dt*0.035; const a = menu.fly, cx = RAMP ? 0 : 120, cz = RAMP ? -80 : -150, r = RAMP ? 560 : 760;
  const x = cx + Math.cos(a)*r, z = cz + Math.sin(a)*r, y = Math.max(terrainH(x, z), terrainH(cx + Math.cos(a+0.05)*r, cz + Math.sin(a+0.05)*r)) + 110;
  camera.position.set(x, y, z); camera.up.set(0,1,0); camera.lookAt(cx + Math.cos(a+0.9)*260, RAMP ? 110 : 170, cz + Math.sin(a+0.9)*260);
  sun.position.set(x+30, y+60, z+20); sun.target.position.set(x - Math.cos(a)*60, y - 60, z - Math.sin(a)*60); return [x, z]; }
// ---------- bike shop: bikes + cosmetic skins (paint and rider gear; visual only) ----------
const C = x => new THREE.Color(x);
const SKINS = {
  paint: [ {id:'stock', name:'Factory Stock', price:0, desc:'The colour it came in.'},
    {id:'black', name:'Matte Stealth', price:100, mode:0, a:0x15161a, r:0.85, m:0.1, desc:'Solid matte black.'},
    {id:'red', name:'Race Red', price:150, mode:0, a:0xd21f26, r:0.3, m:0.4, desc:'Solid gloss red.'},
    {id:'lime', name:'Acid Lime', price:150, mode:0, a:0x9be22d, r:0.35, m:0.3, desc:'Solid gloss lime.'},
    {id:'two', name:'Forest Two-Tone', price:300, mode:1, a:0x2f5d3a, b:0xe8dcc0, r:0.4, m:0.3, desc:'Green lower half, cream top tube.'},
    {id:'fade', name:'Sunset Fade', price:500, mode:2, a:0xff6a00, b:0x7b2cbf, r:0.3, m:0.5, desc:'Orange to purple fade.'},
    {id:'camo', name:'Woodland Camo', price:650, mode:3, a:0x4b5a32, b:0x2b2a1f, c:0x8a7a52, r:0.8, m:0.05, desc:'Three-colour woodland camo.'},
    {id:'decal', name:'Factory Race Decals', price:800, mode:5, a:0xf2f2f2, b:0xd9772b, c:0x1f3d27, r:0.35, m:0.2, desc:'White with orange and green race stripes.'},
    {id:'carbon', name:'Raw Carbon', price:900, mode:4, a:0x0c0c0e, b:0x3a3b40, r:0.25, m:0.4, desc:'Exposed carbon weave, clear coat.'},
    {id:'chrome', name:'Mirror Chrome', price:1500, mode:0, a:0xe8ecf2, r:0.06, m:1.0, env:true, desc:'Polished chrome. Very loud.'},
    {id:'bean', name:'Buckle Bean', price:2000, mode:5, a:0x9a5a2e, b:0x1f5fbf, c:0xf2b705, r:0.35, m:0.3, desc:'Bean brown with royal-blue cape stripes and gold buckle bands.'} ],
  jersey: [ {id:'stock', name:'Stock Orange', price:0, mode:0, a:0xff7a12},
    {id:'forest', name:'Forest Stripes', price:200, mode:5, a:0x2f5d3a, b:0xe8dcc0, c:0xd9772b},
    {id:'hoops', name:'Retro Hoops', price:250, mode:6, a:0x1e4fd8, b:0xf5f5f5},
    {id:'chev', name:'Chevron Pro', price:350, mode:7, a:0x111111, b:0xffd400},
    {id:'camo', name:'Camo Jersey', price:400, mode:3, a:0x4b5a32, b:0x2b2a1f, c:0x8a7a52},
    {id:'pink', name:'Hot Pink', price:150, mode:0, a:0xff2fa8},
    {id:'bean', name:'Buckle Bean', price:600, mode:5, a:0x9a5a2e, b:0x1f5fbf, c:0xf2b705, desc:'Bean brown with a blue cape on your back and a gold buckle belt stripe.'} ],
  pants: [ {id:'stock', name:'Navy', price:0, a:0x23283a}, {id:'black', name:'Black', price:100, a:0x111214}, {id:'tan', name:'Desert Tan', price:150, a:0xb59a6a}, {id:'red', name:'Red', price:200, a:0xa8161c}, {id:'olive', name:'Olive', price:150, a:0x4f5631}, {id:'bean', name:'Buckle Bean', price:300, a:0x7a4524, desc:'Bean brown with a black belt and gold buckle.'} ],
  helmet: [ {id:'stock', name:'Matte Black', price:0, mode:0, a:0x141416, r:0.75, m:0.05, desc:'Stealthy matte black full-face.'},
    {id:'white', name:'Gloss White', price:150, mode:0, a:0xf2f2f2, r:0.3, m:0.1},
    {id:'red', name:'Race Red', price:200, mode:0, a:0xc81e1e, r:0.35, m:0.1},
    {id:'blue', name:'Cobalt Blue', price:200, mode:0, a:0x1e4fd8, r:0.35, m:0.1},
    {id:'orange', name:'Factory Orange', price:200, mode:0, a:0xff7a12, r:0.35, m:0.1},
    {id:'camoh', name:'Desert Camo', price:400, mode:3, a:0x8a7a52, b:0x4b4030, c:0xc8b48a, r:0.8, m:0.0},
    {id:'flag', name:'Flag Stripes', price:500, mode:5, a:0xf2f2f2, b:0xc81e1e, c:0x1e4fd8, r:0.4, m:0.1},
    {id:'neon', name:'Neon Fade', price:700, mode:2, a:0x39ff14, b:0xff2fa8, r:0.3, m:0.2},
    {id:'gcarbon', name:'Gloss Carbon', price:900, mode:4, a:0x0c0c0e, b:0x45464c, r:0.12, m:0.4},
    {id:'gold', name:'Gold Premium', price:1500, mode:0, a:0xd4a52a, r:0.2, m:1.0},
    {id:'stripe', name:'Race Stripe', price:250, mode:5, a:0xf5f5f5, b:0xd9772b, c:0x1f3d27},
    {id:'check', name:'Checkerboard', price:400, mode:8, a:0xf5f5f5, b:0x111111},
    {id:'carbon', name:'Carbon Shell', price:600, mode:4, a:0x0c0c0e, b:0x3a3b40},
    {id:'flames', name:'Flames', price:700, mode:9, a:0xffe14d, b:0x151515, c:0xff4b12},
    {id:'bean', name:'Buckle Bean', price:2000, mode:5, a:0x9a5a2e, b:0x1f5fbf, c:0xf2b705, r:0.45, m:0.1, desc:'Bean brown shell, smiley face, blue cape stripe, gold buckle.'} ],
  goggles: [ {id:'stock', name:'Blue Mirror', price:0, a:0x3a6ea8}, {id:'clear', name:'Clear', price:100, a:0xcfd8dc, m:0.2}, {id:'gold', name:'Gold Mirror', price:150, a:0xd4a017}, {id:'red', name:'Fire Red', price:200, a:0xd62a1e}, {id:'smoke', name:'Smoke', price:120, a:0x222428}, {id:'bean', name:'Buckle Bean', price:300, a:0xf2b705, m:0.95, desc:'Gold buckle lenses with a royal-blue strap.'} ] };
const SKIN_CATS = ['paint','jersey','pants','helmet','goggles'], SHOP_TABS = ['bikes', ...SKIN_CATS];
const TAB_LABEL = {bikes:'Bikes', paint:'Paint', jersey:'Jersey', pants:'Pants', helmet:'Helmet', goggles:'Goggles'};
const ownedSkins = new Set(LS.get('trailDescent.cosmetics', []));
const skinOf = LS.get('trailDescent.skins', {});   // { bikeId: {paint, jersey, pants, helmet, goggles} }
const isOwned = (cat, it) => it.price === 0 || ownedSkins.has(cat + ':' + it.id);
const equippedSkin = (bike, cat) => SKINS[cat].find(i => i.id === (skinOf[bike.id] || {})[cat]) || SKINS[cat][0];
let chromeEnv = null;
function setSkin(mat, it, fallback){ const u = mat.userData.skin;
  if (u){ u.uMode.value = it.mode || 0; u.uA.value.set(it.a ?? fallback); if (it.b !== undefined) u.uB.value.set(it.b); if (it.c !== undefined) u.uC.value.set(it.c); }
  mat.color.set(it.a ?? fallback); }
function applySkins(over){ const M = BR.M, g = k => (over && over[0] === k) ? over[1] : equippedSkin(BIKE, k);
  const p = g('paint'); setSkin(M.frame, p, BIKE.color); M.frame.roughness = p.r ?? 0.4; M.frame.metalness = p.m ?? 0.3;
  if (p.env && !chromeEnv){ const pm = new THREE.PMREMGenerator(renderer); chromeEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; }
  M.frame.envMap = p.env ? chromeEnv : null; M.frame.needsUpdate = true;
  setSkin(M.jersey, g('jersey')); { const h = g('helmet'); setSkin(M.helmet, h); M.helmet.roughness = h.r ?? 0.6; M.helmet.metalness = h.m ?? 0.1; } M.pants.color.set(g('pants').a);
  const gg = g('goggles'); M.lens.color.set(gg.a); M.lens.metalness = gg.m ?? 0.9;
  const jr = g('jersey'), pa = g('pants'), hm = g('helmet'); BR.bean.cape.visible = jr.id === 'bean'; BR.bean.belt.visible = pa.id === 'bean'; BR.bean.face.visible = hm.id === 'bean'; M.strap.color.set(gg.id === 'bean' ? 0x1f5fbf : 0x111111); }
let shopOpen = false, shopSel = 0, shopWasPaused = false, shopTab = 0, shopT = 0;
function applyBike(){ leanG.scale.set(...BIKE.scale); applySkins(); }
function shopItems(){ const t = SHOP_TABS[shopTab]; return t === 'bikes' ? BIKES : SKINS[t]; }
function openShop(){ shopOpen = true; shopWasPaused = S.paused; if (S.state==='riding') S.paused = true; shopTab = 0; shopSel = BIKES.indexOf(BIKE); shopT = 0; renderShop(); $('shop').classList.remove('hidden'); document.body.classList.add('inshop'); }
function closeShop(){ shopOpen = false; applySkins(); $('shop').classList.add('hidden'); document.body.classList.remove('inshop'); if (S.state==='riding'){ S.paused = shopWasPaused; if (!S.paused) $('overlay').classList.add('hidden'); } S.shopCool = 3; }
function bar(v){ const p = Math.round(50 + (v-1)*250); return `<span class="sbar"><i style="width:${Math.max(8,Math.min(100,p))}%"></i></span>`; }
const hex = c => '#' + C(c).getHexString();
function swatch(it, cat){ if (cat === 'paint' && it.id === 'stock') return hex(BIKE.color);
  if (it.mode === 2) return `linear-gradient(90deg,${hex(it.a)},${hex(it.b)})`; if (it.b !== undefined) return `linear-gradient(135deg,${hex(it.a)} 50%,${hex(it.b)} 50%)`; return hex(it.a); }
function renderShop(){
  $('shopBal').textContent = '$' + S.score.toLocaleString() + ' DOLLAHS';
  const t = SHOP_TABS[shopTab];
  $('shopTabs').innerHTML = SHOP_TABS.map((k,i) => `<span class="tab${i===shopTab?' on':''}">${TAB_LABEL[k]}</span>`).join('');
  if (t === 'bikes'){ applySkins();
    $('shopList').innerHTML = BIKES.map((b,i) => { const own = owned.has(b.id), eq = BIKE === b;
    return `<div class="bike${i===shopSel?' sel':''}"><div class="sw" style="background:#${b.color.toString(16).padStart(6,'0')}"></div><div class="bn"><b>${b.name}</b><small>${b.desc}</small></div>
      <div class="st">Speed ${bar(2-b.drag)} Grip ${bar(b.grip)}<br>Pop ${bar(b.pop)} Stability ${bar(b.stab)}</div>
      <div class="pr">${eq ? 'EQUIPPED' : own ? 'OWNED · equip' : b.price ? '$'+b.price.toLocaleString() : 'FREE'}</div></div>`; }).join(''); }
  else { const items = SKINS[t], cur = equippedSkin(BIKE, t); applySkins([t, items[shopSel]]);   // live 3D preview of the highlighted item
    $('shopList').innerHTML = `<div class="skinNote">Cosmetic only · equipped on your <b>${BIKE.name}</b></div>` + items.map((it,i) => { const own = isOwned(t, it), eq = cur === it;
      return `<div class="bike skin${i===shopSel?' sel':''}"><div class="sw" style="background:${swatch(it,t)}"></div><div class="bn"><b>${it.name}</b>${it.desc?`<small>${it.desc}</small>`:''}</div>
      <div class="pr">${eq ? 'EQUIPPED' : own ? 'OWNED · equip' : '$'+it.price.toLocaleString()}</div></div>`; }).join(''); }
  $('shopList').querySelector('.sel')?.scrollIntoView({block:'nearest'});
}
function shopKey(code){
  const n = shopItems().length;
  if (['LB','KeyQ','Tab_prev'].includes(code)){ shopTab = (shopTab+SHOP_TABS.length-1)%SHOP_TABS.length; shopSel = 0; }
  else if (['RB','KeyE','Tab'].includes(code)){ shopTab = (shopTab+1)%SHOP_TABS.length; shopSel = 0; }
  else if (['DU','DL','ArrowUp','KeyW','BracketLeft'].includes(code)) shopSel = (shopSel+n-1)%n;
  else if (['DD','DR','ArrowDown','KeyS','BracketRight'].includes(code)) shopSel = (shopSel+1)%n;
  else if (code==='ArrowLeft'||code==='KeyA'){ shopTab = (shopTab+SHOP_TABS.length-1)%SHOP_TABS.length; shopSel = 0; }
  else if (code==='ArrowRight'||code==='KeyD'){ shopTab = (shopTab+1)%SHOP_TABS.length; shopSel = 0; }
  else if (code==='A'||code==='Enter'||code==='Space'){ const t = SHOP_TABS[shopTab];
    if (t === 'bikes'){ const b = BIKES[shopSel];
      if (!owned.has(b.id)){ if (S.score >= b.price){ S.score -= b.price; owned.add(b.id); LS.set('trailDescent.owned', [...owned]); toast(`🛒 Bought the ${b.name}!`); } else { toast(`Not enough DOLLAHS: need $${(b.price-S.score).toLocaleString()} more`); renderShop(); return; } }
      BIKE = b; LS.set('trailDescent.bike', b.id); applyBike(); toast(`🚲 Riding the ${b.name}`); }
    else { const it = SKINS[t][shopSel];
      if (!isOwned(t, it)){ if (S.score >= it.price){ S.score -= it.price; ownedSkins.add(t+':'+it.id); LS.set('trailDescent.cosmetics', [...ownedSkins]); toast(`🛒 Bought ${it.name}!`); } else { toast(`Not enough DOLLAHS: need $${(it.price-S.score).toLocaleString()} more`); renderShop(); return; } }
      (skinOf[BIKE.id] ||= {})[t] = it.id; LS.set('trailDescent.skins', skinOf); applySkins(); toast(`🎨 ${it.name} equipped on the ${BIKE.name}`); } }
  else if (code==='B'||code==='Escape'||code==='KeyO'||code==='X'||code==='Start'||code==='KeyP') { closeShop(); return; }
  renderShop();
}
// 3D preview: slow orbit camera around the rider while the shop is open
function shopCam(dt){ shopT += dt; const a = S.yaw + 1.9 + Math.sin(shopT*0.35)*0.9, r = 3.3;
  const cx = S.x + Math.sin(a)*r, cz = S.z + Math.cos(a)*r, rx = Math.cos(a), rz = -Math.sin(a);   // camera-right: aim past the rider so it sits left of the shop panel
  camera.position.set(cx, S.y + 1.3, cz); camera.lookAt(S.x + rx*1.15, S.y + 0.7, S.z + rz*1.15); }
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
  const m = new THREE.Mesh(g, triplanar(new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2}), TEX.gravel, 0.5, 0.9)); /* gravel */ m.receiveShadow = true; scene.add(m); }
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
// ---------- wayfinding signs at every lift top: a signpost with one arrow blade per outgoing trail (name + difficulty symbol) ----------
// Blades are two single-sided faces back to back (arrow drawn for each side, so text is never mirrored); the post is vertical and
// sunk into the ground, placed beside the unload area where every blade is seen at an angle and clear of every path and trail.
window.__signs = [];
{ const postM = new THREE.MeshLambertMaterial({color:0x5a3d22});
  const bladeTex = (tr, flip) => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const c = cv.getContext('2d'), d = DIFF[tr.diff];
    c.save(); if (flip){ c.translate(512, 0); c.scale(-1, 1); }
    c.fillStyle = '#f4ead2'; c.beginPath(); c.moveTo(0,4); c.lineTo(440,4); c.lineTo(508,48); c.lineTo(440,92); c.lineTo(0,92); c.closePath(); c.fill();
    c.lineWidth = 6; c.strokeStyle = '#3b2a17'; c.stroke(); c.restore();
    const x0 = flip ? 96 : 14;   // text block sits away from the arrow tip on both faces
    if (tr.diff === 'green'){ c.fillStyle = d.color; c.beginPath(); c.arc(x0+30, 48, 26, 0, 7); c.fill(); }
    else if (tr.diff === 'blue'){ c.fillStyle = d.color; c.fillRect(x0+6, 22, 52, 52); }
    else { c.fillStyle = '#111'; const dia = (cx) => { c.beginPath(); c.moveTo(cx, 18); c.lineTo(cx+22, 48); c.lineTo(cx, 78); c.lineTo(cx-22, 48); c.closePath(); c.fill(); };
      if (tr.diff === 'pro3'){ c.fillStyle = '#ff5a1f'; dia(x0+14); dia(x0+40); dia(x0+66); } else if (tr.diff === 'dblack'){ dia(x0+18); dia(x0+48); } else dia(x0+30); }
    c.fillStyle = '#1d150c'; c.font = 'bold 46px "Barlow Condensed", Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText(tr.name.toUpperCase(), x0 + (tr.diff === 'pro3' ? 100 : tr.diff === 'dblack' ? 80 : 70), 50, 400 - (tr.diff === 'pro3' ? 30 : tr.diff === 'dblack' ? 10 : 0));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  for (const L of LIFTS){ const ux = L.tx + L.dx*7, uz = L.tz + L.dz*7;
    const outs = L.serves.map(n => trails.find(t => t.name === n)).filter(Boolean).map(tr => {
      const c = connectors.find(c => Math.hypot(c.pts[0][0]-L.tx, c.pts[0][1]-L.tz) < 3 && Math.hypot(c.pts[c.pts.length-1][0]-tr.pts[0][0], c.pts[c.pts.length-1][1]-tr.pts[0][1]) < 3);
      const q = c ? c.pts[Math.min(c.pts.length-1, 12)] : tr.pts[0]; return {tr, q}; });
    let best = null;
    for (let r = 6; r <= 12; r += 1.5) for (let k = 0; k < 32; k++){ const a = k/32*Math.PI*2, x = ux + Math.cos(a)*r, z = uz + Math.sin(a)*r;
      const clear = Math.min(...connectors.map(c => c.pts.reduce((m, p) => Math.min(m, Math.hypot(p[0]-x, p[1]-z)), 1e9))), tclear = trailDist(x, z);
      if (clear < CW + 2.5 || tclear < W + 2.5 || featH(x, z) > 0.01) continue;
      const vx = x - ux, vz = z - uz, vl = Math.hypot(vx, vz);
      let worst = 1; for (const o of outs){ const bx = o.q[0]-x, bz = o.q[1]-z, bl = Math.hypot(bx, bz) || 1; worst = Math.min(worst, Math.abs((bx*vz - bz*vx)/(bl*vl))); }   // |sin| between blade and line of sight
      const sc = worst*10 - r*0.15 + Math.min(clear, 8)*0.2; if (!best || sc > best.sc) best = {x, z, sc, worst, clear}; }
    if (!best) best = {x: ux + 8, z: uz, worst: 0, clear: 0};
    const g0 = terrainH(best.x, best.z), H = 2.0 + 0.42*outs.length, post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, H + 0.4, 8), postM);
    post.position.set(best.x, g0 + H/2 - 0.2, best.z); post.castShadow = true; scene.add(post);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 8), postM); cap.position.set(best.x, g0 + H + 0.1, best.z); scene.add(cap);
    const rec = {lift: L.name, trailClear: +trailDist(best.x, best.z).toFixed(1), x: best.x, z: best.z, ground: g0, postBottom: g0 - 0.4, postTop: g0 + H, vertical: true, unload: [ux, uz], minSin: +best.worst.toFixed(2), pathClear: +best.clear.toFixed(1), blades: []};
    outs.forEach((o, i) => { const bx = o.q[0]-best.x, bz = o.q[1]-best.z, th = Math.atan2(-bz, bx), y = g0 + H - 0.3 - i*0.42;
      const grp = new THREE.Group(); grp.position.set(best.x, y, best.z); grp.rotation.y = th;
      for (const side of [0, 1]){ const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32), new THREE.MeshBasicMaterial({map: bladeTex(o.tr, side === 1)}));
        m.position.set(0.95, 0, side ? -0.012 : 0.012); if (side) m.rotation.y = Math.PI; grp.add(m); }
      scene.add(grp); rec.blades.push({trail: o.tr.name, diff: o.tr.diff, dir: [+(bx/Math.hypot(bx,bz)).toFixed(3), +(bz/Math.hypot(bx,bz)).toFixed(3)], y: +y.toFixed(2), rotX: grp.rotation.x, rotZ: grp.rotation.z}); });
    window.__signs.push(rec); } }
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
{ const el = document.getElementById('liftLegend'); el.innerHTML = LIFTS.map(L => `<div><b style="background:${L.color}"></b>Lift ${L.short}: ${L.serves.join(', ')}</div>`).join('');
  // short screens: if the legend can't fit under the minimap (above the speedometer), it moves beside the map instead of being cut off
  const fit = () => { if (!el.offsetParent) return; el.classList.remove('side'); const room = innerHeight - 220 - el.getBoundingClientRect().top; if (el.scrollHeight > room) el.classList.add('side'); };
  fit(); addEventListener('resize', fit); setInterval(fit, 1000); if (document.fonts) document.fonts.ready.then(fit); window.__legendFit = fit; }
function liftProximity(dt){ S.liftCool = Math.max(0, (S.liftCool||0) - dt); if (S.lift || S.liftCool > 0 || S.air || S.crashT > 0) return;
  for (let i=0;i<LIFTS.length;i++){ const L = LIFTS[i]; if (Math.hypot(S.x-L.bx, S.z-L.bz) < 4.5){ startLift(i); return; } } }
function startLift(i){ sfxLiftStart(); const L = LIFTS[i]; S.lift = {i, d:0}; S.run = null; S.speed = 0; S.vy = 0; S.air = false; S.crumbs = []; S.liftWas = S.yaw;
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
openMenu('main'); setTimeout(() => $('loading').classList.add('done'), 300);
teleport(spotI, true);
window.__features = features; window.__respawn = () => respawnSafe(); window.__game = S; window.__readInput = readInput; window.__groundH = groundH; window.__lift = i => startLift(i); window.__world = { LIFTS, connectors, trails, features, spots, PARK, SHOP, terrainH, featH, isDirt, nearTrails, base, inPark };
window.__BR = BR; window.__teleport = i => teleport(i); window.__unlocked = unlocked; window.__isOpen = isOpen; window.__chunks = () => chunks.size; window.__renderer = renderer; window.__place = (x, z, yaw) => { placeAt(x, z, yaw); S.air = false; };
window.__sim = (secs, inp) => { const h=1/120; const base={steer:0,pedal:0,brake:0,jump:false,tx:0,ty:0}; for(let t=0;t<secs;t+=h){ step(h, Object.assign({}, base, typeof inp==='function'?inp(t):inp)); trackWorld(h); } return {x:S.x, z:S.z, kmh:S.speed*3.6, air:S.air, lives:S.lives, clean:S.clean, score:S.score}; };
frame();window.__shop = { open: openShop, key: shopKey, close: closeShop };
