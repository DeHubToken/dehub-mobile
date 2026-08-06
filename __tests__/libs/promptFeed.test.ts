import { scorePromptAgainstCategories } from '../../libs/promptFeed';

// The scoring maths is a byte-for-byte port of web's PromptFlowModal heuristic,
// so these cases are really parity assertions: if one of them starts failing,
// mobile has drifted from web's tuning, not just from its own past behaviour.
describe('libs/promptFeed', () => {
  const CATEGORIES = ['Crypto', 'Sports', 'Music', 'Gaming', 'Science', 'Comedy'];

  it('ranks the category a prompt is actually about first', () => {
    const [top] = scorePromptAgainstCategories('bitcoin chart pump', CATEGORIES);
    expect(top.name).toBe('Crypto');
  });

  it('reaches a category through the synonym clusters, not just literal names', () => {
    // "worldcup" appears nowhere in the category list — only in the sports cluster.
    const [top] = scorePromptAgainstCategories('worldcup highlights', CATEGORIES);
    expect(top.name).toBe('Sports');
  });

  it('normalises the returned weights to exactly 100', () => {
    const weights = scorePromptAgainstCategories('techno dj remix', CATEGORIES);
    expect(weights.reduce((s, w) => s + w.weight, 0)).toBe(100);
  });

  it('never returns more than five categories', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Category ${i}`);
    expect(scorePromptAgainstCategories('bitcoin', many)).toHaveLength(5);
  });

  it('falls back to a fixed spread when nothing matches', () => {
    const weights = scorePromptAgainstCategories('zzzz qqqq', CATEGORIES);
    expect(weights.map((w) => w.name)).toEqual(CATEGORIES.slice(0, 5));
    expect(weights.map((w) => w.weight)).toEqual([30, 25, 20, 15, 10]);
  });

  it('drops tokens of two characters or fewer', () => {
    // "ai" is in the AI/tech cluster but is too short to survive tokenisation,
    // so it can never pull a category up. Web behaves the same way.
    const weights = scorePromptAgainstCategories('ai', CATEGORIES);
    expect(weights.map((w) => w.weight)).toEqual([30, 25, 20, 15, 10]);
  });

  it('carries the category name through as its own id', () => {
    // mobile's category list is a flat string[], so name doubles as id.
    for (const w of scorePromptAgainstCategories('bitcoin', CATEGORIES)) {
      expect(w.id).toBe(w.name);
    }
  });

  it('handles an empty category list without throwing', () => {
    expect(scorePromptAgainstCategories('bitcoin', [])).toEqual([]);
  });
});
