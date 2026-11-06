// Paid-ad staying power from PeekPanda's stored paid-ad observations.
//   market: GET /v1/paid-ads/intelligence                          (MCP get_ads, action intelligence)
//   app:    GET /v1/competitors/ios/{storeId}/paid-ads/intelligence (MCP get_ads, action app_intelligence)
// Pure functions, shared by cli.js, the tests and index.html. No dependencies.
// These figures describe ads PeekPanda collected. They are not spend, reach or performance.

const isMarket = (x) => x && typeof x === 'object' && Array.isArray(x.advertisers) && Array.isArray(x.survival) && x.totals;
const isApp = (x) => x && typeof x === 'object' && Array.isArray(x.weeks) && typeof x.storeId === 'string' && x.totals;
const isReport = (x) => x && x.tool === 'paid-ad-staying-power' && (x.kind === 'market' || x.kind === 'app');

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const arr = (a) => (Array.isArray(a) ? a : []);
const sum = (a) => a.reduce((s, v) => s + v, 0);

export const MIN_ADS_DEFAULT = 30;

// stillRunning[0] is launch day, stillRunning[90] is day 90 (docs).
const readDay = (curve, d) => (Array.isArray(curve) ? num(curve[d]) : null);
// First day at or below 50% still running. null when the curve never gets there in 90 days.
export function halfLifeFromCurve(curve) {
  if (!Array.isArray(curve)) return null;
  const i = curve.findIndex((v) => typeof v === 'number' && v <= 0.5);
  return i < 0 ? null : i;
}

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const days = (n) => (n == null ? '—' : `${n}d`);
const BARS = '▁▂▃▄▅▆▇█';
export function spark(values) {
  const v = arr(values).map((x) => num(x) ?? 0);
  if (!v.length) return '';
  const max = Math.max(...v);
  if (max <= 0) return BARS[0].repeat(v.length);
  return v.map((x) => BARS[Math.min(7, Math.round((x / max) * 7))]).join('');
}

function countRows(rows) {
  return arr(rows).map((r) => ({ key: r.key ?? r.band ?? null, label: r.label ?? r.band ?? r.key ?? null, count: num(r.count) ?? 0 }));
}

function marketReport(raw, { filters, fetchedAt, minAds }) {
  const t = raw.totals ?? {};
  const survival = arr(raw.survival).map((s) => {
    const c = Array.isArray(s.stillRunning) ? s.stillRunning : [];
    return {
      format: s.format ?? null,
      ads: num(s.ads),
      day7: readDay(c, 7), day14: readDay(c, 14), day30: readDay(c, 30), day60: readDay(c, 60), day90: readDay(c, 90),
      halfLifeFromCurve: halfLifeFromCurve(c),
      curve: c,
    };
  });
  const factors = arr(raw.lastingFactors).map((f) => ({
    factor: f.factor ?? null,
    slices: arr(f.slices).map((s) => ({
      key: s.key ?? null, label: s.label ?? s.key ?? null, ads: num(s.ads) ?? 0,
      stillRunningAt30Days: num(s.stillRunningAt30Days),
      thin: (num(s.ads) ?? 0) < minAds,
    })),
  }));
  const advertisers = arr(raw.advertisers).map((a) => {
    const live = num(a.liveAds);
    const beyond = num(a.liveBeyond30Days);
    const weekly = arr(a.weeklyNewAds).map((x) => num(x) ?? 0);
    return {
      advertiserExternalId: a.advertiserExternalId ?? null,
      name: a.name ?? null,
      productExternalId: a.productExternalId ?? null,
      category: a.category ?? null,
      liveAds: live, totalAds: num(a.totalAds), newLast7Days: num(a.newLast7Days),
      liveBeyond30Days: beyond,
      // Derived here: share of this advertiser's live ads that are older than 30 days.
      liveBeyond30Share: live && beyond != null ? beyond / live : null,
      weeklyNewAds: weekly,
      weeklyNewAdsTotal: weekly.length ? sum(weekly) : null,
      medianRunDays: num(a.medianRunDays), longestRunDays: num(a.longestRunDays),
      formatMix: a.formatMix && typeof a.formatMix === 'object' ? a.formatMix : null,
      topCta: a.topCta ?? null, topDestinationKind: a.topDestinationKind ?? null,
      storeRating: num(a.storeRating), storeRatingCount: num(a.storeRatingCount),
    };
  });
  const cadence = arr(raw.cadence).map((w) => ({
    weekStart: w.weekStart ?? null, newAds: num(w.newAds) ?? 0, advertisers: num(w.advertisers),
    stoppedAds: num(w.stoppedAds) ?? 0, isPartial: w.isPartial === true,
  }));
  return {
    tool: 'paid-ad-staying-power',
    kind: 'market',
    fetchedAt, filters, minAds,
    generatedAt: raw.generatedAt ?? null,
    scope: raw.scope ?? null,
    totals: {
      ads: num(t.ads), liveAds: num(t.liveAds), advertisers: num(t.advertisers), liveAdvertisers: num(t.liveAdvertisers),
      newAdsLast7Days: num(t.newAdsLast7Days), advertisersShippingLast7Days: num(t.advertisersShippingLast7Days),
      stoppedLast7Days: num(t.stoppedLast7Days), halfLifeDays: num(t.halfLifeDays), stillRunningAt30Days: num(t.stillRunningAt30Days),
      medianRunDays: num(t.medianRunDays), longestRunDays: num(t.longestRunDays), liveBeyond60Days: num(t.liveBeyond60Days),
      reachDisclosedAds: num(t.reachDisclosedAds), unlinkedAds: num(t.unlinkedAds), uncategorizedLiveAds: num(t.uncategorizedLiveAds),
    },
    survival, factors, advertisers, cadence,
    categories: arr(raw.categories).map((c) => ({
      category: c.category ?? null, advertisers: num(c.advertisers), liveAds: num(c.liveAds), newLast7Days: num(c.newLast7Days),
      medianRunDays: num(c.medianRunDays), stillRunningAt30Days: num(c.stillRunningAt30Days), halfLifeDays: num(c.halfLifeDays),
    })),
    longevity: countRows(raw.longevity), formats: countRows(raw.formats), ctas: countRows(raw.ctas), destinations: countRows(raw.destinations),
    insights: marketInsights({ survival, factors, advertisers, cadence }),
  };
}

function marketInsights({ survival, factors, advertisers, cadence }) {
  const out = {};
  const fmts = survival.filter((s) => s.format !== 'all' && s.day30 != null && (s.ads ?? 0) >= 1);
  if (fmts.length >= 2) {
    const sorted = [...fmts].sort((a, b) => b.day30 - a.day30);
    out.formatSpread = { best: sorted[0].format, worst: sorted[sorted.length - 1].format, bestDay30: sorted[0].day30, worstDay30: sorted[sorted.length - 1].day30 };
  }
  out.factors = factors.map((f) => {
    const ok = f.slices.filter((s) => s.stillRunningAt30Days != null && !s.thin);
    if (ok.length < 2) return { factor: f.factor, best: null, worst: null, points: null };
    const sorted = [...ok].sort((a, b) => b.stillRunningAt30Days - a.stillRunningAt30Days);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    return { factor: f.factor, best: best.label, bestAds: best.ads, bestDay30: best.stillRunningAt30Days, worst: worst.label, worstAds: worst.ads, worstDay30: worst.stillRunningAt30Days, points: Math.round((best.stillRunningAt30Days - worst.stillRunningAt30Days) * 100) };
  });
  const complete = cadence.filter((w) => !w.isPartial);
  if (complete.length >= 8) {
    const last4 = complete.slice(-4), prev4 = complete.slice(-8, -4);
    out.cadenceTrend = {
      newLast4: sum(last4.map((w) => w.newAds)), newPrev4: sum(prev4.map((w) => w.newAds)),
      stoppedLast4: sum(last4.map((w) => w.stoppedAds)), stoppedPrev4: sum(prev4.map((w) => w.stoppedAds)),
      weeks: `${prev4[0].weekStart} → ${last4[last4.length - 1].weekStart}`,
    };
  }
  const withLong = advertisers.filter((a) => a.liveBeyond30Days != null);
  out.longestStandingAdvertisers = [...withLong].sort((a, b) => b.liveBeyond30Days - a.liveBeyond30Days || (b.liveAds ?? 0) - (a.liveAds ?? 0)).slice(0, 3).map((a) => ({ name: a.name, liveBeyond30Days: a.liveBeyond30Days, liveAds: a.liveAds }));
  return out;
}

function appReport(raw, { filters, fetchedAt }) {
  const t = raw.totals ?? {};
  const weeks = arr(raw.weeks).map((w) => ({ weekStart: w.weekStart ?? null, newAds: num(w.newAds) ?? 0, liveAds: num(w.liveAds) ?? 0 }));
  const last4 = weeks.slice(-4), prev4 = weeks.slice(-8, -4);
  const launchWeeks = weeks.filter((w) => w.newAds > 0).length;
  return {
    tool: 'paid-ad-staying-power',
    kind: 'app',
    fetchedAt, filters,
    generatedAt: raw.generatedAt ?? null,
    storeId: raw.storeId,
    advertiserExternalId: raw.advertiserExternalId ?? null,
    advertiserCount: num(t.advertisers) ?? arr(raw.advertisers).length,
    totals: {
      ads: num(t.ads), liveAds: num(t.liveAds), advertisers: num(t.advertisers), newAdsLast7Days: num(t.newAdsLast7Days),
      newAdsLast30Days: num(t.newAdsLast30Days), medianRunDays: num(t.medianRunDays), longestRunDays: num(t.longestRunDays),
    },
    weeks,
    // Derived here from the weeks array (26 UTC Monday weeks, oldest first).
    pace: weeks.length >= 8 ? { newLast4Weeks: sum(last4.map((w) => w.newAds)), newPrev4Weeks: sum(prev4.map((w) => w.newAds)), weeksWithLaunches: launchWeeks, weeks: weeks.length } : { weeksWithLaunches: launchWeeks, weeks: weeks.length },
    longevity: countRows(raw.longevity), formats: countRows(raw.formats), ctas: countRows(raw.ctas), destinations: countRows(raw.destinations),
    landingPages: arr(raw.landingPages).map((p) => ({
      page: p.page ?? null, url: p.url ?? null, kind: p.kind ?? null, adCount: num(p.adCount), activeCount: num(p.activeCount),
      firstSeenAt: p.firstSeenAt ?? null, lastSeenAt: p.lastSeenAt ?? null,
    })),
    longestRunningCount: arr(raw.longestRunning).length,
  };
}

// Input: one market response, one single-app response, or a report this tool saved.
export function toReport(input, { filters = {}, fetchedAt = null, minAds = MIN_ADS_DEFAULT } = {}) {
  if (isReport(input)) return input;
  if (isMarket(input)) return marketReport(input, { filters, fetchedAt, minAds });
  if (isApp(input)) return appReport(input, { filters, fetchedAt });
  throw new Error('Expected a GET /v1/paid-ads/intelligence response, a GET /v1/competitors/ios/{storeId}/paid-ads/intelligence response, or a saved report.');
}

const TOTAL_KEYS = [
  ['ads', 'ads collected'], ['liveAds', 'live ads'], ['newAdsLast7Days', 'new in 7 days'], ['stoppedLast7Days', 'stopped in 7 days'],
  ['halfLifeDays', 'half-life days'], ['stillRunningAt30Days', 'still running at day 30'], ['medianRunDays', 'median run days'], ['liveBeyond60Days', 'live beyond 60 days'],
];

// Compare with a report saved by an earlier run (same kind only).
export function diff(rep, prev) {
  if (!prev || prev.kind !== rep.kind) return null;
  if (rep.kind === 'app') {
    if (prev.storeId !== rep.storeId) return null;
    const out = { totals: [], newLandingPages: [], goneLandingPages: [] };
    for (const [k, label] of [['ads', 'ads collected'], ['liveAds', 'live ads'], ['newAdsLast7Days', 'new in 7 days'], ['newAdsLast30Days', 'new in 30 days'], ['medianRunDays', 'median run days'], ['longestRunDays', 'longest run days']]) {
      const a = prev.totals[k], b = rep.totals[k];
      if (a != null && b != null && a !== b) out.totals.push({ key: k, label, from: a, to: b });
    }
    const old = new Set(prev.landingPages.map((p) => p.page));
    const now = new Set(rep.landingPages.map((p) => p.page));
    out.newLandingPages = rep.landingPages.filter((p) => !old.has(p.page)).map((p) => p.page);
    out.goneLandingPages = prev.landingPages.filter((p) => !now.has(p.page)).map((p) => p.page);
    return out;
  }
  const out = { totals: [], newAdvertisers: [], goneAdvertisers: [], advertiserMoves: [], survivalMoves: [], factorMoves: [] };
  for (const [k, label] of TOTAL_KEYS) {
    const a = prev.totals[k], b = rep.totals[k];
    if (a != null && b != null && a !== b) out.totals.push({ key: k, label, from: a, to: b });
  }
  const oldAdv = new Map(prev.advertisers.map((a) => [a.advertiserExternalId, a]));
  const nowIds = new Set(rep.advertisers.map((a) => a.advertiserExternalId));
  for (const a of rep.advertisers) {
    const o = oldAdv.get(a.advertiserExternalId);
    if (!o) { out.newAdvertisers.push(a.name ?? a.advertiserExternalId); continue; }
    const parts = [];
    if (o.liveAds != null && a.liveAds != null && o.liveAds !== a.liveAds) parts.push(`live ${o.liveAds} → ${a.liveAds}`);
    if (o.liveBeyond30Days != null && a.liveBeyond30Days != null && o.liveBeyond30Days !== a.liveBeyond30Days) parts.push(`live beyond 30d ${o.liveBeyond30Days} → ${a.liveBeyond30Days}`);
    if (parts.length) out.advertiserMoves.push({ name: a.name ?? a.advertiserExternalId, parts });
  }
  out.goneAdvertisers = prev.advertisers.filter((a) => !nowIds.has(a.advertiserExternalId)).map((a) => a.name ?? a.advertiserExternalId);
  const oldSurv = new Map(prev.survival.map((s) => [s.format, s]));
  for (const s of rep.survival) {
    const o = oldSurv.get(s.format);
    if (o && o.day30 != null && s.day30 != null && Math.abs(o.day30 - s.day30) >= 0.01) out.survivalMoves.push({ format: s.format, from: o.day30, to: s.day30 });
  }
  const oldF = new Map();
  for (const f of prev.factors) for (const s of f.slices) oldF.set(`${f.factor}:${s.key}`, s);
  for (const f of rep.factors) for (const s of f.slices) {
    const o = oldF.get(`${f.factor}:${s.key}`);
    if (o && o.stillRunningAt30Days != null && s.stillRunningAt30Days != null && Math.abs(o.stillRunningAt30Days - s.stillRunningAt30Days) >= 0.02) {
      out.factorMoves.push({ factor: f.factor, label: s.label, from: o.stillRunningAt30Days, to: s.stillRunningAt30Days });
    }
  }
  return out;
}

export function diffIsEmpty(d) {
  return Object.values(d).every((v) => Array.isArray(v) && v.length === 0);
}

const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|');
const dayOf = (s) => (s ? String(s).slice(0, 10) : '—');
const FACTOR_NAMES = { cta: 'Button text (CTA)', copy_length: 'Body-copy length (characters)' };
const factorName = (f) => FACTOR_NAMES[f] ?? f;

function diffLines(d) {
  const L = [];
  if (d.totals?.length) L.push(`Totals: ${d.totals.map((x) => `${x.label} ${x.key === 'stillRunningAt30Days' ? `${pct(x.from)} → ${pct(x.to)}` : `${fmt(x.from)} → ${fmt(x.to)}`}`).join('; ')}`);
  if (d.newAdvertisers?.length) L.push(`🆕 Advertisers now listed: ${d.newAdvertisers.join(', ')}`);
  if (d.goneAdvertisers?.length) L.push(`No longer in the list: ${d.goneAdvertisers.join(', ')}`);
  if (d.advertiserMoves?.length) L.push(`Advertiser moves: ${d.advertiserMoves.slice(0, 8).map((m) => `${m.name} ${m.parts.join(', ')}`).join('; ')}`);
  if (d.survivalMoves?.length) L.push(`Day-30 survival by format: ${d.survivalMoves.map((m) => `${m.format} ${pct(m.from)} → ${pct(m.to)}`).join('; ')}`);
  if (d.factorMoves?.length) L.push(`Lasting-factor moves (2+ points): ${d.factorMoves.slice(0, 8).map((m) => `${m.label} ${pct(m.from)} → ${pct(m.to)}`).join('; ')}`);
  if (d.newLandingPages?.length) L.push(`🆕 Landing pages: ${d.newLandingPages.join(', ')}`);
  if (d.goneLandingPages?.length) L.push(`Landing pages no longer listed: ${d.goneLandingPages.join(', ')}`);
  return L;
}

function marketMarkdown(rep, d, top) {
  const L = [];
  const t = rep.totals;
  const bits = Object.entries(rep.filters || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`);
  L.push(`## Paid-ad staying power${rep.scope ? ' (scoped)' : ' (stored library)'}`);
  L.push('');
  if (bits.length) L.push(`Filters: ${bits.join(', ')}.`);
  L.push(`Read at ${rep.generatedAt ?? 'an unknown time'}. ${fmt(t.ads)} ads collected from ${fmt(t.advertisers)} advertiser${t.advertisers === 1 ? '' : 's'}; ${fmt(t.liveAds)} live now (${fmt(t.liveAdvertisers)} advertiser${t.liveAdvertisers === 1 ? '' : 's'} live).`);
  L.push(`Of the ads collected, ${pct(t.stillRunningAt30Days)} were still running 30 days after launch; half had stopped by day ${t.halfLifeDays ?? '— (more than half still run at day 90)'}. Median run ${days(t.medianRunDays)}, longest ${days(t.longestRunDays)}, ${fmt(t.liveBeyond60Days)} live beyond 60 days.`);
  L.push(`Last 7 days: ${fmt(t.newAdsLast7Days)} new from ${fmt(t.advertisersShippingLast7Days)} advertiser${t.advertisersShippingLast7Days === 1 ? '' : 's'}, ${fmt(t.stoppedLast7Days)} stopped.`);
  L.push('');
  L.push('### Highlights');
  const ins = rep.insights;
  if (ins.formatSpread) L.push(`- Day-30 survival by format: best ${ins.formatSpread.best} (${pct(ins.formatSpread.bestDay30)}), lowest ${ins.formatSpread.worst} (${pct(ins.formatSpread.worstDay30)}).`);
  for (const f of ins.factors) {
    if (f.best) L.push(`- ${factorName(f.factor)}: highest day-30 reading "${f.best}" ${pct(f.bestDay30)} (${fmt(f.bestAds)} ads), lowest "${f.worst}" ${pct(f.worstDay30)} (${fmt(f.worstAds)} ads), ${f.points} points apart. Slices under ${rep.minAds} ads are left out.`);
  }
  if (ins.cadenceTrend) {
    const c = ins.cadenceTrend;
    L.push(`- Cadence, last 4 full weeks vs the 4 before (${c.weeks}): new ads ${fmt(c.newPrev4)} → ${fmt(c.newLast4)}, stopped ${fmt(c.stoppedPrev4)} → ${fmt(c.stoppedLast4)}. The partial current week is left out.`);
  }
  if (ins.longestStandingAdvertisers.length) L.push(`- Most live ads older than 30 days: ${ins.longestStandingAdvertisers.map((a) => `${a.name ?? '?'} (${a.liveBeyond30Days} of ${a.liveAds})`).join(', ')}.`);
  if (d) {
    L.push('');
    L.push('### Since last run');
    const dl = diffLines(d);
    if (dl.length) L.push(...dl.map((x) => `- ${x}`)); else L.push('Nothing changed since the last run.');
  }
  L.push('');
  L.push('### Still running after N days (share of collected ads)');
  L.push('| Format | Ads | Day 7 | Day 14 | Day 30 | Day 60 | Day 90 | Half-life (from curve) |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const s of rep.survival) L.push(`| ${cell(s.format)} | ${fmt(s.ads)} | ${pct(s.day7)} | ${pct(s.day14)} | ${pct(s.day30)} | ${pct(s.day60)} | ${pct(s.day90)} | ${s.halfLifeFromCurve == null ? '—' : days(s.halfLifeFromCurve)} |`);
  for (const f of rep.factors) {
    L.push('');
    L.push(`### ${factorName(f.factor)}: still running at day 30`);
    L.push('| Slice | Ads | Day 30 |');
    L.push('| --- | ---: | ---: |');
    for (const s of f.slices) L.push(`| ${cell(s.label)}${s.thin && s.ads > 0 ? ' (thin)' : ''} | ${fmt(s.ads)} | ${pct(s.stillRunningAt30Days)} |`);
  }
  if (rep.categories.length) {
    L.push('');
    L.push('### Categories');
    L.push('| Category | Advertisers | Live ads | New 7d | Median run | Day 30 | Half-life |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const c of rep.categories) L.push(`| ${cell(c.category)} | ${fmt(c.advertisers)} | ${fmt(c.liveAds)} | ${fmt(c.newLast7Days)} | ${days(c.medianRunDays)} | ${pct(c.stillRunningAt30Days)} | ${days(c.halfLifeDays)} |`);
  }
  if (rep.advertisers.length) {
    L.push('');
    L.push(`### Advertisers (${rep.advertisers.length})`);
    L.push('| Advertiser | Category | Live | Total | Live >30d | Share >30d | New 7d | Weekly new ads | Median | Longest | Top CTA | Destination |');
    L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |');
    for (const a of rep.advertisers.slice(0, top)) L.push(`| ${cell(a.name ?? a.advertiserExternalId)} | ${cell(a.category)} | ${fmt(a.liveAds)} | ${fmt(a.totalAds)} | ${fmt(a.liveBeyond30Days)} | ${pct(a.liveBeyond30Share)} | ${fmt(a.newLast7Days)} | ${spark(a.weeklyNewAds)} | ${days(a.medianRunDays)} | ${days(a.longestRunDays)} | ${cell(a.topCta)} | ${cell(a.topDestinationKind)} |`);
    if (rep.advertisers.length > top) L.push(`\n…and ${rep.advertisers.length - top} more (CSV and JSON keep every row).`);
  }
  if (rep.cadence.length) {
    L.push('');
    L.push('### Cadence (UTC Monday weeks)');
    L.push(`New ads: ${spark(rep.cadence.map((w) => w.newAds))}  Stopped: ${spark(rep.cadence.map((w) => w.stoppedAds))}`);
    L.push('| Week | New ads | Advertisers | Stopped |');
    L.push('| --- | ---: | ---: | ---: |');
    for (const w of rep.cadence) L.push(`| ${w.weekStart}${w.isPartial ? ' (partial)' : ''} | ${fmt(w.newAds)} | ${fmt(w.advertisers)} | ${fmt(w.stoppedAds)} |`);
  }
  L.push('');
  L.push(`Longevity bands (ads by days run): ${rep.longevity.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}.`);
  L.push(`Formats: ${rep.formats.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}. CTAs: ${rep.ctas.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}. Destinations: ${rep.destinations.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}.`);
  L.push('');
  L.push(`Ads that belong to no app: ${fmt(t.unlinkedAds)}. Live ads with no category: ${fmt(t.uncategorizedLiveAds)}. Ads with disclosed reach: ${fmt(t.reachDisclosedAds)}.`);
  L.push('These figures describe the ads PeekPanda collected from Meta and TikTok ad libraries. They are not spend, reach or performance, and a longer run does not prove an ad works.');
  return L.join('\n');
}

function appMarkdown(rep, d) {
  const L = [];
  const t = rep.totals;
  L.push(`## Paid ads for App Store id ${rep.storeId}${rep.advertiserExternalId ? ` (advertiser ${rep.advertiserExternalId})` : ''}`);
  L.push('');
  L.push(`Read at ${rep.generatedAt ?? 'an unknown time'}. ${fmt(t.ads)} ads collected from ${fmt(t.advertisers)} advertiser${t.advertisers === 1 ? '' : 's'}; ${fmt(t.liveAds)} live now.`);
  L.push(`New: ${fmt(t.newAdsLast7Days)} in 7 days, ${fmt(t.newAdsLast30Days)} in 30 days. Median run of live ads ${days(t.medianRunDays)}, longest ${days(t.longestRunDays)} (null when no ad is live).`);
  if (rep.pace.newLast4Weeks != null) L.push(`Launch pace, last 4 weeks vs the 4 before: ${fmt(rep.pace.newPrev4Weeks)} → ${fmt(rep.pace.newLast4Weeks)} new ads. Weeks with at least one launch: ${rep.pace.weeksWithLaunches} of ${rep.pace.weeks}.`);
  if (d) {
    L.push('');
    L.push('### Since last run');
    const dl = diffLines(d);
    if (dl.length) L.push(...dl.map((x) => `- ${x}`)); else L.push('Nothing changed since the last run.');
  }
  L.push('');
  L.push(`### Weeks (UTC Mondays, oldest first)`);
  L.push(`New ads: ${spark(rep.weeks.map((w) => w.newAds))}  Still live: ${spark(rep.weeks.map((w) => w.liveAds))}`);
  L.push('| Week | New ads | Of them still live |');
  L.push('| --- | ---: | ---: |');
  for (const w of rep.weeks) L.push(`| ${w.weekStart} | ${fmt(w.newAds)} | ${fmt(w.liveAds)} |`);
  L.push('');
  L.push(`Longevity bands: ${rep.longevity.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}.`);
  L.push(`Formats: ${rep.formats.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}. CTAs: ${rep.ctas.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}. Destinations: ${rep.destinations.map((b) => `${b.label} ${fmt(b.count)}`).join(', ') || '—'}.`);
  if (rep.landingPages.length) {
    L.push('');
    L.push('### Landing pages');
    L.push('| Page | Kind | Ads | Active | First seen | Last seen |');
    L.push('| --- | --- | ---: | ---: | --- | --- |');
    for (const p of rep.landingPages) L.push(`| ${cell(p.page)} | ${cell(p.kind)} | ${fmt(p.adCount)} | ${fmt(p.activeCount)} | ${dayOf(p.firstSeenAt)} | ${dayOf(p.lastSeenAt)} |`);
  }
  L.push('');
  L.push(`Longest-running ads returned: ${rep.longestRunningCount} (full items are in the JSON response; they use the Search paid ads item shape with short-lived media URLs).`);
  L.push('There is no spend, impression, reach or country field: Meta does not publish them. An ad belongs to the app its own verified App Store link names, or the app its proven advertiser page runs ads for.');
  return L.join('\n');
}

export function toMarkdown(rep, d = null, top = 25) {
  return rep.kind === 'app' ? appMarkdown(rep, d) : marketMarkdown(rep, d, top);
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCsv(rep) {
  let head, rows;
  if (rep.kind === 'app') {
    head = ['store_id', 'week_start', 'new_ads', 'of_them_still_live'];
    rows = rep.weeks.map((w) => [rep.storeId, w.weekStart, w.newAds, w.liveAds]);
  } else {
    head = ['advertiser_external_id', 'name', 'category', 'live_ads', 'total_ads', 'live_beyond_30_days', 'live_beyond_30_share', 'new_last_7_days', 'weekly_new_ads', 'median_run_days', 'longest_run_days', 'top_cta', 'top_destination', 'store_rating', 'store_rating_count'];
    rows = rep.advertisers.map((a) => [a.advertiserExternalId, a.name, a.category, a.liveAds, a.totalAds, a.liveBeyond30Days, a.liveBeyond30Share == null ? '' : a.liveBeyond30Share.toFixed(3), a.newLast7Days, a.weeklyNewAds.join(' '), a.medianRunDays, a.longestRunDays, a.topCta, a.topDestinationKind, a.storeRating, a.storeRatingCount]);
  }
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function toChat(rep, d = null) {
  const L = [];
  if (rep.kind === 'app') {
    const t = rep.totals;
    L.push(`Paid ads, app ${rep.storeId}: ${fmt(t.ads)} collected, ${fmt(t.liveAds)} live, ${fmt(t.newAdsLast7Days)} new in 7 days`);
    if (rep.pace.newLast4Weeks != null) L.push(`Launch pace last 4 weeks: ${rep.pace.newPrev4Weeks} → ${rep.pace.newLast4Weeks}`);
  } else {
    const t = rep.totals;
    L.push(`Paid-ad staying power: ${fmt(t.ads)} ads, ${fmt(t.liveAds)} live, ${pct(t.stillRunningAt30Days)} still running at day 30, half-life ${t.halfLifeDays ?? '—'}d`);
    L.push(`Last 7 days: ${fmt(t.newAdsLast7Days)} new, ${fmt(t.stoppedLast7Days)} stopped`);
    const f = rep.insights.factors.find((x) => x.best);
    if (f) L.push(`${factorName(f.factor)}: "${f.best}" ${pct(f.bestDay30)} vs "${f.worst}" ${pct(f.worstDay30)} at day 30`);
  }
  if (d) for (const x of diffLines(d).slice(0, 3)) L.push(x);
  return L.join('\n');
}
