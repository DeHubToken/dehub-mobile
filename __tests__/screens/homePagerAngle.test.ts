import { readFileSync } from 'fs';
import { join } from 'path';

describe('home pager page turn', () => {
  const source = readFileSync(join(__dirname, '../../screens/HomeScreen.tsx'), 'utf8');

  it('turns the page only on a clearly sideways drag', () => {
    expect(source).toContain('const PAGE_TURN_RATIO = 2;');
    expect(source).toContain('if (dx >= dy * PAGE_TURN_RATIO) manager.activate();');
    // Plain axis offsets let a thumb's sideways drift flip the tab mid-scroll.
    expect(source).not.toContain('.activeOffsetX([-14, 14])');
  });
});
