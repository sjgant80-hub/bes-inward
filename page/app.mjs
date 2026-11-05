// page/app.mjs — the live page. Every demo runs the real kernels in this tab on SYNTHETIC behaviour; every result
// number is read from a committed receipt at load. Nothing real is on this page.
import { human, night, session } from '../src/synth.mjs';
import { emptyWatcher, step, confirm, confirmShift, paramsOf } from '../src/watch.mjs';
import { REBOUND_LADDER, BITS, difficultyFor, solve } from '../vendor/break-it/rebound.mjs';
import { run, cadence, burst, uniform, shuffled, borrowed, mimic, DAY } from '../src/drivers.mjs';
import { rank } from '../src/gep.mjs';
import { trust } from '../src/trust.mjs';
import { envelopeBody, materialOf, approvalMaterialOf, approvalFor, admits } from '../src/envelope.mjs';
import { recoveryBody, recoveryMaterialOf, applyRecovery } from '../src/recovery.mjs';
import { emptyNode, receive, sha256hex } from '../src/stack.mjs';
import { costCase, measuredRates, pounds, BASIS_KEYS } from '../src/cost.mjs';
import { makeIdentity, verifyBytes } from '../vendor/fall-kit-core/identity.mjs';
import { prepare, finish, frame, KINDS } from '../vendor/fall-kit-core/vendor/light/packet.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const chip = (v) => '<span class="chip c-' + esc(v) + '">' + esc(v) + '</span>';
const held = (h) => '<span class="chip ' + (h ? 'held' : 'failed') + '">' + (h ? 'HELD' : 'FAILED') + '</span>';
const fx = (x, d = 3) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(2) + '%' : '—');
const ALL = ['THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE'];
const enc = new TextEncoder();
const getJSON = async (p) => { try { const r = await fetch(p, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; } };

// ── theme ──
try { const t = localStorage.getItem('bes-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* private window */ }
$('theme').addEventListener('click', () => {
  const now = document.documentElement.dataset.theme === 'light' ? 'dark' : document.documentElement.dataset.theme === 'dark' ? 'light' : matchMedia('(prefers-color-scheme: light)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = now;
  try { localStorage.setItem('bes-theme', now); } catch { /* ignore */ }
});

const [PARAMS, CLAIMS, REAL, SYN, WIT, COSTS, BASIS] = await Promise.all(['params.json', 'measure/claims.json', 'receipts/real.json', 'receipts/synthetic.json', 'receipts/witness.json', 'costs/sources.json', 'vendor/sovereign-enterprise/basis.json'].map(getJSON));
const ISO = /\d{4}-\d{2}-\d{2}T[\d:.]+Z/;
const TEST_FROM = CLAIMS && CLAIMS.data && CLAIMS.data.splits ? (String(CLAIMS.data.splits.test).match(ISO) || [null])[0] : null;
const TEST_TO = REAL && REAL.provenance ? REAL.provenance.cutoff : null;
const day = (iso, long) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', long ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'; };
const n0 = (x) => (typeof x === 'number' ? x.toLocaleString('en-GB') : '—');
const P = PARAMS && PARAMS.params ? PARAMS.params : {};

// ── the strip and the results ──
const fpOf = (r) => (r && r.facts && r.facts.B4 && r.facts.B4.simon ? r.facts.B4.simon : null);
$('s-real').textContent = REAL ? REAL.held + ' of ' + REAL.of : 'pending';
$('s-syn').textContent = SYN ? SYN.held + ' of ' + SYN.of : 'pending';
$('s-wit').textContent = WIT ? WIT.killed + ' / ' + WIT.total : 'CI';
const rf = fpOf(REAL);
$('s-fp').textContent = rf ? pct(rf.fp, rf.judged) : '—';
const ORDER = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'L1'];
if (CLAIMS) {
  $('restbl').querySelector('tbody').innerHTML = ORDER.map((k) => {
    const c = CLAIMS.claims[k], r = REAL && REAL.verdicts[k], s = SYN && SYN.verdicts[k];
    const cell = (v) => (v ? held(v.held) + '<div class="note">' + esc(v.why) + '</div>' : '<span class="note">pending</span>');
    return '<tr><td><b>' + k + '</b></td><td>' + esc(c.says) + '</td><td>' + cell(r) + '</td><td>' + cell(s) + '</td></tr>';
  }).join('');
}
if (REAL) {
  const f = REAL.facts, line = (name, x) => x ? '<tr><td>' + esc(name) + '</td><td>' + x.judged + '</td><td>' + x.fp + ' (' + pct(x.fp, x.judged) + ')</td><td>' + x.episodes + '</td><td>' + x.shiftPrompts + '</td><td>' + x.forming + '</td></tr>' : '';
  const drv = (o, level) => Object.entries(o || {}).map(([d, v]) => esc(d) + ' ' + v.caught + '/' + v.sessions).join(' · ');
  $('realdetail').innerHTML = '<h3>What the real measurement saw</h3><div class="scroll"><table class="tbl"><thead><tr><th>stream (test period)</th><th>actions judged</th><th>stepped up or more</th><th>distinct times asked</th><th>big shifts confirmed</th><th>seen while still forming</th></tr></thead><tbody>'
    + line('the owner (human turns)', f.B4.simon) + line('the agent, working sessions', f.B5['kar-session']) + line('the agent, nightly loop', f.B5['kar-night'])
    + '</tbody></table></div><p class="note"><b>Scripts on the owner&rsquo;s key</b> (stepped up within 10 actions, of 20): ' + drv(f.B1.simon) + '. <b>Scripts on the agent&rsquo;s key</b> (blocked within 10, of 20) — working sessions: ' + drv(f.B2['kar-session']) + '; nightly loop: ' + drv(f.B2['kar-night']) + '. <b>Mixed signals</b>: owner shapes on the agent&rsquo;s timing ' + f.B6.a.caught + '/20, agent shapes on the owner&rsquo;s timing ' + f.B6.b.caught + '/20. <b>Perfect copy of last week</b>: ' + f.L1.simon.caught + '/20 caught. Envelope faults blocked: ' + f.B3.blocked + '/' + f.B3.total + '. Recovery cases: ' + f.B7.recovery.passed + '/' + f.B7.recovery.total + '.</p><p class="note">Inputs: three private streams on the owner&rsquo;s machine, kept in LIGHT; their SHA-256: ' + Object.entries(REAL.provenance.privateStreamsSha256 || {}).map(([k, v]) => esc(k) + ' <code>' + esc(v.slice(0, 16)) + '…</code>').join(' · ') + '. Measured with the code at commit <code>' + esc(String(REAL.measuredAt).slice(0, 7)) + '</code>, the second seal.</p>';
  const o = f.B4 && f.B4.simon, ns = f.B5 && f.B5['kar-night'], ss = f.B5 && f.B5['kar-session'];
  if (o && ns && ss) $('risk-thin').innerHTML = 'One machine, three weeks. The owner&rsquo;s false-positive claim (B4) stands on ' + n0(o.judged) + ' of his actions judged; the nightly loop&rsquo;s (B5) on only ' + n0(ns.judged) + ', because ' + n0(ns.forming) + ' of its ' + n0(ns.actions) + ' test-period actions were still forming; the working sessions on ' + n0(ss.judged) + '. A held claim on a small count is a small proof: your own first weeks, observe-only, are the measurement that counts for you.';
} else $('realdetail').innerHTML = '<h3>What the real measurement saw</h3><p class="note">The real receipt is not published yet.</p>';

// ── the blueprint ──
const ORGANS = [
  ['src/entropy.mjs', 'Gary&rsquo;s three domains: the window&rsquo;s symbols, their entropy in nats, S, and D_KL against the baseline'],
  ['src/gep.mjs', 'the decision: E(t), A(t), β|∇S|, ΔS and the rhythm → the five verdicts, with the row that decided'],
  ['src/watch.mjs', 'one identity&rsquo;s watch: formation, its own bars, quarantine, the stability bound, held blocks'],
  ['src/trust.mjs', 'the three-part identity, observe-only, the tiers switched on one at a time'],
  ['src/envelope.mjs', 'the delegation envelope on the wallet kernel; high-stakes never standing; approval binding'],
  ['src/recovery.mjs', 'the offline recovery path'],
  ['src/stack.mjs', 'the four layers as one door; refusals into immune memory and the tarpit'],
  ['src/store.mjs', 'baselines kept in LIGHT on the device'],
  ['src/drivers.mjs', 'the re-timing fixtures the claims are measured with'],
  ['src/cost.mjs', 'the cost case from your numbers and sourced prices'],
  ['measure/judge.mjs', 'the sealed claims, as a pure judge with the sealed bars'],
  ['src/bes.mjs', 'v1, the inward watch this layer grew from: op-mix and rhythm'],
  ['src/synth.mjs', 'the seeded synthetic behaviour &mdash; the only behaviour this page and CI ever run', 'not mutated: test data, value-tested in drivers.test.mjs; any change breaks the byte-for-byte synthetic receipt check in CI'],
  ['src/stream.mjs', 'v1&rsquo;s windowing glue', 'not mutated: glue, value-tested in stream.test.mjs'],
  ['measure/harness.mjs · measure/measure.mjs', 'the measurement of the sealed claims, real (on the owner&rsquo;s machine) and synthetic', 'not mutated: orchestration, re-derived end to end in CI &mdash; measure.mjs --synthetic --check reproduces receipts/synthetic.json byte for byte'],
  ['tools/', 'local only: extract the private streams, tune on dev data, run the live layer and its tiers, vendor, parse the witness receipt', 'not mutated: local I/O, never shipped to this page'],
  ['vendor/', 'pinned byte-identical: LIGHT, the wallet and identity (fall-kit), immune and rebound (break-it), the cost basis (sovereign-enterprise)', 'gated in their own repositories; re-hashed against their pins in CI (tools/vendor.mjs --check)'],
  ['page/app.mjs', 'this page: runs the kernels in your tab and reads every number from the committed receipts and sourced files', 'test/page.test.mjs: parses, every element it reaches exists, credits verbatim, no inline style, no money figure typed into the page'],
];
const wk = (src) => (WIT && Array.isArray(WIT.kernels) ? WIT.kernels.find((k) => k.src === src) : null);
$('bp-run').innerHTML = WIT && typeof WIT.run === 'string' && /^https:\/\/github\.com\//.test(WIT.run)
  ? 'Witness v0.6 on GitHub&rsquo;s runner, one job per kernel: <b>' + (WIT.clean ? 'CLEAN' : 'NOT CLEAN') + '</b>, ' + WIT.killed + ' of ' + WIT.total + ' mutants killed, the rest argued equivalent in <a href="https://github.com/sjgant80-hub/bes-inward/blob/main/witness.baseline.json">witness.baseline.json</a>, each with its written reason &mdash; <a href="' + esc(WIT.run) + '">the run</a>, on commit <code>' + esc(String(WIT.commit).slice(0, 7)) + '</code>.'
  : 'The witness receipt did not load.';
$('bptbl').querySelector('tbody').innerHTML = ORGANS.map(([src, what, why]) => { const w = wk(src); return '<tr><td><code>' + src + '</code></td><td>' + what + '</td><td>' + (w ? '<span class="chip ' + (w.clean ? 'held' : 'failed') + '">' + (w.clean ? 'CLEAN' : 'NOT CLEAN') + '</span> ' + w.killed + '/' + w.total + (w.ignored ? ' · ' + w.ignored + ' argued equivalent' : '') : '<span class="note">' + (why || 'gated in CI') + '</span>') + '</td></tr>'; }).join('');

// ── the real measurement, traced from its receipt ──
if (REAL && REAL.facts && REAL.streams) {
  const f = REAL.facts, st = REAL.streams;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  for (const [k, name, x] of [['o', 'simon', f.B4 && f.B4.simon], ['s', 'kar-session', f.B5 && f.B5['kar-session']], ['n', 'kar-night', f.B5 && f.B5['kar-night']]]) {
    const form = f.B7 && f.B7.formation ? f.B7.formation[name] : null;
    if (!x || !form || !st[name]) continue;
    $('r-' + k + '-1').textContent = n0(st[name].actions) + ' actions recorded';
    $('r-' + k + '-2').textContent = 'first 14 days: ' + n0(form.actions) + ' actions · ' + form.enforcedNotAllow + ' enforced';
    $('r-' + k + '-3t').textContent = 'test period, ' + day(TEST_FROM) + ' – ' + day(TEST_TO);
    $('r-' + k + '-3').textContent = n0(st[name].test) + ' actions · ' + n0(x.forming) + ' still forming';
    $('r-' + k + '-4a').textContent = n0(x.judged) + ' judged · ' + x.fp + ' stepped up or more';
    $('r-' + k + '-4b').textContent = pct(x.fp, x.judged) + ' · asked ' + plural(x.episodes, 'time', 'times') + ' · ' + plural(x.shiftPrompts, 'big shift', 'big shifts') + ' confirmed';
  }
  if (f.B3 && f.B7 && f.B7.recovery) $('r-foot').textContent = 'Envelope faults blocked ' + f.B3.blocked + ' of ' + f.B3.total + ' · recovery cases passed ' + f.B7.recovery.passed + ' of ' + f.B7.recovery.total + ' · the stolen-key scripts, failures included, are in Results.';
}

// ── 1 · grow the baselines ──
const START = Date.UTC(2026, 6, 20), DAYS = 42, END = START + DAYS * DAY;
const S = {}, W = {};
let msPerAction = 0.5, measured = false;
const NAMES = { simon: 'the owner (a person)', night: 'the agent — nightly loop', session: 'the agent — working sessions' };
async function grow() {
  $('grow').disabled = true;
  S.simon = human({ seed: 7, start: START, days: DAYS }); S.night = night({ seed: 11, start: START, days: DAYS }); S.session = session({ seed: 13, start: START, days: DAYS });
  const total = S.simon.length + S.night.length + S.session.length;
  let done = 0, spent = 0;
  const rows = [];
  for (const name of ['simon', 'night', 'session']) {
    let w = emptyWatcher(name), formedDay = null, fp = 0, judged = 0;
    const xs = S[name];
    for (let i = 0; i < xs.length; i += 250) {
      const t0 = performance.now();
      for (const e of xs.slice(i, i + 250)) {
        const r = step(w, e, P); w = r.w;
        if (r.out.formed) { judged++; if (rank(r.out.raw) >= 2) { fp++; w = confirm(w, P); } }
        if (w.pendingShift) w = confirmShift(w, P);
        if (formedDay === null && w.formed) formedDay = Math.floor((w.formedAt - START) / DAY) + 1;
      }
      spent += performance.now() - t0; done += Math.min(250, xs.length - i);
      $('growbar').style.width = ((100 * done) / total).toFixed(1) + '%';
      await new Promise((r) => setTimeout(r, 0));
    }
    W[name] = w;
    rows.push('<tr><td>' + NAMES[name] + '</td><td>' + xs.length + '</td><td>' + (formedDay || '—') + '</td><td>' + fp + ' of ' + judged + ' (' + pct(fp, judged) + ')</td><td>' + fx(w.bars && w.bars.rhythmBar) + '</td></tr>');
  }
  msPerAction = spent / total; measured = true;
  $('growtbl').querySelector('tbody').innerHTML = rows.join('');
  $('steal').disabled = false;
  $('kstat').textContent = 'Kernels running in this tab · ' + total + ' synthetic actions judged at ' + msPerAction.toFixed(3) + ' ms each.';
  $('faq-ms').textContent = 'just now, ' + n0(total) + ' synthetic actions took ' + msPerAction.toFixed(3) + ' ms each in this tab';
  await setupNode();
  drawCost();
}
$('grow').addEventListener('click', grow);

// ── 2 · hand the key to a script ──
function sessionFor(name, drv) {
  const xs = S[name], recent = xs.filter((e) => e.t >= END - 14 * DAY), other = name === 'simon' ? S.night : S.simon;
  const shapes = run(recent, 30, 4242);
  if (drv === 'cadence') return cadence(shapes, END, 60000);
  if (drv === 'burst') return burst(shapes, END, 500);
  if (drv === 'uniform') return uniform(shapes, END, 4343);
  if (drv === 'shuffled') return shuffled(shapes, END, 4444);
  if (drv === 'borrowed') return borrowed(shapes, other.slice(-30), END);
  return mimic(xs, END, 30);
}
$('steal').addEventListener('click', () => {
  const name = $('who').value, drv = $('drv').value;
  let w = structuredClone(W[name]);
  const rows = [];
  let first = null, caught = null, last = null;
  sessionFor(name, drv).slice(0, 10).forEach((e, i) => {
    const r = step(w, e, P); w = r.w; last = { r, w };
    if (first === null && rank(r.out.raw) >= 2) { first = i + 1; caught = r.out; }
    rows.push('<tr><td>' + (i + 1) + '</td><td>' + chip(r.out.raw) + '</td><td>' + esc(r.out.row) + (r.out.part ? ' <span class="note">(' + esc(r.out.part) + ')</span>' : '') + '</td><td>' + fx(r.out.E) + '</td><td>' + fx(r.out.A) + '</td><td>' + fx(r.out.rhythm) + '</td></tr>');
  });
  $('stealtbl').querySelector('tbody').innerHTML = rows.join('');
  const isAgent = name !== 'simon';
  const tv = caught ? trust({ actor: isAgent ? 'kar' : 'simon', credential: true, bes: { raw: caught.raw, observing: false }, envelope: isAgent ? { ok: true } : null, tiers: ALL }) : null;
  $('stealsum').innerHTML = first ? 'Caught at action <b>' + first + '</b> of 10 (' + esc(caught.row) + '). With every tier switched on, that action is enforced as ' + chip(tv.enforced) + ' — ' + esc(tv.why) + '. Each action is judged on its own: the table shows the verdict of every one, and only ISOLATE holds the key.' :'Not caught in 10 actions. ' + (drv === 'mimic' ? 'This is the limit the method&rsquo;s author names: a perfect copy of one&rsquo;s own past.' : 'Every signature was valid and every request was the identity&rsquo;s own; see Results for how often this happens on real behaviour.');
  trace(name, last.r.out, last.w);
});
function trace(name, o, w) {
  const b = w.bars && w.bars.parts ? w.bars.parts : null;
  $('trace').innerHTML = '<h3>Your last run, traced (' + esc(NAMES[name]) + ', action 10)</h3><div class="scroll"><table class="tbl"><tbody>'
    + '<tr><th>H_net · H_beh · H_auth</th><td>' + fx(o.H && o.H.net) + ' · ' + fx(o.H && o.H.beh) + ' · ' + fx(o.H && o.H.auth) + ' nats</td></tr>'
    + '<tr><th>S, and its distance from the baseline</th><td>S = ' + fx(o.S) + '; |S − S_b| = ' + fx(o.d && o.d.S) + ' against ε = ' + fx(b && b.S.eps) + '</td></tr>'
    + '<tr><th>E(t), the strongest field</th><td>' + fx(o.E) + ' (rungs: ½ throttle, ⅔ step-up, ⅚ block)</td></tr>'
    + '<tr><th>A(t), the weakest alignment</th><td>' + fx(o.A) + '</td></tr>'
    + '<tr><th>|∇S| and ΔS</th><td>' + fx(o.grad) + ' · ' + fx(o.dS) + '</td></tr>'
    + '<tr><th>rhythm of the last six gaps</th><td>' + fx(o.rhythm) + ' against this identity&rsquo;s own floor ' + fx(w.bars && w.bars.rhythmBar) + '</td></tr>'
    + '<tr><th>verdict</th><td>' + chip(o.raw) + ' ' + esc(o.row) + '</td></tr></tbody></table></div>';
}

// ── keys, the envelope, the node ──
const id = (b) => makeIdentity(new Uint8Array(32).fill(b));
const simon = await id(0x11), kar = await id(0x22), other = await id(0x33), recKey = await id(0x44);
const signHex = async (who, s) => Array.from(await who.sign(enc.encode(s)), (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
const vHex = (k, s, sig) => verifyBytes(k, enc.encode(s), unhex(sig));
const NOW = Date.now();
const envBody = envelopeBody({ issuer: simon.id, holder: kar.id, scope: ['run', 'read', 'edit', 'measure'], budget: 100, notBefore: NOW - 3600000, notAfter: NOW + 7 * DAY, nonce: 'env-page-0001' }).body;
const envSig = await signHex(simon, materialOf(envBody));
const envOk = await vHex(simon.id, materialOf(envBody), envSig);
$('kstat').textContent = 'Kernels loaded · keys made in this tab · press Grow the baselines.';

$('envgo').addEventListener('click', async () => {
  const f = $('fault').value;
  let body = envBody, sigOk = envOk, a = { verb: 'run', t: Date.now(), cost: 5 }, c = { simon: simon.id, holder: kar.id, spent: 0, revoked: [] }, approval = null, note = '';
  const WORDS = 'sign the pilot agreement with Northwind for 12 weeks';
  const apB = { kind: 'bes-approval', itemId: 'deal-42', textSha256: sha256hex(WORDS), by: simon.id, at: Date.now(), expires: Date.now() + 3600000 };
  const aps = [{ body: apB, sigOk: await vHex(simon.id, approvalMaterialOf(apB), await signHex(simon, approvalMaterialOf(apB))) }];
  if (f === 'scope') a.verb = 'deploy';
  if (f === 'budget') { a.cost = 30; c.spent = 80; note = 'already spent 80 of 100; this costs 30'; }
  if (f === 'window') a.t = envBody.notBefore - 1;
  if (f === 'expiry') a.t = envBody.notAfter;
  if (f === 'revoked') c.revoked = [envBody.nonce];
  if (f === 'high') a.verb = 'money';
  if (f === 'forged') sigOk = await vHex(simon.id, materialOf(envBody), await signHex(other, materialOf(envBody)));
  if (f === 'tampered') { body = { ...envBody, budget: 100000 }; sigOk = await vHex(simon.id, materialOf(body), envSig); }
  if (f === 'words') { a.verb = 'deal'; approval = approvalFor('deal-42', sha256hex(WORDS + ' — and a 10% discount'), aps, { simon: simon.id, now: Date.now() }); }
  if (f === 'approved') { a.verb = 'deal'; approval = approvalFor('deal-42', sha256hex(WORDS), aps, { simon: simon.id, now: Date.now() }); }
  const r = admits({ body }, a, { ...c, sigOk, approval });
  const tv = trust({ actor: 'kar', credential: true, bes: { raw: 'ALLOW', observing: false }, envelope: r, tiers: ALL });
  $('envout').innerHTML = 'envelope check: <b>' + esc(r.stage) + '</b> — ' + esc(r.why) + (note ? ' <span class="note">(' + esc(note) + ')</span>' : '') + '<br>the agent&rsquo;s behaviour: ' + chip('ALLOW') + ' (a perfect baseline) → trust verdict ' + chip(tv.enforced) + ' — ' + esc(tv.why);
});

// ── 4 · recovery ──
let locked = null, used = [], lastRec = null;
const recLine = (r) => (r.ok ? chip('ALLOW') : chip('BLOCK')) + ' ' + esc(r.why);
$('lock').addEventListener('click', () => {
  const base = W.simon ? structuredClone(W.simon) : emptyWatcher('simon');
  locked = { ...base, id: 'simon', formed: true, held: { verdict: 'ISOLATE', at: Date.now() } };
  used = []; lastRec = null;
  $('recout').innerHTML = 'The owner&rsquo;s key is held at ' + chip('ISOLATE') + '. Every action from it is refused until a recovery record lifts it.';
});
async function recover(kind) {
  if (!locked) { $('recout').textContent = 'Put the key on hold first.'; return; }
  const n = 'rec-page-' + (used.length + 1) + '-' + Date.now();
  let body = recoveryBody({ identity: 'simon', act: 'observe', nonce: n, at: Date.now(), by: recKey.id }).body, signer = recKey;
  if (kind === 'daily') { body = { ...body, by: simon.id }; signer = simon; }
  if (kind === 'replay') { if (!lastRec) { $('recout').textContent = 'Recover with the offline key first, then replay that record.'; return; } body = lastRec; }
  let sigOk = await vHex(body.by, recoveryMaterialOf(body), await signHex(signer, recoveryMaterialOf(body)));
  if (kind === 'tamper') { const sig = await signHex(recKey, recoveryMaterialOf(body)); body = { ...body, at: body.at + 1 }; sigOk = await vHex(recKey.id, recoveryMaterialOf(body), sig); }
  const r = applyRecovery(locked, { body }, { recoveryKey: recKey.id, dailyKey: simon.id, sigOk, used, now: Date.now() });
  if (r.ok) { locked = r.w; used = r.used; lastRec = body; }
  $('recout').innerHTML = recLine(r) + (r.ok ? '<br>' + (r.w.held ? 'still held at ' + esc(String(r.w.held.verdict || r.w.held)) : 'hold lifted') + ' · observe-only until ' + esc(new Date(r.w.observeUntil).toUTCString()) : '');
}
$('rec-ok').addEventListener('click', () => recover('ok'));
$('rec-daily').addEventListener('click', () => recover('daily'));
$('rec-replay').addEventListener('click', () => recover('replay'));
$('rec-tamper').addEventListener('click', () => recover('tamper'));

// ── 5 · one packet through all four layers ──
let node = null, counter = 0n, lastGood = null, clock = END;
async function setupNode() {
  node = emptyNode({ simon: simon.id, keys: [{ slot: simon.slot, id: simon.id, actor: 'simon', name: 'the owner' }, { slot: kar.slot, id: kar.id, actor: 'kar', name: 'the agent' }], envelope: { body: envBody }, envelopeSigOk: envOk, tiers: ALL, params: P });
  if (W.simon) node.keys[simon.slot].watcher = structuredClone(W.simon);
  counter = 0n; clock = END;
}
async function pkt(who, value) {
  counter += 1n;
  const p = prepare({ sender: who.slot, counter, dictId: 0, kind: KINDS.JSON, value });
  return finish(p.unsigned, await who.sign(p.signed)).bytes;
}
function showPacket(label, o) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td>' + esc(label) + '</td><td>' + (o.admitted ? chip('ALLOW') : chip(o.enforced || 'BLOCK')) + '</td><td>' + esc(o.layer) + '</td><td>' + esc(o.why) + '</td><td>' + (o.immune ? esc(o.immune.family) + (o.immune.novel ? ' · a new antibody' : ' · seen before') + ' · source standing ' + esc(o.immune.standing) : '—') + '</td><td>' + (o.owed ? o.owed + ' bits' : '0') + '</td>';
  $('pkttbl').querySelector('tbody').prepend(tr);
}
const verified = async (bytes) => { const f = frame(bytes, {}); const key = f.ok && node.keys[f.sender] ? node.keys[f.sender].id : null; return key ? await verifyBytes(key, f.signed, f.sig) : false; };
async function deliver(label, bytes, at, io) {
  if (!node) await setupNode();
  const ok = await verified(bytes);
  const source = io && io.source ? io.source : label === 'replay' ? 'lan' : label.startsWith('thief') ? 'far-host' : 'lan';
  const r = receive(node, bytes, { now: at, source, verify: () => ok, work: io ? io.work : undefined });
  node = r.node;
  showPacket(label, r.out);
  return r;
}
const ownShape = () => { const xs = (S.simon || human({ seed: 7, start: START, days: DAYS })).filter((e) => e.t >= END - 7 * DAY); return xs[Math.floor(xs.length / 2)]; };
const asAction = (e) => ({ verb: 'ask', src: e.src, kind: e.kind, organ: e.loc, size: e.size, tier: e.tier, priv: e.priv });
$('p-good').addEventListener('click', async () => { const e = ownShape(); clock = Math.max(clock, e.t + 7 * DAY); const b = await pkt(simon, asAction(e)); lastGood = b; await deliver('genuine', b, clock); });
$('p-forged').addEventListener('click', async () => { const b = (await pkt(simon, asAction(ownShape()))).slice(); b[b.length - 1] ^= 1; await deliver('forged', b, clock); });
$('p-foreign').addEventListener('click', async () => { await deliver('not LIGHT', crypto.getRandomValues(new Uint8Array(120)), clock); });
$('p-replay').addEventListener('click', async () => { if (!lastGood) { lastGood = await pkt(simon, asAction(ownShape())); await deliver('genuine', lastGood, clock); } await deliver('replay', lastGood, clock + 1000); });
$('p-thief').addEventListener('click', async () => {
  if (!W.simon) { $('kstat').textContent = 'Grow the baselines first, so the owner&rsquo;s watch knows him.'.replace('&rsquo;', '’'); return; }
  const xs = S.simon.filter((e) => e.t >= END - 14 * DAY).slice(-10);
  for (let i = 0; i < xs.length; i++) { clock += 60000; const r = await deliver('thief ' + (i + 1), await pkt(simon, asAction(xs[i])), clock); if (!r.out.admitted) break; }
});
// The tarpit, shown for real: one source sends the same forged packet until break-it's rebound ladder says it owes
// work, then pays that work in this tab to buy one more look. Every number is read from the vendored kernel.
$('pkt-ladder').textContent = 'A source refused ' + REBOUND_LADDER.BLOCK + ' times owes ' + BITS.BLOCK + ' bits of proof-of-work before its next packet is looked at, and ' + BITS.ISOLATE + ' bits past ' + REBOUND_LADDER.ISOLATE + ' refusals; the node spends one hash to check a token.';
let floods = 0;
$('p-flood').addEventListener('click', async () => {
  if (!node) await setupNode();
  $('p-flood').disabled = true;
  try {
    floods += 1;
    const source = 'flood-host-' + floods, b = (await pkt(simon, asAction(ownShape()))).slice();
    b[b.length - 1] ^= 1;
    const ok = await verified(b);
    let r = null, n = 0;
    while (difficultyFor((node.refusals && node.refusals[source]) || 0) === 0 && n < REBOUND_LADDER.ISOLATE) { r = receive(node, b, { now: clock, source, verify: () => ok }); node = r.node; n += 1; }
    if (!r) return;
    showPacket('the same forged packet × ' + n, r.out);
    const owes = await deliver('packet ' + (n + 1) + ', no work', b, clock, { source });
    const t0 = performance.now();
    const work = solve(owes.out.challenge, owes.out.owed, sha256hex);
    const ms = performance.now() - t0;
    const paid = await deliver('packet ' + (n + 1) + ', work paid', b, clock, { source, work });
    $('pktsum').innerHTML = n + ' forged packets from one source were each refused at ' + esc(r.out.layer) + '; after the last, the tarpit asked ' + r.out.owed + ' bits of work. Packet ' + (n + 1) + ' without that work was refused before its signature was checked. This tab then paid the work (' + ms.toFixed(0) + ' ms on its side) and the node looked once more: refused again at ' + esc(paid.out.layer) + ' &mdash; the work buys a look, never admission. Nothing was sent back at the source.';
  } finally { $('p-flood').disabled = false; }
});

// ── the cost case ── every figure from the vendored basis or costs/sources.json, computed by src/cost.mjs
const SRC = COSTS && Array.isArray(COSTS.sources) ? COSTS.sources : [];
const srcOf = (key) => SRC.find((s) => s.key === key) || null;
const usd = (cents) => 'US$' + (cents / 100).toFixed(2);
const link = (s, text) => (s ? '<a href="' + esc(s.url) + '">' + text + '</a>' : text);
const RATES = measuredRates(REAL, TEST_FROM, TEST_TO);
if (RATES.ok) { $('c-sp').value = RATES.perPerson.toFixed(2); $('c-sa').value = RATES.perAgent.toFixed(2); }
const times = (n) => (n === 1 ? 'once' : n + ' times');
const field = (id) => ($(id).value === '' ? 0 : Number($(id).value));
function drawCost() {
  const blank = () => { for (const k of ['c-rented', 'c-bes', 'c-save']) $(k).textContent = '—'; for (const k of ['c-rented-n', 'c-bes-n', 'c-save-n']) $(k).textContent = ''; };
  if (!COSTS || !BASIS) { blank(); $('c-lines').textContent = 'The sourced figures did not load, so there is no case to show.'; return; }
  const r = costCase(BASIS, COSTS.prices, { people: field('c-people'), agents: field('c-agents'), actionsPerDay: field('c-actions'), msPerAction, stepUpsPerPerson: field('c-sp'), stepUpsPerAgent: field('c-sa'), minutesPerStepUp: field('c-min'), setupHours: field('c-setup'), upkeepHoursPerYear: field('c-upkeep'), years: field('c-years') });
  if (!r.ok) { blank(); $('c-lines').textContent = 'Check the inputs: ' + r.why + '.'; return; }
  const PR = COSTS.prices, B = BASIS, i = r.inputs, L = r.lines, yrs = i.years + (i.years === 1 ? ' year' : ' years');
  $('c-rented').textContent = pounds(r.perYear.rented); $('c-bes').textContent = pounds(r.perYear.owned); $('c-save').textContent = pounds(r.differencePerYear);
  $('c-rented-n').textContent = 'over ' + yrs + ': ' + pounds(r.over.rented);
  $('c-bes-n').textContent = 'over ' + yrs + ', set-up included: ' + pounds(r.over.owned) + (L.setup ? ' (' + pounds(L.setup) + ' of it is the set-up, once)' : '');
  $('c-save-n').textContent = 'over ' + yrs + ', set-up included: ' + pounds(r.differenceOver);
  const many = (n, one, more) => n + ' ' + (n === 1 ? one : more);
  $('c-lines').innerHTML = '<b>Rented:</b> ' + many(i.people, 'person', 'people') + ' × '+ usd(PR.entraP2CentsPerUserMonth) + ' a month (' + link(srcOf('entraP2CentsPerUserMonth'), 'Entra ID P2') + ') + ' + many(i.agents, 'agent', 'agents') + ' × ' + usd(PR.workloadIdCentsPerIdentityMonth) + ' a month (' + link(srcOf('workloadIdCentsPerIdentityMonth'), 'Entra Workload ID') + '), × 12, at £' + B.fxGbpPerUsd.value + ' to the dollar = ' + pounds(L.rentedPeople) + ' + ' + pounds(L.rentedAgents) + '. '
    + '<b>The BES layer:</b> no licence fee; electricity ' + pounds(L.power) + ' for ' + L.cpuHours.toFixed(3) + ' CPU-hours a year at the chip&rsquo;s ' + PR.chipMaxWatts + ' W maximum and ' + B.electricityPencePerKwh.value + 'p a kWh (' + msPerAction.toFixed(3) + ' ms an action, ' + (measured ? 'measured in this tab' : 'an estimate until you grow the baselines, then measured in this tab') + '); people&rsquo;s time ' + pounds(L.peopleTime) + ' for ' + many(Math.round(L.stepUps), 'step-up', 'step-ups') + ' a year × ' + i.minutesPerStepUp + ' min at the UK median wage of £' + B.wageMedianHourly.value.toFixed(2) + ' an hour; upkeep ' + pounds(L.upkeep) + ' for ' + many(i.upkeepHoursPerYear, 'hour', 'hours') + ' a year at the same wage. <b>Set-up, once:</b> ' + i.setupHours + ' hours at the same wage = ' + pounds(L.setup) + ', in the first year of ours only. Each later year rises by CPI, ' + (100 * B.cpi.value).toFixed(1) + '%. '
    + (RATES.ok ? '<b>The step-up rates</b> start at what the real measurement saw over ' + RATES.weeks.toFixed(1) + ' weeks (' + day(TEST_FROM, true) + ' to ' + day(TEST_TO, true) + '): the owner was asked ' + times(Math.round(RATES.perPerson * RATES.weeks)) + ', ' + RATES.perPerson.toFixed(2) + ' a week; his agent ' + times(Math.round(RATES.perAgent * RATES.weeks)) + ', ' + RATES.perAgent.toFixed(2) + ' a week. One owner and one agent is a small sample: put in your own.' : 'The real receipt did not load; put in your own step-up rates.');
}
const basisLine = (k) => { const b = BASIS && BASIS[k]; return b ? '<li>' + esc(b.what || b.product || k) + ' — <a href="' + esc(b.source) + '">source</a>' + (b.via ? ' (' + esc(b.via) + ')' : '') + '</li>' : ''; };
$('c-src').innerHTML = (BASIS ? BASIS_KEYS.map(basisLine).join('') : '<li>the shared basis did not load</li>')
  + SRC.filter((s) => ['entraP2CentsPerUserMonth', 'workloadIdCentsPerIdentityMonth', 'chipMaxWatts'].includes(s.key)).map((s) => '<li>' + esc(s.what) + ' — <a href="' + esc(s.url) + '">source</a>, read ' + esc(day(s.read, true)) + '</li>').join('')
  + '<li>The wage, CPI, electricity and exchange rate are the estate&rsquo;s shared basis, <a href="https://github.com/sjgant80-hub/bes-inward/blob/main/vendor/sovereign-enterprise/basis.json">vendored byte for byte</a> and re-hashed in CI. None of this is a price for the BES layer.</li>';
for (const k of ['c-people', 'c-agents', 'c-actions', 'c-sp', 'c-sa', 'c-min', 'c-setup', 'c-upkeep', 'c-years']) $(k).addEventListener('input', drawCost);
drawCost();

// ── against what you pay now: the sourced prices and statistics, rendered from costs/sources.json ──
if (COSTS && COSTS.prices) {
  const P2 = srcOf('entraP2CentsPerUserMonth'), WL = srcOf('workloadIdCentsPerIdentityMonth'), IBM = srcOf('breachUsd'), VZ = srcOf('vulnFirstPct');
  const breach = 'US$' + (COSTS.prices.breachUsd / 1e6).toFixed(2) + ' million';
  if (P2) $('p-p2').innerHTML = link(P2, esc(P2.product)) + ', which includes Microsoft Entra ID Protection and risk-based Conditional Access, at <b>' + usd(COSTS.prices.entraP2CentsPerUserMonth) + ' user/month, paid yearly</b> (its published price, read ' + esc(day(P2.read, true)) + ')';
  if (WL) $('p-wl').innerHTML = link(WL, esc(WL.product)) + ' at <b>' + usd(COSTS.prices.workloadIdCentsPerIdentityMonth) + ' user/month, paid yearly</b>, as printed (read ' + esc(day(WL.read, true)) + ')';
  if (IBM && VZ) $('p-why').innerHTML = 'Why it matters now: stolen passwords were the top way attackers got in until ' + link(VZ, 'Verizon&rsquo;s 2026 report') + ', where software vulnerabilities (' + COSTS.prices.vulnFirstPct + '%) moved ahead of them; the average breach cost ' + breach + ' in ' + link(IBM, 'IBM&rsquo;s Cost of a Data Breach Report 2026') + ', a record.';
  if (IBM) $('b-breach').textContent = breach + ' (IBM, 2026)';
}

// ── what the watch stores: its bounds, read from the frozen params and the watch's own defaults ──
const PW = paramsOf(P);
$('sec-bounded').innerHTML = '<b>How much it keeps:</b> each identity&rsquo;s watch stores the symbols of its last ' + PW.W + ' actions, the times of its last few dozen, at most ' + PW.maxQuar + ' flagged actions waiting for an answer, at most ' + n0(PW.maxCal) + ' calibration samples, and the learned distributions. It is not a log: it grows until its calibration buffer is full, then its stored size levels off and does not grow with history (<code>test/bounded.test.mjs</code> checks it on a synthetic history long enough to fill the buffer and on one four times as long).';
