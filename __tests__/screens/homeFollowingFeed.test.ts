import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// HomeScreen pulls in the whole feed stack (FlashList, reanimated, the pager),
// none of which loads under Jest, so the Following wiring is checked in source.
const root = resolve(__dirname, '../..');
const home = readFileSync(resolve(root, 'screens/HomeScreen.tsx'), 'utf8');
const panel = readFileSync(resolve(root, 'components/Home/FeedFilterPanel.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(root, 'i18n/locales/en.json'), 'utf8'));

describe('home Following feed', () => {
  it('is a sort chip only where the surface opts in', () => {
    expect(panel).toContain('showFollowingSort = false');
    expect(panel).toMatch(/showFollowingSort\s*\?\s*\[\{ id: "following" as SortOption, label: t\("filters\.following"\) \}\]/);
    expect(home).toMatch(/onResetFilters=\{handleResetFilters\}\s*showFollowingSort/);
    expect(en.filters.following).toBe('Following');
  });

  it('asks for Latest narrowed to followed creators', () => {
    expect(home).toContain('sortBy: (following ? "createdAt" : filters.sortBy) as FeedSortBy');
    expect(home).toContain('if (following) params.followingOnly = true;');
  });

  it('needs a signed-in viewer', () => {
    expect(home).toMatch(/newFilters\.sortBy === "following"[^\n]*!isSignedIn/);
    expect(home).toContain('requireAuth(() => {');
    expect(home).toMatch(/!isSignedIn && filters\.sortBy === "following"/);
  });
});
