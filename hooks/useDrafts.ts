/**
 * useDrafts
 *
 * Hook for persisting post drafts, to AsyncStorage on the device and to the
 * post_drafts table so they follow the account onto another device or survive
 * a reinstall.
 *
 * AsyncStorage stays the primary read: it is instant, it works offline, and it
 * is the only place the media lives. Every Supabase call here fails soft — a
 * signed-out or offline user gets exactly the behaviour this hook had before
 * the table existed, which is why none of them surface an error to the caller.
 *
 * Media URIs are deliberately NOT synced. They are device-local file paths, so
 * a URI written on a phone resolves to nothing on the web client or on a second
 * device; sending them would only produce drafts with broken attachments. What
 * travels is the text, description, categories and monetisation settings, and a
 * draft restored from the server comes back with its media fields empty. On the
 * device that created it the local copy still has everything, because the local
 * copy is never replaced by the remote one.
 *
 * Media URIs may also become stale if the underlying files are cleaned up by
 * the OS, but text, categories, and monetisation settings will always survive.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../services/supabase";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";


export interface Draft {
  id: string;
  bodyText: string;
  description: string;
  /**
   * Post title, present since the composer gained a separate title field.
   * Older drafts don't have it — for those, a video draft's title lives in
   * `bodyText` and its body in `description` (the pre-split field mapping).
   */
  titleText?: string;
  categories: string[];
  imageUris: string[];
  videoUri: string | null;
  thumbnailUri: string | null;
  coverUri: string | null;
  monetization: MonetizationState;
  createdAt: number; // epoch ms
  /** Row id in post_drafts, once this draft has reached the server. */
  remoteId?: string;
}


const STORAGE_PREFIX = "@dhb_drafts";

function draftsKey(address?: string): string {
  if (address) return `${STORAGE_PREFIX}:${address.toLowerCase()}`;
  return STORAGE_PREFIX;
}


const generateId = (): string =>
  `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const readDrafts = async (address?: string): Promise<Draft[]> => {
  try {
    const raw = await AsyncStorage.getItem(draftsKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeDrafts = async (drafts: Draft[], address?: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(draftsKey(address), JSON.stringify(drafts));
  } catch (e) {
    console.error("[useDrafts] write error:", e);
  }
};


/** A server row rebuilt as a Draft. Media comes back empty — see the note above. */
const fromRow = (row: any): Draft => ({
  id: `remote_${row.id}`,
  bodyText: row.text ?? "",
  description: row.description ?? "",
  titleText: row.metadata?.titleText,
  categories: row.metadata?.categories ?? (row.selected_category ? [row.selected_category] : []),
  imageUris: [],
  videoUri: null,
  thumbnailUri: null,
  coverUri: null,
  monetization: row.metadata?.monetization,
  createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  remoteId: row.id,
});

/**
 * Pull the account's drafts from the server and fold in the ones this device
 * has not seen. Local copies win on conflict: they are the same draft plus the
 * media, so replacing one with its server twin would silently drop attachments.
 */
const mergeRemote = async (local: Draft[], address?: string): Promise<Draft[]> => {
  if (!address) return local;
  try {
    const { data, error } = await supabase
      .from("post_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return local;

    const known = new Set(local.map((d) => d.remoteId).filter(Boolean));
    const extra = data.filter((row: any) => !known.has(row.id)).map(fromRow);
    if (extra.length === 0) return local;

    return [...local, ...extra].sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return local;
  }
};

/** Push a draft to the server, returning its row id. Null when it could not be stored. */
const pushRemote = async (draft: Draft, address?: string): Promise<string | null> => {
  // wallet_address is NOT NULL on the table, so without an address there is
  // nothing valid to write; the draft simply stays on the device.
  if (!address) return null;
  try {
    const { data, error } = await supabase
      .from("post_drafts")
      .insert({
        wallet_address: address.toLowerCase(),
        text: draft.bodyText,
        description: draft.description,
        selected_category: draft.categories[0] ?? "",
        has_image: draft.imageUris.length > 0,
        has_video: Boolean(draft.videoUri),
        metadata: {
          categories: draft.categories,
          monetization: draft.monetization,
          titleText: draft.titleText ?? "",
          source: "mobile",
        },
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
};

const removeRemote = async (remoteId?: string): Promise<void> => {
  if (!remoteId) return;
  try {
    await supabase.from("post_drafts").delete().eq("id", remoteId);
  } catch {
    // Offline deletes stay local. The row reappears on the next merge, which is
    // the safe direction to fail: a draft that will not die beats one that
    // vanishes from a device the user never deleted it on.
  }
};


export function useDrafts(address?: string) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  // Load drafts on mount or when address changes. Local first so the list
  // paints immediately, then the server pass folds in anything new.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await readDrafts(address);
      if (mounted) {
        setDrafts(data);
        setLoading(false);
      }
      const merged = await mergeRemote(data, address);
      if (mounted && merged.length !== data.length) {
        setDrafts(merged);
        await writeDrafts(merged, address);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address]);

  /** Reload drafts from storage and the server (useful after navigating back) */
  const reload = useCallback(async () => {
    const data = await readDrafts(address);
    const merged = await mergeRemote(data, address);
    setDrafts(merged);
    if (merged.length !== data.length) await writeDrafts(merged, address);
  }, [address]);

  /** Save a new draft and return its id */
  const saveDraft = useCallback(
    async (draft: Omit<Draft, "id" | "createdAt">): Promise<string> => {
      const id = generateId();
      const entry: Draft = { ...draft, id, createdAt: Date.now() };
      const updated = [entry, ...drafts];
      setDrafts(updated);
      await writeDrafts(updated, address);

      // The draft is already saved locally by this point, so the server write
      // is allowed to be slow or to fail without the caller waiting on it.
      const remoteId = await pushRemote(entry, address);
      if (remoteId) {
        const withRemote = updated.map((d) => (d.id === id ? { ...d, remoteId } : d));
        setDrafts(withRemote);
        await writeDrafts(withRemote, address);
      }
      return id;
    },
    [drafts, address],
  );

  /** Delete a draft by id */
  const deleteDraft = useCallback(
    async (id: string): Promise<void> => {
      const target = drafts.find((d) => d.id === id);
      const updated = drafts.filter((d) => d.id !== id);
      setDrafts(updated);
      await writeDrafts(updated, address);
      await removeRemote(target?.remoteId);
    },
    [drafts, address],
  );

  /** Delete all drafts */
  const clearAllDrafts = useCallback(async (): Promise<void> => {
    const remoteIds = drafts.map((d) => d.remoteId).filter(Boolean) as string[];
    setDrafts([]);
    await writeDrafts([], address);
    await Promise.all(remoteIds.map((rid) => removeRemote(rid)));
  }, [drafts, address]);

  return {
    drafts,
    loading,
    reload,
    saveDraft,
    deleteDraft,
    clearAllDrafts,
  };
}
