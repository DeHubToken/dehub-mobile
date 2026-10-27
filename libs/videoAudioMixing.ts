import type { VideoPlayer } from "expo-video";

/**
 * Let muted video share the audio session with other apps.
 *
 * expo-video's iOS player defaults to `doNotMix`, and while any player in
 * that mode is playing the session is forced non-mixable and active. So a
 * muted feed preview, a Shorts grid tile or the sign-in clips stopped the
 * viewer's music or podcast the moment they autoplayed, and left the app
 * open to being interrupted back by it. Android's default is already `auto`.
 *
 * `auto` mixes while every playing player is silent and takes the session
 * (no mixing, Now Playing shown) as soon as one plays sound, so unmuted
 * playback and lock-screen controls behave exactly as before.
 */
export function shareAudioWhenSilent(player: VideoPlayer | null | undefined): void {
  if (!player) return;
  try { player.audioMixingMode = "auto"; } catch {}
}
