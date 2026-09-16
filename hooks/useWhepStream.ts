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

import { useEffect, useRef, useState } from 'react';
import type { MediaStream } from 'react-native-webrtc';
import { whepEndpointFor, type LiveStreamRef } from '../libs/live-ingest';
import type { WhepSubscription } from '../libs/whep';

/**
 * A session that negotiates but never delivers is the worst case: no error to
 * catch and nothing on screen. Give it this long, then hand over to HLS.
 */
const START_TIMEOUT_MS = 6000;

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
}

export function useWhepStream({ enabled, stream, muted = false }: Options): Result {
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [failed, setFailed] = useState(false);
  const sessionRef = useRef<WhepSubscription | null>(null);

  const endpoint = enabled && !failed ? whepEndpointFor(stream) : null;

  useEffect(() => {
    if (!endpoint) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
            if (state === 'playing') clearTimeout(timer);
            else if (state === 'failed') giveUp();
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
      // Nothing playing by now: the negotiation either never finished or the
      // media leg never arrived.
      if (!cancelled && !sessionRef.current) giveUp();
    }, START_TIMEOUT_MS);

    void start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
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

  return { stream: media, failed };
}

export default useWhepStream;
