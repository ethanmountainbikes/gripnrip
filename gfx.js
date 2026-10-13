// Graphics upgrade (Medium / High / Max). Loaded only when Settings → Graphics is above Low, so the Low look and
// performance are exactly the original. Purely visual: nothing here touches the simulation or gameplay state.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { showcase } from './gfx2.js';

export const GFX_LEVELS = ['low', 'medium', 'high', 'max'];
const PRESETS = {
  medium: {pr:1.0, shadow:2048, shadowR:50, ao:null,   bloom:0.10, smaa:true,  dof:false, mblur:false, flare:false, grassR:40, grassCell:0.9,  dust:500,  envI:0.4, farStep:50, csm:false, godrays:false},
  high:   {pr:1.5, shadow:4096, shadowR:60, ao:'ssao', bloom:0.14, smaa:true,  dof:true,  mblur:false, flare:true,  grassR:55, grassCell:0.7,  dust:1000, envI:0.45, farStep:35, csm:false, godrays:true},
  max:    {pr:2.0, shadow:4096, shadowR:55, ao:'gtao', bloom:0.16, smaa:true,  dof:true,  mblur:true,  flare:true,  grassR:70, grassCell:0.55, dust:2400, envI:0.5, farStep:25, csm:false, godrays:true},
};
// CC0 textures and HDRIs from Poly Haven (polyhaven.com), credited in the Credits menu
export const GFX_CREDITS = ['Poly Haven (CC0): textures sparse_grass, brown_mud_leaves_01, aerial_rocks_02, bark_brown_02, gravel, aerial_sand, red_dirt_mud_01, dry_riverbed_rock; HDRIs pizzo_pernice_puresky (Mountain), quarry_01_puresky (Rampage)'];

// aerial perspective + distance haze: replaces three's linear fog chunk (compile-time constants, so every material gets it)
function patchFog(desert){
  const far = desert ? 'vec3(0.80, 0.78, 0.80)' : 'vec3(0.62, 0.74, 0.88)';
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
    float gfxF = 1.0 - exp(-pow(max(vFogDepth - fogNear, 0.0) / (fogFar*0.9), 1.6));
    vec3 gfxC = mix(fogColor, ${far}, smoothstep(250.0, 2600.0, vFogDepth));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gfxC, clamp(gfxF, 0.0, 0.8));
  #endif`;
}
// slope-blended terrain: the rock layer is sampled triplanar (no stretching on cliffs) + a second detail-normal octave on dirt
function upgradeTerrain(mat){ const orig = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => { orig(sh);
    sh.vertexShader = sh.vertexShader.replace('varying vec3 vTWP;', 'varying vec3 vTWP; varying vec3 vTWN2;').replace('vTWP = (modelMatrix*vec4(transformed,1.0)).xyz;', 'vTWP = (modelMatrix*vec4(transformed,1.0)).xyz; vTWN2 = normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vTWP;', 'varying vec3 vTWP; varying vec3 vTWN2;\nvec3 triR(sampler2D t, vec3 p, vec3 n){ vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x+b.y+b.z); return texture2D(t, p.zy*0.2).rgb*b.x + texture2D(t, p.xz*0.2).rgb*b.y + texture2D(t, p.xy*0.2).rgb*b.z; }')
      .replace('tex2(tR, P*0.6)*w.z', 'mix(tex2(tR, P*0.6), triR(tR, vTWP, normalize(vTWN2)), 0.85)*w.z')
      .replace('normal = normalize(normal + (viewMatrix*vec4(tn.x, 0.0, tn.y, 0.0)).xyz*0.7); }', 'vec2 tn2 = texture2D(nD, vTWP.xz*1.7).xy*2.0 - 1.0; tn += tn2*0.5*w2.y; normal = normalize(normal + (viewMatrix*vec4(tn.x, 0.0, tn.y, 0.0)).xyz*0.8); }'); };
  mat.needsUpdate = true; }
// swap an image into an existing texture, colour-normalised to the procedural one's mean (keeps the world's palette, adds real detail)
async function swapImage(tex, url, matchColor){
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
  if (matchColor){ const mean = cv2 => { const g = cv2.getContext ? cv2.getContext('2d') : null; if (!g) return null; const d = g.getImageData(0, 0, cv2.width, cv2.height).data; const m = [0,0,0]; for (let i = 0; i < d.length; i += 4*16){ m[0] += d[i]; m[1] += d[i+1]; m[2] += d[i+2]; } const n = d.length/(4*16); return m.map(v => v/n); };
    const a = mean(cv), b = tex.image && tex.image.getContext ? mean(tex.image) : null;
    if (b){ const id = c.getImageData(0, 0, cv.width, cv.height), d = id.data, k = [0,1,2].map(j => b[j]/Math.max(1, a[j])); for (let i = 0; i < d.length; i += 4){ d[i] *= k[0]; d[i+1] *= k[1]; d[i+2] *= k[2]; } c.putImageData(id, 0, 0); } }
  tex.image = cv; tex.needsUpdate = true; }

export function initGfx(o){
  const P = PRESETS[o.level] || PRESETS.max, {renderer, scene, camera, sun, RAMP} = o;
  patchFog(RAMP);
  renderer.setPixelRatio(Math.min(devicePixelRatio, P.pr)); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = RAMP ? 0.74 : 0.78; renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ---- sky: physical Sky (Preetham) as the visible background; HDRI (PMREM) for image-based lighting
  const sky = new Sky(); sky.scale.setScalar(4500); const su = sky.material.uniforms;
  Object.assign(su.turbidity, {value: RAMP ? 6.5 : 2.6}); su.rayleigh.value = RAMP ? 1.4 : 1.6; su.mieCoefficient.value = RAMP ? 0.006 : 0.004; su.mieDirectionalG.value = 0.8;
  su.sunPosition.value.copy(o.SUN_DIR); scene.add(sky);
  sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor*0.6, 1.0 );'); sky.material.needsUpdate = true;   // sky radiance scaled to the scene exposure if (o.skyDome) o.skyDome.visible = false; scene.background = null;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene((() => { const s = new THREE.Scene(); const k = new Sky(); k.scale.setScalar(1000); Object.assign(k.material.uniforms.sunPosition, {value:o.SUN_DIR.clone()}); ['turbidity','rayleigh','mieCoefficient','mieDirectionalG'].forEach(n => k.material.uniforms[n].value = su[n].value); s.add(k); return s; })(), 0.04).texture;
  new RGBELoader().load(RAMP ? 'tex/quarry_01_puresky.hdr' : 'tex/pizzo_pernice_puresky.hdr', t => { t.mapping = THREE.EquirectangularReflectionMapping; const e = pm.fromEquirectangular(t).texture; scene.environment = e; t.dispose(); }, undefined, () => {});
  // fog colour = the sky's horizon colour; denser near the ground than the old linear fog
  scene.fog.color.set(RAMP ? 0xe9d4b8 : 0xbfd3e3);
  // ---- lights: stronger sun with high-res soft shadows following the rider, hemisphere as fill only
  sun.intensity = RAMP ? 3.4 : 3.2; sun.color.set(RAMP ? 0xfff0dc : 0xfff4e2);
  scene.traverse(x => { if (x.isHemisphereLight) x.intensity = 0.35; });
  renderer.shadowMap.enabled = sun.castShadow = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.shadow.mapSize.set(P.shadow, P.shadow); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
  Object.assign(sun.shadow.camera, {left:-P.shadowR, right:P.shadowR, top:P.shadowR, bottom:-P.shadowR, near:1, far:220}); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.radius = 4; sun.shadow.blurSamples = 16;
  // ---- materials: every Lambert material becomes physically based; standard ones get image-based lighting
  const swapped = new Map();
  const toStd = m => { let s = swapped.get(m); if (s) return s;
    s = new THREE.MeshStandardMaterial({color:m.color, map:m.map, vertexColors:m.vertexColors, side:m.side, flatShading:m.flatShading, transparent:m.transparent, opacity:m.opacity, alphaTest:m.alphaTest, fog:m.fog, emissive:m.emissive, emissiveMap:m.emissiveMap, depthWrite:m.depthWrite, roughness:0.82, metalness:0});
    if (m.onBeforeCompile) s.onBeforeCompile = m.onBeforeCompile; if (m.customProgramCacheKey) s.customProgramCacheKey = m.customProgramCacheKey; s.envMapIntensity = P.envI; swapped.set(m, s); return s; };
  const fix = () => scene.traverse(x => { if (!x.material || x === sky) return;
    if (Array.isArray(x.material)) x.material = x.material.map(m => m.isMeshLambertMaterial ? toStd(m) : m); else if (x.material.isMeshLambertMaterial) x.material = toStd(x.material);
    for (const m of [].concat(x.material)) if (m.isMeshStandardMaterial && !m.userData.gfx){ m.userData.gfx = 1; m.envMapIntensity = P.envI; }
    if (x.isMesh && !x.userData.gfxS && !x.isInstancedMesh && x.geometry && x.geometry.boundingSphere?.radius < 30){ x.castShadow = true; x.userData.gfxS = 1; } });
  fix(); setInterval(fix, 1500);   // streamed chunks / new objects
  // rider & bike: glossy clear-coated frame
  if (o.frameMat){ o.frameMat.roughness = 0.22; o.frameMat.metalness = 0.45; o.frameMat.envMapIntensity = 1.2; }
  // ---- CC0 PBR textures replace the procedural ones in place (same texture objects, so every shader picks them up)
  const T = o.TEX, set = RAMP ? {grass:'aerial_sand', dirt:'red_dirt_mud_01', rock:'dry_riverbed_rock', gravel:'gravel', bark:'bark_brown_02'} : {grass:'sparse_grass', dirt:'brown_mud_leaves_01', rock:'aerial_rocks_02', gravel:'gravel', bark:'bark_brown_02'};
  for (const [k, n] of Object.entries(set)) if (T[k]){ swapImage(T[k].map, `tex/${n}_diff.jpg`, true).catch(() => {}); swapImage(T[k].normal, `tex/${n}_nor_gl.jpg`, false).catch(() => {}); }
  if (o.trunkMat) new THREE.TextureLoader().load('tex/bark_brown_02_rough.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 5); o.trunkMat.roughnessMap = t; o.trunkMat.needsUpdate = true; });
  if (o.terrainMat) upgradeTerrain(o.terrainMat);
  // ---- vegetation: denser grass near the rider
  if (o.setGrass) o.setGrass(P.grassR, P.grassCell);
  // ---- Rampage: drifting dust motes in the low sun
  let dust = null;
  if (RAMP && P.dust){ const N = P.dust, pos = new Float32Array(N*3), R = 70; for (let i = 0; i < N; i++){ pos[i*3] = (Math.random()-0.5)*2*R; pos[i*3+1] = Math.random()*25; pos[i*3+2] = (Math.random()-0.5)*2*R; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), gr = c.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0, 'rgba(255,236,205,0.9)'); gr.addColorStop(1, 'rgba(255,236,205,0)'); c.fillStyle = gr; c.fillRect(0,0,64,64);
    const m = new THREE.PointsMaterial({size:0.55, map:new THREE.CanvasTexture(cv), transparent:true, opacity:0.75, depthWrite:false, color:0xf3d9b8});
    dust = new THREE.Points(g, m); dust.frustumCulled = false; scene.add(dust); dust.userData = {R, pos, N}; }
  // ---- sun glare (lens flare: cheap god-ray look)
  if (P.flare){ const flTex = (r, a) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), gr = c.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0, `rgba(255,248,230,${a})`); gr.addColorStop(r, `rgba(255,220,170,${a*0.25})`); gr.addColorStop(1, 'rgba(255,200,150,0)'); c.fillStyle = gr; c.fillRect(0,0,128,128); return new THREE.CanvasTexture(cv); };
    const fl = new Lensflare(); fl.addElement(new LensflareElement(flTex(0.2, 0.9), 520, 0, new THREE.Color(0xfff2dd))); fl.addElement(new LensflareElement(flTex(0.5, 0.25), 70, 0.6)); fl.addElement(new LensflareElement(flTex(0.5, 0.2), 120, 0.75)); fl.addElement(new LensflareElement(flTex(0.5, 0.15), 60, 1.0));
    const flL = new THREE.PointLight(0xffffff, 0, 0); flL.add(fl); scene.add(flL); o.flare = flL; }
  // ---- showcase layer (trees, ranges, height fog, time of day, CSM, god rays...)
  const SC = showcase(o, P, {sky}); if (SC.csmSetup){ const f0 = fix; setInterval(SC.csmSetup, 1500); }
  o.flareOff = !!SC.godrays;
  scene.traverse(x => { if (x.material) [].concat(x.material).forEach(m => m.needsUpdate = true); });   // recompile with the new fog / lighting chunks
  // ---- post-processing chain
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (P.ao === 'gtao'){ ao = new GTAOPass(scene, camera, innerWidth, innerHeight); ao.updateGtaoMaterial({radius:0.6, distanceExponent:1.5, thickness:1.2, scale:1.0}); ao.blendIntensity = 0.85; composer.addPass(ao); }
  else if (P.ao === 'ssao'){ ao = new SSAOPass(scene, camera, innerWidth, innerHeight); ao.kernelRadius = 0.6; ao.minDistance = 0.0004; ao.maxDistance = 0.02; composer.addPass(ao); }
  let bokeh = null; if (P.dof){ bokeh = new BokehPass(scene, camera, {focus:12, aperture:0.0012, maxblur:0.006}); bokeh.enabled = false; composer.addPass(bokeh); }
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), P.bloom, 0.45, 0.9); composer.addPass(bloom);
  const grPass = SC.godrays ? new ShaderPass(SC.godrays) : null; if (grPass) composer.addPass(grPass);
  composer.addPass(new OutputPass());
  // vignette + speed-based radial motion blur (display-referred, after tone mapping)
  const fin = new ShaderPass({uniforms:{tDiffuse:{value:null}, uBlur:{value:0}, uVig:{value:0.22}},
    vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:`uniform sampler2D tDiffuse; uniform float uBlur, uVig; varying vec2 vUv;
      void main(){ vec2 d = vUv - 0.5; vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (uBlur > 0.001){ vec3 a = c; float w = 1.0; for (int i = 1; i < 8; i++){ float k = float(i)/8.0; vec2 uv = vUv - d*uBlur*k*smoothstep(0.08, 0.5, length(d)); a += texture2D(tDiffuse, uv).rgb; w += 1.0; } c = a/w; }
        float v = smoothstep(0.85, 0.25, length(d*vec2(1.1, 1.0))); c *= mix(1.0 - uVig, 1.0, v);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.15); c = clamp((c - 0.5)*1.07 + 0.5, 0.0, 1.0); gl_FragColor = vec4(c, 1.0); }`});
  composer.addPass(fin);
  let smaa = null; if (P.smaa){ smaa = new SMAAPass(innerWidth*renderer.getPixelRatio(), innerHeight*renderer.getPixelRatio()); composer.addPass(smaa); }
  // ---- per frame
  let acc = 0, frames = 0, lowFor = 0, warned = false; const v = new THREE.Vector3();
  const fps = {value:0};
  function render(dt){
    const S = o.S;
    if (dust){ const {R, pos, N} = dust.userData, cx = camera.position.x, cz = camera.position.z, gy = o.groundH ? o.groundH(cx, cz) : camera.position.y - 2, t = performance.now()/1000;
      for (let i = 0; i < N; i++){ let x = pos[i*3] + (0.9 + 0.3*Math.sin(i))*dt*1.4, z = pos[i*3+2] + Math.sin(t*0.3 + i)*dt*0.4, y = pos[i*3+1] + Math.sin(t*0.7 + i*1.3)*dt*0.15;
        if (x > R) x -= 2*R; if (z > R) z -= 2*R; if (z < -R) z += 2*R; pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z; }
      dust.position.set(Math.floor(cx/(2*R))*2*R + R*0, gy - 2, Math.floor(cz/(2*R))*2*R); dust.position.set(cx - ((cx % (2*R)) + 2*R) % (2*R) + R, gy - 2, cz - ((cz % (2*R)) + 2*R) % (2*R) + R);
      dust.geometry.attributes.position.needsUpdate = true; }
    if (o.flare){ o.flare.position.copy(camera.position).addScaledVector(o.SUN_DIR, 3000); }
    sky.position.copy(camera.position);
    if (bokeh){ const cm = o.getCam(), cine = cm >= 5 && S.state === 'riding' && !S.lift; bokeh.enabled = cine; if (cine){ v.set(S.x, S.y + 0.9, S.z); bokeh.uniforms.focus.value = camera.position.distanceTo(v); } }
    fin.uniforms.uBlur.value = P.mblur ? Math.max(0, Math.min(0.05, ((S.speed || 0)*3.6 - 35)/1400)) : 0;
    SC.update(dt, grPass);
    composer.render(dt);
    // FPS watch on Max: suggest (never force) a lower setting
    acc += dt; frames++; if (acc >= 1){ fps.value = frames/acc; if (o.level === 'max' && fps.value < 40 && document.visibilityState === 'visible') lowFor += acc; else lowFor = 0; acc = 0; frames = 0;
      if (lowFor >= 4 && !warned){ warned = true; o.toast && o.toast(`🐢 ${fps.value.toFixed(0)} FPS on MAX graphics — try HIGH or MEDIUM in Settings → Graphics`); } }
  }
  function resize(){ composer.setSize(innerWidth, innerHeight); if (ao && ao.setSize) ao.setSize(innerWidth, innerHeight); }
  return {render, resize, fps, level:o.level, composer, onChunk: grp => { SC.onChunk(grp); fix(); if (SC.csmSetup) SC.csmSetup(); }};
}
