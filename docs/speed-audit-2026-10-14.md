# Shared feed performance audit — 14 October 2026

Companion web work: https://github.com/DeHubToken/dehubweb/pull/2659 .
Baseline measurements: https://github.com/DeHubToken/dehubweb/actions/runs/38505948000 .

The web audit found that an inline badge warmed a 3D showcase and hidden renderer
on page mount, and that desktop Chat rendered its whole history into a short
sidebar while hidden panels also mounted. These mechanisms are web-specific.

Native parity checked against `bb13cef65`:

- `components/common/BadgeArtwork.tsx` renders a still while idle. Hover, focus or
  press activates animation; a completed press opens the showcase. It does not
  prepare a showcase renderer for every feed visit.
- `screens/LiveChatScreen.tsx` uses FlatList with `initialNumToRender={30}` and
  `maxToRenderPerBatch={20}`, unlike the web sidebar's full-history map.
- `components/Home/ShortsCarousel.tsx` uses a horizontal FlatList. Its query is
  gated on the active, focused feed; native previews are separate from web video
  source assignment.
- `config/queryClient.ts` trims infinite queries before persistence. Preserve this
  bounded serialization and avoid restoring periodic full-cache writes.

The badge regression test now explicitly verifies that appending feed rows does
not open the showcase. Keep optional renderers behind user intent on both clients.
This change adds audit evidence and a regression assertion only; it does not
change the installed native runtime and needs no OTA release. Native device
performance was not measured by the web Chromium run.

The companion web change also removes idle composer/post-page imports, replacing
them with Create-control intent loading. Native screen navigation does not run
the web AppLayout idle import effect; keep composition tied to opening Create.
