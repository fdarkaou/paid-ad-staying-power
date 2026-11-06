# paid-ad-staying-power

See how long paid ads stay live in PeekPanda's stored Meta and TikTok ad-library observations. The tool turns one paid-ad intelligence response into: survival curves by format (share of collected ads still running at day 7, 14, 30, 60 and 90, plus a half-life), which button text and body-copy length last longer at day 30, a ranking of advertisers by how many of their live ads are older than 30 days, weekly launch and stop cadence, and what changed since last run. Point it at one app instead and you get its weekly launches, run-length bands, creative mix and landing pages.

Output is Markdown, CSV or JSON, and it can post a short summary to Slack or Discord. Node 18+, no dependencies. There is also a [browser version](https://fdarkaou.github.io/paid-ad-staying-power/) that reads pasted JSON, draws the survival chart and never sends anything anywhere.

```
## Paid-ad staying power (stored library)

Read at 2026-11-02T09:00:00.000Z. 1,260 ads collected from 12 advertisers; 372 live now (9 advertisers live).
Of the ads collected, 32% were still running 30 days after launch; half had stopped by day 17. Median run 9d, longest 188d, 41 live beyond 60 days.
Last 7 days: 49 new from 4 advertisers, 31 stopped.

### Highlights
- Day-30 survival by format: best video (37%), lowest image (17%).
- Button text (CTA): highest day-30 reading "Learn more" 33% (310 ads), lowest "Install now" 26% (520 ads), 7 points apart. Slices under 30 ads are left out.
- Body-copy length (characters): highest day-30 reading "51-125" 40% (350 ads), lowest "No text" 22% (90 ads), 18 points apart. Slices under 30 ads are left out.
```

(Example data from `examples/`, not real advertisers or apps.)

## Where the data comes from

The data comes from [PeekPanda](https://peekpanda.com), an iOS competitor catalogue that stores dated paid-ad observations from the Meta and TikTok ad libraries. The tool calls two reads, both `context:read`:

- [`GET /v1/paid-ads/intelligence`](https://peekpanda.com/docs/paid-ad-intelligence) (MCP tool `get_ads`, action `intelligence`). Filters: `platform` (meta or tiktok), `category`, `advertiserExternalId`, `advertiserLimit` (1-400, default 25), `cadenceWeeks` (4-52, default 12).
- [`GET /v1/competitors/ios/{storeId}/paid-ads/intelligence`](https://peekpanda.com/docs/competitor-paid-ad-intelligence) (action `app_intelligence`). Optional filter: `advertiserExternalId`.

Neither starts collection. They read stored rows; see also the [paid ads library](https://peekpanda.com/docs/paid-ads-library) guide.

Fields read from the market response: `totals` (ads, liveAds, advertisers, liveAdvertisers, newAdsLast7Days, advertisersShippingLast7Days, stoppedLast7Days, halfLifeDays, stillRunningAt30Days, medianRunDays, longestRunDays, liveBeyond60Days, reachDisclosedAds, unlinkedAds, uncategorizedLiveAds), `advertisers` (name, category, liveAds, totalAds, newLast7Days, liveBeyond30Days, weeklyNewAds, medianRunDays, longestRunDays, formatMix, topCta, topDestinationKind, storeRating, storeRatingCount), `survival` (one `stillRunning` curve per format, day 0 to day 90), `lastingFactors` (CTA and body-copy length slices with `stillRunningAt30Days`), `categories`, `cadence`, `longevity`, `formats`, `ctas`, `destinations`. From the app response: `totals`, `weeks`, `longevity`, `formats`, `ctas`, `destinations`, `landingPages`, and the count of `longestRunning` items. The docs show no item fields for the app's `advertisers` list, so only its count is used.

You need a PeekPanda account and an API key. Each run is one call against your plan's daily API and MCP allowance (30 calls a day on Peek, 1,000 on Panda, reset at 00:00 UTC).

## Use it

```bash
git clone https://github.com/fdarkaou/paid-ad-staying-power && cd paid-ad-staying-power
export PEEKPANDA_TOKEN=...   # API key from Account → API keys. Keep it out of source control.

node cli.js                                         # the stored library, top 25 advertisers
node cli.js --platform meta --advertisers 100       # one ad platform, more advertisers
node cli.js --category "Health & Wellness" --weeks 26
node cli.js --app 6480417616                        # one app (also takes an apps.apple.com link)
node cli.js --state staying-state.json              # what changed since last run
node cli.js --format csv > advertisers.csv
node cli.js --webhook "$SLACK_WEBHOOK_URL"          # Discord webhook URLs work too
```

Try it without an account on the bundled example:

```bash
node cli.js --file examples/market.json
cp examples/previous.json /tmp/state.json && node cli.js --file examples/market.json --state /tmp/state.json
node cli.js --file examples/app.json
npm test
```

Options: `--platform`, `--category`, `--advertiser`, `--advertisers`, `--weeks`, `--app`, `--min-ads`, `--top`, `--state`, `--archive`, `--format md|csv|json`, `--webhook`, `--file`, `--tenancy`, `--api`. On a `429 rate_limited` or a `503 projection_warming` with a short `Retry-After` it waits and retries once; on `daily_call_limit` it stops.

## Ask an assistant instead

If your assistant is connected to the PeekPanda MCP server (`https://mcp.peekpanda.com/mcp`, OAuth sign-in or an API key; see [MCP setup](https://peekpanda.com/docs/mcp)), ask it to call `get_ads`:

```json
{
  "request": {
    "action": "intelligence",
    "query": { "platform": "meta", "advertiserLimit": 50 }
  }
}
```

For one app use `"action": "app_intelligence"` with `"params": { "platform": "ios", "storeId": "6480417616" }`. Save the result and run `node cli.js --file`, or paste it into the browser version.

## How to read it

- Everything here describes ads PeekPanda collected. There is no spend, impression, reach or country field: Meta does not publish them. A longer run does not prove an ad worked.
- "Still running at day N" is the share of collected ads still running N days after launch, estimated by PeekPanda with Kaplan–Meier: a stopped ad counts on the day it stopped, a live ad only up to its current age, so a young ad never reads as stopped. Day 0 is launch.
- The half-life in the totals line is PeekPanda's `halfLifeDays`. The half-life column in the format table is this tool's reading of each curve: the first day at or below 50% still running. It is empty when the curve stays above 50% through day 90.
- Lasting-factor slices with fewer ads than `--min-ads` (default 30) are marked "thin" and left out of the highlights. The difference between two slices is a comparison, not a cause.
- "Share >30d" per advertiser is this tool's division of `liveBeyond30Days` by `liveAds`. It is empty when an advertiser has no live ads.
- The cadence trend compares the last 4 complete weeks with the 4 before. The week marked `isPartial` is still being counted and is left out.
- A dash means unavailable (null), not zero. `unlinkedAds` are ads that belong to no app.
- Diffs compare by `advertiserExternalId` (market) or by landing page (app) and need the same kind of report and, for apps, the same store id.

## Weekly post in GitHub Actions

`.github/workflows/staying-power.yml` is an example job that runs every Monday, keeps last week's report in the Actions cache, writes the report to the run summary, posts a short summary to a webhook and saves a CSV and a dated history as an artifact. Add `PEEKPANDA_TOKEN` and `STAYING_WEBHOOK_URL` as repository secrets, set the repository variable `ENABLE_STAYING_POWER` to `true`, and edit the filters in the job.

## License

MIT
