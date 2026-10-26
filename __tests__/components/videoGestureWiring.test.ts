import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

describe('video gesture wiring', () => {
  it('uses a native distance-limited tap recognizer inside the shorts pager', () => {
    const viewer = readSource('screens', 'ShortsViewerScreen.tsx');

    expect(viewer).toContain('Gesture.Tap()');
    expect(viewer).toContain('.maxDistance(MEDIA_TAP_SLOP_PX)');
    expect(viewer).toContain('Gesture.Race(makeEdgeBack(), minimizePan, restorePan, hold, tap)');
    expect(viewer).not.toContain('onPress={handleScreenPress}');
  });

  it('keeps the shorts video tap out of the top button strip while it shows', () => {
    // The video's Tap used to win taps on the edge of Back (RN hitSlop is
    // invisible to gesture-handler) and cancel the press: back only hid the buttons.
    const viewer = readSource('screens', 'ShortsViewerScreen.tsx');

    expect(viewer).toContain('const mediaHitSlop = { top: chromeVisible ? -topChromeBand : 0 };');
    expect(viewer.match(/\.hitSlop\(mediaHitSlop\)/g)?.length).toBe(2);
  });

  it('leaves shorts on a sideways swipe from the left edge', () => {
    const viewer = readSource('screens', 'ShortsViewerScreen.tsx');

    expect(viewer).toContain('.hitSlop({ left: 0, width: EDGE_BACK_ZONE })');
    expect(viewer).toContain('.failOffsetY([-EDGE_BACK_CLAIM, EDGE_BACK_CLAIM])');
    expect(viewer).toContain('Gesture.Race(makeEdgeBack(), hidePan)');
  });

  it('keeps the feed timeline outside the play-pause press target', () => {
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');
    const interaction = player.indexOf('{!hideControls && !isContentGated && !isProcessing && !isFailed && (');
    const videoPressClose = player.indexOf('/>', player.indexOf('<Pressable {...mediaTap}', interaction));
    const controls = player.indexOf('<VideoScrubZone', interaction);

    expect(interaction).toBeGreaterThan(-1);
    expect(videoPressClose).toBeGreaterThan(interaction);
    expect(controls).toBeGreaterThan(videoPressClose);
  });

  it('scrubs the feed timeline with a gesture that can outrank the pager', () => {
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');

    // A PanResponder here loses to the Home pager's gesture-handler pan: the
    // page turned sideways instead of the video seeking.
    expect(player).toContain('useScrubGesture({');
    expect(player).toContain('<VideoScrubZone');
    expect(player).not.toContain('seekPanResponder');
    const zone = readSource('components', 'Home', 'VideoScrubZone.tsx');
    expect(zone).toContain('useScrubGesture({');
    expect(zone).toContain('tapEnabled: false');
    expect(zone).toMatch(/zone:\s*\{[^}]*height: SCRUB_HIT_HEIGHT/);
  });

  it('gives the shorts viewer a draggable timeline that outranks its pager', () => {
    const viewer = readSource('screens', 'ShortsViewerScreen.tsx');

    expect(viewer).toContain('useScrubGesture({');
    expect(viewer).toContain('blocks: scrubBlocks');
    expect(viewer).toContain('<GestureDetector gesture={scrubGesture}>');
    // Only the short being watched runs a time-update clock.
    expect(viewer).toContain('player.timeUpdateEventInterval = 0.25;');
    expect(viewer).toContain('player.timeUpdateEventInterval = 0;');
  });

  it('keeps every in-feed scrubber on a pager-blocking gesture', () => {
    const scrub = readSource('hooks', 'useScrubGesture.ts');
    const audio = readSource('components', 'Home', 'AudioPostPlayer.tsx');

    expect(scrub).toContain('pan.blocksExternalGesture(...blocked)');
    expect(scrub).toContain('tap.blocksExternalGesture(...blocked)');
    expect(audio).toContain('return useScrubGesture({');
    expect(audio).not.toContain('PanResponder.create(');
  });

  it('guards both loaded videos and posters against scroll travel', () => {
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');

    expect(player).toContain('const mediaTap = useTapOnlyPress(handleMediaSurfacePress);');
    expect(player).toContain('const mediaTap = useTapOnlyPress(() => onPress());');
    expect(player.match(/<Pressable \{\.\.\.mediaTap\}/g)).toHaveLength(2);
  });

  it('wires double Like and triple Love through the feed video player', () => {
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');
    const card = readSource('components', 'Home', 'FeedCard.tsx');

    expect(player).toContain('showTapReactionAnimation("like", locationX, locationY);');
    expect(player).toContain('showTapReactionAnimation("love", locationX, locationY);');
    expect(player).toContain('onTapReaction("like");');
    expect(player).toContain('onTapReaction("love");');
    expect(card).toContain('onTapReaction={handleVideoTapReaction}');
  });

  it('keeps video views out of native focus decoration', () => {
    const feedPlayer = readSource('components', 'Home', 'FeedVideoPlayer.tsx');
    const corePlayer = readSource('components', 'VideoPlayerCore', 'index.tsx');

    expect(feedPlayer).toContain('focusable={false}');
    expect(corePlayer).toContain('focusable={false}');
  });
});
