#!/usr/bin/env node
// witness-all.mjs — the mutation + fuzz gate over the BES decision kernel.
//   bes — signature / divergence / fold / judge: how a window is measured and judged against the operator's baseline.
// stream.mjs is windowing + ledger parsing (I/O shaping, no decision) — value-tested, not mutation-gated.
import { runMutations } from './.witness/witness.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
export const PAIRS = [['src/bes.mjs', ['test/bes.test.mjs', 'test/fuzz.test.mjs']]];
const only = process.argv.slice(2);
let allClean = true; const rows = [];
for (const [src, tests] of PAIRS) {
  if (only.length && !only.includes(src)) continue;
  const t0 = Date.now();
  const r = runMutations(join(HERE, src), { cwd: HERE, cap: 5000, timeout: 60000, testCmd: ['node', '--test', ...tests] });
  rows.push(r);
  console.log(`${r.clean && !r.capped ? '✓' : '✗'} ${src.padEnd(12)} ${String(r.killed).padStart(3)}/${String(r.total).padEnd(3)} killed${r.ignored.length ? ` · ${r.ignored.length} reviewed-equivalent` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const s of r.survived) console.log(`    SURVIVED line ${s.line}: ${s.mutation} :: ${s.snippet}`);
  if (!r.clean || r.capped) allClean = false;
}
const k = rows.reduce((a, r) => a + r.killed, 0), n = rows.reduce((a, r) => a + r.total, 0);
console.log(`\n${allClean ? 'WITNESS CLEAN' : 'WITNESS NOT CLEAN'} — ${k}/${n} mutants killed`);
process.exit(allClean ? 0 : 1);
