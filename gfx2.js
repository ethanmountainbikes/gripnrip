// Showcase layer for Graphics High / Max (and parts of Medium): realistic card conifers + billboard impostors, card bushes and
// desert junipers, dramatic distant ranges with silhouette layers, height fog, time of day, screen-space god rays, cascaded
// shadows (Max), PBR rocks, warmer grass and blended trail edges. Visual only: nothing here touches the simulation.
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';

// ---------- small deterministic noise ----------
const h2 = (x, y) => { let h = (x*374761393 + y*668265263) | 0; h = (h ^ (h >>> 13))*1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0)/4294967296; };
const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const a = h2(xi, yi), b = h2(xi+1, yi), c = h2(xi, yi+1), d = h2(xi+1, yi+1); return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v; };
const ridged = (x, y, oct = 6) => { let s = 0, a = 0.5, f = 1, w = 1; for (let o = 0; o < oct; o++){ let n = 1 - Math.abs(vnoise(x*f + o*17.3, y*f - o*9.1)*2 - 1); n *= n*w; w = Math.min(1, n*1.6); s += n*a; a *= 0.5; f *= 2.03; } return s; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x-a)/(b-a))); return t*t*(3-2*t); };

export const TOD = {
  morning: {dir:[-0.62, 0.30, 0.48], col:0xffe0c4, I:3.0, turb:[3.6, 7.5], ray:[2.0, 2.0], exp:[0.80, 0.78], fog:[0xc9d3dc, 0xead2bc], warm:0.25},
  noon:    {dir:[0.45, 0.62, 0.30], col:0xfff4e2, I:3.3, turb:[2.6, 6.5], ray:[1.6, 1.4], exp:[0.78, 0.74], fog:[0xbfd3e3, 0xe9d4b8], warm:0.0},
  golden:  {dir:[0.70, 0.15, -0.50], col:0xffb36b, I:3.4, turb:[5.5, 9.0], ray:[2.8, 2.6], exp:[0.92, 0.88], fog:[0xe6c8a8, 0xf0c49a], warm:0.6},
};

// ---------- canvas textures ----------
function canvasTex(w, h, draw, srgb = true){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
// normal map from a canvas' alpha*luma (Sobel)
function normalFrom(src, str = 3){ const w = src.image.width, h = src.image.height, d = src.image.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w*h);
  for (let i = 0; i < w*h; i++) H[i] = d[i*4+3]/255*(0.4 + 0.6*(d[i*4+1]/255));
  return canvasTex(w, h, (c) => { const id = c.createImageData(w, h), o = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const i = y*w + x, l = H[y*w + Math.max(0, x-1)], r = H[y*w + Math.min(w-1, x+1)], u = H[Math.max(0, y-1)*w + x], dd = H[Math.min(h-1, y+1)*w + x];
      const nx = (l - r)*str, ny = (u - dd)*str, L = Math.hypot(nx, ny, 1); o[i*4] = (nx/L*0.5+0.5)*255; o[i*4+1] = (ny/L*0.5+0.5)*255; o[i*4+2] = (1/L*0.5+0.5)*255; o[i*4+3] = 255; }
    c.putImageData(id, 0, 0); }, false); }
// conifer branch spray: a twig with dense needle tufts (transparent background) — drawn here, so it is ours to ship
const branchTex = (desert) => canvasTex(256, 128, (c, w, h) => { const R = (() => { let a = 7; return () => (a = (a*16807) % 2147483647)/2147483647; })();
  const twig = (x0, y0, x1, y1, n, len, wid) => { c.strokeStyle = '#4a3622'; c.lineWidth = wid; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    for (let i = 0; i < n; i++){ const t = i/n, x = x0 + (x1-x0)*t, y = y0 + (y1-y0)*t, L = len*(1 - 0.6*t)*(0.7 + 0.5*R());
      for (const s of [-1, 1]){ const a = Math.atan2(y1-y0, x1-x0) + s*(0.9 + 0.4*R()), g = desert ? 70 + R()*40 : 60 + R()*70;
        c.strokeStyle = desert ? `rgb(${70+R()*30|0},${g|0},${55+R()*25|0})` : `rgb(${18+R()*30|0},${g|0},${28+R()*30|0})`; c.lineWidth = 1.6 + R(); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a)*L, y + Math.sin(a)*L); c.stroke(); } } };
  twig(4, h/2, w - 6, h/2 + 4, 70, 30, 4);
  for (let k = 0; k < 9; k++){ const t = 0.12 + k*0.09, x = 4 + (w-10)*t, y = h/2, s = k % 2 ? -1 : 1, ex = x + (w*0.3)*(1 - t*0.6), ey = y + s*(h*0.32)*(1 - t*0.4); twig(x, y, ex, ey, 22, 16, 2); } });
// broadleaf / scrub leaf cluster
const leafTex = (desert) => canvasTex(128, 128, (c, w, h) => { const R = (() => { let a = 11; return () => (a = (a*16807) % 2147483647)/2147483647; })();
  for (let i = 0; i < 260; i++){ const r = Math.sqrt(R())*w*0.45, a = R()*6.283, x = w/2 + Math.cos(a)*r, y = h/2 + Math.sin(a)*r*0.9, s = 3 + R()*5;
    const g = desert ? [110 + R()*40, 120 + R()*35, 80 + R()*30] : [40 + R()*40, 85 + R()*70, 30 + R()*30];
    c.fillStyle = `rgb(${g[0]|0},${g[1]|0},${g[2]|0})`; c.beginPath(); c.ellipse(x, y, s, s*0.55, R()*3.14, 0, 6.283); c.fill(); } });

// ---------- geometry ----------
function quad(arr, a, b, c, d, n){ // a,b,c,d: [x,y,z,u,v]
  for (const v of [a, b, c, a, c, d]){ arr.p.push(v[0], v[1], v[2]); arr.u.push(v[3], v[4]); arr.n.push(...n); } }
const finish = (A) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(A.u, 2)); g.computeBoundingSphere(); return g; };
// conifer in the same unit space as the old cone stack (y 0..1, radius <= 1): 12 whorls of drooping branch cards
function coniferCards(){ const A = {p:[], n:[], u:[]};
  for (let k = 0; k < 13; k++){ const y = 0.03 + k*0.075, R = Math.max(0.12, (1.02 - y)*1.0), nb = Math.max(4, Math.round(9 - k*0.35));
    for (let j = 0; j < nb; j++){ const a = k*0.83 + j/nb*6.283 + Math.sin(k*3.1 + j)*0.2, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, wd = 0.22*R + 0.06, dr = R*(0.3 + 0.08*Math.sin(j + k));
      const nn = [dx*0.35, 0.94, dz*0.35];
      quad(A, [px*wd*0.3, y + 0.02, pz*wd*0.3, 0, 0], [dx*R + px*wd, y - dr, dz*R + pz*wd, 1, 0], [dx*R - px*wd, y - dr, dz*R - pz*wd, 1, 1], [-px*wd*0.3, y + 0.02, -pz*wd*0.3, 0, 1], nn); } }
  for (let j = 0; j < 3; j++){ const a = j*1.05, dx = Math.cos(a)*0.13, dz = Math.sin(a)*0.13;   // leader
    quad(A, [-dx, 0.86, -dz, 0, 0], [-dx, 1.03, -dz, 1, 0], [dx, 1.03, dz, 1, 1], [dx, 0.86, dz, 0, 1], [0, 0.3, 1]); }
  return finish(A); }
// round clump of crossed leaf cards (bush, unit size like the old bush: radius ~1, centred at y 0.4)
function clumpCards(n = 14, flat = 0.75){ const A = {p:[], n:[], u:[]}; let s = 3;
  const R = () => (s = (s*16807) % 2147483647)/2147483647;
  for (let i = 0; i < n; i++){ const a = R()*6.283, e = (R() - 0.3)*0.9, cx = Math.cos(a)*0.45*R(), cz = Math.sin(a)*0.45*R(), cy = 0.4 + (R() - 0.4)*0.5*flat, r = 0.55 + R()*0.35;
    const ux = Math.cos(a + 1.57), uz = Math.sin(a + 1.57), vy = Math.cos(e), vx = -Math.sin(e)*Math.cos(a), vz = -Math.sin(e)*Math.sin(a), nn = [Math.cos(a)*0.5, 0.85, Math.sin(a)*0.5];
    quad(A, [cx - ux*r - vx*r, cy - vy*r*flat, cz - uz*r - vz*r, 0, 0], [cx + ux*r - vx*r, cy - vy*r*flat, cz + uz*r - vz*r, 1, 0], [cx + ux*r + vx*r, cy + vy*r*flat, cz + uz*r + vz*r, 1, 1], [cx - ux*r + vx*r, cy + vy*r*flat, cz - uz*r + vz*r, 0, 1], nn); }
  return finish(A); }
function rockGeo(){ const g = new THREE.IcosahedronGeometry(1, 5), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i); const n = 1 + 0.22*(ridged(v.x*1.3 + 3, v.z*1.3 + v.y*0.7, 4) - 0.5) + 0.06*Math.sin(v.x*7 + v.y*5); v.multiplyScalar(n); v.y *= 0.68; if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35)*0.3; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g; }

// ---------- foliage material: alpha-tested cards, wind sway, colour variation, translucency (backlight) ----------
const windU = {value:0}, sunV = {value:new THREE.Vector3(0, 1, 0)}, sunCol = {value:new THREE.Color(1, 0.9, 0.7)};
function foliageMat(map, normalMap, sway = 0.035, trans = 0.55){ const m = new THREE.MeshStandardMaterial({map, normalMap, normalScale:new THREE.Vector2(0.8, 0.8), alphaTest:0.42, side:THREE.DoubleSide, roughness:0.82, metalness:0});
  m.onBeforeCompile = sh => { sh.uniforms.uWind = windU; sh.uniforms.uSunV = sunV; sh.uniforms.uSunC = sunCol;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 iw = instanceMatrix*vec4(0.,0.,0.,1.);
      #else
        vec4 iw = vec4(0.);
      #endif
      float sw = position.y*position.y, ph = iw.x*0.07 + iw.z*0.05;
      transformed.x += (sin(uWind*1.1 + ph) + 0.4*sin(uWind*2.7 + ph*3.0))*${sway.toFixed(3)}*sw; transformed.z += cos(uWind*0.9 + ph*1.3)*${(sway*0.7).toFixed(3)}*sw;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunV; uniform vec3 uSunC;')
      .replace('#include <opaque_fragment>', `{ vec3 vd = normalize(vViewPosition); float bl = pow(max(dot(vd, uSunV), 0.0), 3.0); outgoingLight += diffuseColor.rgb*uSunC*bl*${trans.toFixed(2)}; }
      #include <opaque_fragment>`); };
  m.customProgramCacheKey = () => 'fol' + sway + trans; return m; }

export function showcase(o, P, ctx){
  const {renderer, scene, camera, sun, RAMP} = o, T = TOD[o.tod] || TOD.noon, wi = RAMP ? 1 : 0, out = {};
  // ---- time of day: sun direction, colour, sky, exposure
  o.SUN_DIR.set(...T.dir).normalize(); ctx.sky.material.uniforms.sunPosition.value.copy(o.SUN_DIR);
  ctx.sky.material.uniforms.turbidity.value = T.turb[wi]; ctx.sky.material.uniforms.rayleigh.value = T.ray[wi];
  renderer.toneMappingExposure = T.exp[wi]; sun.color.set(T.col); sun.intensity = T.I; sunCol.value.set(T.col);
  scene.fog.color.set(T.fog[wi]);
  // ---- height fog (valley haze) + tinted aerial perspective (replaces the distance-only chunk)
  const HB = RAMP ? 2.0 : 25.0, HH = RAMP ? 22.0 : 45.0, HM = RAMP ? 0.55 : 0.45, far = RAMP ? 'vec3(0.86, 0.70, 0.58)' : 'vec3(0.50, 0.62, 0.80)';
  THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying float vFogWY;\n#endif';
  THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogWY = (inverse(viewMatrix)*vec4(mvPosition.xyz, 1.0)).y;\n#endif';
  THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying float vFogWY;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      float gfD = 1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth); float gfx_near = 0.0; float gfx_far = 3000.0;
    #else
      float gfD = 1.0 - exp(-pow(max(vFogDepth - fogNear, 0.0)/(fogFar*1.15), 1.7));
    #endif
    float gfH = exp(-max(vFogWY - ${HB.toFixed(1)}, 0.0)/${HH.toFixed(1)})*(1.0 - exp(-vFogDepth/${RAMP ? '180.0' : '320.0'}));
    vec3 gfC = mix(fogColor, ${far}, smoothstep(300.0, 3500.0, vFogDepth));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gfC, clamp(max(gfD*0.7, gfH*${HM.toFixed(2)}), 0.0, 0.78));
  #endif`;
  camera.far = 16000; camera.updateProjectionMatrix(); ctx.sky.scale.setScalar(14000);

  // ---- trees: card conifers + billboard impostors
  const bTex = branchTex(false); bTex.wrapS = THREE.ClampToEdgeWrapping; const bN = normalFrom(bTex, 4);
  const conG = coniferCards(), conMat = foliageMat(bTex, bN, 0.03, 0.6);
  const lTex = leafTex(RAMP), lN = normalFrom(lTex, 3), bushG2 = clumpCards(RAMP ? 10 : 16, RAMP ? 0.6 : 0.8), bushM2 = foliageMat(lTex, lN, 0.05, 0.5);
  const rockG2 = rockGeo(); o.rockMat.flatShading = false; o.rockMat.roughness = 0.88; o.rockMat.needsUpdate = true;
  // desert juniper: twisted trunk + flattened clumps
  const jTex = branchTex(true), jN = normalFrom(jTex, 4), junG = (() => { const g = clumpCards(18, 0.55); g.scale(1.5, 1.0, 1.5); g.translate(0, 0.9, 0); return g; })(), junM = foliageMat(jTex, jN, 0.02, 0.4);
  const junTrunkG = new THREE.CylinderGeometry(0.08, 0.22, 1.4, 7, 3); junTrunkG.translate(0, 0.7, 0); { const p = junTrunkG.attributes.position; for (let i = 0; i < p.count; i++){ const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y*3)*0.12); p.setZ(i, p.getZ(i) + Math.cos(y*2.3)*0.08); } junTrunkG.computeVertexNormals(); }
  const swapChunk = grp => grp.traverse(x => { if (!x.isInstancedMesh) return;
    if (x.geometry === o.coneG){ x.geometry = conG; x.material = conMat; }
    else if (x.geometry === o.bushG){ x.geometry = bushG2; x.material = bushM2; }
    else if (x.geometry === o.rockG){ x.geometry = rockG2; } });
  const rr = (seed) => { let a = seed >>> 0 || 1; return () => (a = (a*16807) % 2147483647)/2147483647; };
  const addJunipers = grp => { if (!RAMP || !o.isDirt) return; const m = grp.children.find(c => c.isMesh && !c.isInstancedMesh); if (!m) return;
    const x0 = m.position.x, z0 = m.position.z, R = rr(Math.round(x0*7.1 + z0*13.3) + 77), list = [];
    for (let i = 0; i < 14; i++){ const x = x0 + R()*o.TCELL, z = z0 + R()*o.TCELL; if (o.isDirt(x, z) || o.featH(x, z) > 0 || o.trailDist(x, z) < 9) continue; list.push([x, z, 0.7 + R()*1.2, R()*6.28]); }
    if (!list.length) return; const tr = new THREE.InstancedMesh(junTrunkG, o.trunkMat, list.length), fo = new THREE.InstancedMesh(junG, junM, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    list.forEach(([x, z, s, r], i) => { const y = o.terrainH(x, z) - 0.1; q.setFromAxisAngle(up, r); M.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)); tr.setMatrixAt(i, M); fo.setMatrixAt(i, M); c.setHSL(0.2 + R()*0.08, 0.25, 0.55 + R()*0.2); fo.setColorAt(i, c); });
    for (const im of [tr, fo]){ im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); grp.add(im); } };
  out.onChunk = grp => { swapChunk(grp); addJunipers(grp); };
  for (const ch of o.chunks.values()){ swapChunk(ch.grp); addJunipers(ch.grp); }
  // impostor: render one card conifer from the side into a texture (true impostor), then draw distant trees as camera-facing billboards
  let imp = null;
  if (!RAMP){ const rt = new THREE.WebGLRenderTarget(256, 512, {samples:4}); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-0.31, 0.31, 1.12, -0.12, -10, 10); cam.position.set(0, 0.3, 2); cam.lookAt(0, 0.3, 0);
    const conMatI = conMat.clone(); conMatI.onBeforeCompile = () => {}; const tm = new THREE.Mesh(conG, conMatI); tm.scale.set(0.21, 0.86, 0.21); tm.position.y = 0.16; const tr = new THREE.Mesh(o.trunkG, o.trunkMat); tr.scale.set(0.03, 0.5, 0.03); sc.add(tm, tr);
    sc.add(new THREE.HemisphereLight(0xdfefff, 0x405030, 1.4)); const dl = new THREE.DirectionalLight(T.col, 2.2); dl.position.set(1, 2, 2); sc.add(dl);
    const tmBg = renderer.getClearColor(new THREE.Color()), tmA = renderer.getClearAlpha(), tone = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam); renderer.setRenderTarget(null); renderer.setClearColor(tmBg, tmA); renderer.toneMapping = tone;
    const ig = new THREE.PlaneGeometry(0.62, 1.24); ig.translate(0, 0.5, 0);
    const im = new THREE.MeshBasicMaterial({map:rt.texture, alphaTest:0.4, transparent:false, side:THREE.DoubleSide, fog:true});
    im.onBeforeCompile = sh => { sh.uniforms.uFar = o.farU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uFar;').replace('#include <project_vertex>', `
        vec3 ic = (modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz; float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
        vec3 rgt = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 wp = ic + rgt*position.x*sx + vec3(0., position.y*sy, 0.);
        vec4 mvPosition = viewMatrix*vec4(wp, 1.0); gl_Position = projectionMatrix*mvPosition;
        if (distance(ic.xz, uFar.xy) < uFar.z - 30.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`); };
    const MAXI = 90000, mesh = new THREE.InstancedMesh(ig, im, MAXI); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh);
    const cells = []; const R = Math.ceil((o.HALF + 400)/o.TCELL); for (let i = -R; i < R; i++) for (let j = -R; j < R; j++) cells.push([i, j]);
    cells.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(); let ci = 0;
    imp = {step(budget){ const t0 = performance.now(); while (ci < cells.length && performance.now() - t0 < budget && mesh.count < MAXI){ const [i, j] = cells[ci++];
      for (const t of o.treesInCell(i, j)){ if (mesh.count >= MAXI) break; const s = t.h; M.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(s, s, s)); mesh.setMatrixAt(mesh.count, M); c.setHSL(0.27 + t.hue*0.07, 0.3, 0.75 + ((t.hue*7)%1)*0.2); mesh.setColorAt(mesh.count++, c); } }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }}; }

  // ---- dramatic distant terrain: ridged ranges beyond the map, snow caps / sandstone banding, rim light
  if (o.farMesh){ o.farMesh.visible = false;
    const FAR = 7000, S = P.farStep, N = Math.round(2*FAR/S) + 1, pos = new Float32Array(N*N*3), col = new Float32Array(N*N*3), H = new Float32Array(N*N), c = new THREE.Color(), idx = new Uint32Array((N-1)*(N-1)*6);
    const edge0 = o.HALF + 120;
    for (let r = 0; r < N; r++) for (let k = 0; k < N; k++){ const x = -FAR + k*S, z = -FAR + r*S, e = Math.max(Math.abs(x), Math.abs(z)) - edge0; let h = o.terrainH(x, z);
      if (e > 0){ const m = sm(0, 900, e), rd = ridged(x/1500 + 11, z/1500 - 7, 6);
        if (RAMP){ const raw = rd*520*m; h += Math.round(raw/38)*38*0.7 + raw*0.3; } else h += m*(rd*rd*1500 + 120*vnoise(x/300, z/300)); }
      H[r*N + k] = h; pos[(r*N+k)*3] = x; pos[(r*N+k)*3+1] = h - 0.6; pos[(r*N+k)*3+2] = z; }
    for (let r = 0; r < N; r++) for (let k = 0; k < N; k++){ const i = r*N + k, h = H[i], hx = H[r*N + Math.min(N-1, k+1)] - H[r*N + Math.max(0, k-1)], hz = H[Math.min(N-1, r+1)*N + k] - H[Math.max(0, r-1)*N + k], ny = 2*S/Math.hypot(hx, 2*S, hz), x = -FAR + k*S, z = -FAR + r*S;
      if (RAMP){ const band = 0.5 + 0.5*Math.sin(h*0.11 + vnoise(x/400, z/400)*2.5), b2 = 0.5 + 0.5*Math.sin(h*0.37); c.setRGB(0.62 + 0.18*band + 0.06*b2, 0.30 + 0.12*band + 0.04*b2, 0.18 + 0.08*band); if (ny < 0.7) c.multiplyScalar(0.85 + 0.15*band); }
      else { const rock = sm(0.86, 0.62, ny), alt = sm(250, 650, h); c.setRGB(0.27, 0.40, 0.18).lerp(new THREE.Color(0.34, 0.38, 0.24), alt).lerp(new THREE.Color(0.40, 0.39, 0.37), Math.max(rock, alt*0.7));
        const snow = sm(520 + 120*vnoise(x/250, z/250), 760, h)*sm(0.45, 0.75, ny) + sm(950, 1150, h)*0.6; c.lerp(new THREE.Color(0.93, 0.95, 0.98), Math.min(1, snow)); }
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b; }
    let q = 0; for (let r = 0; r < N-1; r++) for (let k = 0; k < N-1; k++){ const a = r*N + k, b = a + 1, e = a + N, f = e + 1; idx[q++] = a; idx[q++] = e; idx[q++] = b; idx[q++] = b; idx[q++] = e; idx[q++] = f; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, metalness:0});
    mat.onBeforeCompile = sh => { sh.uniforms.uFar = o.farU; sh.uniforms.uSunV = sunV; sh.uniforms.uSunC = sunCol;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;').replace('#include <project_vertex>', '#include <project_vertex>\nvWXZ = (modelMatrix*vec4(transformed,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ; uniform vec3 uFar; uniform vec3 uSunV; uniform vec3 uSunC;').replace('void main() {', 'void main() {\nif (distance(vWXZ, uFar.xy) < uFar.z) discard;')
        .replace('#include <opaque_fragment>', `{ vec3 vd = normalize(vViewPosition); float rim = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 4.0); float back = 0.35 + 0.65*max(dot(-vd, uSunV), 0.0); outgoingLight += uSunC*rim*back*0.35*diffuseColor.rgb; }
        #include <opaque_fragment>`); };
    const fm = new THREE.Mesh(g, mat); fm.frustumCulled = false; fm.receiveShadow = true; scene.add(fm); out.farTerrain = fm; }
  // silhouette layers: three far ranges for depth, tinted toward the sky (aerial perspective, not washed out)
  { const grp = new THREE.Group(), hor = new THREE.Color(T.fog[wi]); const base = RAMP ? new THREE.Color(0.55, 0.30, 0.22) : new THREE.Color(0.24, 0.30, 0.38);
    [[9000, 900, 0.35, 3], [11000, 1500, 0.55, 7], [13000, 2100, 0.72, 13]].forEach(([Rr, Hm, mixk, seed]) => { const n = 360, p = [], ix = [];
      for (let i = 0; i <= n; i++){ const a = i/n*6.283, rd = ridged(Math.cos(a)*6 + seed, Math.sin(a)*6 - seed, 5); let h = Hm*(0.25 + rd*rd*1.1); if (RAMP) h = Math.round(h/(Hm*0.18))*Hm*0.18*0.8 + h*0.2;
        p.push(Math.cos(a)*Rr, -300, Math.sin(a)*Rr, Math.cos(a)*Rr, h, Math.sin(a)*Rr); if (i < n){ const b = i*2; ix.push(b, b+1, b+2, b+1, b+3, b+2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:base.clone().lerp(hor, mixk), fog:false, side:THREE.DoubleSide})); m.renderOrder = -0.5; grp.add(m); });
    scene.add(grp); out.silhouettes = grp; }

  // ---- Rampage dust haze: big soft drifting sheets near the ground (plus the motes)
  if (RAMP){ const tex = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,225,190,0.55)'); g.addColorStop(0.6, 'rgba(240,200,160,0.18)'); g.addColorStop(1, 'rgba(240,200,160,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
    const grp = new THREE.Group(), sheets = []; for (let i = 0; i < 36; i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, opacity:0.28, depthWrite:false, fog:false, color:new THREE.Color(T.fog[1])}));
      s.userData = {a: Math.random()*6.28, r: 40 + Math.random()*260, y: 4 + Math.random()*20, sp: 0.02 + Math.random()*0.04}; s.scale.set(90 + Math.random()*80, 30 + Math.random()*25, 1); grp.add(s); sheets.push(s); }
    scene.add(grp); out.haze = {grp, sheets}; }

  // ---- PBR grass colour: dark olive roots to warm sunlit tips
  if (o.grassMesh){ const ca = o.grassMesh.geometry.attributes.color, pa = o.grassMesh.geometry.attributes.position;
    for (let i = 0; i < ca.count; i++){ const t = Math.min(1, pa.getY(i)/0.42); ca.setXYZ(i, 0.14 + 0.36*t, 0.22 + 0.30*t, 0.07 + 0.10*t); } ca.needsUpdate = true; }
  // ---- trail edges: break the dirt/grass boundary with texture noise (no ribbon edge)
  if (o.terrainMat){ const prev = o.terrainMat.onBeforeCompile; o.terrainMat.onBeforeCompile = sh => { prev(sh);
      sh.fragmentShader = sh.fragmentShader.replace('vec4 w = vSplat / max(1e-3, vSplat.x + vSplat.y + vSplat.z + vSplat.w); vec2 P = vTWP.xz;', `vec4 w = vSplat / max(1e-3, vSplat.x + vSplat.y + vSplat.z + vSplat.w); vec2 P = vTWP.xz;
        { float en = texture2D(tR, P*0.23).r + texture2D(tG, P*0.071).g - 0.85; float wy0 = w.y, wd = clamp(wy0 + en*2.4*wy0*(1.0 - wy0) + (en - 0.1)*0.35*smoothstep(0.0, 0.25, wy0)*(1.0 - smoothstep(0.75, 1.0, wy0)), 0.0, 1.0);
          float ko = (1.0 - wd)/max(1e-3, 1.0 - wy0); w.x *= ko; w.z *= ko; w.w *= ko; w.y = wd; }`); };
    o.terrainMat.needsUpdate = true; }

  // ---- cascaded shadows (Max): 3 cascades out to 600 m, replacing the single following shadow map
  let csm = null;
  if (P.csm && !localStorage.getItem('gfxNoCsm')){ csm = new CSM({maxFar:600, cascades:3, mode:'practical', parent:scene, shadowMapSize:P.shadow >= 4096 ? 2048 : 1024, lightDirection:o.SUN_DIR.clone().negate(), lightIntensity:T.I, camera, lightMargin:120, lightFar:1500, shadowBias:-0.0002});
    csm.lights.forEach(l => { l.color.set(T.col); l.shadow.normalBias = 0.05; l.shadow.radius = 3; }); sun.intensity = 0; sun.castShadow = false;
    const setup = m => { if (!m || m.userData.csm || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return; m.userData.csm = 1; const prev = m.onBeforeCompile; csm.setupMaterial(m); const cf = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { if (prev) prev.call(m, sh, r); cf.call(m, sh, r); }; m.needsUpdate = true; };
    out.csmSetup = () => scene.traverse(x => { if (x.material) [].concat(x.material).forEach(setup); }); out.csmSetup(); }
  out.csm = csm;

  // ---- god rays: screen-space radial blur of the bright sky around the sun
  out.godrays = P.godrays ? {uniforms:{tDiffuse:{value:null}, uSun:{value:new THREE.Vector2(0.5, 0.5)}, uAmt:{value:0}, uCol:{value:new THREE.Color(T.col)}},
    vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt; uniform vec3 uCol; varying vec2 vUv;
      void main(){ vec4 base = texture2D(tDiffuse, vUv); if (uAmt < 0.002){ gl_FragColor = base; return; }
        vec2 dlt = (vUv - uSun)/48.0*0.9; vec2 uv = vUv; float acc = 0.0, dec = 1.0;
        for (int i = 0; i < 48; i++){ uv -= dlt; vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb; float l = dot(s, vec3(0.3, 0.59, 0.11)); acc += smoothstep(0.85, 2.2, l)*dec; dec *= 0.965; }
        gl_FragColor = vec4(base.rgb + uCol*acc/48.0*uAmt, base.a); }`} : null;

  const v3 = new THREE.Vector3();
  out.update = (dt, grPass) => { windU.value += dt; sunV.value.copy(o.SUN_DIR).transformDirection(camera.matrixWorldInverse);
    if (imp) imp.step(3);
    if (out.silhouettes) out.silhouettes.position.set(camera.position.x, 0, camera.position.z);
    if (out.haze){ const cx = camera.position.x, cz = camera.position.z, gy = o.groundH ? o.groundH(cx, cz) : 0; for (const s of out.haze.sheets){ const u = s.userData; u.a += u.sp*dt; s.position.set(cx + Math.cos(u.a)*u.r, gy + u.y, cz + Math.sin(u.a)*u.r); } }
    if (csm){ csm.lightDirection.copy(o.SUN_DIR).negate(); csm.update(); }
    else { const S = o.S; sun.position.set(S.x + o.SUN_DIR.x*120, S.y + o.SUN_DIR.y*120, S.z + o.SUN_DIR.z*120); sun.target.position.set(S.x, S.y, S.z); }
    if (grPass){ v3.copy(camera.position).addScaledVector(o.SUN_DIR, 5000).project(camera); const front = v3.z < 1, on = Math.max(Math.abs(v3.x), Math.abs(v3.y));
      grPass.uniforms.uSun.value.set(v3.x*0.5 + 0.5, v3.y*0.5 + 0.5); grPass.uniforms.uAmt.value = front ? (RAMP ? 1.4 : 1.2)*(1 - sm(1.0, 1.8, on)) : 0; } };
  out.resize = () => {};
  return out;
}
