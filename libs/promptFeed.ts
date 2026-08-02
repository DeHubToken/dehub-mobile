/**
 * promptFeed
 * ==========
 * Native port of web's prompt→category heuristic, which lives inline in
 * `src/components/app/feeds/PromptFlowModal.tsx` on dehubweb.
 *
 * The only shape difference: web's categories are `{ id, name }` records, while
 * mobile's category list (`getCategoriesCached`) is a flat `string[]` of names.
 * Here the name doubles as the id, so the scoring maths is otherwise identical
 * to web's — same clusters, same weights, same normalisation to 100%.
 */

export interface CategoryWeight {
  id: string;
  name: string;
  /** 0-100 */
  weight: number;
}

/**
 * Synonym / related-term clusters. Each cluster: any matching input token
 * boosts every term in the cluster when scoring against category names.
 * Kept byte-identical to web so both platforms tune a prompt the same way.
 */
const SYNONYM_CLUSTERS: string[][] = [
  // Adult / NSFW
  ['nsfw', 'adult', 'porn', 'sex', 'sexy', 'boobs', 'tits', 'ass', 'booty', 'thicc', 'lingerie', 'onlyfans', 'nude', 'nudes', 'hot', 'women', 'woman', 'girl', 'girls', 'babe', 'babes', 'milf', 'erotic', 'fetish', 'kink', 'cosplay'],
  // Sports
  ['sport', 'sports', 'football', 'soccer', 'fifa', 'worldcup', 'world', 'cup', 'nba', 'basketball', 'baseball', 'mlb', 'nfl', 'rugby', 'cricket', 'tennis', 'golf', 'mma', 'ufc', 'boxing', 'wrestling', 'wwe', 'f1', 'formula', 'racing', 'nascar', 'hockey', 'nhl', 'olympics', 'athlete', 'athletics'],
  // Gaming / esports
  ['game', 'games', 'gaming', 'gamer', 'esports', 'esport', 'fortnite', 'minecraft', 'roblox', 'valorant', 'cod', 'callofduty', 'warzone', 'lol', 'leagueoflegends', 'dota', 'csgo', 'cs2', 'apex', 'pubg', 'overwatch', 'twitch', 'streamer', 'xbox', 'playstation', 'ps5', 'nintendo', 'switch', 'rpg', 'mmo', 'fps'],
  // Crypto / web3
  ['crypto', 'cryptocurrency', 'btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'doge', 'dogecoin', 'shib', 'pepe', 'memecoin', 'altcoin', 'defi', 'nft', 'nfts', 'web3', 'blockchain', 'token', 'tokens', 'dex', 'dao', 'staking', 'yield', 'airdrop', 'wallet', 'metamask', 'trading', 'trader', 'chart', 'pump', 'dump', 'bull', 'bear', 'hodl', 'dhb', 'dehub'],
  // AI / tech
  ['ai', 'artificial', 'intelligence', 'ml', 'llm', 'gpt', 'chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'midjourney', 'stable', 'diffusion', 'tech', 'technology', 'software', 'coding', 'code', 'developer', 'dev', 'programming', 'startup', 'saas', 'computer', 'apple', 'iphone', 'android', 'google', 'microsoft', 'nvidia'],
  // Music
  ['music', 'song', 'songs', 'track', 'album', 'rap', 'hiphop', 'rnb', 'rock', 'metal', 'pop', 'edm', 'house', 'techno', 'dj', 'producer', 'beat', 'beats', 'spotify', 'soundcloud', 'remix', 'jazz', 'classical', 'country', 'reggae', 'kpop'],
  // Film / TV / entertainment
  ['movie', 'movies', 'film', 'films', 'cinema', 'tv', 'show', 'shows', 'series', 'netflix', 'hbo', 'disney', 'marvel', 'dc', 'starwars', 'anime', 'manga', 'cartoon', 'documentary', 'trailer', 'actor', 'actress', 'hollywood', 'streaming'],
  // Art / design / photography
  ['art', 'artist', 'design', 'designer', 'painting', 'drawing', 'illustration', 'photography', 'photo', 'photos', 'photographer', 'aesthetic', 'fashion', 'style', 'creative', 'graphic', 'digital'],
  // News / politics / world
  ['news', 'politics', 'political', 'election', 'government', 'world', 'global', 'breaking', 'current', 'events', 'trump', 'biden', 'war', 'economy', 'inflation', 'market', 'markets', 'finance', 'business', 'stocks', 'stock'],
  // Memes / humour
  ['meme', 'memes', 'funny', 'humor', 'humour', 'comedy', 'joke', 'jokes', 'lol', 'lmao', 'shitpost', 'banter'],
  // Food / cooking
  ['food', 'cooking', 'cook', 'recipe', 'recipes', 'chef', 'kitchen', 'restaurant', 'foodie', 'meal', 'eat', 'eating', 'cuisine', 'baking', 'vegan', 'vegetarian'],
  // Travel
  ['travel', 'trip', 'vacation', 'holiday', 'tourism', 'tourist', 'destination', 'adventure', 'flight', 'hotel', 'beach', 'mountain', 'explore'],
  // Fitness / health
  ['fitness', 'gym', 'workout', 'exercise', 'health', 'healthy', 'bodybuilding', 'muscle', 'crossfit', 'yoga', 'running', 'cardio', 'lifting', 'wellness', 'diet', 'nutrition'],
  // Cars / autos
  ['car', 'cars', 'auto', 'automotive', 'vehicle', 'truck', 'bike', 'motorcycle', 'tesla', 'bmw', 'mercedes', 'ferrari', 'lambo', 'porsche', 'racing'],
  // Animals / pets
  ['animal', 'animals', 'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten', 'wildlife', 'nature'],
  // Science / space
  ['science', 'space', 'nasa', 'spacex', 'astronomy', 'physics', 'biology', 'chemistry', 'research', 'quantum', 'mars', 'moon'],
];

function expandTokens(rawTokens: string[]): { tok: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const t of rawTokens) out.set(t, Math.max(out.get(t) ?? 0, 10));
  for (const cluster of SYNONYM_CLUSTERS) {
    const hit = rawTokens.some((t) => cluster.includes(t));
    if (hit) {
      for (const term of cluster) {
        out.set(term, Math.max(out.get(term) ?? 0, 6));
      }
    }
  }
  return Array.from(out.entries()).map(([tok, weight]) => ({ tok, weight }));
}

/** Local prompt → category weight heuristic with synonym expansion. */
export function scorePromptAgainstCategories(
  prompt: string,
  categories: string[],
): CategoryWeight[] {
  const raw = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const tokens = expandTokens(raw);
  const scored = categories.map((cat) => {
    const name = cat.toLowerCase();
    let score = 0;
    for (const { tok, weight } of tokens) {
      if (name === tok) score += weight * 2;
      else if (name.includes(tok)) score += weight;
      else if (tok.includes(name) && name.length > 3) score += Math.round(weight * 0.6);
      else if (name.length > 4 && tok.length > 4 && name.slice(0, 4) === tok.slice(0, 4)) score += Math.round(weight * 0.3);
    }
    return { id: cat, name: cat, weight: score };
  });
  scored.sort((a, b) => b.weight - a.weight);
  let top = scored.slice(0, 5);
  if (top.every((t) => t.weight === 0)) {
    top = scored.slice(0, 5).map((c, i) => ({ ...c, weight: [30, 25, 20, 15, 10][i] || 10 }));
  } else {
    const sum = top.reduce((s, t) => s + t.weight, 0) || 1;
    top = top.map((t) => ({ ...t, weight: Math.round((t.weight / sum) * 100) }));
    const diff = 100 - top.reduce((s, t) => s + t.weight, 0);
    if (top[0]) top[0].weight += diff;
  }
  return top;
}
