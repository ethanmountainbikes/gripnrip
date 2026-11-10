# Grip 'N Rip room server

Cloudflare Worker + Durable Objects (one object per room). Live at **https://gripnrip-rooms.gripnrip.workers.dev**
(Cloudflare account owned by David; Workers Free plan).

## Safety rules (enforced here, not just in the client)
- Private rooms only: `GET /new` makes a random 6-character code (alphabet without 0/O/1/I/L). No lobby, no room list.
- Unknown codes are refused (`noroom`); a room exists only while someone is in it (+10 min idle), in memory only.
- Max 8 riders. The first rider is host; host can **lock** the room and **kick** riders. Host passes on if they leave.
- Whitelisted message types only: `hello`, `s` (state), `e` (emote), `skin`, `lock`, `kick`, `ping`. Everything else is dropped.
- No text fields exist in rooms: names are two indices into preset word lists (rooms always show the generated name), emotes are an index into 6 presets, skins are small
  integers. Out-of-range values are replaced/dropped. Messages over 400 bytes close the socket. 30 msgs/s rate limit.
- Nothing is written to storage or logs; no accounts, no personal data.

## Messages
Client → server: `{t:'hello', name:[a,b], skin:[bike,paint,jersey,pants,helmet,goggles], world:0|1}` first, then
`{t:'s', p:[x,y,z], q:[x,y,z,w], v, a, k, f}` at 15 Hz, `{t:'e', e}`, `{t:'skin', skin}`, `{t:'lock', on}`, `{t:'kick', id}`.
Server → client: `welcome`, `join`, `leave`, `s`, `e`, `skin`, `host`, `locked`, `kicked`, `err` (`full`/`locked`/`noroom`).

## Deploy (non-interactive)
```
cd server && npm install
export CLOUDFLARE_API_TOKEN=...   # "Edit Cloudflare Workers" token
export CLOUDFLARE_ACCOUNT_ID=8f1d2ae5c0d2cc2d7259e55922cbd7db
npx wrangler deploy
```
The client's server URL is `MP_SERVER` at the top of `net.js`.

## Cloud saves + leaderboards (Durable Object `Store`, SQLite, no extra API permission needed)
`POST /save/put|get|delete {code, data}` · `POST /lb/submit {code, world, trail, name, time, cps[], combo}` · `POST /lb/stat {code, cat, val, air?, dur?}` · `POST /lb/get {cat, world, trail, code?}`.
Save codes: 16 chars, stored as SHA-256(PEPPER + code). Secrets: `PEPPER`, `ADMIN` (`wrangler secret put`). `/admin/purge {key, before, saves}` removes rows for moderation.
`src/trails.json` (trail lengths + checkpoint positions) is generated from `world.js` — regenerate and redeploy if trails change:
`node -e` script in the repo history (import world.js with a fake localStorage per world).

## Custom rider names (in this branch, NOT deployed yet)
Optional, for leaderboards only; the generated preset name stays the default and rooms keep using it.
- `POST /name/get {code}` → `{ok, name, hidden, nextChange}` · `POST /name/set {code, name}` · `POST /name/clear {code}` (back to the generated name, releases the claim).
  Errors from set: `nosave`, `short`/`long`/`chars`/`word` (filter), `taken` (409), `soon` (429, with `nextChange`).
- Rules live in the shared `../names.js` (the game uses the same file): 3-12 ASCII letters/digits only, then a word filter
  (lowercase, leetspeak map, repeated letters squashed, `xX…Xx` stripped, substring match for long words, part/start/end match
  for short ones, allowlist for Scunthorpe-style words). Word list: LDNOOBW `en` (CC BY 4.0) in `../namewords.js`, plus
  slurs, sexual and drug terms and impersonation (admin, mod, official, gripnrip, …) in `names.js`.
- Unique ignoring case (`names.lower` is UNIQUE), keyed to the save hash. Changes about once a day (20 h; clearing does not reset it).
- `POST /name/report {device, name}`: one report per device hash per name; at 3 the name is hidden (boards show the
  generated name, the name stays claimed) until reviewed. Boards (`/lb/*`) add `custom` only for visible names.
- `POST /level/time` accepts an optional `savecode` so level boards carry `name` / `custom`.
- Reviewer: `POST /admin/names {key, action:'list'|'clear'|'remove', name}` (404 without the ADMIN secret), or
  `GNR_ADMIN=<ADMIN secret> node tools/names-admin.mjs list | clear <name> | remove <name>`. `clear` keeps the name and
  drops its reports; `remove` takes it away. The secret is never in the repo.
- Tests: `node tests/names.test.mjs` (filter), `node tests/names-server.test.mjs` (these routes on node:sqlite).
- To ship it: deploy this worker (steps above; `ADMIN` must be set: `npx wrangler secret put ADMIN`). Until then the game says
  "Custom names coming soon" and boards keep generated names.
Why not D1/KV: the token has no D1 permission (would need *Account → D1 → Edit*), and KV's free tier allows only 1,000 writes/day; SQLite-backed Durable Objects are on the free plan with far higher limits and strong consistency.
