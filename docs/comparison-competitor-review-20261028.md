# Competitor documentation review — 28 October 2026

The public comparison covers the frozen inventory of 524 DeHub capability rows against YouTube, X, Kick, Twitch, Facebook, Instagram, TikTok, Rumble, Mastodon, Bluesky and Farcaster: 5,764 comparisons. Kick is counted once. This is a review of published documentation and pinned DeHub source evidence, not an operational test of 5,764 actions or a claim that the inventory includes every possible product feature.

## Evidence decisions

`platform-comparison-research.ts` records explicit capability decisions and the bounded official-documentation scope used for each competitor and category. Every reviewed cell links its evidence. Existing specific evidence is retained unless the newer review supersedes it. `platform-comparison-reviewed-ids.json` freezes the reviewed inventory; new rows cannot silently acquire a reviewed designation.

- **Documented** identifies an explicitly described equivalent.
- **Conditional** identifies a partial equivalent, eligibility restriction, client difference or narrower tool. The accompanying note explains the difference.
- **Related product** identifies a separately supplied companion product, integration or app. It does not claim native parity.
- **Explicit limitation** requires a source stating the restriction or exclusion. It is not inferred from a missing help entry.
- **Announced / availability unconfirmed** separates future pilots, experiments and unclear rollout status from currently supported equivalents.
- **Not established by sources** records that the cited review scope did not establish an equivalent. It is a documentation finding, not a tested absence. It must never be displayed or counted as “No”, a competitive win or proof that a platform lacks the feature.
- **Not verified** remains available for future or unresolved evidence. A source-backed review is not an independent functional or security certification.

The supported-match count includes documented, conditional and related-product entries. The reviewed count includes documentary findings and explicit limitations as well. Neither count measures unique advantages or product quality. Categories such as the advanced editor, design, charts and export tools often have no established equivalent in the cited social-product documentation; general-purpose external software is not silently included.

## Findings incorporated

- X Chat documents encryption for supported media and text, with exceptions for requests, unregistered peers, metadata and conversations that add Grok. X Money is a restricted fiat service, and its handle marketplace grants a revocable, non-transferable licence rather than account ownership.
- YouTube Studio cuts, Shopping, Playables, guest hosting, audio enhancements and dubbing are distinguished by scope. The announced live-dubbing pilot starts in early 2027 and is not counted as currently available.
- Twitch Stream Together, Alerts, Whispers, dashboard, data requests and Extensions retain browser, software, device and third-party conditions. KICK developer scopes are external integration capabilities.
- Edits, Meta AI and Vibes are identified as related products. Experiments and roadmap statements are labelled separately. TikTok Symphony is an advertiser creation suite, distinct from the ordinary feed and Studio.
- Rumble Studio's production tools and Boost's limited campaign rollout are included. Aggregated live chat does not establish a persistent private community messenger.
- Mastodon's private mentions are not end-to-end encrypted. Its documented core software has no built-in monetization strategy; independent server funding and third-party services remain separate.
- Bluesky Saved Posts and the February 2026 Drafts release supersede older missing-feature statements. Live Now and profile payment links are external integrations, not native stream hosting or payment settlement.
- Farcaster protocol, client and Mini App capabilities are distinguished. Wallet transaction rails do not establish that every app supplies a store, exchange or payment workflow.

## Retrieval and availability limits

Official product/help pages, official release posts and project documentation are linked in the shared source registry. TikTok LIVE Studio's detailed help could not be retrieved; controls requiring that evidence are not inferred from unrelated LIVE announcements. Some account settings and advanced creation operations are not enumerated by the available sources. Those cells disclose the bounded scope instead of presenting absence as fact. Regional, account, rollout and storefront differences remain visible beside claims. The original DeHub source audit and its pinned revisions are recorded in `comparison-source-audit-20261027.md`.

## Validation

Both clients share byte-identical catalogue, research, detail and reviewed-inventory modules. Cloud tests cover the exact inventory, all eleven competitors, source resolution, rule identifiers, category scopes, search, iOS restrictions, source ownership, all 104 editor-guide mappings and key evidence regressions. A newly added capability remains outside the review until the snapshot and evidence are deliberately updated. Production page and native publication checks validate delivery of this comparison surface; they do not certify all underlying product operations.
