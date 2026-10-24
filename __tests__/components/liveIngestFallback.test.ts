import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

/**
 * The app used to carry a Livepeer API key in its bundle, and used it to poll
 * Livepeer directly — even about self-hosted streams Livepeer has never seen.
 * The key is gone; the API answers from whichever provider a stream is on.
 */
describe('no Livepeer key in the app', () => {
  it('is not read from the environment', () => {
    expect(readSource('config', 'env.ts')).not.toContain('LIVEPEER_API_KEY');
    expect(readSource('env.d.ts')).not.toContain('LIVEPEER_API_KEY');
  });

  it('is not used to call Livepeer for stream status', () => {
    const service = readSource('services', 'livepeer.service.ts');
    expect(service).not.toContain('livepeer.studio/api');
    expect(service).toContain('/ingest-status');
  });
});

/**
 * A self-hosted start that never carried media used to end in an error and a
 * trip back to the composer. It now moves the same stream onto Livepeer and
 * publishes there, once per broadcast.
 */
describe('self-hosted start that cannot reach the ingest', () => {
  it('asks the screen for the stream on Livepeer instead of failing', () => {
    const publisher = readSource('components', 'LiveProducer', 'WebRTCPublisher.tsx');
    expect(publisher).toContain('onSelfHostedUnreachable');
    expect(publisher).toContain('void failOrFallBack(new Error("Peer failed"))');
    // Only a broadcast that never connected is moved; a dropped live one is not.
    expect(publisher).toContain('provider === "mediamtx" && !sawConnected && !livepeerFallbackUsedRef.current');
  });

  it('re-provisions through the API and keeps the post', () => {
    const screen = readSource('screens', 'LiveProducerScreen.tsx');
    const service = readSource('services', 'live.service.ts');
    expect(screen).toContain('onSelfHostedUnreachable={handleSelfHostedUnreachable}');
    expect(service).toContain('/ingest-fallback');
  });
});

describe('big-event broadcasts', () => {
  it('send their latency mode with the mint', () => {
    expect(readSource('hooks', 'useUploadLive.ts')).toContain('latencyMode: p.settings.bigEvent ? "event" : "normal"');
  });

  it('never open a WebRTC session for a viewer', () => {
    expect(readSource('components', 'VideoPlayer', 'LiveStreamPlayer.tsx')).toContain('&& !bigEvent,');
  });
});
