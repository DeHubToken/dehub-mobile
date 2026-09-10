import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

describe('video gesture wiring', () => {
  it('uses a native distance-limited tap recognizer inside the shorts pager', () => {
    const viewer = readSource('screens', 'ShortsViewerScreen.tsx');

    expect(viewer).toContain('Gesture.Tap()');
    expect(viewer).toContain('.maxDistance(MEDIA_TAP_SLOP_PX)');
    expect(viewer).toContain('Gesture.Race(hold, tap)');
    expect(viewer).not.toContain('onPress={handleScreenPress}');
  });

  it('keeps the feed timeline outside the play-pause press target', () => {
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');
    const interaction = player.indexOf('{!hideControls && (isPlaying || showControls)');
    const videoPressClose = player.indexOf('/>', player.indexOf('<Pressable {...mediaTap}', interaction));
    const controls = player.indexOf('{showControls && (', interaction);

    expect(interaction).toBeGreaterThan(-1);
    expect(videoPressClose).toBeGreaterThan(interaction);
    expect(controls).toBeGreaterThan(videoPressClose);
  });

  it('guards both loaded videos and posters against scroll travel', () => {
    const player = readSource('components', 'Home', 'FeedVideoPlayer.tsx');

    expect(player).toContain('const mediaTap = useTapOnlyPress(handleMediaSurfacePress);');
    expect(player).toContain('const mediaTap = useTapOnlyPress(() => onPress());');
    expect(player.match(/<Pressable \{\.\.\.mediaTap\}/g)).toHaveLength(3);
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
