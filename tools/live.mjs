#!/usr/bin/env node
// tools/live.mjs — LOCAL ONLY. The BES layer on this machine: the owner's and the agent's real baselines, formed with
// the frozen params and kept in LIGHT on the device, and the enforcement tiers.
//
//   node tools/live.mjs                 re-extract nothing; read the private streams, (re)build each identity's watcher,
//                                       store it LIGHT-coded under ~/.si-didy/bes/private/baselines/, print a status line
//   node tools/live.mjs --next-tier     switch on the NEXT tier (THROTTLE → STEP_UP → BLOCK → ISOLATE), one at a time.
//                                       It refuses unless the tier before it has been on for at least 7 days. The owner
//                                       runs this; nothing switches a tier on by itself.
//   node tools/live.mjs --status        print the tiers and each baseline's state (counts only)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pack, unpack } from '../src/store.mjs';
import { emptyWatcher, step, confirm, confirmShift } from '../src/watch.mjs';
import { rank } from '../src/gep.mjs';
import { TIERS, tiersOn } from '../src/trust.mjs';

const PRIV = 'C:/Users/sjgan/.si-didy/bes/private/';
const CONF = 'C:/Users/sjgan/.si-didy/bes/config.json';
const DAY = 86400000;
const P = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8')).params;
const conf = existsSync(CONF) ? JSON.parse(readFileSync(CONF, 'utf8')) : { kind: 'bes-layer.config', v: 1, tiers: [], switchedOn: {} };

if (process.argv.includes('--next-tier')) {
  const on = tiersOn(conf.tiers), next = TIERS[on.length];
  if (!next) { console.log('every tier is already on'); process.exit(0); }
  const prev = on[on.length - 1];
  if (prev && Date.now() - Date.parse(conf.switchedOn[prev]) < 7 * DAY) { console.log('REFUSED: ' + prev + ' has been on since ' + conf.switchedOn[prev] + ' — give it 7 days clean first'); process.exit(1); }
  conf.tiers = on.concat([next]); conf.switchedOn[next] = new Date().toISOString();
  writeFileSync(CONF, JSON.stringify(conf, null, 1));
  console.log('switched on ' + next + ' · tiers now: ' + conf.tiers.join(' → '));
  process.exit(0);
}

const status = {};
mkdirSync(PRIV + 'baselines', { recursive: true });
for (const name of ['simon', 'kar-session', 'kar-night']) {
  if (process.argv.includes('--status')) {
    const f = PRIV + 'baselines/' + name + '.light';
    const u = existsSync(f) ? unpack(new Uint8Array(readFileSync(f))) : { ok: false };
    status[name] = u.ok ? { formed: u.value.formed, actions: u.value.n, held: u.value.held !== null } : 'no baseline yet';
    continue;
  }
  const u = unpack(new Uint8Array(readFileSync(PRIV + name + '.light')));
  if (!u.ok) throw new Error(name + ': ' + u.why);
  let w = emptyWatcher(name), flagged = 0;
  for (const e of u.value) {
    const r = step(w, e, P); w = r.w;
    if (r.out.formed && rank(r.out.raw) >= 2) { flagged++; w = confirm(w, P); }
    if (w.pendingShift) w = confirmShift(w, P);
  }
  const p = pack(w);
  if (!p.ok) throw new Error(name + ': ' + p.why);
  writeFileSync(PRIV + 'baselines/' + name + '.light', p.bytes);
  status[name] = { formed: w.formed, actions: w.n, flaggedAndAnswered: flagged, lightBytes: p.bytes.length, sha256: createHash('sha256').update(p.bytes).digest('hex').slice(0, 16) };
}
if (!existsSync(CONF)) writeFileSync(CONF, JSON.stringify(conf, null, 1));
console.log(JSON.stringify({ tiers: tiersOn(conf.tiers), switchedOn: conf.switchedOn, baselines: status }, null, 1));
