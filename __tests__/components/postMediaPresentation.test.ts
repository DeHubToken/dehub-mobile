import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

describe('post media presentation', () => {
  it('prioritizes the primary image on the post detail screen', () => {
    const detail = readSource('screens', 'FeedDetailScreen.tsx');
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');
    const containedImage = readSource('components', 'Home', 'ContainedFeedImage.tsx');
    const gallery = readSource('components', 'Home', 'FeedImageGallery.tsx');

    expect(detail).toContain('prioritizeMedia');
    expect(feedCard).toContain('priority={prioritizeMedia ? "high" : "normal"}');
    expect(gallery).toContain("priority={prioritizeMedia && index === 0 ? 'high' : 'normal'}");
    expect(containedImage).toContain('priority={priority}');
  });

  it('keeps breathing room inside link-preview metadata', () => {
    const preview = readSource('components', 'common', 'LinkPreviewCard.tsx');

    expect(preview).toContain('paddingHorizontal: 12, paddingBottom: 12, paddingTop: 14');
  });

  it('separates post content from its metadata row', () => {
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');

    expect(feedCard).toContain('<View className="flex-row items-center gap-2 pt-3">');
    expect(feedCard).not.toContain('<View className="flex-row items-center gap-2 pt-1.5">');
  });

  it('clips feed photos to the same radius as their bento on Android', () => {
    const card = readSource('components', 'Home', 'FeedCard.tsx');
    const containedImage = readSource('components', 'Home', 'ContainedFeedImage.tsx');

    expect(card).toContain('borderRadius: FEED_BENTO_RADIUS');
    // Square in the minimal theme and the cinematic system feed, where the
    // bento it matches is gone too.
    expect(containedImage).toContain('borderRadius: edgeToEdge || postPage ? 0 : FEED_BENTO_RADIUS');
    expect(containedImage).toContain('const edgeToEdge = isMinimal || bleed;');
    expect(containedImage).toContain('overflow: "hidden"');
    expect(containedImage).toContain('style={{ width: "100%", height: "100%" }}');
  });

  it('runs home feed media edge to edge under the Immersive theme only', () => {
    const card = readSource('components', 'Home', 'FeedCard.tsx');
    const list = readSource('components', 'Home', 'InfiniteVideoFeed.tsx');

    expect(card).toContain('const cinematicFeed = cinematic && theme === "immersive" && !skin && !isMinimal && !immersive && !flat;');
    expect(card).toContain('<FeedBleedContext.Provider value={feedBleed}>');
    // Preserve the current 20pt spacing around the full-width separator.
    expect(card).toMatch(/paddingVertical: 20,\s+borderBottomWidth: StyleSheet\.hairlineWidth,/);
    expect(list).toContain('      cinematic\n');
  });

  it('starts the Immersive home feed under the capsule with no band behind it', () => {
    const home = readSource('screens', 'HomeScreen.tsx');
    const list = readSource('components', 'Home', 'InfiniteVideoFeed.tsx');
    const card = readSource('components', 'Home', 'FeedCard.tsx');

    expect(home).toContain('const postFeedInset = island ? 0 : headerHeight;');
    expect(home).toContain('firstRowInset={postFeedFirstRowInset}');
    expect(list).toContain('topChromeInset={item.__listKey === firstRowKey ? firstCardInset : undefined}');
    // A video keeps running to the top; its chip and buttons move to the
    // bottom of the media, and the tools menu opens upward from there.
    expect(card).toContain('const chipAtBottom = chipOverMedia && leadInset > 0;');
    expect(card).toContain('fromBottom={chipAtBottom ? bottomBand + 8 : undefined}');
    expect(card).toContain('onAskAi={handleAiPress}');
  });

  it('puts the first post chrome in the bottom corners, lifting only over the player bar', () => {
    const card = readSource('components', 'Home', 'FeedCard.tsx');
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');
    const chrome = readSource('components', 'Home', 'CinematicChrome.tsx');

    expect(card).toContain('const bottomBand = mediaBarUp ? CINEMATIC_BOTTOM_BAND : CINEMATIC_BOTTOM_BAND_LOW;');
    expect(card).toContain('setBarUp: chipAtBottom ? setMediaBarUp : undefined,');
    expect(card).toContain('[styles.cinematicBottom, mediaBarUp && styles.cinematicBottomLifted]');
    expect(card).toContain('cinematicBottom: { bottom: CINEMATIC_EDGE, right: 6, alignItems: "flex-end" },');
    expect(card).toContain('bare={chipAtBottom}');
    expect(player).toContain('const barUp = !hideControls && showControls;');
    expect(player).toContain('setBarUp?.(barUp);');
    // No backing behind the bare icons, and a 32pt tap area.
    expect(chrome).toContain('bare ? styles.bareButton : styles.button');
    expect(chrome).toContain('const BARE_ICON = 22;');
    expect(chrome).toContain('export const CINEMATIC_BARE_BUTTON = 32;');
  });

  it('draws one hairline at the who-to-follow row, under it', () => {
    const list = readSource('components', 'Home', 'InfiniteVideoFeed.tsx');
    const suggested = readSource('components', 'Home', 'SuggestedAccountsSection.tsx');

    expect(list).toContain('hideDivider={item.__listKey === beforeSuggestedKey || item.__listKey === beforeShortsKey}');
    expect(suggested).toContain('borderBottomColor: CINEMATIC_HAIRLINE,');
    expect(suggested).toContain('return cinematic ? <View style={styles.lineOnly} /> : null;');
  });

  it('opens a feed menu from the capsule instead of the tab pill', () => {
    const home = readSource('screens', 'HomeScreen.tsx');
    const island = readSource('components', 'Home', 'IslandTopBar.tsx');

    expect(home).toContain('const showNavPill = !island || feedProfileVisible || !!imageFeed;');
    expect(home).toContain('<IslandFeedMenu');
    expect(island).toContain('export const IslandFeedMenu = memo(function IslandFeedMenu({');
    expect(island).toContain('t("filters.filters")');
  });

  it('sends a Home tab press on another home feed back to the Home feed', () => {
    const home = readSource('screens', 'HomeScreen.tsx');
    const list = readSource('components', 'Home', 'InfiniteVideoFeed.tsx');

    expect(home).toContain('answersTabPress={feedType === "all"}');
    expect(home).toContain('if (activeIndexRef.current === 0) return;');
    expect(home).toContain('handleNavPostTypeChange("all");');
    expect(list).toContain('if (!answersTabPress || !isFocused || !active) return;');
  });

  it('fills the width with cinematic media and caps feed videos at 75% of the screen', () => {
    const containedImage = readSource('components', 'Home', 'ContainedFeedImage.tsx');
    const video = readSource('components', 'Home', 'FeedVideoPlayer.tsx');

    expect(containedImage).toContain('postPageMaxHeightFor(screenHeight, availableWidth),\n          ),');
    expect(containedImage).toContain('contentFit={bleed ? "cover" : "contain"}');
    expect(video).toContain('Math.max(mediaAspect, boxWidth / (win.height * 0.75))');
    expect(video).toContain('width: bleed ? windowSize.width : mediaBoxWidth(');
  });

  it('keeps post action controls evenly inset from every bento edge', () => {
    const card = readSource('components', 'Home', 'FeedCard.tsx');

    expect(card).toContain('paddingTop: 12,');
    expect(card).toContain('paddingHorizontal: 12,');
    expect(card).toContain('paddingBottom: 12,');
    expect(card).not.toContain('paddingBottom: 24,');
  });

  it('caches recently decoded feed images and releases hidden audio players', () => {
    const containedImage = readSource('components', 'Home', 'ContainedFeedImage.tsx');
    const imageGrid = readSource('components', 'Home', 'HomeImageGrid.tsx');
    const audioPlayer = readSource('components', 'Home', 'AudioPostPlayer.tsx');
    const musicFeed = readSource('components', 'Music', 'MusicFeed.tsx');
    const home = readSource('screens', 'HomeScreen.tsx');

    expect(containedImage).toContain('cachePolicy="memory-disk"');
    expect(imageGrid).toContain('cachePolicy="memory-disk"');
    expect(audioPlayer).toContain('if (isVisible && isFocused) return;');
    expect(audioPlayer).toContain('player.remove()');
    expect(musicFeed).toContain('isVisible={active && visibleIds.has(');
    expect(home).toContain('active={isPlaybackActive}');
  });
});
