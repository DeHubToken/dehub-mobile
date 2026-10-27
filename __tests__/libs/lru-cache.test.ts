import { LruCache } from '../../libs/lru-cache';
describe('bounded metadata cache', () => {
  it('evicts the least recently used entry and retains false values', () => {
    const cache = new LruCache<string, boolean>(2);
    cache.set('a', false); cache.set('b', true);
    expect(cache.get('a')).toBe(false);
    cache.set('c', true);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(false);
    cache.set('a', true);
    expect(cache.size).toBe(2);
    for (let i = 0; i < 1000; i++) cache.set(String(i), true);
    expect(cache.size).toBe(2);
  });
});
