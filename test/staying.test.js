import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toReport, diff, diffIsEmpty, toCsv, toMarkdown, toChat, halfLifeFromCurve, spark } from '../staying.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8'));
const market = load('market.json');
const prev = load('previous.json');
const app = load('app.json');
const prevApp = load('previous-app.json');

test('reads a market response, an app response or a saved report', () => {
  const m = toReport(market);
  assert.equal(m.kind, 'market');
  assert.equal(m.advertisers.length, 4);
  assert.equal(toReport(m), m);
  const a = toReport(app);
  assert.equal(a.kind, 'app');
  assert.equal(a.weeks.length, 26);
  assert.throws(() => toReport({ hello: 1 }), /Expected a GET/);
});

test('survival readings come from the curve, half-life from the first day at or below 50%', () => {
  const m = toReport(market);
  const all = m.survival.find((s) => s.format === 'all');
  assert.equal(all.day30, market.survival[0].stillRunning[30]);
  assert.equal(all.halfLifeFromCurve, halfLifeFromCurve(market.survival[0].stillRunning));
  assert.equal(halfLifeFromCurve([1, 0.8, 0.6]), null);
  assert.equal(halfLifeFromCurve([1, 0.6, 0.5, 0.4]), 2);
  assert.equal(halfLifeFromCurve(undefined), null);
  assert.equal(m.totals.halfLifeDays, market.totals.halfLifeDays);
});

test('insights skip thin slices and the partial week', () => {
  const m = toReport(market);
  const cta = m.insights.factors.find((f) => f.factor === 'cta');
  assert.equal(cta.best, 'Learn more'); // "Shop now" has 12 ads, under the 30-ad floor
  assert.equal(cta.points, 7);
  const copy = m.insights.factors.find((f) => f.factor === 'copy_length');
  assert.equal(copy.best, '51-125');
  assert.equal(m.insights.formatSpread.best, 'video');
  assert.equal(m.insights.formatSpread.worst, 'image');
  assert.equal(m.insights.cadenceTrend.newLast4, 42 + 49 + 45 + 43);
  assert.equal(toReport(market, { minAds: 5 }).insights.factors[0].best, 'Shop now');
});

test('derived share only when live ads exist; missing values stay null', () => {
  const m = toReport(market);
  const fit = m.advertisers.find((a) => a.advertiserExternalId === 'example-fit');
  assert.equal(Math.round(fit.liveBeyond30Share * 100), 34);
  const odd = toReport({ ...market, advertisers: [{ advertiserExternalId: 'x', liveAds: 0, liveBeyond30Days: 0 }] });
  assert.equal(odd.advertisers[0].liveBeyond30Share, null);
  assert.equal(odd.advertisers[0].medianRunDays, null);
  const none = m.factors.find((f) => f.factor === 'copy_length').slices.find((s) => s.key === '500+');
  assert.equal(none.stillRunningAt30Days, null);
});

test('market diff against previous run', () => {
  const d = diff(toReport(market), toReport(prev));
  assert.deepEqual(d.newAdvertisers, ['Example Meal Planner']);
  assert.deepEqual(d.goneAdvertisers, ['Example Old Advertiser']);
  assert.ok(d.totals.some((t) => t.key === 'liveAds' && t.from === 351 && t.to === 372));
  assert.ok(d.advertiserMoves.some((m) => m.name === 'Example Fitness'));
  assert.ok(d.factorMoves.some((m) => m.label === '51-125'));
  assert.equal(diff(toReport(market), null), null);
  assert.equal(diff(toReport(market), toReport(app)), null); // different kind
  assert.equal(diffIsEmpty(diff(toReport(market), toReport(market))), true);
});

test('app report and diff', () => {
  const a = toReport(app);
  assert.equal(a.storeId, '6480417616');
  assert.equal(a.pace.newLast4Weeks, app.weeks.slice(-4).reduce((s, w) => s + w.newAds, 0));
  const d = diff(a, toReport(prevApp));
  assert.deepEqual(d.goneLandingPages, ['oldfunnel.example/offer']);
  assert.ok(d.totals.some((t) => t.key === 'ads' && t.from === 31 && t.to === 36));
});

test('outputs', () => {
  const m = toReport(market);
  const md = toMarkdown(m, diff(m, toReport(prev)));
  assert.match(md, /Paid-ad staying power/);
  assert.match(md, /not spend, reach or performance/);
  assert.match(md, /🆕 Advertisers now listed/);
  assert.match(md, /Slices under 30 ads are left out/);
  const csv = toCsv(m).split('\n');
  assert.equal(csv.length, 5);
  assert.match(csv[0], /^advertiser_external_id,name/);
  assert.equal(toCsv(toReport(app)).split('\n').length, 27);
  assert.match(toChat(m), /Paid-ad staying power: 1,260 ads/);
  assert.match(toMarkdown(toReport(app)), /no spend, impression, reach or country field/);
  assert.equal(spark([0, 5, 10]).length, 3);
});
