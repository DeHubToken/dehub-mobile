import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

describe('post media presentation', () => {
  it('prioritizes the primary image on the post detail screen', () => {
    const detail = readSource('screens', 'FeedDetailScreen.tsx');
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');
    const containedImage = readSource('components', 'Home', 'ContainedFeedImage.tsx');

    expect(detail).toContain('prioritizeMedia');
    expect(feedCard).toContain('priority={prioritizeMedia ? "high" : "normal"}');
    expect(feedCard).toContain('priority={prioritizeMedia && index === 0 ? "high" : "normal"}');
    expect(containedImage).toContain('priority={priority}');
  });

  it('keeps breathing room inside link-preview metadata', () => {
    const preview = readSource('components', 'common', 'LinkPreviewCard.tsx');

    expect(preview).toContain('paddingHorizontal: 12, paddingBottom: 12, paddingTop: 14');
  });

  it('separates post content from its metadata row', () => {
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');

    expect(feedCard).toContain('<View className="flex-row items-center gap-2 pt-3">');
    expect(feedCard).not.toContain('<View className="flex-row items-center gap-2 pt-1.5">');
  });
});
