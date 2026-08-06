# DeHub Mobile — Performance Re-Audit

**Date:** 2026-08-06
**Audited tree:** `agent/mobile-web-ui-parity` @ `c6c9d7c` + 38 uncommitted files (working tree as it stands)
**Predecessor:** `docs/PERF_AUDIT_2026-07-25.md`
**Method:** static only — `node_modules` is present but there is no Node runtime on this machine, so
nothing below is a measured number. Counts, config values and file sizes are read from source.

---

## 0. Headline

Most of the July plan has landed. Phases 1 and 2 are essentially complete — every critical
finding (C1–C7) is fixed, and 9 of the 15 medium findings with them. What is left is
concentrated in **Phase 3 (bundle and asset diet)**, which is untouched, plus a handful of
Phase 4 items and one new regression introduced by the parity work.

The remaining wins are mostly **size** — bundle bytes, APK bytes, boot parse cost — not scroll
smoothness. The scroll-path work is done.

---

## 1. Closed since the last audit — verified in tree

| ID | Finding | Evidence |
|---|---|---|
| C1 | R8 + resource shrinking off | `android/gradle.properties:36-37` both `=true`; `proguard-rules.pro` grown 4 → 109 lines |
| C2 | No ABI splits, version drift | `android/app/build.gradle:140-147` `splits { abi { … universalApk false } }`; `versionName "1.14.0"` now matches `app.json` |
| C3 | 11 sheets mounted per feed card | all 12 sheets in `components/Home/FeedCard.tsx:1242-1381` now gated on their own open state |
| C4 | ~7 `ethers.Contract` builds per card | follows from C3 — the contract hooks no longer run until a sheet opens |
| C5 | Query cache re-serialised every 2 s | `config/queryClient.ts:95` `throttleTime: 10_000`, plus `trimPersistedClient` cutting infinite feeds to page 1 before each write |
| C6 | All ~40 screens evaluated at boot | every screen in `AppNavigator.tsx` on `getComponent`; `RootNavigator.tsx:71-74` lazies the whole auth stack |
| C7 | `MIN_SPLASH_MS = 2500` | gone — `App.tsx:270` gates on real readiness (`isBootLoading || !isReady`) |
| H5 | `trackFeedCardVisibility` dead | `components/Feed/InfiniteFeed.tsx:119` defaults `true`; `removeClippedSubviews` now on unconditionally (line 403) |
| H6 | Six feeds warmed at once | staggered `InteractionManager` mount at `WARM_STEP_MS` 220 (`HomeScreen.tsx:338-357`) and staggered prefetch at 260 ms (`:364-423`); hidden pages moved off-screen in a pager row instead of `opacity: 0` |
| M1 | `extraData` fresh array literal | memoised (`InfiniteVideoFeed.tsx:385`) |
| M3 | `InfiniteFeed` bypassed React Query | now on `useInfiniteQuery` (`InfiniteFeed.tsx:223`) with a ref-stable `fetchPage` |
| M5 | Resume refetch storm | `staleTime: 5 * 60_000`, `refetchOnWindowFocus: false` (`queryClient.ts:19-27`) |
| M6 | `prewarmWeb3Auth` on every foreground | gated behind `WEB3AUTH_REPREWARM_AFTER_MS = 5 min` (`App.tsx:83, 137`) |
| M8 | `AUTOPLAY_DELAY = 1200` | now 400 (`FeedVideoPlayer.tsx:64`), 250 in `ShortsGridCard.tsx:15` |
| M9 | Scripted nav-pill hint at t+1500 | removed (`FloatingBottomTabBar.tsx:275`) |
| M11 | `maybeCompleteAuthSession` in render body | moved to an effect (`App.tsx:118-120`) |
| M14 | Three feed-card implementations | `Home/HomeFeedCard.tsx` deleted; two remain |

Also new since July and worth keeping: list windowing is tuned across all four feeds
(`initialNumToRender`/`maxToRenderPerBatch`/`windowSize`/`updateCellsBatchingPeriod`),
`getItemLayout` is supplied on both fixed-height grids, and `components/common/SmartImage.tsx`
wraps `expo-image` with `memory-disk` caching and `recyclingKey` for the recycling lists.

---

## 2. Still open — ranked by expected return

### 1. The lucide barrel (H1) — largest single item left

`components/ui/Icon.tsx:15`:

```ts
import { icons } from "lucide-react-native";
```

`node_modules/lucide-react-native/dist/esm/icons/` contains **1,616 icon modules** (31 MB on
disk). The app uses **122 distinct icon names** through `Icon`, plus 15 files that already deep-
import named icons directly. Metro does not tree-shake and the lookup is dynamic (`icons[name]`),
so every one of the 1,616 is bundled and the barrel evaluates at boot because `Icon` is imported
almost everywhere.

**Fix:** generate a registry module mapping the 122 used names to per-icon deep imports, keep
`Icon`'s public API byte-identical so no call site changes, and add a lint rule banning the
barrel import. This is a codegen script plus one file.

### 2. Locales are all bundled (H2)

`i18n/index.ts` has **109 static `require('./locales/xx.json')` calls**. Literal paths mean Metro
bundles all 110 files — laziness defers evaluation, not inclusion. `i18n/locales/` is **11 MB**.

**Fix:** ship English plus a top-N set, fetch the rest on demand to `expo-file-system`. Coordinate
with the open i18n work.

### 3. `assets/` is 42 MB (H3)

| Folder | Size |
|---|---|
| `assets/web-icons/` | 15 MB |
| `assets/banners/` | 15 MB |
| `assets/riv/` | 9.5 MB |
| `assets/badges/` | 1.5 MB |

`expo.webp.enabled=true` is already set. Converting PNG → WebP q80–85 and resizing `web-icons` to
actual render size should take this to single-digit MB. Also worth auditing whether all 11 banners
and 8 `.riv` files are still referenced.

### 4. Image resizing is still disabled (H4)

`libs/misc.ts:66` — the resize line is still commented out:

```ts
// return `${baseUrlWithoutSlash}/images/${fileName}${q}`;
return `${baseUrlWithoutSlash}/images/${fileName}`;
```

`getImageUrl(url, width, height)` builds `q` and then discards it on the CDN branch. So a
full-resolution original is downloaded and decoded to paint a 48 px avatar.

Blocked on a fact, not on effort: a prior investigation found CF image-resize is **not** available
on the DO Spaces CDN. Confirm what the resize endpoint actually is before implementing, and fall
back to pre-generated thumbnail sizes if there is none.

### 5. 18 hot-path files still use RN `Image` instead of `SmartImage`

`SmartImage` landed and `FeedVideoPlayer` uses it for the main thumbnail — but these still use
React Native's `Image` (no disk cache, no `recyclingKey`, no downsampling), and all of them appear
inside recycling lists:

```
Home/FeedCardHeader · Home/VideoCard · Home/CompactVideoCard · Home/LiveStreamCard
Home/SuggestedAccountCard · Feed/FeedCard · Feed/FeedImageGallery · Comments/CommentItem
Comments/CommentMediaPreview · DM/ConversationItem · DM/SharedPostPreview · DM/GifPicker
common/QuotedPostEmbed · Profile/ProfileAssets · Search/SearchAccountChip …
```

Avatars in `FeedCardHeader` and `CommentItem` are the ones that matter most — they re-decode on
every scroll-back.

### 6. NEW — unstable `renderItem` defeats cell memoisation on profile/community feeds

Not in the July audit; introduced by the route split.

`components/Feed/InfiniteFeed.tsx:186-199` wraps the caller's `renderItem` in a `useCallback` keyed
on `[renderItem, trackFeedCardVisibility, isItemVisible]`. All three call sites pass a **fresh
inline arrow every render**:

- `components/Profile/FeedRoute.tsx:72`
- `components/Profile/ProfileFeedTypeRoute.tsx:80`
- `components/Communities/CommunityFeedRoute.tsx:98`

So any re-render of the route produces a new `renderFeedItem`, and `FlatList` re-renders every cell
in the window. `FeedCard`'s own `memo` bounds the damage to reconciliation rather than a full
subtree re-render, but the wrapper `<View className="px-3">` is rebuilt each time regardless.

**Fix:** hoist each to a `useCallback` with stable deps. Three small edits.

### 7. 426 `console.*` calls ship in release (H7)

No `transform-remove-console` in `babel.config.js`, and `babel-plugin-transform-remove-console` is
not in `devDependencies`. 118 of the 426 are `console.log` — pure droppable. Worst hot paths:
`hooks/use-web3.ts` 36, `screens/LiveProducerScreen.tsx` 36, `services/nft.service.ts` 28,
`hooks/use-live.ts` 27.

### 8. Home still ends up with all six tab pages mounted (H6 residual)

The warm-up was staggered and moved off a fixed timer, which fixed the burst. But
`HomeScreen.tsx:343` still walks all of `TAB_ORDER` and mounts every page. Six feed lists stay in
the React tree for the session, so a context change still re-renders cards in all six. Capping
mounted pages at active ± 1 and evicting the rest — the React Query cache already makes re-mount
instant — is the remaining half.

### 9. Smaller carry-overs

| ID | Item | Location |
|---|---|---|
| H8 | `@react-navigation/native-stack` still has **zero importers**; both navigators use the JS stack with custom `cardStyleInterpolator`s | `navigation/*.tsx` |
| M4 | Nav state persisted through AsyncStorage (SQLite) + `JSON.stringify` on a 500 ms debounce, and the read blocks first paint | `hooks/useNavigationPersistence.ts:193, 269, 278` |
| M10 | `expo-av` still imported in 7 files alongside `expo-video` and `expo-audio` — three media stacks linked. Removed in SDK 55 | `hooks/useSyncedAudio.ts`, `libs/audioSession.ts`, +5 |
| M12 | `react-native-modal` still a dependency, zero importers (one comment mentions it) | `package.json:116` |
| M13 | Both feed cards import the `libs` barrel, which `export *`s `api.client` (axios) and `auth.utils` into every card module | `Home/FeedCard.tsx:64`, `Feed/FeedCard.tsx:16` |
| M15 | Release `signingConfig` is still the debug keystore — verify the produced APK's signer | `android/app/build.gradle` |

---

## 3. Test and CI speed

Separate axis from app speed, and there is real waste here.

### T1 — `ts-jest` is transpiling every `.ts`/`.tsx` for no benefit

`jest.config.js:5-8` overrides the `react-native` preset's babel transform with `ts-jest` — and
sets `diagnostics: false`, which turns off the only thing ts-jest offers over babel. So the suite
pays a full TypeScript compile per file and gets no type checking in exchange (that already runs
separately as `tsc --noEmit` in CI).

**Fix:** delete the `ts-jest` transform entry and let the preset's `babel-jest` handle `.ts`/`.tsx`.
Typically a 2–4× suite speedup. `ts-jest` then drops out of `devDependencies` too.

### T2 — Coverage instruments 319 component files that no test touches

`collectCoverageFrom` includes `components/**`, `hooks/**` and `context/**` — roughly 380 files.
The 20 test files cover `libs/`, `services/` and 2 hooks. Every `test:ci` run therefore instruments
and reports on the entire component tree to satisfy a 10 % global threshold.

**Fix:** narrow `collectCoverageFrom` to the directories actually under test, and raise the
threshold to something meaningful for those. Keeps the gate honest and cuts most of the coverage
cost.

### T3 — The CI coverage gate never runs

`.github/workflows/ci.yml:64` and `:92` both guard on `coverage/coverage-summary.json`. Jest's
default `coverageReporters` are `["clover", "json", "lcov", "text"]` — **`json-summary` is not
configured**, so that file is never written. Both guards fall through silently.

Net effect: the "Coverage summary" step prints nothing, and the entire third job (`test-results` —
a fresh runner, an artifact download, a Node invocation) is a no-op that still costs wall-clock on
every PR. The `coverageThreshold` block in `jest.config.js` is what is actually enforcing anything.

**Fix:** either add `coverageReporters: ['text', 'json-summary']` and let the job work, or delete
the `test-results` job and rely on `coverageThreshold`. The second is cheaper and loses nothing.

### T4 — The full dependency tree installs twice per run

`lint-typecheck` and `test` each run `npm ci --legacy-peer-deps` on a tree this size. `cache: npm`
caches the *download*, not `node_modules`, so the link/build step is paid twice.

**Fix:** cache `node_modules` keyed on `package-lock.json`, or merge the two jobs — `tsc --noEmit`
and `jest` on one runner is cheaper than two installs.

### T5 — `npm run lint` is dead

There is no ESLint config anywhere in the repo and `eslint` is not in `devDependencies`, so
`npm run lint` cannot succeed. CI's job is named "Lint & Typecheck" but only runs `tsc`. Either
wire ESLint up properly (it is also the enforcement mechanism for the lucide barrel ban in item 1)
or drop the script and rename the job.

---

## 4. Suggested order

| # | Item | Effort | Win |
|---|---|---|---|
| 1 | Jest: drop `ts-jest`, narrow coverage, fix/delete the dead CI job | S | fastest feedback loop, do it first |
| 2 | Unstable `renderItem` on the 3 feed routes | XS | profile/community scroll |
| 3 | `transform-remove-console` in release | XS | bridge traffic in hot paths |
| 4 | lucide icon registry | M | bundle size + boot parse — biggest remaining |
| 5 | `assets/` → WebP + resize | M | APK size |
| 6 | Locale unbundling | M | ~10 MB bundle |
| 7 | `SmartImage` for the 18 remaining `Image` call sites | M | scroll-back decode jank |
| 8 | Cap mounted home tabs at active ± 1 | S | memory, re-render fan-out |
| 9 | Image CDN resize — **confirm the endpoint exists first** | S | download + decode everywhere |
| 10 | Drop `react-native-modal`, plan `expo-av` removal | S | dep surface, SDK 55 readiness |
| 11 | `native-stack` migration | L | native transition feel |

---

## 5. What still cannot be answered from here

"Perfectly fast on all tests" needs numbers, and none exist yet. Every item above is a counted
source fact. The measurement harness in §7 of the July audit was never run, so there is still no
baseline for APK bytes, JS bundle bytes, `am start -W TotalTime`, JS FPS during scroll, or janky-
frame percentage — which means none of the work already landed has been proven either.

Running that harness once, now, is worth more than any single item on this list: it would confirm
the Phase 1–2 work paid off and tell you whether the size items in Phase 3 are actually the
bottleneck they look like on paper.
