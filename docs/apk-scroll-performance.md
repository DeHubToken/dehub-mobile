# APK scrolling

The native feed should track the finger immediately and maintain the device's
frame cadence while flinging, paging, and changing direction. A 60 Hz display
has a 16.7 ms frame budget; 120 Hz has 8.3 ms. These are targets, not measured
results for the current APK.

## Reference implementations

- [React Native list configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration): keep row work small and balance render batches against input responsiveness.
- [Shopify FlashList v2](https://shopify.engineering/flashlist-v2): a production reference for variable-height lists, recycling, and adaptive rendering. Migrating requires auditing per-post state before reusing cells; reactions, gates, playback, and open sheets must never carry into another post.
- [Reanimated performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/): keep scroll animation on the UI thread and avoid layout animation during gestures. Native optimization flags require matching runtime support and touch regression checks.

## Player allocation

An autoplay candidate previously mounted `FeedVideoPlayerActive` immediately.
`useVideoPlayer(null)` allocates an ExoPlayer too: the 400 ms source delay inside
the component did not defer player construction. Scrolling past successive
candidates could therefore allocate and release players without playing them.

The poster now owns that dwell period. Only a candidate retained for 400 ms
mounts its player automatically. A tap bypasses the timer, and picture-in-picture
retains its player. Initial playback requests provide the source on construction,
avoiding an empty player followed immediately by a replacement instance.

## Connected-phone baseline, 28 September 2026

Galaxy S24+ (SM-S926B), production channel, runtime 1.18.0. Six 230 ms
swipes down followed by six up, measured with `dumpsys gfxinfo` after resetting
its counters per tab:

| Feed | Frames | Missed deadlines | p95 | p99 |
| --- | ---: | ---: | ---: | ---: |
| Home | 312 | 68 (21.79%) | 27 ms | 48 ms |
| Videos | 301 | 69 (22.92%) | 42 ms | 65 ms |
| Shorts | 210 | 84 (40.00%) | 150 ms | 200 ms |

Slow bitmap uploads were flagged for 68, 67 and 80 frames respectively.
These counters identify overlap, not proof that uploads alone caused every
missed deadline. Idle adjacent pager pages previously remained drawn; pages
now draw only while intersecting the horizontal viewport. Feed images and
image-grid thumbnails use Glide's bounded memory cache as well as disk.

Home's threshold release now bypasses the pending-page hold once. Previously
it requested a render but the render immediately held the same append again,
so runway could not grow until momentum ended. Secondary InfiniteFeed lists
also update visibility through row subscriptions instead of React state on
the list, and mount one card per batch.

## First OTA measurement

Production Android update `01a0e615-4a51-7ab6-88e1-13180fad2d0b`,
runtime 1.18.0, published 28 September 2026 at 03:35:50 UTC. Native Expo
update logs recorded its completed download; the same installed APK was
restarted to apply it before testing. The same six-down/six-up gesture sequence
produced:

| Feed | Frames | Missed deadlines | p95 | p99 |
| --- | ---: | ---: | ---: | ---: |
| Home | 452 | 41 (9.07%) | 20 ms | 40 ms |
| Videos | 450 | 44 (9.78%) | 19 ms | 42 ms |
| Shorts | 399 | 55 (13.78%) | 26 ms | 44 ms |
| Images | 401 | 54 (13.47%) | 19 ms | 36 ms |
| Music | 414 | 33 (7.97%) | 22 ms | 42 ms |
| Live | 374 | 86 (22.99%) | 34 ms | 73 ms |

Before this update the image grid missed 80 of 80 frame deadlines in a repeat
baseline, with p95/p99 of 150 ms. These measurements show improvement, but
remaining misses, particularly in Live, mean this is not an all-pages
smoothness pass. Dynamic feed content, image-cache state, playback and device
refresh-rate scheduling can differ between runs.

Explore subsequently measured 91 of 356 missed deadlines (25.56%), p95 30 ms
and p99 61 ms. Its trending cards were all mounted in a ScrollView. The next
change virtualizes that list, makes both trending and search visibility reach
individual rows, and pauses media when the screen loses focus. Live previews
also defer player allocation until their candidate dwells for 400 ms. These
follow-up changes still require measurements from their published OTA.

## Release verification

Use a release APK on the affected Android phone. Check slow drags, fast flings,
direction changes, pagination, and scrolls starting over video timelines and
image galleries. Compare frame timing with Android System Trace while crossing
video rows. Also verify poster taps with autoplay enabled and disabled, Data
Saver, gated posts, and picture-in-picture. Web staging cannot establish native
APK smoothness. Frame statistics, native idle traces and authenticated
secondary-page measurements have been captured. Active scroll traces and the
remaining release checks still require verification.

## Second OTA measurement

Production Android update `01a0e627-7e0d-72c0-96ee-ed2e4ee791d5`, runtime
1.18.0, downloaded and applied in the same installed APK on 28 September 2026.
The same six-down/six-up sequence produced:

| Feed | Missed deadlines | p95 | p99 |
| --- | ---: | ---: | ---: |
| Home | 45 / 441 (10.20%) | 20 ms | 31 ms |
| Images | 35 / 491 (7.13%) | 19 ms | 40 ms |
| Shorts | 47 / 420 (11.19%) | 23 ms | 36 ms |
| Videos | 53 / 440 (12.05%) | 19 ms | 46 ms |
| Music | 33 / 412 (8.01%) | 21 ms | 40 ms |
| Live | 62 / 419 (14.80%) | 23 ms | 57 ms |
| Messages | 57 / 360 (15.83%) | 48 ms | 73 ms |
| Public chat | 42 / 502 (8.37%) | 16 ms | 18 ms |
| Communities | 17 / 443 (3.84%) | 12 ms | 48 ms |
| Community posts | 56 / 415 (13.49%) | 25 ms | 31 ms |

Notifications and the current empty profile were exercised, but their short
lists do not establish long-feed performance. Content and caches differ between
runs; the remaining missed deadlines are not an all-pages smoothness pass.

Native idle traces showed repeated Fabric property updates even away from Home.
This identifies shared work to investigate, without proving one root cause.
Secondary dock buttons and the seven action icons per feed card now use
native-driver touch animations instead of keeping idle Reanimated animated
styles registered across retained rows and offscreen destinations. Main
tab entrance and scroll-linked dock animations keep their existing UI-thread
implementation.

## Third OTA and X comparison

Android production update `01a0e644-e294-7175-85a7-dee0c46981e0`, runtime
1.18.0, was downloaded and applied to the installed APK on 28 September 2026.
The following runs use the Minimal theme. Earlier glass-theme measurements
are separate baselines. Upward gestures start at y=900, below pinned headers;
earlier secondary-page gestures starting at y=550 could hit chrome and do not
establish bidirectional scrolling on those pages.

| Feed | Missed deadlines | p95 | p99 |
| --- | ---: | ---: | ---: |
| Home | 18 / 525 (3.43%) | 16 ms | 16 ms |
| Shorts | 16 / 522 (3.07%) | 16 ms | 20 ms |
| Images | 13 / 510 (2.55%) | 17 ms | 20 ms |
| Videos | 20 / 510 (3.92%) | 15 ms | 22 ms |
| Music | 9 / 428 (2.10%) | 12 ms | 22 ms |
| Live | 25 / 494 (5.06%) | 17 ms | 38 ms |
| Explore | 10 / 436 (2.29%) | 14 ms | 30 ms |
| Leaderboard | 23 / 485 (4.74%) | 17 ms | 48 ms |
| Settings | 2 / 485 (0.41%) | 14 ms | 15 ms |

A longer run uses 18 downward gestures followed by 18 upward gestures, with
counters reset for each direction. X's native Android timeline was measured
on the same phone with the same gesture sequence, without screen recording:

| App / update | Direction | Missed deadlines | p95 | p99 |
| --- | --- | ---: | ---: | ---: |
| X | Down | 13 / 711 (1.83%) | 11 ms | 19 ms |
| X | Up | 8 / 721 (1.11%) | 15 ms | 20 ms |
| DeHub second OTA, Minimal | Down | 118 / 569 (20.74%) | 25 ms | 40 ms |
| DeHub second OTA, Minimal | Up | 142 / 519 (27.36%) | 36 ms | 65 ms |
| DeHub third OTA, Minimal | Down | 27 / 664 (4.07%) | 16 ms | 38 ms |
| DeHub third OTA, Minimal | Up | 10 / 671 (1.49%) | 15 ms | 27 ms |

Separate motion recordings include slow drags and direction changes. They
can reveal missing content and transitions; recording adds overhead, and
captured frames alone cannot establish perceived display motion blur.

An active native trace after the third OTA reduced recurring property batches
from 299/306 instructions to 22. The animation slice's self time fell from
970.7 ms to 239.8 ms across the captured runs. Workload and frame counts differ,
so this verifies removal of the large recurring batches, not an exact speedup.
Remaining misses and untested destinations prevent an all-pages pass.

Leaderboard still rendered up to 20 rows in one batch. Its next change uses
four-row batches and includes the measured header inset in fixed row offsets.
That follow-up requires a published OTA and another phone measurement.
