import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

/**
 * The self-hosted ingest remuxes rather than transcodes, so its HLS ladder
 * carries the Opus audio the broadcaster published. Android decodes that;
 * Apple does not, at any layer — which makes WebRTC the only way an iPhone can
 * play a self-hosted broadcast at all, on any surface. These pin the two
 * properties that keep that safe: the session is gated like the URL is, and a
 * failure lands back on HLS rather than on a black screen.
 */
describe('live viewer transport', () => {
  it('opens a WebRTC session only for a stream this viewer may watch', () => {
    const player = readSource('components', 'VideoPlayer', 'LiveStreamPlayer.tsx');

    expect(player).toContain('const whepLive = useWhepStream({');
    // Same three conditions the HLS URL is built under: playable, live, and
    // not a replay. A paywall that the transport can step around is not one.
    expect(player).toContain('enabled: Platform.OS !== "android" && isPlayable && isLiveEffective && !isPlayingReplay');
  });

  it('keeps HLS as the fallback rather than replacing it', () => {
    const player = readSource('components', 'VideoPlayer', 'LiveStreamPlayer.tsx');

    expect(player).toContain('{whepLive.stream ? (');
    // The ladder is still there, behind the WebRTC branch.
    expect(player).toMatch(/whepLive\.stream \? \([\s\S]*?<VideoArea/);
  });

  it('latches failure so the picture cannot flap between transports', () => {
    const hook = readSource('hooks', 'useWhepStream.ts');

    expect(hook).toContain('setFailed(true)');
    expect(hook).toContain('enabled && !failed ? whepEndpointFor(stream) : null');
  });

  it('mutes the remote track, since there is no element to mute', () => {
    const hook = readSource('hooks', 'useWhepStream.ts');

    expect(hook).toContain('track.enabled = !muted');
  });

  it('asks for nothing it could be denied — playback is receive-only', () => {
    const whep = readSource('libs', 'whep.ts');

    expect(whep).toContain("pc.addTransceiver('video', { direction: 'recvonly' })");
    expect(whep).toContain("pc.addTransceiver('audio', { direction: 'recvonly' })");
    // Receive-only means no getUserMedia, so a viewer is never prompted for a
    // camera or a microphone to watch a stream.
    expect(whep).not.toContain('getUserMedia');
  });
});

describe('live viewer transport handover', () => {
  it('does not repeat a live HLS timeline as a recorded file', () => {
    const area = readSource('components', 'VideoPlayer', 'VideoArea.tsx');
    const core = readSource('components', 'VideoPlayerCore', 'index.tsx');
    expect(area).toContain('loop={!isLive}');
    expect(core).toContain('p.loop = !liveMode && loop');
  });

  it('starts live playback after setup rather than during native player creation', () => {
    const core = readSource('components', 'VideoPlayerCore', 'index.tsx');
    expect(core).toContain('if (!liveMode && autoplay && sourceUrl)');
    expect(core).toMatch(/useEffect\(\(\) => \{\s+if \(liveMode && autoplay && sourceUrl\) \{\s+player\.play\(\)/);
  });

  it('holds the ladder back while an attempt is in flight', () => {
    const player = readSource('components', 'VideoPlayer', 'LiveStreamPlayer.tsx');
    const hook = readSource('hooks', 'useWhepStream.ts');

    // Starting HLS underneath a WebRTC attempt means the picture begins and
    // then restarts a second later when the session arrives.
    expect(player).toContain('whepLive.pending ? (');
    expect(hook).toContain('pending: !!endpoint && !media && !failed');
  });

  it('never leaves a Livepeer stream or a replay waiting on a session it will not open', () => {
    const hook = readSource('hooks', 'useWhepStream.ts');

    // pending is derived from the endpoint, which is null for anything without
    // a WHEP route — so those fall straight through to HLS.
    expect(hook).toContain('const endpoint = enabled && !failed ? whepEndpointFor(stream) : null');
  });
});
