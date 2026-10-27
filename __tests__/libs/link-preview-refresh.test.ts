/**
 * "Refresh link preview" in a post's menu re-crawls the link and repaints the
 * cards showing it. A site that swaps its share image usually keeps the same
 * image address, so the refreshed card must ask for it under a new one.
 * Mirrors web's src/lib/api/__tests__/link-preview-refresh.test.ts.
 */
const mockInvoke = jest.fn();
jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

import { fetchLinkPreview, markRefreshedImage, refreshLinkPreview, subscribeLinkPreviewRefresh } from '../../libs/link-preview';

beforeEach(() => mockInvoke.mockReset());

describe('markRefreshedImage', () => {
  it('adds a one-off mark and keeps the existing query', () => {
    expect(markRefreshedImage('https://example.com/og.png?a=1', 42)).toBe('https://example.com/og.png?a=1&dhr=42');
  });

  it('leaves missing and non-web images alone', () => {
    expect(markRefreshedImage(null, 42)).toBeNull();
    expect(markRefreshedImage('data:image/png;base64,AAAA', 42)).toBe('data:image/png;base64,AAAA');
  });
});

describe('refreshLinkPreview', () => {
  it('re-crawls past the cached card and tells listeners', async () => {
    const url = 'https://example.com/refresh-me';
    mockInvoke.mockResolvedValueOnce({ data: { title: 'Old', image: 'https://example.com/og.png' }, error: null });
    expect((await fetchLinkPreview(url))?.title).toBe('Old');
    expect((await fetchLinkPreview(url))?.title).toBe('Old');
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    const heard: string[] = [];
    const stop = subscribeLinkPreviewRefresh((refreshed) => heard.push(refreshed));
    mockInvoke.mockResolvedValueOnce({ data: { title: 'New', image: 'https://example.com/og.png' }, error: null });
    expect(await refreshLinkPreview(url)).toBe(true);
    stop();

    expect(mockInvoke).toHaveBeenLastCalledWith('fetch-link-preview', { body: { url, refresh: true } });
    expect(heard).toEqual([url]);
    const fresh = await fetchLinkPreview(url);
    expect(fresh?.title).toBe('New');
    expect(fresh?.image).toMatch(/^https:\/\/example\.com\/og\.png\?dhr=\d+$/);
  });

  it('reports a site it could not read and keeps the old card', async () => {
    const url = 'https://example.com/unreachable';
    mockInvoke.mockResolvedValueOnce({ data: { title: 'Kept' }, error: null });
    await fetchLinkPreview(url);
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('down') });
    expect(await refreshLinkPreview(url)).toBe(false);
    expect((await fetchLinkPreview(url))?.title).toBe('Kept');
  });
});
