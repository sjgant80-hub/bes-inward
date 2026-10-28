// measure/judge.mjs — the sealed claims as a pure judge. Pure, total, gated. The bars are the ones sealed in
// measure/claims.json at 65a6364 and are carried here as constants — a sealed judge never imports live ones.
//
//   judge(facts) → { B1 … B7, L1: { held, why } }
// facts = the measurement's record (measure/measure.mjs). A missing or malformed fact fails its claim, never passes it.
export const SEAL = '65a6364';
export const BAR = Object.freeze({ sessions: 20, need: 19, fp: 0.01, b3Faults: 9, b3Actions: 20, b7Recovery: 12, l1Below: 10 });
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const verdict = (held, why) => ({ held, why });

/** Every driver named caught at least `need` of `sessions` times. */
function drivers(caught, names, label) {
  if (!isObj(caught)) return verdict(false, label + ': no record');
  const miss = [];
  for (const d of names) {
    const c = caught[d];
    if (!isObj(c) || !whole(c.caught) || c.sessions !== BAR.sessions) return verdict(false, label + ' ' + d + ': no complete record');
    if (c.caught < BAR.need) miss.push(d + ' ' + c.caught + '/' + c.sessions);
  }
  return miss.length ? verdict(false, label + ' below 19 of 20: ' + miss.join(', ')) : verdict(true, label + ': every driver caught in at least 19 of 20');
}
function rate(x, label) {
  if (!isObj(x) || !whole(x.judged) || !whole(x.fp) || x.fp > x.judged) return verdict(false, label + ': no record');
  if (x.judged === 0) return verdict(false, label + ': no formed action was judged');
  const r = x.fp / x.judged;
  return r <= BAR.fp ? verdict(true, label + ' ' + (100 * r).toFixed(2) + '% ≤ 1.0%') : verdict(false, label + ' ' + (100 * r).toFixed(2) + '% > 1.0%');
}
const both = (a, b) => verdict(a.held && b.held, a.why + '; ' + b.why);

export function judge(facts) {
  const f = isObj(facts) ? facts : {};
  const out = {};
  try {
    out.B1 = drivers(f.B1 && f.B1.simon, ['cadence', 'burst', 'uniform'], 'simon (STEP_UP+)');
    out.B2 = both(drivers(f.B2 && f.B2['kar-session'], ['cadence', 'burst', 'uniform', 'shuffled'], 'kar-session (BLOCK+)'), drivers(f.B2 && f.B2['kar-night'], ['cadence', 'burst', 'uniform', 'shuffled'], 'kar-night (BLOCK+)'));
    const b3 = f.B3;
    if (!isObj(b3) || !whole(b3.blocked) || !whole(b3.total) || !whole(b3.validPassed) || !whole(b3.validTotal)) out.B3 = verdict(false, 'no record');
    else {
      const total = BAR.b3Faults * BAR.b3Actions;
      const ok = b3.total === total && b3.blocked === total && b3.validTotal === BAR.b3Actions && b3.validPassed === BAR.b3Actions;
      out.B3 = verdict(ok, 'faults blocked ' + b3.blocked + '/' + b3.total + ' (sealed ' + total + '); valid passed ' + b3.validPassed + '/' + b3.validTotal);
    }
    out.B4 = rate(f.B4 && f.B4.simon, 'simon');
    out.B5 = both(rate(f.B5 && f.B5['kar-night'], 'kar-night'), rate(f.B5 && f.B5['kar-session'], 'kar-session'));
    const b6 = isObj(f.B6) ? f.B6 : {};
    const a = drivers(b6.a ? { borrowed: b6.a } : null, ['borrowed'], '(a) simon shapes on kar-night timing');
    const b = drivers(b6.b ? { borrowed: b6.b } : null, ['borrowed'], '(b) kar-session shapes on simon timing');
    const c = isObj(b6.c) && whole(b6.c.total) && whole(b6.c.raised) ? verdict(b6.c.raised === b6.c.total, '(c) raised ' + b6.c.raised + '/' + b6.c.total) : verdict(false, '(c) no record');
    out.B6 = verdict(a.held && b.held && c.held, [a.why, b.why, c.why].join('; '));
    const b7 = isObj(f.B7) ? f.B7 : {};
    const formOk = isObj(b7.formation) && ['simon', 'kar-session', 'kar-night'].every((s) => isObj(b7.formation[s]) && whole(b7.formation[s].actions) && b7.formation[s].enforcedNotAllow === 0);
    const recOk = isObj(b7.recovery) && b7.recovery.passed === BAR.b7Recovery && b7.recovery.total === BAR.b7Recovery;
    out.B7 = verdict(formOk && recOk, (formOk ? 'formation: nothing enforced' : 'formation: something was enforced, or no record') + '; recovery ' + (isObj(b7.recovery) ? b7.recovery.passed + '/' + b7.recovery.total : 'no record'));
    const l1 = f.L1 && f.L1.simon;
    out.L1 = isObj(l1) && whole(l1.caught) && l1.sessions === BAR.sessions
      ? verdict(l1.caught < BAR.l1Below, l1.caught < BAR.l1Below ? 'as predicted: only ' + l1.caught + ' of 20 perfect copies caught' : 'prediction FAILED: ' + l1.caught + ' of 20 perfect copies caught (BES did better than its author says)')
      : verdict(false, 'no record');
  } catch { for (const k of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'L1']) if (!out[k]) out[k] = verdict(false, 'the judge could not read the record'); }
  return out;
}
