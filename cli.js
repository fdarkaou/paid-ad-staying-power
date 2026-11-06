#!/usr/bin/env node
// Paid-ad staying power from PeekPanda. Node 18+, no dependencies.
//   market: GET /v1/paid-ads/intelligence                          (MCP get_ads, action intelligence)
//   app:    GET /v1/competitors/ios/{storeId}/paid-ads/intelligence (MCP get_ads, action app_intelligence)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { toReport, toMarkdown, toCsv, toChat, diff, MIN_ADS_DEFAULT } from './staying.js';

const HELP = `Usage:
  PEEKPANDA_TOKEN=... node cli.js [market options]          stored-library ranking and survival curves
  PEEKPANDA_TOKEN=... node cli.js --app <storeId|link>      one app's launches, run lengths and creative mix
  node cli.js --file response.json [options]

Market options (GET /v1/paid-ads/intelligence):
  --platform <p>             meta|tiktok
  --category <name>          limit the ranking to one category
  --advertiser <id>          advertiserExternalId: limit to one advertiser (also narrows --app)
  --advertisers <1-400>      advertisers to return (default 25)
  --weeks <4-52>             UTC Monday weeks of creatives started and stopped (default 12)
App option (GET /v1/competitors/ios/{storeId}/paid-ads/intelligence):
  --app <storeId|link>       numeric App Store id or an apps.apple.com link (one app per run)
Output and state:
  --min-ads <n>              leave lasting-factor slices with fewer ads out of the highlights (default ${MIN_ADS_DEFAULT})
  --top <n>                  advertiser rows in Markdown (default 25; CSV and JSON keep every row)
  --state <path>             compare with the report saved at this path, then save this run there
  --archive <dir>            also save this run as <dir>/staying-power-<YYYY-MM-DD>.json
  --format md|csv|json       output format (default md; json is this tool's report)
  --webhook <url>            also POST a short summary to a Slack or Discord incoming webhook
  --tenancy <value>          x-genviral-tenancy header (default personal)
  --api <url>                API base (default https://api.peekpanda.com)
  --file <path>              read a saved response or report instead of calling the API

Each run is one API call. The numbers describe ads PeekPanda collected. They are not spend or performance.`;

function parse(argv) {
  const o = { format: 'md', tenancy: 'personal', api: 'https://api.peekpanda.com', top: '25', 'min-ads': String(MIN_ADS_DEFAULT), _set: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      o[key] = argv[++i];
      o._set.add(key);
    } else throw new Error(`Unexpected argument "${a}". See --help.`);
  }
  return o;
}

function storeIdFrom(v) {
  const s = String(v ?? '').trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/\/id(\d+)/);
  if (m) return m[1];
  throw new Error(`Could not read an App Store id from "${s}". Use the numeric id or an apps.apple.com link.`);
}

function buildRequest(o) {
  const q = new URLSearchParams();
  if (o.app != null) {
    if (o.platform || o.category || o.advertisers || o.weeks) throw new Error('--app only accepts --advertiser as a filter.');
    const id = storeIdFrom(o.app);
    if (o.advertiser) q.set('advertiserExternalId', o.advertiser);
    return { kind: 'app', path: `/v1/competitors/ios/${id}/paid-ads/intelligence`, query: q, filters: { storeId: id, ...(o.advertiser ? { advertiserExternalId: o.advertiser } : {}) } };
  }
  const filters = {};
  if (o.platform) { if (!['meta', 'tiktok'].includes(o.platform)) throw new Error('--platform must be meta or tiktok'); q.set('platform', o.platform); filters.platform = o.platform; }
  if (o.category) { q.set('category', o.category); filters.category = o.category; }
  if (o.advertiser) { q.set('advertiserExternalId', o.advertiser); filters.advertiserExternalId = o.advertiser; }
  if (o.advertisers != null) {
    const n = Number(o.advertisers);
    if (!Number.isInteger(n) || n < 1 || n > 400) throw new Error('--advertisers must be a whole number from 1 to 400');
    q.set('advertiserLimit', String(n)); filters.advertiserLimit = n;
  }
  if (o.weeks != null) {
    const n = Number(o.weeks);
    if (!Number.isInteger(n) || n < 4 || n > 52) throw new Error('--weeks must be a whole number from 4 to 52');
    q.set('cadenceWeeks', String(n)); filters.cadenceWeeks = n;
  }
  return { kind: 'market', path: '/v1/paid-ads/intelligence', query: q, filters };
}

async function get(o, req, retried = false) {
  const token = process.env.PEEKPANDA_TOKEN;
  if (!token) throw new Error('Set PEEKPANDA_TOKEN to a PeekPanda API key (Account → API keys). Never commit it.');
  const url = new URL(req.path, o.api);
  for (const [k, v] of req.query) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-genviral-tenancy': o.tenancy, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? '';
    const retry = Number(res.headers.get('retry-after'));
    // 429 rate_limited and 503 projection_warming: honor a short Retry-After once. daily_call_limit: stop until 00:00 UTC.
    const waits = (res.status === 429 && code !== 'daily_call_limit') || (res.status === 503 && code === 'projection_warming');
    if (waits && !retried && retry > 0 && retry <= 60) {
      await new Promise((r) => setTimeout(r, retry * 1000));
      return get(o, req, true);
    }
    const err = new Error(`PeekPanda API ${res.status} ${code}: ${body?.error?.message ?? res.statusText}`);
    err.status = res.status; err.code = code;
    throw err;
  }
  return res.json();
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }
  const top = Number(o.top);
  const minAds = Number(o['min-ads']);
  if (!Number.isInteger(top) || top < 1) throw new Error('--top must be a whole number of 1 or more');
  if (!Number.isInteger(minAds) || minAds < 0) throw new Error('--min-ads must be a whole number of 0 or more');
  if (!['md', 'csv', 'json'].includes(o.format)) throw new Error('--format must be md, csv or json');

  let report;
  if (o.file) {
    report = toReport(JSON.parse(await readFile(o.file, 'utf8')), { minAds });
  } else {
    const req = buildRequest(o);
    const raw = await get(o, req);
    report = toReport(raw, { filters: req.filters, fetchedAt: new Date().toISOString(), minAds });
  }

  let d = null;
  if (o.state) {
    const prev = await readFile(o.state, 'utf8').then(JSON.parse).catch(() => null);
    d = diff(report, prev);
    await writeFile(o.state, JSON.stringify(report, null, 2));
  }
  if (o.archive) {
    await mkdir(o.archive, { recursive: true });
    const stamp = (report.generatedAt ?? report.fetchedAt ?? new Date().toISOString()).slice(0, 10);
    const name = report.kind === 'app' ? `staying-power-app-${report.storeId}-${stamp}.json` : `staying-power-${stamp}.json`;
    await writeFile(join(o.archive, name), JSON.stringify(report, null, 2));
  }

  if (o.format === 'json') console.log(JSON.stringify(report, null, 2));
  else if (o.format === 'csv') console.log(toCsv(report));
  else console.log(toMarkdown(report, d, top));

  if (o.webhook) {
    const text = toChat(report, d);
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(o.webhook);
    const r = await fetch(o.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isDiscord ? { content: text.slice(0, 1900) } : { text }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
