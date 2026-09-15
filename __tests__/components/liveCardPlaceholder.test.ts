import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_BANNER_SENTINEL, resolveThumbnail, getCoverUrl } from '../../libs/misc';

const root = join(__dirname, '..', '..');
const readSource = (...path: string[]) => readFileSync(join(root, ...path), 'utf8');

/**
 * A live post normally carries no picture: the self-hosted ingest renders no
 * thumbnail and the token has no image of its own. The helpers answer that with
 * a SENTINEL rather than an empty string, and a card that keeps the sentinel
 * hands an <Image> a string with no URL scheme — nothing paints, and the
 * placeholder is skipped because a thumbnail appears to exist. That is what a
 * live card at the top of the home feed rendering as a flat grey slab was.
 */
describe('live card with no cover', () => {
  it('names the sentinel the helpers actually return', () => {
    expect(resolveThumbnail({})).toBe(DEFAULT_BANNER_SENTINEL);
    expect(getCoverUrl(null)).toBe(DEFAULT_BANNER_SENTINEL);
  });

  it('does not let the sentinel pass as a thumbnail', () => {
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');
    const compact = readSource('components', 'Home', 'CompactVideoCard.tsx');

    expect(feedCard).toContain('resolved === DEFAULT_BANNER_SENTINEL ? "" : resolved');
    expect(compact).toContain('thumbUrl !== DEFAULT_BANNER_SENTINEL');
  });

  it('only points the preview at a poster that has a URL scheme', () => {
    const preview = readSource('components', 'common', 'LiveFeedPreview.tsx');

    expect(preview).toContain('function usablePoster');
    expect(preview).toContain('/^(https?:|data:|file:|content:|asset:)/i');
    expect(preview).toContain('const poster = usablePoster(thumbnail);');
    expect(preview).toContain('{poster ? (');
  });

  it('says what the stream is when there is nothing to show', () => {
    const preview = readSource('components', 'common', 'LiveFeedPreview.tsx');
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');

    expect(preview).toContain('{!!label && (');
    expect(feedCard).toContain('label={liveFallbackLabel}');
    expect(feedCard).toContain('const liveFallbackLabel =');
  });

  it('treats a whitespace-only title as no title', () => {
    const feedCard = readSource('components', 'Home', 'FeedCard.tsx');

    expect(feedCard).toContain('const trimmed = rawTitle.trim();');
  });
});
