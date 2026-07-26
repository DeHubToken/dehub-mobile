# DeHub Mobile — Performance Audit & Optimisation Plan

**Date:** 2026-07-25
**Audited commit:** `d8a2e6f` (= `origin/clean-mobile-fixes`), working tree clean
**Target:** Android release APK — cold start, scroll smoothness, APK size
**Goal:** match the web app's perceived responsiveness

---

## 0. Scope note on measurements

`node_modules/` is **not installed** on this machine, so no numbers below are measured
bundle/APK sizes — they are counted source facts (file sizes, occurrence counts, config
values). Section 7 gives the exact commands to capture the real baseline before you start,
so each phase can be proven rather than assumed.

---

## 1. What is already correct — do not redo

Worth stating up front, because a lot of the obvious wins are already taken:

| Area | Status |
|---|---|
| Hermes + New Architecture + edge-to-edge | all ON (`android/gradle.properties:39-48`) |
| Metro `inlineRequires` | ON (`metro.config.js:51-56`) |
| Bottom tabs | `lazy: true` + `freezeOnBlur: true` (`navigation/BottomTabNavigator.tsx:36-41`) |
| Home feed data layer | React Query `useInfiniteQuery` + cross-tab prefetch |
| Home collapsible header | fully worklet-driven, UI thread (`hooks/useCollapsibleHeader.ts:93-98`) |
| `AuthContext` | split into 4 providers, all values `useMemo`'d |
| Feed video players | source detached when off-screen (`components/Home/FeedVideoPlayer.tsx:120`) |
| Android `dimezisBlurView` in AppDrawer | correctly gated on `visible &&` (`components/Home/AppDrawer.tsx:301`) |
| Feed video surface | `surfaceType="textureView"` — right call for scroll recycling |

---

## 2. Critical findings

### C1 — The release APK is not optimised at all (R8 off, resource shrinking off)

`android/app/build.gradle:69` reads `enableMinifyInReleaseBuilds` from
`android.enableMinifyInReleaseBuilds`, defaulting to **`false`**. That property is **absent
from `android/gradle.properties`**. Same for `android.enableShrinkResourcesInReleaseBuilds`
(`build.gradle:120`).

So every release build ships **unminified, unshrunk DEX + all resources**. On an app with
this dependency surface (Agora, WebRTC, Livepeer, Web3Auth, Stripe, Solana, Reown,
quick-crypto, Rive, nitro-modules) that is a large amount of dead Java/Kotlin.

### C2 — `android/` is committed AND stale, so `app.json` build settings never reach the APK

`android/` and `ios/` are tracked (49 and 23 files); `.gitignore` says *"keep android/ folder"*.
This is a **bare workflow** — EAS will not run `expo prebuild`, so every config-plugin
setting in `app.json` is inert for the native build.

Proof of drift:

| | `app.json` | `android/app/build.gradle` |
|---|---|---|
| version | `1.14.0` (line 6) | `versionName "1.13.9"` (line 100) |

And `expo-build-properties` → `enableSeparateBuildPerCPUArchitecture: true`
(`app.json:137`) has **no corresponding `splits { abi { … } }` block** in `build.gradle`.
Combined with `reactNativeArchitectures=armeabi-v7a,arm64-v8a`
(`gradle.properties:32`), every APK carries **two full sets of native libraries**.

For this app's `.so` payload that is the single biggest APK line item.

### C3 — Every feed card mounts 9–11 bottom sheets

`components/Home/FeedCard.tsx:1057-1180` mounts eleven sheet components per row, gated
only on **data presence**, never on open state:

```
CommentBottomSheet · GlassTipSheet · PPVSheet · BountyInfoSheet · AskAISheet
AddToFolderSheet · PostOptionsMenu · ShareToDmSheet · ShareSheet
CashtagSheet · ImageTranslationSheet
```

`PostOptionsMenu`, `CashtagSheet` and `ImageTranslationSheet` have **no gate at all**; the
rest are gated on `tokenId != null` / `minterAddress`, which is true for essentially every
post. Each is a full component tree that mounts, runs its hooks and subscribes to contexts
while invisible.

### C4 — Those sheets build up to 7 `ethers.Contract` objects *per card*

The mounted sheets call the contract hooks in `hooks/use-web3.ts` unconditionally:

| Sheet | Contracts built |
|---|---|
| `GlassTipSheet:208-209` | ERC20 (5 KB ABI) + StreamController (19 KB ABI) |
| `PPVSheet:142-148` | ERC20 + StreamController + SwapRouter (**30 KB ABI**) + PaymentRouter |
| `BountyInfoSheet:82` | StreamController |

Each `buildContract` (`hooks/use-web3.ts:41-78`) does an `await getAuthMethod()`
(**SecureStore read**), possibly `getWeb3AuthProvider()`, then
`new ethers.Contract(addr, abi, signer)` — which parses the whole ABI into an
`ethers.utils.Interface`.

At `initialNumToRender: 3` that is ~21 contract builds and ~21 SecureStore reads before the
first feed frame. Scrolling multiplies it.

### C5 — The persisted React Query cache is re-serialised every 2 s, synchronously

`config/queryClient.ts:30-38` creates a `createSyncStoragePersister` with
`throttleTime: 2_000` and **no `dehydrateOptions.shouldDehydrateQuery` filter**
(`App.tsx:147-151` passes none either). With `gcTime: 24 h` the cache only grows.

Consequence: while the user scrolls an infinite feed, every new page triggers
`JSON.stringify(<entire query cache>)` followed by a synchronous MMKV write — **on the JS
thread**, at most every 2 seconds, forever. This is a textbook periodic-stutter signature
and is my prime suspect for "scrolling doesn't feel like the web app".

### C6 — All ~40 screens are evaluated during the first render

`navigation/AppNavigator.tsx:7-46` statically imports every screen. `inlineRequires` defers
the `require()` to first *use*, but the use site is `component={UploadScreen}` inside
`AppNavigator`'s returned JSX — which renders on boot. So at first paint Hermes evaluates
`UploadScreen` (89 KB source), `ChatScreen` (56 KB), `LiveProducerScreen` (49 KB),
`NotificationScreen` (32 KB), `FeedDetailScreen` (32 KB) … **plus their full import graphs**
(Agora, WebRTC, Livepeer, ethers, Stripe).

React Navigation's `getComponent` prop exists exactly for this and is not used anywhere.

### C7 — `MIN_SPLASH_MS = 2500`

`App.tsx:181` enforces a hard 2.5-second splash floor regardless of how fast boot actually
completes. On top of that `screens/SplashScreen.tsx` loads a **1.5 MB Rive file** plus the
Rive native runtime and waits a further 700 ms after the file resolves before crossfading.

Cold start cannot be faster than ~2.5 s while this is in place, no matter what else is fixed.
Given the standing preference for *no transient boot visuals*, the fix is to shorten the
floor to the real readiness signal — not to add another intermediate state.

---

## 3. High-severity findings

### H1 — The whole lucide icon set is in the bundle

`components/ui/Icon.tsx:15`:

```ts
import { icons } from "lucide-react-native";
```

That barrel is **~1,500+ SVG components**. The app uses **134 distinct icon names**. Metro
does not tree-shake, and the lookup is dynamic (`icons[name]`), so nothing can be dropped.
`Icon` is imported nearly everywhere, so the barrel evaluates at boot.

Almost certainly the largest single JS/bytecode contributor.

### H2 — 110 locale JSON files (9.77 MB) all ship in the bundle

`i18n/index.ts:132-242` maps every locale to `() => require('./locales/xx.json')`. Those are
static `require`s with literal paths, so Metro **bundles all 110** — laziness here only
defers evaluation, not download. `en.json` is 81 KB; the other 109 total ~9.7 MB.
Largest: `ml.json` 129 KB, `ta.json` 124 KB, `kn.json` 124 KB.

### H3 — `assets/` is 40.86 MB of unoptimised PNG

31.97 MB PNG (182 files) + 9.68 MB `.riv` (8 files).

| Folder | Size | Files |
|---|---|---|
| `assets/banners/` | 14.94 MB | 11 |
| `assets/web-icons/` | 14.16 MB | 94 |
| `assets/riv/` | 9.68 MB | 8 |

Worst offenders: `banners/9.png` 3.23 MB, `riv/cards.riv` 2.71 MB, `banners/5.png` 1.96 MB,
`web-icons/instagram-logo.png` **610 KB**, `web-icons/wolf-sprite.png` 877 KB. Several
`web-icons/*.png` are 480–505 KB each for icons rendered at 24–48 px — every one of those
decodes at full resolution at runtime.

`expo.webp.enabled=true` is already set, so WebP is available today.

### H4 — Feed thumbnails use RN `Image` and request full-resolution originals

Two compounding problems:

1. `components/Home/FeedVideoPlayer.tsx:390` uses React Native's `Image` for the
   full-width thumbnail — no disk cache, no `recyclingKey`, no downsampling, no priority.
   `expo-image` is already a dependency and used in 15 other files.
2. The CDN resize is **commented out**. `libs/misc.ts:66-67`:

   ```ts
   // return `${baseUrlWithoutSlash}/images/${fileName}${q}`;
   return `${baseUrlWithoutSlash}/images/${fileName}`;
   ```

   `getImageUrl(url, width, height)` accepts dimensions and silently discards them.
   `getAvatarUrl` never sizes either. So a 4000 px original is downloaded and decoded to
   render a 48 px avatar.

### H5 — `trackFeedCardVisibility` is dead code → 10+ live players on profile/community feeds

`components/Feed/InfiniteFeed.tsx:101` defaults it to `false`, and **no caller passes it**
(verified across the repo). So `isVisible` is never supplied to those `FeedCard`s and falls
back to `true` (`FeedCard.tsx:129`) for every windowed row.

Made worse by `removeClippedSubviews={Platform.OS === "android" ? false : true}`
(`InfiniteFeed.tsx:370`) — disabled on the platform that OOMs — and `windowSize={7}`.
The in-code comments already blame this pattern for Android `OutOfMemoryError`.

### H6 — Home warms six feed surfaces at once, 2.5 s after mount

`screens/HomeScreen.tsx:225` fires `setTabsWarm(true)` inside a 2500 ms timer, which mounts
**all four `InfiniteVideoFeed` instances + `HomeImageGrid` + `ShortsGrid`** simultaneously
(lines 96-102, 394-462). At `initialNumToRender: 3` that is ~18 `FeedCard`s live at once —
and with C3, ~180 sheet trees.

The same effect also fires **five concurrent `prefetchInfiniteQuery` calls** (lines 190-221)
at exactly the moment the user starts scrolling.

Hidden tabs use `opacity: 0` (`HomeScreen.tsx:472`). The comment claims the compositor skips
those layers — but the real cost is not GPU, it is that all six lists stay in the React tree,
so any context change re-renders cards in all of them.

### H7 — 453 `console.*` calls ship in release

453 occurrences across 121 files. `babel.config.js` has **no
`transform-remove-console`**. `libs/logger.ts` correctly gates on `DEBUG` — but these are
raw `console.*`, not the logger. Hot paths are the worst: `hooks/use-web3.ts` 36,
`screens/LiveProducerScreen.tsx` 36, `hooks/use-live.ts` 27, `services/nft.service.ts` 26.
Each release-build `console.log` is a real bridge call.

### H8 — JS stack everywhere; `native-stack` installed but unused

`@react-navigation/native-stack@7.3.23` is a dependency with **zero importers**. Both
`RootNavigator` (`navigation/RootNavigator.tsx:2`) and `AppNavigator`
(`navigation/AppNavigator.tsx:2`) use `createStackNavigator` — the JS stack. Screen
transitions are therefore driven from JS with custom `cardStyleInterpolator`s
(`AppNavigator.tsx:59-94`, `RootNavigator.tsx:56-60`) instead of native
`Fragment`/`UINavigationController` transitions.

This is the most visible "feels less native than web" gap after the splash.

---

## 4. Medium-severity findings

| # | Finding | Location |
|---|---|---|
| M1 | `extraData={[…]}` is a fresh array literal each render → all cells re-render every list render (FeedCard's own `memo` still bails, so cost is bounded) | `components/Home/InfiniteVideoFeed.tsx:416` |
| M2 | No `getItemLayout` and no FlashList on any feed → FlatList measures every variable-height cell | `InfiniteVideoFeed.tsx`, `InfiniteFeed.tsx` |
| M3 | `InfiniteFeed` bypasses React Query entirely (local `useState` + manual paging) → no cache, no dedupe, full refetch + skeleton on every mount. This is the profile/community feed and it is why those feel slower than Home. | `components/Feed/InfiniteFeed.tsx:109-257` |
| M4 | Nav state persisted via AsyncStorage (SQLite) and it blocks first paint; `JSON.stringify` of full nav state on every change | `hooks/useNavigationPersistence.ts:190-246, 253-284` |
| M5 | `focusManager` wired to `AppState` with `staleTime: 60 s` → every foreground after 60 s backgrounds triggers a mass refetch storm | `config/queryClient.ts:8-10` |
| M6 | `prewarmWeb3Auth()` runs at mount **and on every foreground** | `App.tsx:91, 102` |
| M7 | Boot-blocking chain: native splash is held until NetInfo resolves, then `useNavigationPersistence` AsyncStorage read, then the 2.5 s floor | `App.tsx:111-130`, `hooks/useNetworkStatus.ts:15` |
| M8 | `AUTOPLAY_DELAY = 1200` ms before a visible feed video starts | `components/Home/FeedVideoPlayer.tsx:57` |
| M9 | Scripted "hint" scroll of the nav pill at t+1500 ms, during first interaction | `navigation/FloatingBottomTabBar.tsx:235-241` |
| M10 | `expo-av` (deprecated, removed in SDK 55) used in 10 files alongside `expo-video` **and** `expo-audio` — three media stacks linked | `components/Comments/VoiceNote*.tsx`, `hooks/useSyncedAudio.ts`, +7 |
| M11 | `WebBrowser.maybeCompleteAuthSession()` called in the render body, not an effect | `App.tsx:78` |
| M12 | `react-native-modal` — **zero importers**, dead dependency | `package.json:112` |
| M13 | Feed cards import the `libs` barrel, pulling `api.client` (axios) + `auth.utils` into every card module | `components/Home/FeedCard.tsx:59` |
| M14 | Three parallel feed-card implementations (`Home/FeedCard`, `Feed/FeedCard`, `Home/HomeFeedCard`) — divergent fixes, 3× maintenance | — |
| M15 | Release `signingConfig` is the **debug** keystore (`build.gradle:119`). EAS normally injects its own, but verify the produced APK's signer. | `android/app/build.gradle:116-126` |

---

## 5. The plan

Ordered so that each phase is independently shippable and independently measurable. Phases 1
and 2 are where the perceived-speed win lives.

### Phase 1 — Zero-risk config wins (½ day, no product code touched)

1. **Turn on R8 + resource shrinking.** Add to `android/gradle.properties`:
   ```properties
   android.enableMinifyInReleaseBuilds=true
   android.enableShrinkResourcesInReleaseBuilds=true
   ```
   Expect keep-rule fallout from the reflective libraries (Agora, WebRTC, Stripe, Rive,
   nitro). Budget a build-and-smoke-test cycle; extend `android/app/proguard-rules.pro`
   (currently only 4 lines, Reanimated only). Do **not** ship without exercising live
   streaming, calls, wallet signing and Stripe.

2. **Fix the ABI problem.** Either add an explicit `splits { abi { … universalApk false } }`
   block to `android/app/build.gradle`, or drop `armeabi-v7a` from
   `reactNativeArchitectures` if 32-bit devices are out of scope. This is likely the largest
   single APK-size win available.

3. **Resolve the prebuild drift (C2).** Decide explicitly: either
   (a) delete `android/` + `ios/` from git and let EAS prebuild from `app.json`, or
   (b) keep them as the source of truth and stop editing native settings in `app.json`.
   Right now you have both and neither wins. Whichever you pick, first sync `versionName`
   to `1.14.0`.

4. **Strip console in release.** `babel.config.js`:
   ```js
   env: { production: { plugins: ["transform-remove-console"] } }
   ```
   Keep `error`/`warn` if you want crash breadcrumbs.

5. **Drop `react-native-modal`** (M12), and plan `expo-av` removal (M10) before SDK 55
   forces it.

*Measure after: APK size, `adb shell am start -W` cold start.*

### Phase 2 — Perceived speed (2–3 days, biggest felt improvement)

6. **Kill the artificial splash floor (C7).** Replace `MIN_SPLASH_MS = 2500` with the real
   readiness signal (auth resolved + nav state restored). If the Rive loader must stay,
   pre-decode it or ship a much smaller `.riv` — 1.5 MB is a lot to parse before first
   frame. No new intermediate visual state; go from splash straight to the feed.

7. **Filter the query persister (C5).** Add `dehydrateOptions.shouldDehydrateQuery` so only
   small, cheap-to-restore keys persist (feed *first page* only, profile, prefs). Raise
   `throttleTime` to ~8–10 s. Consider an async persister so the stringify leaves the JS
   thread. This should remove a periodic scroll stutter on its own.

8. **Gate the feed-card sheets on open state (C3).** Mechanical change:
   `{showComments && tokenId != null && <CommentBottomSheet … />}` for all eleven, including
   the three currently ungated. This also fixes C4 for free — the contract hooks stop running
   until a sheet is actually opened.

9. **Lazy-load screens (C6).** Convert every `component={X}` in `AppNavigator` and
   `BottomTabNavigator` to
   `getComponent={() => require('../screens/X').default}` and delete the static imports.
   Cheapest large cold-start win in the codebase.

10. **Stop warming six feeds (H6).** Keep only the active tab plus at most one neighbour
    mounted; unmount the rest and rely on the React Query cache for instant re-mount
    (it is already wired up). Stagger the five prefetches instead of firing them together,
    and move the trigger off a fixed 2500 ms timer to "after first scroll settles". For tabs
    that do stay mounted, prefer `display: 'none'` over `opacity: 0` where scroll position
    loss is acceptable.

*Measure after: cold start, and a `react-native-performance`/systrace pass over 30 s of feed
scroll (JS FPS + dropped frames).*

### Phase 3 — Bundle and asset diet (2–3 days)

11. **Replace the lucide barrel (H1).** Generate an explicit registry of the 134 used icons
    with per-icon deep imports, and add an ESLint rule banning
    `import { icons } from 'lucide-react-native'`. Keep `Icon`'s public API identical so no
    call sites change.

12. **Unbundle the locales (H2).** Ship English + a top-N set (say the 10–15 most used) and
    fetch the rest on demand from the CDN, caching to `expo-file-system`. Removes ~9 MB of
    JSON from the bundle. Coordinate with the open i18n work — the runtime-switch loader bug
    is a separate, known issue.

13. **Compress `assets/` (H3).** Convert PNG → WebP q80–85 and resize the `web-icons` set to
    actual render size (@2x/@3x). 40.86 MB → single-digit MB is realistic. Audit whether all
    11 banners and 8 `.riv` files are still referenced.

14. **Wire up image resizing (H4).** Un-comment `libs/misc.ts:66-67`, verify the CDN honours
    `?w=&h=`, and thread real dimensions through `getImageUrl` / `getAvatarUrl`. Note the
    prior finding that CF image-resize is **not** available on the DO Spaces CDN — confirm
    what the resize endpoint actually is before shipping, and fall back to pre-generated
    thumbnail sizes if there is no resize service.

15. **Move feed thumbnails to `expo-image` (H4).** `FeedVideoPlayer.tsx:390` first, then the
    other 33 RN-`Image` files. Use `recyclingKey`, `cachePolicy="memory-disk"`, `priority`.

*Measure after: bundle size (`npx expo export`), APK size, image-heavy scroll FPS.*

### Phase 4 — Structural (1 week, do after 1–3 land)

16. **Fix `InfiniteFeed` (H5, M3).** Two options — either pass
    `trackFeedCardVisibility` from all three call sites and re-enable
    `removeClippedSubviews` on Android, or (better) port `InfiniteFeed` onto
    `useInfiniteQuery` the way `InfiniteVideoFeed` already is, and then delete the
    duplication in M14. This is what makes profile/community feeds match Home.

17. **Migrate to `native-stack` (H8).** Already a dependency. Replaces JS-driven card
    interpolators with native transitions. Do it after Phase 2 so the lazy-screen work isn't
    redone; budget time for the custom modal presentations in `AppNavigator.tsx:204-234`.

18. **Adopt FlashList** on the feeds (M2), or at minimum add `getItemLayout` estimates.

19. **Cleanups:** memoise `extraData` (M1), move nav persistence to MMKV (M4), tune
    `focusManager`/`staleTime` to stop the resume refetch storm (M5), drop the
    `prewarmWeb3Auth` on every foreground (M6), reduce `AUTOPLAY_DELAY` (M8), remove the nav
    hint animation (M9), move `maybeCompleteAuthSession` into an effect (M11).

---

## 6. Priority summary

| Rank | Item | Phase | Effort | Primary win |
|---|---|---|---|---|
| 1 | `MIN_SPLASH_MS` = 2500 | 2 | XS | −2 s cold start, immediately felt |
| 2 | Feed-card sheet gating (+ contracts) | 2 | S | scroll smoothness, memory |
| 3 | Query-persister filter | 2 | S | removes periodic scroll stutter |
| 4 | Lazy screens via `getComponent` | 2 | S | cold start |
| 5 | R8 + resource shrinking | 1 | S+test | APK size, startup |
| 6 | ABI splits / drop armeabi-v7a | 1 | XS | APK size |
| 7 | lucide icon registry | 3 | M | bundle size, boot parse |
| 8 | Asset WebP + resize | 3 | M | APK size, image jank |
| 9 | Stop warming 6 feeds | 2 | S | memory, scroll |
| 10 | Locale unbundling | 3 | M | bundle size |
| 11 | `expo-image` on feed thumbs | 3 | M | image decode jank |
| 12 | `InfiniteFeed` → React Query | 4 | L | profile/community parity |
| 13 | `native-stack` migration | 4 | L | native transition feel |

---

## 7. Baseline measurement harness — run this first

Nothing above should be shipped on faith. Capture the baseline, then re-run after each phase.

```bash
# 0. install (no Node on the audit machine — use the portable Node in scratchpad)
npm install --legacy-peer-deps

# 1. JS bundle size + composition
npx expo export --platform android --output-dir /tmp/dh-export
#   then inspect the largest modules
npx react-native-bundle-visualizer   # or: npx source-map-explorer

# 2. APK size + what's inside
eas build -p android --profile production-apk --local
unzip -l app.apk | sort -k1 -n -r | head -40   # biggest entries: lib/, assets/, classes*.dex

# 3. Cold start (average 10 runs, force-stop between)
adb shell am force-stop io.dehub.mobile
adb shell am start -W -n io.dehub.mobile/.MainActivity   # read TotalTime

# 4. Scroll smoothness — 30 s of home-feed scroll
adb shell dumpsys gfxinfo io.dehub.mobile framestats
#   in-app: react-native-performance or the Perf Monitor's JS FPS
```

Record for each phase: **APK bytes · JS bundle bytes · `TotalTime` ms · JS FPS during scroll ·
janky-frame %**.

---

## 8. Risks

- **R8 is the one item that can break the build silently.** Reflective native SDKs (Agora,
  WebRTC, Stripe, Rive, nitro-modules) need keep rules. Do not ship it without a manual pass
  over streaming, calls, wallet signing and payments.
- **Prebuild drift (C2) must be decided before any native change**, or Phase 1 edits may land
  in a file EAS ignores — or get overwritten by a prebuild.
- **Image resizing (H4)** depends on a CDN resize capability that a prior investigation found
  absent on DO Spaces. Verify before implementing, or ship pre-generated sizes instead.
- **Locale unbundling (H2)** overlaps the open i18n work (runtime-switch loader bug, two i18n
  systems). Sequence them together to avoid conflicting rewrites.
- **Branch discipline:** work off `clean-mobile-fixes`, not `main` — `main` is the release
  branch and merges there are treated as build triggers.
