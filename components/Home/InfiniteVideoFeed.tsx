import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useIsFocused, useNavigation, useScrollToTop } from "@react-navigation/native";
import {
  View,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { FlashList, type FlashListRef, type ListRenderItem, type ViewToken } from "@shopify/flash-list";
import { DeHubLoader } from "../DeHubLoader";
import { feedRenderBudget } from "../../libs/feed-render-budget";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import EmptyFeedState from "./EmptyFeedState";
import FeedCard, { resolveContentType } from "./FeedCard";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import Icon from "../ui/Icon";
import { useTranslation } from "react-i18next";
import useNewPostsSignal, { feedRowId } from "../../hooks/useNewPostsSignal";
import { useAuthState } from "../../context/AuthContext";
import {
  getUnifiedFeed,
  UnifiedFeedItem,
  UnifiedFeedParams,
  isVideoItem,
  isLiveItem,
} from "../../services/feed.unified.service";
import { secondsToHMMSS } from "../../libs/date.util";
import { getAvatarUrl, resolveThumbnail, getImageUrl, getBadgeUrl } from "../../libs/misc";
import { theme } from "../../theme";
import {
  createPostViewTracker,
  forceFlushBatchViews,
  type TokenId,
} from "../../services/view.service";
import { feedEvents } from "../../libs/eventBus";
import { capFeedByAuthorAllowance } from "../../libs/postQuota";
import { isPostDeletedSync, useDeletedPostsVersion, warmDeletedPosts } from "../../libs/deleted-posts-store";
import { flattenFeedPages } from "../../libs/feed-pages";
import { setFeedScrolling } from "../../libs/scrollActivity";
import {
  createFeedVisibilityStore,
  useRowVisibility,
  type FeedVisibilityStore,
} from "../../libs/feedVisibility";
import { mergeLiveCounts } from "../../libs/liveCounts";
import { useWatchedVideoIds, filterWatched } from "../../hooks/useWatchedVideos";
import { useLiveStreams } from "../../hooks/useLiveStreams";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { tabPressIntentOf } from "../../navigation/tabPressIntent";
import SuggestedAccountsSection from "./SuggestedAccountsSection";
import ShortsCarousel from "./ShortsCarousel";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getNFT } from "../../services/nft.service";
import { useBoostQueue } from "../../hooks/useSuperpowers";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";

export interface InfiniteVideoFeedHandle {
  scrollToTopAndRefresh: () => void;
}

interface InfiniteVideoFeedProps {
  params?: Partial<UnifiedFeedParams>;
  pageSize?: number;
  /** False when this list is a hidden (kept-mounted) tab — pauses videos and tab-press refresh. */
  active?: boolean;
  contentContainerStyle?: any;
  headerComponent?: React.ReactNode;
  headerInset?: number;
  /**
   * The collapsing header's translateY. The "new posts" pill sits just under
   * the header and rides this so it follows the header off-screen instead of
   * floating mid-feed once the header has slid away.
   */
  headerTranslateY?: SharedValue<number> | null;
  onEndReachedAll?: () => void;
  /** Reanimated worklet scroll handler — when provided, scroll events stay on the UI thread. */
  scrollHandler?: any;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onClearFilters?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onScrollBegin?: () => void;
  onCategorySelect?: (category: string) => void;
  feedRef?: React.MutableRefObject<InfiniteVideoFeedHandle | null>;
  /** Home "all" tab only: the most-viewed-this-month shorts rail. */
  showShortsCarousel?: boolean;
  /**
   * Show the SuperPowers boost slot at the top of this list.
   *
   * Only the main home feed sets it. A filtered or profile-scoped list is
   * somebody asking for particular posts, and dropping an unrelated boosted one
   * into that reads as a bug rather than as a boost.
   */
  showBoostSlot?: boolean;
}

// Reserved height for the footer so its three states are interchangeable
// without resizing the list. Sized to the DeHub mark plus the padding the
// spinner block used to carry.
const FOOTER_SLOT = { height: 84 } as const;

// Hoisted: a fresh object literal here would re-configure the native scroll
// view on every render.
// FlashList anchors on the first visible row's key, so a row prepended while
// the viewer sits at the very top (the boost slot arrives after the first
// page) would be inserted ABOVE the anchor and the offset raised to hold
// position, leaving the boosted card scrolled off the top of the screen. The
// header is data row 0 for that reason (see listData): at the top the anchor
// is the header, and the boost lands below it. The threshold keeps a viewer
// already at the top pinned to the top. There is no minIndexForVisible:
// FlashList sets its own.
//
// The header stays the anchor for as long as any of it is on screen, not just
// up to the threshold, so past it the post under the reader is held by hand
// (see heldOffset).
const MAINTAIN_POSITION = { autoscrollToTopThreshold: 100 } as const;

// Rows the capped list needs before it can scroll at all. Below this the feed
// pulls another page rather than sitting on a screenful of nothing.
const MIN_SCROLLABLE_ROWS = 6;

// Ceiling on top-up fetches per query. Covers the real case — a filtered feed
// whose first page caps to roughly half — while stopping a feed dominated by
// one capped author, or a failing endpoint, from walking every page on mount.
const MAX_TOP_UP_FETCHES = 3;

// How long after the finger lifts to wait for a fling before treating the
// scroll as settled. onScrollEndDrag fires on every lift; a fling's
// onMomentumScrollBegin lands a frame or two later. A lift with no momentum
// event inside this window is a genuine stop.
const SETTLE_AFTER_DRAG_MS = 120;

const DEFAULT_BANNER = require("../../assets/default-banner.png");
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

type FeedRow = UnifiedFeedItem & { __listKey: string; __boosted?: boolean; __synthetic?: "header" | "suggested" | "shorts" };

// Reanimated's wrapper, created once. It attaches the header worklet through
// FlashList's getScrollableNode and gives FlashList a no-op onScroll; FlashList
// still sees every scroll event through its own listener. Never
// renderScrollComponent, and never created inside the component: the first
// FlashList attempt (#925) remounted the list on every render and was reverted
// in #930.
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as unknown as React.ComponentType<any>,
) as unknown as typeof FlashList;

// Cells kept for reuse, across all item types. The pool evicts the newest
// cells first, so the header and suggested-accounts rows (the oldest) go last.
const MAX_POOLED_CELLS = 10;

// Index after which to insert the suggested-accounts carousel (after the 5th post).
const SUGGEST_AFTER_INDEX = 4;
// Home "all" tab only: the most-viewed shorts rail after the 2nd post, near the top like web.
const SHORTS_AFTER_INDEX = 1;

// The header and the suggested-accounts carousel are rows of their own, so a
// recycled post cell is never asked to grow a carousel it did not have.
const HEADER_ROW = { __listKey: "__feed-header", __synthetic: "header" } as FeedRow;
const SUGGESTED_ROW = { __listKey: "__suggested-accounts", __synthetic: "suggested" } as FeedRow;
const SHORTS_ROW = { __listKey: "__shorts-carousel", __synthetic: "shorts" } as FeedRow;

const DEFAULT_CONTENT_STYLE = { paddingHorizontal: 8, paddingTop: 4, paddingBottom: TAB_BAR_CONTENT_INSET };

// A cell is only reused for a row of the same type, so a video card is never
// rebuilt into a gallery. Shorts render as videos in this list.
function feedRowType(item: FeedRow): string {
  if (item.__synthetic) return item.__synthetic;
  const type = resolveContentType(item);
  if (type === "short") return "video";
  if (type !== "image") return type;
  const it = item as any;
  const n = Array.isArray(it.imageUrls) && it.imageUrls.length > 0 ? it.imageUrls.length : it.imageUrl || it.thumbnailUrl ? 1 : 0;
  return n > 1 ? "gallery" : n === 1 ? "image" : "text";
}

// The id flattenFeedPages de-duplicates on, so it is unique. __listKey folds in
// the page and index, so it renames on every page shift.
function feedRowKey(item: FeedRow): string {
  if (item.__synthetic || item.__boosted) return item.__listKey;
  const it = item as any;
  const id = it.tokenId ?? it.id ?? it.stream?.tokenId ?? it.streamKey ?? it.stream?.id;
  return id != null ? `post-${id}` : item.__listKey;
}

// What the list is handed while its page is off screen. HomeScreen hides
// pages with display:none, and nothing under display:none is laid out, so
// FlashList measures its window and every row it mounts there as 0x0. With
// every row at y=0 each one counts as on screen: the list mounts the whole
// page of cards, and the first swipe in draws them stacked at the top until
// it has re-measured. FlatList stopped at initialNumToRender there instead.
const NO_ROWS: FeedRow[] = [];

// The page on screen gets the live rows. A page that has not been laid out
// since the list mounted (the warm-up, or a filter change while it is off
// screen) gets none until it is, and a page that has left the screen keeps
// the rows it had rather than re-laying out on every patch of its cache.
function rowsForList(shown: FeedRow[], live: FeedRow[], active: boolean, laidOut: boolean): FeedRow[] {
  if (active) return live;
  if (shown === NO_ROWS && laidOut) return live;
  return shown;
}

// FlashList holds the first row on screen in place, and while any of the
// header row is on screen that row is the header. So a change between the
// header and the first post (the boost arriving, rotating or ending, the live
// stages bar growing or shrinking) moves the post under the reader and
// nothing moves it back. FlatList held the first post itself
// (minIndexForVisible: 1). Returns the offset that puts it back, or null when
// there is nothing to do: the post did not move, the header row was already
// off screen (FlashList holds the post then), or the reader is at the top,
// where a new boost is meant to show.
function heldOffset(offset: number, headerBottom: number, moved: number): number | null {
  if (Math.abs(moved) < 1) return null;
  if (offset <= MAINTAIN_POSITION.autoscrollToTopThreshold || offset >= headerBottom) return null;
  return Math.max(0, offset + moved);
}

// The first organic post: what the reader is looking at while the header row
// is still on screen.
function firstPostIndex(rows: readonly FeedRow[]): number {
  return rows.findIndex(row => !row.__synthetic && !row.__boosted);
}

// One row. Subscribes to its own visibility so a tick that moves another row
// on or off screen never reaches this one. Whether the list as a whole is on
// screen (active pager page, focused tab) is folded into the same store — see
// setLive below — so a tab switch reaches only the rows that were playing.
const VisibleFeedCard = memo(function VisibleFeedCard({
  item,
  store,
  onCategorySelect,
}: {
  item: UnifiedFeedItem & { __listKey: string };
  store: FeedVisibilityStore;
  onCategorySelect?: (category: string) => void;
}) {
  const { isVisible, isAutoplay } = useRowVisibility(store, item.__listKey);
  return (
    <FeedCard
      item={item}
      onCategorySelect={onCategorySelect}
      // On screen, so it may hold a player and answer a tap. Autoplay is
      // the separate, exclusive flag below — conflating the two meant the
      // second video on screen could not be started at all.
      isVisible={isVisible}
      isAutoplayActive={isAutoplay}
      enablePreview
    />
  );
});

export const InfiniteVideoFeed: React.FC<InfiniteVideoFeedProps> = ({
  params,
  pageSize = 10,
  active = true,
  contentContainerStyle,
  headerComponent,
  headerInset = 0,
  headerTranslateY = null,
  onEndReachedAll,
  scrollHandler,
  onScrollOffset,
  onScrollEnd,
  onClearFilters,
  onRetry,
  onRefresh: onRefreshProp,
  onScrollBegin,
  onCategorySelect,
  feedRef,
  showShortsCarousel = false,
  showBoostSlot = false,
}) => {
  interface FeedItem extends UnifiedFeedItem {
    __listKey: string;
  }
  const [refreshing, setRefreshing] = useState(false);
  const { isMinimal } = useAppTheme();
  // Row visibility lives outside React state so a viewability tick re-renders
  // only the rows it changed, not every mounted cell. See libs/feedVisibility.
  // Created dark when this list mounts as a hidden pager page (the warm-up
  // mounts five of them), so a row never sees a true it has to take back.
  const visibilityStore = useMemo(
    () => createFeedVisibilityStore(active),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const visibleKeysRef = useRef<Set<string>>(new Set());
  const listRef = useRef<FlashListRef<FeedRow>>(null);
  // Posts (not videos) currently reported to their view tracker, by list key.
  const visibleTokensRef = useRef<Map<string, TokenId>>(new Map());
  const prevYRef = useRef(0);
  // Android's maintainVisibleContentPosition can preserve the old first row
  // when an async prepend lands, even with autoscrollToTopThreshold set. Keep
  // a one-shot correction for the boost slot so a viewer who is still at the
  // top actually sees the new position-zero row.
  const pendingBoostRevealRef = useRef(false);
  const revealedBoostRef = useRef<string | undefined>(undefined);
  // The first post and where it sat after the last layout, for heldOffset.
  const firstPostRef = useRef<{ key: string; y: number; headerBottom: number } | null>(null);
  // The rows the list was last handed (see rowsForList).
  const listRowsRef = useRef<FeedRow[]>(NO_ROWS);
  // Whether the list's view has been laid out on screen since it mounted.
  const [laidOut, setLaidOut] = useState(false);
  // Where the list is scrolled, for the boost reveal. Home drives onScroll with
  // the header's worklet, so handleScroll never runs there and prevYRef stays
  // 0; read from it, a boosted post that arrived after the reader had started
  // scrolling threw them back to the top. FlashList tracks the offset through
  // its own scroll listener whatever onScroll is, so no second worklet is
  // needed beside the header's.
  const readOffset = useCallback(() => listRef.current?.getAbsoluteLastScrollOffset() ?? 0, []);
  // Set for the life of a drag or fling. Count patches that would rewrite
  // cached pages mid-scroll — the live-count poll, the counts a fetched page
  // carries — wait on this and land from settleScroll().
  const scrollingRef = useRef(false);
  // Counts carried by pages fetched while scrolling, merged once it settles.
  const pendingFetchedRowsRef = useRef<any[]>([]);

  // Fixed-height top spacer.
  //
  // This used to be an animated height driven by `headerTranslateY`, which made
  // the list's own content box grow and shrink *while the user was scrolling*:
  //   - every frame of the 380ms header animation relaid out the whole content
  //     view (the scroll-time stutter), and
  //   - the content below shifted by up to `headerInset` px on top of the
  //     scroll itself, so a drag that reversed direction moved the feed at
  //     double speed and then stopped dead (the "jumps around" symptom).
  // The header is `position: absolute` over the pager (HomeScreen.styles
  // .headerClip), so it can slide away on its own without the list resizing —
  // and useCollapsibleHeader only hides it once scrollY has passed
  // `headerInset`, which keeps this spacer off-screen whenever it is gone.
  const topSpacerStyle = useMemo(() => ({ height: headerInset }), [headerInset]);

  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();

  // On screen at all: the active pager page, on the focused bottom tab. This
  // used to be a `live` prop on every row, built into renderItem, so a switch
  // of either kind rebuilt renderItem and re-rendered every mounted cell of
  // every feed list — three lists, eleven viewports each — to stop or start
  // the two or three rows that were actually playing. The store tells just
  // those rows.
  useEffect(() => {
    visibilityStore.setLive(active && isFocused);
  }, [visibilityStore, active, isFocused]);

  // View tracking: map of tokenId -> tracker (for feed posts only, not videos)
  const viewTrackersRef = useRef<Map<string, ReturnType<typeof createPostViewTracker>>>(new Map());

  // The onViewableItemsChanged handler is frozen in a ref on first render
  // (FlatList refused a changing one) — and it reaches getViewTracker, which
  // reads isSignedIn. Captured directly, that meant a session that signed in
  // without remounting the feed kept minting anonymous trackers for the rest of
  // its life. A ref is the only value the frozen handler can see change.
  const isSignedInRef = useRef(isSignedIn);
  useEffect(() => { isSignedInRef.current = isSignedIn; }, [isSignedIn]);

  // Signing in or out changes where a view is attributed, so trackers minted
  // under the old state are stale. Dropping them lets the next viewability tick
  // rebuild them; pending dwell time is flushed rather than silently binned.
  useEffect(() => {
    viewTrackersRef.current.forEach((tracker) => tracker.cleanup());
    viewTrackersRef.current.clear();
    forceFlushBatchViews();
    // Every visible post starts over under the new trackers.
    visibleTokensRef.current = new Map();
    try { listRef.current?.recomputeViewableItems(); } catch {}
  }, [isSignedIn]);

  // Cleanup view trackers and flush batch on unmount
  useEffect(() => {
    return () => {
      viewTrackersRef.current.forEach(tracker => tracker.cleanup());
      viewTrackersRef.current.clear();
      forceFlushBatchViews();
    };
  }, []);

  // Get or create a view tracker for a feed post token
  const getViewTracker = useCallback((tokenId: TokenId) => {
    const key = String(tokenId);
    let tracker = viewTrackersRef.current.get(key);
    if (!tracker) {
      tracker = createPostViewTracker(tokenId, isSignedInRef.current);
      viewTrackersRef.current.set(key, tracker);
    }
    return tracker;
  }, []);

  // Viewability config: item is "viewable" when 50% visible
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    // Debounce viewability during flings so a row passing through the viewport
    // mid-fling never counts; the view tracker still measures dwell time itself.
    minimumViewTime: 250,
  }).current;

  // A hidden pager page never scrolls, so its rows stay "viewable" forever and
  // every cache patch re-ran this handler on a list nobody was looking at —
  // minting view trackers and queueing views for posts nobody saw.
  const activeRef = useRef(active);
  activeRef.current = active;

  // Handle viewable items change for visibility and view tracking.
  //
  // FlashList compares viewability by index and never resets it when the data
  // changes, so a row that replaced another at the same index is never
  // reported as changed. Everything here is rebuilt from the full visible set
  // on each tick instead of patched from `changed`, and the list is asked for
  // a fresh tick whenever the rows change (see the recompute effect below).
  const onViewableItemsChanged = useRef(({ viewableItems }: {
    viewableItems: ViewToken<FeedRow>[];
    changed: ViewToken<FeedRow>[];
  }) => {
    if (!activeRef.current) return;

    // A card that renders nothing (a post deleted in place, or one the App
    // Store build does not show) is a 0px row, and FlashList counts a 0px row
    // inside the viewport as fully viewable where FlatList never did. Left in,
    // it took the autoplay slot from the video under it and had a view
    // recorded that nobody saw.
    const hasHeight = (v: ViewToken<FeedRow>) =>
      v.index == null || (listRef.current?.getLayout(v.index)?.height ?? 1) > 0;

    // Track visible posts for audio preloading/pausing (works for all users).
    // The header and suggested-accounts rows are not posts.
    const posts = viewableItems.filter(v => v.isViewable && !!v.item?.__listKey && !v.item.__synthetic && hasHeight(v));
    const next = new Set(posts.map(v => v.item.__listKey));
    visibleKeysRef.current = next;

    // Only the topmost visible row that can hold a player should autoplay.
    // Without the type filter a text or image post above the video took the
    // slot, and then no video autoplayed at all.
    //
    // Live posts count. postType is "live", not "video", so isVideoItem alone
    // excluded them and a live card was never handed autoplay here — it sat on
    // its poster while the stream ran.
    //
    // A LIVE row outranks a video row for the slot, wherever it sits. The slot
    // is exclusive — one player at a time is what keeps a feed of them out of
    // an OutOfMemoryError — and handing it to whichever row happened to be
    // higher meant any ordinary video above a live card left the broadcast
    // sitting on its poster. Opening the post played it immediately, which is
    // how this reads as "live only works if you tap in". A recorded video can
    // wait for a scroll; a broadcast that is running right now cannot, and
    // there are only ever a handful of them.
    const playable = viewableItems.filter(
      v =>
        v.isViewable &&
        !!v.item?.__listKey &&
        !v.item.__synthetic &&
        hasHeight(v) &&
        (isVideoItem(v.item) || isLiveItem(v.item)),
    );
    const byPosition = (a: ViewToken<FeedRow>, b: ViewToken<FeedRow>) => (a.index ?? 0) - (b.index ?? 0);
    const topVideo =
      playable.filter(v => isLiveItem(v.item)).sort(byPosition)[0] ??
      playable.sort(byPosition)[0];
    visibilityStore.update(next, topVideo ? topVideo.item.__listKey : null);

    // No auth gate: signed-out viewers count too, and the view service routes
    // their views to the anonymous view backend.
    //
    // Only feed posts, not videos (videos have their own view tracking via
    // playback). A post at 50%+ reports 0.6 visibility on the tick it arrives
    // and 0 on the tick it leaves, diffed against the previous tick's set.
    const nextTokens = new Map<string, TokenId>();
    for (const v of posts) {
      if (isVideoItem(v.item)) continue;
      const id = v.item.tokenId || (v.item as any).id;
      if (id) nextTokens.set(v.item.__listKey, id);
    }
    const prevTokens = visibleTokensRef.current;
    prevTokens.forEach((id, k) => { if (!nextTokens.has(k)) getViewTracker(id).onVisibilityChange(0); });
    nextTokens.forEach((id, k) => { if (!prevTokens.has(k)) getViewTracker(id).onVisibilityChange(0.6); });
    visibleTokensRef.current = nextTokens;
  }).current;

  useScrollToTop(listRef as any);

  // Cached + revalidated by react-query: switching tabs re-renders instantly
  // from cache (no skeleton flash) and refetches in the background when stale,
  // matching the web app's seamless tab switching.
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["home-feed", params ?? {}, pageSize], [params, pageSize]);
  // Stable string form, so the top-up counter resets on a real query change
  // (filter, tab, refresh) rather than on every render that rebuilds the array.
  const queryKeyString = useMemo(() => JSON.stringify(queryKey), [queryKey]);

  const {
    data,
    error: queryError,
    isLoading: initialLoading,
    isFetchingNextPage: loadingMore,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const response = await getUnifiedFeed({ ...(params || {}), limit: pageSize, page: pageParam });
      // Merging walks every cached feed page of every mounted list. The rows
      // this page renders are fresh already; the other lists can wait until the
      // finger is off the screen.
      if (scrollingRef.current) pendingFetchedRowsRef.current.push(...(response.result || []));
      else mergeLiveCounts(queryClient, response.result);
      return response;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const results = lastPage.result || [];
      if (results.length < pageSize || !lastPage.pagination?.hasMore) return undefined;
      return lastPageParam + 1;
    },
  });

  // Locally-deleted posts keep coming back from cached pages until a refetch;
  // the tombstone store exists for exactly this and was written but never read.
  const { watchedIds, hideWatched } = useWatchedVideoIds();

  const [tombstonesReady, setTombstonesReady] = useState(false);
  useEffect(() => {
    warmDeletedPosts().then(() => setTombstonesReady(true)).catch(() => {});
  }, []);
  // A post deleted from its card leaves the rows at once. The card only hides
  // itself, and under FlashList that lasts until its cell is handed another
  // post: the deleted post then came back further down the scroll.
  const deletedVersion = useDeletedPostsVersion();

  // Pages repeat rows across the offset boundary; flattenFeedPages keeps the
  // first copy and drops tombstoned posts (see libs/feed-pages.ts).
  const rawItems = useMemo<FeedItem[]>(
    () => flattenFeedPages<FeedItem>(data?.pages ?? [], isPostDeletedSync),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, tombstonesReady, deletedVersion],
  );

  // Videos already played, dropped only when the reader asked for that in
  // Settings. Kept as its own memo so the expensive flatMap above does not
  // re-run when the watch history refreshes.
  const watchedFiltered = useMemo<FeedItem[]>(
    () => filterWatched(rawItems, watchedIds, hideWatched),
    [rawItems, watchedIds, hideWatched],
  );

  // ── Live posts get their broadcast back ───────────────────────────────
  //
  // The feed serves live posts as bare tokens: a title, a creator, and nothing
  // about the stream. So the card could not say whether it was running, had no
  // frame to show, and navigated to the viewer with no stream id — a titled
  // grey box that went nowhere. `/live` carries all of that in one small
  // response; folding it onto `item.stream` is enough for the existing card to
  // draw a poster, a LIVE badge and real viewer counts, and to open.
  //
  // A live token with NO stream row is one nobody can ever watch — a launch
  // that minted the post and then failed, the strand backend#279 and #309
  // stopped creating and a prod sweep cleaned up. Those are dropped rather
  // than rendered, but only when the list is known complete: a failed or
  // truncated fetch must not empty the Live tab, so a missing row then means
  // "unknown", and unknown renders.
  const liveStreams = useLiveStreams(active);

  const items = useMemo<FeedItem[]>(() => {
    // Nothing to fold in, and nothing proven about what is missing.
    if (!liveStreams.complete && liveStreams.byToken.size === 0) return watchedFiltered;

    const out: FeedItem[] = [];
    for (const item of watchedFiltered) {
      if ((item as any).postType !== "live") {
        out.push(item);
        continue;
      }
      const id = (item as any).tokenId ?? (item as any).id;
      const streamRow = id == null ? undefined : liveStreams.byToken.get(String(id));
      // The post stays the source of truth for everything a post owns (text,
      // counts, gating); the stream only answers for the broadcast. The feed
      // already joins the stream onto the row, so the post's own copy is the
      // first choice and /live is the fallback for a row that lacks one.
      const stream = (item as any).stream ?? streamRow;
      if (stream) {
        // Hide a stream that never aired, not one that has ended. /live lists
        // only LIVE/PAUSED/SCHEDULED/OFFLINE, so keying the strand rule on
        // "absent from /live" dropped every finished broadcast: a stream that
        // ran for 40 minutes reached neither Home nor the Live tab, on a post
        // that was public, undeleted and carrying a ready replay. A failed Go
        // Live launch is still dropped, on the predicate web settled on in
        // dehubweb#890.
        if (!(stream as any).startedAt) continue;
        out.push({ ...(item as any), stream });
      } else if (!liveStreams.complete) {
        out.push(item);
      }
    }
    return out;
  }, [watchedFiltered, liveStreams]);

  // Tiered home-feed visibility, matching web's HomeFeed. Posting is unlimited,
  // profiles show everything, and followers keep seeing all of it — but the
  // general home feed carries only each author's first `postsPerDay` posts per
  // UTC day, from their own badge tier. Without this the app showed one author
  // holding 14 of the first 30 rows while the site showed 2.
  //
  // Capping across the flattened pages rather than per page keeps the rule
  // stable as more pages load. A creator- or search-scoped list is somebody
  // asking for one person's posts, so it is never capped.
  // Live is exempt. Web has no cap on its LiveFeed either, and the rule exists
  // to stop one author flooding a scroll of recorded posts — a second stream
  // someone is broadcasting right now is time-critical and there are few of
  // them, so hiding it costs a viewer the thing they came for and buys no
  // anti-spam benefit.
  const capExempt = !!(params?.minter || params?.owner || params?.search) || params?.postType === 'live';

  const cappedItems = useMemo<FeedItem[]>(() => {
    if (capExempt) return items;
    return capFeedByAuthorAllowance(items as any[]) as FeedItem[];
  }, [items, capExempt]);

  // ── The boost slot ────────────────────────────────────────────────────
  // A badge holder spends an allowance to put one of their posts at the top of
  // the feed for a window. When several are running the server deals one
  // weighted by tier, so what arrives here is this viewer's draw rather than
  // "the" boosted post — see `useBoostSlot`, where the cache window IS the
  // rotation.
  //
  // Prepended as an ordinary row rather than pushed into the list header: the
  // header's height is load-bearing for the collapsible chrome, and growing it
  // asynchronously moves every row below it. A row costs the list nothing —
  // `maintainVisibleContentPosition` already holds the viewport against
  // exactly this kind of prepend.
  //
  // It arrives after the first page, so the feed never waits on it and never
  // breaks without it.
  // Boosts queue in the order they were booked: the oldest holds the top
  // row, each later one sits three posts below the one before, and when the
  // oldest ends everything moves up. A newer boost never pushes an older one out.
  const { data: boostQueue } = useBoostQueue(showBoostSlot);
  const boostSlot = showBoostSlot ? boostQueue?.[0] : undefined;
  const queuedBoostIds = useMemo(
    () => (showBoostSlot ? (boostQueue ?? []).slice(1).map(b => String(b.tokenId)) : []),
    [showBoostSlot, boostQueue],
  );
  const queuedBoostQueries = useQueries({
    queries: queuedBoostIds.map(id => ({
      queryKey: ["boosted-post", id],
      queryFn: () => getNFT(Number(id)),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const queuedSignature = queuedBoostQueries.map(q => q.dataUpdatedAt).join(",");
  const queuedBoostPosts = useMemo(
    () =>
      queuedBoostQueries
        .map((q, i) => {
          const post = (q.data as any)?.result;
          return post
            ? ({ ...post, __boosted: true, __listKey: `boost-${queuedBoostIds[i]}` } as FeedItem)
            : null;
        })
        .filter(Boolean) as FeedItem[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queuedSignature, queuedBoostIds],
  );

  // `showBoostSlot` gates the READ as well as the render. All three feed types
  // stay mounted at once and share one react-query key, so the Video and Live
  // lists — which opt out — would still see whatever the Home list had already
  // written into that cache and render it. Gating only the fetch is not enough.
  const boostedTokenId = showBoostSlot ? boostSlot?.tokenId : undefined;

  const { data: boostedPost } = useQuery({
    // String key, matching BoostSheet's. Keyed on the raw number, the two
    // caches could never share and boosting from the sheet immediately refetched
    // a payload the sheet had just warmed.
    queryKey: ["boosted-post", String(boostedTokenId ?? "")],
    queryFn: () => getNFT(boostedTokenId!),
    enabled: !!boostedTokenId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const feedItems = useMemo<FeedItem[]>(() => {
    const post = (boostedPost as any)?.result;

    // Nothing to prepend, so leave the list exactly as it was. Filtering the
    // boosted id out here regardless would DELETE the post from the organic
    // feed whenever its fetch failed — a transient 5xx and the creator's post
    // silently disappears from a feed it had legitimately ranked into.
    // Boost N (after the top one) goes after N×3 posts.
    const queuedIds = new Set(queuedBoostPosts.map(p => String((p as any).tokenId)));
    const withQueued = (list: FeedItem[]) => {
      if (!queuedBoostPosts.length) return list;
      const organic = list.filter(it => !queuedIds.has(String((it as any).tokenId ?? (it as any).id ?? "")));
      const out: FeedItem[] = [];
      let next = 0;
      organic.forEach((it, i) => {
        out.push(it);
        if ((i + 1) % 3 === 0 && next < queuedBoostPosts.length) out.push(queuedBoostPosts[next++]);
      });
      while (next < queuedBoostPosts.length) out.push(queuedBoostPosts[next++]);
      return out;
    };

    if (!boostedTokenId || !post) return withQueued(cappedItems);

    // Filter so a post that is both boosted and in the page it would have
    // appeared in does not render twice.
    const rest = withQueued(cappedItems.filter(
      it => String((it as any).tokenId ?? (it as any).id ?? "") !== String(boostedTokenId),
    ));

    return [
      {
        ...post,
        // Read by FeedCard to draw the "Boosted" label. Paid placement at the
        // top of the feed says so, on every client — the feed's whole pitch is
        // that engagement decides reach, and an unlabelled paid slot at
        // position zero makes that untrue.
        __boosted: true,
        __listKey: `boost-${boostedTokenId}-${boostSlot?.bookingId ?? ""}`,
      } as FeedItem,
      ...rest,
    ];
  }, [cappedItems, boostedTokenId, boostedPost, boostSlot?.bookingId, queuedBoostPosts]);

  // Runs once the list has laid out a change: on every content size change,
  // and a frame after a new boost.
  const handleContentSizeChange = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    // A boost that arrived with the reader at the top: show it.
    if (pendingBoostRevealRef.current) {
      pendingBoostRevealRef.current = false;
      // The reader may have started scrolling since; leave them where they are.
      if (readOffset() <= MAINTAIN_POSITION.autoscrollToTopThreshold) {
        list.scrollToOffset({ offset: 0, animated: false });
        prevYRef.current = 0;
      }
    }

    // Anywhere else in the header row's band, keep the post that was first
    // where it was.
    const rows = listRowsRef.current;
    const before = firstPostRef.current;
    firstPostRef.current = null;
    const header = rows[0] === HEADER_ROW ? list.getLayout(0) : undefined;
    if (!header) return;
    if (before) {
      const was = rows.findIndex(row => feedRowKey(row) === before.key);
      const layout = was > 0 ? list.getLayout(was) : undefined;
      const to = layout ? heldOffset(readOffset(), before.headerBottom, layout.y - before.y) : null;
      if (to !== null) list.scrollToOffset({ offset: to, animated: false });
    }
    const index = firstPostIndex(rows);
    const post = index > 0 ? list.getLayout(index) : undefined;
    if (post) {
      firstPostRef.current = {
        key: feedRowKey(rows[index]),
        y: post.y,
        headerBottom: list.getFirstItemOffset() + header.y + header.height,
      };
    }
  }, [readOffset]);

  useEffect(() => {
    const post = (boostedPost as any)?.result;
    if (!boostedTokenId || !post || revealedBoostRef.current === String(boostedTokenId)) return;

    revealedBoostRef.current = String(boostedTokenId);
    // At the top the boost should show. Further down, the post under the
    // reader is held instead (heldOffset).
    if (readOffset() <= MAINTAIN_POSITION.autoscrollToTopThreshold) pendingBoostRevealRef.current = true;

    // Also a frame from now, because the content height can come out the same
    // (a boost that replaces its own organic copy further down), and then no
    // size change arrives.
    const frame = requestAnimationFrame(() => handleContentSizeChange());
    return () => cancelAnimationFrame(frame);
  }, [boostedPost, boostedTokenId, readOffset, handleContentSizeChange]);

  // A page lands in the list the moment it arrives, mid-fling or not, as on
  // web. Holding it until the scroll settled meant a continuous fling ran past
  // the last row into the loading footer: onEndReached had already fired for
  // that content length, so nothing released the held rows until the list
  // stopped. Rows keep their wrapper across pages (libs/feed-pages), so an
  // append renders only the new cells.
  //
  // The header is row 0 and the suggested-accounts carousel a row after the
  // fifth post. An empty feed has neither; ListHeaderComponent carries the
  // header then, above the empty state.
  const listData = useMemo<FeedRow[]>(() => {
    if (feedItems.length === 0) return feedItems;
    const rows: FeedRow[] = [HEADER_ROW];
    feedItems.forEach((row, i) => {
      rows.push(row);
      if (showShortsCarousel && i === SHORTS_AFTER_INDEX) rows.push(SHORTS_ROW);
      if (i === SUGGEST_AFTER_INDEX) rows.push(SUGGESTED_ROW);
    });
    return rows;
  }, [feedItems, showShortsCarousel]);

  // Ticks are skipped while hidden, and FlashList only reports rows whose
  // index changed viewability, so a new page, a prepended boost or a filter
  // swap can leave the wrong card playing. Ask for a full tick when the page
  // is shown and whenever the rows change. Once its last report is cleared an
  // empty list reports nothing at all, so the rows that were visible are let
  // go here instead.
  useEffect(() => {
    if (!active) return;
    if (listData.length === 0) {
      onViewableItemsChanged({ viewableItems: [], changed: [] });
      return;
    }
    try { listRef.current?.recomputeViewableItems(); } catch {}
  }, [active, listData, onViewableItemsChanged]);

  // How far ahead FlashList renders: 1.5 screens, or 1 for gallery-heavy feeds
  // (bitmaps stay resident on the GPU while their row is mounted).
  const { height: screenHeight } = useWindowDimensions();
  const renderBudget = useMemo(() => feedRenderBudget(cappedItems), [cappedItems]);
  const drawDistance = Math.round((screenHeight * (renderBudget.windowSize - 1)) / 4);

  const endReached = hasNextPage === false;
  const error = queryError ? (queryError as Error).message || "Failed to load" : null;

  // The rows the list is handed (see rowsForList).
  const rows = rowsForList(listRowsRef.current, listData, active, laidOut);
  listRowsRef.current = rows;
  // Mirrors the early returns below: the skeleton and the error screen
  // unmount the list, and the next one may mount off screen.
  const listMounted = cappedItems.length > 0 || (!initialLoading && !error);
  useEffect(() => {
    if (listMounted) return;
    listRowsRef.current = NO_ROWS;
    firstPostRef.current = null;
    setLaidOut(false);
  }, [listMounted]);
  // A hidden page is first laid out when a swipe reveals it. The page on
  // screen has its rows already and needs no render for this.
  const handleListLayout = useCallback((e: LayoutChangeEvent) => {
    if (!activeRef.current && e.nativeEvent.layout.height > 0) setLaidOut(true);
  }, []);

  useEffect(() => {
    if (endReached) onEndReachedAll?.();
  }, [endReached, onEndReachedAll]);

  const loadMore = useCallback(() => {
    if (initialLoading || loadingMore || refreshing || !hasNextPage) return;
    fetchNextPage().catch(() => {});
  }, [initialLoading, loadingMore, refreshing, hasNextPage, fetchNextPage]);

  // Top up when the allowance cap leaves too little to scroll.
  //
  // One prolific author can hold most of a page, and capping them removes those
  // rows AFTER the fetch — so a 10-row page can arrive as two visible cards. A
  // list that short never scrolls, `onEndReached` never fires again, and the
  // feed sits there looking finished. This pulls further pages until there is
  // enough to scroll or the server runs out.
  //
  // It is BOUNDED, for two reasons found the hard way:
  //
  //  - If one capped author owns every row of every page, the condition never
  //    clears and the effect fires once per page for as long as the server has
  //    pages. On the all tab that is totalCount / limit — up to ~300 sequential
  //    requests on mount, from a screen that has six of these mounted.
  //  - If `fetchNextPage` REJECTS, TanStack leaves `hasNextPage` true and
  //    returns `isFetchingNextPage` to false with the data unchanged, so every
  //    dependency is back where it started and the effect fires again with no
  //    delay. That is a tight retry loop against a failing endpoint.
  //
  // A handful of attempts covers the real case (a filtered feed whose first
  // page caps to about half) and turns both runaways into "the user scrolls,
  // onEndReached takes over". The counter resets whenever the query itself
  // resets — a pull-to-refresh or a filter change — so a later short page is
  // still topped up.
  const topUpAttemptsRef = useRef(0);
  useEffect(() => {
    topUpAttemptsRef.current = 0;
  }, [queryKeyString]);

  useEffect(() => {
    if (feedItems.length >= MIN_SCROLLABLE_ROWS) return;
    if (!hasNextPage || initialLoading || loadingMore || refreshing) return;
    // A rejected fetch must not be retried from here; the footer's retry and
    // the user's own scroll are the recovery paths.
    if (queryError) return;
    if (topUpAttemptsRef.current >= MAX_TOP_UP_FETCHES) return;
    topUpAttemptsRef.current += 1;
    loadMore();
  }, [
    feedItems.length,
    hasNextPage,
    initialLoading,
    loadingMore,
    refreshing,
    queryError,
    loadMore,
  ]);

  const onRefresh = useCallback(async () => {
    // Call external refresh callback (e.g., to refresh shuffle seed)
    onRefreshProp?.();
    // Keep existing items so the RefreshControl spinner is visible (no skeleton snap).
    setRefreshing(true);
    try {
      // Drop everything past the first page before refetching. React Query
      // refetches every loaded page of an infinite query, so without this a
      // pull-to-refresh deep into the feed fires one request per loaded page.
      queryClient.setQueryData(queryKey, (old: any) =>
        old?.pages?.length > 1
          ? { ...old, pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) }
          : old,
      );
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, onRefreshProp, queryClient, queryKey]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", (event) => {
      if (!isFocused || !active) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      // First press on the focused tab is the cheap one — return to the top and
      // stop there. Only a repeat press refetches; see navigation/tabPressIntent.
      if (tabPressIntentOf(event) !== "refresh") return;
      onRefresh();
    });
    return unsubscribe;
  }, [navigation, isFocused, active, onRefresh]);

  // Listen for feed refresh requests (e.g., after a new post is uploaded)
  useEffect(() => {
    return feedEvents.onRefreshRequested(() => {
      onRefresh();
    });
  }, [onRefresh]);

  const handleRetry = useCallback(() => {
    try { onRetry && onRetry(); } catch {}
    refetch();
  }, [onRetry, refetch]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const prevY = prevYRef.current;
      const delta = y - prevY;
      prevYRef.current = y;
      onScrollOffset?.(y, delta);
    },
    [onScrollOffset]
  );

  // "N new posts" — the chronological feed's only cue that the timeline moved
  // on. Only for the default createdAt sort: under the ranked sorts position
  // isn't time, so the pill would promise something the list can't honour.
  const newestRenderedCreatedAt = useMemo(() => {
    const first = data?.pages?.[0]?.result?.[0] as
      | { createdAt?: string; created_at?: string }
      | undefined;
    return first?.createdAt || first?.created_at || undefined;
  }, [data]);

  // The poll also refreshes the counts on the cards already rendered, so it
  // runs under every sort now — only the pill is held back to the chronological
  // one.
  // Everything the list already holds, at every depth. A post the reader has
  // scrolled past is not new because a poll of the head happens to rank it
  // above the top row.
  const knownIds = useMemo(() => {
    const ids = new Set<string>();
    for (const page of data?.pages ?? []) {
      for (const row of page.result || []) {
        const id = feedRowId(row);
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [data]);

  // The list's own filters, asked of a row the poll found. Counting a row the
  // list would throw away promises a post that refreshing can never produce.
  const isRenderable = useCallback(
    (row: any) => {
      const id = row?.tokenId ?? row?.id ?? row?.stream?.tokenId;
      if (id != null && isPostDeletedSync(id)) return false;
      if (row?.postType === "live" && liveStreams.complete) {
        return id != null && liveStreams.byToken.has(String(id));
      }
      return true;
    },
    [liveStreams],
  );

  const { newPostCount, atCap: newPostsAtCap, flushLiveCounts } = useNewPostsSignal({
    enabled: active && isFocused,
    scrolling: scrollingRef,
    chronological: (params?.sortBy ?? "createdAt") === "createdAt",
    params,
    newestCreatedAt: newestRenderedCreatedAt,
    knownIds,
    isRenderable,
  });

  const showNewPosts = useCallback(() => {
    // onRefresh already drops every page past the first before refetching, so
    // this is the same work pull-to-refresh does, minus the gesture.
    void onRefresh();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [onRefresh]);
  // The finger is up and the list has stopped: apply everything that waited.
  const settleScroll = useCallback(() => {
    scrollingRef.current = false;
    setFeedScrolling(false);
    flushLiveCounts();
    const fetched = pendingFetchedRowsRef.current;
    if (fetched.length) {
      pendingFetchedRowsRef.current = [];
      mergeLiveCounts(queryClient, fetched);
    }
  }, [flushLiveCounts, queryClient]);

  // Settling straight from onScrollEndDrag was the fling stutter that only
  // showed up once a second page had loaded. The finger lifts, that event
  // fires, and the buffered counts and the poll's merge both landed in the
  // very frame the fling was starting. Now a lift only
  // schedules the settle; a fling's onMomentumScrollBegin cancels it and
  // onMomentumScrollEnd settles for real. A lift with no fling behind it
  // settles a few frames later, which nobody can see.
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingSettle = useCallback(() => {
    if (settleTimerRef.current != null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);
  useEffect(() => cancelPendingSettle, [cancelPendingSettle]);

  const handleScrollEndDrag = useCallback(() => {
    cancelPendingSettle();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settleScroll();
    }, SETTLE_AFTER_DRAG_MS);
    onScrollEnd?.();
  }, [onScrollEnd, settleScroll, cancelPendingSettle]);

  const handleMomentumScrollEnd = useCallback(() => {
    cancelPendingSettle();
    settleScroll();
    onScrollEnd?.();
  }, [onScrollEnd, settleScroll, cancelPendingSettle]);

  useEffect(() => {
    if (!feedRef) return;
    feedRef.current = {
      scrollToTopAndRefresh: () => {
        onRefresh();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    };
  }, [feedRef, onRefresh]);

  // Inline JSX here was a fresh element on every render — including the two
  // renders per viewability change — so the list re-rendered the header cell
  // (and re-measured it, moving every row below) mid-fling.
  const headerBlock = useMemo(
    () => (
      <View>
        <View style={topSpacerStyle} />
        {headerComponent as any}
      </View>
    ),
    [topSpacerStyle, headerComponent],
  );

  const renderItem = useCallback<ListRenderItem<FeedRow>>(
    ({ item }) => {
      if (item.__synthetic === "header") return headerBlock;
      if (item.__synthetic === "suggested") return <SuggestedAccountsSection />;
      if (item.__synthetic === "shorts") return <ShortsCarousel />;
      return (
        <VisibleFeedCard
          item={item}
          store={visibilityStore}
          onCategorySelect={onCategorySelect}
        />
      );
    },
    // Stable across a tab switch on purpose: `active` and focus reach the rows
    // through the store (see setLive above), never through this callback.
    [visibilityStore, onCategorySelect, headerBlock],
  );

  // One fixed-height slot for all three footer states. Previously the footer
  // swapped between a spinner block, a text block and `null`, each a different
  // height — so the content size changed underneath a user who was, by
  // definition, sitting at the bottom of the list. Android clamps the scroll
  // offset when content shrinks, which showed up as a jump every time a page
  // finished loading.
  const listFooter = useMemo(
    () => (
      <View style={FOOTER_SLOT} className="items-center justify-center">
        {loadingMore ? (
          <DeHubLoader size={32} />
        ) : endReached && feedItems.length > 0 ? (
          <Text className="text-theme-neutrals-400 text-xs">{t("feed.noMoreContent")}</Text>
        ) : null}
      </View>
    ),
    [loadingMore, endReached, feedItems.length],
  );

  // Held stable so a render of this component is not a new prop on the list,
  // which under FlashList re-measures every mounted cell.
  const listContentStyle = contentContainerStyle || DEFAULT_CONTENT_STYLE;
  const refreshControl = useMemo(
    () => (
      <DeHubRefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={theme.colors.accent}
        progressViewOffset={headerInset}
      />
    ),
    [refreshing, onRefresh, headerInset],
  );
  const listEmpty = useMemo(
    () =>
      !initialLoading && !error ? (
        <EmptyFeedState
          message={t("feed.noFilterMatches")}
          onClear={onClearFilters}
          clearLabel={t("feed.clearFilters")}
        />
      ) : null,
    [initialLoading, error, onClearFilters, t],
  );
  // A list still waiting for its first layout draws nothing, not a header
  // over an empty state that is not true. An empty feed has no header row, so
  // the header rides ListHeaderComponent above the empty state.
  const unshown = rows === NO_ROWS;
  const listHeader = unshown || rows.length > 0 ? null : headerBlock;

  // Handle scroll begin to close filter panel
  const handleScrollBeginDrag = useCallback(() => {
    cancelPendingSettle();
    scrollingRef.current = true;
    setFeedScrolling(true);
    onScrollBegin?.();
  }, [onScrollBegin, cancelPendingSettle]);

  const handleMomentumScrollBegin = useCallback(() => {
    // The lift that preceded this scheduled a settle; the list is still moving.
    cancelPendingSettle();
    scrollingRef.current = true;
    setFeedScrolling(true);
  }, [cancelPendingSettle]);

  // Handle touch start to close filter panel immediately
  const handleTouchStart = useCallback(() => {
    onScrollBegin?.();
  }, [onScrollBegin]);

  // Follow the collapsing header (see the headerTranslateY prop). Declared
  // before the early returns below so the hook order never changes.
  const newPostsPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY ? headerTranslateY.value : 0 }],
  }));

  // Both guards count ORGANIC rows. A live boost is one item in the list, so
  // measuring `feedItems` let a boost mask a completely failed feed — the
  // viewer got the paid post and "No more content", with no error and no
  // retry, which turns an outage into a page that is only an advert.
  if (initialLoading && cappedItems.length === 0) {
    return (
      // Minimal: no side padding, so the skeleton rows span the screen the
      // way minimal FeedCards do once they step out over the list gutter.
      <View className={isMinimal ? "flex-1" : "flex-1 px-2"}>
        {/* Pushed below the collapsible header. The early return drops the
            list's ListHeaderComponent, which is where the header spacer lives —
            without this the skeleton starts at y=0 and its first cards render
            behind the header, so the wait looks broken as well as slow. */}
        <View style={topSpacerStyle} />
        <FeedCardSkeleton count={4} />
      </View>
    );
  }

  if (error && cappedItems.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          className={isMinimal ? "px-5 py-2 border active:opacity-80" : "px-5 py-2 rounded-xl bg-theme-neutrals-700 active:opacity-80"}
          style={isMinimal ? { borderColor: MINIMAL_TAB_LINE } : undefined}
        >
          <Text className="text-theme-neutrals-50 font-medium">{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    // Keyed apart from the skeleton and error views, so a list that mounts
    // off screen gets a view of its own and its first layout is reported.
    <View key="feed-list" className="flex-1" onTouchStart={handleTouchStart} onLayout={handleListLayout}>
      {newPostCount > 0 && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            { position: "absolute", top: headerInset + 8, left: 0, right: 0, alignItems: "center", zIndex: 20 },
            newPostsPillStyle,
          ]}
        >
          <Pressable
            onPress={showNewPosts}
            accessibilityRole="button"
            accessibilityLabel={`${newPostCount} new posts, tap to refresh`}
            className="flex-row items-center gap-1.5 rounded-full border border-white/20 dark-surface bg-black/85 px-4 py-2"
          >
            <Icon name="ArrowUp" size={14} color="#E5E7EB" />
            <Text className="text-xs font-semibold text-white">
              {t("feed.newPosts", { count: newPostCount })}
              {newPostsAtCap ? "+" : ""}
            </Text>
          </Pressable>
        </Animated.View>
      )}
      <AnimatedFlashList
        ref={listRef}
        showsVerticalScrollIndicator={false}
        data={rows}
        // The post's id, not __listKey: a cell and its measured height follow
        // the post, and the scroll anchor below survives a page shift.
        keyExtractor={feedRowKey}
        getItemType={feedRowType}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        // Anchors the scroll position to the first visible row, so anything that
        // changes size *above* the viewport adjusts contentOffset instead of
        // shoving the user. Several things in this feed do exactly that: the
        // suggested-accounts row renders null until its fetch resolves, the live
        // stages bar in the header appears mid-feed, and a card can measure
        // differently once its thumbnail decodes. While any of the header row is
        // on screen the anchor is the header itself, so a change above the
        // first post is held by handleContentSizeChange instead.
        maintainVisibleContentPosition={MAINTAIN_POSITION}
        onContentSizeChange={handleContentSizeChange}
        // Replaces initialNumToRender/windowSize/maxToRenderPerBatch: FlashList
        // renders this many pixels past each edge and reuses cells that leave.
        // No removeClippedSubviews either: FlashList turns it off itself, which
        // its MVCP needs for the same reason FlatList's did.
        drawDistance={drawDistance}
        maxItemsInRecyclePool={MAX_POOLED_CELLS}
        contentContainerStyle={listContentStyle}
        onEndReached={endReached ? undefined : loadMore}
        // Three viewports of runway, about web's 2400px prefetch margin: a
        // fling covers 1.5 viewports before a page can come back.
        onEndReachedThreshold={3}
        onScroll={scrollHandler ?? handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        // 24, not 16: Android only throttles at 17ms or more, so 16 sent JS every
        // frame (about 120 events a second at 120Hz) for list bookkeeping that
        // batches at 50ms anyway. Every third frame is plenty for the header.
        scrollEventThrottle={24}
        // Visibility, autoplay and view tracking for feed posts
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        refreshControl={refreshControl}
        ListFooterComponent={listFooter}
        ListEmptyComponent={unshown ? null : listEmpty}
      />
      <DeHubRefreshMark refreshing={refreshing} topInset={headerInset} />
    </View>
  );
};

// Home keeps all six tab pages mounted, so without this every tab switch
// re-rendered five off-screen feeds along with the one the user asked for.
// HomeScreen holds every prop stable across a switch except `active`.
export default memo(InfiniteVideoFeed);
