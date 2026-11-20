// Free ride versus race. No Three.js, so the node tests can import it.
// A trail is raced only after it has been completed on the current layout.
// An existing leaderboard time stored for that same layout counts as a completion.

export function clearKey(world, trailId, layout) {
  return `${world}:${trailId}:${layout}`;
}

export function timeKey(world, trailId, layout) {
  return `time:${world}:${trailId}:${layout}`;
}

export function isRaceUnlocked(cleared, pb, world, trailId, layout) {
  if (!layout) return false;
  if (cleared && cleared[clearKey(world, trailId, layout)]) return true;
  const t = pb && pb[timeKey(world, trailId, layout)];
  return typeof t === 'number' && t > 0;
}

// Fills completion from leaderboard times that already belong to these layouts.
// Older saves with no cleared map, and times from a different layout, stay locked.
export function migrateCleared(cleared, pb, world, trails) {
  const next = cleared && typeof cleared === 'object' ? { ...cleared } : {};
  for (const tr of trails || []) {
    if (isRaceUnlocked(next, pb, world, tr.id, tr.layout)) next[clearKey(world, tr.id, tr.layout)] = 1;
  }
  return next;
}

// The next gate only. A later checkpoint does not count if this one was missed.
export function advanceCheckpoint(cp, s, gates) {
  const cur = cp ?? -1;
  const next = cur + 1;
  if (!gates || next >= gates.length) return cur;
  const g = gates[next];
  if (g && s >= g.s - 2 && s < g.s + 25) return next;
  return cur;
}

export function checkpointsDone(cp, count) {
  return count <= 0 || (cp ?? -1) >= count - 1;
}

// Leaderboard times are race results only. A free ride, a drone, a personal
// respawn, or a missed checkpoint never submits.
export function shouldSubmit(run, droneOut) {
  if (!run || run.mode !== 'race') return false;
  if (droneOut || run.unranked || run.spawnUsed) return false;
  return checkpointsDone(run.cp, run.cpCount ?? 0);
}
