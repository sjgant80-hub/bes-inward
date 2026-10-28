// page/app.mjs — the live page. Every demo runs the real kernels in this tab on SYNTHETIC behaviour; every result
// number is read from a committed receipt at load. Nothing real is on this page.
import { human, night, session } from '../src/synth.mjs';
import { emptyWatcher, step, confirm, confirmShift } from '../src/watch.mjs';
import { run, cadence, burst, uniform, shuffled, borrowed, mimic, DAY } from '../src/drivers.mjs';
import { rank } from '../src/gep.mjs';
import { trust } from '../src/trust.mjs';
import { envelopeBody, materialOf, approvalMaterialOf, approvalFor, admits } from '../src/envelope.mjs';
import { recoveryBody, recoveryMaterialOf, applyRecovery } from '../src/recovery.mjs';
import { emptyNode, receive, sha256hex } from '../src/stack.mjs';
import { costCase, pounds } from '../src/cost.mjs';
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

const [PARAMS, CLAIMS, REAL, SYN, WIT, COSTS] = await Promise.all(['params.json', 'measure/claims.json', 'receipts/real.json', 'receipts/synthetic.json', 'receipts/witness.json', 'costs/sources.json'].map(getJSON));
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
    + '</tbody></table></div><p class="note"><b>Scripts on the owner&rsquo;s key</b> (stepped up within 10 actions, of 20): ' + drv(f.B1.simon) + '. <b>Scripts on the agent&rsquo;s key</b> (blocked within 10, of 20) — working sessions: ' + drv(f.B2['kar-session']) + '; nightly loop: ' + drv(f.B2['kar-night']) + '. <b>Mixed signals</b>: owner shapes on the agent&rsquo;s timing ' + f.B6.a.caught + '/20, agent shapes on the owner&rsquo;s timing ' + f.B6.b.caught + '/20. <b>Perfect copy of last week</b>: ' + f.L1.simon.caught + '/20 caught. Envelope faults blocked: ' + f.B3.blocked + '/' + f.B3.total + '. Recovery cases: ' + f.B7.recovery.passed + '/' + f.B7.recovery.total + '.</p><p class="note">Inputs: three private streams on the owner&rsquo;s machine, kept in LIGHT; their SHA-256: ' + Object.entries(REAL.provenance.privateStreamsSha256 || {}).map(([k, v]) => esc(k) + ' <code>' + esc(v.slice(0, 16)) + '…</code>').join(' · ') + '. Measured at <code>' + esc(String(REAL.measuredAt).slice(0, 7)) + '</code>.</p>';
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
];
const wk = (src) => (WIT && Array.isArray(WIT.kernels) ? WIT.kernels.find((k) => k.src === src) : null);
$('bptbl').querySelector('tbody').innerHTML = ORGANS.map(([src, what]) => { const w = wk(src); return '<tr><td><code>' + src + '</code></td><td>' + what + '</td><td>' + (w ? held(w.clean) + ' ' + w.killed + '/' + w.total + (w.ignored ? ' · ' + w.ignored + ' argued equivalent' : '') : '<span class="note">gated in CI</span>') + '</td></tr>'; }).join('');

// ── 1 · grow the baselines ──
const START = Date.UTC(2026, 6, 20), DAYS = 42, END = START + DAYS * DAY;
const S = {}, W = {};
let msPerAction = 0.5;
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
  msPerAction = spent / total;
  $('growtbl').querySelector('tbody').innerHTML = rows.join('');
  $('steal').disabled = false;
  $('kstat').textContent = 'Kernels running in this tab · ' + total + ' synthetic actions judged at ' + msPerAction.toFixed(3) + ' ms each.';
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
  let first = null, last = null;
  sessionFor(name, drv).slice(0, 10).forEach((e, i) => {
    const r = step(w, e, P); w = r.w; last = { r, w };
    if (first === null && rank(r.out.raw) >= 2) first = i + 1;
    rows.push('<tr><td>' + (i + 1) + '</td><td>' + chip(r.out.raw) + '</td><td>' + esc(r.out.row) + (r.out.part ? ' <span class="note">(' + esc(r.out.part) + ')</span>' : '') + '</td><td>' + fx(r.out.E) + '</td><td>' + fx(r.out.A) + '</td><td>' + fx(r.out.rhythm) + '</td></tr>');
  });
  $('stealtbl').querySelector('tbody').innerHTML = rows.join('');
  const isAgent = name !== 'simon';
  const tv = trust({ actor: isAgent ? 'kar' : 'simon', credential: true, bes: { raw: last.r.out.raw, observing: false }, envelope: isAgent ? { ok: true } : null, tiers: ALL });
  $('stealsum').innerHTML = first ? 'Caught at action <b>' + first + '</b> of 10. With every tier switched on, the tenth action is enforced as ' + chip(tv.enforced) + ' — ' + esc(tv.why) + '.' : 'Not caught in 10 actions. ' + (drv === 'mimic' ? 'This is the limit the method&rsquo;s author names: a perfect copy of one&rsquo;s own past.' : 'Every signature was valid and every request was the identity&rsquo;s own; see Results for how often this happens on real behaviour.');
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
  $('recout').innerHTML = recLine(r) + (r.ok ? '<br>held: ' + esc(String(r.w.held)) + ' · observe-only until ' + esc(new Date(r.w.observeUntil).toUTCString()) : '');
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
async function deliver(label, bytes, at) {
  if (!node) await setupNode();
  const f = frame(bytes, {});
  const key = f.ok && node.keys[f.sender] ? node.keys[f.sender].id : null;
  const ok = key ? await verifyBytes(key, f.signed, f.sig) : false;
  const r = receive(node, bytes, { now: at, source: label === 'replay' ? 'lan' : label.startsWith('thief') ? 'far-host' : 'lan', verify: () => ok });
  node = r.node;
  const o = r.out;
  const tr = document.createElement('tr');
  tr.innerHTML = '<td>' + esc(label) + '</td><td>' + (o.admitted ? chip('ALLOW') : chip(o.enforced || 'BLOCK')) + '</td><td>' + esc(o.layer) + '</td><td>' + esc(o.why) + '</td><td>' + (o.immune ? esc(o.immune.family) + (o.immune.novel ? ' · new' : '') + ' · ' + esc(o.immune.standing) : '—') + '</td><td>' + (o.owed ? o.owed + ' bits' : '0') + '</td>';
  $('pkttbl').querySelector('tbody').prepend(tr);
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

// ── the cost case ──
function drawCost() {
  if (!COSTS) { $('c-lines').textContent = 'The sourced prices did not load.'; return; }
  const realWeeks = 3;
  const prompts = rf ? rf.episodes / realWeeks : 0;
  const r = costCase({ people: Math.max(0, Math.floor(+$('c-people').value || 0)), agents: Math.max(0, Math.floor(+$('c-agents').value || 0)), actionsPerDay: Math.max(0, Math.floor(+$('c-actions').value || 0)), msPerAction, promptsPerWeek: prompts * Math.max(1, Math.floor(+$('c-people').value || 0)), minutesPerPrompt: Math.max(0, +$('c-min').value || 0) }, COSTS.prices);
  if (!r.ok) { $('c-lines').textContent = r.why; return; }
  $('c-rented').textContent = pounds(r.rented); $('c-bes').textContent = pounds(r.bes); $('c-save').textContent = pounds(r.saving);
  $('c-lines').innerHTML = 'Rented: each person × US$10.00 a month × 12, at the Bank of England rate (agents are not counted on that side — their workload identities are priced separately — so it is understated). Ours: licence £0; electricity ' + pounds(r.lines.besPower) + ' for ' + r.lines.cpuHours.toFixed(3) + ' CPU-hours at the chip&rsquo;s 55 W maximum (' + msPerAction.toFixed(3) + ' ms an action, measured in this tab); people&rsquo;s time ' + pounds(r.lines.besPeopleTime) + ' — ' + Math.round(r.lines.promptMinutes) + ' minutes a year answering step-ups at the National Living Wage, at the rate measured on the owner&rsquo;s real behaviour per person (' + prompts.toFixed(2) + ' a week). Sources: ' + COSTS.sources.map((s) => '<a href="' + esc(s.url) + '">' + esc(s.id) + '</a>').join(' · ') + '.';
}
for (const k of ['c-people', 'c-agents', 'c-actions', 'c-min']) $(k).addEventListener('input', drawCost);
drawCost();
