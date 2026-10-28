// ════════════════════════════════════════════════════════════════
// drivers.mjs — the "stolen key driven by a script" test fixtures: each one only RE-TIMES or RE-ORDERS real,
// legitimate recorded request shapes. None writes a request that was not already made; none is a new attack tool.
// Pure, total, deterministic (a seeded PRNG), gated.
//
//   run(events, n, seed)           n consecutive real actions from a seeded start (their real order kept)
//   cadence(run, t0, every)        the run on a fixed interval (scripted clockwork)
//   burst(run, t0, every)          the run at machine speed
//   uniform(run, t0, seed)         the run in a random order at uniformly random moments over 24 hours
//   shuffled(run, t0, seed)        the run's real gaps, its order shuffled (wrong step order)
//   borrowed(run, other, t0)       one identity's shapes on the OTHER identity's real timing (a mixed signal)
//   mimic(events, t0, n)           the identity's own actions from exactly 7 days before t0, replayed with their
//                                  exact gaps and hours — a perfect copy of its past (Gary's A.2 'mimicry')
// ════════════════════════════════════════════════════════════════
export const DAY = 86400000;
const SHAPE = ['src', 'kind', 'loc', 'size', 'tier', 'priv'];
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (xs) => (Array.isArray(xs) ? xs.filter((e) => isObj(e) && Number.isSafeInteger(e.t)) : []);

/** A small seeded PRNG (mulberry32): the same seed, the same numbers, on every machine. */
export function rng(seed) {
  let a = (Number.isSafeInteger(seed) ? seed : 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The request shape of an action, without its time. */
export function shapeOf(e) {
  const out = {};
  for (const k of SHAPE) if (isObj(e) && e[k] !== undefined) out[k] = e[k];
  return out;
}

/** A seeded Fisher–Yates permutation of 0..n-1. */
export function permutation(n, seed) {
  const r = rng(seed), p = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = p[i]; p[i] = p[j]; p[j] = x; }
  return p;
}

/** n consecutive real actions from a seeded start (fewer if the stream is shorter). */
export function run(events, n, seed) {
  const xs = list(events);
  if (xs.length === 0 || !(n >= 1)) return [];
  const take = Math.min(n, xs.length);
  const start = Math.floor(rng(seed)() * (xs.length - take + 1));
  return xs.slice(start, start + take);
}

export const cadence = (r, t0, every) => list(r).map((e, i) => ({ ...shapeOf(e), t: t0 + (i + 1) * every }));
export const burst = cadence;

export function uniform(r, t0, seed) {
  const xs = list(r), g = rng(seed);
  const times = xs.map(() => t0 + 1 + Math.floor(g() * DAY)).sort((a, b) => a - b);
  const p = permutation(xs.length, seed + 1);
  return times.map((t, i) => ({ ...shapeOf(xs[p[i]]), t }));
}

export function shuffled(r, t0, seed) {
  const xs = list(r);
  if (xs.length === 0) return [];
  const p = permutation(xs.length, seed);
  return xs.map((e, i) => ({ ...shapeOf(xs[p[i]]), t: t0 + 1 + (e.t - xs[0].t) }));
}

/** Shapes of one run on the real timing of another identity's run (as many as both have). */
export function borrowed(r, other, t0) {
  const xs = list(r), ys = list(other);
  if (ys.length === 0) return [];
  const base = ys[0].t >= t0 ? ys[0].t : t0 + 1;
  return xs.slice(0, ys.length).map((e, i) => ({ ...shapeOf(e), t: base + (ys[i].t - ys[0].t) }));
}

/** The identity's own n actions starting exactly 7 days before t0, moved forward exactly 7 days. */
export function mimic(events, t0, n) {
  const xs = list(events).filter((e) => e.t >= t0 - 7 * DAY);
  return xs.slice(0, n).map((e) => ({ ...shapeOf(e), t: e.t + 7 * DAY }));
}
