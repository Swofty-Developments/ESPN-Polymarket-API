// Pure failure-classification logic for the canary (no I/O — unit-testable).
// See docs/architecture.md "Failure classification".

/**
 * Classify a single game probe.
 * @param {{eventFound:boolean, shapeOk:boolean, resolved:boolean}} p
 * @returns {"ok"|"drift"|"gap"|"unlisted"}
 *   ok       — resolved cleanly.
 *   drift    — a Polymarket event was found but its shape no longer parses (needs a human).
 *   gap      — event found, shape fine, but our teams didn't resolve (propose a crosswalk row).
 *   unlisted — no Polymarket event found at all (game may simply not be listed yet; not an error).
 */
export function classifyGame({ eventFound, shapeOk, resolved }) {
  if (resolved) return "ok";
  if (eventFound && !shapeOk) return "drift";
  if (eventFound && shapeOk) return "gap";
  return "unlisted";
}

/**
 * Aggregate per-game buckets into a league status.
 * @param {Array<{bucket:string}>} probes
 * @param {boolean} outage  — true if the ESPN/Polymarket request itself failed.
 */
export function aggregateLeague(probes, outage) {
  const active = probes.length;
  if (outage) return { status: "outage", active, resolved: 0 };
  if (active === 0) return { status: "na", active: 0, resolved: 0 };
  const resolved = probes.filter((p) => p.bucket === "ok").length;
  const drift = probes.some((p) => p.bucket === "drift");
  const gap = probes.some((p) => p.bucket === "gap");
  // unlisted games don't make a league red — they're often just not posted yet.
  const status = drift ? "drift" : gap ? "gap" : "ok";
  return { status, active, resolved };
}

/** Overall status across leagues (worst-wins, with N/A only when truly nothing is happening). */
export function aggregateOverall(leagues) {
  const states = Object.values(leagues).map((l) => l.status);
  if (states.includes("drift")) return "drift";
  if (states.includes("gap")) return "gap";
  if (states.includes("outage")) return "outage";
  if (states.some((s) => s === "ok")) return "ok";
  return "na";
}
