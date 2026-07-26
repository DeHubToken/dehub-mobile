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
