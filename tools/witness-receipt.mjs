#!/usr/bin/env node
// tools/witness-receipt.mjs — receipts/witness.json from a CI gate run's own log (GitHub's runner ran the witness, one
// job per kernel). Parsed, never typed: the run id is recorded so the receipt can be checked against the run.
//
//   node tools/witness-receipt.mjs <run-id>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const id = process.argv[2];
if (!/^\d+$/.test(String(id))) { console.error('usage: node tools/witness-receipt.mjs <run-id>'); process.exit(1); }
const meta = JSON.parse(execFileSync('gh', ['run', 'view', id, '-R', 'sjgant80-hub/bes-inward', '--json', 'headSha,conclusion,url'], { encoding: 'utf8' }));
const log = execFileSync('gh', ['run', 'view', id, '-R', 'sjgant80-hub/bes-inward', '--log'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const SRC = { bes: 'src/bes.mjs', entropy: 'src/entropy.mjs', gep: 'src/gep.mjs', watch: 'src/watch.mjs', trust: 'src/trust.mjs', envelope: 'src/envelope.mjs', recovery: 'src/recovery.mjs', drivers: 'src/drivers.mjs', stack: 'src/stack.mjs', store: 'src/store.mjs', judge: 'measure/judge.mjs', cost: 'src/cost.mjs' };
const kernels = [];
for (const m of log.matchAll(/([✓✗]) (\w+)\s+(\d+)\/(\d+)\s+killed(?: · (\d+) reviewed-equivalent)?/g)) {
  const [, mark, name, killed, total, ign] = m;
  if (!SRC[name] || kernels.some((k) => k.src === SRC[name])) continue;
  kernels.push({ src: SRC[name], killed: +killed, total: +total, ignored: +(ign || 0), survived: mark === '✓' ? 0 : +total - +killed - +(ign || 0), clean: mark === '✓' });
}
const killed = kernels.reduce((a, k) => a + k.killed, 0), total = kernels.reduce((a, k) => a + k.total, 0);
const out = { kind: 'bes-inward.witness', v: 2, run: meta.url, commit: meta.headSha, conclusion: meta.conclusion, clean: kernels.length === Object.keys(SRC).length && kernels.every((k) => k.clean), killed, total, kernels };
writeFileSync(new URL('../receipts/witness.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log((out.clean ? 'WITNESS CLEAN' : 'WITNESS NOT CLEAN') + ' — ' + killed + '/' + total + ' across ' + kernels.length + ' kernels · ' + meta.url);
for (const k of kernels) console.log('  ' + (k.clean ? '✓' : '✗') + ' ' + k.src.padEnd(20) + k.killed + '/' + k.total + (k.ignored ? ' · ' + k.ignored + ' argued equivalent' : ''));
