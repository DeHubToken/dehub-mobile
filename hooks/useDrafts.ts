/**
 * useDrafts
 *
 * Hook for persisting post drafts to AsyncStorage.
 * Media URIs may become stale if the underlying files are cleaned up by the OS,
 * but text, categories, and monetisation settings will always survive.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";


export interface Draft {
  id: string;
  bodyText: string;
  description: string;
  categories: string[];
  imageUris: string[];
  videoUri: string | null;
  thumbnailUri: string | null;
  coverUri: string | null;
  monetization: MonetizationState;
  createdAt: number; // epoch ms
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


export function useDrafts(address?: string) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);

  // Load drafts on mount or when address changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await readDrafts(address);
      if (mounted) {
        setDrafts(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address]);

  /** Reload drafts from storage (useful after navigating back) */
  const reload = useCallback(async () => {
    const data = await readDrafts(address);
    setDrafts(data);
  }, [address]);

  /** Save a new draft and return its id */
  const saveDraft = useCallback(
    async (draft: Omit<Draft, "id" | "createdAt">): Promise<string> => {
      const id = generateId();
      const entry: Draft = { ...draft, id, createdAt: Date.now() };
      const updated = [entry, ...drafts];
      setDrafts(updated);
      await writeDrafts(updated, address);
      return id;
    },
    [drafts, address],
  );

  /** Delete a draft by id */
  const deleteDraft = useCallback(
    async (id: string): Promise<void> => {
      const updated = drafts.filter((d) => d.id !== id);
      setDrafts(updated);
      await writeDrafts(updated, address);
    },
    [drafts, address],
  );

  /** Delete all drafts */
  const clearAllDrafts = useCallback(async (): Promise<void> => {
    setDrafts([]);
    await writeDrafts([], address);
  }, [address]);

  return {
    drafts,
    loading,
    reload,
    saveDraft,
    deleteDraft,
    clearAllDrafts,
  };
}
