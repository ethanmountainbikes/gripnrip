// Reviewer tool for reported custom rider names. The secret is never stored in the repo: it is the worker's ADMIN secret
// (set with `npx wrangler secret put ADMIN`), passed in through the environment.
//   GNR_ADMIN=... node tools/names-admin.mjs list
//   GNR_ADMIN=... node tools/names-admin.mjs clear  SomeName   # keep the name, drop its reports (shows again)
//   GNR_ADMIN=... node tools/names-admin.mjs remove SomeName   # take the name away; the player is back on the generated name
// GNR_SERVER overrides the worker URL (default: the live worker).
const [action, name] = process.argv.slice(2), key = process.env.GNR_ADMIN;
const server = process.env.GNR_SERVER || 'https://gripnrip-rooms.gripnrip.workers.dev';
if (!key || !['list', 'clear', 'remove'].includes(action) || (action !== 'list' && !name)) {
  console.error('usage: GNR_ADMIN=<secret> node tools/names-admin.mjs list | clear <name> | remove <name>'); process.exit(2); }
const r = await fetch(server + '/admin/names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, action, name }) });
const out = await r.json().catch(() => ({}));
if (!r.ok) { console.error('failed:', r.status, out.error || ''); process.exit(1); }
if (action === 'list') {
  if (!out.names.length) console.log('No reported or hidden names.');
  for (const n of out.names) console.log(`${n.name.padEnd(12)}  reports ${String(n.reports).padStart(2)}  ${n.hidden ? 'HIDDEN' : 'shown'}`);
} else console.log('ok');
