// measure/harness.mjs — the replay harness shared by tools/tune.mjs (dev data only) and measure/measure.mjs (test,
// after seal 2). It never chooses which data it sees: each caller hands it the events it may read.
//
//   online(events, P, snapTimes)   the watcher over a real stream, in order. A genuine action flagged STEP_UP or above
//                                  is answered by its owner (confirm) — every false positive is an interruption the
//                                  owner answers, and the answer teaches the baseline. A big baseline shift the watcher
//                                  holds for its owner is answered the same way (confirmShift) and COUNTED: that is an
//                                  interruption too, reported beside the false positives. → { outs, snaps, w, shifts }
//   firstCatch(w, session, P, n)   a driver session from a snapshot: the first of its n actions reaching STEP_UP+ and
//                                  BLOCK+ (null when none). Nobody answers a driver's step-up.
//   injections(start, end, k)      k moments evenly spaced across [start, end)
import { emptyWatcher, step, confirm, confirmShift } from '../src/watch.mjs';
import { rank } from '../src/gep.mjs';

export function online(events, P, snapTimes) {
  const times = (snapTimes || []).slice().sort((a, b) => a - b);
  let w = emptyWatcher('identity'), i = 0;
  const outs = [], snaps = [], shifts = [];
  for (const e of events) {
    while (i < times.length && times[i] <= e.t) snaps.push({ t: times[i++], w: structuredClone(w) });
    const r = step(w, e, P);
    w = r.w;
    outs.push({ t: e.t, raw: r.out.raw, row: r.out.row, part: r.out.part, formed: r.out.formed, observing: r.out.observing, enforced: r.out.observing ? 'ALLOW' : r.out.raw });
    if (r.out.formed && rank(r.out.raw) >= 2) w = confirm(w, P);
    if (w.pendingShift) { shifts.push(e.t); w = confirmShift(w, P); }
  }
  while (i < times.length) snaps.push({ t: times[i++], w: structuredClone(w) });
  return { outs, snaps, w, shifts };
}

export function firstCatch(w, session, P, n) {
  let ww = w, su = null, bl = null;
  session.slice(0, n).forEach((e, i) => {
    const r = step(ww, e, P);
    ww = r.w;
    if (su === null && rank(r.out.raw) >= 2) su = i + 1;
    if (bl === null && rank(r.out.raw) >= 3) bl = i + 1;
  });
  return { stepUp: su, block: bl };
}

export const injections = (start, end, k) => Array.from({ length: k }, (_, i) => Math.floor(start + ((i + 0.5) * (end - start)) / k));

/** Rate of raw STEP_UP+ among outs on which the watcher had formed, inside [from, to). */
export function fpOf(outs, from, to) {
  const xs = outs.filter((o) => o.t >= from && o.t < to);
  const judged = xs.filter((o) => o.formed);
  const fp = judged.filter((o) => rank(o.raw) >= 2).length;
  return { actions: xs.length, judged: judged.length, forming: xs.length - judged.length, fp, rate: judged.length ? fp / judged.length : 0, rows: judged.filter((o) => rank(o.raw) >= 2).reduce((m, o) => ((m[o.row + ' (' + o.part + ')'] = (m[o.row + ' (' + o.part + ')'] || 0) + 1), m), {}) };
}
