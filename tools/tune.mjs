#!/usr/bin/env node
// tools/tune.mjs — LOCAL ONLY. Picks the watcher's numbers on DEV data (and reports the synthetic mirror), never test.
// The objective was sealed before this file existed (measure/claims.json "seal2"): on dev, a false-positive rate at
// most 0.5% for simon and kar-session, then the most driver sessions caught on dev. Every event at or after a stream's
// test start is dropped BEFORE anything else reads the stream.
//
// FALLBACK (fixed 2026-10-28 BEFORE the grid first ran to completion, disclosed in seal 2): if no configuration meets
// 0.5% on both, choose the one with the smallest LARGER of the two dev FP rates; among those within 0.1 percentage
// point of it, the most driver sessions caught; then the earlier in grid order.
//
//   node tools/tune.mjs      → prints the grid, writes ~/.si-didy/bes/private/tune.json (the full grid) and the
//                              chosen numbers to params.json in the repo (numbers only — no data)
import { readFileSync, writeFileSync } from 'node:fs';
import { unpack } from '../src/store.mjs';
import { online, firstCatch, injections, fpOf } from '../measure/harness.mjs';
import { run, cadence, burst, uniform, shuffled } from '../src/drivers.mjs';

const PRIV = 'C:/Users/sjgan/.si-didy/bes/private/';
const man = JSON.parse(readFileSync(PRIV + 'manifest.json', 'utf8'));
const load = (name) => {
  const s = man.streams[name], cut = Date.parse(s.testStart);
  const u = unpack(new Uint8Array(readFileSync(PRIV + name + '.light')));
  if (!u.ok) throw new Error(name + ': ' + u.why);
  return { all: u.value.filter((e) => e.t < cut), from: Date.parse(s.formationEnd), to: cut };
};
const S = { simon: load('simon'), 'kar-session': load('kar-session') };

const DRIVERS = {
  simon: { level: 'stepUp', d: { cadence: (r, t) => cadence(r, t, 60000), burst: (r, t) => burst(r, t, 500), uniform: (r, t, i) => uniform(r, t, 7000 + i) } },
  'kar-session': { level: 'block', d: { cadence: (r, t) => cadence(r, t, 60000), burst: (r, t) => burst(r, t, 500), uniform: (r, t, i) => uniform(r, t, 7000 + i), shuffled: (r, t, i) => shuffled(r, t, 8000 + i) } },
};

function evaluate(P) {
  const res = { P, streams: {} };
  for (const [name, s] of Object.entries(S)) {
    const inj = injections(s.from, s.to, 20);
    const t0 = Date.now();
    const on = online(s.all, P, inj);
    const fp = fpOf(on.outs, s.from, s.to);
    const devEvents = s.all.filter((e) => e.t >= s.from);
    const caught = {};
    for (const [dn, drv] of Object.entries(DRIVERS[name].d)) {
      caught[dn] = on.snaps.filter((sn, i) => {
        const later = devEvents.filter((e) => e.t >= sn.t);
        const sess = drv(run(later.length >= 30 ? later : devEvents, 30, 5000 + i), sn.t, i);
        const c = firstCatch(sn.w, sess, P, 10);
        return c[DRIVERS[name].level] !== null;
      }).length;
    }
    res.streams[name] = { fp: { judged: fp.judged, fp: fp.fp, rate: +fp.rate.toFixed(5) }, shiftPrompts: on.shifts.length, caught, secs: Math.round((Date.now() - t0) / 1000) };
  }
  res.ok = Object.values(res.streams).every((x) => x.fp.rate <= 0.005);
  res.score = Object.values(res.streams).reduce((a, x) => a + Object.values(x.caught).reduce((b, c) => b + c, 0), 0);
  return res;
}

const GRID = [];
for (const W of [10, 20]) for (const m of [1.25, 1.5, 2, 3]) for (const barAlpha of [0.05, 0.2]) GRID.push({ W, mEps: m, mKl: m, mGrad: m, barAlpha });

const rows = [];
for (const P of GRID) {
  const r = evaluate(P);
  rows.push(r);
  console.log((r.ok ? '✓' : '·') + ' ' + JSON.stringify(P).padEnd(64) + ' score ' + String(r.score).padStart(3) + '  ' + Object.entries(r.streams).map(([n, x]) => n + ' FP ' + (x.fp.rate * 100).toFixed(2) + '% (' + x.fp.fp + '/' + x.fp.judged + ') caught ' + JSON.stringify(x.caught) + ' ' + x.secs + 's').join(' | '));
}
const worstFp = (r) => Math.max(...Object.values(r.streams).map((x) => x.fp.rate));
const met = rows.filter((r) => r.ok);
const floor = Math.min(...rows.map(worstFp));
const ok = met.length ? met.slice().sort((a, b) => b.score - a.score) : rows.filter((r) => worstFp(r) <= floor + 0.001).sort((a, b) => b.score - a.score);
const rule = met.length ? 'objective met: dev FP ≤ 0.5% on both, then most caught' : 'FALLBACK: no configuration met 0.5% on both — smallest larger dev FP (' + (floor * 100).toFixed(2) + '%), within 0.1 point, most caught';
writeFileSync(PRIV + 'tune.json', JSON.stringify({ kind: 'bes-layer.tune', v: 1, objective: 'dev FP ≤ 0.5% for simon and kar-session, then most driver sessions caught on dev', rows }, null, 1));
if (ok.length === 0) { console.log('\nNO configuration meets the dev FP objective — nothing chosen, params.json not written'); process.exit(1); }
const best = ok[0];
writeFileSync(new URL('../params.json', import.meta.url), JSON.stringify({ kind: 'bes-layer.params', v: 1, chosenBy: 'tools/tune.mjs on dev data only (objective sealed in measure/claims.json seal2)', rule, params: best.P, dev: Object.fromEntries(Object.entries(best.streams).map(([n, x]) => [n, { fpRate: x.fp.rate, shiftPrompts: x.shiftPrompts, caught: x.caught }])) }, null, 1) + '\n');
console.log('\nCHOSEN ' + JSON.stringify(best.P) + ' score ' + best.score);
