// Procedural, detailed MTB + skeletal rider with IK and keyframed trick poses (visual only: never touches physics).
// Bike space: +y up, front of the bike = -z, rider's right = +x. Units: metres.
import * as THREE from 'three';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// merge many small parts into one mesh per material (keeps the bike to a handful of draw calls)
class Bucket { constructor(){ this.m = new Map(); }
  add(geo, mat, matrix){ let a = this.m.get(mat); if (!a) this.m.set(mat, a = []); const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (matrix) g.applyMatrix4(matrix); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); a.push(g); }
  build(parent){ for (const [mat, gs] of this.m){ let n = 0; for (const g of gs) n += g.attributes.position.count;
      const p = new Float32Array(n*3), q = new Float32Array(n*3); let o = 0; for (const g of gs){ p.set(g.attributes.position.array, o*3); q.set(g.attributes.normal.array, o*3); o += g.attributes.position.count; }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(p, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(q, 3)); bg.computeBoundingSphere();
      const mesh = new THREE.Mesh(bg, mat); mesh.castShadow = true; parent.add(mesh); } this.m.clear(); } }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const between = (a, b) => { const d = b.clone().sub(a), L = d.length(); _q.setFromUnitVectors(UP, d.normalize()); return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), _q.clone(), V(1, 1, 1)); };
const at = (x, y, z, rx=0, ry=0, rz=0, s=[1,1,1]) => new THREE.Matrix4().compose(V(x,y,z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)), V(...s));


// cosmetic skins: procedural patterns in bike space (the merged bike has no UVs), applied to a MeshStandardMaterial
export function patternize(mat){
  const u = mat.userData.skin = { uMode:{value:0}, uA:{value:new THREE.Color(1,1,1)}, uB:{value:new THREE.Color(0,0,0)}, uC:{value:new THREE.Color(0.5,0.5,0.5)}, uScale:{value:1} };
  mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSkinP; uniform int uMode; uniform vec3 uA, uB, uC; uniform float uScale;
float sh1(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
float sn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(sh1(i),sh1(i+vec3(1,0,0)),f.x),mix(sh1(i+vec3(0,1,0)),sh1(i+vec3(1,1,0)),f.x),f.y),mix(mix(sh1(i+vec3(0,0,1)),sh1(i+vec3(1,0,1)),f.x),mix(sh1(i+vec3(0,1,1)),sh1(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 skinCol(vec3 p){ p *= uScale;
  if (uMode==1) return p.y > 0.62 ? uB : uA;                                   // two-tone: top vs bottom
  if (uMode==2) return mix(uA, uB, smoothstep(-0.6, 0.6, p.z + p.y*0.4));       // fade front to back
  if (uMode==3){ float n = sn(p*9.0) + 0.5*sn(p*21.0); return n < 0.62 ? uA : n < 0.92 ? uB : uC; }   // camo
  if (uMode==4){ vec3 q = p*90.0; float w = mod(floor(q.x+q.y)+floor(q.z+q.y), 2.0); float sh = 0.5+0.5*sin((q.x+q.z)*3.14159); return mix(uA, uB, w*0.55 + sh*0.25); }   // carbon weave
  if (uMode==5){ float b = fract(p.y*14.0 + p.z*4.0); return b < 0.18 ? uB : b < 0.26 ? uC : uA; }   // stripes / racing decals
  if (uMode==6){ float h = fract(p.y*9.0); return h < 0.5 ? uA : uB; }          // hoops
  if (uMode==7){ float c = fract(p.y*8.0 + abs(p.x)*10.0); return c < 0.35 ? uB : uA; }   // chevrons
  if (uMode==8){ vec3 q = floor(p*16.0); return mod(q.x+q.y+q.z, 2.0) < 1.0 ? uA : uB; }   // checker
  if (uMode==9){ float f = sn(vec3(p.x*16.0, p.y*9.0 - p.z*20.0, 0.0))*0.8 + p.z*3.5 + 0.55; return f > 0.95 ? uA : f > 0.75 ? uC : uB; }   // flames (to the back)
  return uA; }`).replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = skinCol(vSkinP);');
  };
  mat.customProgramCacheKey = () => 'skin'; return u;
}

export function buildBikeRider(frameMat){
  const std = (c, r=0.6, m=0) => new THREE.MeshStandardMaterial({color:c, roughness:r, metalness:m});
  const M = { rubber: std(0x151515, 0.95), black: std(0x1c1c1e, 0.55, 0.3), alu: std(0xb8bcc2, 0.3, 0.9), steel: std(0x8a8f96, 0.35, 0.9),
    gold: std(0xc9a24a, 0.25, 0.9), lower: std(0x111111, 0.4, 0.4), spring: std(0xff6a00, 0.4, 0.3), saddle: std(0x202020, 0.8),
    jersey: std(0xff7a12, 0.85), jersey2: std(0xf2f2f2, 0.85), pants: std(0x23283a, 0.9), shoe: std(0x2a2a2a, 0.8), sole: std(0x111111, 0.9),
    glove: std(0x1d1d1d, 0.85), helmet: std(0xf5f5f5, 0.35, 0.1), helmet2: std(0xff7a12, 0.4), visor: std(0x222222, 0.5),
    lens: new THREE.MeshStandardMaterial({color:0x3a6ea8, roughness:0.05, metalness:0.9}), skin: std(0xd9a27a, 0.7), pad: std(0x333333, 0.8), frame: frameMat };
  const root = new THREE.Group();
  // ---- bike geometry (side view anchors) ----
  const R = 0.36, FA = V(0, R, -0.58), RA = V(0, R, 0.55), BB = V(0, 0.33, 0.04);
  const AX = V(0, Math.cos(0.45), Math.sin(0.45));                 // steer axis: 64 deg head angle, tilted back
  const onAxis = t => FA.clone().addScaledVector(AX, t);
  const HB = onAxis(0.50), HT = onAxis(0.66), CROWN = onAxis(0.47), STEM = onAxis(0.72);
  const SEATJ = V(0, 0.86, 0.12), SADDLE = V(0, 0.98, 0.20), ROCK = V(0, 0.70, 0.10), ROCK2 = V(0, 0.76, 0.24), SHOCK0 = V(0, 0.50, -0.14);
  const frameG = new THREE.Group(), steerG = new THREE.Group(); frameG.matrixAutoUpdate = steerG.matrixAutoUpdate = false; root.add(frameG, steerG);
  const tube = (B, a, b, r, mat, x=0, seg=10) => { const A = a.clone(), Bv = b.clone(); A.x += x; Bv.x += x; B.add(new THREE.CylinderGeometry(r, r, A.distanceTo(Bv), seg), mat, between(A, Bv)); };
  const fb = new Bucket(), sb = new Bucket();
  // frame: hydroformed main tubes, rear triangle, linkage
  tube(fb, HB, HT, 0.032, M.frame); tube(fb, HB, BB.clone().add(V(0,0.04,-0.03)), 0.036, M.frame); tube(fb, HT, SEATJ, 0.029, M.frame);
  tube(fb, BB, SEATJ, 0.03, M.frame); tube(fb, SEATJ, SADDLE.clone().add(V(0,-0.06,0)), 0.016, M.black);
  for (const sx of [-0.055, 0.055]){ tube(fb, BB, RA, 0.017, M.frame, sx); tube(fb, RA, ROCK2, 0.014, M.frame, sx);
    fb.add(new THREE.BoxGeometry(0.012, 0.05, 0.2), M.black, between(ROCK.clone().add(V(sx*0.8,0,0)), ROCK2.clone().add(V(sx*0.8,0,0)))); }
  fb.add(new THREE.BoxGeometry(0.05, 0.05, 0.1), M.frame, at(0, 0.32, 0.04));           // BB shell / main pivot
  tube(fb, SHOCK0, ROCK, 0.022, M.black); tube(fb, SHOCK0.clone().lerp(ROCK, 0.45), ROCK, 0.03, M.steel);
  { const pts = []; for (let i = 0; i <= 64; i++){ const t = i/64, a = t*Math.PI*2*7; pts.push(V(Math.cos(a)*0.032, t*0.16 - 0.08, Math.sin(a)*0.032)); }
    const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0045, 5); const c = SHOCK0.clone().lerp(ROCK, 0.4);
    fb.add(coil, M.spring, new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(UP, ROCK.clone().sub(SHOCK0).normalize()), V(1,1,1))); }
  // saddle + dropper
  fb.add(new THREE.BoxGeometry(0.14, 0.04, 0.27), M.saddle, at(SADDLE.x, SADDLE.y, SADDLE.z, -0.08));
  fb.add(new THREE.BoxGeometry(0.06, 0.035, 0.1), M.saddle, at(0, SADDLE.y-0.005, SADDLE.z-0.16, -0.08));
  // drivetrain: chainring, chain runs, cassette, derailleur
  fb.add(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 32), M.steel, at(0.065, BB.y, BB.z, 0, 0, Math.PI/2));
  fb.add(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 6), M.black, at(0.068, BB.y, BB.z, 0, 0, Math.PI/2));
  for (const s of [1, -1]){ const a = V(0.065, BB.y + s*0.085, BB.z), b = V(0.065, RA.y + s*0.06, RA.z); fb.add(new THREE.BoxGeometry(0.008, 0.012, a.distanceTo(b)), M.steel, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0,0,1), b.clone().sub(a).normalize()), V(1,1,1))); }
  fb.add(new THREE.BoxGeometry(0.02, 0.12, 0.05), M.black, at(0.075, RA.y - 0.12, RA.z + 0.02));
  // rear brake caliper
  fb.add(new THREE.BoxGeometry(0.03, 0.06, 0.08), M.black, at(-0.085, RA.y + 0.09, RA.z - 0.06));
  // fork (steer group): crown, stanchions, lowers, arch, steerer; stem, riser bar, grips, levers; front caliper
  sb.add(new THREE.BoxGeometry(0.2, 0.045, 0.07), M.black, new THREE.Matrix4().compose(CROWN, new THREE.Quaternion().setFromUnitVectors(UP, AX), V(1,1,1)));
  for (const sx of [-0.085, 0.085]){ const s0 = CROWN.clone(), s1 = onAxis(0.2); tube(sb, s0, s1, 0.018, M.gold, sx, 14); tube(sb, onAxis(0.26), FA, 0.027, M.lower, sx, 14);
    sb.add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), M.lower, new THREE.Matrix4().compose(onAxis(0.26).add(V(sx,0,0)), new THREE.Quaternion().setFromUnitVectors(UP, AX), V(1,1,1))); }
  sb.add(new THREE.TorusGeometry(0.085, 0.014, 6, 16, Math.PI), M.lower, new THREE.Matrix4().compose(onAxis(0.3), new THREE.Quaternion().setFromUnitVectors(V(0,1,0), AX).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2, 0, 0))), V(1,1,1)));
  tube(sb, CROWN, STEM, 0.017, M.black);
  const BARC = STEM.clone().add(V(0, 0.03, -0.05)); sb.add(new THREE.BoxGeometry(0.045, 0.04, 0.07), M.black, at(0, STEM.y + 0.015, STEM.z - 0.03));
  const barPts = [V(-0.39, 0.03, 0.03), V(-0.22, 0.03, 0.01), V(-0.08, 0, 0), V(0.08, 0, 0), V(0.22, 0.03, 0.01), V(0.39, 0.03, 0.03)].map(p => p.add(BARC));
  sb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 24, 0.012, 8), M.black);
  const GRIP = [V(-0.34, 0, 0).add(barPts[0]).sub(V(-0.34,0,0)), barPts[5].clone()].map(p => p.clone().add(V(p.x < 0 ? 0.04 : -0.04, 0, 0)));
  for (const g of GRIP){ sb.add(new THREE.CylinderGeometry(0.017, 0.017, 0.13, 10), M.rubber, at(g.x, g.y, g.z, 0, 0, Math.PI/2));
    sb.add(new THREE.BoxGeometry(0.11, 0.012, 0.025), M.alu, at(g.x*0.78, g.y + 0.005, g.z - 0.06, 0, Math.sign(g.x)*0.35, 0)); }
  sb.add(new THREE.BoxGeometry(0.03, 0.06, 0.08), M.black, at(-0.1, FA.y + 0.09, FA.z + 0.07));
  // wheels: knobby tyre, rim, 28 spokes, hub, 203/180 mm rotors
  const wheels = [];
  const makeWheel = (center, parent, rear) => { const w = new THREE.Group(); w.position.copy(center); parent.add(w); const wb = new Bucket();
    const ry = at(0,0,0,0,Math.PI/2,0);
    wb.add(new THREE.TorusGeometry(R - 0.035, 0.045, 10, 48), M.rubber, ry); wb.add(new THREE.TorusGeometry(R - 0.075, 0.016, 6, 40), M.black, ry);
    const knob = new THREE.BoxGeometry(0.022, 0.016, 0.026);
    for (let i = 0; i < 56; i++){ const a = i/56*Math.PI*2, row = i%2;
      for (const sx of row ? [-0.03, 0.03] : [0]) { const r = R - 0.035 + (sx ? 0.036 : 0.045); wb.add(knob, M.rubber, new THREE.Matrix4().compose(V(sx, Math.cos(a)*r, Math.sin(a)*r), new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0, sx*6)), V(1,1,1))); } }
    wb.add(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 12), M.black, at(0,0,0,0,0,Math.PI/2));
    for (let i = 0; i < 28; i++){ const a = i/28*Math.PI*2, side = i%2 ? 0.03 : -0.03, a0 = a + (i%4<2 ? 0.25 : -0.25);
      const p0 = V(side, Math.cos(a0)*0.03, Math.sin(a0)*0.03), p1 = V(0, Math.cos(a)*(R-0.08), Math.sin(a)*(R-0.08)); wb.add(new THREE.CylinderGeometry(0.0022, 0.0022, p0.distanceTo(p1), 4), M.steel, between(p0, p1)); }
    const rr = rear ? 0.09 : 0.1; wb.add(new THREE.CylinderGeometry(rr, rr, 0.003, 32), M.steel, at(-0.072, 0, 0, 0, 0, Math.PI/2)); wb.add(new THREE.CylinderGeometry(0.045, 0.045, 0.005, 6), M.black, at(-0.072, 0, 0, 0, 0, Math.PI/2));
    if (rear) for (let k = 0; k < 9; k++) wb.add(new THREE.CylinderGeometry(0.02 + k*0.0048, 0.02 + k*0.0048, 0.003, 20), M.steel, at(0.04 + k*0.004, 0, 0, 0, 0, Math.PI/2));
    wb.build(w); wheels.push(w); };
  makeWheel(FA, steerG, false); makeWheel(RA, frameG, true);
  // crankset: arms + flat pedals with pins (rotating group on the frame)
  const crank = new THREE.Group(); crank.position.copy(BB); frameG.add(crank); const pedals = [];
  { const cb = new Bucket(); for (const s of [1, -1]) cb.add(new THREE.BoxGeometry(0.018, 0.17, 0.03), M.black, at(s*0.1, -s*0.085, 0)); cb.add(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), M.steel, at(0,0,0,0,0,Math.PI/2)); cb.build(crank);
    for (const s of [-1, 1]){ const p = new THREE.Group(); p.position.set(s*0.165, -s*0.17, 0); crank.add(p); const pb = new Bucket(); pb.add(new THREE.BoxGeometry(0.1, 0.018, 0.1), M.black); for (let k = 0; k < 8; k++) pb.add(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 4), M.steel, at(-0.04 + (k%4)*0.027, 0, k < 4 ? -0.045 : 0.045)); pb.build(p); pedals.push(p); } }
  fb.build(frameG); sb.build(steerG);

  // ---- rider: capsule limbs placed from solved joint positions ----
  const L = { thigh: 0.43, shin: 0.43, upper: 0.3, fore: 0.28, spine: 0.52 };
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; root.add(m); return m; };
  const limb = (r, len, mat, r2) => mk(new THREE.CapsuleGeometry(r, len - r*2*0.6, 4, 10).scale(1, 1, r2 ? r2/r : 1), mat);
  const seg = { thighL: limb(0.075, L.thigh, M.pants), thighR: limb(0.075, L.thigh, M.pants), shinL: limb(0.058, L.shin, M.pants), shinR: limb(0.058, L.shin, M.pants),
    upperL: limb(0.055, L.upper, M.jersey), upperR: limb(0.055, L.upper, M.jersey), foreL: limb(0.045, L.fore, M.jersey2), foreR: limb(0.045, L.fore, M.jersey2) };
  const kneePad = [mk(new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1.2, 0.8), M.pad), mk(new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1.2, 0.8), M.pad)];
  const torso = new THREE.Group(); root.add(torso);
  { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.5, 14).scale(1, 1, 0.62), M.jersey); t.position.y = 0.27; t.castShadow = true; torso.add(t);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.18, 0.08, 14).scale(1, 1, 0.63), M.jersey2); stripe.position.y = 0.36; torso.add(stripe);
    const num = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.01), M.jersey2); num.position.set(0, 0.32, 0.12); torso.add(num);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10).scale(1, 0.75, 0.75), M.pants); pelvis.position.y = 0.0; pelvis.castShadow = true; torso.add(pelvis);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), M.skin); neck.position.y = 0.56; torso.add(neck); }
  const head = new THREE.Group(); root.add(head);
  { const shell = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14).scale(1, 1.05, 1.18), M.helmet); shell.castShadow = true; head.add(shell);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.152, 18, 14, 0, Math.PI*2, 0, 0.5).scale(0.35, 1.05, 1.19), M.helmet2); head.add(stripe);
    const chin = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 8, 18, Math.PI), M.helmet); chin.rotation.set(Math.PI/2 + 0.35, 0, Math.PI); chin.position.set(0, -0.085, -0.06); head.add(chin);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.03), M.visor); vent.position.set(0, -0.1, -0.175); head.add(vent);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.12), M.helmet2); peak.position.set(0, 0.11, -0.19); peak.rotation.x = 0.25; head.add(peak);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.014, 6, 24).scale(1, 1, 1.18), M.black); band.rotation.x = Math.PI/2; band.position.y = 0.02; head.add(band);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.055, 0.03), M.lens); lens.position.set(0, 0.02, -0.18); head.add(lens);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.072, 0.025), M.black); frame.position.set(0, 0.02, -0.17); head.add(frame); }
  const hand = [0, 1].map(() => { const g = new THREE.Group(); root.add(g); const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.1), M.glove); p.castShadow = true; g.add(p);
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.06, 3, 6), M.glove); f.rotation.x = Math.PI/2; f.position.set(0, -0.01, -0.07); g.add(f); return g; });
  const foot = [0, 1].map(() => { const g = new THREE.Group(); root.add(g); const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.27), M.shoe); s.position.set(0, 0.035, -0.04); s.castShadow = true; g.add(s);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.022, 0.28), M.sole); so.position.set(0, -0.005, -0.04); g.add(so); return g; });

  // ---- pose library (keyframes in bike space). w = blend weight; null = keep on grip/pedal ----
  const base = { hip: V(0, 1.03, 0.2), lean: 0.78, twist: 0, look: 0 };
  const POSES = {
    nohander: { hip: V(0, 1.1, 0.24), lean: 0.3, hands: [V(-0.78, 1.62, 0.12), V(0.78, 1.62, 0.12)] },               // suicide-style: arms thrown out wide, knees pinch the seat
    tuck:     { hip: V(0, 1.0, -0.02), lean: 1.0, hands: [V(-0.62, 1.42, 0.5), V(0.62, 1.42, 0.5)], tilt: 0.25 },   // bars tucked into the lap, shoulders over the bars, arms swept back
    nofooter: { hip: V(0, 1.2, 0.14), lean: 0.62, feet: [V(-0.46, 0.78, 0.42), V(0.46, 0.78, 0.42)] },              // both feet kicked off wide and back
    superman: { hip: V(0, 1.3, 0.55), lean: 1.4, feet: [V(-0.13, 1.42, 1.38), V(0.13, 1.38, 1.38)] },               // body stretched flat behind the bike, hands on the grips
    cancan:   { hip: V(0.05, 1.08, 0.18), lean: 0.7, twist: 0.25, feet: [V(0.42, 0.78, -0.18), null] },             // left leg kicked over the top tube to the right side
    nacnac:   { hip: V(0.06, 1.12, 0.22), lean: 0.72, twist: -0.3, feet: [V(-0.62, 0.98, 0.88), null], steer: 0.45 },// bars turned like a whip, foot pushed out behind the rear wheel
    xup:      { hip: V(0, 1.08, 0.18), lean: 0.62, steer: Math.PI*0.92 },                                            // bars turned ~180 deg, arms crossed on the grips
    tailwhip: { hip: V(0, 1.12, 0.12), lean: 0.6, feet: [V(-0.36, 0.86, 0.24), V(0.36, 0.86, 0.24)] },               // feet off, frame whipped around the head tube
    barspin:  { hip: V(0, 1.08, 0.2), lean: 0.6, hands: [V(-0.3, 1.36, -0.22), V(0.3, 1.36, -0.22)] },               // hands release just above the spinning bars
  };
  const TRICK_OF = { up:'nohander', ul:'tuck', down:'nofooter', left:'superman', right:'cancan', dl:'nacnac', ur:'xup', dr:'tailwhip', bar:'barspin' };
  const W = Object.fromEntries(Object.keys(POSES).map(k => [k, 0]));
  let barA = 0, tailA = 0, crankA = 0, flipW = 0, spinW = 0;
  const tmp = { grip: [V(), V()], pedal: [V(), V()] };
  const axisRot = (ang) => { const m = new THREE.Matrix4().makeTranslation(FA.x, FA.y, FA.z).multiply(new THREE.Matrix4().makeRotationAxis(AX, ang)).multiply(new THREE.Matrix4().makeTranslation(-FA.x, -FA.y, -FA.z)); return m; };
  const ik = (A, T, l1, l2, pole, outMid, outEnd) => { const d0 = T.clone().sub(A); let d = d0.length(); const dir = d0.normalize(); d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d));
    const a = (l1*l1 - l2*l2 + d*d)/(2*d), h = Math.sqrt(Math.max(0, l1*l1 - a*a)); const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    outMid.copy(A).addScaledVector(dir, a).addScaledVector(pp, h); outEnd.copy(A).addScaledVector(dir, d); };
  const place = (mesh, a, b) => { mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); };
  const easeTo = (v, t, k) => v + (t - v)*k;
  const toFull = (a, rate, dt) => { const tgt = Math.ceil(a/(Math.PI*2) - 1e-3)*Math.PI*2; return Math.min(tgt, a + rate*dt); };

  function update(S, inp, dt){
    const air = S.air && S.crashT <= 0, k = 1 - Math.exp(-dt/0.08);
    const name = air && S.trick ? TRICK_OF[S.trick] : null, amt = name ? (S.trickAmt ?? 1) : 0;
    for (const key in W) W[key] = easeTo(W[key], key === name ? 0.35 + 0.65*amt : 0, k);
    // continuous spins: barspin spins the bars, tailwhip whips the frame; on release they finish the turn and lock straight
    const rate = Math.PI*2/0.45;
    if (name === 'barspin') barA += rate*(0.5 + 0.5*amt)*dt; else barA = toFull(barA, rate, dt);
    if (name === 'tailwhip') tailA += rate*0.8*(0.5 + 0.5*amt)*dt; else tailA = toFull(tailA, rate*0.8, dt);
    if (!air){ barA = Math.round(barA/(Math.PI*2))*Math.PI*2; tailA = Math.round(tailA/(Math.PI*2))*Math.PI*2; }
    const steerVis = (S.air ? 0 : -(inp?.steer || 0)*0.25*Math.max(0.2, 1 - S.speed/14)) + W.xup*POSES.xup.steer + W.nacnac*POSES.nacnac.steer;
    frameG.matrix.copy(axisRot(-tailA)); steerG.matrix.copy(axisRot(barA + steerVis)); frameG.matrixWorldNeedsUpdate = steerG.matrixWorldNeedsUpdate = true;
    // crank turns while pedalling on the ground; pedals stay level
    if (!S.air && (inp?.pedal || 0) > 0.05) crankA -= S.speed*dt/0.36/2.6 + dt*2*(inp.pedal);
    crank.rotation.x = crankA; for (const p of pedals) p.rotation.x = -crankA;
    flipW = easeTo(flipW, air ? Math.min(1, Math.abs(S.wPitch || 0)/4) : 0, k); spinW = easeTo(spinW, air ? THREE.MathUtils.clamp((S.wYaw || 0)/5, -1, 1) : 0, k);
    // targets on the bike
    for (let i = 0; i < 2; i++){ tmp.grip[i].copy(GRIP[i]).applyMatrix4(steerG.matrix);
      const p = pedals[i]; tmp.pedal[i].set(p.position.x, 0, 0).add(V(0, Math.cos(crankA)*p.position.y, Math.sin(crankA)*p.position.y)).add(BB).add(V(0, 0.03, 0)).applyMatrix4(frameG.matrix); }
    // body: blend hip / spine lean / twist from all active poses (+ flip tuck, 360 head turn, whip counter-twist)
    const hip = base.hip.clone(); let lean = base.lean, twist = -(S.tweak || 0)*0.35 + spinW*0.25, tilt = 0;
    hip.y += -flipW*0.08 - (S.susp || 0)*0.25; hip.z -= flipW*0.1; lean += flipW*0.2;
    for (const key in W){ const w = W[key]; if (w < 1e-3) continue; const P = POSES[key]; hip.lerp(P.hip, w); lean += (P.lean - base.lean)*w; twist += (P.twist || 0)*w; tilt += (P.tilt || 0)*w; }
    hip.x += (S.tweak || 0)*0.08;
    const up = V(0, Math.cos(lean), -Math.sin(lean)), side = V(Math.cos(twist), 0, Math.sin(twist)), back = side.clone().cross(up).normalize(); side.copy(up.clone().cross(back)).normalize();
    torso.position.copy(hip); torso.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, back));
    const neck = hip.clone().addScaledVector(up, L.spine);
    // head stays level and looks ahead (or over the shoulder in a 360)
    head.position.copy(neck).addScaledVector(up, 0.1).add(V(0, 0.1, -0.02)); head.rotation.set(-0.1 + flipW*0.3*Math.sign(S.wPitch || 0), -spinW*0.9 + twist*0.5, 0);
    const shoulder = [neck.clone().addScaledVector(side, -0.19).addScaledVector(up, -0.05), neck.clone().addScaledVector(side, 0.19).addScaledVector(up, -0.05)];
    const hipJ = [hip.clone().addScaledVector(side, -0.125), hip.clone().addScaledVector(side, 0.125)];
    const handOff = W.nohander + W.tuck + W.barspin; const footOff = [W.nofooter + W.superman + W.cancan + W.nacnac + W.tailwhip, W.nofooter + W.superman + W.tailwhip];
    const mid = V(), end = V();
    for (let i = 0; i < 2; i++){ const sx = i ? 1 : -1;
      // hand target: grip, blended toward the pose's free-hand position
      const ht = tmp.grip[i].clone(); if (handOff > 1e-3){ const free = V(); let ws = 0; for (const key of ['nohander','tuck','barspin']){ const w = W[key]; if (w > 1e-3){ free.addScaledVector(POSES[key].hands[i], w); ws += w; } } if (ws > 0) ht.lerp(free.multiplyScalar(1/ws), Math.min(1, handOff)); }
      ik(shoulder[i], ht, L.upper, L.fore, V(sx*0.8, -0.3, 0.5), mid, end); place(seg[i ? 'upperR' : 'upperL'], shoulder[i], mid); place(seg[i ? 'foreR' : 'foreL'], mid, end);
      hand[i].position.copy(end); hand[i].quaternion.setFromUnitVectors(V(0,0,-1), end.clone().sub(mid).normalize());
      // foot target: pedal, blended toward the pose's free-foot position
      const ft = tmp.pedal[i].clone(); let fw = 0; const free = V();
      for (const key of ['nofooter','superman','cancan','nacnac','tailwhip']){ const P = POSES[key], w = W[key]; if (w > 1e-3 && P.feet[i]){ free.addScaledVector(P.feet[i], w); fw += w; } }
      if (fw > 0) ft.lerp(free.multiplyScalar(1/fw), Math.min(1, fw));
      ik(hipJ[i], ft, L.thigh, L.shin, V(sx*0.45, 0.15, -1), mid, end); place(seg[i ? 'thighR' : 'thighL'], hipJ[i], mid); place(seg[i ? 'shinR' : 'shinL'], mid, end);
      kneePad[i].position.copy(mid).add(V(0, -0.04, -0.05)); kneePad[i].quaternion.copy(seg[i ? 'shinR' : 'shinL'].quaternion);
      foot[i].position.copy(end).add(V(0, -0.06, 0)); foot[i].rotation.set(fw > 0.3 ? -0.6*Math.min(1, fw) : 0, 0, 0); }
    root.rotation.x = tilt;   // tuck no-hander: bike pulled up into the lap
  }
  for (const k of ['frame','jersey','helmet']) patternize(M[k]);
  return { root, wheels, update, POSES, TRICK_OF, M };
}
