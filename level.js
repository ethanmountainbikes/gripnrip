// Level documents, preset names, share codes, and the size checks the server repeats.
// No Three.js. Names are three indices into fixed lists. There is no free-text name.

export const ADJ = ['Gnarly','Dusty','Silent','Golden','Mossy','Rocky','Swift','Brave','Muddy','Sunny','Wild','Chill','Mighty','Frosty','Happy','Steady','Bouncy','Rad','Lucky','Zippy','Epic','Pumped','Jolly','Sendy'];
export const NOUN = ['Pine','Ridge','Boulder','Creek','Meadow','Switchback','Canyon','Granite','Cedar','Summit','Valley','Badger','Falcon','Otter','Hawk','Ram','Elk','Heron','Gecko','Marmot','Fox','Goat','Lynx','Bear'];
export const VERB = ['Shred','Send','Flow','Rip','Carve','Drop','Pump','Launch','Glide','Charge','Sweep','Roll','Boost','Snap','Drift','Cruise','Huck','Rail','Sprint','Coast','Dive','Spin','Pop','Stick'];

export const KINDS = ['jump','table','hip','drop','ramp','rock','tree','log','start','finish'];
export const DIFFS = ['easy','medium','hard'];
export const STYLES = ['jumpy','flowy','technical'];
export const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Substrings that can be spelled with the share-code alphabet. Ambiguous letters (I, L, O, 0, 1) are already absent.
const RUDE = ['FUCK','SHIT','DAMN','CRAP','ASS','SEX','FAG','SUCK','KKK','XXX','CUM','ARSE','BUTT','TURD','SLUT','DUMB','FART','ANAL','PORN','HELL','NAZI','DICK','POOP','PISS','TITS','WTF','FUK'];

export const LIMITS = { objects: 80, trailPts: 160, trails: 4, sculpt: 400, span: 280, height: 6, json: 60000 };

export function blankLevel(id){
  return { v: 1, id: id || makeCode() + makeCode().slice(0, 2), version: 1, name: [0, 0, 0], diff: 'auto', style: 'auto', trails: [], objects: [], sculpt: [], published: null };
}

export function levelName(name){
  if (!Array.isArray(name) || name.length !== 3) return null;
  const [a, n, v] = name;
  if (![a, n, v].every((i, k) => Number.isInteger(i) && i >= 0 && i < [ADJ, NOUN, VERB][k].length)) return null;
  return `${ADJ[a]} ${NOUN[n]} ${VERB[v]}`;
}

export function isPresetName(s){
  if (typeof s !== 'string') return false;
  const p = s.split(' ');
  return p.length === 3 && ADJ.includes(p[0]) && NOUN.includes(p[1]) && VERB.includes(p[2]);
}

export function publicCodeOk(code){
  if (typeof code !== 'string' || code.length !== 6 || [...code].some(c => !ALPHA.includes(c))) return false;
  return !RUDE.some(w => code.includes(w));
}

export function makeCode(rng = Math.random){
  for (let n = 0; n < 80; n++){
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(rng() * ALPHA.length)];
    if (publicCodeOk(s)) return s;
  }
  return 'GNR234';
}

function num(v, lim){ return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim; }

export function validateLevel(level){
  const errors = [];
  if (!level || typeof level !== 'object' || level.v !== 1) errors.push('schema');
  if (!levelName(level?.name)) errors.push('name');
  if (!Array.isArray(level?.objects) || level.objects.length > LIMITS.objects) errors.push('objects');
  if (!Array.isArray(level?.trails) || level.trails.length > LIMITS.trails) errors.push('trails');
  if (!Array.isArray(level?.sculpt) || level.sculpt.length > LIMITS.sculpt) errors.push('sculpt');
  let pts = 0;
  for (const tr of level?.trails || []){
    if (!tr || !Array.isArray(tr.pts)) { errors.push('trail'); break; }
    pts += tr.pts.length;
    for (const p of tr.pts) if (!Array.isArray(p) || p.length < 2 || !num(p[0], LIMITS.span) || !num(p[1], LIMITS.span)) { errors.push('trail point'); break; }
  }
  if (pts > LIMITS.trailPts) errors.push('trail points');
  let starts = 0, finishes = 0;
  for (const o of level?.objects || []){
    if (!o || !KINDS.includes(o.kind) || !num(o.x, LIMITS.span) || !num(o.z, LIMITS.span)) { errors.push('object'); break; }
    if (o.yaw != null && !num(o.yaw, 7)) { errors.push('yaw'); break; }
    if (o.size != null && !(typeof o.size === 'number' && o.size >= 0.4 && o.size <= 2.4)) { errors.push('size'); break; }
    if (o.kind === 'start') starts++;
    if (o.kind === 'finish') finishes++;
  }
  if (starts > 1 || finishes > 1) errors.push('gates');
  for (const c of level?.sculpt || []){
    if (!Array.isArray(c) || c.length < 3 || !num(c[0], 80) || !num(c[1], 80) || !num(c[2], LIMITS.height)) { errors.push('sculpt'); break; }
  }
  if (level?.diff != null && level.diff !== 'auto' && !DIFFS.includes(level.diff)) errors.push('diff');
  if (level?.style != null && level.style !== 'auto' && !STYLES.includes(level.style)) errors.push('style');
  const packed = pack(level || {});
  if (JSON.stringify(packed).length > LIMITS.json) errors.push('json');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function rateLevel(level){
  const objs = level?.objects || [];
  const jumps = objs.filter(o => ['jump','table','hip','drop'].includes(o.kind));
  const tech = objs.filter(o => o.kind === 'rock' || o.kind === 'log' || o.kind === 'tree').length;
  const maxH = jumps.reduce((m, o) => Math.max(m, o.size || 1), 0);
  const autoDiff = maxH < 1.15 ? 'easy' : maxH < 1.8 ? 'medium' : 'hard';
  const autoStyle = tech > jumps.length && tech > 2 ? 'technical' : jumps.length >= 3 ? 'jumpy' : 'flowy';
  return { diff: level?.diff && level.diff !== 'auto' ? level.diff : autoDiff, style: level?.style && level.style !== 'auto' ? level.style : autoStyle };
}

export function startGate(level){
  const g = (level?.objects || []).find(o => o.kind === 'start');
  return g ? { x: g.x, z: g.z, yaw: g.yaw || 0 } : null;
}

function pack(level){
  return { v: 1, id: level.id, version: level.version || 1, name: level.name, diff: level.diff || 'auto', style: level.style || 'auto', trails: level.trails || [], objects: level.objects || [], sculpt: level.sculpt || [] };
}

function toB32(bytes){
  let out = '', buf = 0, bits = 0;
  for (const b of bytes){ buf = (buf << 8) | b; bits += 8; while (bits >= 5){ bits -= 5; out += ALPHA[(buf >> bits) & 31]; } }
  if (bits) out += ALPHA[(buf << (5 - bits)) & 31];
  return out;
}
function fromB32(s){
  const out = []; let buf = 0, bits = 0;
  for (const c of s){ const i = ALPHA.indexOf(c); if (i < 0) return null; buf = (buf << 5) | i; bits += 5; if (bits >= 8){ bits -= 8; out.push((buf >> bits) & 255); } }
  return new Uint8Array(out);
}

export function encodeLevel(level){
  const check = validateLevel(level);
  if (!check.ok) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(pack(level)));
  return 'GNR1' + toB32(bytes);
}

export function decodeLevel(code){
  if (typeof code !== 'string' || !code.startsWith('GNR1')) return null;
  const bytes = fromB32(code.slice(4));
  if (!bytes) return null;
  let level; try { level = JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
  const check = validateLevel(level);
  return check.ok ? level : null;
}

const LS_KEY = 'trailDescent.levels';
export function loadLocal(get){
  const raw = get(LS_KEY, []);
  return Array.isArray(raw) ? raw.filter(l => validateLevel(l).ok) : [];
}
export function saveLocal(levels, set){
  set(LS_KEY, levels.filter(l => validateLevel(l).ok).slice(0, 40));
}
