# Native comparison release — 28 October 2026

The native release follows the current public web comparison, including the later matrix, product-review and rival-inventory changes from web PRs #3428, #3430 and #3443. The original 524-row audit remains a historical source record rather than the final catalogue size.

The current catalogue contains 850 rows: 534 original/expanded capability and missing-feature rows, plus 316 capabilities gathered from rival products. The native catalogue, details, research, reviewed-ID snapshot, product review and rival inventory match the corresponding web modules exactly. Native filters support all features, social only and what DeHub lacks, as well as competitor, category and search filters. Public `/compare` and `/app/compare` links preserve their search and view parameters.

The reviewed-ID snapshot covers 534 documentary rows. Rival-inventory entries use the cited product help scope and retain unconfirmed peers as unknown. It would be incorrect to describe all 9,350 cells as individually functionally verified. Explicit limitations, conditional features, related products, announcements and unknown entries remain distinguishable. Encryption fallback and iOS purchase restrictions remain beside the relevant capabilities.

At this revision the all-feature support counts are DeHub 593 and YouTube 293; social-only counts are DeHub 429 and YouTube 281 across 686 rows. These are catalogue counts under the shared matrix rules, not a security assessment or a measure of product quality. Native tests pin these totals and filter boundaries to prevent a stale catalogue from being released beside the current web page.

Publication and device acceptance are separate checks. The native release requires cloud TypeScript/tests, a production update with the existing runtime and environment guards, and coordinated device acceptance when the shared Android connection is available.
