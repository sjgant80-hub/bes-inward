#!/usr/bin/env node
// run.mjs — watch Kar behave, learn his baseline, then catch an impostor by behaviour alone.
//   node run.mjs
// Learns the operator's behavioural signature from his own varied action windows, then shows that his own
// held-out behaviour passes while a scripted run (too regular) and a hijack (different op-mix) both flag —
// without any credential changing hands. Gary W. Floyd's BES, turned inward on the running body itself.
import { signature, judge, fold, emptyBaseline, DEFAULTS } from './src/bes.mjs';
import { windows } from './src/stream.mjs';

const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const OPS = ['build', 'gate', 'commit', 'memory', 'model'], WEIGHTS = [30, 25, 15, 15, 15];
const pickOp = (r) => { let x = Math.floor(r() * 100), i = 0; while (x >= WEIGHTS[i] && i < WEIGHTS.length - 1) { x -= WEIGHTS[i]; i++; } return OPS[i]; };
const operator = (n, seed) => { const r = rng(seed); let at = 0; return Array.from({ length: n }, () => { at += 60 + Math.floor(r() * 240); return { type: pickOp(r), at, size: 1 }; }); };
const scripted = (n, seed) => { const r = rng(seed); let at = 0; return Array.from({ length: n }, () => { at += 100; return { type: pickOp(r), at, size: 1 }; }); };
const hijack = (n, seed) => { const r = rng(seed); const H = ['exfil', 'escalate', 'scan']; let at = 0; return Array.from({ length: n }, () => { at += 60 + Math.floor(r() * 240); return { type: H[Math.floor(r() * 3)], at, size: 1 }; }); };

const W = DEFAULTS.window;
let baseline = emptyBaseline();
console.log('\nBES INWARD — behaviour is authoritative (Gary W. Floyd, GEP-Based Security)\n');
console.log('learning the operator\'s behavioural signature from his own action windows:');
for (const win of windows(operator(W * 12, 1001), W)) { const s = signature(win); const v = judge(s, baseline, {}); if (v.ok) { baseline = fold(baseline, s); } }
console.log(`  baseline set over ${baseline.count} windows · op-mix ${JSON.stringify(baseline.mix)} · rhythm ${baseline.variability}‰\n`);

const show = (label, events) => { const v = judge(signature(events), baseline, {}); console.log(`  ${v.ok ? 'ALLOW ' : 'FLAG  '} ${label.padEnd(34)} → ${v.level}: ${v.reason}`); };
show('the operator, another day', operator(W, 2002));
show('the operator, another day', operator(W, 2222));
show('a scripted bot (his op-mix, clockwork)', scripted(W, 3003));
show('a hijacked run (different op-mix)', hijack(W, 4004));

console.log('\nnobody showed a bad credential. the scripted run and the hijack were caught by how they BEHAVE.');
console.log('proof: node attack-kit/redteam.mjs --check\n');
