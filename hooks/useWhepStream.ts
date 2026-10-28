/**
 * A live stream, played over WebRTC, for as long as it works.
 *
 * Owns one WHEP session: opens it when asked, tears it down on the way out,
 * mirrors the viewer's mute switch onto the remote audio track, and — the part
 * every caller depends on — reports failure instead of hiding it, so the
 * surface can fall back to the HLS ladder it used before. WebRTC is the only
 * way an Apple device can play a self-hosted broadcast at all, and it is still
 * not available on every network, so "failed" has to be a first-class answer
 * rather than a black screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaStream } from 'react-native-webrtc';
import { whepEndpointFor, type LiveStreamRef } from '../libs/live-ingest';
import type { WhepSubscription } from '../libs/whep';
import { forgetWhepSilent, isRealPicture, rememberWhepSilent, whepRecentlySilent } from '../libs/whep-memory';

/**
 * A session that negotiates but never delivers is the worst case: no error to
 * catch and nothing on screen. Give it this long to show a real picture, then
 * hand over to HLS. A connected session does not count: some broadcasts
 * connect fine and never send a frame, which used to leave the viewer on a
 * spinner for good.
 */
const START_TIMEOUT_MS = 3500;

interface Options {
  /** False while the stream is not live, is gated, or is playing a replay. */
  enabled: boolean;
  /** Identifies the broadcast; only a self-hosted one has a WHEP endpoint. */
  stream: LiveStreamRef | null | undefined;
  /** The viewer's sound switch, applied to the remote audio track. */
  muted?: boolean;
}

interface Result {
  /** Non-null once media is attached — render it, otherwise fall back. */
  stream: MediaStream | null;
  /** True once WebRTC is out of the picture for this stream. */
  failed: boolean;
  /**
   * An attempt is in flight and has neither arrived nor given up.
   *
   * Callers hold the fallback back while this is true. Starting HLS in the
   * meantime works, but it means the viewer watches the picture begin and then
   * restart a second later when WebRTC arrives — and on the surface this
   * matters most, WebRTC opens faster than a ladder can buffer its first
   * segments anyway. False whenever there is nothing to wait for: a Livepeer
   * stream, a replay, or a gated one.
   */
  pending: boolean;
  /** Report the picture size the WebRTC surface rendered. */
  onPicture: (size: { width: number; height: number }) => void;
}

export function useWhepStream({ enabled, stream, muted = false }: Options): Result {
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [failed, setFailed] = useState(false);
  const sessionRef = useRef<WhepSubscription | null>(null);

  const playbackId = stream?.playbackId ?? null;
  // Checked once per stream: a stream that just went silent here starts on HLS.
  const silentBefore = useMemo(() => whepRecentlySilent(playbackId), [playbackId]);
  const endpoint = enabled && !failed && !silentBefore ? whepEndpointFor(stream) : null;
  const pictureRef = useRef<() => void>(() => undefined);
  const onPicture = useCallback((size: { width: number; height: number }) => {
    if (isRealPicture(size)) pictureRef.current();
  }, []);

  useEffect(() => {
    if (!endpoint) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pictured = false;
    pictureRef.current = () => {
      if (pictured || cancelled) return;
      pictured = true;
      clearTimeout(timer);
      forgetWhepSilent(playbackId);
    };

    const giveUp = () => {
      if (cancelled) return;
      setMedia(null);
      // Latched: one attempt per stream. Without it a flapping connection
      // would trade the picture back and forth with the HLS player.
      setFailed(true);
    };

    const start = async () => {
      try {
        const { subscribeToWhep } = await import('../libs/whep');
        if (cancelled) return;
        const session = await subscribeToWhep({
          endpoint,
          onStateChange: (state) => {
            if (cancelled) return;
            if (state === 'failed') giveUp();
          },
        });
        if (cancelled) {
          await session.stop();
          return;
        }
        sessionRef.current = session;
        setMedia(session.stream);
      } catch {
        giveUp();
      }
    };

    timer = setTimeout(() => {
      // No picture by now: the negotiation never finished or the media leg
      // never arrived. Remember it so the next open goes straight to HLS.
      if (cancelled || pictured) return;
      rememberWhepSilent(playbackId);
      giveUp();
    }, START_TIMEOUT_MS);

    void start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      pictureRef.current = () => undefined;
      const session = sessionRef.current;
      sessionRef.current = null;
      setMedia(null);
      void session?.stop();
    };
  }, [endpoint]);

  // The sound switch belongs to the track, not to a player: there is no
  // element in between to mute. Applied on every change, and on first attach.
  useEffect(() => {
    if (!media) return;
    for (const track of media.getAudioTracks()) {
      track.enabled = !muted;
    }
  }, [media, muted]);

  return { stream: media, failed: failed || silentBefore, pending: !!endpoint && !media && !failed, onPicture };
}

export default useWhepStream;
