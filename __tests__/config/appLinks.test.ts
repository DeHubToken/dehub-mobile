import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Which dehub.io links open the app instead of the browser.
 *
 * `android/` is committed, so `expo prebuild` never regenerates it and the
 * intent filter in `app.json` reaches nothing on its own — the build uses the
 * checked-in AndroidManifest.xml. The two had already drifted: app.json claimed
 * /apps and /apps/ for months while the manifest that actually shipped did not.
 * Both are kept, the manifest because it is what builds and app.json because it
 * is what a reader looks at, so they have to say the same thing.
 *
 * The verification files themselves live on the website (dehubweb
 * public/.well-known), which is the only place Android and iOS fetch them from.
 */

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

type LinkData = { scheme?: string; host?: string; path?: string; pathPrefix?: string };
const appJson = JSON.parse(read('app.json')) as {
  expo: {
    android: { intentFilters: { autoVerify?: boolean; data: LinkData[] }[] };
    ios: { associatedDomains: string[] };
  };
};
const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');

const fromAppJson = appJson.expo.android.intentFilters
  .filter((f) => f.autoVerify)
  .flatMap((f) => f.data)
  .filter((d) => d.scheme === 'https' && d.host === 'dehub.io')
  .map((d) => (d.path != null ? `path ${d.path}` : `pathPrefix ${d.pathPrefix}`))
  .sort();

const verifiedFilter = manifest.match(/<intent-filter android:autoVerify="true"[\s\S]*?<\/intent-filter>/)?.[0] ?? '';
const fromManifest = [
  ...verifiedFilter.matchAll(/android:host="dehub\.io" android:(path|pathPrefix)="([^"]*)"/g),
]
  .map((m) => `${m[1]} ${m[2]}`)
  .sort();

describe('App Links agree across app.json and the committed Android manifest', () => {
  it('declares the same verified dehub.io paths in both', () => {
    expect(fromManifest.length).toBeGreaterThan(0);
    expect(fromManifest).toEqual(fromAppJson);
  });

  it('claims the share links people actually send', () => {
    for (const entry of [
      'pathPrefix /app/',
      'pathPrefix /post/',
      'pathPrefix /posts/',
      'pathPrefix /bounty/',
      'pathPrefix /communities/',
      'pathPrefix /@',
    ]) {
      expect(fromManifest).toContain(entry);
    }
  });

  it('opens riftn.com links on the same paths as dehub.io', () => {
    // Data tags in one filter merge, so this host takes every path listed above.
    expect(verifiedFilter).toContain('<data android:scheme="https" android:host="riftn.com"/>');
    const riftn = appJson.expo.android.intentFilters
      .filter((f) => f.autoVerify)
      .flatMap((f) => f.data)
      .filter((d) => d.host === 'riftn.com');
    expect(riftn).toEqual([{ scheme: 'https', host: 'riftn.com' }]);
  });

  it('claims mini app links', () => {
    expect(fromManifest).toContain('path /apps');
    expect(fromManifest).toContain('pathPrefix /apps/');
  });

  it('keeps iOS associated with dehub.io and riftn.com', () => {
    const entitlements = read('ios', 'DeHub', 'DeHub.entitlements');
    for (const domain of ['applinks:dehub.io', 'webcredentials:dehub.io', 'applinks:riftn.com', 'webcredentials:riftn.com']) {
      expect(entitlements).toContain(`<string>${domain}</string>`);
      expect(appJson.expo.ios.associatedDomains).toContain(domain);
    }
  });

  it('carries no placeholder verification files that could pass for the real ones', () => {
    expect(existsSync(join(root, 'public', '.well-known', 'assetlinks.json'))).toBe(false);
    expect(existsSync(join(root, 'public', '.well-known', 'apple-app-site-association'))).toBe(false);
  });
});
