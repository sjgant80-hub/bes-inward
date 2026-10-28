#!/usr/bin/env node
// measure/measure.mjs — measures the sealed claims (measure/claims.json @65a6364) with the frozen params (params.json).
// Written after the seal; refuses to run if the claims differ from the seal, or if params or kernels are uncommitted.
//
//   node measure/measure.mjs --synthetic          the synthetic mirror → receipts/synthetic.json (CI re-derives it
//                                                 byte for byte: --synthetic --check)
//   node measure/measure.mjs --real               LOCAL ONLY: the private streams (~/.si-didy/bes/private/) → the
//                                                 public aggregate receipts/real.json (counts and rates only, plus the
//                                                 SHA-256 of each private stream) and a private detail file
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { online, firstCatch, injections, fpOf } from './harness.mjs';
import { judge, SEAL } from './judge.mjs';
import { run, cadence, burst, uniform, shuffled, borrowed, mimic } from '../src/drivers.mjs';
import { human, night, session } from '../src/synth.mjs';
import { unpack } from '../src/store.mjs';
import { rank } from '../src/gep.mjs';
import { trust } from '../src/trust.mjs';
import { envelopeBody, materialOf, approvalMaterialOf, approvalFor, admits } from '../src/envelope.mjs';
import { recoveryBody, recoveryMaterialOf, applyRecovery } from '../src/recovery.mjs';
import { makeIdentity, verifyBytes } from '../vendor/fall-kit-core/identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000, N = 20, LEN = 30, WITHIN = 10;
const ALL_TIERS = ['THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE'];
const mode = process.argv.includes('--real') ? 'real' : 'synthetic';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();

// ── the order proof: the claims are the sealed ones, and what measures them is committed ──
const sealed = git('show', SEAL + ':measure/claims.json');
if (sealed !== readFileSync(join(ROOT, 'measure/claims.json'), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('REFUSED: measure/claims.json differs from the seal ' + SEAL); process.exit(1); }
const dirty = git('status', '--porcelain', '--', 'params.json', 'src', 'measure', 'vendor');
if (mode === 'real' && dirty) { console.error('REFUSED: params, kernels or the measuring code are not committed:\n' + dirty); process.exit(1); }
const PARAMS = JSON.parse(readFileSync(join(ROOT, 'params.json'), 'utf8'));
const P = PARAMS.params;
const commit = git('rev-parse', 'HEAD');

const enc = new TextEncoder();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const VERB = (k) => { const s = String(k); if (s.startsWith('sh:') || s.startsWith('bash:')) return 'run'; if (['edit', 'write', 'notebookedit'].includes(s)) return 'edit'; if (['read', 'grep', 'glob'].includes(s)) return 'read'; if (['browser', 'web', 'agent', 'message', 'artifact'].includes(s)) return { browser: 'browse', web: 'web', agent: 'delegate', message: 'message', artifact: 'artifact' }[s]; if (s === 'local-model') return 'local'; return 'tool'; };
const SCOPE = ['run', 'edit', 'read', 'browse', 'web', 'delegate', 'local', 'message', 'artifact', 'tool'];

// ── the streams and their splits ──
function load() {
  if (mode === 'synthetic') {
    const start = Date.UTC(2026, 6, 20), end = start + 70 * DAY, testStart = start + 42 * DAY;
    const mk = (xs) => ({ all: xs.filter((e) => e.t < end), formationEnd: xs[0].t + 14 * DAY, testStart, cutoff: end });
    return { streams: { simon: mk(human({ seed: 7, start, days: 70 })), 'kar-session': mk(session({ seed: 13, start, days: 70 })), 'kar-night': mk(night({ seed: 11, start, days: 70 })) }, provenance: { kind: 'synthetic', seeds: { simon: 7, 'kar-session': 13, 'kar-night': 11 }, start: new Date(start).toISOString(), days: 70 } };
  }
  const PRIV = 'C:/Users/sjgan/.si-didy/bes/private/';
  const man = JSON.parse(readFileSync(PRIV + 'manifest.json', 'utf8'));
  const cutoff = Date.parse(man.cutoff), streams = {}, hashes = {};
  for (const name of ['simon', 'kar-session', 'kar-night']) {
    const bytes = readFileSync(PRIV + name + '.light');
    hashes[name] = sha(bytes);
    if (hashes[name] !== man.streams[name].sha256) { console.error('REFUSED: ' + name + ' does not match its manifest'); process.exit(1); }
    const u = unpack(new Uint8Array(bytes));
    if (!u.ok) { console.error('REFUSED: ' + name + ': ' + u.why); process.exit(1); }
    streams[name] = { all: u.value.filter((e) => e.t < cutoff), formationEnd: Date.parse(man.streams[name].formationEnd), testStart: Date.parse(man.streams[name].testStart), cutoff };
  }
  return { streams, provenance: { kind: 'real', privateStreamsSha256: hashes, cutoff: man.cutoff } };
}

const { streams: S, provenance } = load();
const t0 = Date.now();
const runs = {}, facts = {}, notes = {};
for (const [name, s] of Object.entries(S)) {
  const inj = injections(s.testStart, s.cutoff, N);
  const on = online(s.all, P, inj);
  runs[name] = { ...s, inj, on, test: s.all.filter((e) => e.t >= s.testStart) };
}

// drivers: sessions from each injection snapshot, shapes drawn from the identity's real test actions
function sessions(name, make, level, seedBase) {
  const R = runs[name], firsts = [];
  let caught = 0;
  R.on.snaps.forEach((sn, i) => {
    const sess = make(R, sn.t, i, seedBase + i);
    const c = firstCatch(sn.w, sess, P, WITHIN);
    if (c[level] !== null) { caught++; firsts.push(c[level]); }
  });
  return { caught, sessions: R.on.snaps.length, medianFirst: median(firsts) };
}
const shapes = (R, seed) => run(R.test, LEN, seed);
const DRV = {
  cadence: (R, t, i, seed) => cadence(shapes(R, seed), t, 60000),
  burst: (R, t, i, seed) => burst(shapes(R, seed), t, 500),
  uniform: (R, t, i, seed) => uniform(shapes(R, seed), t, seed + 50000),
  shuffled: (R, t, i, seed) => shuffled(shapes(R, seed), t, seed + 60000),
};
facts.B1 = { simon: Object.fromEntries(['cadence', 'burst', 'uniform'].map((d, k) => [d, sessions('simon', DRV[d], 'stepUp', 1000 + 100 * k)])) };
facts.B2 = {};
for (const name of ['kar-session', 'kar-night']) facts.B2[name] = Object.fromEntries(['cadence', 'burst', 'uniform', 'shuffled'].map((d, k) => [d, sessions(name, DRV[d], 'block', 2000 + 100 * k)]));
const after = (name, t) => runs[name].all.filter((e) => e.t >= t).slice(0, LEN);
facts.B6 = {
  a: sessions('simon', (R, t, i, seed) => borrowed(shapes(R, seed), after('kar-night', t), t), 'stepUp', 6000),
  b: sessions('kar-session', (R, t, i, seed) => borrowed(shapes(R, seed), after('simon', t), t), 'stepUp', 6100),
};
facts.L1 = { simon: sessions('simon', (R, t) => mimic(R.all, t, LEN), 'stepUp', 7000) };

// FP on every test action the watcher had formed on
facts.B4 = { simon: null };
facts.B5 = {};
const episodes = (outs) => { let n = 0, inRun = false; for (const o of outs) { const f = o.formed && rank(o.raw) >= 2; if (f && !inRun) n++; inRun = f; } return n; };
for (const name of Object.keys(runs)) {
  const R = runs[name];
  const fp = fpOf(R.on.outs, R.testStart, R.cutoff);
  const testOuts = R.on.outs.filter((o) => o.t >= R.testStart);
  const tally = {};
  for (const o of testOuts.filter((x) => x.formed)) tally[o.raw] = (tally[o.raw] || 0) + 1;
  const rec = { judged: fp.judged, fp: fp.fp, forming: fp.forming, actions: fp.actions, tally, episodes: episodes(testOuts), shiftPrompts: R.on.shifts.filter((t) => t >= R.testStart).length, rows: fp.rows };
  if (name === 'simon') facts.B4.simon = rec; else facts.B5[name] = rec;
}

// B3 + B6(c): the envelope, with real Ed25519 keys made from fixed seeds
const id = (b) => makeIdentity(new Uint8Array(32).fill(b));
const simon = await id(0x51), kar = await id(0x4b), other = await id(0x4f), recoveryKey = await id(0x52);
const signHex = async (who, s) => Array.from(await who.sign(enc.encode(s)), (x) => x.toString(16).padStart(2, '0')).join('');
const unhexU8 = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
const verifyHex = (key, s, sigHex) => verifyBytes(key, enc.encode(s), unhexU8(sigHex));
const KS = runs['kar-session'];
const envBody = envelopeBody({ issuer: simon.id, holder: kar.id, scope: SCOPE, budget: 1000, notBefore: KS.testStart, notAfter: KS.cutoff + DAY, nonce: 'env-measure-b3' }).body;
const envSig = await signHex(simon, materialOf(envBody));
const sigOk = await verifyHex(simon.id, materialOf(envBody), envSig);
const forgedSig = await signHex(other, materialOf(envBody));
const forgedOk = await verifyHex(simon.id, materialOf(envBody), forgedSig);
const tamperedBody = { ...envBody, budget: 999999 };
const tamperedOk = await verifyHex(simon.id, materialOf(tamperedBody), envSig);
const apBody = { kind: 'bes-approval', itemId: 'item-b3', textSha256: sha('send the agreed quote'), by: simon.id, at: KS.testStart, expires: KS.cutoff + DAY };
const approvals = [{ body: apBody, sigOk: await verifyHex(simon.id, approvalMaterialOf(apBody), await signHex(simon, approvalMaterialOf(apBody))) }];
const envOf = (b) => ({ body: b });
const ctx = (o) => ({ simon: simon.id, holder: kar.id, sigOk, spent: 0, revoked: [], ...o });
const testIdx = KS.on.outs.map((o, i) => [o, i]).filter(([o]) => o.t >= KS.testStart && o.formed);
const allowed = testIdx.filter(([o]) => o.raw === 'ALLOW').map(([, i]) => KS.all[i]);
const picked = run(allowed, 20, 3000);
let blocked = 0, total = 0, validPassed = 0;
const faults = {};
for (const e of picked) {
  const a = { verb: VERB(e.kind), t: e.t, cost: 1 };
  if (admits(envOf(envBody), a, ctx()).ok) validPassed++;
  const cases = {
    scope: [envOf(envBody), { ...a, verb: 'deploy' }, ctx()],
    budget: [envOf(envBody), a, ctx({ spent: 1000 })],
    window: [envOf(envBody), { ...a, t: envBody.notBefore - 1 }, ctx()],
    expiry: [envOf(envBody), { ...a, t: envBody.notAfter }, ctx()],
    revoked: [envOf(envBody), a, ctx({ revoked: [envBody.nonce] })],
    'high-stakes': [envOf(envBody), { ...a, verb: 'money' }, ctx({ approval: null })],
    'not-simon': [envOf(envBody), a, ctx({ sigOk: forgedOk })],
    tampered: [envOf(tamperedBody), a, ctx({ sigOk: tamperedOk })],
    'words-changed': [envOf(envBody), { ...a, verb: 'deal' }, ctx({ approval: approvalFor('item-b3', sha('send the agreed quote, now with a discount'), approvals, { simon: simon.id, now: a.t }) })],
  };
  for (const [k, [en, ac, cx]] of Object.entries(cases)) {
    total++;
    const tv = trust({ actor: 'kar', credential: true, bes: { raw: 'ALLOW', observing: false }, envelope: admits(en, ac, cx), tiers: ALL_TIERS });
    if (tv.raw === 'BLOCK') { blocked++; faults[k] = (faults[k] || 0) + 1; }
  }
}
facts.B3 = { blocked, total, validPassed, validTotal: picked.length, faultsBlocked: faults, envelopeSignatureVerifies: sigOk };
let raised = 0, consider = 0;
for (const [o, i] of testIdx) {
  if (rank(o.raw) < 1) continue;
  consider++;
  const e = KS.all[i];
  const tv = trust({ actor: 'kar', credential: true, bes: { raw: o.raw, observing: false }, envelope: admits(envOf(envBody), { verb: VERB(e.kind), t: e.t, cost: 1 }, ctx()), tiers: ALL_TIERS });
  if (rank(tv.raw) >= 2) raised++;
}
facts.B6.c = { raised, total: consider };

// B7: formation enforces nothing; the offline recovery path
facts.B7 = { formation: {}, recovery: { passed: 0, total: 0, cases: {} } };
for (const name of Object.keys(runs)) {
  const R = runs[name];
  const form = R.on.outs.filter((o) => o.t < R.formationEnd);
  facts.B7.formation[name] = { actions: form.length, enforcedNotAllow: form.filter((o) => o.enforced !== 'ALLOW').length };
}
for (const name of Object.keys(runs)) {
  const R = runs[name], daily = name === 'simon' ? simon : kar;
  const w = { ...R.on.w, id: name, held: { verdict: 'BLOCK', at: R.cutoff } };
  const good = recoveryBody({ identity: name, act: 'observe', nonce: 'rec-' + name + '-0001', at: R.cutoff, by: recoveryKey.id }).body;
  const goodOk = await verifyHex(recoveryKey.id, recoveryMaterialOf(good), await signHex(recoveryKey, recoveryMaterialOf(good)));
  const dailyBody = { ...good, by: daily.id };
  const dailyOk = await verifyHex(daily.id, recoveryMaterialOf(dailyBody), await signHex(daily, recoveryMaterialOf(dailyBody)));
  const tampered = { ...good, at: good.at + 1 };
  const tamperedOk2 = await verifyHex(recoveryKey.id, recoveryMaterialOf(tampered), await signHex(recoveryKey, recoveryMaterialOf(good)));
  const c = { recoveryKey: recoveryKey.id, dailyKey: daily.id, now: R.cutoff };
  const r1 = applyRecovery(w, { body: good }, { ...c, sigOk: goodOk, used: [] });
  const r2 = applyRecovery(w, { body: dailyBody }, { ...c, sigOk: dailyOk, used: [] });
  const r3 = applyRecovery(w, { body: good }, { ...c, sigOk: goodOk, used: r1.used });
  const r4 = applyRecovery(w, { body: tampered }, { ...c, sigOk: tamperedOk2, used: [] });
  const res = { lifts: r1.ok && r1.w.held === null && r1.w.observeUntil === R.cutoff + DAY, dailyRefused: !r2.ok, replayRefused: !r3.ok, tamperRefused: !r4.ok && /verify/.test(r4.why) };
  facts.B7.recovery.cases[name] = res;
  for (const v of Object.values(res)) { facts.B7.recovery.total++; if (v) facts.B7.recovery.passed++; }
}

const verdicts = judge(facts);
const round = (x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1e6) / 1e6 : x);
const clean = (v) => (Array.isArray(v) ? v.map(clean) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : round(v));
const receipt = clean({
  kind: 'bes-layer.receipt', v: 1, data: mode, sealedClaims: SEAL, params: P, paramsRule: PARAMS.rule, measuredAt: mode === 'synthetic' ? null : commit,
  provenance, streams: Object.fromEntries(Object.entries(runs).map(([n, R]) => [n, { actions: R.all.length, test: R.test.length, formed: R.on.w.formed }])),
  facts, verdicts, held: Object.values(verdicts).filter((v) => v.held).length, of: Object.keys(verdicts).length,
});
const text = JSON.stringify(receipt, null, 1) + '\n';
if (mode === 'synthetic') {
  const path = join(ROOT, 'receipts/synthetic.json');
  if (process.argv.includes('--check')) {
    const was = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    if (was !== text) { console.error('SYNTHETIC RECEIPT DRIFT — receipts/synthetic.json is not what the code makes'); process.exit(1); }
    console.log('SYNTHETIC RECEIPT REPRODUCED byte for byte — ' + receipt.held + ' of ' + receipt.of + ' held');
  } else { writeFileSync(path, text); console.log('wrote receipts/synthetic.json'); }
} else {
  const priv = 'C:/Users/sjgan/.si-didy/bes/private/real-detail.json';
  const detail = JSON.stringify({ receipt, perStream: Object.fromEntries(Object.entries(runs).map(([n, R]) => [n, { outs: R.on.outs.filter((o) => o.t >= R.testStart).map((o) => [o.raw, o.row, o.part]) }])) });
  mkdirSync(dirname(priv), { recursive: true });
  writeFileSync(priv, detail);
  receipt.privateDetailSha256 = sha(detail);
  writeFileSync(join(ROOT, 'receipts/real.json'), JSON.stringify(receipt, null, 1) + '\n');
  console.log('wrote receipts/real.json (aggregate only) and the private detail');
}
for (const [k, v] of Object.entries(verdicts)) console.log((v.held ? 'HELD   ' : 'FAILED ') + k + ' — ' + v.why);
console.log(receipt.held + ' of ' + receipt.of + ' held · ' + Math.round((Date.now() - t0) / 1000) + ' s');
