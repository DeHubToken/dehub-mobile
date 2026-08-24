import { setAudioModeAsync } from "expo-audio";

/**
 * Single place that configures the audio session, replacing the 14 scattered
 * `Audio.setAudioModeAsync` calls that used to live in expo-av consumers.
 *
 * Why it is centralised: during the expo-av -> expo-audio migration both native
 * modules can be loaded at once, and each one owns the iOS AVAudioSession
 * category. If a half-migrated app has some screens calling expo-av's
 * setAudioModeAsync and others calling expo-audio's, they overwrite each
 * other's category and playback silently stops working with the ringer off.
 * Routing every caller through here means the last writer is always
 * expo-audio.
 *
 * PLATFORM NOTE: on Android, expo-audio forwards only
 * `shouldPlayInBackground`, `shouldRouteThroughEarpiece`, `interruptionMode`
 * and `allowsBackgroundRecording` to native. `playsInSilentMode` and
 * `allowsRecording` are iOS-only — which is parity with the expo-av fields
 * they replace (`playsInSilentModeIOS`, `allowsRecordingIOS`), not a
 * regression.
 *
 * `interruptionMode` takes a plain string. expo-audio has no
 * `InterruptionModeIOS` / `InterruptionModeAndroid` runtime enums — those are
 * a type-only union now, so importing them in a value position fails at
 * bundle time rather than typecheck time.
 */

/** Playback that must be audible with the ringer switch off, and ducks other apps. */
export async function configureForDuckedPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: "duckOthers",
  });
}

/**
 * Playback that survives the app going to the background or the screen locking.
 *
 * Use this the moment the user *deliberately* starts something — pressing play
 * on an audio post, opening a video full screen. Do NOT use it for muted feed
 * previews: an autoplaying card that keeps the session alive would go on
 * playing after the user leaves the app, which is the opposite of what the
 * scroll-away pause logic exists to do.
 *
 * `interruptionMode` is "doNotMix" rather than "duckOthers" on purpose. On iOS
 * the Now Playing notification — lock-screen artwork and transport controls —
 * only appears when the session category is doNotMix or auto, so ducking
 * silently costs you the lock-screen controls, which is most of the point of
 * playing in the background at all.
 *
 * Depends on the expo-video config plugin's `supportsBackgroundPlayback`, which
 * writes `UIBackgroundModes: [audio]` into the iOS Info.plist and the
 * FOREGROUND_SERVICE_MEDIA_PLAYBACK permission on Android. Both are already
 * present in the committed `ios/` and `android/` trees — and because those are
 * committed, the plugin never regenerates them, so app.json on its own proves
 * nothing about what a build actually ships.
 */
export async function configureForBackgroundPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
}

/**
 * Hand the session back to its foreground-only default.
 *
 * Pair this with configureForBackgroundPlayback() when a deliberate playback
 * surface unmounts. Skip it and the *next* thing to play — a muted feed
 * preview, a voice note — inherits a session that keeps running in the
 * background, because the category is global to the process and the last
 * writer wins.
 */
export async function releaseBackgroundPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: "doNotMix",
  });
}

/** Playback that must be audible with the ringer switch off; does not duck others. */
export async function configureForPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });
}

/**
 * Switch iOS into the record category.
 * MUST be paired with releaseRecording() once the take finishes, otherwise
 * playback elsewhere in the app stays quiet.
 */
export async function configureForRecording(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
  });
}

/** Return iOS to the playback category after recording. Safe to call unconditionally. */
export async function releaseRecording(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: false });
}
