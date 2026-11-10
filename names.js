// Custom rider names: the shape rule and the word filter. Shared by the game and the worker (server/src/store.js),
// so a name the game says is fine is the same name the server accepts. The server's answer is the one that counts.
// No DOM, no Three.js.
//
// Rules: 3-12 characters, ASCII A-Z a-z 0-9 only. Nothing else gets through: no spaces, symbols, emoji, accents,
// look-alike letters or zero-width characters (the check is a strict whitelist on the raw string).
// Filter: lowercase, undo leetspeak (0>o 1>i/l 3>e 4>a 5>s 7>t 8>b 9>g @>a $>s), then look for bad words both as typed and
// with repeated letters squashed (fuuuck > fuck). Long words match anywhere. Short or ambiguous words (ass, sex, mod…)
// only match a whole word part, or the start or end of one, so "Class" and "Model" are fine. A small allowlist covers
// real words that contain a bad one (Scunthorpe, peacock, grape…).
import { LDNOOBW_EN } from './namewords.js';

export const NAME_MIN = 3, NAME_MAX = 12;
const SHAPE = /^[A-Za-z0-9]{3,12}$/;

// Kid-friendly messages for every reason a name is refused.
export const NAME_SAY = {
  empty: 'Type a name',
  short: 'Names need at least 3 letters or numbers',
  long: 'Names can be up to 12 letters or numbers',
  chars: 'Only letters A-Z and numbers 0-9. No spaces or symbols',
  word: 'Try a different name',
  taken: 'That name is taken. Try another one!',
  soon: 'You can change your name again tomorrow',
  offline: 'Custom names coming soon',
  nosave: 'Custom names need cloud save. Try again in a moment',
};

const LEET = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's' };
export const collapse = s => s.replace(/(.)\1+/g, '$1');
// Lowercase and undo leetspeak. 1 can be i or l, so there are two spellings.
export function unleet(s) {
  const low = String(s).toLowerCase(), out = new Set();
  for (const one of ['i', 'l']) out.add([...low].map(c => c === '1' ? one : (LEET[c] ?? c)).join('').replace(/[^a-z0-9]/g, ''));
  return [...out];
}

// Matched anywhere in the name (after the allowlist is taken out).
const EXTRA = [
  // common misspellings
  'kunt', 'phuck', 'fvck', 'fukk', 'fuck', 'biatch', 'azz', 'stfu', 'wtf',
  // slurs and hate
  'retard', 'tranny', 'chink', 'gook', 'wetback', 'beaner', 'dyke', 'faggot', 'nazi', 'hitler', 'heil', 'whitepower', 'coon', 'spic', 'nigg', 'niga',
  // sexual
  'nipple', 'vagina', 'condom', 'orgasm', 'boobies', 'hooker', 'stripper', 'onlyfans', 'nudes', 'thot', 'pimp', 'horny', 'sexy', 'hentai', 'pedo', 'molest', 'rapist',
  // drugs
  'weed', 'cocaine', 'heroin', 'meth', 'crackhead', 'stoner', 'stoned', 'fentanyl', 'ketamine', 'xanax', 'opium', 'mdma', 'ecstasy', 'cannabis', 'marijuana', 'drugs', 'drunk', 'vape',
  // self-harm
  'suicide', 'killyourself',
  // pretending to be staff or the game
  'admin', 'moderator', 'official', 'gripnrip', 'gripandrip', 'support', 'developer', 'staff', 'owner',
];
// Short or ambiguous: only a whole word part, or the start / end of one.
const EDGE = ['ass', 'arse', 'tit', 'tits', 'cum', 'sex', 'anal', 'anus', 'hoe', 'hoes', 'butt', 'mong', 'scat', 'poon', 'poof', 'quim', 'paki',
  'guro', 'bbw', 'lsd', 'oxy', 'dope', 'bong', 'mod', 'mods', 'kys', 'fag', 'fags', 'fuk', 'fck', 'fux', 'azz'];
// Checked on the raw lowercase name (digits, and letters that squashing would hide).
const RAW = ['69', '420', '1488', 'kkk'];
// Real words that contain a bad one. They are taken out before checking, so what is left still gets checked.
export const ALLOW = ['scunthorpe', 'penistone', 'cockatoo', 'peacock', 'hancock', 'hitchcock', 'woodcock', 'shuttlecock', 'cockpit', 'cocktail',
  'shiitake', 'shitake', 'dickens', 'arsenal', 'therapist', 'grape', 'drape', 'scrape', 'trapeze', 'basement', 'button', 'butter', 'butterfly',
  'class', 'glass', 'grass', 'brass', 'bass', 'pass', 'mass', 'compass', 'bypass', 'lass', 'sass', 'assist', 'assassin', 'asset', 'assemble',
  'assign', 'assume', 'assure', 'title', 'titan', 'titus', 'tito', 'cumin', 'cumulus', 'sextant', 'sexton', 'sussex', 'essex', 'wessex',
  'analog', 'analyst', 'analysis', 'canal', 'banal', 'shoe', 'scatter', 'spoon', 'harpoon', 'lampoon', 'spice', 'spicy', 'raccoon', 'cocoon',
  'tycoon', 'mongoose', 'mongolia', 'among', 'janus', 'manus', 'model', 'modern', 'mode', 'modest', 'modular', 'module', 'dopey', 'bongo',
  'oxygen', 'foxy', 'boxy', 'proxy', 'heroine', 'method', 'methane', 'seaweed', 'tweed', 'pimple', 'torpedo', 'montenegro', 'matsushita', 'nigeria', 'niger',
];

const LIST = [...new Set([...LDNOOBW_EN, ...EXTRA])];
const edgeSet = new Set(EDGE);
const SUB = LIST.filter(w => w.length >= 4 && !edgeSet.has(w));
const SHORT = [...new Set([...EDGE, ...LIST.filter(w => w.length < 4)])];
const ALLOW_FORMS = [...new Set([...ALLOW, ...ALLOW.map(collapse)])].sort((a, b) => b.length - a.length);
const strip = s => { let t = s; for (const a of ALLOW_FORMS) if (t.includes(a)) t = t.split(a).join('|'); return t; };
// Is every place w appears in s inside an allowed word? ("peacock" hides "cock"; "mode" does not hide "moderator".)
function hits(s, w) {
  const spans = [];
  for (const a of ALLOW_FORMS) for (let i = s.indexOf(a); i >= 0; i = s.indexOf(a, i + 1)) spans.push([i, i + a.length]);
  for (let i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + 1)) if (!spans.some(([x, y]) => x <= i && i + w.length <= y)) return true;
  return false;
}

// Word parts of the raw name: split at lower>Upper and letter<>digit changes ("BigAss99" > big, ass, 99).
export function nameParts(raw) {
  return String(raw).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])([0-9])/g, '$1 $2').replace(/([0-9])([A-Za-z])/g, '$1 $2').split(' ').filter(Boolean);
}
const unX = s => s.replace(/^x+/, '').replace(/x+$/, '');   // xXnameXx decoration

// The bad word (for tests and the reviewer), or null when the name is fine. Shape is not checked here.
export function nameProblem(raw) {
  const low = String(raw).toLowerCase();
  for (const w of RAW) if (low.includes(w)) return w;
  for (const v of unleet(raw)) {
    const b = collapse(v);
    // squashed spelling only for words that stay 4+ letters squashed, so "Bobby" is not "boob" and "Nigel" is fine
    for (const w of SUB) { if (v.includes(w) && hits(v, w)) return w; const cw = collapse(w); if (cw.length >= 4 && b.includes(cw) && hits(b, cw)) return w; }
  }
  // short words: whole parts, the whole name with xXdecorationXx removed, and their starts / ends
  const pieces = [raw, ...nameParts(raw)];
  for (const p of pieces) for (const v of unleet(p)) for (const form of [unX(v), unX(collapse(v))]) {
    for (const seg of strip(form).split('|')) {
      if (!seg) continue;
      const cs = collapse(seg);
      for (const w of SHORT) {
        const cw = collapse(w);
        if (seg === w || cs === cw) return w;
        if (seg.startsWith(w) || seg.endsWith(w)) return w;
        if (cw.length >= 3 && (cs.startsWith(cw) || cs.endsWith(cw))) return w;
      }
    }
  }
  return null;
}

// Full check: {ok:true, name} or {ok:false, reason, say}.
export function checkName(raw) {
  if (typeof raw !== 'string' || !raw.length) return bad('empty');
  if (!SHAPE.test(raw)) {
    if (/^[A-Za-z0-9]*$/.test(raw)) return bad(raw.length < NAME_MIN ? 'short' : 'long');
    return bad('chars');
  }
  if (nameProblem(raw)) return bad('word');
  return { ok: true, name: raw };
}
function bad(reason) { return { ok: false, reason, say: NAME_SAY[reason] }; }
export const nameKey = s => String(s).toLowerCase();
