export type CommunityPostShare = { token_id: number; shared_by: string; created_at: string };

export function communityPostTarget(input: string): { tokenId?: string; newPostId?: string } | null {
  const direct = validCommunityPostId(input.trim());
  if (direct) return { tokenId:direct };
  try {
    const url = new URL(input.startsWith('/') ? input : /^https?:\/\//i.test(input) ? input : `https://${input}`, 'https://dehub.io');
    if (!['https:','http:'].includes(url.protocol) || !['dehub.io','www.dehub.io','legacy.dehub.io'].includes(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/(?:app\/)?(post|posts|video|newpost)\/(\d+)\/?$/);
    const id = validCommunityPostId(match?.[2]);
    return match && id ? match[1]==='newpost' ? {newPostId:id} : {tokenId:id} : null;
  } catch { return null; }
}

export function validCommunityPostId(value: unknown): string | null {
  const raw = String(value ?? '');
  const id = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}

/** Resolve originals in small batches; one deleted post must not hide the rest. */
export async function resolveCommunityPosts<T>(ids: string[], fetchPost: (id: string) => Promise<T>): Promise<T[]> {
  const posts: T[] = [];
  for (let start = 0; start < ids.length; start += 4) {
    const batch = await Promise.all(ids.slice(start, start + 4).map(id => fetchPost(id).catch(() => null)));
    for (const post of batch) if (post !== null) posts.push(post);
  }
  return posts;
}

export function uniqueCommunityPosts<T>(posts: T[], idOf: (post: T) => string): T[] {
  const seen = new Set<string>();
  return posts.filter(post => {
    const id = idOf(post);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
