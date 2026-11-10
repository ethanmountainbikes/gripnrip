// Open-world terrain, trails, jump spots and features. Pure math (no Three.js) so it can be unit-tested in Node.
// which world is loaded: 'mountain' (default) or 'rampage' (Red Bull Rampage-inspired desert venue). Chosen in the main menu (page reloads).
export const WORLD = (() => { try { return JSON.parse(globalThis.localStorage?.getItem('trailDescent.world') || '"mountain"'); } catch(e){ return 'mountain'; } })();
const RAMP = WORLD === 'rampage';
export const W = 3.6;                 // trail half width (same as the original downhill trail)
export const HALF = RAMP ? 760 : 1380;             // world is 2.76 km x 2.76 km (7.6 km², ~32% more than the original 2.4 km)
const CORE = RAMP ? 640 : 1200;                    // original map half-size: trail/lift layout stays inside it so nothing moves
const BLEND = W + 7;                  // trail bench blends back into the hillside over this distance
const PADS = [];                       // level pads under the shop and lift stations; filled once those spots exist
let editorOn = false;                  // level-editor pad. Off during normal play, so the mountain is unchanged.

// ---------- noise ----------
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const perm = new Uint8Array(512); { const r = mulberry(1337), p = [...Array(256).keys()]; for (let i=255;i>0;i--){ const j = Math.floor(r()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; } for (let i=0;i<512;i++) perm[i]=p[i&255]; }
const GR = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
function noise(x, y){
  const X = Math.floor(x), Y = Math.floor(y), xf = x-X, yf = y-Y, xi = X & 255, yi = Y & 255;
  const g = (i,j,dx,dy) => { const v = GR[perm[i+perm[j]] & 7]; return v[0]*dx + v[1]*dy; };
  const u = xf*xf*xf*(xf*(xf*6-15)+10), v = yf*yf*yf*(yf*(yf*6-15)+10);
  const a = g(xi,yi,xf,yf), b = g(xi+1,yi,xf-1,yf), c = g(xi,yi+1,xf,yf-1), d = g(xi+1,yi+1,xf-1,yf-1);
  return (a + u*(b-a)) + v*((c + u*(d-c)) - (a + u*(b-a)));
}
const fbm = (x,y) => noise(x,y) + 0.5*noise(x*2.03+5.2,y*2.03+1.3) + 0.25*noise(x*4.1+9.1,y*4.1+3.7) + 0.12*noise(x*8.3+2.2,y*8.3+7.9);
const smooth = (a,b,x) => { const t = Math.min(1, Math.max(0, (x-a)/(b-a))); return t*t*(3-2*t); };

// ---------- landmarks ----------
export const PEAK = {x:150, z:-450, h:340, s:300};
const HILLS = [ {x:-700, z:250, h:150, s:210}, {x:680, z:420, h:120, s:240}, {x:-450, z:-850, h:90, s:260}, {x:900, z:-800, h:160, s:230} ];
// Dirt-jump park: a flattened, gently sloping dirt pad in the valley
export const PARK = RAMP ? {x:1e5, z:1e5, r:0, dir:[1,0], slope:0} : {x:-250, z:560, r:75, dir:[1,0], slope:0};

// ---------- Rampage desert: a steep red-sandstone amphitheatre with knife-edge ridgelines running down the fall line ----------
// start platforms on the summit ridge (~215 m up), finish corral on the flat valley floor below, desert mesas on the horizon.
export const RAMPAGE = {top:-430, bottom:250, H:215, corral:{x:0, z:300, r:42}};
const ridged = (x, y) => 1 - Math.abs(noise(x, y));
function rampageH(x, z){
  const R = RAMPAGE, u = Math.min(1, Math.max(0, (z - R.top)/(R.bottom - R.top)));     // 0 summit .. 1 valley
  const side = smooth(260, 560, Math.abs(x));                                        // the amphitheatre narrows to the sides
  const fall = R.H*(1 - u*u*(3 - 2*u))*(1 - 0.55*side);                              // main face, steepest in the middle (~0.47)
  const mid = Math.sin(Math.PI*Math.min(1, Math.max(0, (z - R.top + 40)/(R.bottom - R.top + 30))));   // ridges fade out at the summit and the valley
  const warp = 18*noise(z/140 + 3.3, x/300);
  const rg = Math.pow(ridged((x + warp)/62 + 0.37, z/420 + 1.9), 3), rg2 = Math.pow(ridged((x - warp)/27 + 5.1, z/170 - 2.2), 4);
  let h = fall + mid*(34*rg + 9*rg2 - 14) + 3*noise(x/45 + 7, z/45 - 3);
  if (z < R.top) h += 6*noise(x/90, z/90) - Math.max(0, (R.top - z) - 60)*0.6;       // summit ridge behind the start
  if (z > R.bottom) h = Math.min(h, 2 + 1.5*noise(x/70, z/70) + Math.max(0, z - 520)*0.02);   // valley floor: finish corral, spectators
  const e = Math.max(Math.abs(x), Math.abs(z) + (z > 0 ? 0 : 0)) - (HALF - 60);
  if (e > 0){ const m = smooth(0, 300, e), r = noise(x/500 + 21, z/500 - 4);       // mesas: flat tops, stepped cliffs
    const mesa = Math.min(1, Math.max(0, r*2 + 0.7)) * (140 + 60*noise(x/900, z/900)); h += m*Math.round(mesa/22)*22 + e*0.05; }
  return h;
}
function rawH(x, z){
  if (RAMP) return rampageH(x, z);
  let h = 40*(noise(x/420+3.1, z/420-7.7) + 0.5*noise(x/210+5.2, z/210+1.3) + 0.12*noise(x/105+9.1, z/105+3.7));   // smooth hills: no small-scale octaves
  const dp = ((x-PEAK.x)**2 + (z-PEAK.z)**2) / (2*PEAK.s*PEAK.s);
  h += PEAK.h*Math.exp(-dp) * (1 + 0.05*noise(x/220+11, z/220));
  for (const k of HILLS) h += k.h*Math.exp(-((x-k.x)**2 + (z-k.z)**2)/(2*k.s*k.s));
  const e = Math.max(Math.abs(x), Math.abs(z)) - (HALF-90);      // beyond the map edge: irregular distant mountain ranges (no uniform wall/ring)
  { const eb = Math.max(Math.abs(x), Math.abs(z)) - (CORE-90);   // new outer band: extra rolling forested hills
    if (eb > 0) h += smooth(0, 120, eb)*(25 + 35*noise(x/160+13, z/160-6)); }
  if (e > 0){ const m = smooth(0, 600, e), r = noise(x/700+21, z/700-4), r2 = noise(x/260-3, z/260+8);
    h += e*0.12 + m*(120 + 420*Math.max(0, r + 0.35) + 90*r2); }
  return h;
}
const parkH0 = rawH(PARK.x, PARK.z);
const parkPlane = (x,z) => { const a = (x-PARK.x)*PARK.dir[0] + (z-PARK.z)*PARK.dir[1], q = Math.max(0, -62 - a);   // pad + a steep roll-in hill at the top for speed
  return parkH0 - PARK.slope*a + (q < 10 ? 0.4*q*q/20 : 0.4*(q-5)); };
function parkMask(x,z){ const r = Math.hypot(x-PARK.x, z-PARK.z); return 1 - smooth(PARK.r, PARK.r+70, r); }
export function base(x, z){
  const m = parkMask(x,z); const r = rawH(x,z);
  return m > 0 ? r + (parkPlane(x,z) - r)*m : r;
}

// ---------- trails ----------
// Each trail is generated by a walker that descends toward a goal at a target gradient, like a builder benching a line into the hill.
const RAMP_DEFS = [
  // lines from the start platforms on the summit ridge down to the finish corral (names nod to real Rampage features)
  {name:'Zink Chute',       color:'#e8322b', start:[-30,-425],  via:[[-10,262]], goal:[-1,300], grade:0.46, startYaw:0, kind:'rampage', type:'Big mountain chute', diff:'dblack', feats:['bigdrop','stepdown','gap','bigdrop','canyon','bigdrop']},
  {name:'Goblin Ridge',     color:'#ff9a1a', start:[90,-420],   via:[[60,262]], goal:[6,300],  grade:0.42, startYaw:0, kind:'rampage', type:'Freeride ridgeline', diff:'dblack', feats:['wooddrop','goblin','bigdrop','gap','stepdown','bigdrop']},
  {name:'Canyon Gap Line',  color:'#7a2cff', start:[-140,-410], via:[[-110,262]], goal:[-11,300], grade:0.42, startYaw:0.1, kind:'rampage', type:'Freeride', diff:'dblack', feats:['bigdrop','canyon','stepdown','wooddrop','gap','bigdrop']},
  {name:'Stratos Drop',     color:'#111111', start:[220,-400],  via:[[190,262]], goal:[19,300], grade:0.40, startYaw:-0.2, kind:'rampage', type:'Big drops', diff:'dblack', feats:['stratos','stepdown','gap','wooddrop','bigdrop','stepdown']},
  {name:'Formation Ridge',  color:'#2f8cff', start:[-290,-380], via:[[-250,262]], goal:[-25,300], grade:0.34, startYaw:0.1, kind:'rampage', type:'Freeride (women\'s venue style)', diff:'black', feats:['wooddrop','stepdown','gap','bigdrop','stepdown','gap']},
  // BONE CRUSHER: the hardest line in the game. A hand-built line (explicit waypoints, no walker) down the knife-edge ridges
  // between Canyon Gap and Zink: ridgeline roll-in, rock gardens with crash rocks either side of a narrow clean lane,
  // a cut 40 deg chute, tight exposed switchbacks across the ridge, 2-5 m ledges, a mandatory rock-roll, an off-camber
  // traverse, a step-down into a second chute and a huge cliff drop near the bottom. Unlocks after any other Rampage line.
  {name:'BONE CRUSHER', color:'#f2ead8', kind:'rampage', pro:true, unlockAny:true, type:'PRO big-mountain line', diff:'pro3', feats:[],
   line:[[-100,-452],[-100,-425],[-104,-395],[-112,-365],[-115,-335],[-115,-305],[-115,-275],[-115,-245],[-115,-217],   // 0-8: ridge, crash rocks, ledge, chute 1
         [-128,-206],[-160,-199],[-166,-193],[-160,-187],[-128,-179],[-122,-173],[-128,-167],[-160,-159],[-166,-153],[-160,-147],[-132,-138],   // 9-19: switchbacks
         [-118,-122],[-115,-104],[-113,-88],[-110,-72],[-102,-55],[-94,-38],[-82,-14],                            // 20-26: rock-roll, off-camber traverse
         [-77,5],[-75,25],[-75,70],[-75,95],[-75,125],[-75,145],[-74,175],[-68,205],[-50,240],[-32,268],[-22,292]],   // 27-37
   // shaped sections: extra slope on top of the ridge's own grade (cut into the ridge, so the chute has walls)
   shape:[{a:5, b:8, e:0.1, R:24, tag:'chute'}, {a:21, b:22, e:0.42, R:14, tag:'rockroll'}, {a:28, b:29, e:0.38, R:22, tag:'chute'}],
   pfeat:[{at:3, kind:'crashrocks', L:22}, {at:5, kind:'ledge', H:2.2}, {at:23, kind:'camber', L:34}, {at:27, kind:'stepdown'},
          {at:30, kind:'crashrocks', L:22}, {at:31, kind:'ledge', H:3.4, off:6}, {at:32, kind:'ledge', H:4.8, off:6}, {at:33, kind:'cliff', H:7.5}]},
];
// bike-park routing: every trail starts near a lift top and finishes just above a lift bottom station (its own lift or a shared base).
// Nominal bottom stations (the final spot is searched nearby, >= 15 m clear of every trail and jump):
const BASES = RAMP ? {A:[10, 385]} : {A:[-120, 470], B:[-334, 455], C:[770, 770], D:[-1069, -972], E:[1105, -300], F:[60, -1095], G:[-75, 560], H:[1200, -1030]};
const TRAIL_DEFS = RAMP ? RAMP_DEFS : [
  {name:'Summit DH',          color:'#e8322b', start:[150,-395],  via:[[125,-300],[95,-200],[60,-100],[10,30],[-60,180],[-100,330]], goal:BASES.A, grade:0.20, startYaw:Math.PI*0.9, kind:'dh', type:'Downhill', diff:'black', base:'A', tight:true},
  {name:'Flow Line',          color:'#2f8cff', start:[205,-400],  via:[[300,-280],[470,-150],[570,60],[430,330],[180,520]], goal:BASES.G, grade:0.12, startYaw:-Math.PI/2, kind:'flow', type:'Flow', diff:'blue', base:'G', tight:true},
  {name:'Freeride Ridge',     color:'#111111', start:[240,-520],  via:[[735,-548],[850,-380]], goal:BASES.E, grade:0.32, kind:'freeride', type:'Freeride', diff:'dblack', outer:true, base:'E', tight:true},
  {name:'North Face',         color:'#7a2cff', start:[165,-525],  goal:BASES.F, grade:0.34, startYaw:0, kind:'enduro', type:'Enduro', diff:'black', base:'F'},
  {name:'Forest Singletrack', color:'#2fae4a', start:[-635,320],  via:[[-600,700]], goal:BASES.B, grade:0.11, kind:'xc', type:'Cross-country', diff:'green', base:'B'},
  {name:'Rock Garden',        color:'#8a8a8a', start:[900,-750], via:[[1000,-600],[1080,-420]], goal:BASES.E, grade:0.18, kind:'tech', type:'Technical singletrack', diff:'black', outer:true, base:'E', tight:true},
  {name:'Drop Zone',          color:'#c0392b', start:[-500,-1010], via:[[-800,-820]], goal:BASES.D, grade:0.16, kind:'drops', type:'Freeride', diff:'dblack', base:'D'},
  {name:'Meadow Flow',        color:'#1abc9c', start:[-560,250],  via:[[-430,240]], goal:BASES.B, grade:0.10, kind:'flowg', type:'Flow', diff:'green', base:'B'},
  {name:'Pump Line',          color:'#f1c40f', start:[750,450],   via:[[900,600]], goal:BASES.C, grade:0.08, kind:'pump', type:'Pump track', diff:'green', base:'C'},
  {name:'MEGA SEND',          color:'#ff1f8f', line:[[420,0],[-100,520]], grade:0.2, kind:'mega', type:'Slopestyle pro line', diff:'dblack', base:'G'},
  {name:'Hilltop Jumps',      color:'#ff9a1a', start:[680,380],   via:[[640,650]], goal:BASES.C, grade:0.09, kind:'jumps', type:'Jump line', diff:'blue', base:'C'},
  // outer-band trails (added with the map expansion)
  {name:'Boreal Enduro',      color:'#5d4037', start:[-450,-1180], goal:BASES.D, grade:0.13, kind:'enduro', type:'Enduro', diff:'black', outer:true, base:'D'},
  {name:'Ridgeback Flow',     color:'#00acc1', start:[930,-1120],  goal:BASES.H, grade:0.12, kind:'flow', type:'Flow', diff:'blue', outer:true, base:'H'},
  {name:'Eastern Traverse',   color:'#7cb342', start:[960,-830],  via:[[1150,-700]], goal:BASES.E, grade:0.07, kind:'xc', type:'Cross-country', diff:'green', outer:true, base:'E', tight:true},
];
function walk(def){
  let [x,z] = def.start, yaw = def.startYaw ?? Math.atan2(-(def.goal[0]-x), -(def.goal[1]-z));
  const pts = [[x,z]], STEP = 4;
  const goals = [...(def.via||[]), def.goal]; let gi = 0;
  for (let i=0;i<900;i++){
    const goal = goals[gi], gx = goal[0]-x, gz = goal[1]-z, gd0 = Math.hypot(gx,gz);
    if (gd0 < 25){ if (++gi >= goals.length) break; continue; }
    const gd = gd0;
    const gyaw = Math.atan2(-gx,-gz); let best = null;
    for (const dy of [-0.22,-0.11,0,0.11,0.22]){
      const ny = yaw+dy, nx = x - Math.sin(ny)*STEP, nz = z - Math.cos(ny)*STEP;
      const lim = def.outer ? HALF-150 : CORE-130; if (Math.abs(nx) > lim || Math.abs(nz) > lim) continue;
      const sl = (base(x,z) - base(nx,nz))/STEP;      // >0 downhill
      const ga = Math.atan2(Math.sin(ny-gyaw), Math.cos(ny-gyaw));
      const gw = def.tight ? 6 : gd < 120 ? 5 : 1.5;   // tight: follow the via points closely (lift-base routing)
      const cost = (sl-def.grade)**2*25 + (sl<0 ? -sl*15 : 0) + ga*ga*gw + dy*dy*2;
      if (!best || cost < best.c) best = {c:cost, y:ny, x:nx, z:nz};
    }
    if (!best) break; yaw = best.y; x = best.x; z = best.z; pts.push([x,z]);
  }
  return pts;
}
function chaikin(p){ const o=[p[0]]; for (let i=0;i<p.length-1;i++){ const a=p[i], b=p[i+1]; o.push([a[0]*.75+b[0]*.25, a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75, a[1]*.25+b[1]*.75]); } o.push(p[p.length-1]); return o; }
function resample(p, step){ const o=[p[0]]; let carry=0;
  for (let i=0;i<p.length-1;i++){ const a=p[i], b=p[i+1], L=Math.hypot(b[0]-a[0], b[1]-a[1]); let t = step-carry;
    while (t <= L){ o.push([a[0]+(b[0]-a[0])*t/L, a[1]+(b[1]-a[1])*t/L]); t += step; } carry = L - (t-step); }
  return o; }
export const trails = TRAIL_DEFS.map((def, id) => {
  let pts = def.line ? resample(chaikin(chaikin(chaikin(def.line))), 2) : resample(chaikin(chaikin(walk(def))), 2);
  let raw = pts.map(p => base(p[0],p[1]));
  if (!def.line && !RAMP){ let lo = Math.floor(pts.length*0.6); for (let i=lo;i<pts.length;i++) if (raw[i] < raw[lo]) lo = i;   // trim any climb at the very end
    pts = pts.slice(0, lo+1); raw = raw.slice(0, lo+1); }
  const n = pts.length, h = new Float32Array(n), K = 6;   // smooth heights along the line (±12 m)
  for (let i=0;i<n;i++){ let s=0,c=0; for (let j=Math.max(0,i-K); j<=Math.min(n-1,i+K); j++){ const w = K+1-Math.abs(i-j); s+=raw[j]*w; c+=w; } h[i]=s/c; }
  if (def.shape){ const wi = def.line.map(w => { let bd = 1e9, bi = 0; pts.forEach((p, j) => { const d = Math.hypot(p[0]-w[0], p[1]-w[1]); if (d < bd){ bd = d; bi = j; } }); return bi; }); def._wi = wi;
    const dev = new Float32Array(n);
    for (const sh of def.shape){ const i0 = wi[sh.a], i1 = wi[sh.b], L = (i1-i0)*2, A = sh.e*L/2, R = sh.R/2;
      for (let i = 0; i < n; i++){ let v = 0;
        if (i >= i0 - R && i < i0) v = A*smooth(i0 - R, i0, i);                    // build up (flatter run-in on the ridge)
        else if (i >= i0 && i <= i1) v = A*(1 - 2*(i - i0)/(i1 - i0));              // the steep section itself
        else if (i > i1 && i <= i1 + R) v = -A*(1 - smooth(i1, i1 + R, i));         // cut back into the ridge (run-out)
        dev[i] += v; } }
    for (let i = 0; i < n; i++){ let a = 0, c = 0; for (let j = Math.max(0, i-3); j <= Math.min(n-1, i+3); j++){ const w = 4 - Math.abs(i-j); a += dev[j]*w; c += w; } h[i] += a/c; }   // soften the kinks (no crest launches)
    for (let i = 1; i < n; i++) h[i] = Math.min(h[i], h[i-1] - 0.04);   // never climbs
  }
  // Round off the sharpest crests: a slope that steepens by more than 0.035 per 2 m sample is shaved down.
  // A hill top this tight throws a fast rider off the ground, and on the 2 m terrain mesh it shows as a hard seam.
  // Rampage lines (and hand-shaped pro lines) keep their raw ridges, cut chutes and ledges on purpose.
  if (!RAMP && !def.shape) for (let pass = 0; pass < 24; pass++){ let moved = false;
    for (let i = 1; i < n - 1; i++){ const dk = (2*h[i] - h[i-1] - h[i+1])/2; if (dk > 0.035){ h[i] -= dk - 0.034; moved = true; } }
    if (!moved) break; }
  const yaw = pts.map((p,i) => { const a = pts[Math.max(0,i-1)], b = pts[Math.min(n-1,i+1)]; return Math.atan2(-(b[0]-a[0]), -(b[1]-a[1])); });
  return {...def, id, pts, h, yaw, len:(n-1)*2};
});

// ---------- features (kickers, tables, doubles, drops) ----------
// Each feature has an origin, a forward direction, a half width and a height profile p(t) along it. Heights add to the terrain.
export const features = [];
const KL = 5.5, KH = 1.5, KW = 2.3;   // original wooden kicker
import { JUMP_SPEEDS, MEGA_LIP, MEGA_FIX } from './jumpspeeds.js';
const PROF = {
  kicker: (H,L) => ({L, p: t => t>=0 && t<=L ? H*Math.pow(t/L,1.7) : 0, wood:true}),
  table:  (H,L1,deck,L3) => ({L:L1+deck+L3, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.6) : t<=L1+deck ? H-0.15 : t<=L1+deck+L3 ? (H-0.15)*0.5*(1+Math.cos(Math.PI*(t-L1-deck)/L3)) : 0}),
  double: (H,L1,gap,L3) => { const back = 1.6; return {L:L1+gap+back+L3, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.6) : t<=L1+gap ? 0 : t<=L1+gap+back ? (H-0.2)*Math.sin(0.5*Math.PI*(t-L1-gap)/back) : t<=L1+gap+back+L3 ? (H-0.2)*0.5*(1+Math.cos(Math.PI*(t-L1-gap-back)/L3)) : 0}; },
  // gap jump: takeoff and landing are both built up, so coming up short drops you into the real hole between them
  gap:    (H,L1,gap,L3) => { const back = 2.0, HL = H-0.25; return {L:L1+gap+back+L3, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.6) : t<=L1+gap ? 0 : t<=L1+gap+back ? HL*Math.sin(0.5*Math.PI*(t-L1-gap)/back) : t<=L1+gap+back+L3 ? HL*0.5*(1+Math.cos(Math.PI*(t-L1-gap-back)/L3)) : 0}; },
  stepup: (H,L1,gap,H2,deck,L3) => { const back = 1.6; return {L:L1+gap+back+deck+L3, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.6) : t<=L1+gap ? 0 : t<=L1+gap+back ? H2*Math.sin(0.5*Math.PI*(t-L1-gap)/back) : t<=L1+gap+back+deck ? H2 : t<=L1+gap+back+deck+L3 ? H2*0.5*(1+Math.cos(Math.PI*(t-L1-gap-back-deck)/L3)) : 0}; },
  stepdown: (H,L1,gap,H2,L3) => ({L:L1+gap+L3, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.6) : t<=L1+gap ? 0.15 : t<=L1+gap+L3 ? H2*0.5*(1+Math.cos(Math.PI*(t-L1-gap)/L3)) : 0}),
  berm:   (H,L,side,hw) => ({L, p: (t,us) => t>=0 && t<=L ? H*Math.sin(Math.PI*t/L)*smooth(1.0, hw, side*us) : 0}),
  roller: (H,L) => ({L, p: t => t>=0 && t<=L ? H*Math.sin(Math.PI*t/L)**2 : 0}),
  rocks:  (H,L,n) => ({L, rock:true, p: t => t>=0 && t<=L ? H*Math.sin(Math.PI*n*t/L)**2 * (0.7+0.3*Math.sin(t*2.3)) : 0}),
  drop:   (H,L1,deck) => ({L:L1+deck, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.2) : t<=L1+deck ? H : 0, wood:true}),
  // Rock ledge: ease onto a short deck, then a steep face that eases out onto the descending tread. Slow speed can roll it; the lip falls away at speed.
  rockDrop: (H) => { const up = Math.max(5, H / 0.2), deck = 1.1, face = Math.max(3.2, H / 0.42), lip = up + deck, L = lip + face;
    return { L, wood: false, rock: true, handLand: true, p: t => { if (t < 0 || t > L) return 0; if (t <= up){ const u = t / up; return H * u * u * (3 - 2 * u); } if (t <= lip) return H; const u = (t - lip) / face; return H * (1 - u) * (1 - u); } }; },
  // Smooth slab. Zero slope at the crest and at both ends, so it rides down instead of launching.
  rockRoll: (H, down) => { const up = Math.max(5.5, H * 4.2), L = up + down; return { L, wood: false, rock: true, p: t => { if (t < 0 || t > L) return 0; if (t <= up){ const u = t / up; return H * u * u * (3 - 2 * u); } const u = (t - up) / down; return H * (1 - u * u * (3 - 2 * u)); } }; },
};
// Rampage-scale features (sized for ~45-55 km/h, the speed riders carry down the face)
// big dirt drop: run-up lip, short flat deck, a knuckle and a long steep landing transition (like the park's Big Drop)
const bigDropP = (H) => { const RU = 2.3*H, DK = 3, KN = 2.5, HK = 0.62*H, LL = 2.4*H;
  return {L:RU+DK+KN+LL, p: t => t<0 ? 0 : t<=RU ? H*Math.pow(t/RU,1.2) : t<=RU+DK ? H : t<=RU+DK+KN ? HK : t<=RU+DK+KN+LL ? (u => HK*(1 - u*u*(3-2*u)))((t-RU-DK-KN)/LL) : 0}; };
// canyon gaps: real holes carved into the terrain between the takeoff and the landing
export const CANYONS = [];
export function canyonCut(x, z){ let h = 0;
  for (const c of CANYONS){ const rx = x-c.x, rz = z-c.z, t = rx*c.dx + rz*c.dz, u = Math.abs(rx*c.dz - rz*c.dx);
    if (t < c.t0-1 || t > c.t1+1 || u > c.w+12) continue;
    const across = Math.min(smooth(c.t0-0.5, c.t0+1.5, t), 1 - smooth(c.t1-1.5, c.t1+0.5, t)), along = 1 - smooth(c.w, c.w+12, u);
    h = Math.min(h, -c.D*across*along); }
  return h; }
function addFeature(kind, x, z, yaw, hw, prof, trail){
  const f = {kind, x, z, yaw, dx:-Math.sin(yaw), dz:-Math.cos(yaw), hw, ...prof, trail};
  f.minx = Math.min(x, x+f.dx*f.L) - hw - 2; f.maxx = Math.max(x, x+f.dx*f.L) + hw + 2;
  f.minz = Math.min(z, z+f.dz*f.L) - hw - 2; f.maxz = Math.max(z, z+f.dz*f.L) + hw + 2;
  features.push(f); return f;
}
// trail features: only on straight-ish downhill sections
// jumps are scaled to the speed riders actually carry at each spot (measured by a coasting bot, see JUMP_SPEEDS):
// a uniform geometric scale g keeps the ramp angles, so the clearing speed goes with sqrt(g); g = (v / trail's median speed)^2
const JUMPY = new Set(['kicker','table','double','gap','stepup','stepdown','drop','rockdrop']);
const GMAX = {green:1.1, blue:1.2, black:1.3, dblack:1.35};
const scaleProf = (pr, g) => g === 1 ? pr : {...pr, L: pr.L*g, p: (t, us) => g*pr.p(t/g, us), L0: pr.L};
for (const tr of trails){
  const n = tr.pts.length;
  // features match the trail type (spacing = run-out after each feature)
  if (tr.kind === 'mega' || tr.pro) continue;
  const spacing = {rampage:46, dh:38, enduro:36, flow:28, flowg:32, xc:40, tech:22, freeride:42, drops:42, pump:1, jumps:16}[tr.kind];
  let i = tr.kind === 'tech' ? 4 : 40, k = 0;
  const sp = (JUMP_SPEEDS[tr.name] || []).filter(Boolean).sort((a,b)=>a-b), vRef = sp.length ? sp[sp.length>>1] : 30;   // the trail's typical speed = current jump size
  while (i < n-(tr.kind==='tech' ? 6 : tr.kind==='rampage' ? 45 : 30)){
    const turn = Math.abs(Math.atan2(Math.sin(tr.yaw[i+12]-tr.yaw[i]), Math.cos(tr.yaw[i+12]-tr.yaw[i])));
    const sl = (tr.h[i]-tr.h[i+10])/20;
    const crowded = tr.kind === 'rampage' && trails.some(o => o !== tr && !o.pro && o.pts.some(p => Math.hypot(p[0]-tr.pts[i][0], p[1]-tr.pts[i][1]) < 34 || Math.hypot(p[0]-tr.pts[Math.min(n-1,i+14)][0], p[1]-tr.pts[Math.min(n-1,i+14)][1]) < 34));
    if (!crowded && turn < 0.18 && sl > 0.04 || (tr.kind==='pump' || tr.kind==='xc') && turn < 0.3 || tr.kind==='tech' && turn < 0.6){
      const v = (JUMP_SPEEDS[tr.name] || [])[k], g = v ? Math.max(0.7, Math.min(GMAX[tr.diff], (v/vRef)**2)) : 1;
      const S_ = (kind, pr) => JUMPY.has(kind) ? scaleProf(pr, g) : pr;
      const [x,z] = tr.pts[i], yaw = tr.yaw[i+2], A = (kind, hw, pr) => { const f = addFeature(kind, x, z, yaw, hw, S_(kind, pr), tr.id); f.k = k; f.g = JUMPY.has(kind) ? g : 1; return f; };
      let f;
      const sz = {green:0.7, blue:0.9, black:1.1, dblack:1.3}[tr.diff];   // feature size by difficulty
      const hip = (H) => { const ang = 0.05 + (k % 3) * 0.025; const f = addFeature('kicker', x, z, yaw + (k % 2 ? ang : -ang), KW, S_('kicker', PROF.kicker(H, KL)), tr.id); f.k = k; f.g = g; f.hip = ang; return f; };
      const bigTable = () => A('table', 2.8, PROF.table(1.5*sz, 5.5, 8, 7));
      switch (tr.kind){
        case 'dh':       f = [() => A('kicker', KW, PROF.kicker(KH, KL)), () => hip(1.5*sz), () => bigTable(), () => A('rocks', 2.6, PROF.rocks(0.28, 10, 5)), () => A('drop', 1.8, PROF.drop(1.2*sz, 5, 2.5)),
                              () => A('stepdown', 2.4, PROF.stepdown(1.5*sz, 4.5, 2, 1.0, 6)), () => A('gap', 2.4, PROF.gap(1.6*sz, 5, 3, 6))][k%7](); break;
        case 'enduro':   f = [() => A('rocks', 2.6, PROF.rocks(0.3, 12, 6)), () => hip(1.3), () => bigTable(), () => A('rockdrop', 2.0, {...PROF.drop(1.0, 4, 2), rock:true}), () => A('stepdown', 2.4, PROF.stepdown(1.3, 4, 2, 0.9, 5))][k%5](); break;
        case 'flow':     f = [() => A('roller', 2.6, PROF.roller(0.5, 9)), () => A('table', 2.4, PROF.table(1.2*sz, 4, 3, 4)), () => hip(1.15*sz), () => bigTable(), () => A('stepup', 2.4, PROF.stepup(1.0, 4, 1.5, 1.3, 3, 5)), () => A('stepdown', 2.4, PROF.stepdown(1.2, 4, 1.5, 0.8, 5))][k%6](); break;
        case 'flowg':    f = k%4===3 ? hip(0.85) : k%3===2 ? A('table', 2.4, PROF.table(0.8, 3.5, 2.5, 3.5)) : A('roller', 2.6, PROF.roller(0.35, 9)); break;
        case 'xc':       f = k%4===1 ? A('table', 2.2, PROF.table(0.55, 3.2, 2.6, 3.2)) : k%4===3 ? hip(0.7) : A('roller', 2.6, PROF.roller(0.3, 9)); break;
        case 'tech': {
          // Rock Garden: almost the whole tread is rock. One slot in twelve is a short dirt run-out.
          const slot = k % 12;
          if (slot === 0){ k++; i += 2; continue; }
          const ahead = Math.abs(Math.atan2(Math.sin(tr.yaw[Math.min(n - 1, i + 10)] - yaw), Math.cos(tr.yaw[Math.min(n - 1, i + 10)] - yaw)));
          if ((slot === 2 || slot === 8) && ahead < 0.16){ const H = 0.6 + (Math.floor(k / 6) % 3) * 0.4; f = addFeature('rockdrop', x, z, yaw, 3.3, PROF.rockDrop(H), tr.id); f.k = k; f.rockDrop = H; }
          else if (slot === 5 && ahead < 0.35){ f = A('roll', 3.2, PROF.rockRoll(0.9 + (k % 3) * 0.2, 10 + (k % 2) * 2)); f.rockRoll = true; }
          else { f = A('rocks', 3.2, { L: 12 + (k % 2) * 4, rock: true, wood: false, p: () => 0 }); f.garden = true; }
          break; }
        case 'freeride': f = [() => A('drop', 1.8, PROF.drop(2.0, 6, 3)), () => bigTable(), () => A('gap', 2.6, PROF.gap(2.0, 5.5, 4, 7)), () => hip(2.0), () => A('stepdown', 2.6, PROF.stepdown(1.9, 5, 2.5, 1.2, 7))][k%5](); break;
        case 'drops':    f = k%3===1 ? hip(1.5) : k%3===2 ? bigTable() : A('drop', 1.8, PROF.drop(1.6+0.3*(k%3), 6, 3)); break;
        case 'pump':     f = k%8===7 ? hip(0.6) : k%7===6 ? A('table', 2.1, PROF.table(0.42, 2.8, 2.2, 2.8)) : A('roller', 2.2, PROF.roller(0.72, 5.5)); break;
        case 'rampage': { const kinds = trails[tr.id].feats, kk = kinds[k % kinds.length];
          if (k >= kinds.length + 2){ f = k%2 ? hip(1.8) : bigTable(); break; }
          f = kk === 'bigdrop' ? A('drop', 2.8, bigDropP(3.4)) : kk === 'stratos' ? A('drop', 3.0, bigDropP(5.2)) :
              kk === 'wooddrop' ? A('drop', 2.0, PROF.drop(2.2, 6, 3)) : kk === 'goblin' ? A('stepdown', 2.8, PROF.stepdown(3.0, 7, 7, 2.2, 12)) :
              kk === 'stepdown' ? A('stepdown', 2.6, PROF.stepdown(2.2, 5.5, 4, 1.4, 9)) : kk === 'gap' ? A('gap', 2.6, PROF.gap(2.0, 5.5, 6, 8)) :
              (() => { const g = A('gap', 2.8, PROF.gap(2.4, 6, 12, 8)); CANYONS.push({x:g.x, z:g.z, dx:g.dx, dz:g.dz, t0:6, t1:18, w:g.hw+3, D:9}); g.canyon = true; return g; })();
          if (kk === 'goblin') f.goblin = true; if (kk === 'stratos') f.stratos = true; break; }
        case 'jumps':    f = [() => bigTable(), () => A('double', 2.4, PROF.double(1.5, 4.5, 2.2, 5)), () => hip(1.4), () => A('stepup', 2.4, PROF.stepup(1.2, 4.5, 1.8, 1.6, 3, 5)), () => A('gap', 2.4, PROF.gap(1.5, 4.5, 2.5, 6)), () => A('table', 2.4, PROF.table(1.4, 4.5, 3.5, 4.5))][k%6](); break;
      }
      k++; i += (tr.kind === 'tech' ? 0 : Math.round(spacing/2)) + Math.round((f.L0 || f.L)/2); continue;
    }
    i += 3;
  }
}
// ---------- MEGA SEND: slopestyle pro line with huge gaps, step-downs, step-ups and a 28 m finale ----------
// Each lip is shaped for the speed a coasting rider actually carries into it (MEGA_LIP, measured by a bot, km/h at the lip):
// the lip angle is solved so the ballistic arc lands ~35% down the landing's transition (its sweet spot).
const megaP = (H, L1, gap, HL, L3) => { const back = 3; return {L:L1+gap+back+L3, lip:L1, gapLen:gap, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1,1.6) : t<=L1+gap ? 0 : t<=L1+gap+back ? HL*Math.sin(0.5*Math.PI*(t-L1-gap)/back) : t<=L1+gap+back+L3 ? HL*0.5*(1+Math.cos(Math.PI*(t-L1-gap-back)/L3)) : 0}; };
export const MEGA = [];
for (const tr of trails){ if (tr.kind !== 'mega') continue;
  const PLAN = [{H:6, gap:20, HL:5.6}, {H:7, gap:24, HL:6.5}, {H:7.5, gap:22, HL:4, kind:'stepdown'}, {H:5, gap:18, HL:6.5, kind:'stepup'}, {H:7, gap:26, HL:6.5}, {H:6, gap:28, HL:1.5, finale:true}];
  const n = tr.pts.length; let i = 75, k = 0;   // 150 m flat-out run-in past the summit traverse before the first lip
  if (n > 60){ const hf = addFeature('kicker', tr.pts[18][0], tr.pts[18][1], tr.yaw[20] + 0.45, 2.3, PROF.kicker(1.2, 5), tr.id); hf.hip = 0.45;
    addFeature('table', tr.pts[46][0], tr.pts[46][1], tr.yaw[48], 2.6, PROF.table(1.7, 5.5, 8, 6.5), tr.id); }
  if (tr.megaStart){ let bd = 1e9, bi = 0; tr.pts.forEach((p, j) => { const d = Math.hypot(p[0]-tr.megaStart[0], p[1]-tr.megaStart[1]); if (d < bd){ bd = d; bi = j; } }); i = bi + 75; }
  for (const J of PLAN){ if (i >= n - 40) break;
    const s = Math.max(0.05, (tr.h[i] - tr.h[Math.min(n-1, i+30)])/60), v = ((MEGA_LIP[k] ?? 62)/3.6), g = 9.81, back = 3;
    // landing length: first guess, then match the transition's slope at the sweet spot to the arc's descent angle (soft landing)
    let L3 = Math.max(14, 2.6*J.HL), rel = 0.4;
    for (let it = 0; it < 6; it++){
      const D = J.gap + back + 0.35*L3 + (MEGA_FIX[k] || 0), c = J.HL*0.5*(1+Math.cos(0.35*Math.PI)) - J.H;   // lip -> sweet spot: distance, height change (before terrain fall)
      const tw = c/D - s + g*D/(2*v*v); rel = Math.max(0.18, Math.min(1.1, tw + s));
      const desc = g*D/(v*v) - tw - s;                                  // arc's descent slope relative to the terrain at the sweet spot
      L3 = Math.max(26, Math.min(60, J.HL*Math.PI*Math.sin(0.35*Math.PI)/(2*Math.max(0.15, desc)))); }
    const L1 = 1.6*J.H/rel;   // lip slope relative to the terrain -> ramp length
    const [x, z] = tr.pts[i], yaw = tr.yaw[i+2], f = addFeature('gap', x, z, yaw, 3.2, megaP(J.H, L1, J.gap, J.HL, L3), tr.id);
    f.k = k; f.mega = true; f.lipRel = rel; f.finale = !!J.finale; MEGA.push({k, H:J.H, gap:J.gap, HL:J.HL, L1:+L1.toFixed(1), lipDeg:+(Math.atan(rel)*180/Math.PI).toFixed(1), vLip:+(v*3.6).toFixed(0), x, z});
    k++; i += Math.round((f.L + 24)/2); } }
// ---------- BONE CRUSHER hand-placed features ----------
const ledgeP = (H, run, deck) => ({L: run + deck, p: t => t < 0 ? 0 : t <= run ? H*smooth(0, run, t) : t <= run + deck ? H : 0});   // rock ledge: a built-up shelf that ends in a sheer face
for (const tr of trails){ if (!tr.pro) continue; const wi = tr._wi || TRAIL_DEFS[tr.id]._wi, n = tr.pts.length;
  for (const pf of tr.pfeat){ const i = Math.max(2, Math.min(n - 10, wi[pf.at] + Math.round((pf.off || 0)/2))), [x, z] = tr.pts[i], yaw = tr.yaw[Math.min(n-1, i+2)];
    let f;
    if (pf.kind === 'ledge'){ f = addFeature('rockdrop', x, z, yaw, 2.6, {...ledgeP(pf.H, 2.5*pf.H, 3), rock:true}, tr.id); f.ledge = pf.H; }
    else if (pf.kind === 'crashrocks'){ f = addFeature('rocks', x, z, yaw, 2.8, {...PROF.rocks(0.3, pf.L, 6), rock:true}, tr.id); f.crash = true; }
    else if (pf.kind === 'stepdown') f = addFeature('stepdown', x, z, yaw, 2.6, PROF.stepdown(2.4, 6, 5, 1.2, 10), tr.id);
    else if (pf.kind === 'cliff'){ f = addFeature('drop', x, z, yaw, 3.2, bigDropP(pf.H), tr.id); f.cliff = true; f.stratos = true; }
    else if (pf.kind === 'camber'){   // off-camber: the uphill edge of the bench is left high, so the tread leans out over the drop
      const nx = Math.cos(yaw), nz = -Math.sin(yaw), side = base(x + nx*8, z + nz*8) > base(x - nx*8, z - nz*8) ? 1 : -1, hw = 3.4, L = pf.L, c = 0.13;
      f = addFeature('roller', x, z, yaw, hw, {L, p: (t, us) => t < 0 || t > L ? 0 : c*Math.max(0, hw + side*us)*Math.min(1, t/6, (L - t)/6)}, tr.id); f.camber = true; }
    f.k = pf.at; f.pro = pf.kind; } }
// berms on the outside of corners
for (const tr of trails){ if (!['flow','flowg','dh','enduro','jumps','pump','xc'].includes(tr.kind)) continue;
  const n = tr.pts.length; let i = 30;
  while (i < n-20){ const dy = Math.atan2(Math.sin(tr.yaw[i+8]-tr.yaw[i]), Math.cos(tr.yaw[i+8]-tr.yaw[i]));
    if (Math.abs(dy) > 0.35){ const side = dy > 0 ? -1 : 1, [x,z] = tr.pts[i];
      if (!features.some(f => Math.hypot(f.x-x, f.z-z) < 30)){ addFeature('berm', x, z, tr.yaw[i+4], 5.5, PROF.berm(1.3, 16, side, 5.5), tr.id); i += 14; continue; } }
    i += 2; } }
// dirt-jump park lines (across the pad, downhill along PARK.dir)
if (!RAMP) { const d = PARK.dir, yaw = Math.atan2(-d[0], -d[1]), sx = -d[1], sz = d[0];
  // four lines, each from its own roll-in mound (height sets the speed: no pedalling needed), plus a pump-track loop
  const spine = (H, L) => ({L, p: t => t>=0 && t<=L ? H*Math.pow(1 - Math.abs(2*t/L - 1), 1.4) : 0});
  const whale = (H, L1, L3) => ({L:L1+L3, p: t => t<0 ? 0 : t<=L1 ? H*Math.pow(t/L1, 2.2) : t<=L1+L3 ? H*Math.pow(1-(t-L1)/L3, 0.8) : 0});
  const lines = [
    {off:-30, name:'Beginner Tables', diff:'green', roll:4.5, items:[k => ['table', PROF.table(0.7, 3.5, 2.5, 3.5)], k => ['kicker', PROF.kicker(0.65, 4), 0.42], k => ['roller', PROF.roller(0.35, 7)], k => ['table', PROF.table(0.8, 3.5, 3, 3.5)], k => ['roller', PROF.roller(0.35, 7)], k => ['table', PROF.table(0.8, 3.5, 3, 3.5)]]},
    {off:-10, name:'Intermediate Doubles', diff:'blue', roll:6, items:[k => ['table', PROF.table(1.55, 5, 8, 6)], k => ['kicker', PROF.kicker(1.15, 4.5), -0.48], k => ['double', PROF.double(1.1, 3.8, 1.6, 4)], k => ['double', PROF.double(1.2, 4, 1.8, 4.5)], k => ['stepdown', PROF.stepdown(1.2, 4, 1.6, 0.8, 4.5)]]},
    {off:12, name:'Pro Big Doubles', diff:'black', roll:8, items:[k => ['table', PROF.table(2.0, 6, 10, 7)], k => ['kicker', PROF.kicker(1.6, 5), 0.5], k => ['double', PROF.double(1.7, 4.5, 2.6, 5)], k => ['double', PROF.double(1.8, 4.6, 2.8, 5.2)], k => ['double', PROF.double(1.9, 4.8, 3.0, 5.4)]]},
    {off:32, name:'Slopestyle Mix', diff:'black', roll:9, items:[k => ['kicker', PROF.kicker(1.3, 5), -0.3], k => ['spine', spine(1.4, 8)], k => ['kicker', whale(1.2, 3.2, 3)], k => ['table', PROF.table(1.3, 4, 4, 4)], k => ['kicker', PROF.kicker(1.3, 5), 0.3], k => ['roller', PROF.roller(0.4, 6)], k => ['roller', PROF.roller(0.4, 6)], k => ['berm', PROF.berm(1.6, 14, 1, 5)]]},
  ];
  PARK.lines = lines;
  // big drop: a wooden deck built straight out from the roll-in hill at 5 m above the pad, a lip,
  // a short knuckle and a long smooth transition landing
  { const off = -48, t0 = -106, LIP = 46, HT = 5.0, RUN = 4.4, KN = 2.5, HK = 3.2, LL = 10;
    const ox = PARK.x + d[0]*t0 + sx*off, oz = PARK.z + d[1]*t0 + sz*off; let pad = null; const cache = new Map();
    const raw = k => { let v = cache.get(k); if (v === undefined){ const u = Math.min(1, k/4/LIP); v = pad + HT + RUN*(1-u) - terrainH(ox + d[0]*k/4, oz + d[1]*k/4); cache.set(k, v); } return v; };
    const deck = t => { if (pad === null) pad = terrainH(PARK.x, PARK.z); const k = Math.floor(t*4), f = t*4 - k; return Math.max(0, raw(k)*(1-f) + raw(k+1)*f); };
    const prof = {L: LIP+KN+LL, wood:true, p: t => t<0 ? 0 : t<=LIP ? deck(t) : t<=LIP+KN ? HK : t<=LIP+KN+LL ? (u => HK*(1 - u*u*(3-2*u)))((t-LIP-KN)/LL) : 0};
    const f = addFeature('drop', ox, oz, yaw, 2.4, prof, -1);
    f.tower = true; f.park = 'Big Drop'; PARK.drop = {x:f.x, z:f.z, dx:f.dx, dz:f.dz, L:prof.L, lip:LIP, h:HT, off, name:'Big Drop'}; }
  const rollin = (H) => ({L: 4 + 3 + 4*H, p: t => t<0 ? 0 : t<=4 ? H*t/4 : t<=7 ? H : t<=7+4*H ? H*0.5*(1+Math.cos(Math.PI*(t-7)/(4*H))) : 0});   // steep back, deck, long smooth roll-in
  // roll-in mound with a pedal-up access ramp at its back (12% grade, straight behind the mound on the line's own axis, away from every line):
  // the ramp climbs from the pad to the 3 m deck, then the long smooth roll-in drops into the line. Riding it backwards is a gentle 12% descent.
  const rollinRamp = (H, ox, oz) => { const G = 0.12, deck = base(ox + d[0]*4, oz + d[1]*4) + H; let B = 0;
    while (B < 160 && deck - G*(B + 4) > base(ox - d[0]*B, oz - d[1]*B)) B += 0.5;
    const R = rollin(H); return {L: B + R.L, ramp: B, p: t => { if (t < 0) return 0; const u = t - B;
      if (u < 4) return Math.max(0, deck - G*(4 - u) - base(ox + d[0]*u, oz + d[1]*u));
      return R.p(u); }}; };
  for (const ln of lines){ let t = -92; const ox = PARK.x + d[0]*t + sx*ln.off, oz = PARK.z + d[1]*t + sz*ln.off, pr = rollinRamp(ln.roll, ox, oz);
    const r = addFeature('roller', ox - d[0]*pr.ramp, oz - d[1]*pr.ramp, yaw, 2.6, pr, -1); r.rollin = true; r.rampLen = pr.ramp; r.park = ln.name; ln.start = t + 5.5; ln.rampFoot = {x: ox - d[0]*pr.ramp, z: oz - d[1]*pr.ramp};
    t += r.L - pr.ramp + 6;
    for (let k = 0; k < ln.items.length && t < 62; k++){ const [kind, p] = ln.items[k](k);
      if (kind === 'berm') continue;   // the linking berms are laid with the packed tread, aimed along the line
      const f = addFeature(kind === 'spine' ? 'table' : kind, PARK.x + d[0]*t + sx*ln.off, PARK.z + d[1]*t + sz*ln.off, yaw, kind === 'berm' ? 5 : 2.4, p, -1); f.park = ln.name; f.hip = 0;
      t += p.L + (kind === 'roller' ? 1 : 9); } }
  // pump-track loop: one continuous packed oval. Rollers and berms rise out of the tread, so the surface never drops back to the flat pad.
  { const cx = PARK.x + sx*56, cz = PARK.z + sz*56, A = 28, B = 10, N = 40;
    const at = a => [cx + d[0]*A*Math.cos(a) + sx*B*Math.sin(a), cz + d[1]*A*Math.cos(a) + sz*B*Math.sin(a)];
    for (let k = 0; k < N; k++){ const a0 = k/N*Math.PI*2, a1 = (k+1)/N*Math.PI*2, mid = (a0+a1)/2;
      const [x, z] = at(a0), [x2, z2] = at(a1), chord = Math.hypot(x2-x, z2-z), yaw = Math.atan2(-(x2-x), -(z2-z));
      const tight = Math.abs(Math.cos(mid)), peak = 0.16 + (1-tight)*0.62, bank = tight > 0.4 ? 0.2 + tight*1.25 : 0.06;
      const fdx = -Math.sin(yaw), fdz = -Math.cos(yaw), side = ((fdz)*((x+x2)/2-cx) + (-fdx)*((z+z2)/2-cz)) >= 0 ? 1 : -1;
      const len = chord + 1.2;
      const f = addFeature('roller', x, z, yaw, 2.55, {L: len, p: (t, us) => { if (t < 0 || t > len) return 0; const u = Math.min(1, Math.max(0, t/chord));
        return 0.14 + peak*Math.sin(Math.PI*u)**2 + bank*Math.max(0, Math.min(1, (side*us + 0.3)/2.3)); }}, -1);
      f.park = 'Pump Track'; f.groom = true; f.pump = true; }
    PARK.pump = {x:cx, z:cz, A, B}; } }
// Rock shapes are the collision shapes. Small rocks are ground the wheels climb (a jolt and some speed loss, no launch).
// Big rocks are solid: head-on is a crash, a glance pushes you off. Rock Garden is packed low angular slabs
// across almost the whole tread, with the tall rocks kept off the riding line. Other gardens stay rounded.
export const BOULDERS = [];
const smallDome = (b, d) => d >= b.r ? 0 : b.h*0.5*(1 + Math.cos(Math.PI*d/b.r));
const bigDome = (b, d) => d >= b.r ? 0 : b.h*Math.sqrt(1 - (d/b.r)**4);
export const boulderH = (b, d) => b.big ? bigDome(b, d) : smallDome(b, d);
// Height of a boulder at a world point. Angular rocks are square pyramids (the mesh is the same pyramid).
export function rockTop(b, x, z){
  const dx = x - b.x, dz = z - b.z;
  if (b.ang){ const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), lx = dx*c + dz*s, lz = -dx*s + dz*c;
    const m = Math.max(Math.abs(lx), Math.abs(lz)) / b.r; return m >= 1 ? 0 : b.h * (1 - m); }
  const d = Math.hypot(dx, dz); return d >= b.r ? 0 : (b.big ? bigDome(b, d) : smallDome(b, d));
}
// If (x,z) is inside a big rock, the push-out point and the horizontal normal. Null when clear.
export function rockContact(b, x, z){
  const dx = x - b.x, dz = z - b.z;
  if (!b.ang){ const d = Math.hypot(dx, dz), R = b.r*0.95 + 0.12; if (d >= R) return null;
    const nx = dx/(d || 1), nz = dz/(d || 1); return { nx, nz, x: b.x + nx*R, z: b.z + nz*R }; }
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  let lx = dx*c + dz*s, lz = -dx*s + dz*c;
  if (Math.max(Math.abs(lx), Math.abs(lz)) >= b.r) return null;
  const xFace = Math.abs(lx) >= Math.abs(lz), sign = Math.sign((xFace ? lx : lz) || 1), R = b.r;
  if (xFace) lx = sign * R; else lz = sign * R;
  const nx = xFace ? sign*c : -sign*s, nz = xFace ? sign*s : sign*c;
  return { nx, nz, x: b.x + (lx*c - lz*s), z: b.z + (lx*s + lz*c) };
}
function fillGarden(f){
  const rnd = mulberry(Math.round(f.x*31 + f.z*17) + 11); f.p = () => 0; f.boulders = [];
  const at = (t, us) => [f.x + f.dx*t + f.dz*us, f.z + f.dz*t - f.dx*us];
  const stepT = 0.8, stepU = 0.8;
  for (let t = 0.4; t < f.L - 0.4; t += stepT) for (let us = -f.hw + 0.3; us <= f.hw - 0.3; us += stepU){
    if (rnd() < 0.02 && Math.abs(us) > 0.55) continue;
    const tt = t + (rnd() - 0.5) * 0.16, uu = Math.abs(us) < stepU * 0.5 ? (rnd() - 0.5) * 0.12 : us + (rnd() - 0.5) * 0.16;
    const edge = Math.min(1, Math.abs(uu) / f.hw);
    const h = Math.abs(uu) < 1.35 ? 0.12 + rnd() * 0.08 : 0.18 + rnd() * 0.1 + edge * 0.06;
    const r = Math.abs(uu) < 1.35 ? 0.85 + rnd() * 0.16 : 0.7 + rnd() * 0.16;
    const [x, z] = at(tt, uu);
    f.boulders.push({ x, z, t: tt, us: uu, h, r, big: false, ang: true, rot: rnd() * 6.28, f });
  }
  for (let k = 0, side = rnd() < 0.5 ? -1 : 1, NB = 5; k < NB; k++, side = -side){
    const h = 0.55 + rnd() * 0.35, r = 0.5 + rnd() * 0.22;
    const t = (k + 0.5) / NB * f.L, us = side * (f.hw + 3.6);
    const [x, z] = at(t, us);
    f.boulders.push({ x, z, t, us, h, r, big: true, ang: true, rot: rnd() * 1.57, f });
  }
  BOULDERS.push(...f.boulders);
}
for (const f of features){ if (!f.rock || f.kind !== 'rocks') continue;
  if (f.garden){ fillGarden(f); continue; }
  const rnd = mulberry(Math.round(f.x*31 + f.z*17) + 7); f.p = () => 0; f.boulders = [];
  const garden = false;
  const at = (t, us) => [f.x + f.dx*t + f.dz*us, f.z + f.dz*t - f.dx*us];
  const nS = Math.round(f.L * (garden ? 2.8 : 1.4)), gapK = garden ? 0.48 : 0.75;
  for (let i = 0; i < nS*4 && f.boulders.length < nS; i++){
    const h = garden ? 0.16 + rnd()*0.5 : 0.12 + rnd()*0.33, r = garden ? 0.52 + rnd()*0.42 : h*2.4 + 0.25;
    const t = 0.4 + rnd()*(f.L - 0.8), us = (rnd()*2 - 1) * (f.hw - (garden ? 0.05 : 0.2));
    if (garden && Math.abs(us) < f.hw*0.2 && rnd() < 0.62) continue;   // dirt pockets in the tread
    if (f.boulders.some(b => Math.hypot(b.t - t, b.us - us) < (b.r + r)*gapK)) continue;
    const [x, z] = at(t, us); f.boulders.push({x, z, t, us, h, r, big:false, ang:garden, rot:rnd()*6.28, f}); }
  for (let k = 0, side = rnd() < 0.5 ? -1 : 1, NB = f.crash ? 6 : garden ? 4 : 3; k < NB; k++, side = -side){
    const h = f.crash ? 1.1 + rnd()*0.7 : garden ? 0.7 + rnd()*0.55 : 0.65 + rnd()*0.4, r = f.crash ? 0.8 + rnd()*0.4 : garden ? 0.62 + rnd()*0.28 : 0.55 + rnd()*0.35;
    const t = (k + 0.5)/NB*f.L + (rnd() - 0.5)*1.5, us = side*(garden ? 0.85 + r*0.35 : 1.0 + r + rnd()*0.6);
    const [x, z] = at(t, us); f.boulders = f.boulders.filter(b => Math.hypot(b.t - t, b.us - us) > r + b.r*0.55);
    f.boulders.push({x, z, t, us, h, r, big:true, ang:garden, rot:rnd()*1.57, f}); }
  f.hw += 1.0; BOULDERS.push(...f.boulders); }
features.forEach(f => { if (f.wood === undefined) f.wood = false; });
export const DIFF = {green:{icon:'●', label:'Green', color:'#2fae4a'}, blue:{icon:'■', label:'Blue', color:'#2f6fff'}, black:{icon:'◆', label:'Black', color:'#111'}, dblack:{icon:'◆◆', label:'Double black', color:'#111'}, pro3:{icon:'◆◆◆', label:'PRO · Triple black', color:'#ff5a1f'}, pro:{icon:'PRO', label:'Pro line', color:'#ff7a00'}};
PARK.type = 'Dirt jump'; PARK.diff = 'pro';

// ---------- spatial grids ----------
const CELL = 25;
const key = (i,j) => i*8192 + j;
const segGrid = new Map(), featGrid = new Map();
const put = (g, minx, maxx, minz, maxz, v) => { for (let i=Math.floor(minx/CELL); i<=Math.floor(maxx/CELL); i++) for (let j=Math.floor(minz/CELL); j<=Math.floor(maxz/CELL); j++){ const k = key(i,j); let a = g.get(k); if (!a) g.set(k, a = []); a.push(v); } };
for (const tr of trails) for (let i=0;i<tr.pts.length-1;i++){ const a = tr.pts[i], b = tr.pts[i+1];
  put(segGrid, Math.min(a[0],b[0])-BLEND, Math.max(a[0],b[0])+BLEND, Math.min(a[1],b[1])-BLEND, Math.max(a[1],b[1])+BLEND, tr.id*100000 + i); }
// Landings: a 30° downslope covering where a rider at slow, typical and fast speed touches down.
// Tables keep their deck. Mega lips are already solved. Canyons stay open.
function featRetarget(f){
  f.minx = Math.min(f.x, f.x + f.dx*f.L) - f.hw - 2; f.maxx = Math.max(f.x, f.x + f.dx*f.L) + f.hw + 2;
  f.minz = Math.min(f.z, f.z + f.dz*f.L) - f.hw - 2; f.maxz = Math.max(f.z, f.z + f.dz*f.L) + f.hw + 2;
}
const LAND_KIND = new Set(['kicker','table','double','gap','stepup','stepdown','drop','rockdrop']);
const _near = [];
export const landingFixes = [];
export function parkLayoutTag(){
  let h = 2166136261;
  for (const f of features){ if (!(f.park || f.groom)) continue;
    const s = `${f.park}|${f.kind}|${Math.round(f.x)}|${Math.round(f.z)}|${Math.round((f.L || 0) * 10)}|${f.groom ? 1 : 0}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); }
  return (h >>> 0).toString(36).slice(0, 6);
}
export function layoutTag(trailId){
  let h = 2166136261;
  for (const f of features){ if (f.trail !== trailId) continue;
    const s = `${f.kind}|${Math.round(f.x)}|${Math.round(f.z)}|${Math.round((f.L||0)*10)}|${f.hip?1:0}|${f.landed?1:0}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); }
  return (h >>> 0).toString(36).slice(0, 6);
}
function approachMs(f){
  const tr = trails[f.trail];
  const km = tr && (JUMP_SPEEDS[tr.name] || [])[f.k];
  if (km) return Math.max(6, Math.min(16, km/3.6));
  if (f.mega) return 16;
  return {green:8, blue:11, black:13, dblack:15, pro3:15}[tr && tr.diff] || (f.park ? 11 : 10);
}
for (const f of features){
  if (f.mega || f.canyon || f.boulders || f.rollin || f.handLand || !LAND_KIND.has(f.kind)) continue;
  const old = f.p, oldL = f.L, v = approachMs(f);
  let lipT = 0, lipH = -1;
  for (let i = 1; i <= 36; i++){ const t = oldL*i/36*0.8, h = old(t, 0); if (h >= lipH){ lipH = h; lipT = t; } }
  if (lipH < 0.7) continue;
  const face = Math.max(0.08, (old(lipT, 0) - old(Math.max(0, lipT - 0.5), 0))/0.5);
  let grade = 0.08; { const tr = trails[f.trail]; if (tr){ let bi = 0, bd = 1e9; for (let i = 0; i < tr.pts.length; i += 3){ const d = (tr.pts[i][0]-f.x)**2 + (tr.pts[i][1]-f.z)**2; if (d < bd){ bd = d; bi = i; } }
    const j = Math.min(tr.pts.length - 1, bi + 10); grade = Math.max(0, (tr.h[bi] - tr.h[j]) / Math.max(4, (j - bi)*2)); } }
  let lo = 1e9, hi = 0;
  for (const spd of [v*0.75, v, Math.min(17, v*1.2)]){
    const vy = face*spd + 0.45;
    let hit = lipT + spd*2.2;
    for (let t = 0.1; t < 3.4; t += 0.02){
      const dist = lipT + spd*t;
      const y = lipH + vy*t - 0.5*9.81*t*t + grade*spd*t;
      const gnd = dist <= oldL ? old(dist, 0) : 0;
      if (y <= gnd + 0.05){ hit = dist; break; }
    }
    lo = Math.min(lo, hit); hi = Math.max(hi, hit);
  }
  let deckEnd = lipT;
  for (let t = lipT; t < oldL; t += 0.35) if (old(t, 0) > lipH*0.72) deckEnd = t;
  const drop = Math.tan(30*Math.PI/180);
  // The ramp starts just before the shortest flight and is still descending at the longest one.
  // A ramp that begins at the lip runs out of height in a couple of metres and the rider cases beyond it.
  const start = Math.max(deckEnd + 0.3, lo - 1.5);
  let end = Math.max(start + 4, hi + 2);
  let h0 = Math.min(2.2, Math.max(1.1, drop * Math.min(8, end - start)));
  end = Math.min(end, start + h0 / drop + 0.5);
  if (end <= start + 1) continue;
  f.p = (t, us) => {
    const base = t <= oldL ? old(Math.min(Math.max(t, 0), oldL), us) : 0;
    if (t <= deckEnd || t > end) return base;
    // Ride up onto the landing over a few metres. A step would be a wall and the head would hit it.
    if (t < start){ const u = Math.max(0, (t - (start - h0/0.55)) / (h0/0.55)); return Math.max(base, h0 * Math.min(1, u)); }
    const ramp = Math.max(0, h0 - drop * (t - start));
    return Math.max(base, ramp);
  };
  f.L = Math.max(oldL, end);
  f.landed = true;
  featRetarget(f);
  landingFixes.push(f);
}
// Hips and long landings were aimed off the tread. Point every trail jump down the trail and cut it where the centreline leaves the corridor.
function seatJumps(){
  const angLim = 10 * Math.PI / 180, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  for (const f of features){
    if (!(f.trail >= 0) || f.mega || !LAND_KIND.has(f.kind)) continue;
    const tr = trails[f.trail]; if (!tr) continue;
    const near = (x, z) => { let bi = 0, bd = 1e9; for (let i = 0; i < tr.pts.length; i++){ const d = (tr.pts[i][0] - x) ** 2 + (tr.pts[i][1] - z) ** 2; if (d < bd){ bd = d; bi = i; } } return { d: Math.sqrt(bd), yaw: tr.yaw[bi] }; };
    const o = near(f.x, f.z);
    f.yaw = o.yaw; f.dx = -Math.sin(o.yaw); f.dz = -Math.cos(o.yaw); f.hip = 0;
    let keep = 0;
    for (let t = 0; t <= f.L + 1e-6; t += 0.5){
      const n = near(f.x + f.dx * t, f.z + f.dz * t);
      if (n.d > W + 0.15 || Math.abs(wrap(Math.atan2(-f.dx, -f.dz) - n.yaw)) > angLim * 0.92) break;
      keep = t;
    }
    if (keep >= 3 && keep < f.L - 0.25){
      // Cut at a bend, the ramp would stop mid-face as a cliff, and that edge rode like a lip.
      // Ease the last couple of metres back down to the tread instead. If the cut took the real lip
      // with it (the first crest is in the eased part or beyond), what is left is not a lip at all.
      const old = f.p, cut = keep, fade = Math.min(3.2, Math.max(1.6, cut * 0.5));
      let peak = 0, peakT = 0;
      for (let i = 1; i <= 28; i++){ const t = f.L * i / 28, h = old(t, 0);
        if (h + 0.02 >= peak){ if (h > peak){ peak = h; peakT = t; } } else if (peak > 0.12 && t > peakT + 0.5) break; }
      if (peakT > cut - fade) f.cut = true;
      f.p = (t, us) => {
        if (t < 0 || t > cut) return 0;
        const h = old(t, us);
        if (t <= cut - fade) return h;
        const u = (t - (cut - fade)) / fade;
        return h * (1 - u * u * (3 - 2 * u));
      };
      f.L = cut;
    }
    featRetarget(f);
  }
}
seatJumps();
// Packed tread through the dirt-jump lines and the paths that join them. Heights are a max, so the ribbon shows in the gaps and the jumps stay on top of it.
function groomPark(){
  if (RAMP || !PARK.lines) return;
  const d = PARK.dir, sx = -d[1], sz = d[0];
  const along = (x, z) => (x - PARK.x) * d[0] + (z - PARK.z) * d[1];
  const latOf = (x, z) => (x - PARK.x) * -d[1] + (z - PARK.z) * d[0];
  const XZ = (t, lat) => [PARK.x + d[0] * t + sx * lat, PARK.z + d[1] * t + sz * lat];
  const addGroom = (x, z, yaw, len, hw, name, bank) => {
    const f = addFeature('roller', x, z, yaw, hw, { L: len, p: (t, us) => {
      if (t < 0 || t > len) return 0;
      const ae = Math.abs(us), lip = ae <= hw * 0.52 ? 0 : Math.min(1, (ae - hw * 0.52) / (hw * 0.48));
      let h = 0.08 + 0.36 * lip * lip;
      if (bank) h += bank.h * Math.max(0, Math.min(1, (bank.side * us + hw * 0.15) / hw));
      return h;
    } }, -1);
    f.groom = true; f.park = name; f.tread = true; return f;
  };
  const lay = (pts, hw, name) => { for (let i = 0; i < pts.length - 1; i++){ const [x, z] = pts[i], [x2, z2] = pts[i + 1], len = Math.hypot(x2 - x, z2 - z); if (len < 0.35) continue;
    addGroom(x, z, Math.atan2(-(x2 - x), -(z2 - z)), len + (i < pts.length - 2 ? 1.7 : 0.4), hw, name); } };
  const samples = (t0, t1, lat, step) => { const pts = []; const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / step)), dir = t1 >= t0 ? 1 : -1;
    for (let i = 0; i <= n; i++) pts.push(XZ(t0 + dir * Math.abs(t1 - t0) * i / n, lat)); return pts; };
  const groups = new Map();
  for (const f of features){ if (!f.park || f.groom || f.pump) continue; let g = groups.get(f.park); if (!g) groups.set(f.park, g = []); g.push(f); }
  const lines = [];
  for (const [name, fs] of groups){
    const lat = fs.reduce((s, f) => s + latOf(f.x, f.z), 0) / fs.length;
    let t0 = 1e9, t1 = -1e9;
    for (const f of fs){ t0 = Math.min(t0, along(f.x, f.z)); t1 = Math.max(t1, along(f.x + f.dx * f.L, f.z + f.dz * f.L)); }
    lines.push({ name, lat, t0, t1, wood: fs.every(f => f.wood) });
  }
  lines.sort((a, b) => a.lat - b.lat);
  const dirt = lines.filter(l => l.name !== 'Big Drop');
  for (const ln of lines){
    if (ln.wood){ lay(samples(ln.t0 - 16, ln.t0 + 2, ln.lat, 6), 2.3, ln.name); continue; }
    lay(samples(ln.t0 - 4, ln.t1 + 12, ln.lat, 7), 3.15, ln.name);
  }
  // A half-turn. bulge +1 swings downhill, -1 swings uphill, so the berms don't cut back through the jumps.
  const turn = (t, lat0, lat1, bulge) => { const R = Math.abs(lat1 - lat0) / 2, n = 7, pts = [];
    for (let i = 0; i <= n; i++){ const u = i / n; pts.push(XZ(t + bulge * R * Math.sin(Math.PI * u), lat0 + (lat1 - lat0) * u)); }
    return pts; };
  for (let i = 0; i < dirt.length - 1; i++){
    const a = dirt[i], b = dirt[i + 1], mid = (a.lat + b.lat) / 2;
    lay(turn(a.t1 + 12, a.lat, mid, 1), 2.3, a.name);
    lay(samples(a.t1 + 12, b.t0, mid, 8), 2.2, 'Park link');
    lay(turn(b.t0, mid, b.lat, -1), 2.3, b.name);
  }
  if (dirt.length){
    const first = dirt[0], last = dirt[dirt.length - 1], north = last.lat + 12;
    const barT = Math.min(...dirt.map(l => l.t0)) - 6;
    lay(turn(last.t1 + 12, last.lat, north, 1), 2.2, last.name);
    lay(samples(last.t1 + 12, barT, north, 8), 2.1, 'Park return');
    const lats = [first.lat, ...dirt.map(l => l.lat), north];
    lay([...new Set(lats)].sort((p, q) => p - q).map(lat => XZ(barT, lat)), 2.2, 'Park access');
    if (PARK.pump){ const plat = latOf(PARK.pump.x, PARK.pump.z) - (PARK.pump.B || 10);
      lay([XZ(-6, last.lat + 4), XZ(-6, plat), XZ(8, plat)], 2.2, 'Pump Track'); }
  }
}
groomPark();
for (const f of features) put(featGrid, f.minx, f.maxx, f.minz, f.maxz, f);

// nearest point on each trail within reach: returns [{t, s, d, h}] (t = trail id, s = distance along, d = lateral distance, h = path height)
export function nearTrails(x, z){
  _near.length = 0;
  const segs = segGrid.get(key(Math.floor(x/CELL), Math.floor(z/CELL))); if (!segs) return _near;
  for (const code of segs){ const t = (code/100000)|0, i = code - t*100000, tr = trails[t], a = tr.pts[i], b = tr.pts[i+1];
    const ex = b[0]-a[0], ez = b[1]-a[1], L2 = ex*ex+ez*ez; let u = ((x-a[0])*ex + (z-a[1])*ez)/L2; u = u<0?0:u>1?1:u;
    const px = a[0]+ex*u, pz = a[1]+ez*u, d = Math.hypot(x-px, z-pz);
    const s = (i+u)*2; let e = null; for (const n of _near) if (n.t === t && Math.abs(n.s - s) < 40){ e = n; break; }   // hairpins: each leg blends separately
    if (!e) _near.push({t, s, d, h:tr.h[i]+(tr.h[i+1]-tr.h[i])*u, i});
    else if (d < e.d){ e.s = s; e.d = d; e.h = tr.h[i]+(tr.h[i+1]-tr.h[i])*u; e.i = i; }
  }
  // smooth path height: Gaussian-weighted average of the nearby trail samples (C1-smooth, no kinks at polyline corners)
  for (const n of _near){ if (n.d > BLEND) continue; const tr = trails[n.t], pts = tr.pts; let ws = 0, hs = 0;
    for (let j=Math.max(0,n.i-7); j<=Math.min(pts.length-1,n.i+8); j++){ const dx = pts[j][0]-x, dz = pts[j][1]-z, w = Math.exp(-(dx*dx+dz*dz)*0.08); ws += w; hs += w*tr.h[j]; }
    if (ws > 1e-9) n.h = hs/ws; }
  return _near;
}
export function trailDist(x,z){ let m = 1e9; for (const n of nearTrails(x,z)) m = Math.min(m, n.d); return m; }
export function inPark(x,z){ return Math.hypot(x-PARK.x, z-PARK.z) <= PARK.r+6; }
export function isDirt(x,z){ return editorDirt(x, z) || trailDist(x,z) <= W+0.3 || inPark(x,z) || Math.hypot(x-PARK.x, z-PARK.z) <= PARK.r+35 || featH(x,z) > 0.05 || connDist(x,z) <= CW; }   // wooden decks and connector paths ride like trail

// Level pads under the shop and the lift stations. Filled after those spots are chosen, from the raw hillside.
function padWeight(dx, dz, p){
  const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
  const ox = lx < p.x0 ? p.x0 - lx : lx > p.x1 ? lx - p.x1 : 0;
  const oz = lz < p.z0 ? p.z0 - lz : lz > p.z1 ? lz - p.z1 : 0;
  const outside = Math.hypot(ox, oz);
  if (outside >= p.blend) return 0;
  if (outside <= 0) return 1;
  return 1 - smooth(0, p.blend, outside);
}
function addPad(x, z, yaw, x0, x1, z0, z1, blend){
  const reach = Math.hypot(Math.max(Math.abs(x0), Math.abs(x1)), Math.max(Math.abs(z0), Math.abs(z1))) + blend;
  PADS.push({ x, z, yaw, x0, x1, z0, z1, blend, h: terrainRaw(x, z).h, r2: reach * reach, c: Math.cos(yaw), s: Math.sin(yaw) });
}
// World point of a building-local offset. yaw is the three.js Y rotation (local -Z is the door / downhill of a lift).
export function localXZ(x, z, yaw, lx, lz){
  return [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
}
function terrainRaw(x, z){
  const b = base(x,z); let ws = 0, hs = 0, wmax = 0, dmin = 1e9;
  for (const n of nearTrails(x,z)){ const w = 1 - smooth(W+0.6, BLEND, n.d); if (w > 0){ const k = w**8; ws += k; hs += k*n.h; if (w > wmax) wmax = w; } if (n.d < dmin) dmin = n.d; }
  // the closest trail dominates (sharp weights), so a neighbouring trail's bench never tilts the one you're riding
  let h = ws > 0 ? b + wmax*(hs/ws - b) : b;
  if (CANYONS.length) h += canyonCut(x, z);
  const rough = Math.min(1, Math.max(0, (dmin-W)/4)) * (1 - parkMask(x,z));
  if (rough > 0) h += rough*(0.22*Math.sin(x*0.13)*Math.sin(z*0.11) + 0.06*Math.sin(x*0.37+z*0.29));
  return { h, dmin };
}
// terrain without features: hillside with benched trails cut in, plus a flat pad under each building
export function terrainH(x, z){
  if (editorOn && editorPad(x, z)) return EDITOR_BASE + sculptAt(x, z);
  const raw = terrainRaw(x, z);
  if (!PADS.length) return raw.h;
  let acc = 0, wsum = 0, solid = 0;
  for (let i = 0; i < PADS.length; i++){
    const p = PADS[i], dx = x - p.x, dz = z - p.z;
    if (dx * dx + dz * dz > p.r2) continue;
    const w = padWeight(dx, dz, p);
    if (w <= 0) continue;
    if (w >= 1) solid = p.h;
    acc += w * p.h; wsum += w;
  }
  // The flat footprint always wins, including a start deck that sits on a trail. The blend stays off the tread.
  if (solid) return solid;
  if (wsum <= 0 || raw.dmin < W + 2) return raw.h;
  const w = wsum < 1 ? wsum : 1;
  return raw.h * (1 - w) + (acc / wsum) * w;
}
function featHq(x, z, withRocks){
  const fs = featGrid.get(key(Math.floor(x/CELL), Math.floor(z/CELL))) || []; let h = 0;
  for (const f of fs){ if (x<f.minx||x>f.maxx||z<f.minz||z>f.maxz) continue;
    const rx = x-f.x, rz = z-f.z, t = rx*f.dx + rz*f.dz, us = rx*f.dz - rz*f.dx, u = Math.abs(us);
    if (t < 0 || t > f.L || u > f.hw + (f.wood ? 0 : 1.2)) continue;
    if (f.boulders){ if (!withRocks) continue; for (const b of f.boulders){ if (b.big) continue; const v = rockTop(b, x, z); if (v > h) h = v; } continue; }
    let v = f.p(t, us); if (!f.wood && u > f.hw) v *= 0.5*(1+Math.cos(Math.PI*(u-f.hw)/1.2));   // dirt jumps have rounded sides
    if (v > h) h = v; }
  if (editorOn) h = Math.max(h, editorHeight(x, z));
  return h;
}
export const featH = (x, z) => featHq(x, z, true), featBase = (x, z) => featHq(x, z, false);
// big boulder near (x,z) within reach, for collisions
export function bigBouldersNear(x, z){ const fs = featGrid.get(key(Math.floor(x/CELL), Math.floor(z/CELL))); const out = []; if (!fs) return out;
  for (const f of fs){ if (!f.boulders || x<f.minx||x>f.maxx||z<f.minz||z>f.maxz) continue; for (const b of f.boulders) if (b.big && (x-b.x)**2 + (z-b.z)**2 < (b.r+1.5)**2) out.push(b); } return out; }
// forward axis of the feature that dominates the surface at (x,z), or null (used so only ramp faces launch)
export function featAxis(x, z){
  const fs = featGrid.get(key(Math.floor(x/CELL), Math.floor(z/CELL))); if (!fs) return null; let h = 0, best = null;
  for (const f of fs){ if (x<f.minx||x>f.maxx||z<f.minz||z>f.maxz) continue;
    const rx = x-f.x, rz = z-f.z, t = rx*f.dx + rz*f.dz, us = rx*f.dz - rz*f.dx, u = Math.abs(us);
    if (t < 0 || t > f.L || u > f.hw + (f.wood ? 0 : 1.2) || f.boulders) continue;
    let v = f.p(t, us); if (!f.wood && u > f.hw) v *= 0.5*(1+Math.cos(Math.PI*(u-f.hw)/1.2));
    if (v > h){ h = v; best = f; } }
  return best;
}
export const groundH = (x,z) => terrainH(x,z) + featH(x,z);

// ---------- trees (deterministic per 100 m cell, cached) ----------
export const TCELL = 100;
const treeCache = new Map();
function treeBlocked(x, z){
  // Off the tread, and at least 2.5 m from a trail centre, a landing, a path, a lift, a gate, the shop or a spawn.
  if (trailDist(x, z) < Math.max(2.5, W + 2.5)) return true;
  if (featH(x, z) > 0.02 || featClear(x, z) < 2.5) return true;
  if (connDist(x, z) < CW + 2.2) return true;
  if (nearLiftStation(x, z, 16) || liftLineDist(x, z) < 8) return true;
  if (Math.hypot(x - SHOP.x, z - SHOP.z) < 26 || Math.hypot(x + 150, z - 380) < 18) return true;
  if (inPark(x, z) || Math.hypot(x - PARK.x, z - PARK.z) < PARK.r + 18) return true;
  for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 14) return true;
  return false;
}
export function treesInCell(ci, cj){
  const k = key(ci, cj); let a = treeCache.get(k); if (a) return a; a = [];
  const r = mulberry(ci*7919 + cj*104729 + 17);
  const x0 = ci*TCELL, z0 = cj*TCELL;
  if (!RAMP){
    for (let n=0;n<130;n++){
      const x = (ci + r())*TCELL, z = (cj + r())*TCELL, hgt = 8 + r()*14, rot = r()*6, hue = r();
      const forest = noise(x/220+40, z/220-12) + 0.45 + (Math.max(Math.abs(x), Math.abs(z)) > CORE-90 ? 0.25 : 0);
      if (r() > forest*1.35) continue;
      const b = base(x,z); if (b > PEAK.h*0.75 + 40) continue;
      if (treeBlocked(x, z)) continue;
      a.push({x, z, y:terrainH(x,z)-0.2, h:hgt, rot, hue, near: r() < 0.55});
    }
  }
  // A corridor of trunks just outside the riding line, in both worlds. Desert lines are shorter scrub-trees.
  for (const tr of trails){
    for (let i = 4; i < tr.pts.length; i += 7){
      const [x, z] = tr.pts[i];
      if (x < x0 - 14 || x > x0 + TCELL + 14 || z < z0 - 14 || z > z0 + TCELL + 14) continue;
      const yaw = tr.yaw[i], nx = Math.cos(yaw), nz = -Math.sin(yaw);
      for (const side of [-1, 1]){
        const d = 7.4 + ((i + side) % 3) * 1.5;
        const tx = x + nx*side*d, tz = z + nz*side*d;
        if (tx < x0 || tx >= x0 + TCELL || tz < z0 || tz >= z0 + TCELL) continue;
        if (treeBlocked(tx, tz)) continue;
        if (a.some(t => (t.x-tx)**2 + (t.z-tz)**2 < 20)) continue;
        const hgt = RAMP ? 4.5 + (i%5) : 10 + (i%8);
        a.push({x:tx, z:tz, y:terrainH(tx,tz)-0.2, h:hgt, rot:(i%6)*0.4, hue:(i%7)/7, near:true});
      }
    }
  }
  treeCache.set(k, a); return a;
}
const _nt = [];
export function nearTrees(x, z){
  _nt.length = 0; const ci = Math.floor(x/TCELL), cj = Math.floor(z/TCELL);
  for (let i=ci-1;i<=ci+1;i++) for (let j=cj-1;j<=cj+1;j++) for (const t of treesInCell(i,j)) if (Math.abs(t.x-x) < 3 && Math.abs(t.z-z) < 3) _nt.push(t);
  return _nt;
}

// ---------- teleport spots ----------
// checkpoints: gates every ~170-250 m along each trail (nudged off jumps), used as respawn points during a run
for (const tr of trails){ const cnt = Math.max(0, Math.ceil(tr.len/250) - 1); tr.cps = [];
  for (let k=1; k<=cnt; k++){ let i = Math.round(tr.len*k/(cnt+1)/2);
    for (let tries=0; tries<15 && i < tr.pts.length-10; tries++, i+=2){ let clear = true; for (let d=-6; d<=6; d+=1.5){ const j = Math.max(0, Math.min(tr.pts.length-1, i + Math.round(d/2))); if (featH(tr.pts[j][0], tr.pts[j][1]) > 0.02) { clear = false; break; } } if (clear) break; }
    tr.cps.push({s:i*2, x:tr.pts[i][0], z:tr.pts[i][1], yaw:tr.yaw[i]}); } }
const tStart = (tr, s=12) => { const i = Math.round(s/2); return {x:tr.pts[i][0], z:tr.pts[i][1], yaw:tr.yaw[i]}; };
const parkYaw = Math.atan2(-PARK.dir[0], -PARK.dir[1]);
export const spots = [
  ...trails.map(tr => ({name: tr.id===0 ? 'Summit · Summit DH' : tr.name, trail:tr.id, ...tStart(tr)})),
  ...(RAMP ? [{name:'Valley Overlook (free roam)', x:-55, z:420, yaw:Math.PI}, {name:'Summit Ridge', x:20, z:-470, yaw:0}] :
  [{name:'Dirt Jump Park', x:PARK.x - PARK.dir[0]*95, z:PARK.z - PARK.dir[1]*95 - 10*PARK.dir[0], yaw:parkYaw},
  {name:'Valley Base Plaza (free roam)', x:-150, z:380, yaw:Math.PI}]),
];

// ---------- chairlifts: each serves a cluster of trail starts ----------
export const featClear = (x, z) => { let m = 1e9; for (const f of features){ if (f.trail === -1 && !inPark(x,z) && Math.hypot(x-PARK.x, z-PARK.z) > PARK.r+40) continue;
    const rx = x-f.x, rz = z-f.z, t = Math.max(0, Math.min(f.L, rx*f.dx + rz*f.dz)), u = Math.max(0, Math.abs(rx*f.dz - rz*f.dx) - f.hw); m = Math.min(m, Math.hypot(rx*f.dx + rz*f.dz - t, u)); } return m; };
const SHOP_XZ = RAMP ? [150, 330] : [-185, 400], LIFT_CLEAR = 15;
const flatEnough = (x, z) => { const h0 = terrainH(x,z); let mx = 0; for (const [a,b] of [[-6,-6],[6,-6],[-6,6],[6,6],[0,7],[7,0],[0,-7],[-7,0]]) mx = Math.max(mx, Math.abs(terrainH(x+a,z+b)-h0)); return mx; };
const stationOK = (x, z) => trailDist(x,z) >= LIFT_CLEAR + 5 && featClear(x,z) >= LIFT_CLEAR + 5 && !inPark(x,z) && Math.hypot(x-PARK.x, z-PARK.z) > PARK.r + 20 && Math.hypot(x-SHOP_XZ[0], z-SHOP_XZ[1]) > 30 && Math.max(Math.abs(x), Math.abs(z)) < HALF - 200;
// deterministic search for a flat, clear station spot near a preferred point
function findStation(px, pz, maxR = 160){ let best = null, bs = 1e9; const rnd = mulberry(Math.round(px*7 + pz*13) + 99);
  for (let n = 0; n < 900; n++){ const r = maxR*Math.sqrt(rnd()), a = rnd()*6.283, x = px + Math.cos(a)*r, z = pz + Math.sin(a)*r;
    if (!stationOK(x, z)) continue; const fl = flatEnough(x, z); if (fl > 2.2) continue; const sc = r + fl*25; if (sc < bs){ bs = sc; best = [x, z]; } }
  return best || [px, pz]; }
const LIFT_DEFS = RAMP ? [
  {name:'Summit Shuttle', short:'A', color:'#d9772b', b:BASES.A, t:[330, -440], serves:RAMP_DEFS.map(d => d.name)},
] : [
  {name:'Summit Express', short:'A', color:'#e53935', b:BASES.A, t:[260, -480], serves:['Summit DH','Flow Line','Freeride Ridge']},
  {name:'West Ridge Lift', short:'B', color:'#1e88e5', b:BASES.B, t:[-628, 222], serves:['Forest Singletrack','Meadow Flow']},
  {name:'East Hills Lift', short:'C', color:'#8e24aa', b:BASES.C, t:[712, 412], serves:['Pump Line','Hilltop Jumps']},
  {name:'Boreal Chair', short:'D', color:'#6d4c41', b:[-1080, -980], t:[-470, -1100], serves:['Boreal Enduro','Drop Zone']},
  {name:'East Ridge Chair', short:'E', color:'#00897b', b:BASES.E, t:[880, -790], serves:['Rock Garden','Eastern Traverse']},
  {name:'North Face Chair', short:'F', color:'#7a2cff', b:BASES.F, t:[120, -585], serves:['North Face']},
  {name:'Send Tower Lift', short:'G', color:'#ff1f8f', b:BASES.G, t:[490, 15], serves:['MEGA SEND']},
  {name:'Ridgeback Chair', short:'H', color:'#00acc1', b:BASES.H, t:[930, -1060], serves:['Ridgeback Flow']},
];
// pick the bottom/top pair whose straight line needs the fewest/highest trail crossings; stations clear of trails and jumps
const crossings = (bx, bz, tx, tz) => { const len = Math.hypot(tx-bx, tz-bz); let n = 0, on = false; for (let d = 0; d <= len; d += 3){ const u = d/len, x = bx+(tx-bx)*u, z = bz+(tz-bz)*u, c = trailDist(x,z) < W + 4 || featClear(x,z) < 3; if (c && !on) n++; on = c; } return n; };
export const LIFTS = LIFT_DEFS.map(L => {
  const rb = mulberry(L.short.charCodeAt(0)*31), cand = []; 
  for (let n = 0; n < 14; n++){ const b = findStation(L.b[0] + (rb()-0.5)*120, L.b[1] + (rb()-0.5)*120, 90), t = findStation(L.t[0] + (rb()-0.5)*100, L.t[1] + (rb()-0.5)*100, 80);
    const sc = crossings(b[0], b[1], t[0], t[1])*60 + Math.hypot(b[0]-L.b[0], b[1]-L.b[1]) + 1.5*Math.hypot(t[0]-L.t[0], t[1]-L.t[1]); cand.push({b, t, sc}); }
  cand.sort((a,b) => a.sc - b.sc); const {b:[bx,bz], t:[tx,tz]} = cand[0];
  const len = Math.hypot(tx-bx, tz-bz), dx = (tx-bx)/len, dz = (tz-bz)/len;
  return {...L, bx, bz, tx, tz, len, dx, dz, yaw: Math.atan2(-dx, -dz)}; });

// ---------- connector paths: narrow gravel links between trails, lifts, the park and the shop ----------
// waypoints only; each path is resampled every 2 m and draped on the terrain (no jumps, no bench cut)
const tEnd = name => { const t = trails.find(t => t.name === name), p = t.pts[t.pts.length-1]; return p; };
const tBeg = name => { const t = trails.find(t => t.name === name); return t.pts[0]; };
const L_ = i => [LIFTS[i].bx, LIFTS[i].bz], T_ = i => [LIFTS[i].tx, LIFTS[i].tz];
const valley = RAMP ? [0, 385] : [-150, 380], J = RAMP ? [120, 330] : [-160, 420];   // J: junction on the valley -> Summit Express path where the shop spur branches off
// bike shop: nearest spot to J whose whole yard (r ~ 13 m) stays >= 10 m from every trail, jump, lift line and path waypoint segment
const segD = (x, z, a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1], l2 = dx*dx+dz*dz || 1, u = Math.max(0, Math.min(1, ((x-a[0])*dx + (z-a[1])*dz)/l2)); return Math.hypot(x-a[0]-dx*u, z-a[1]-dz*u); };
const mainLegs = [[valley, J], [J, [LIFTS[0].bx, LIFTS[0].bz]]];
const liftSeg = (x, z) => Math.min(...LIFTS.map(L => segD(x, z, [L.bx, L.bz], [L.tx, L.tz])));
export const SHOP = (() => { let best = null;
  for (let r = 24; r < 90 && !best; r += 3) for (let a = 0; a < 24 && !best; a++){ const t = a/24*Math.PI*2, x = J[0] + r*Math.cos(t), z = J[1] + r*Math.sin(t);
    const c = Math.min(trailDist(x,z), featClear(x,z), liftSeg(x,z), ...mainLegs.map(([p,q]) => segD(x, z, p, q))) - 13;
    if (c >= 10 && Math.hypot(x-LIFTS[0].bx, z-LIFTS[0].bz) > 35) best = {x, z, yaw: Math.atan2(x - J[0], z - J[1])}; }   // door faces the junction
  return best; })();
const shopDoor = [SHOP.x - Math.sin(SHOP.yaw)*12, SHOP.z - Math.cos(SHOP.yaw)*12], parkGate = [PARK.x + 100*Math.cos(2.88), PARK.z + 100*Math.sin(2.88)];
spots.push({name:'Bike Shop', shop:true, x: SHOP.x - Math.sin(SHOP.yaw)*13, z: SHOP.z - Math.cos(SHOP.yaw)*13, yaw: SHOP.yaw + Math.PI});   // on the flat apron in front of the steps, facing the door
// Flat pad under the cabin, porch, yard and the apron. Corners share one height; the rim blends back into the hill.
addPad(SHOP.x, SHOP.z, SHOP.yaw, -12, 12, -18, 11, 8);
for (const L of LIFTS){ addPad(L.bx, L.bz, L.yaw, -6.5, 6.5, -10, 6, 7); addPad(L.tx, L.tz, L.yaw, -6.5, 6.5, -10, 6, 7); }
if (RAMP) for (const tr of trails){ const yaw = tr.yaw[0], [x, z] = tr.pts[0], bx = x + Math.sin(yaw) * 3.2, bz = z + Math.cos(yaw) * 3.2; addPad(bx, bz, yaw, -3.6, 3.6, -3.8, 3.8, 5); }
// waypoints on a ring 105 m from the park centre so paths go around the pad and its jump lines, never through them
const ring = (...degs) => degs.map(a => [PARK.x + 150*Math.cos(a*Math.PI/180), PARK.z + 105*Math.sin(a*Math.PI/180)]);
const CONN_DEFS = RAMP ? [
  [valley, J, L_(0)], [J, shopDoor],
  // Goblin's line hooks round behind its start platform: come in round its west side
  ...RAMP_DEFS.map(d => { const s0 = tBeg(d.name); return d.name === 'Goblin Ridge' ? [T_(0), [250, -485], [45, -485], [45, -430], s0] : [T_(0), [250, -470], [s0[0], -470], s0]; }),
  // every line finishes in the corral; the shuttle pickup is just outside its south-east gate
  ...RAMP_DEFS.map(d => { const e = tEnd(d.name), C = RAMPAGE.corral; return [e, [C.x + (e[0] - C.x)*0.3, C.z + 8], [C.x + C.r*0.7, C.z + C.r*0.75], L_(0)]; }),
] : [
  // base plaza: Summit Express (A), Send Tower (G) and West Ridge (B) bottoms, the shop and the park are all a short roll apart
  [valley, J, L_(0)], [J, shopDoor], [L_(0), [-125, 552], L_(6)], [L_(0), [-250, 435], L_(1)], [L_(1), [PARK.x + 92*Math.cos(-2.1), PARK.z + 92*Math.sin(-2.1)]],
  // lift tops -> trail starts (short), trail finishes -> the lift bottom just below them (short)
  ...TRAIL_DEFS.filter(d => d.base).flatMap(d => { const li = 'ABCDEFGH'.indexOf(d.base), top = LIFT_DEFS.findIndex(L => L.serves.includes(d.name));
    return [[T_(top), tBeg(d.name)], [tEnd(d.name), L_(li)]]; }),
];
// paths arrive at a trail start from straight behind the gate (along the trail direction), never from the side
for (const wp of CONN_DEFS){ const last = wp[wp.length-1], t = trails.find(t => t.pts[0] === last); if (!t) continue;
  const p0 = t.pts[0], p1 = t.pts[Math.min(4, t.pts.length-1)], dl = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]) || 1, ux = (p1[0]-p0[0])/dl, uz = (p1[1]-p0[1])/dl;
  wp.splice(wp.length-1, 0, [p0[0] - ux*22, p0[1] - uz*22], [p0[0] - ux*10, p0[1] - uz*10]); }
export const connectors = CONN_DEFS.map(wp => { const pts = [];
  for (let k = 0; k < wp.length-1; k++){ const [ax,az] = wp[k], [bx,bz] = wp[k+1], n = Math.max(1, Math.ceil(Math.hypot(bx-ax, bz-az)/2));
    for (let i = (k ? 1 : 0); i <= n; i++){ const u = i/n; pts.push([ax + (bx-ax)*u, az + (bz-az)*u]); } }
  // gentle wiggle-free smoothing at the corners
  for (let it = 0; it < 6; it++) for (let i = 1; i < pts.length-1; i++){ pts[i] = [(pts[i-1][0]+2*pts[i][0]+pts[i+1][0])/4, (pts[i-1][1]+2*pts[i][1]+pts[i+1][1])/4]; }
  return {pts, half: 1.3}; });
export const CW = 1.3;   // connector half width
// Unnamed exploration: narrow singletrack and a wider fire road. No gates, no timers.
// They join a trail, a lift, or the shop, and bend off jump corridors.
function exploreLine(wps, half){
  const pts = [];
  for (let k = 0; k < wps.length - 1; k++){
    const [ax, az] = wps[k], [bx, bz] = wps[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let i = k ? 1 : 0; i <= n; i++){
      const u = i / n; let x = ax + (bx - ax) * u, z = az + (bz - az) * u;
      if (featClear(x, z) < 10){ const a = Math.atan2(bz - az, bx - ax) + Math.PI / 2; x += Math.cos(a) * 16; z += Math.sin(a) * 16; }
      pts.push([x, z]);
    }
  }
  for (let it = 0; it < 4; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = [(pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4];
  connectors.push({ pts, half, explore: true });
}
{ const mids = trails.map(t => { const i = Math.floor(t.pts.length * 0.45); return { p: t.pts[i], q: t.pts[Math.floor(t.pts.length * 0.72)] }; });
  mids.forEach((m, i) => {
    let best = null, bd = 1e9;
    for (const L of LIFTS){ const d = Math.hypot(m.p[0] - L.bx, m.p[1] - L.bz); if (d > 80 && d < bd && d < 700){ bd = d; best = [L.bx, L.bz]; } }
    if (best){ const mx = (m.p[0] + best[0]) / 2, mz = (m.p[1] + best[1]) / 2, a = Math.atan2(best[1] - m.p[1], best[0] - m.p[0]) + Math.PI / 2;
      exploreLine([m.p, [mx + Math.cos(a) * 55, mz + Math.sin(a) * 55], best], 1.15); }
    if (i % 2 === 0 && mids[i + 1]){ const o = mids[i + 1].q, mx = (m.q[0] + o[0]) / 2, mz = (m.q[1] + o[1]) / 2;
      if (Math.hypot(m.q[0] - o[0], m.q[1] - o[1]) < 900) exploreLine([m.q, [mx + 70, mz - 40], o], 1.15); }
  });
  const road = RAMP ? [[0, 385], [150, 330], [250, 200], [80, 80], [-40, 200]] : [valley, J, [PARK.x, PARK.z + PARK.r + 40], L_(1), L_(6)];
  exploreLine(road, 3.4);
}
// Side trails, fire roads and connectors stay out of the jump park, the pump track and feature footprints.
// A path that has to meet another path or a named trail does it along that line, not as an X of two ribbons.
export let pathsRerouted = 0;
function pathForbidden(x, z){
  if (!RAMP && Math.hypot(x - PARK.x, z - PARK.z) < PARK.r + 4) return 'park';
  if (PARK.pump){ const dx = x - PARK.pump.x, dz = z - PARK.pump.z, along = dx * PARK.dir[0] + dz * PARK.dir[1], lat = dx * -PARK.dir[1] + dz * PARK.dir[0];
    if ((along / 36) ** 2 + (lat / 18) ** 2 < 1) return 'pump'; }
  for (const f of features){ if (f.kind === 'berm' || f.rollin || f.groom) continue;
    const t = (x - f.x) * f.dx + (z - f.z) * f.dz, u = Math.abs((x - f.x) * f.dz - (z - f.z) * f.dx);
    if (t > 0.5 && t < (f.L || 0) - 0.5 && u < (f.hw || 2) + 1.2) return 'feat'; }
  return '';
}
function pathEntry(x, z){
  if (!PARK.lines) return false;
  for (const ln of PARK.lines){ if (!ln.rampFoot) continue;
    const dx = x - ln.rampFoot.x, dz = z - ln.rampFoot.z, back = -(dx * PARK.dir[0] + dz * PARK.dir[1]), lat = Math.abs(dx * -PARK.dir[1] + dz * PARK.dir[0]);
    if (back > -6 && back < 26 && lat < 7) return true; }
  return false;
}
function pushClear(x, z){
  if (pathEntry(x, z)) return [x, z];
  let px = x, pz = z;
  if (!RAMP && Math.hypot(px - PARK.x, pz - PARK.z) < PARK.r + 6){
    const a = Math.atan2(pz - PARK.z, px - PARK.x);
    px = PARK.x + Math.cos(a) * (PARK.r + 14); pz = PARK.z + Math.sin(a) * (PARK.r + 14);
  }
  for (let it = 0; it < 3 && pathForbidden(px, pz); it++){
    let best = null, bd = 1e9;
    for (const f of features){ if (f.kind === 'berm' || f.rollin || f.groom) continue;
      const t = (px - f.x) * f.dx + (pz - f.z) * f.dz; if (t < -2 || t > (f.L || 0) + 2) continue;
      const lat = (px - f.x) * f.dz - (pz - f.z) * f.dx, d = Math.abs(lat);
      if (d < bd){ bd = d; best = { f, lat }; } }
    if (!best) break;
    const sign = best.lat >= 0 ? 1 : -1, off = (best.f.hw || 2) + 6;
    px += best.f.dz * sign * (off - best.lat * sign); pz -= best.f.dx * sign * (off - best.lat * sign);
  }
  return [px, pz];
}
{ const changed = new Set();
  const mark = (c, i, x, z) => { const p = c.pts[i]; if (Math.hypot(x - p[0], z - p[1]) > 0.4){ c.pts[i] = [x, z]; changed.add(c); } };
  for (const c of connectors){
    const n = c.pts.length;
    for (let i = 0; i < n; i++){
      const p = c.pts[i]; if (pathEntry(p[0], p[1])) continue;
      if (!pathForbidden(p[0], p[1])) continue;
      const q = pushClear(p[0], p[1]); mark(c, i, q[0], q[1]);
    }
    if (changed.has(c)) for (let it = 0; it < 2; it++) for (let i = 2; i < n - 2; i++){
      const a = c.pts[i - 1], b = c.pts[i], e = c.pts[i + 1];
      let x = (a[0] + 2 * b[0] + e[0]) / 4, z = (a[1] + 2 * b[1] + e[1]) / 4;
      if (pathForbidden(x, z) && !pathEntry(x, z)){ const q = pushClear(x, z); x = q[0]; z = q[1]; }
      c.pts[i] = [x, z];
    }
  }
  // A path that cuts another path in the middle steps aside so the ribbons do not pile up at an angle.
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const segCross = (a, b, c0, d0) => {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d0[0] - c0[0], d0[1] - c0[1]];
    const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-6) return null;
    const q = [c0[0] - a[0], c0[1] - a[1]], t = (q[0] * s[1] - q[1] * s[0]) / den, u = (q[0] * r[1] - q[1] * r[0]) / den;
    if (t <= 0.12 || t >= 0.88 || u <= 0.12 || u >= 0.88) return null;
    const acute = Math.min(Math.abs(wrap(Math.atan2(r[1], r[0]) - Math.atan2(s[1], s[0]))), Math.PI);
    const turn = Math.min(acute, Math.PI - acute);
    return turn > 0.45 ? { nx: -s[1], nz: s[0] } : null;
  };
  for (let a = 0; a < connectors.length; a++){
    const A = connectors[a];
    for (let i = 2; i < A.pts.length - 2; i++){
      for (let b = a + 1; b < connectors.length; b++){
        const B = connectors[b];
        for (let j = 2; j < B.pts.length - 2; j++){
          const hit = segCross(A.pts[i - 1], A.pts[i], B.pts[j - 1], B.pts[j]);
          if (!hit) continue;
          const len = Math.hypot(hit.nx, hit.nz) || 1, gap = (A.half || 1.3) + (B.half || 1.3) + 1.6;
          mark(A, i, A.pts[i][0] + hit.nx / len * gap, A.pts[i][1] + hit.nz / len * gap);
        }
      }
    }
  }
  pathsRerouted = changed.size;
}
export function exploreStats(){
  let m = 0, n = 0; for (const c of connectors) if (c.explore){ n++; for (let i = 1; i < c.pts.length; i++) m += Math.hypot(c.pts[i][0] - c.pts[i - 1][0], c.pts[i][1] - c.pts[i - 1][1]); }
  return { segments: n, km: +(m / 1000).toFixed(2) };
}
const cGrid = new Map(), CG = 40;
connectors.forEach((c, ci) => c.pts.forEach((p, i) => { const k = key(Math.floor(p[0]/CG), Math.floor(p[1]/CG)); let a = cGrid.get(k); if (!a) cGrid.set(k, a = []); a.push(ci*100000 + i); }));
export function connDist(x, z){ let m = 1e9; const ci0 = Math.floor(x/CG), cj0 = Math.floor(z/CG);
  for (let di=-1; di<=1; di++) for (let dj=-1; dj<=1; dj++){ const a = cGrid.get(key(ci0+di, cj0+dj)); if (!a) continue;
    for (const id of a){ const c = connectors[Math.floor(id/100000)], p = c.pts[id%100000]; const d = Math.hypot(x-p[0], z-p[1]) - ((c.half || CW) - CW); if (d < m) m = d; } }
  return m; }
export const nearLiftStation = (x, z, r) => LIFTS.some(L => Math.hypot(x-L.bx, z-L.bz) < r || Math.hypot(x-L.tx, z-L.tz) < r);
export function liftLineDist(x, z){ let m = 1e9; for (const L of LIFTS){ const u = Math.max(0, Math.min(L.len, (x-L.bx)*L.dx + (z-L.bz)*L.dz)); m = Math.min(m, Math.hypot(x-(L.bx+L.dx*u), z-(L.bz+L.dz*u))); } return m; }

// ---------- lift towers + cable heights (computed here so they can be checked in Node) ----------
// towers go where they are >= 15 m from every trail, jump and path (paths that lead into that lift's own stations excepted near the station);
// tower heights rise until the chairs clear the ground by 2.5 m everywhere and the cable is >= 8 m up wherever it crosses a trail or path
const nearOwnStation = (L, x, z) => Math.hypot(x-L.bx, z-L.bz) < 30 || Math.hypot(x-L.tx, z-L.tz) < 30;
export const pathDistExcept = (L, x, z) => { let m = 1e9; for (const c of connectors) for (let i = 0; i < c.pts.length; i += 2){ const p = c.pts[i]; if (nearOwnStation(L, p[0], p[1])) continue; const d = Math.hypot(x-p[0], z-p[1]); if (d < m) m = d; } return m; };
export const towerClear = (L, x, z) => Math.min(trailDist(x,z), featClear(x,z), pathDistExcept(L, x, z));
for (const L of LIFTS){
  const us = [0]; let d = 0;
  while (L.len - d > 110 || (L.len - d > 75 && towerClear(L, L.bx + L.dx*(d+50), L.bz + L.dz*(d+50)) >= LIFT_CLEAR)){ let placed = null, bestC = -1, bestD = d + 50;
    for (let dd = d + 20; dd <= Math.min(d + 140, L.len - 20); dd += 2.5){ const x = L.bx + L.dx*dd, z = L.bz + L.dz*dd, c = towerClear(L, x, z);
      if (c >= LIFT_CLEAR && (placed === null || Math.abs(dd - d - 50) < Math.abs(placed - d - 50))) placed = dd; if (c > bestC){ bestC = c; bestD = dd; } }
    if (placed === null) placed = bestD;   // (reported by the check below)
    us.push(placed); d = placed; }
  us.push(L.len);
  const H = us.map((_, i) => (i === 0 || i === us.length-1) ? 7 : 11);
  const cab = (dd) => { let i = 0; while (i < us.length-2 && us[i+1] < dd) i++; const k = (dd - us[i]) / (us[i+1] - us[i]);
    const h0 = terrainH(L.bx + L.dx*us[i], L.bz + L.dz*us[i]) + H[i], h1 = terrainH(L.bx + L.dx*us[i+1], L.bz + L.dz*us[i+1]) + H[i+1]; return h0 + (h1-h0)*k - Math.sin(Math.PI*k)*0.8; };
  for (let it = 0; it < 40; it++){ let worst = null;
    for (let dd = 0; dd <= L.len; dd += 2){ const x = L.bx + L.dx*dd, z = L.bz + L.dz*dd, g = terrainH(x,z) + featH(x,z), c = cab(dd);
      const overWay = trailDist(x,z) < W + 3 || connDist(x,z) < CW + 3;
      const need = Math.max(g + 2.5 + 3.2, overWay ? g + 8 : -1e9, overWay ? g + 4.5 + 3.2 : -1e9);   // chair bottom hangs 3.2 m below the cable
      if (c < need){ worst = dd; break; } }
    if (worst === null) break;
    let i = 0; while (i < us.length-2 && us[i+1] < worst) i++; H[i] = Math.min(28, H[i] + 1.5); H[i+1] = Math.min(28, H[i+1] + 1.5); }
  L.towers = us.map((u, i) => ({u, x: L.bx + L.dx*u, z: L.bz + L.dz*u, h: H[i]}));
  L.cableAt = cab;   // cable height at distance d from the bottom station
}
// automated layout check: returns a list of problems (empty = OK)
const jumpClear = (x, z) => { let m = 1e9; for (const f of features){ if (f.kind === 'roller' || f.kind === 'berm') continue; const L = f.L||0, u = Math.max(-2, Math.min(L, (x-f.x)*f.dx + (z-f.z)*f.dz)), d = Math.hypot(x-f.x-f.dx*u, z-f.z-f.dz*u) - (f.hw||2); if (d < m) m = d; } return m; };
export function pathTrailProblems(){ const out = [];
  connectors.forEach((c, i) => { if (c.explore) return; const ends = [c.pts[0], c.pts[c.pts.length-1]];
    for (const t of trails){ const tj = [t.pts[0], t.pts[t.pts.length-1]].filter(q => ends.some(e => Math.hypot(e[0]-q[0], e[1]-q[1]) < 30));
      let worst = 1e9, wp = null;
      const n = t.pts.length, jS = tj.includes(t.pts[0]), jE = tj.includes(t.pts[n-1]);
      for (const p of c.pts){ if (tj.some(q => Math.hypot(p[0]-q[0], p[1]-q[1]) < 30)) continue;
        for (let k = jS ? 20 : 0; k < (jE ? n-20 : n); k += 2){ const q = t.pts[k], dd = Math.hypot(p[0]-q[0], p[1]-q[1]); if (dd < worst){ worst = dd; wp = p; } } }
      if (worst < 6) out.push(`path ${i} comes ${worst.toFixed(1)} m from ${t.name} at (${wp[0].toFixed(0)},${wp[1].toFixed(0)})`); } });
  return out; }
export function liftLayoutProblems(){ const out = [];
  for (const L of LIFTS){
    for (const [nm, x, z] of [['bottom station', L.bx, L.bz], ['top station', L.tx, L.tz]]){ const td = trailDist(x,z), fd = featClear(x,z); if (td < LIFT_CLEAR || fd < LIFT_CLEAR) out.push(`${L.name} ${nm} ${Math.min(td,fd).toFixed(1)} m from a trail/jump`); const pd = connectors.filter(c => !(Math.hypot(c.pts[0][0]-x, c.pts[0][1]-z) < 20 || Math.hypot(c.pts[c.pts.length-1][0]-x, c.pts[c.pts.length-1][1]-z) < 20)).reduce((m, c) => Math.min(m, ...c.pts.map(p => Math.hypot(p[0]-x, p[1]-z))), 1e9); if (pd < LIFT_CLEAR) out.push(`${L.name} ${nm} ${pd.toFixed(1)} m from a path`); }
    for (const t of L.towers.slice(1, -1)){ const c = towerClear(L, t.x, t.z); if (c < LIFT_CLEAR) out.push(`${L.name} tower at ${t.u.toFixed(0)} m is ${c.toFixed(1)} m from a trail/jump/path`); }
    for (let dd = 0; dd <= L.len; dd += 2){ const x = L.bx + L.dx*dd, z = L.bz + L.dz*dd, g = terrainH(x,z) + featH(x,z), c = L.cableAt(dd);
      if (c - 3.2 < g + 2.0) out.push(`${L.name} chairs only ${(c-3.2-g).toFixed(1)} m above ground at ${dd} m`);
      if ((trailDist(x,z) < W + 3 || connDist(x,z) < CW + 3) && c - g < 8) out.push(`${L.name} cable only ${(c-g).toFixed(1)} m over a trail/path at ${dd} m`); } }
  // connector paths must stay >= 15 m clear of the park pad and of every jump corridor
  connectors.forEach((c, i) => { if (c.explore) return; let worst = 1e9, wp = null; for (const p of c.pts){ const d = Math.min(Math.hypot(p[0]-PARK.x, p[1]-PARK.z) - PARK.r, jumpClear(p[0], p[1])); if (d < worst){ worst = d; wp = p; } }
    if (worst < 15) out.push(`connector ${i} passes ${worst.toFixed(1)} m from the park/a jump at (${wp[0].toFixed(0)},${wp[1].toFixed(0)})`); });
  // connector paths never run along or across a trail: every path point stays >= 6 m from every trail centreline,
  // except within 30 m of the start gate / finish the path is deliberately joining
  out.push(...pathTrailProblems());
  // trails never cross or run along each other (except where they converge on a shared finish / start area)
  for (let a = 0; a < trails.length; a++) for (let b = a+1; b < trails.length; b++){ const A = trails[a], B = trails[b], ends = [A.pts[0], A.pts[A.pts.length-1], B.pts[0], B.pts[B.pts.length-1]];
    let worst = 1e9, wp = null; for (let i = 0; i < A.pts.length; i += 2){ const p = A.pts[i]; if (ends.some(e => Math.hypot(p[0]-e[0], p[1]-e[1]) < 45)) continue;
      for (let j = 0; j < B.pts.length; j += 2){ const q = B.pts[j], d = Math.hypot(p[0]-q[0], p[1]-q[1]); if (d < worst){ worst = d; wp = p; } } }
    if (worst < 12) out.push(`trails ${A.name} / ${B.name} come ${worst.toFixed(1)} m apart at (${wp[0].toFixed(0)},${wp[1].toFixed(0)})`); }
  // no trail may run through the dirt-jump park footprint (pad + 15 m)
  if (!RAMP) for (const t of trails){ let worst = 1e9, wp = null; for (const p of t.pts){ const d = Math.hypot(p[0]-PARK.x, p[1]-PARK.z) - PARK.r; if (d < worst){ worst = d; wp = p; } }
    if (worst < 15) out.push(`trail ${t.name} passes ${worst.toFixed(1)} m from the park at (${wp[0].toFixed(0)},${wp[1].toFixed(0)})`); }
  return out; }

// ---------- level editor runtime (a flat pad the mountain never uses) ----------
export const EDITOR_ORIGIN = { x: 2400, z: 2400 };
const EDITOR_BASE = 48, EDITOR_R = 180, EDITOR_CELL = 4;
const editorFeats = [];
const editorTrees = [];
let editorPaths = [];
const sculpt = new Map();
export function inEditorPad(x, z){ return editorOn && Math.hypot(x - EDITOR_ORIGIN.x, z - EDITOR_ORIGIN.z) < EDITOR_R; }
function editorPad(x, z){ return Math.hypot(x - EDITOR_ORIGIN.x, z - EDITOR_ORIGIN.z) < EDITOR_R; }
function sculptAt(x, z){
  const ix = (x - EDITOR_ORIGIN.x) / EDITOR_CELL, iz = (z - EDITOR_ORIGIN.z) / EDITOR_CELL;
  const i0 = Math.floor(ix), j0 = Math.floor(iz), fx = ix - i0, fz = iz - j0;
  const g = (i, j) => sculpt.get(i + ',' + j) || 0;
  return g(i0, j0) * (1 - fx) * (1 - fz) + g(i0 + 1, j0) * fx * (1 - fz) + g(i0, j0 + 1) * (1 - fx) * fz + g(i0 + 1, j0 + 1) * fx * fz;
}
function editorHeight(x, z){
  let h = 0;
  for (const f of editorFeats){
    if (x < f.minx || x > f.maxx || z < f.minz || z > f.maxz) continue;
    const rx = x - f.x, rz = z - f.z, t = rx * f.dx + rz * f.dz, us = rx * f.dz - rz * f.dx, u = Math.abs(us);
    if (t < 0 || t > f.L || u > f.hw + 1.2) continue;
    let v = f.p(t, us); if (u > f.hw) v *= 0.5 * (1 + Math.cos(Math.PI * (u - f.hw) / 1.2));
    if (v > h) h = v;
  }
  return h;
}
function editorDirt(x, z){
  if (!editorOn) return false;
  for (const path of editorPaths) for (let i = 1; i < path.length; i++){
    const a = path[i - 1], b = path[i], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1;
    let u = ((x - a[0]) * ex + (z - a[1]) * ez) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    if (Math.hypot(x - (a[0] + ex * u), z - (a[1] + ez * u)) < 3.2) return true;
  }
  return false;
}
export function editorTrunks(x, z){
  if (!editorOn) return [];
  return editorTrees.filter(t => Math.abs(t.x - x) < 2 && Math.abs(t.z - z) < 2);
}
function bounds(f){
  f.minx = Math.min(f.x, f.x + f.dx * f.L) - f.hw - 2; f.maxx = Math.max(f.x, f.x + f.dx * f.L) + f.hw + 2;
  f.minz = Math.min(f.z, f.z + f.dz * f.L) - f.hw - 2; f.maxz = Math.max(f.z, f.z + f.dz * f.L) + f.hw + 2;
}
// Same landing ramp the trail jumps get: a slope that is still descending where a normal speed lands.
export function fitLanding(f, speed = 9){
  if (!f || typeof f.p !== 'function' || !(f.L > 1)) return f;
  const old = f.p, oldL = f.L, v = speed;
  let lipT = 0, lipH = -1;
  for (let i = 1; i <= 36; i++){ const t = oldL * i / 36 * 0.8, h = old(t, 0); if (h >= lipH){ lipH = h; lipT = t; } }
  if (lipH < 0.55) return f;
  const face = Math.max(0.08, (old(lipT, 0) - old(Math.max(0, lipT - 0.5), 0)) / 0.5);
  const grade = 0.05;
  let lo = 1e9, hi = 0;
  for (const spd of [v * 0.75, v, Math.min(16, v * 1.15)]){
    const vy = face * spd + 0.45; let hit = lipT + spd * 2.2;
    for (let t = 0.1; t < 3.2; t += 0.02){
      const dist = lipT + spd * t, y = lipH + vy * t - 0.5 * 9.81 * t * t + grade * spd * t;
      const gnd = dist <= oldL ? old(dist, 0) : 0;
      if (y <= gnd + 0.05){ hit = dist; break; }
    }
    lo = Math.min(lo, hit); hi = Math.max(hi, hit);
  }
  let deckEnd = lipT;
  for (let t = lipT; t < oldL; t += 0.35) if (old(t, 0) > lipH * 0.72) deckEnd = t;
  const drop = Math.tan(30 * Math.PI / 180);
  const start = Math.max(deckEnd + 0.3, lo - 1.5);
  let end = Math.max(start + 4, hi + 2);
  let h0 = Math.min(2.2, Math.max(1.1, drop * Math.min(8, end - start)));
  end = Math.min(end, start + h0 / drop + 0.5);
  if (end <= start + 1) return f;
  f.p = (t, us) => {
    const base = t <= oldL ? old(Math.min(Math.max(t, 0), oldL), us) : 0;
    if (t <= deckEnd || t > end) return base;
    if (t < start){ const u = Math.max(0, (t - (start - h0 / 0.55)) / (h0 / 0.55)); return Math.max(base, h0 * Math.min(1, u)); }
    return Math.max(base, Math.max(0, h0 - drop * (t - start)));
  };
  f.L = Math.max(oldL, end); f.landed = true; bounds(f); return f;
}
export function aimOnTrail(f, pts, halfW = 2.4){
  if (!f || !pts || pts.length < 2) return f;
  let bi = 0, bd = 1e9;
  for (let i = 1; i < pts.length; i++){
    const a = pts[i - 1], b = pts[i], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1;
    let u = ((f.x - a[0]) * ex + (f.z - a[1]) * ez) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(f.x - (a[0] + ex * u), f.z - (a[1] + ez * u));
    if (d < bd){ bd = d; bi = i; }
  }
  if (bd > halfW + 1.5) return f;
  const a = pts[Math.max(0, bi - 1)], b = pts[Math.min(pts.length - 1, bi + 1)];
  f.yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
  f.dx = -Math.sin(f.yaw); f.dz = -Math.cos(f.yaw);
  const near = (x, z) => { let m = 1e9, yaw = f.yaw; for (let i = 0; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - x, pts[i][1] - z); if (d < m){ m = d; const p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)]; yaw = Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])); } } return { d: m, yaw }; };
  let keep = 0;
  for (let t = 0; t <= f.L + 1e-6; t += 0.5){
    const n = near(f.x + f.dx * t, f.z + f.dz * t);
    const ang = Math.atan2(Math.sin(Math.atan2(-f.dx, -f.dz) - n.yaw), Math.cos(Math.atan2(-f.dx, -f.dz) - n.yaw));
    if (n.d > halfW + 0.3 || Math.abs(ang) > 0.2) break;
    keep = t;
  }
  if (keep >= 3 && keep < f.L - 0.25) f.L = keep;
  bounds(f); return f;
}
function specFeature(o){
  const s = Math.max(0.4, Math.min(2.4, o.size || 1));
  const x = EDITOR_ORIGIN.x + o.x, z = EDITOR_ORIGIN.z + o.z;
  let yaw = o.yaw || 0, kind, hw = 2.2 * Math.min(s, 1.6), prof;
  if (o.kind === 'jump'){ kind = 'kicker'; prof = PROF.kicker(1.15 * s, 5 * s); prof = { ...prof, wood: false }; }
  else if (o.kind === 'table'){ kind = 'table'; prof = PROF.table(1.05 * s, 4 * s, 3.2 * s, 4 * s); }
  else if (o.kind === 'hip'){ kind = 'kicker'; yaw += 0.32; prof = PROF.kicker(1.1 * s, 5 * s); prof = { ...prof, wood: false }; }
  else if (o.kind === 'drop'){ kind = 'drop'; prof = PROF.drop(1.3 * s, 3.5 * s, 2.2 * s); prof = { ...prof, wood: false }; }
  else if (o.kind === 'ramp'){ kind = 'kicker'; prof = PROF.kicker(0.55 * s, 9 * s); prof = { ...prof, wood: false }; hw = 2.4; }
  else if (o.kind === 'rock'){ kind = 'rocks'; const R = 1.5 * s; prof = { L: R * 2, p: (t, us) => { const d = Math.hypot(t - R, us); return d < R ? (R - d) * 0.65 : 0; } }; hw = R; }
  else if (o.kind === 'log'){ kind = 'roller'; prof = { L: 5 * s, p: (t, us) => Math.abs(us) < 0.4 ? 0.42 * s : 0 }; hw = 0.7; }
  else return null;
  const f = { kind, x, z, yaw, dx: -Math.sin(yaw), dz: -Math.cos(yaw), hw, ...prof, trail: -1, editor: true, hip: o.kind === 'hip' };
  bounds(f); return f;
}
function trailRibbon(pts){
  const out = [];
  for (let i = 1; i < pts.length; i++){
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.4) continue;
    const yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])), hw = 3.1;
    const f = { kind: 'roller', x: a[0], z: a[1], yaw, dx: -Math.sin(yaw), dz: -Math.cos(yaw), hw, L: len + 1.2, trail: -1, editor: true, groom: true,
      p: (t, us) => { if (t < 0 || t > len + 1.2) return 0; const lip = Math.abs(us) <= hw * 0.55 ? 0 : Math.min(1, (Math.abs(us) - hw * 0.55) / (hw * 0.45)); return 0.07 + 0.28 * lip * lip; } };
    bounds(f); out.push(f);
  }
  return out;
}
export function loadEditorLevel(level){
  editorFeats.length = 0; editorTrees.length = 0; editorPaths = []; sculpt.clear(); editorOn = true;
  const trails = level?.trails || [];
  const worldPts = trails.map(tr => (tr.pts || []).map(p => [EDITOR_ORIGIN.x + p[0], EDITOR_ORIGIN.z + p[1]]));
  editorPaths = worldPts;
  for (const pts of worldPts) editorFeats.push(...trailRibbon(pts));
  const allPts = worldPts.flat();
  for (const o of level?.objects || []){
    if (o.kind === 'tree'){ editorTrees.push({ x: EDITOR_ORIGIN.x + o.x, z: EDITOR_ORIGIN.z + o.z, h: 6 * (o.size || 1) }); continue; }
    if (o.kind === 'start' || o.kind === 'finish') continue;
    const f = specFeature(o); if (!f) continue;
    if (o.kind !== 'hip') aimOnTrail(f, allPts);
    if (o.kind === 'jump' || o.kind === 'table' || o.kind === 'hip' || o.kind === 'drop' || o.kind === 'ramp') fitLanding(f, 8 + (o.size || 1) * 2);
    editorFeats.push(f);
  }
  for (const c of level?.sculpt || []){
    if (!Array.isArray(c) || c.length < 3) continue;
    sculpt.set(Math.round(c[0]) + ',' + Math.round(c[1]), Math.max(-6, Math.min(6, +c[2] || 0)));
  }
  return { features: editorFeats.length, trees: editorTrees.length };
}
export function clearEditorLevel(){ editorOn = false; editorFeats.length = 0; editorTrees.length = 0; editorPaths = []; sculpt.clear(); }
export function editorActive(){ return editorOn; }
