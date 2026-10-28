#!/usr/bin/env node
// witness-all.mjs — the mutation + fuzz gate over the BES layer's decision kernels. Local and CI run the same thing.
// Exit 0 only if every gated kernel is clean (no unreviewed survivors) and none was capped.
//
// Gated here — the pure, total kernels, each a thing a thief with a valid key must beat:
//   bes       — v1: the inward watch (op-mix + rhythm, two-sided, unpoisonable)
//   entropy   — Gary's three domains and S, in nats; the window's symbols; D_KL against the baseline
//   gep       — the decision: E(t), A(t), β|∇S|, ΔS → ALLOW / THROTTLE / STEP_UP / BLOCK / ISOLATE
//   watch     — one identity's online watch: formation, its own bars, quarantine, the stability bound
//   trust     — the three-part identity, observe-only, the tiers switched on one at a time
//   envelope  — the delegation envelope on the wallet kernel; high-stakes never standing; approval binding
//   recovery  — the offline recovery path
//   drivers   — the re-timing fixtures the claims are measured with
//   stack     — the four layers as one door, refusals into immune memory and the tarpit
//   store     — LIGHT-coded local storage of baselines and private streams
//   judge     — the sealed claims (measure/judge.mjs)
//   cost      — the buyer's case from their numbers and sourced prices
// NOT gated, each with its reason: stream.mjs (v1 windowing glue, value-tested); synth.mjs (seeded test data, value-
// tested in drivers.test.mjs; a mutant changes the data, which the synthetic receipt check then catches byte for byte);
// measure/harness.mjs + measure.mjs (orchestration, re-derived end to end by `measure.mjs --synthetic --check`);
// tools/** (local I/O); vendor/** (gated in their own repos, pinned byte-identical by tools/vendor.mjs --check).
//
//   node witness-all.mjs [kernel …] [--receipt]
import { runMutations } from './.witness/witness.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FUZZ = 'test/fuzz-layer.test.mjs';
export const PAIRS = [
  ['bes', 'src/bes.mjs', ['test/bes.test.mjs', 'test/fuzz.test.mjs']],
  ['entropy', 'src/entropy.mjs', ['test/entropy.test.mjs', FUZZ]],
  ['gep', 'src/gep.mjs', ['test/gep.test.mjs', FUZZ]],
  ['watch', 'src/watch.mjs', ['test/watch.test.mjs', 'test/watch2.test.mjs', FUZZ]],
  ['trust', 'src/trust.mjs', ['test/trust.test.mjs', FUZZ]],
  ['envelope', 'src/envelope.mjs', ['test/envelope.test.mjs', FUZZ]],
  ['recovery', 'src/recovery.mjs', ['test/recovery.test.mjs', FUZZ]],
  ['drivers', 'src/drivers.mjs', ['test/drivers.test.mjs', FUZZ]],
  ['stack', 'src/stack.mjs', ['test/stack.test.mjs', 'test/stack2.test.mjs', FUZZ]],
  ['store', 'src/store.mjs', ['test/store.test.mjs', FUZZ]],
  ['judge', 'measure/judge.mjs', ['test/judge.test.mjs', 'test/judge2.test.mjs', FUZZ]],
  ['cost', 'src/cost.mjs', ['test/cost.test.mjs']],
];
const args = process.argv.slice(2);
const RECEIPT = args.includes('--receipt');
const only = args.filter((a) => !a.startsWith('--'));
const unknown = only.filter((n) => !PAIRS.some(([k]) => k === n));
if (unknown.length) { console.log('WITNESS NOT RUN — no kernel named ' + unknown.join(', ') + ' (known: ' + PAIRS.map(([k]) => k).join(', ') + ')'); process.exit(1); }

let allClean = true;
const rows = [];
for (const [name, src, tests] of PAIRS) {
  if (only.length && !only.includes(name)) continue;
  const base = spawnSync('node', ['--test', ...tests], { cwd: HERE, encoding: 'utf8', timeout: 300000 });
  if (base.status !== 0) { console.log('✗ ' + name.padEnd(9) + ' RED BASELINE — its own tests fail on the unmutated code; the gate refuses to judge'); allClean = false; rows.push({ src, killed: 0, total: 0, ignored: 0, survived: 0, clean: false, red: true }); continue; }
  const t0 = Date.now();
  const r = runMutations(join(HERE, src), { cwd: HERE, cap: 5000, timeout: 120000, testCmd: ['node', '--test', ...tests] });
  const secs = Math.round((Date.now() - t0) / 1000);
  const clean = r.clean && !r.capped && r.total > 0;
  rows.push({ src, killed: r.killed, total: r.total, ignored: r.ignored.length, survived: r.survived.length, clean });
  console.log(`${clean ? '✓' : '✗'} ${name.padEnd(9)} ${String(r.killed).padStart(4)}/${String(r.total).padEnd(4)} killed${r.ignored.length ? ` · ${r.ignored.length} reviewed-equivalent` : ''}${r.capped ? ` · CAPPED at ${r.capped}` : ''} · ${secs}s`);
  for (const s of r.survived) console.log(`    SURVIVED line ${s.line}: ${s.mutation} :: ${s.snippet}`);
  if (!clean) allClean = false;
}
const k = rows.reduce((a, r) => a + r.killed, 0), n = rows.reduce((a, r) => a + r.total, 0);
console.log(`\n${allClean ? 'WITNESS CLEAN' : 'WITNESS NOT CLEAN'} — ${k}/${n} mutants killed across ${rows.length} kernel(s)`);
if (RECEIPT && !only.length) writeFileSync(join(HERE, 'receipts/witness.json'), JSON.stringify({ kind: 'bes-inward.witness', v: 2, clean: allClean, killed: k, total: n, kernels: rows }, null, 1) + '\n');
process.exit(allClean ? 0 : 1);
