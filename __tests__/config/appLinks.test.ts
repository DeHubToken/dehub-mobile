import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `android/` is committed, so `expo prebuild` never regenerates the manifest
 * and the intent filters in app.json reach no phone on their own. When a web
 * route is claimed in app.json but not in the manifest, Android opens that
 * link in the browser instead of the app. That is how dehub.io/apps/<slug>
 * mini app links kept landing on the website: app.json had them, the
 * manifest did not.
 */

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

type LinkData = { scheme?: string; host?: string; path?: string; pathPrefix?: string; pathPattern?: string };

const appJson = JSON.parse(read('app.json')) as {
  expo: { android: { intentFilters?: { autoVerify?: boolean; data: LinkData[] }[] } };
};
const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');

/** The `<data>` lines of the manifest's autoVerify https filter, as `kind:value`. */
function manifestAppLinks(): Set<string> {
  const filter = manifest.match(/<intent-filter android:autoVerify="true"[\s\S]*?<\/intent-filter>/)?.[0] ?? '';
  const out = new Set<string>();
  for (const tag of filter.match(/<data\b[^>]*>/g) ?? []) {
    if (!/android:host="dehub\.io"/.test(tag)) continue;
    const m = tag.match(/android:(path|pathPrefix|pathPattern)="([^"]*)"/);
    if (m) out.add(`${m[1]}:${m[2]}`);
  }
  return out;
}

function appJsonAppLinks(): string[] {
  return (appJson.expo.android.intentFilters ?? [])
    .filter(f => f.autoVerify)
    .flatMap(f => f.data)
    .filter(d => d.scheme === 'https' && d.host === 'dehub.io')
    .flatMap(d =>
      (['path', 'pathPrefix', 'pathPattern'] as const)
        .filter(kind => d[kind] !== undefined)
        .map(kind => `${kind}:${d[kind]}`),
    );
}

describe('dehub.io app links agree across app.json and the committed manifest', () => {
  it('claims every app.json link in the Android manifest', () => {
    const inManifest = manifestAppLinks();
    expect(appJsonAppLinks().filter(link => !inManifest.has(link))).toEqual([]);
  });

  it('claims mini app links', () => {
    const inManifest = manifestAppLinks();
    expect(inManifest.has('path:/apps')).toBe(true);
    expect(inManifest.has('pathPrefix:/apps/')).toBe(true);
  });
});
