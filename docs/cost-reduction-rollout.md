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

### Compact feed head

`GET /api/feed?signal=true` shares the ordinary feed's filters, authenticated visibility and head order. It returns only identity, timestamps, renderability and engagement fields. The head is capped at 20 and has no full-feed pagination/count query. Random sorting preserves the existing shuffle and access checks before compacting the response.

Both clients request this mode for the existing foreground head poll. Full feed pages, scroll position, optimistic engagement and mobile scroll deferral stay intact. Web uses the response's explicit `authenticated` marker for expired-session recovery because count responses deliberately omit viewer flags. Older servers remain compatible by returning their ordinary full response.

Deploy and verify the shared API first, then publish the clients. Compare one matched full/compact response pair and eligible token IDs; check Chrome and Android head signaling/count updates. Refreshing visible cards beyond the head remains a separate follow-up.

The 5 October deployed public chronological sample returned the same 20 IDs in the same order: 30,631 bytes for the full response versus 7,611 for the signal response, a 75.2% reduction before compression. This is a response-size measurement, not a monthly bill saving. The backend and client PRs are merged; Android application remains pending device reconnection and publication verification.

### Profile image revisions

New profile uploads return an avatar/cover filename containing a hash of the optimized bytes. Identical output reuses that source key; changed pixels produce a new key. Canonical account filenames remain available for older clients during rollout. Keep the existing profile cache lifetime and image format/size ladder.

Web reads the stored filename for covers and direct avatar fallback, with stable legacy URLs and explicit local upload invalidation. Mobile preserves the same revision path and redirects API-hosted covers to the CDN. Saved upload keys are retained privately for account erasure, including previous revisions; erasure continues to preserve media shared by another account.

Verify identical and changed uploads, transparent formats, canonical compatibility, and revision erasure in hosted tests. Check profile/feed rendering in Chrome and Android after deployment before recording the stage as verified.

### Message history and reconnect recovery

Web refreshes the newest 30 messages every 15 seconds while a thread is visible, rather than requesting every loaded history page. A separate head query shares recovery across observers and keeps background tabs quiet. It merges decrypted replies, pending sends, confirmed read receipts and displaced history; a full head without any overlap falls back to ordinary history recovery. DM transport reconnects, explicit retries and encryption-identity changes retain a full refresh. Older-page requests now send the API's `skip` offset, calculated from unique persisted messages as incoming replies shift pagination.

Mobile already fetches a bounded newest page. It now recovers that page on screen focus, foreground and actual DM transport reconnection, coalescing simultaneous recovery triggers and rejecting responses after the thread is replaced. Existing socket delivery, older-message paging and encrypted storage remain in place. No recurring native message timer is added.

Required verification: hosted tests for one-page polling with loaded history, optimistic sends/read flags, deletions, pagination offsets, burst recovery, focus/foreground/reconnect coalescing and stale response guards; then a real thread on staging and Android. Older edits/deletions outside the head still rely on their socket events or an explicit history refresh; server change cursors remain a follow-up.

1. Compact feed head and visible engagement updates instead of full feed polling.
2. Persistent avatar/cover revisions that change on upload.
3. Scoped presence and event delivery with reconnect recovery for calls/messages.
4. Public recorded-media migration rehearsal, preserving legacy URLs and protected access.
5. Remaining supported direct provider routes and server cost accounting.

Keep translation caches, existing payment checks, private-content constraints, responsive media variants and background lifecycle gates. Compare one bounded before/after usage window; do not create recurring monitors.
