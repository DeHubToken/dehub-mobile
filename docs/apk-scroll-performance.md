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

## Release verification

Use a release APK on the affected Android phone. Check slow drags, fast flings,
direction changes, pagination, and scrolls starting over video timelines and
image galleries. Compare frame timing with Android System Trace while crossing
video rows. Also verify poster taps with autoplay enabled and disabled, Data
Saver, gated posts, and picture-in-picture. Web staging cannot establish native
APK smoothness. No device trace has yet been captured for this change.
