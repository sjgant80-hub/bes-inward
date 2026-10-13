#!/usr/bin/env node
// attack-kit/redteam.mjs — the BES finding, reproduced: the operator's own varied behaviour passes (low false
// positive), while an impostor fails one of exactly two ways — overly REGULAR (scripted) or RANDOMLY UNCORRELATED
// (a hijack with a different op-mix). And the baseline cannot be poisoned (only allowed windows fold in).
//   node attack-kit/redteam.mjs           write receipts/redteam.json
//   node attack-kit/redteam.mjs --check   regenerate and demand it is byte-identical
// Deterministic (seeded streams) → reproducible.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signature, judge, fold, emptyBaseline, divergence, DEFAULTS } from '../src/bes.mjs';
import { windows } from '../src/stream.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'receipts', 'redteam.json');
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const OPS = ['build', 'gate', 'commit', 'memory', 'model'];
const WEIGHTS = [30, 25, 15, 15, 15];                                // Kar's rough op-mix (sums to 100)
const pickOp = (r) => { let x = Math.floor(r() * 100), i = 0; while (x >= WEIGHTS[i] && i < WEIGHTS.length - 1) { x -= WEIGHTS[i]; i++; } return OPS[i]; };

// a stream of N events in the operator's own style: Kar's op-mix, IRREGULAR rhythm (gaps 60..300)
function operatorStream(n, seed) { const r = rng(seed); let at = 0; const out = []; for (let i = 0; i < n; i++) { at += 60 + Math.floor(r() * 240); out.push({ type: pickOp(r), at, size: 1 + Math.floor(r() * 40) }); } return out; }
// scripted: the operator's op-mix but CLOCKWORK rhythm (constant 100ms gaps)
function scriptedStream(n, seed) { const r = rng(seed); let at = 0; const out = []; for (let i = 0; i < n; i++) { at += 100; out.push({ type: pickOp(r), at, size: 20 }); } return out; }
// hijack: a DIFFERENT op-mix (exfil/escalate/scan), irregular rhythm — a run that is not the operator
function hijackStream(n, seed) { const r = rng(seed); const H = ['exfil', 'escalate', 'scan']; let at = 0; const out = []; for (let i = 0; i < n; i++) { at += 60 + Math.floor(r() * 240); out.push({ type: H[Math.floor(r() * H.length)], at, size: 1 + Math.floor(r() * 40) }); } return out; }

const W = DEFAULTS.window;
// learn the operator's baseline over 12 of its own windows (each allowed → folded in)
let baseline = emptyBaseline();
const learn = windows(operatorStream(W * 12, 1001), W);
for (const win of learn) { const sig = signature(win); const v = judge(sig, baseline, {}); if (v.ok) baseline = fold(baseline, sig); }

const cases = [];
const add = (name, tried, got, ok) => cases.push({ name, tried, got, held: ok === true });

// held-out operator windows → ALLOW (low false positive on the operator's own variation)
const heldout = windows(operatorStream(W * 6, 2002), W).map((win) => judge(signature(win), baseline, {}));
const opAllowed = heldout.filter((v) => v.level === 'ALLOW').length;
add('the operator\'s own varied behaviour is allowed (low false positive)', heldout.length + ' held-out operator windows', opAllowed + '/' + heldout.length + ' allowed', opAllowed === heldout.length);

// scripted automation → FLAG "too regular"
const scr = judge(signature(scriptedStream(W, 3003)), baseline, {});
add('scripted automation is flagged as too regular', 'the operator\'s op-mix but clockwork rhythm', scr.level + ': ' + scr.reason.slice(0, 40), scr.level === 'FLAG' && /regular/.test(scr.reason));

// a hijack (different op-mix) → FLAG "unlike the operator"
const hj = judge(signature(hijackStream(W, 4004)), baseline, {});
add('a hijack with a different op-mix is flagged as unlike the operator', 'exfil/escalate/scan instead of build/gate/...', hj.level + ': drift ' + hj.divergence + '‰', hj.level === 'FLAG' && /unlike/.test(hj.reason));

// the baseline cannot be POISONED — feeding impostor windows changes nothing, because only ALLOWED windows fold
const before = JSON.stringify(baseline.mix);
let poisoned = baseline;
for (const win of [...windows(scriptedStream(W * 4, 5005), W), ...windows(hijackStream(W * 4, 6006), W)]) { const sig = signature(win); const v = judge(sig, poisoned, {}); if (v.ok) poisoned = fold(poisoned, sig); }   // the runner's rule: fold only if allowed
add('the baseline cannot be poisoned by impostor windows (negative selection)', '8 scripted + hijack windows offered to the baseline', JSON.stringify(poisoned.mix) === before ? 'baseline unchanged' : 'baseline MOVED', JSON.stringify(poisoned.mix) === before);

// before calibration, it does not flag the operator (it is still learning)
const fresh = judge(signature(operatorStream(W, 7007)), emptyBaseline(), {});
add('while still learning the operator, it calibrates rather than flags', 'an empty baseline', fresh.level, fresh.level === 'CALIBRATING');

// totally malformed input flags, never throws
add('a malformed signature flags, never throws (fail-closed)', 'judge(junk)', (() => { try { return judge(null, baseline, {}).level; } catch { return 'THREW'; } })(), judge(null, baseline, {}).level === 'FLAG');

const held = cases.every((c) => c.held);
const result = { kind: 'bes-inward-redteam', v: 1, rule: 'the operator\'s own varied behaviour passes; an impostor fails by being too regular or uncorrelated; the baseline cannot be poisoned', cases: cases.length, held,
  baseline: { windows: baseline.count, variability: baseline.variability }, results: cases };
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
const text = canonical(result) + '\n';
if (process.argv.includes('--check')) {
  const committed = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (committed !== text) { console.error('the receipt does NOT reproduce'); process.exit(1); }
  console.log('REPRODUCED — ' + result.cases + ' cases, all held: ' + result.held); process.exit(result.held ? 0 : 1);
}
mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, text);
for (const c of cases) console.log((c.held ? 'HELD  ' : 'BROKE ') + c.name.slice(0, 62).padEnd(64) + ' → ' + c.got);
console.log('\n' + (held ? 'behaviour is authoritative' : 'A CASE BROKE') + ' — ' + cases.length + ' cases → receipts/redteam.json');
process.exit(held ? 0 : 1);
