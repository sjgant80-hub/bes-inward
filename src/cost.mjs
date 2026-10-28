// ════════════════════════════════════════════════════════════════
// cost.mjs — the buyer's case, computed from THEIR numbers and sourced prices (costs/sources.json). Pure, total, gated.
// Never a price for the BES layer: it is MIT-licensed, no licence fee.
//
//   costCase(input, prices) → { ok, rented, bes, saving, lines } | { ok: false, why }
//   input = { people (who hold keys), agents (AI agents on their own keys), actionsPerDay (all keys together),
//             msPerAction (the watch's measured CPU time per action), promptsPerWeek (the owner's measured step-ups),
//             minutesPerPrompt }
// Every money figure is in whole pence (integers); the rented side converts dollars at the sourced rate.
//
//   rented  = people × the identity-protection seat × 12 months (agents are left OUT of the rented side: their
//             workload identities are priced separately and not counted here, so the rented bill is understated)
//   bes     = electricity for the watch's CPU time at the chip's maximum draw + the owner's time answering step-ups
//             at the National Living Wage. Licence: 0.
// ════════════════════════════════════════════════════════════════
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const fin = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

export function costCase(input, prices) {
  try {
    const i = isObj(input) ? input : {}, p = isObj(prices) ? prices : {};
    for (const k of ['people', 'agents', 'actionsPerDay']) if (!whole(i[k])) return { ok: false, why: k + ' is a whole number' };
    for (const k of ['msPerAction', 'promptsPerWeek', 'minutesPerPrompt']) if (!fin(i[k])) return { ok: false, why: k + ' is a number ≥ 0' };
    for (const k of ['entraP2CentsPerUserMonth', 'fx10k', 'unitRateCentiPence', 'laptopMaxWatts', 'nlwPence']) if (!whole(p[k]) || p[k] === 0) return { ok: false, why: 'the sourced price ' + k + ' is missing' };
    const rentedCents = i.people * p.entraP2CentsPerUserMonth * 12;
    const rented = Math.round((rentedCents * 10000) / p.fx10k);                       // cents → pence at the sourced rate
    const cpuHours = (i.actionsPerDay * 365 * i.msPerAction) / 3600000;
    const kWh = (cpuHours * p.laptopMaxWatts) / 1000;
    const power = Math.ceil((kWh * p.unitRateCentiPence) / 100);                      // round UP: never understate ours
    const minutes = i.promptsPerWeek * 52 * i.minutesPerPrompt;
    const people = Math.ceil((minutes * p.nlwPence) / 60);
    const bes = power + people;
    return { ok: true, rented, bes, saving: rented - bes, lines: { rentedSeats: rented, besLicence: 0, besPower: power, besPeopleTime: people, kWh, cpuHours, promptMinutes: minutes } };
  } catch { return { ok: false, why: 'the case could not be read' }; }
}

/** Whole pence as pounds for a page: 123456 → '£1,234.56'. */
export function pounds(pence) {
  if (!Number.isSafeInteger(pence)) return '—';
  const neg = pence < 0, v = Math.abs(pence);
  const s = '£' + Math.floor(v / 100).toLocaleString('en-GB') + '.' + String(v % 100).padStart(2, '0');
  return neg ? '−' + s : s;
}
