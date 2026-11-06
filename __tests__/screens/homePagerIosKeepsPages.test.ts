import { readFileSync } from 'fs';
import { join } from 'path';

const home = readFileSync(join(__dirname, '../../screens/HomeScreen.tsx'), 'utf8');

describe('home pager on iOS', () => {
  it('never hides a visited page on iOS (a hidden subtree loses its native views there)', () => {
    expect(home).toMatch(/const PagerPage = Platform\.OS === "ios" \? KeptPagerPage : HidingPagerPage;/);
  });

  it('gives every page its own header scroll handler', () => {
    const renderPage = home.slice(home.indexOf('const renderPage = '), home.indexOf('<View className="flex-1">'));
    expect(renderPage).not.toContain('scrollHandler={scrollHandler}');
    expect(renderPage).toContain('scrollHandler={pageScroll[key]}');
  });
});
