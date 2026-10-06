# Visible feed count refreshes

The existing foreground 45-second compact head request can include up to twenty
`visibleTokenIds`. Web reads card positions when that poll fires; mobile reads
its native viewability ref. Scrolling never starts another poll or changes the
query key. Sponsored cards, temporary identities and offscreen rows are omitted.

The response keeps `result` as the new-post head and adds `visibleResult` for
requested eligible rows outside that head. Both clients merge both count sets
into cached posts; only the head affects the new-post indicator. Mobile continues
to defer cache patches until a drag or fling settles. Older servers may omit the
new field and older clients continue reading the existing head.

The backend validates and deduplicates IDs, caps additional rows at twenty and
performs the same current privacy, block/mute, following, content, moderation and
feed-filter checks before projecting compact counters. This also applies when
the head uses a cached random order. Head rows are not queried twice. The extra
indexed lookup runs only when requested rows are absent from the head; no full
page count, media, access key or client-specific interaction flags are added.

Deploy the backend before verifying both clients on staging and the connected
phone. Check an older visible post, count updates, stable scroll and unchanged
new-post signaling. Byte reduction measurements for the twenty-row head do not
measure the combined response size or prove a monthly invoice saving.
