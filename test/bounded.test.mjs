// bounded.test.mjs — the page says each identity's watch is bounded, not a log: it grows until its calibration buffer
// holds maxCal samples, then its stored size levels off and does not grow with history. This checks that claim on the
// synthetic owner with the frozen params, answering every step-up as tools/live.mjs does: a history long enough to
// fill the buffer, and one four times as long.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { human } from '../src/synth.mjs';
import { emptyWatcher, step, confirm, confirmShift, paramsOf } from '../src/watch.mjs';
import { rank } from '../src/gep.mjs';
import { pack } from '../src/store.mjs';

const P = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8')).params;
const PW = paramsOf(P);
const START = Date.UTC(2026, 6, 20);
const calOf = (w) => w.cal.chunks.reduce((s, c) => s + c.length, 0);

function grow(days) {
  let w = emptyWatcher('identity'), fullAt = null;
  const most = { window: 0, times: 0, quar: 0, cal: 0 };
  for (const e of human({ seed: 7, start: START, days })) {
    const r = step(w, e, P); w = r.w;
    if (r.out.formed && rank(r.out.raw) >= 2) w = confirm(w, P);
    if (w.pendingShift) w = confirmShift(w, P);
    most.window = Math.max(most.window, w.window.length);
    most.times = Math.max(most.times, w.times.length);
    most.quar = Math.max(most.quar, w.quar.length);
    most.cal = Math.max(most.cal, calOf(w));
    if (fullAt === null && calOf(w) >= PW.maxCal) fullAt = w.n;
  }
  const p = pack(w);
  assert.ok(p.ok, 'the watch packs to LIGHT');
  return { w, most, fullAt, bytes: p.bytes.length };
}

test('the watch is bounded: once its calibration buffer is full, its stored size does not grow with history', () => {
  const short = grow(168), long = grow(672);
  assert.ok(short.w.formed && long.w.formed, 'both formed');
  assert.ok(short.fullAt !== null, 'the shorter history fills the calibration buffer');
  assert.ok(long.w.n > 4 * short.w.n * 0.9, 'the long history really is about four times longer: ' + long.w.n + ' vs ' + short.w.n);
  for (const r of [short, long]) {
    assert.ok(r.most.window <= PW.W, 'window ≤ W');
    assert.ok(r.most.times <= 64, 'times ≤ 64');
    assert.ok(r.most.quar <= PW.maxQuar, 'quarantine ≤ maxQuar');
    assert.ok(r.most.cal <= PW.maxCal, 'calibration samples ≤ maxCal');
  }
  assert.ok(long.bytes <= 1.05 * short.bytes, 'stored size levels off: ' + long.bytes + ' bytes after ' + long.w.n + ' actions vs ' + short.bytes + ' after ' + short.w.n);
});
