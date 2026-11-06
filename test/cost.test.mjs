import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { costCase, measuredRates, over, pounds, loadedHour, BASIS_KEYS, PRICE_KEYS } from '../src/cost.mjs';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const basis = json('../vendor/sovereign-enterprise/basis.json');
const sources = json('../costs/sources.json');
const prices = sources.prices;
const real = json('../receipts/real.json');
const base = { people: 10, agents: 2, actionsPerDay: 5000, msPerAction: 1, stepUpsPerPerson: 1, stepUpsPerAgent: 2, minutesPerStepUp: 1, setupHours: 0, upkeepHoursPerYear: 0, years: 1 };
const withBasis = (k, v) => ({ ...basis, [k]: { ...basis[k], value: v } });
const HOUR = 2322;   // 1967p median wage × (1 + 15% employer NI + 3% minimum employer pension) = 2321.06p, rounded UP

test('the figures the case reads are the sourced ones', () => {
  assert.deepEqual([...BASIS_KEYS], ['wageMedianHourly', 'employerNiRate', 'pensionEmployerRate', 'electricityPencePerKwh', 'fxGbpPerUsd', 'cpi']);
  assert.deepEqual([...PRICE_KEYS], ['entraP2CentsPerUserMonth', 'workloadIdCentsPerIdentityMonth', 'chipMaxWatts']);
  for (const k of BASIS_KEYS) assert.ok(typeof basis[k].value === 'number' && typeof basis[k].source === 'string', 'basis ' + k);
  for (const k of PRICE_KEYS) assert.ok(sources.sources.some((s) => s.key === k && /^https:\/\//.test(s.url) && s.read), 'a cited source for ' + k);
  assert.equal(basis.wageMedianHourly.value, 19.67);
  assert.equal(basis.employerNiRate.value, 0.15);
  assert.equal(basis.pensionEmployerRate.value, 0.03);
  assert.equal(prices.entraP2CentsPerUserMonth, 1000);
  assert.equal(prices.workloadIdCentsPerIdentityMonth, 300);
  assert.equal(prices.chipMaxWatts, 55);
});

test('the rented route: each person × Entra ID P2 + each agent × Workload ID, × 12, US cents × £ per $', () => {
  const r = costCase(basis, prices, base);
  assert.equal(r.ok, true);
  assert.equal(r.perYear.rented, Math.round((10 * 1000 + 2 * 300) * 12 * basis.fxGbpPerUsd.value));
  assert.equal(r.perYear.rented, 95904);
  assert.equal(r.lines.rentedPeople, 90475);
  assert.equal(r.lines.rentedAgents, 5429);
  assert.equal(costCase(basis, prices, { ...base, people: 0, agents: 1 }).perYear.rented, 2714);   // 2714.256: rounded, not up
  assert.equal(costCase(basis, prices, { ...base, people: 0, agents: 0 }).perYear.rented, 0);
  assert.equal(costCase(basis, prices, { ...base, agents: 0 }).perYear.rented, 90475);              // 90475.2: rounded, not up
});

test('the owned route: electricity at the chip’s maximum draw, rounded up, plus step-ups at the loaded hour, rounded up', () => {
  const r = costCase(basis, prices, base);
  const kWh = ((5000 * 365 * 1) / 3600000) * 55 / 1000;
  assert.ok(Math.abs(r.lines.kWh - kWh) < 1e-12);
  assert.ok(Math.abs(r.lines.cpuHours - (5000 * 365) / 3600000) < 1e-12);
  assert.equal(r.lines.power, Math.ceil(kWh * 24.51));
  assert.equal(r.lines.power, 1);
  assert.equal(costCase(basis, prices, { ...base, actionsPerDay: 2000 }).lines.power, 1);           // 0.273p: rounded UP
  assert.equal(r.lines.stepUps, (10 * 1 + 2 * 2) * 52);
  assert.equal(r.lines.minutes, 728);
  assert.equal(r.lines.hourPence, HOUR);
  assert.equal(r.lines.loadedHourPence, HOUR);
  assert.equal(r.lines.peopleTime, Math.ceil((728 * HOUR) / 60));
  assert.equal(r.lines.peopleTime, 28174);                                                         // 28173.6: rounded UP
  assert.equal(r.lines.licence, 0);
  assert.equal(r.lines.upkeep, 0);
  assert.equal(r.perYear.owned, r.lines.power + r.lines.peopleTime);
  assert.equal(r.differencePerYear, r.perYear.rented - r.perYear.owned);
  assert.equal(r.differencePerYear, 67729);
  const z = costCase(basis, prices, { ...base, msPerAction: 0, stepUpsPerPerson: 0, stepUpsPerAgent: 0 });
  assert.equal(z.perYear.owned, 0);
  assert.equal(costCase(basis, prices, { ...base, minutesPerStepUp: 3 }).lines.minutes, 728 * 3);
  assert.equal(costCase(basis, prices, { ...base, stepUpsPerAgent: 0 }).lines.stepUps, 520);
  assert.equal(costCase(basis, prices, { ...base, stepUpsPerPerson: 0 }).lines.stepUps, 208);
});

test('set-up, once: the reader’s hours at the loaded hour, rounded up, in the first year of ours only', () => {
  const r = costCase(basis, prices, { ...base, setupHours: 8, years: 3 });
  assert.equal(r.lines.setup, 8 * HOUR);
  assert.equal(costCase(basis, prices, { ...base, setupHours: 0.001 }).lines.setup, 3);            // 2.322p: rounded UP
  assert.equal(r.perYear.owned, costCase(basis, prices, { ...base, years: 3 }).perYear.owned);     // not a running cost
  assert.equal(r.over.owned, over(r.perYear.owned, basis.cpi.value, 3, true) + 8 * HOUR);
  assert.equal(r.over.rented, costCase(basis, prices, { ...base, years: 3 }).over.rented);         // the rented side is not charged
  assert.equal(r.differenceOver, r.over.rented - r.over.owned);
  assert.equal(r.differencePerYear, r.perYear.rented - r.perYear.owned);
  assert.equal(r.inputs.setupHours, 8);
  assert.equal(costCase(basis, prices, base).lines.setup, 0);
});

test('upkeep: the reader’s hours a year to keep it running, at the loaded hour, rounded up, a running cost of ours only', () => {
  const r = costCase(basis, prices, { ...base, upkeepHoursPerYear: 12, years: 3 });
  const plain = costCase(basis, prices, { ...base, years: 3 });
  assert.equal(r.lines.upkeep, 12 * HOUR);
  assert.equal(r.perYear.owned, plain.perYear.owned + 12 * HOUR);                                 // every year, not once
  assert.equal(r.perYear.owned, r.lines.power + r.lines.peopleTime + r.lines.upkeep);
  assert.equal(r.over.owned, over(plain.perYear.owned + 12 * HOUR, basis.cpi.value, 3, true));     // rises by CPI like the rest
  assert.equal(r.perYear.rented, plain.perYear.rented);                                            // the rented side is not charged
  assert.equal(r.over.rented, plain.over.rented);
  assert.equal(r.differencePerYear, plain.differencePerYear - 12 * HOUR);
  assert.equal(r.lines.setup, 0);
  assert.equal(costCase(basis, prices, { ...base, upkeepHoursPerYear: 0.001 }).lines.upkeep, 3);   // 2.322p: rounded UP
  assert.equal(costCase(basis, prices, { ...base, upkeepHoursPerYear: 0.001 }).perYear.owned, plain.perYear.owned + 3);
  assert.equal(r.inputs.upkeepHoursPerYear, 12);
  const both = costCase(basis, prices, { ...base, setupHours: 8, upkeepHoursPerYear: 12, years: 2 });
  assert.equal(both.over.owned, over(plain.perYear.owned + 12 * HOUR, basis.cpi.value, 2, true) + 8 * HOUR);
});

test('the loaded hour: the median wage plus employer NI and the minimum employer pension, added in full, rounded up', () => {
  assert.deepEqual(loadedHour(basis), { ok: true, pence: HOUR, wagePence: 1967, ni: 0.15, pension: 0.03 });
  assert.equal(Math.ceil(1967 * (1 + 0.15 + 0.03)), HOUR);
  assert.equal(loadedHour(withBasis('employerNiRate', 0)).pence, 2027);                             // 2026.01: rounded UP
  assert.equal(loadedHour(withBasis('pensionEmployerRate', 0)).pence, 2263);                        // 2262.05: rounded UP
  assert.equal(loadedHour({ ...withBasis('employerNiRate', 0), pensionEmployerRate: { value: 0 } }).pence, 1967);
  assert.equal(loadedHour(withBasis('wageMedianHourly', 10)).pence, 1180);
  assert.equal(loadedHour(withBasis('employerNiRate', 0.5)).wagePence, 1967);
  assert.equal(loadedHour(withBasis('employerNiRate', 0.5)).ni, 0.5);
  assert.equal(loadedHour(withBasis('pensionEmployerRate', 0.05)).pension, 0.05);
  assert.match(loadedHour(null).why, /basis figure wageMedianHourly/);
  assert.match(loadedHour(withBasis('employerNiRate', 1)).why, /basis figure employerNiRate/);
  assert.match(loadedHour(withBasis('cpi', NaN)).why, /basis figure cpi/);
  assert.equal(loadedHour(withBasis('cpi', NaN)).ok, false);
  assert.equal(loadedHour({ get wageMedianHourly() { throw new Error('x'); } }).why, 'the basis could not be read');
  assert.equal(loadedHour(Object.assign([], basis)).ok, false);
  // the case uses it unless the reader gives their own hour; prices play no part in it
  const r = costCase(basis, prices, { ...base, setupHours: 2, upkeepHoursPerYear: 3 });
  assert.equal(r.lines.setup, 2 * HOUR);
  assert.equal(r.lines.upkeep, 3 * HOUR);
  assert.equal(r.inputs.hourPence, HOUR);
});

test('the reader’s own hour replaces the loaded one on every line of ours, never on the rented side', () => {
  const mine = { ...base, setupHours: 2, upkeepHoursPerYear: 3, hourPence: 6000 };
  const r = costCase(basis, prices, mine);
  assert.equal(r.ok, true);
  assert.equal(r.lines.hourPence, 6000);
  assert.equal(r.lines.loadedHourPence, HOUR);
  assert.equal(r.lines.peopleTime, Math.ceil((728 * 6000) / 60));
  assert.equal(r.lines.upkeep, 18000);
  assert.equal(r.lines.setup, 12000);
  assert.equal(r.inputs.hourPence, 6000);
  assert.equal(r.perYear.rented, 95904);
  assert.equal(r.perYear.owned, r.lines.power + r.lines.peopleTime + 18000);
  const free = costCase(basis, prices, { ...mine, hourPence: 0 });
  assert.equal(free.ok, true);
  assert.equal(free.perYear.owned, free.lines.power);
  assert.equal(free.lines.setup, 0);
  assert.equal(costCase(basis, prices, { ...base, hourPence: 0.5 }).lines.peopleTime, Math.ceil((728 * 0.5) / 60));
  assert.equal(costCase(basis, prices, { ...base, hourPence: undefined }).lines.hourPence, HOUR);
});

test('over the years: each later year rises by CPI, each year rounded (up on our side)', () => {
  assert.equal(over(1000, 0.5, 3, true), 1000 + 1500 + 2250);
  assert.equal(over(1001, 0.25, 2, true), 1001 + 1252);
  assert.equal(over(1001, 0.25, 2, false), 1001 + 1251);
  assert.equal(over(1000, 0, 1, false), 1000);
  assert.equal(over(1000, 0.5, 0, false), 0);
  const r = costCase(basis, prices, { ...base, years: 3 });
  assert.equal(r.over.rented, over(95904, basis.cpi.value, 3, false));
  assert.equal(r.over.owned, over(r.perYear.owned, basis.cpi.value, 3, true));
  assert.equal(r.differenceOver, r.over.rented - r.over.owned);
  assert.equal(costCase(basis, prices, base).over.rented, 95904);
  assert.equal(costCase(withBasis('cpi', 0), prices, { ...base, years: 2 }).over.rented, 2 * 95904);  // a CPI of 0 is a figure, not a gap
  assert.equal(r.inputs.years, 3);
  assert.deepEqual(r.inputs, { ...base, years: 3, hourPence: HOUR });
});

test('the case refuses what it cannot compute', () => {
  for (const k of ['people', 'agents', 'actionsPerDay']) {
    for (const bad of [-1, 1.5, '3', NaN]) assert.equal(costCase(basis, prices, { ...base, [k]: bad }).ok, false, k + ' ' + bad);
    assert.match(costCase(basis, prices, { ...base, [k]: -1 }).why, new RegExp(k));
    assert.equal(costCase(basis, prices, { ...base, [k]: 0 }).ok, true);
  }
  for (const k of ['msPerAction', 'stepUpsPerPerson', 'stepUpsPerAgent', 'minutesPerStepUp', 'setupHours', 'upkeepHoursPerYear']) {
    for (const bad of [-0.1, NaN, Infinity, '1', null]) assert.equal(costCase(basis, prices, { ...base, [k]: bad }).ok, false, k + ' ' + bad);
    assert.match(costCase(basis, prices, { ...base, [k]: NaN }).why, new RegExp(k));
    assert.equal(costCase(basis, prices, { ...base, [k]: 0 }).ok, true);
    assert.equal(costCase(basis, prices, { ...base, [k]: 0.5 }).ok, true);
  }
  for (const y of [0, 11, 1.5, '2', -1]) assert.match(costCase(basis, prices, { ...base, years: y }).why, /years/);
  for (const y of [1, 10]) assert.equal(costCase(basis, prices, { ...base, years: y }).ok, true);
  for (const k of ['wageMedianHourly', 'electricityPencePerKwh', 'fxGbpPerUsd']) {
    for (const bad of [0, -1, NaN, '19.67', undefined]) assert.equal(costCase(withBasis(k, bad), prices, base).ok, false, k + ' ' + bad);
    assert.match(costCase(withBasis(k, 0), prices, base).why, new RegExp('basis figure ' + k));
    assert.match(costCase({ ...basis, [k]: 5 }, prices, base).why, new RegExp(k));
  }
  for (const bad of [-0.01, NaN, undefined]) assert.match(costCase(withBasis('cpi', bad), prices, base).why, /basis figure cpi/);
  for (const k of ['employerNiRate', 'pensionEmployerRate']) {
    for (const bad of [-0.01, 1, 1.5, NaN, Infinity, '0.15', undefined, null]) assert.match(costCase(withBasis(k, bad), prices, base).why, new RegExp('basis figure ' + k), k + ' ' + bad);
    assert.match(costCase({ ...basis, [k]: 0.15 }, prices, base).why, new RegExp(k));
    assert.equal(costCase(withBasis(k, 0), prices, base).ok, true);                                  // a rate of 0 is a figure
    assert.equal(costCase(withBasis(k, 0.999), prices, base).ok, true);
  }
  assert.match(costCase(withBasis('wageMedianHourly', 0), prices, base).why, /wageMedianHourly/);   // the wage is read before the rates
  for (const bad of [-1, NaN, Infinity, '2322', null]) assert.match(costCase(basis, prices, { ...base, hourPence: bad }).why, /hourPence is a number ≥ 0/, 'hourPence ' + bad);
  for (const k of PRICE_KEYS) {
    for (const bad of [0, -1, 1.5, '1000', undefined]) assert.match(costCase(basis, { ...prices, [k]: bad }, base).why, new RegExp('sourced price ' + k));
  }
  assert.match(costCase(basis, prices, null).why, /people/);
  assert.match(costCase(null, prices, base).why, /basis figure wageMedianHourly/);
  assert.match(costCase(basis, null, base).why, /sourced price entraP2CentsPerUserMonth/);
  assert.equal(costCase(basis, prices, { ...base, get people() { throw new Error('x'); } }).why, 'the case could not be read');
});

test('an array or a function carrying the right fields is still not an input', () => {
  assert.equal(costCase(basis, prices, Object.assign([], base)).ok, false);
  assert.equal(costCase(basis, prices, Object.assign(() => 0, base)).ok, false);
  assert.equal(costCase(basis, Object.assign([], prices), base).ok, false);
  assert.equal(costCase(basis, Object.assign(() => 0, prices), base).ok, false);
  assert.equal(costCase(Object.assign([], basis), prices, base).ok, false);
  assert.equal(costCase(basis, prices, base).ok, true);
});

test('the step-up rates the real measurement saw, a week', () => {
  const from = '2026-10-07T00:00:00Z', to = real.provenance.cutoff;
  const r = measuredRates(real, from, to);
  assert.equal(r.ok, true);
  const weeks = (Date.parse(to) - Date.parse(from)) / (7 * 86400000);
  assert.equal(r.weeks, weeks);
  assert.ok(Math.abs(r.weeks - 21.75 / 7) < 1e-12);
  const f = real.facts;
  assert.equal(r.perPerson, (f.B4.simon.episodes + f.B4.simon.shiftPrompts) / weeks);
  const agent = Object.values(f.B5).reduce((s, x) => s + x.episodes + x.shiftPrompts, 0);
  assert.equal(r.perAgent, agent / weeks);
  assert.equal(agent, 10);
  const fx = (b4, b5) => ({ facts: { B4: { simon: b4 }, B5: b5 } });
  const w = measuredRates(fx({ episodes: 7, shiftPrompts: 7 }, { a: { episodes: 7, shiftPrompts: 0 }, b: { episodes: 0, shiftPrompts: 7 }, c: 'not a stream' }), '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z');
  assert.deepEqual(w, { ok: true, weeks: 2, perPerson: 7, perAgent: 7 });
  const junk = measuredRates(fx({ episodes: -1, shiftPrompts: 1.5 }, { a: { episodes: '3', shiftPrompts: 2 } }), '2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z');
  assert.deepEqual(junk, { ok: true, weeks: 1, perPerson: 0, perAgent: 2 });
});

test('the rates refuse what they cannot read', () => {
  const ok = { facts: { B4: { simon: { episodes: 1, shiftPrompts: 0 } }, B5: { a: { episodes: 1, shiftPrompts: 0 } } } };
  const F = '2026-01-01T00:00:00Z', T = '2026-01-08T00:00:00Z';
  assert.equal(measuredRates(ok, F, T).ok, true);
  for (const [a, b] of [[F, F], [T, F], ['x', T], [F, 'x'], [null, T]]) assert.equal(measuredRates(ok, a, b).why, 'the test period could not be read');
  const none = 'the real receipt has no step-up counts';
  assert.equal(measuredRates(null, F, T).why, none);
  assert.equal(measuredRates({}, F, T).why, none);
  assert.equal(measuredRates({ facts: null }, F, T).why, none);
  assert.equal(measuredRates({ facts: { B5: ok.facts.B5 } }, F, T).why, none);
  assert.equal(measuredRates({ facts: { B4: {}, B5: ok.facts.B5 } }, F, T).why, none);
  assert.equal(measuredRates({ facts: { B4: ok.facts.B4 } }, F, T).why, none);
  assert.equal(measuredRates({ facts: { B4: ok.facts.B4, B5: {} } }, F, T).why, none);
  assert.equal(measuredRates({ facts: { B4: ok.facts.B4, B5: { a: 'x' } } }, F, T).why, none);
  assert.equal(measuredRates(Object.assign([], ok), F, T).why, none);
  assert.equal(measuredRates({ facts: Object.assign([], ok.facts) }, F, T).why, none);
  assert.equal(measuredRates({ facts: { B4: Object.assign([], { simon: ok.facts.B4.simon }), B5: ok.facts.B5 } }, F, T).why, none);
  assert.equal(measuredRates({ get facts() { throw new Error('x'); } }, F, T).why, 'the real receipt could not be read');
});

test('pounds', () => {
  assert.equal(pounds(123456), '£1,234.56');
  assert.equal(pounds(5), '£0.05');
  assert.equal(pounds(0), '£0.00');
  assert.equal(pounds(-250), '−£2.50');
  assert.equal(pounds(1.5), '—');
  assert.equal(pounds('x'), '—');
});
