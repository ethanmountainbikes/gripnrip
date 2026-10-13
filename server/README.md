# Grip 'N Rip room server

Cloudflare Worker + Durable Objects (one object per room). Live at **https://gripnrip-rooms.gripnrip.workers.dev**
(Cloudflare account owned by David; Workers Free plan).

## Safety rules (enforced here, not just in the client)
- Private rooms only: `GET /new` makes a random 6-character code (alphabet without 0/O/1/I/L). No lobby, no room list.
- Unknown codes are refused (`noroom`); a room exists only while someone is in it (+10 min idle), in memory only.
- Max 8 riders. The first rider is host; host can **lock** the room and **kick** riders. Host passes on if they leave.
- Whitelisted message types only: `hello`, `s` (state), `e` (emote), `skin`, `lock`, `kick`, `ping`. Everything else is dropped.
- No text fields exist: names are two indices into preset word lists, emotes are an index into 6 presets, skins are small
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
Why not D1/KV: the token has no D1 permission (would need *Account → D1 → Edit*), and KV's free tier allows only 1,000 writes/day; SQLite-backed Durable Objects are on the free plan with far higher limits and strong consistency.
