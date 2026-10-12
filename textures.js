// Procedural PBR-style textures (albedo + tangent-space normal map) drawn on canvases at startup.
// Everything is generated here (no downloads): tileable value-noise fBm, cell/crack patterns and plank grain.
import * as THREE from 'three';
const hash = (x, y, s) => { let h = (x*374761393 + y*668265263 + s*1442695041) | 0; h = (h ^ (h >>> 13))*1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0)/4294967296; };
function noise(x, y, p, s){ const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const w = i => ((i % p) + p) % p, a = hash(w(xi), w(yi), s), b = hash(w(xi+1), w(yi), s), c = hash(w(xi), w(yi+1), s), d = hash(w(xi+1), w(yi+1), s);
  return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v; }
const fbm = (x, y, p, s, oct=5) => { let t = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++){ t += a*noise(x*f, y*f, p*f, s+o*17); n += a; a *= 0.5; f *= 2; } return t/n; };
// worley (cell) distance, tileable
function cells(x, y, p, s){ const xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++){ const cx = xi+i, cy = yi+j, wx = ((cx%p)+p)%p, wy = ((cy%p)+p)%p, px = cx + hash(wx, wy, s), py = cy + hash(wx, wy, s+9), d = Math.hypot(px-x, py-y); if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return [d1, d2]; }
const mix = (a, b, t) => a + (b-a)*t, cl = v => Math.max(0, Math.min(255, v));
function make(N, fn, nStr){ const H = new Float32Array(N*N), C = new Uint8ClampedArray(N*N*4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){ const r = fn(x/N, y/N), i = y*N + x; H[i] = r.h; C[i*4] = cl(r.c[0]); C[i*4+1] = cl(r.c[1]); C[i*4+2] = cl(r.c[2]); C[i*4+3] = 255; }
  const Nm = new Uint8ClampedArray(N*N*4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){ const i = y*N + x, hl = H[y*N + (x+N-1)%N], hr = H[y*N + (x+1)%N], hu = H[((y+N-1)%N)*N + x], hd = H[((y+1)%N)*N + x];
    let nx = (hl - hr)*nStr, ny = (hu - hd)*nStr, nz = 1; const l = Math.hypot(nx, ny, nz); Nm[i*4] = (nx/l*0.5+0.5)*255; Nm[i*4+1] = (ny/l*0.5+0.5)*255; Nm[i*4+2] = (nz/l*0.5+0.5)*255; Nm[i*4+3] = 255; }
  const tex = (data, srgb) => { const cv = document.createElement('canvas'); cv.width = cv.height = N; cv.getContext('2d').putImageData(new ImageData(data, N, N), 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(C, true), normal: tex(Nm, false) }; }

export function makeTextures(N = 256, desert = false){
  const P = 8;  // noise period (tileable)
  const T = {
    grass: make(N, (u, v) => { const n = fbm(u*P, v*P, P, 1), b = fbm(u*P*4, v*P*4, P*4, 2, 3), blade = noise(u*P*16, v*P*64, P*16, 3);
      const h = n*0.5 + blade*0.5, g = 0.7 + 0.5*n + 0.25*(blade-0.5);
      return { h, c: [mix(70, 110, b)*g, mix(110, 150, n)*g, mix(38, 55, b)*g] }; }, 3),
    dirt: make(N, (u, v) => { const n = fbm(u*P, v*P, P, 4), f = fbm(u*P*4, v*P*4, P*4, 5, 4), [d1] = cells(u*P*6, v*P*6, P*6, 6), peb = Math.max(0, 0.35 - d1)*2.6;
      const h = n*0.5 + f*0.3 + peb*0.6, k = 0.75 + 0.45*f + peb*0.25; return { h, c: [150*k, 108*k, 70*k] }; }, 4),
    gravel: make(N, (u, v) => { const [d1, d2] = cells(u*P*5, v*P*5, P*5, 7), s = Math.min(1, (d2 - d1)*3.5), f = fbm(u*P*4, v*P*4, P*4, 8, 3), tone = 0.75 + 0.35*hash(Math.floor(u*P*5*7), Math.floor(v*P*5*7), 9);
      const h = s*0.8 + f*0.2, k = (0.55 + 0.45*s)*tone; return { h, c: [170*k, 158*k, 138*k] }; }, 5),
    rock: make(N, (u, v) => { const n = fbm(u*P, v*P, P, 10), f = fbm(u*P*3, v*P*3, P*3, 11, 5), [d1, d2] = cells(u*P*4, v*P*4, P*4, 12), crack = 0.6 + 0.4*Math.min(1, (d2 - d1)*5);
      const h = n*0.4 + f*0.4 + crack*0.35, k = (0.6 + 0.4*f)*(0.55 + 0.45*crack); return { h, c: [150*k, 144*k, 134*k] }; }, 5),
    snow: make(N, (u, v) => { const n = fbm(u*P, v*P, P, 13), f = fbm(u*P*4, v*P*4, P*4, 14, 3), h = n*0.6 + f*0.4, k = 0.9 + 0.1*n; return { h, c: [236*k, 242*k, 250*k] }; }, 1.5),
    bark: make(N, (u, v) => { const ridge = Math.abs(Math.sin((u*14 + fbm(u*4, v*2, 4, 15)*2.5)*Math.PI)), f = fbm(u*16, v*4, 16, 16, 4);
      const h = ridge*0.7 + f*0.3, k = 0.45 + 0.55*h; return { h, c: [110*k, 78*k, 52*k] }; }, 6),
    planks: make(N, (u, v) => { const row = Math.floor(v*8), seam = Math.min(1, Math.abs((v*8 - row) - 0.5)*2), gap = seam > 0.93 ? 0 : 1, grain = fbm(u*2 + row*3.1, v*40, 2, 20 + row, 4), knot = Math.max(0, 0.12 - Math.hypot(((u*3 + row*0.37) % 1) - 0.5, (v*8 - row - 0.5)*0.4))*6;
      const tone = 0.85 + 0.25*hash(row, 0, 21), k = (0.6 + 0.4*grain - knot*0.5)*tone*(gap ? 1 : 0.35), h = gap*(0.6 + 0.2*grain) - knot*0.2; return { h, c: [186*k, 136*k, 86*k] }; }, 5),
    needles: make(N, (u, v) => { const s = noise(u*P*12, v*P*3, P*12, 22), f = fbm(u*P*2, v*P*2, P*2, 23, 3), h = s*0.7 + f*0.3, k = 0.55 + 0.6*h; return { h, c: [52*k, 92*k, 50*k] }; }, 5),
  };
  if (desert){   // Utah desert: red clay (ground), packed tan dirt (lines), banded red sandstone (cliffs), pale sand
    T.grass = make(N, (u, v) => { const n = fbm(u*P, v*P, P, 31), f = fbm(u*P*4, v*P*4, P*4, 32, 4), [d1, d2] = cells(u*P*5, v*P*5, P*5, 33), crack = Math.min(1, (d2 - d1)*6);
      const h = n*0.45 + f*0.35 + crack*0.2, k = (0.78 + 0.3*f)*(0.85 + 0.15*crack); return { h, c: [196*k, 104*k, 62*k] }; }, 3);
    T.dirt = make(N, (u, v) => { const n = fbm(u*P, v*P, P, 34), f = fbm(u*P*4, v*P*4, P*4, 35, 4), [d1] = cells(u*P*7, v*P*7, P*7, 36), peb = Math.max(0, 0.3 - d1)*2.4;
      const h = n*0.5 + f*0.3 + peb*0.5, k = 0.8 + 0.35*f + peb*0.2; return { h, c: [186*k, 128*k, 84*k] }; }, 4);
    T.rock = make(N, (u, v) => { const n = fbm(u*P, v*P, P, 37), f = fbm(u*P*3, v*P*3, P*3, 38, 5), band = 0.5 + 0.5*Math.sin((v + 0.08*n)*P*2*Math.PI*3), [d1, d2] = cells(u*P*3, v*P*6, P*3, 39), crack = 0.65 + 0.35*Math.min(1, (d2 - d1)*5);
      const h = band*0.35 + f*0.4 + crack*0.3, k = (0.62 + 0.38*f)*crack; return { h, c: [(170 + 40*band)*k, (82 + 30*band)*k, (52 + 18*band)*k] }; }, 5);
    T.snow = make(N, (u, v) => { const n = fbm(u*P, v*P, P, 40), f = fbm(u*P*6, v*P*6, P*6, 41, 3), h = n*0.6 + f*0.4, k = 0.88 + 0.12*n; return { h, c: [226*k, 196*k, 158*k] }; }, 1.5);
  }
  return T;
}
// world-space triplanar projection for meshes without good UVs (rocks, jumps, terrain features). Keeps three.js lighting/shadows/fog.
export function triplanar(mat, set, scale = 0.5, nStr = 0.8){
  mat.onBeforeCompile = sh => { sh.uniforms.tA = {value: set.map}; sh.uniforms.tN = {value: set.normal}; sh.uniforms.tS = {value: scale}; sh.uniforms.tNS = {value: nStr};
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTWP; varying vec3 vTWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 tw = vec4(transformed, 1.0); vec3 tn = objectNormal;
          #ifdef USE_INSTANCING
            tw = instanceMatrix*tw; tn = mat3(instanceMatrix)*tn;
          #endif
          vTWP = (modelMatrix*tw).xyz; vTWN = normalize(mat3(modelMatrix)*tn); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTWP; varying vec3 vTWN; uniform sampler2D tA; uniform sampler2D tN; uniform float tS; uniform float tNS;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 tb = pow(abs(normalize(vTWN)), vec3(4.0)); tb /= (tb.x + tb.y + tb.z);
        vec3 tcol = texture2D(tA, vTWP.zy*tS).rgb*tb.x + texture2D(tA, vTWP.xz*tS).rgb*tb.y + texture2D(tA, vTWP.xy*tS).rgb*tb.z;
        diffuseColor.rgb *= tcol*1.6;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 tb2 = pow(abs(normalize(vTWN)), vec3(4.0)); tb2 /= (tb2.x + tb2.y + tb2.z);
          vec2 n1 = texture2D(tN, vTWP.zy*tS).xy*2.0-1.0, n2 = texture2D(tN, vTWP.xz*tS).xy*2.0-1.0, n3 = texture2D(tN, vTWP.xy*tS).xy*2.0-1.0;
          vec3 wn = vec3(0.0, n1.y, n1.x)*tb2.x + vec3(n2.x, 0.0, n2.y)*tb2.y + vec3(n3.x, n3.y, 0.0)*tb2.z;
          normal = normalize(normal + (viewMatrix*vec4(wn*tNS, 0.0)).xyz); }`); };
  mat.customProgramCacheKey = () => 'tri' + scale + nStr + set.map.uuid;
  return mat; }
