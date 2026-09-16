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
    expect(player).toContain('enabled: isPlayable && isLiveEffective && !isPlayingReplay');
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
