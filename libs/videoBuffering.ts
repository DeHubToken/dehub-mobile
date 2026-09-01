import type { BufferOptions } from "expo-video";

/**
 * How much a player is allowed to buffer.
 *
 * Nothing set `bufferOptions` on any of the twelve `useVideoPlayer` call sites,
 * so every player ran on media3's defaults, and those are sized for a
 * single-player video app rather than a feed:
 *
 *   DEFAULT_MAX_BUFFER_MS      = 50_000            (50 seconds ahead)
 *   DEFAULT_TARGET_BUFFER_BYTES = C.LENGTH_UNSET   -> computed per track type
 *   DEFAULT_VIDEO_BUFFER_SIZE  = 2000 * 64 KB      = 128 MB
 *   DEFAULT_AUDIO_BUFFER_SIZE  =  200 * 64 KB      = 12.8 MB
 *
 * With `LENGTH_UNSET` the load control keeps allocating until it reaches ~141 MB
 * or 50 seconds of media, whichever comes first. The default Android heap on a
 * mid-range phone is around 256 MB and the app has to fit React Native, Hermes
 * and the image cache in there too, so one feed video buffering ahead was enough
 * to run the process out of memory — which is exactly where Play Console's
 * crashes landed:
 *
 *   java.lang.OutOfMemoryError
 *     at androidx.media3.exoplayer.ExoPlayerImplInternal.shouldContinueLoading
 *     at androidx.media3.exoplayer.ExoPlayerImplInternal.maybeContinueLoading
 *
 * `shouldContinueLoading` is the load control asking "am I under the byte
 * target yet"; against a 141 MB target the answer stays yes until the heap is
 * gone. Capping the bytes is what makes that question terminate.
 *
 * `prioritizeTimeOverSizeThreshold` is left false deliberately — true would let
 * the duration win over the byte cap, which is the thing being fixed.
 */

/**
 * Feed, shorts and preview players — anything that can exist several at a time.
 * Ten seconds is well past the point where a scroll-by clip stalls, and 12 MB
 * covers ten seconds of anything the transcoder produces.
 */
export const FEED_BUFFER_OPTIONS: BufferOptions = {
  preferredForwardBufferDuration: 10,
  maxBufferBytes: 12 * 1024 * 1024,
};

/**
 * The full-screen, TV and mini-player surfaces, where one player has the screen
 * to itself and a stall is far more annoying than the memory is expensive.
 */
export const FULLSCREEN_BUFFER_OPTIONS: BufferOptions = {
  preferredForwardBufferDuration: 30,
  maxBufferBytes: 32 * 1024 * 1024,
};
