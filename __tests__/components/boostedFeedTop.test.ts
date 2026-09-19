import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, '../../components/Home/InfiniteVideoFeed.tsx'),
  'utf8',
);

describe('boosted home-feed placement', () => {
  it('keeps the boost as the first data row and corrects Android async prepends at the top', () => {
    expect(source).toContain('__boosted: true');
    expect(source).toContain('pendingBoostRevealRef.current = true');
    expect(source).toContain('scrollToOffset({ offset: 0, animated: false })');
    expect(source).toContain('onContentSizeChange={handleContentSizeChange}');
  });

  it('does not pull a viewer back after they have left the top', () => {
    expect(source).toContain('prevYRef.current > MAINTAIN_POSITION.autoscrollToTopThreshold');
  });
});
