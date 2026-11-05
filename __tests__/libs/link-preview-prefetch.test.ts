/**
 * Feed cards remount as they scroll back into view. A link that has already
 * been read must be readable synchronously so the card draws at full height
 * on its first frame, and a page's links are warmed a few at a time.
 */
const mockInvoke = jest.fn();
const invoke = mockInvoke;
jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

import { peekLinkPreview, prefetchLinkPreviews } from '../../libs/link-preview';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('link preview prefetch', () => {
  beforeEach(() => invoke.mockReset());

  it('keeps a read preview for a synchronous peek', async () => {
    invoke.mockResolvedValue({ data: { title: 'A story', description: 'd', image: 'https://img.example/a.jpg', siteName: 'Example' }, error: null });
    expect(peekLinkPreview('https://example.com/a')).toBeNull();
    prefetchLinkPreviews(['https://example.com/a']);
    await flush(); await flush();
    expect(peekLinkPreview('https://example.com/a')).toMatchObject({ title: 'A story', image: 'https://img.example/a.jpg' });
  });

  it('remembers the compact card for a site that could not be read', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('nope') });
    prefetchLinkPreviews(['https://broken.example/x']);
    await flush(); await flush();
    expect(peekLinkPreview('https://broken.example/x')).toMatchObject({ title: 'broken.example', image: null });
  });

  it('reads at most three links at once and never the same link twice', async () => {
    const resolvers: Array<() => void> = [];
    invoke.mockImplementation(() => new Promise((resolve) => resolvers.push(() => resolve({ data: { title: 't' }, error: null }))));
    const urls = ['https://q.example/1', 'https://q.example/2', 'https://q.example/3', 'https://q.example/4', 'https://q.example/1'];
    prefetchLinkPreviews(urls);
    prefetchLinkPreviews(urls);
    expect(invoke).toHaveBeenCalledTimes(3);
    resolvers.shift()!();
    await flush(); await flush();
    expect(invoke).toHaveBeenCalledTimes(4);
    resolvers.forEach((resolve) => resolve());
    await flush(); await flush();
    expect(invoke).toHaveBeenCalledTimes(4);
  });
});
