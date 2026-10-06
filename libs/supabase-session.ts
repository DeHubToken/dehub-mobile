type KeyValueStore = { getItem: (key: string) => Promise<string | null> };

/**
 * The Supabase user the phone last held a session for, read straight from
 * storage.
 *
 * `supabase.auth.getSession()` answers the same question, but first refreshes
 * an expired access token over the network, and Supabase access tokens last an
 * hour. Boot asked it before lifting the splash, so most launches waited on a
 * token refresh to find out an id that was already on disk. A refresh never
 * changes who the user is, so the stored id is the same answer.
 */
export async function readStoredSessionUserId(
  storage: KeyValueStore,
  storageKey: string | undefined,
): Promise<string | null> {
  if (!storageKey) return null;
  try {
    const raw = await storage.getItem(storageKey);
    if (!raw) return null;
    const session = JSON.parse(raw);
    const id = session?.user?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}
