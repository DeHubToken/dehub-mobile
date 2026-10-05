# Cost reduction rollout

Ship each stage through PRs. Verify browser behavior on staging.dehub.io and native behavior on the connected Android test device before marking a stage complete. Record merged, published and verified separately.

## Subscription offers

Live Stripe prices were checked on 5 October 2026. All four products are denominated in USD; the dashboard showed no active subscriptions. Existing subscription and previously issued checkout grants are preserved through the absence of the new policy marker.

The `2026-10` policy applies to newly issued checkouts. Monthly and annual billing use separate allowances, leaving at least 25% of the sticker price before fees at the current lowest 10% generation markup. Prices are unchanged.

| Plan | Monthly price | Monthly DHB | Annual price per month | Annual DHB per month |
| --- | ---: | ---: | ---: | ---: |
| Creator | $19 | 15,000 | $15 | 12,000 |
| Ultra | $129 | 105,000 | $99 | 80,000 |
| Team, per seat | $79 | 63,000 | $65 | 52,000 |
| Scale, per seat | $215 | 175,000 | $150 | 120,000 |

Annual invoices deliver twelve months of the selected allowance. Full-period allowances are not issued again on seat-change proration invoices. Do not edit an issued policy in place when introducing a later policy; retain the historical schedule for renewals.

The server and web read `supabase/functions/_shared/ai-plan-offers.json`. Mobile carries the same catalog in `config/ai-plan-offers.json`. Update both repositories together. Checkout validates amount, currency, recurrence and the offer version before creating a customer or session. Previously cached pricing pages must refresh before buying a new offer.

Required verification: hosted tests for grant compatibility, annual quantities, provider budget and price mismatches; matching monthly/annual cards on staging and Android; checkout initialization without completing a payment; deployment of `create-checkout` and `payments-webhook` from the merged source. A frontend publication alone does not deploy these functions.

## Remaining stages

1. Compact feed head and visible engagement updates instead of full feed polling.
2. Persistent avatar/cover revisions that change on upload.
3. Scoped presence and event delivery with reconnect recovery for calls/messages.
4. Public recorded-media migration rehearsal, preserving legacy URLs and protected access.
5. Remaining supported direct provider routes and server cost accounting.

Keep translation caches, existing payment checks, private-content constraints, responsive media variants and background lifecycle gates. Compare one bounded before/after usage window; do not create recurring monitors.
