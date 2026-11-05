// ════════════════════════════════════════════════════════════════
// cost.mjs — the buyer's case: what the rented route costs them and what running the BES layer costs them, from THEIR
// numbers and sourced figures only. Pure, total, deterministic, gated. Never a price for the BES layer: it is
// MIT-licensed, no licence fee.
//
// Two sourced files, every figure cited on the page beside the numbers:
//   basis  = vendor/sovereign-enterprise/basis.json — the estate's shared sourced basis, vendored byte for byte and
//            re-hashed in CI (tools/vendor.mjs --check): the UK median hourly wage (ONS), CPI (ONS), business electricity
//            (DESNZ) and the exchange rate (ECB). The same file the estate's other cost cases read (liveware mintcase).
//   prices = costs/sources.json — what this case needs that the shared basis does not carry: the published prices of
//            the rented route (Microsoft Entra ID P2 for each person, Microsoft Entra Workload ID for each AI agent)
//            and the chip's maximum draw.
//
//   costCase(basis, prices, input) → { ok, inputs, perYear: { rented, owned } (running costs), lines, over: { rented, owned },
//                                      differencePerYear, differenceOver } | { ok: false, why }
//   input = { people, agents, actionsPerDay (all keys together), msPerAction (the watch's measured CPU time per action),
//             stepUpsPerPerson, stepUpsPerAgent (a week each, answered by a person), minutesPerStepUp,
//             setupHours (the reader's own estimate of the hours to install and roll it out, once),
//             upkeepHoursPerYear (the reader's own estimate of the hours a year to keep it running: taking updates,
//             switching tiers on, reading its alerts), years (1 to 10) }
//
// Money is whole pence (integers). Floors on the rented side, never top ends on ours:
//   rented a year = (people × the P2 price + agents × the Workload ID price) × 12, US cents × £ per $ = pence, rounded
//   owned a year  = electricity: CPU-hours × the chip's MAXIMUM draw × business pence per kWh, rounded UP
//                 + people's time: every step-up a week × 52 × minutes, at the UK median hourly wage, rounded UP
//                 + upkeep: the reader's hours a year to keep it running, at the UK median hourly wage, rounded UP
//                 + licence 0
//   set-up, once  = setupHours at the UK median hourly wage, rounded UP, added to the first year of ours only (the
//                   rented route's own set-up is not counted, so the comparison never flatters ours; nor is its own
//                   administration, against which ours carries its upkeep)
//   over `years`: each later year rises by CPI (the basis's own rule), each year's pence rounded the same way.
//
//   measuredRates(receipt, fromIso, toIso) → { ok, weeks, perPerson, perAgent } — the step-up rates the real
//   measurement saw (distinct times asked + big shifts confirmed), a week, over the sealed test period.
// ════════════════════════════════════════════════════════════════
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const fin = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const pos = (x) => fin(x) && x > 0;
const WEEK = 7 * 86400000;

export const BASIS_KEYS = Object.freeze(['wageMedianHourly', 'electricityPencePerKwh', 'fxGbpPerUsd', 'cpi']);
export const PRICE_KEYS = Object.freeze(['entraP2CentsPerUserMonth', 'workloadIdCentsPerIdentityMonth', 'chipMaxWatts']);

/** the figures the case reads, or the name of the first one missing */
function figures(basis, prices) {
  const b = isObj(basis) ? basis : {}, p = isObj(prices) ? prices : {};
  const v = (k) => (isObj(b[k]) ? b[k].value : undefined);
  for (const k of ['wageMedianHourly', 'electricityPencePerKwh', 'fxGbpPerUsd']) if (!pos(v(k))) return { why: 'the sourced basis figure ' + k + ' is missing' };
  if (!fin(v('cpi'))) return { why: 'the sourced basis figure cpi is missing' };
  for (const k of PRICE_KEYS) if (!whole(p[k]) || p[k] === 0) return { why: 'the sourced price ' + k + ' is missing' };
  return { f: { wagePence: Math.round(v('wageMedianHourly') * 100), pencePerKwh: v('electricityPencePerKwh'), fx: v('fxGbpPerUsd'), cpi: v('cpi'), p2: p.entraP2CentsPerUserMonth, wl: p.workloadIdCentsPerIdentityMonth, watts: p.chipMaxWatts } };
}

/** a yearly cost in pence over `years`, each later year × (1 + cpi), each year rounded (up when `up`) */
export function over(perYear, cpi, years, up) {
  let total = 0, factor = 1;
  for (let y = 0; y < years; y++) { const x = perYear * factor; total += up ? Math.ceil(x) : Math.round(x); factor *= 1 + cpi; }
  return total;
}

export function costCase(basis, prices, input) {
  try {
    const got = figures(basis, prices);
    if (!got.f) return { ok: false, why: got.why };
    const f = got.f, i = isObj(input) ? input : {};
    for (const k of ['people', 'agents', 'actionsPerDay']) if (!whole(i[k])) return { ok: false, why: k + ' is a whole number' };
    for (const k of ['msPerAction', 'stepUpsPerPerson', 'stepUpsPerAgent', 'minutesPerStepUp', 'setupHours', 'upkeepHoursPerYear']) if (!fin(i[k])) return { ok: false, why: k + ' is a number ≥ 0' };
    if (!Number.isInteger(i.years) || i.years < 1 || i.years > 10) return { ok: false, why: 'years is a whole number from 1 to 10' };
    const cents = (i.people * f.p2 + i.agents * f.wl) * 12;
    const rented = Math.round(cents * f.fx);                                           // US cents × £ per $ = pence
    const cpuHours = (i.actionsPerDay * 365 * i.msPerAction) / 3600000;
    const kWh = (cpuHours * f.watts) / 1000;
    const power = Math.ceil(kWh * f.pencePerKwh);                                      // round UP: never understate ours
    const stepUps = (i.people * i.stepUpsPerPerson + i.agents * i.stepUpsPerAgent) * 52;
    const minutes = stepUps * i.minutesPerStepUp;
    const peopleTime = Math.ceil((minutes * f.wagePence) / 60);
    const upkeep = Math.ceil(i.upkeepHoursPerYear * f.wagePence);                       // a running cost: round UP
    const owned = power + peopleTime + upkeep;
    const setup = Math.ceil(i.setupHours * f.wagePence);                                // once, in the first year
    const total = { rented: over(rented, f.cpi, i.years, false), owned: over(owned, f.cpi, i.years, true) + setup };
    return {
      ok: true,
      inputs: { people: i.people, agents: i.agents, actionsPerDay: i.actionsPerDay, msPerAction: i.msPerAction, stepUpsPerPerson: i.stepUpsPerPerson, stepUpsPerAgent: i.stepUpsPerAgent, minutesPerStepUp: i.minutesPerStepUp, setupHours: i.setupHours, upkeepHoursPerYear: i.upkeepHoursPerYear, years: i.years },
      perYear: { rented, owned },
      lines: { rentedPeople: Math.round(i.people * f.p2 * 12 * f.fx), rentedAgents: Math.round(i.agents * f.wl * 12 * f.fx), licence: 0, power, peopleTime, upkeep, setup, cpuHours, kWh, stepUps, minutes },
      over: total,
      differencePerYear: rented - owned,
      differenceOver: total.rented - total.owned,
    };
  } catch { return { ok: false, why: 'the case could not be read' }; }
}

/** The step-up rates the real measurement saw, a week: the owner's (B4) per person, the agent's streams (B5) per agent. */
export function measuredRates(receipt, fromIso, toIso) {
  try {
    const from = Date.parse(fromIso), to = Date.parse(toIso);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return { ok: false, why: 'the test period could not be read' };
    const facts = isObj(receipt) && isObj(receipt.facts) ? receipt.facts : null;
    const owner = facts && isObj(facts.B4) && isObj(facts.B4.simon) ? facts.B4.simon : null;
    const agent = facts && isObj(facts.B5) ? Object.values(facts.B5).filter(isObj) : [];
    if (!owner || !agent.length) return { ok: false, why: 'the real receipt has no step-up counts' };
    const asked = (x) => (whole(x.episodes) ? x.episodes : 0) + (whole(x.shiftPrompts) ? x.shiftPrompts : 0);
    const weeks = (to - from) / WEEK;
    return { ok: true, weeks, perPerson: asked(owner) / weeks, perAgent: agent.reduce((s, x) => s + asked(x), 0) / weeks };
  } catch { return { ok: false, why: 'the real receipt could not be read' }; }
}

/** Whole pence as pounds for a page: 123456 → '£1,234.56'. */
export function pounds(pence) {
  if (!Number.isSafeInteger(pence)) return '—';
  const neg = pence < 0, v = Math.abs(pence);
  const s = '£' + Math.floor(v / 100).toLocaleString('en-GB') + '.' + String(v % 100).padStart(2, '0');
  return neg ? '−' + s : s;
}
