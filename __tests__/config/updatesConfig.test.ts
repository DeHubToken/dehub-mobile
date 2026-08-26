import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * OTA config lives in three places and nothing reconciles them.
 *
 * `android/` and `ios/` are committed, so `expo prebuild` never regenerates
 * them and editing `app.json` alone reaches nothing — the app keeps whatever
 * was checked in. That has already cost us once: `app.json` declared a white
 * notification colour for months while the native resource stayed Expo's
 * default violet, and every notification shipped purple.
 *
 * The same drift on updates is worse than cosmetic:
 *
 * - A missing URL makes the whole feature inert. That was the state before this
 *   test existed: `EXUpdatesEnabled`/`ENABLED` were true and check-on-launch was
 *   `ALWAYS`, against no server at all.
 * - A runtimeVersion mismatch is actively dangerous. It is the compatibility
 *   contract between a JS bundle and the native binary running it, so if native
 *   gains a module and one of these three files is left behind, an update gets
 *   served to a binary that does not have it — and the app crashes on launch.
 *
 * So: assert all three agree, on both values.
 */

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

const appJson = JSON.parse(read('app.json')) as {
  expo: { updates?: { url?: string; enabled?: boolean }; runtimeVersion?: unknown };
};
const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
const plist = read('ios', 'DeHub', 'Supporting', 'Expo.plist');

/** `<meta-data android:name="X" android:value="Y"/>` → Y */
function androidMeta(name: string): string | undefined {
  const re = new RegExp(
    `<meta-data\\s+android:name="${name.replace(/\./g, '\\.')}"\\s+android:value="([^"]*)"`,
  );
  return manifest.match(re)?.[1];
}

/** `<key>X</key>` followed by `<string>Y</string>` → Y */
function plistString(key: string): string | undefined {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
  return plist.match(re)?.[1];
}

describe('OTA update config agrees across app.json and both native projects', () => {
  it('points every platform at an update server', () => {
    const url = appJson.expo.updates?.url;
    expect(url).toBeTruthy();
    expect(androidMeta('expo.modules.updates.EXPO_UPDATE_URL')).toBe(url);
    expect(plistString('EXUpdatesURL')).toBe(url);
  });

  it('declares the same runtimeVersion everywhere', () => {
    const runtimeVersion = appJson.expo.runtimeVersion;
    // A literal string, not a policy object: a policy is resolved by the EAS
    // CLI, but the native files need a baked-in value, and the two can only be
    // compared — and kept honest — if app.json states the value outright.
    expect(typeof runtimeVersion).toBe('string');
    expect(androidMeta('expo.modules.updates.EXPO_RUNTIME_VERSION')).toBe(runtimeVersion);
    expect(plistString('EXUpdatesRuntimeVersion')).toBe(runtimeVersion);
  });

  it('keeps updates switched on in both native projects', () => {
    expect(appJson.expo.updates?.enabled).toBe(true);
    expect(androidMeta('expo.modules.updates.ENABLED')).toBe('true');
    expect(plist).toMatch(/<key>EXUpdatesEnabled<\/key>\s*<true\/>/);
  });

  it('gives every distributable build profile a channel', () => {
    // A build with no channel cannot be targeted by an update, so it silently
    // never receives one — the same class of quiet failure as the missing URL.
    const eas = JSON.parse(read('eas.json')) as {
      build: Record<string, { channel?: string; extends?: string }>;
    };
    const resolveChannel = (name: string, seen = new Set<string>()): string | undefined => {
      if (seen.has(name)) return undefined;
      seen.add(name);
      const profile = eas.build[name];
      if (!profile) return undefined;
      return profile.channel ?? (profile.extends ? resolveChannel(profile.extends, seen) : undefined);
    };

    // Reported as a list rather than one assertion per profile, so a failure
    // names every profile that is missing a channel instead of just the first.
    const withoutChannel = Object.keys(eas.build).filter((name) => !resolveChannel(name));
    expect(withoutChannel).toEqual([]);
  });
});
