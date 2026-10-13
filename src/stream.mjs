// stream.mjs — turn an action log into windows, and turn Kar's own nightly ledger into action events. Pure, total.
// None of this decides anything — bes.mjs does; this only shapes the input. So it is value-tested, not mutation-gated.

/** Cut a flat list of events into fixed-size windows (a trailing part shorter than 2 is dropped — no rhythm). */
export function windows(events, size) {
  const list = Array.isArray(events) ? events : [];
  const n = Number.isInteger(size) && size >= 2 ? size : 8;
  const out = [];
  for (let i = 0; i + n <= list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Kar's nightly ledger (kar-experiments.json entries, or kar-backfold.jsonl records) → action events
 *  { type, at(ms), size }. A record with no usable timestamp is dropped. Total on junk. */
export function actionsFromLedger(records) {
  const list = Array.isArray(records) ? records : (records && Array.isArray(records.entries) ? records.entries : []);
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const type = typeof r.kind === 'string' ? r.kind : (typeof r.stage === 'string' ? r.stage : (typeof r.arm === 'string' ? r.arm : 'action'));
    const at = typeof r.at === 'string' ? Date.parse(r.at) : (Number.isInteger(r.at) ? r.at : NaN);
    if (!Number.isFinite(at)) continue;
    const size = Number.isInteger(r.lines) ? r.lines : (typeof r.note === 'string' ? r.note.length : 1);
    out.push({ type, at, size });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}
