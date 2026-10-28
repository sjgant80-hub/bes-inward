import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { costCase, pounds } from '../src/cost.mjs';

const prices = JSON.parse(readFileSync(new URL('../costs/sources.json', import.meta.url), 'utf8')).prices;
const base = { people: 10, agents: 2, actionsPerDay: 5000, msPerAction: 1, promptsPerWeek: 1, minutesPerPrompt: 1 };

test('the rented seats: people × the sourced seat × 12, converted at the sourced rate', () => {
  const r = costCase(base, prices);
  assert.equal(r.ok, true);
  assert.equal(r.rented, Math.round((10 * 1000 * 12 * 10000) / 13363));
  assert.equal(r.rented, 89800);
  assert.equal(costCase({ ...base, people: 0 }, prices).rented, 0);
  assert.equal(costCase({ ...base, agents: 50 }, prices).rented, r.rented);       // agents are not counted on the rented side
});

test('ours: electricity at the chip’s maximum draw, rounded up, plus the owner’s time at the living wage', () => {
  const r = costCase(base, prices);
  const kWh = (5000 * 365 * 1 / 3600000) * 55 / 1000;
  assert.ok(Math.abs(r.lines.kWh - kWh) < 1e-12);
  assert.equal(r.lines.besPower, Math.ceil(kWh * 2632 / 100));
  assert.equal(r.lines.besPeopleTime, Math.ceil(52 * 1271 / 60));
  assert.equal(r.lines.besLicence, 0);
  assert.equal(r.bes, r.lines.besPower + r.lines.besPeopleTime);
  assert.equal(r.saving, r.rented - r.bes);
  assert.equal(r.lines.promptMinutes, 52);
  assert.equal(costCase({ ...base, msPerAction: 0, promptsPerWeek: 0 }, prices).bes, 0);
  assert.equal(costCase({ ...base, promptsPerWeek: 2, minutesPerPrompt: 3 }, prices).lines.besPeopleTime, Math.ceil(312 * 1271 / 60));
});

test('the case refuses what it cannot compute', () => {
  for (const k of ['people', 'agents', 'actionsPerDay']) { assert.equal(costCase({ ...base, [k]: -1 }, prices).ok, false); assert.equal(costCase({ ...base, [k]: 1.5 }, prices).ok, false); }
  for (const k of ['msPerAction', 'promptsPerWeek', 'minutesPerPrompt']) { assert.equal(costCase({ ...base, [k]: -0.1 }, prices).ok, false); assert.equal(costCase({ ...base, [k]: NaN }, prices).ok, false); }
  assert.equal(costCase({ ...base, msPerAction: 0.5 }, prices).ok, true);
  for (const k of ['entraP2CentsPerUserMonth', 'fx10k', 'unitRateCentiPence', 'laptopMaxWatts', 'nlwPence']) { assert.equal(costCase(base, { ...prices, [k]: 0 }).ok, false); assert.match(costCase(base, { ...prices, [k]: undefined }).why, new RegExp(k)); }
  assert.equal(costCase(null, prices).ok, false);
  assert.equal(costCase(base, null).ok, false);
  assert.equal(costCase({ get people() { throw new Error('x'); } }, prices).ok, false);
});

test('pounds', () => {
  assert.equal(pounds(123456), '£1,234.56');
  assert.equal(pounds(5), '£0.05');
  assert.equal(pounds(0), '£0.00');
  assert.equal(pounds(-250), '−£2.50');
  assert.equal(pounds(1.5), '—');
  assert.equal(pounds('x'), '—');
});

test('an array or a function carrying the right fields is still not an input', () => {
  assert.equal(costCase(Object.assign([], base), prices).ok, false);
  assert.equal(costCase(Object.assign(() => 0, base), prices).ok, false);
  assert.equal(costCase(base, Object.assign([], prices)).ok, false);
  assert.equal(costCase(base, Object.assign(() => 0, prices)).ok, false);
});
