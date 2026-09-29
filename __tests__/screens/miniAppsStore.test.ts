import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

/**
 * The Apps store and the mini app player.
 *
 * - The app claims dehub.io/apps/ links, so "Build an app" must open the web
 *   developer page in a browser tab. Linking.openURL would hand it straight
 *   back to the app, which reads apps/dev as an app called "dev".
 * - A failed store read says so and offers a retry instead of "No apps yet".
 * - The player sits inside the root SafeAreaView, which already clears the
 *   system bars. Padding by the insets again, or telling the app to, leaves an
 *   empty bar-height band.
 * - The not-found page has a way out, and "Back to Apps" returns to the store
 *   instead of stacking a second one above the dead page.
 */
describe('mini app store', () => {
  const store = readSource('screens', 'AppsScreen.tsx');

  it('opens the developer page in a browser tab, not through the app link', () => {
    expect(store).toContain('const build = () => openInApp(`${WEBSITE_LINK}/apps/dev`);');
    expect(store).not.toContain('Linking.openURL(`${WEBSITE_LINK}/apps/dev`)');
  });

  it('shows a failed load with a retry, and can be pulled to refresh', () => {
    expect(store).toContain('apps.length === 0 && failed ? (');
    expect(store).toContain('t("common.failedToLoad")');
    expect(store).toContain('t("common.retry")');
    expect(store).toContain('refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={() => load(true)}');
    expect(store).toContain('setApps((prev) => prev ?? []);');
  });
});

describe('mini app player', () => {
  const player = readSource('screens', 'MiniAppScreen.tsx');

  it('does not count the system bars twice', () => {
    expect(player).toContain('safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 }');
    expect(player).not.toContain('useSafeAreaInsets');
    expect(player).not.toContain('paddingTop: insets.top');
  });

  it('gives the not-found page a close button and returns to the existing store', () => {
    const notFound = player.slice(player.indexOf('if (app === null) {'), player.indexOf('<StatusBar'));
    expect(notFound).toContain('onPress={close}');
    expect(notFound).toContain('accessibilityLabel={t("miniApps.host.close")}');
    expect(notFound).toContain('navigation.popTo(ScreenNames.Apps)');
    expect(notFound).not.toContain('navigation.navigate(ScreenNames.Apps)');
  });
});
