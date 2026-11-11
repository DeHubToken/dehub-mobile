/**
 * Menu search for the app's menu sheet: the same matching as the web menu
 * (riftn-web src/components/app/navigation/nav-search.ts), so a word that
 * finds a page on riftn.com finds it here too.
 *
 * People type what they want, not what we named it: "build" for Requests,
 * "games" for the Arcade, "dm" for Messages, "money" for the Wallet. So on
 * top of the row's own name (in the reader's language AND in English) each
 * row carries:
 *
 *   KEYWORDS    the English words people use for it (NAV_KEYWORDS). Brand
 *               names and loanwords like "dm", "apy", "nft" are typed in
 *               English on every keyboard.
 *   FIND WORDS  one translated line of search words per row
 *               (nav.findWords.<id> in every locale), so the same works in
 *               Spanish, Arabic, Japanese and the rest. `nav` is in the core
 *               language pack, so typing never fetches anything.
 *   FALLBACKS   a plural / -ing stem ("builders" to "build") and, for words
 *               of four letters or more, one or two typos ("setings").
 *
 * A match on the row's own name always ranks above a keyword match, and a
 * typo match comes last. Every word typed has to land somewhere.
 */

type TranslateFn = (key: string, defaultValue: string) => string;

/** Reduce to one comparable form: lower case, no accents, punctuation as single spaces. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Labels and keywords are a fixed set re-folded on every keystroke.
const foldCache = new Map<string, string>();
function foldOnce(value: string): string {
  let folded = foldCache.get(value);
  if (folded === undefined) {
    folded = fold(value);
    foldCache.set(value, folded);
  }
  return folded;
}

// Lower is better. Any name match beats any keyword match; typos come last.
const LABEL_MATCH = 0;
const KEYWORD_MATCH = 10;
const FUZZY_LABEL = 20;
const FUZZY_KEYWORD = 21;
const NO_MATCH = Infinity;

/** Whole phrase, start of it, start of a word in it, or mid-word. */
function matchPhrase(phrase: string, token: string): number {
  if (!phrase || !token) return NO_MATCH;
  if (phrase === token) return 0;
  if (phrase.startsWith(token)) return 1;
  const at = phrase.indexOf(token);
  if (at > 0) return phrase[at - 1] === " " ? 2 : 3;
  // "commandcentre", "featurerequests": the space is often skipped.
  if (phrase.includes(" ") && phrase.replace(/ /g, "").includes(token)) return 3;
  return NO_MATCH;
}

/** True when `a` becomes `b` within `max` edits (two-row Levenshtein). */
function withinEdits(a: string, b: string, max: number): boolean {
  if (max <= 0) return a === b;
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (row[j] < rowBest) rowBest = row[j];
    }
    if (rowBest > max) return false;
    previous = row;
  }
  return previous[b.length] <= max;
}

/** No typo fixing under four letters: "dos" would reach half the menu. */
function editBudget(token: string): number {
  if (token.length < 4) return 0;
  return token.length >= 8 ? 2 : 1;
}

function fuzzyPhrase(phrase: string, token: string, budget: number): boolean {
  if (budget <= 0) return false;
  if (withinEdits(phrase, token, budget)) return true;
  return phrase.split(" ").some((word) => word.length >= 4 && withinEdits(word, token, budget));
}

function scoreToken(labels: string[], keywords: string[], token: string): number {
  let best = NO_MATCH;
  for (const label of labels) {
    const at = matchPhrase(label, token);
    if (at !== NO_MATCH) best = Math.min(best, LABEL_MATCH + at);
  }
  if (best !== NO_MATCH) return best;
  for (const keyword of keywords) {
    const at = matchPhrase(keyword, token);
    if (at !== NO_MATCH) best = Math.min(best, KEYWORD_MATCH + at);
  }
  if (best !== NO_MATCH) return best;
  const budget = editBudget(token);
  if (labels.some((label) => fuzzyPhrase(label, token, budget))) return FUZZY_LABEL;
  if (keywords.some((keyword) => fuzzyPhrase(keyword, token, budget))) return FUZZY_KEYWORD;
  return NO_MATCH;
}

/** Rough English stem, only tried after the word as typed found nothing. */
function stemOf(token: string): string {
  const rules: Array<[RegExp, string]> = [
    [/ies$/, "y"], [/ers$/, ""], [/ings?$/, ""], [/er$/, ""], [/ed$/, ""], [/es$/, ""], [/s$/, ""],
  ];
  for (const [suffix, replacement] of rules) {
    if (suffix.test(token)) {
      const stem = token.replace(suffix, replacement);
      if (stem.length >= 3) return stem;
    }
  }
  return token;
}

/** Each row's name in English, keyed by its labelKey: matched in every language. */
export const NAV_ENGLISH_NAMES: Record<string, string> = {
  "nav.home": "Home",
  "nav.profile": "Profile",
  "nav.explore": "Explore",
  "nav.prompt": "Prompt",
  "nav.notifications": "Notifications",
  "nav.messages": "Messages",
  "nav.communities": "Communities",
  "nav.assistant": "Assistant",
  "nav.settings": "Settings",
  "creator.editor": "Editor",
  "commandCentre.creator": "Creator",
  "nav.leaderboard": "Leaderboard",
  "nav.stats": "Stats",
  "nav.bookmarks": "Bookmarks",
  "nav.command": "Command Centre",
  "nav.wallet": "Wallet",
  "nav.events": "Events",
  "nav.stages": "Stages",
  "nav.featureRequests": "Feature Requests",
  "stats.feedback.title": "Feedback",
  "nav.staking": "Staking",
  "nav.superpowers": "SuperPowers",
  "creatorPacks.title": "Packs",
  "nav.governance": "Governance",
  "nav.dao": "DAO",
  "screens.work": "Bounties",
  "work.myBounties": "My Bounties",
  "nav.affiliate": "Affiliate",
  "nav.careers": "Careers",
  "nav.creators": "Creators",
  "nav.fractions": "Fractions",
  "nav.nfts": "NFTs",
  "screens.usernames": "Usernames",
  "screens.accounts": "Accounts",
  "nav.agents": "AI Agents",
  "nav.ads": "Advertising",
  "nav.tv": "Live TV",
  "miniApps.store.title": "Apps",
  "nav.arcade": "Arcade",
  "nav.converter": "Converter",
  "nav.migrate": "Migrate",
  "nav.glossary": "Glossary",
  "Compare Riftn": "Compare Riftn",
  "nav.guide": "Guide",
  "nav.connectAi": "Connect AI",
  "nav.bridge": "Bridge",
  "nav.docs": "Docs",
  "nav.blog": "Blog",
  "nav.premium": "Premium",
  "nav.pricing": "Pricing",
  "top100.title": "Top 100",
  "planned.title": "Planned",
  "liveStudio.title": "Live Studio",
  "launchpad.title": "Launchpad",
  "publicChat.title": "Public Chat",
  "buyCoins.title": "Buy Tokens",
};

/** English search words per row, keyed by labelKey. Mirrors the web table. */
export const NAV_KEYWORDS: Record<string, string[]> = {
  "nav.home": ['feed', 'timeline', 'latest', 'for you', 'following', 'posts', 'front page', 'news feed', 'start'],
  "nav.profile": ['my profile', 'my account', 'me', 'my page', 'my posts', 'my videos', 'avatar', 'bio', 'banner', 'followers', 'following', 'edit profile'],
  "nav.explore": ['search', 'discover', 'find', 'browse', 'look up', 'trending', 'popular', 'viral', 'hashtags', 'tags', 'people', 'users', 'creators', 'topics'],
  "nav.prompt": ['ai', 'generate', 'make', 'ai image', 'ai video', 'image generator', 'picture', 'text to image', 'art', 'ai art', 'imagine', 'create with ai', 'credits'],
  "nav.notifications": ['alerts', 'activity', 'mentions', 'replies', 'likes', 'bell', 'notifs', 'pings', 'updates', 'new followers', 'tips'],
  "nav.messages": ['dm', 'dms', 'direct messages', 'message', 'chat', 'chats', 'inbox', 'conversations', 'pm', 'private message', 'text', 'group chat', 'talk', 'contact'],
  "nav.communities": ['groups', 'group', 'community', 'rooms', 'servers', 'clubs', 'forums', 'tribes', 'members', 'channels', 'join a group'],
  "nav.assistant": ['ai', 'chatbot', 'bot', 'ask', 'help', 'copilot', 'agent', 'gpt', 'chatgpt', 'ai chat', 'questions', 'helper'],
  "nav.settings": ['preferences', 'account', 'privacy', 'security', 'password', 'language', 'theme', 'themes', 'appearance', 'dark mode', 'light mode', 'blocked', 'block', 'mute', 'two factor', '2fa', 'authenticator', 'notifications settings', 'email', 'phone', 'sessions', 'kids mode', 'font', 'data', 'delete account', 'deactivate', 'options', 'config', 'setup'],
  "creator.editor": ['edit', 'video editor', 'edit video', 'video editing', 'trim', 'cut', 'timeline', 'captions', 'subtitles', 'effects', 'clips', 'montage', 'export'],
  "commandCentre.creator": ['create', 'creator studio', 'studio', 'tools', 'ai tools', 'generate', 'image', 'video', 'audio', 'music', 'voiceover', 'thumbnail', 'design', '3d'],
  "nav.leaderboard": ['ranking', 'rankings', 'rank', 'top', 'top creators', 'top users', 'best', 'points', 'scores', 'high score', 'league'],
  "nav.stats": ['statistics', 'analytics', 'metrics', 'live stats', 'data', 'charts', 'numbers', 'price', 'supply', 'holders', 'volume', 'market', 'burn', 'treasury'],
  "nav.bookmarks": ['saved', 'saves', 'bookmark', 'favourites', 'favorites', 'watch later', 'read later', 'saved posts', 'library', 'collection'],
  "nav.command": ['command centre', 'command center', 'dashboard', 'creator studio', 'creator dashboard', 'analytics', 'earnings', 'revenue', 'income', 'payouts', 'insights', 'audience', 'growth', 'views', 'moderation', 'my stats'],
  "nav.wallet": ['balance', 'money', 'funds', 'cash', 'pay', 'payment', 'dhb', 'rift', 'tokens', 'coins', 'crypto', 'usdc', 'eth', 'bnb', 'deposit', 'withdraw', 'send', 'receive', 'transactions', 'top up', 'address', 'swap', 'seed phrase', 'recovery phrase', 'private key'],
  "nav.events": ['event', 'calendar', 'schedule', 'agenda', 'ama', 'meetup', 'meetups', 'upcoming', 'tickets', 'party', 'irl', 'town hall'],
  "nav.stages": ['audio', 'spaces', 'twitter spaces', 'clubhouse', 'live audio', 'audio rooms', 'voice chat', 'talk', 'voice', 'mic', 'speak', 'panel', 'podcast', 'rooms'],
  "nav.featureRequests": ['requests', 'request', 'build', 'builder', 'builders', 'building', 'top builders', 'bug', 'bugs', 'report a bug', 'bug report', 'issue', 'issues', 'broken', 'fix', 'fixes', 'feedback', 'suggestions', 'suggest', 'idea', 'ideas', 'request a feature', 'feature', 'prompt', 'prompts', 'shipped', 'queued', 'roadmap', 'changelog', 'improve', 'improvements', 'vote', 'upvote', 'wishlist', 'contribute'],
  "stats.feedback.title": ['feedback', 'experience', 'give feedback', 'testimonial', 'review', 'rate', 'rating', 'survey', 'opinion', 'complaint'],
  "nav.staking": ['stake', 'unstake', 'deposit', 'apy', 'apr', 'yield', 'interest', 'rewards', 'earn', 'passive income', 'profit share', 'vault', 'lock', 'pool', 'badge', 'badges', 'tier', 'tiers', 'holder'],
  "nav.superpowers": ['boost', 'boosts', 'second wind', 'promote', 'amplify', 'reach', 'top of feed', 'badge perks', 'perks', 'powers', 'abilities', 'unlock', 'upgrades'],
  "creatorPacks.title": ['emoji', 'emojis', 'stickers', 'sticker', 'gif', 'gifs', 'emoji packs', 'sticker packs', 'custom emoji', 'reactions'],
  "nav.governance": ['vote', 'voting', 'votes', 'proposals', 'proposal', 'propose', 'dao', 'poll', 'ballot', 'referendum', 'decide', 'community vote'],
  "nav.dao": ['treasury', 'donate', 'donation', 'contribute', 'contribution', 'fund', 'community fund', 'grants', 'pool', 'power'],
  "screens.work": ['bounty', 'work', 'jobs', 'job board', 'tasks', 'task', 'gigs', 'freelance', 'hire', 'hire someone', 'earn', 'earn money', 'make money', 'paid work', 'side hustle', 'escrow', 'contracts', 'usdc'],
  "work.myBounties": ['bounty history', 'my bounties', 'my work', 'my jobs', 'completed bounties', 'history', 'payouts', 'paid', 'my submissions', 'my posted bounties', 'transactions', 'escrow'],
  "nav.affiliate": ['referral', 'referrals', 'refer', 'invite', 'invite friends', 'referral link', 'ref link', 'promo code', 'commission', 'partner', 'ambassador', 'share link', 'earn'],
  "nav.careers": ['jobs', 'job', 'career', 'hiring', 'vacancies', 'work with us', 'work at riftn', 'join the team', 'team', 'apply', 'recruitment', 'roles', 'cv', 'resume'],
  "nav.creators": ['creator program', 'creator programme', 'creator fund', 'ambassadors', 'partners', 'apply as creator', 'monetise', 'monetize', 'influencer'],
  "nav.fractions": ['fraction', 'shares', 'ownership', 'own a post', 'co own', 'invest', 'stake in a post', 'tokenised', 'erc1155', 'sell fractions', 'buy fractions', 'holdings', 'portfolio', 'nft', 'nfts', 'nft market', 'nft marketplace', 'buy nft', 'sell nft', 'list nft', 'collectibles', 'opensea', 'make an offer', 'trade', 'erc721', 'art'],
  "nav.nfts": ['nft', 'nfts', 'nft market', 'nft marketplace', 'buy nft', 'sell nft', 'list nft', 'collectibles', 'opensea', 'make an offer', 'erc721', 'art', 'trade'],
  "screens.usernames": ['username', 'handle', 'handles', 'name', 'names', '@', 'change my name', 'rename', 'buy a name', 'sell my name', 'vanity', 'domain', 'ens'],
  "screens.accounts": ['account', 'accounts', 'buy account', 'sell account', 'sell my account', 'account marketplace', 'aged account', 'followers', 'buy followers', 'take over an account', 'transfer account', 'profile for sale'],
  "nav.agents": ['agents', 'ai agents', 'bots', 'automation', 'personas', 'autopilot'],
  "nav.ads": ['ads', 'ad', 'adverts', 'advertising', 'campaign', 'promote', 'boost post', 'sponsor', 'marketing', 'business'],
  "nav.tv": ['tv', 'television', 'streams', 'streaming', 'live', 'broadcast', 'channels', 'watch live', 'iptv', 'news channels', 'sports'],
  "miniApps.store.title": ['apps', 'app store', 'mini apps', 'miniapps', 'store', 'build an app', 'make an app', 'developer', 'developers', 'sdk', 'farcaster', 'frames', 'dapps', 'dapp', 'plugins', 'integrations', 'tools'],
  "nav.arcade": ['games', 'game', 'play', 'gaming', 'play to earn', 'p2e', 'arcade', 'fun', 'mini games', 'minigames', 'bored', "king's gambit", 'chess', 'claude of duty', 'fps', 'shooter', 'jungle trail', 'street slayer', 'beat em up', 'fighting', 'trenchstar', 'chartopia', 'trading floor'],
  "nav.converter": ['youtube', 'yt', 'yt-dlp', 'import youtube', 'import video', 'migrate', 'migrate all', 'download', 'convert', 'tiktok', 'instagram', 'reel', 'reels', 'twitter', 'x', 'facebook', 'twitch', 'clip', 'kick', 'rumble', 'vimeo', 'dailymotion', 'reddit', 'bluesky', 'odysee', 'streamable', 'loom', 'tumblr', 'pinterest', 'snapchat', 'vk', 'rutube', 'bilibili'],
  "nav.migrate": ['migrate all', 'import channel', 'youtube channel', 'bulk import', 'back catalogue', 'move channel', 'move my channel', 'youtube', 'yt'],
  "nav.glossary": ['terms', 'definitions', 'dictionary', 'jargon', 'meaning', 'what is', 'acronyms', 'abbreviations', 'words', 'explain'],
  "Compare Riftn": ['comparison', 'compare', 'vs', 'versus', 'alternative', 'alternatives', 'why riftn', 'difference', 'youtube', 'twitter', 'kick', 'twitch', 'facebook', 'instagram', 'tiktok', 'rumble', 'mastodon', 'bluesky', 'farcaster'],
  "nav.guide": ['getting started', 'start here', 'how to', 'how does it work', 'tutorial', 'onboarding', 'walkthrough', 'learn', 'help', 'faq', 'beginner', 'basics', 'manual', 'new here'],
  "nav.connectAi": ['mcp', 'chatgpt', 'claude', 'api', 'integration', 'connect ai', 'model context protocol'],
  "nav.bridge": ['cross chain', 'swap chain', 'transfer chain', 'move tokens', 'bnb', 'base', 'chains'],
  "nav.docs": ['documentation', 'help', 'api', 'whitepaper', 'developers', 'sdk', 'reference', 'brand', 'advertising', 'knowledge base', 'manual', 'tokenomics', 'faq', 'support'],
  "nav.blog": ['news', 'articles', 'updates', 'announcements', 'press', 'releases', 'release notes', "what's new", 'changelog', 'stories'],
  "nav.premium": ['premium', 'subscription', 'subscribe', 'upgrade', 'pro', 'membership', 'plans', 'no ads', 'ad free', 'background play', 'family plan'],
  "nav.pricing": ['pricing', 'plans', 'cost', 'price', 'credits', 'subscription', 'how much', 'fees'],
  "top100.title": ['top 100', 'cryptos', 'cryptocurrencies', 'coins', 'market cap', 'prices', 'tickers'],
  "planned.title": ['scheduled', 'schedule', 'scheduled posts', 'queue', 'later', 'upcoming posts', 'calendar'],
  "liveStudio.title": ['go live', 'stream', 'streaming', 'obs', 'stream key', 'overlays', 'alerts', 'widgets', 'subathon', 'multistream', 'restream'],
  "launchpad.title": ['launch', 'launch a token', 'create coin', 'make a coin', 'memecoin', 'meme coin', 'pump', 'bonding curve', 'tokenise', 'tokenize', 'presale'],
  "publicChat.title": ['chat', 'global chat', 'chat room', 'chatroom', 'lobby', 'trollbox', 'community chat', 'talk'],
  "buyCoins.title": ['buy tokens', 'buy dhb', 'buy rift', 'purchase', 'top up', 'card', 'fiat', 'on ramp', 'credit card', 'apple pay'],
};

/** labelKey to the id of its translated search words (nav.findWords.<id>). */
export const NAV_FIND_WORDS: Record<string, string> = {
  "nav.home": 'home',
  "nav.profile": 'profile',
  "nav.explore": 'explore',
  "nav.prompt": 'prompt',
  "nav.notifications": 'notifications',
  "nav.messages": 'messages',
  "nav.communities": 'communities',
  "nav.assistant": 'assistant',
  "nav.settings": 'settings',
  "creator.editor": 'editor',
  "commandCentre.creator": 'creator',
  "nav.leaderboard": 'leaderboard',
  "nav.stats": 'stats',
  "nav.bookmarks": 'bookmarks',
  "nav.command": 'command',
  "nav.wallet": 'wallet',
  "nav.events": 'events',
  "nav.stages": 'stages',
  "nav.featureRequests": 'featureRequests',
  "stats.feedback.title": 'feedback',
  "nav.staking": 'staking',
  "nav.superpowers": 'superpowers',
  "creatorPacks.title": 'packs',
  "nav.governance": 'governance',
  "nav.dao": 'dao',
  "screens.work": 'bounties',
  "work.myBounties": 'myBounties',
  "nav.affiliate": 'affiliate',
  "nav.careers": 'careers',
  "nav.creators": 'creators',
  "nav.fractions": 'fractions',
  "nav.nfts": 'fractions',
  "screens.usernames": 'usernames',
  "screens.accounts": 'accounts',
  "nav.agents": 'agents',
  "nav.ads": 'advertising',
  "nav.tv": 'liveTv',
  "miniApps.store.title": 'apps',
  "nav.arcade": 'arcade',
  "nav.converter": 'converter',
  "nav.migrate": 'migrate',
  "nav.glossary": 'glossary',
  "Compare Riftn": 'compare',
  "nav.guide": 'guide',
  "nav.connectAi": 'connectAi',
  "nav.bridge": 'bridge',
  "nav.docs": 'docs',
  "nav.blog": 'blog',
  "nav.premium": 'premium',
  "nav.pricing": 'pricing',
  "top100.title": 'top100',
  "planned.title": 'planned',
  "liveStudio.title": 'liveStudio',
  "launchpad.title": 'launchpad',
  "publicChat.title": 'publicChat',
  "buyCoins.title": 'buyTokens',
};

/** Commas in every script a translation came back in, plus semicolons. */
const WORD_LIST_SEPARATOR = /[,،、，;；؛]/;

function translatedFindWords(labelKey: string, t: TranslateFn): string[] {
  const id = NAV_FIND_WORDS[labelKey];
  if (!id) return [];
  const key = `nav.findWords.${id}`;
  const line = t(key, "");
  if (!line || line === key || !WORD_LIST_SEPARATOR.test(line)) return [];
  return line.split(WORD_LIST_SEPARATOR).map(foldOnce).filter(Boolean);
}

/** How well a row answers `tokens`; Infinity when it does not. */
export function scoreNavItem(labelKey: string, tokens: string[], t: TranslateFn): number {
  const englishName = NAV_ENGLISH_NAMES[labelKey] ?? labelKey;
  const translated = foldOnce(t(labelKey, englishName));
  const english = foldOnce(englishName);
  const labels = translated === english ? [english] : [translated, english];
  const keywords = (NAV_KEYWORDS[labelKey] ?? []).map(foldOnce);
  for (const word of translatedFindWords(labelKey, t)) {
    if (!keywords.includes(word)) keywords.push(word);
  }
  let worst = 0;
  for (const token of tokens) {
    let tier = scoreToken(labels, keywords, token);
    if (tier === NO_MATCH) {
      const stem = stemOf(token);
      if (stem !== token) tier = scoreToken(labels, keywords, stem) + 0.5;
    }
    if (tier === NO_MATCH) return NO_MATCH;
    if (tier > worst) worst = tier;
  }
  return worst;
}

/**
 * Filter and rank rows for `query`. Rows marked `searchOnly` join only once
 * two or more characters are typed, and lose every tie to a menu row. Ties
 * otherwise keep the menu's own order.
 */
export function filterNavRows<T extends { labelKey: string; searchOnly?: boolean }>(
  rows: readonly T[],
  query: string,
  t: TranslateFn,
): T[] {
  const folded = fold(query);
  const tokens = folded.split(" ").filter(Boolean);
  if (!tokens.length) return rows.filter((row) => !row.searchOnly);
  return rows
    .map((row, index) => ({ row, order: row.searchOnly ? 1000 + index : index }))
    .filter((entry) => folded.length >= 2 || !entry.row.searchOnly)
    .map((entry) => ({ ...entry, tier: scoreNavItem(entry.row.labelKey, tokens, t) }))
    .filter((entry) => entry.tier !== NO_MATCH)
    .sort((a, b) => a.tier - b.tier || a.order - b.order)
    .map((entry) => entry.row);
}
