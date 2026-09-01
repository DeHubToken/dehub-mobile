/**
 * An ended stream is not a dead card. Once its capture reports ready the
 * broadcast exists as a plain mp4, and that is what the feed and the viewer
 * play — the live HLS ladder is gone the moment ingest stops.
 */
import { extractReplayUrl, isReplayTruncated, replayDurationSec } from '../../libs/live-replay';

const URL = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/replays/abc.mp4';

describe('live replay resolution', () => {
  it('hands back the recording of a finished stream', () => {
    const stream = { status: 'ENDED', recording: { status: 'ready', url: URL, durationSec: 48 } };
    expect(extractReplayUrl(stream)).toBe(URL);
    expect(replayDurationSec(stream)).toBe(48);
    expect(isReplayTruncated(stream)).toBe(false);
  });

  it('ignores a capture that is not ready', () => {
    // A failed or skipped capture still writes a recording object; playing its
    // url would put a play button over a file that does not exist.
    expect(extractReplayUrl({ recording: { status: 'failed', url: URL } })).toBeUndefined();
    expect(extractReplayUrl({ recording: { status: 'pending' } })).toBeUndefined();
    expect(extractReplayUrl({ recording: { status: 'ready' } })).toBeUndefined();
  });

  it('flags a replay that was cut to the creator allowance', () => {
    expect(isReplayTruncated({ recording: { status: 'ready', url: URL, truncated: true } })).toBe(true);
  });

  it('answers for a stream that has none, and for no stream at all', () => {
    expect(extractReplayUrl({ status: 'LIVE' })).toBeUndefined();
    expect(extractReplayUrl(null)).toBeUndefined();
    expect(extractReplayUrl(undefined)).toBeUndefined();
    expect(replayDurationSec(null)).toBeUndefined();
  });
});
