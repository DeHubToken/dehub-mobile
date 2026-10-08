# Prediction sharing

Paste a Polymarket event/market link or a Manifold market link into a post,
comment or conversation. The normal outside-link preview renders the question,
provider, outcomes, probabilities, market status and the time the data was fetched.
Web and mobile use the same parser and normalization module. Mobile also previews
the link in the post composer. Existing posts gain the cards without a migration.

Public GET requests go directly to the providers. No API key, trading permission,
paid generation, new Edge Function or database change is required. Only recognized
provider hosts and paths are accepted. Tracking parameters are removed; cookies
and referrers are omitted. Concurrent requests share one promise, snapshots are
cached for 60 seconds with a 100-entry cap, and failures get a 30-second cooldown.
There is no polling or automatic retry. A displayed timestamp describes a fetched
snapshot, not a guaranteed live price. A failed request retains a clickable source
card without odds. Users can add their own prediction in the post text.

Polymarket event links display up to three questions independently, with open
questions first. A nested market link selects that exact question. Manifold
supports binary and open multiple-choice probabilities; unsupported numeric,
poll and bounty formats retain their source card without misleading Yes/No odds.
Cancelled markets omit probabilities, and near-certainty is never rounded to 100%.
The integration reads markets and links to the provider; it does not place trades.

Provider references checked 2026-10-08:

- [Polymarket public market data](https://docs.polymarket.com/market-data/discover-markets)
- [Polymarket sharing and embeds](https://help.polymarket.com/en/articles/13364174-how-to-use-embeds)
- [Manifold API: public endpoints, integration usage and rate limits](https://docs.manifold.markets/api)
- [Kalshi developer agreement](https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf)

Kalshi is excluded: its public endpoint access does not grant permission to
redistribute data. Section 3.1 requires prior written authorization. Manifold bulk
data licensing is separate from this per-link API integration; no bulk data is used.

Run the prediction parser, normalization and request-cache regression tests in the
existing GitHub CI suites. Verify the deployed composer and shared cards on
staging.dehub.io, including an event with multiple questions and a Manifold link.
